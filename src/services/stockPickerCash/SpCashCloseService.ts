// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  assertMakerNotChecker,
  db,
  emitCash,
  moneyStr,
  parseDateOnly,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

function presentClose(row: any) {
  return {
    id: row.id,
    legalEntityId: row.legalEntityId,
    periodCode: row.periodCode,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    status: row.status,
    closeVersion: row.closeVersion,
    controlTotals: row.controlTotalsJson,
    blockers: row.blockersJson || [],
    makerId: row.makerId,
    checkerId: row.checkerId,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function presentExport(row: any) {
  return {
    id: row.id,
    periodCloseId: row.periodCloseId,
    legalEntityId: row.legalEntityId,
    status: row.status,
    controlTotals: row.controlTotalsJson,
    externalPostingRef: row.externalPostingRef,
    attemptCount: row.attemptCount,
    idempotencyKey: row.idempotencyKey,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SpCashCloseService {
  /** Itemized blockers — never sole CLOSE_FAILED (AT-12). */
  static async precheck(period: string, body: any = {}) {
    const legalEntityId = requireStr(body.legalEntityId, "legalEntityId");
    const periodCode = String(period || body.periodCode || "").trim();
    if (!periodCode) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "period is required", 400);
    }

    const periodFrom =
      parseDateOnly(body.periodFrom) ||
      parseDateOnly(`${periodCode}-01`) ||
      new Date();
    let periodTo = parseDateOnly(body.periodTo);
    if (!periodTo) {
      periodTo = new Date(periodFrom);
      periodTo.setUTCMonth(periodTo.getUTCMonth() + 1);
      periodTo.setUTCDate(0);
    }

    const blockers: any[] = [];

    const accounts = await db.spCashClientAccount.findMany({
      where: { legalEntityId, status: "ACTIVE" },
    });

    for (const acct of accounts) {
      const stmt = await db.spCashExternalStatement.findFirst({
        where: {
          cashAccountId: acct.id,
          periodFrom: { lte: periodTo },
          periodTo: { gte: periodFrom },
        },
      });
      if (!stmt) {
        blockers.push({
          code: "MISSING_STATEMENT",
          severity: "BLOCKING",
          cashAccountId: acct.id,
          value: null,
          owner: "CashOperations",
          remediation: `Import and commit statement for account ${acct.maskedIdentifier || acct.id}`,
          remediationLink: `/api/investment-ops/external-statements/imports`,
        });
      }
    }

    const openBreaks = await db.spCashReconciliationBreak.findMany({
      where: { status: { in: ["OPEN", "UNRECONCILED"] } },
      take: 100,
    });
    for (const b of openBreaks) {
      blockers.push({
        code: "OPEN_VARIANCE",
        severity: "BLOCKING",
        breakId: b.id,
        value: b.amount != null ? moneyStr(b.amount) : null,
        currency: b.currency,
        owner: "CashOperations",
        remediation: "Resolve or accept break before close",
        remediationLink: `/api/investment-ops/reconciliation-breaks/${b.id}`,
      });
    }

    const pendingJournals = await db.spCashJournal.count({
      where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
    });
    if (pendingJournals > 0) {
      blockers.push({
        code: "INCOMPLETE_APPROVALS",
        severity: "BLOCKING",
        value: String(pendingJournals),
        owner: "Finance",
        remediation: "Approve or reject pending cash journals",
        remediationLink: `/api/investment-ops/cash-ledger`,
      });
    }

    const pendingExceptions = await db.spCashReconciliationException.count({
      where: { status: { in: ["OPEN", "ASSIGNED", "INVESTIGATING", "PENDING_APPROVAL"] } },
    });
    if (pendingExceptions > 0) {
      blockers.push({
        code: "OPEN_EXCEPTIONS",
        severity: "BLOCKING",
        value: String(pendingExceptions),
        owner: "CashOperations",
        remediation: "Close or approve open exceptions",
        remediationLink: `/api/investment-ops/reconciliation-exceptions`,
      });
    }

    // Suspense age
    const suspenseAccounts = accounts.filter(
      (a: any) => String(a.accountType).toUpperCase() === "SUSPENSE"
    );
    for (const s of suspenseAccounts) {
      const oldLine = await db.spCashJournalLine.findFirst({
        where: {
          cashAccountId: s.id,
          journal: { status: "POSTED", valueDate: { lt: new Date(Date.now() - 30 * 86400000) } },
        },
      });
      if (oldLine) {
        blockers.push({
          code: "SUSPENSE_AGE",
          severity: "WARNING",
          cashAccountId: s.id,
          value: moneyStr(oldLine.signedCashAmount),
          owner: "CashOperations",
          remediation: "Clear aged suspense balances",
          remediationLink: `/api/investment-ops/client-cash-accounts/${s.id}`,
        });
      }
    }

    const canClose = !blockers.some((b) => b.severity === "BLOCKING");

    return {
      legalEntityId,
      periodCode,
      periodFrom,
      periodTo,
      canClose,
      blockerCount: blockers.length,
      blockers,
    };
  }

  static async close(period: string, body: any, actorId: string) {
    const pre = await this.precheck(period, body);
    if (!pre.canClose) {
      throw new InvestmentOpsError(
        "CLOSE_BLOCKED",
        "Period close blocked by itemized control failures",
        409,
        { blockers: pre.blockers }
      );
    }

    const latest = await db.spCashPeriodClose.findFirst({
      where: { legalEntityId: pre.legalEntityId, periodCode: pre.periodCode },
      orderBy: { closeVersion: "desc" },
    });
    const closeVersion = (latest?.closeVersion || 0) + 1;

    if (latest?.makerId) assertMakerNotChecker(latest.makerId, actorId);

    const created = await db.spCashPeriodClose.create({
      data: {
        legalEntityId: pre.legalEntityId,
        periodCode: pre.periodCode,
        periodFrom: pre.periodFrom,
        periodTo: pre.periodTo,
        status: "CLOSED",
        closeVersion,
        controlTotalsJson: body.controlTotals || { blockerCount: 0 },
        blockersJson: pre.blockers,
        makerId: body.makerId || actorId,
        checkerId: actorId,
        closedAt: new Date(),
      },
    });

    await emitCash({
      eventType: "cash.period.closed",
      aggregateType: "SpCashPeriodClose",
      aggregateId: created.id,
      aggregateVersion: closeVersion,
      actorId,
      payload: {
        legalEntityId: pre.legalEntityId,
        periodCode: pre.periodCode,
        closeVersion,
      },
      legalEntityId: pre.legalEntityId,
    });
    return presentClose(created);
  }

  static async reopenRequest(period: string, body: any, actorId: string) {
    const legalEntityId = requireStr(body.legalEntityId, "legalEntityId");
    const row = await db.spCashPeriodClose.findFirst({
      where: { legalEntityId, periodCode: String(period), status: "CLOSED" },
      orderBy: { closeVersion: "desc" },
    });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Closed period not found", 404);

    const updated = await db.spCashPeriodClose.update({
      where: { id: row.id },
      data: { status: "REOPEN_REQUESTED" },
    });
    await emitCash({
      eventType: "cash.period.reopen_requested",
      aggregateType: "SpCashPeriodClose",
      aggregateId: updated.id,
      aggregateVersion: updated.closeVersion,
      actorId,
      reason: body?.reason || null,
    });
    return presentClose(updated);
  }

  static async restate(period: string, body: any, actorId: string) {
    const legalEntityId = requireStr(body.legalEntityId, "legalEntityId");
    const prior = await db.spCashPeriodClose.findFirst({
      where: { legalEntityId, periodCode: String(period) },
      orderBy: { closeVersion: "desc" },
    });
    if (!prior) throw new InvestmentOpsError("NOT_FOUND", "Period close not found", 404);

    // Restate creates new close version; does not silently rewrite prior (AT-13)
    const created = await db.spCashPeriodClose.create({
      data: {
        legalEntityId,
        periodCode: String(period),
        periodFrom: prior.periodFrom,
        periodTo: prior.periodTo,
        status: "RESTATED",
        closeVersion: prior.closeVersion + 1,
        controlTotalsJson: body.controlTotals || prior.controlTotalsJson,
        blockersJson: [],
        makerId: actorId,
        checkerId: body.checkerId || null,
        closedAt: new Date(),
      },
    });
    await emitCash({
      eventType: "cash.period.restated",
      aggregateType: "SpCashPeriodClose",
      aggregateId: created.id,
      aggregateVersion: created.closeVersion,
      actorId,
      payload: { priorCloseId: prior.id, priorVersion: prior.closeVersion },
    });
    return presentClose(created);
  }

  static async createGlExport(body: any, actorId: string, idempotencyKey?: string) {
    const key = idempotencyKey || body.idempotencyKey;
    const legalEntityId = requireStr(body.legalEntityId, "legalEntityId");

    return withIdempotency(
      "sp-cash:gl-export:create",
      key,
      body,
      async () => {
        // AT-14: no double post — reuse successful export with same key / external ref
        if (key) {
          const existing = await db.spCashGlExport.findUnique({
            where: { idempotencyKey: key },
          });
          if (existing) {
            if (existing.externalPostingRef && existing.status === "POSTED") {
              return presentExport(existing);
            }
          }
        }

        const created = await db.spCashGlExport.create({
          data: {
            periodCloseId: body.periodCloseId || null,
            legalEntityId,
            status: "PENDING",
            controlTotalsJson: body.controlTotals || null,
            idempotencyKey: key || `gl-${legalEntityId}-${Date.now()}`,
            attemptCount: 1,
          },
        });

        // Simulate async post success (idempotent)
        const posted = await db.spCashGlExport.update({
          where: { id: created.id },
          data: {
            status: "POSTED",
            externalPostingRef: `GL-${created.id}`,
          },
        });
        await emitCash({
          eventType: "cash.gl.exported",
          aggregateType: "SpCashGlExport",
          aggregateId: posted.id,
          aggregateVersion: 1,
          actorId,
          payload: { externalPostingRef: posted.externalPostingRef },
        });
        return presentExport(posted);
      },
      201
    );
  }

  static async getGlExport(id: string) {
    const row = await db.spCashGlExport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "GL export not found", 404);
    return presentExport(row);
  }

  static async retryGlExport(id: string, body: any, actorId: string) {
    const row = await db.spCashGlExport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "GL export not found", 404);

    // AT-14: if already posted with external ref, do not double-post
    if (row.externalPostingRef && row.status === "POSTED") {
      return presentExport(row);
    }

    const updated = await db.spCashGlExport.update({
      where: { id },
      data: {
        attemptCount: { increment: 1 },
        status: "POSTED",
        externalPostingRef: row.externalPostingRef || `GL-${row.id}-r${row.attemptCount + 1}`,
        lastError: null,
      },
    });
    await emitCash({
      eventType: "cash.gl.export_retried",
      aggregateType: "SpCashGlExport",
      aggregateId: updated.id,
      aggregateVersion: updated.attemptCount,
      actorId,
      payload: { externalPostingRef: updated.externalPostingRef },
    });
    return presentExport(updated);
  }
}
