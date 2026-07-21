// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { SpCashJournalService } from "./SpCashJournalService";
import {
  assertMakerNotChecker,
  assertVersion,
  db,
  emitCash,
  loadCashAccountLabelMap,
  loadUserDisplayMap,
  moneyStr,
  paginated,
  parsePagination,
  presentCashAccountLabels,
  requireStr,
} from "./spCashSupport";

const OPEN_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "INVESTIGATING",
  "PENDING_APPROVAL",
  "INFO_REQUESTED",
];

async function appendTimeline(
  exceptionId: string,
  eventType: string,
  actorId: string,
  notes?: string,
  payload?: any,
  tx?: any
) {
  const client = tx || db;
  return client.spCashExceptionTimeline.create({
    data: {
      exceptionId,
      eventType,
      actorId,
      notes: notes || null,
      payloadJson: payload || null,
    },
  });
}

function presentException(
  row: any,
  accountLabels?: ReturnType<typeof presentCashAccountLabels> | null,
  userMap?: Record<string, { name: string | null; email: string | null }>
) {
  const instrument = row.instrumentJson || null;
  const overdue =
    Boolean(row.slaDueAt) &&
    new Date(row.slaDueAt).getTime() < Date.now() &&
    !["CLOSED", "REJECTED", "APPROVED"].includes(String(row.status || "").toUpperCase());
  const labels = accountLabels || presentCashAccountLabels(null);
  const assigned = row.assignedToId ? userMap?.[row.assignedToId] : null;
  const approver = row.approverId ? userMap?.[row.approverId] : null;
  const amountDifference =
    row.amountTxn != null
      ? moneyStr(row.amountTxn)
      : row.amountReporting != null
        ? moneyStr(row.amountReporting)
        : null;
  return {
    exceptionId: row.id,
    id: row.id,
    batchId: row.batchId,
    cashAccountId: row.cashAccountId,
    accountNumber: labels.accountNumber,
    accountNumberMasked: labels.accountNumberMasked,
    cashAccountLabel: labels.cashAccountLabel,
    clientName: labels.clientName,
    clientOrVehicleId: row.clientOrVehicleId,
    category: row.category,
    severity: row.severity,
    status: row.status,
    overdue,
    amountTxn: row.amountTxn != null ? moneyStr(row.amountTxn) : null,
    amountDifference,
    currencyTxn: row.currencyTxn,
    amountReporting: row.amountReporting != null ? moneyStr(row.amountReporting) : null,
    currencyReporting: row.currencyReporting,
    difference:
      row.amountTxn != null
        ? {
            transaction: {
              amount: moneyStr(row.amountTxn),
              currency: row.currencyTxn,
            },
            reporting:
              row.amountReporting != null
                ? {
                    amount: moneyStr(row.amountReporting),
                    currency: row.currencyReporting,
                  }
                : null,
          }
        : null,
    assignedToId: row.assignedToId,
    assignedTo: row.assignedToId
      ? { userId: row.assignedToId, name: assigned?.name || null, email: assigned?.email || null }
      : null,
    assignedToName: assigned?.name || null,
    approverId: row.approverId,
    approver: row.approverId
      ? { userId: row.approverId, name: approver?.name || null, email: approver?.email || null }
      : null,
    approverName: approver?.name || null,
    ownerRole: row.ownerRole,
    slaDueAt: row.slaDueAt,
    resolutionJson: row.resolutionJson,
    ageDays: row.ageDays,
    instrument,
    tradeDate: row.tradeDate,
    settleDate: row.settleDate,
    source: row.source,
    counterparty: row.counterparty,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function enrichExceptions(rows: any[]) {
  const accountIds = rows.map((r) => r.cashAccountId).filter(Boolean);
  const userIds = rows.flatMap((r) => [r.assignedToId, r.approverId]).filter(Boolean);
  const [accountMap, userMap] = await Promise.all([
    loadCashAccountLabelMap(accountIds),
    loadUserDisplayMap(userIds),
  ]);
  return rows.map((r) =>
    presentException(r, r.cashAccountId ? accountMap[r.cashAccountId] : null, userMap)
  );
}

export class SpCashExceptionService {
  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.status) where.status = String(query.status);
    if (query.severity) where.severity = String(query.severity);
    if (query.category) where.category = String(query.category);
    if (query.cashAccountId) where.cashAccountId = String(query.cashAccountId);
    if (query.assignedToId) where.assignedToId = String(query.assignedToId);
    if (query.clientOrVehicleId) where.clientOrVehicleId = String(query.clientOrVehicleId);

    const [items, total] = await Promise.all([
      db.spCashReconciliationException.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      db.spCashReconciliationException.count({ where }),
    ]);
    return paginated(await enrichExceptions(items), total, page, pageSize);
  }

  static async get(id: string) {
    const row = await db.spCashReconciliationException.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Exception not found", 404);
    const [presented] = await enrichExceptions([row]);
    return presented;
  }

  static async summary(query: any = {}) {
    const whereBase: any = {};
    if (query.from || query.to) {
      whereBase.createdAt = {};
      if (query.from) whereBase.createdAt.gte = new Date(String(query.from));
      if (query.to) whereBase.createdAt.lte = new Date(String(query.to));
    }

    const critical = await db.spCashReconciliationException.findMany({
      where: { ...whereBase, severity: "CRITICAL", status: { in: OPEN_STATUSES } },
    });
    const overdue = await db.spCashReconciliationException.findMany({
      where: {
        ...whereBase,
        status: "PENDING_APPROVAL",
        slaDueAt: { lt: new Date() },
      },
    });
    const pendingAdj = await db.spCashReconciliationException.findMany({
      where: {
        ...whereBase,
        status: { in: ["PENDING_APPROVAL", "INVESTIGATING"] },
        category: { in: ["AMOUNT", "UNMATCHED_TRADE", "ADJUSTMENT"] },
      },
    });

    const sumAmt = (rows: any[]) =>
      rows.reduce((s, r) => s + Number(r.amountReporting ?? r.amountTxn ?? 0), 0);

    const confirmed = await db.spCashMatchLink.count({
      where: { status: "CONFIRMED", method: "AUTO" },
    });
    const allLinks = await db.spCashMatchLink.count();
    const stmRate = allLinks ? Math.round((confirmed / allLinks) * 10000) / 100 : 100;

    return {
      from: query.from || null,
      to: query.to || null,
      criticalExceptions: {
        count: critical.length,
        valueUsd: sumAmt(critical).toFixed(2),
        trendPct: null,
      },
      overdueApprovals: {
        count: overdue.length,
        valueUsd: sumAmt(overdue).toFixed(2),
        trendPct: null,
      },
      pendingAdjustments: {
        count: pendingAdj.length,
        valueUsd: sumAmt(pendingAdj).toFixed(2),
        trendPct: null,
      },
      straightThroughMatchRate: { pct: stmRate, trendPp: null },
      // FE aliases
      criticalAmount: sumAmt(critical).toFixed(2),
      overdue: overdue.length,
      overdueAmount: sumAmt(overdue).toFixed(2),
      pendingAmount: sumAmt(pendingAdj).toFixed(2),
      stpRate: stmRate,
      matchRate: stmRate,
      trendVsPrior7d: { matchRatePp: null },
      bySeverity: {
        CRITICAL: critical.length,
        HIGH: await db.spCashReconciliationException.count({
          where: { ...whereBase, severity: "HIGH", status: { in: OPEN_STATUSES } },
        }),
        MEDIUM: await db.spCashReconciliationException.count({
          where: { ...whereBase, severity: "MEDIUM", status: { in: OPEN_STATUSES } },
        }),
        LOW: await db.spCashReconciliationException.count({
          where: { ...whereBase, severity: "LOW", status: { in: OPEN_STATUSES } },
        }),
      },
    };
  }

  static async timeline(id: string) {
    await this.get(id);
    const items = await db.spCashExceptionTimeline.findMany({
      where: { exceptionId: id },
      orderBy: { createdAt: "asc" },
    });
    return { exceptionId: id, items };
  }

  static async listComments(id: string) {
    await this.get(id);
    const rows = await db.spCashExceptionTimeline.findMany({
      where: { exceptionId: id, eventType: "COMMENT" },
      orderBy: { createdAt: "asc" },
    });
    const authorIds = [...new Set(rows.map((r: any) => r.actorId).filter(Boolean))];
    const users = authorIds.length
      ? await db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const nameById = Object.fromEntries(
      users.map((u: any) => [
        u.id,
        `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u.id,
      ])
    );
    return {
      exceptionId: id,
      items: rows.map((r: any) => ({
        id: r.id,
        body: r.notes,
        createdAt: r.createdAt,
        authorId: r.actorId,
        authorName: r.actorId ? nameById[r.actorId] || null : null,
      })),
    };
  }

  static async addComment(id: string, body: any, actorId: string) {
    await this.get(id);
    const text = requireStr(body.body || body.comment || body.notes, "body");
    const row = await appendTimeline(id, "COMMENT", actorId, text, {
      kind: "COMMENT",
    });
    await emitCash({
      eventType: "cash.exception.commented",
      aggregateType: "SpCashReconciliationException",
      aggregateId: id,
      aggregateVersion: 1,
      actorId,
      payload: { commentId: row.id },
    });
    const user = await db.user.findUnique({
      where: { id: actorId },
      select: { firstName: true, lastName: true, email: true },
    });
    const authorName = user
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
      : null;
    return {
      id: row.id,
      body: text,
      createdAt: row.createdAt,
      authorId: actorId,
      authorName,
    };
  }

  static async listAttachments(id: string) {
    await this.get(id);
    const rows = await db.spCashExceptionTimeline.findMany({
      where: { exceptionId: id, eventType: "ATTACHMENT" },
      orderBy: { createdAt: "asc" },
    });
    return {
      exceptionId: id,
      items: rows.map((r: any) => {
        const payload = r.payloadJson || {};
        return {
          id: r.id,
          fileId: payload.fileId || null,
          fileName: payload.fileName || null,
          contentType: payload.contentType || null,
          note: r.notes,
          createdAt: r.createdAt,
          authorId: r.actorId,
        };
      }),
    };
  }

  static async addAttachment(id: string, body: any, actorId: string) {
    await this.get(id);
    const fileId = requireStr(body.fileId, "fileId");
    const row = await appendTimeline(id, "ATTACHMENT", actorId, body.note || body.notes || null, {
      kind: "ATTACHMENT",
      fileId,
      fileName: body.fileName || null,
      contentType: body.contentType || null,
    });
    await emitCash({
      eventType: "cash.exception.attachment_added",
      aggregateType: "SpCashReconciliationException",
      aggregateId: id,
      aggregateVersion: 1,
      actorId,
      payload: { attachmentId: row.id, fileId },
    });
    return {
      id: row.id,
      fileId,
      fileName: body.fileName || null,
      contentType: body.contentType || null,
      note: body.note || body.notes || null,
      createdAt: row.createdAt,
      authorId: actorId,
    };
  }

  static async audit(id: string) {
    await this.get(id);
    const [timeline, cashAudit] = await Promise.all([
      db.spCashExceptionTimeline.findMany({
        where: { exceptionId: id },
        orderBy: { createdAt: "asc" },
      }),
      db.spCashAuditEvent
        ? db.spCashAuditEvent.findMany({
            where: { objectType: "SpCashReconciliationException", objectId: id },
            orderBy: { createdAt: "asc" },
            take: 200,
          })
        : Promise.resolve([]),
    ]);
    const items = [
      ...timeline.map((t: any) => ({
        id: t.id,
        source: "TIMELINE",
        eventType: t.eventType,
        actorId: t.actorId,
        notes: t.notes,
        payload: t.payloadJson,
        createdAt: t.createdAt,
      })),
      ...cashAudit.map((a: any) => ({
        id: a.id,
        source: "AUDIT",
        eventType: a.eventType || "AUDIT",
        actorId: a.actorId,
        notes: a.reason || null,
        payload: { outcome: a.outcome, afterHash: a.afterHash, beforeHash: a.beforeHash },
        createdAt: a.createdAt,
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return { exceptionId: id, items };
  }

  static async transition(
    id: string,
    toStatus: string,
    eventType: string,
    body: any,
    actorId: string,
    extra: Record<string, any> = {}
  ) {
    const row = await db.spCashReconciliationException.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Exception not found", 404);
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashReconciliationException.update({
      where: { id },
      data: {
        status: toStatus,
        version: { increment: 1 },
        ...extra,
      },
    });
    await appendTimeline(id, eventType, actorId, body?.notes, {
      from: row.status,
      to: toStatus,
      ...body,
    });
    await emitCash({
      eventType: "cash.exception.changed",
      aggregateType: "SpCashReconciliationException",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
      payload: {
        category: updated.category,
        severity: updated.severity,
        status: toStatus,
        amount: updated.amountTxn,
      },
    });
    return (await enrichExceptions([updated]))[0];
  }

  static assign(id: string, body: any, actorId: string) {
    return this.transition(id, "ASSIGNED", "ASSIGNED", body, actorId, {
      assignedToId: requireStr(body.assigneeId || body.assignedToId, "assignedToId"),
      ownerRole: body.ownerRole || null,
    });
  }

  static investigate(id: string, body: any, actorId: string) {
    return this.transition(id, "INVESTIGATING", "INVESTIGATING", body, actorId);
  }

  static propose(id: string, body: any, actorId: string) {
    return this.transition(id, "PENDING_APPROVAL", "PROPOSE_RESOLUTION", body, actorId, {
      resolutionJson: body.resolution || body.resolutionJson || body,
    });
  }

  static async approve(id: string, body: any, actorId: string, actorUser?: any) {
    const row = await db.spCashReconciliationException.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Exception not found", 404);
    if (row.assignedToId) assertMakerNotChecker(row.assignedToId, actorId, actorUser);
    return this.transition(id, "APPROVED", "APPROVED", body, actorId, {
      approverId: actorId,
      resolutionJson: {
        ...(row.resolutionJson || {}),
        action: body?.action || "APPROVE",
        adjustmentJournalDraftId: body?.adjustmentJournalDraftId || null,
        notes: body?.notes || null,
      },
    });
  }

  static requestInfo(id: string, body: any, actorId: string) {
    return this.transition(id, "INFO_REQUESTED", "REQUEST_INFO", body, actorId);
  }

  static async reject(id: string, body: any, actorId: string, actorUser?: any) {
    const row = await db.spCashReconciliationException.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Exception not found", 404);
    if (row.assignedToId) assertMakerNotChecker(row.assignedToId, actorId, actorUser);
    return this.transition(id, "REJECTED", "REJECTED", body, actorId, {
      approverId: actorId,
    });
  }

  static close(id: string, body: any, actorId: string) {
    return this.transition(id, "CLOSED", "CLOSED", body, actorId);
  }

  static reopen(id: string, body: any, actorId: string) {
    return this.transition(id, "OPEN", "REOPENED", body, actorId);
  }

  // —— Break actions ——
  static async getBreak(breakId: string) {
    const row = await this.resolveBreakRow(breakId);
    const comments = await db.spCashBreakComment.findMany({
      where: { breakId: row.id },
      orderBy: { createdAt: "asc" },
    });
    return {
      breakId: row.id,
      id: row.id,
      batchId: row.batchId,
      breakCode: row.breakCode,
      category: row.category,
      valueDate: row.valueDate,
      details: row.details,
      amount: row.amount != null ? moneyStr(row.amount) : null,
      currency: row.currency,
      status: row.status,
      internalLineId: row.internalLineId,
      externalLineId: row.externalLineId,
      exceptionId: row.exceptionId,
      version: row.version,
      comments,
    };
  }

  /**
   * FE often passes an exception id (or a stale id) into /reconciliation-breaks/:id/*.
   * Resolve by break PK, then by exceptionId, then heal a break row from the exception.
   */
  static async resolveBreakRow(breakId: string) {
    const id = requireStr(breakId, "breakId");
    let row = await db.spCashReconciliationBreak.findUnique({ where: { id } });
    if (row) return row;

    row = await db.spCashReconciliationBreak.findFirst({
      where: { exceptionId: id },
      orderBy: { createdAt: "desc" },
    });
    if (row) return row;

    const exc = await db.spCashReconciliationException.findUnique({ where: { id } });
    if (exc) return this.ensureBreakForException(exc);

    throw new InvestmentOpsError(
      "NOT_FOUND",
      "Break not found (pass a break id or exception id linked to a recon batch)",
      404,
      { breakId: id }
    );
  }

  static async ensureBreakForException(exc: any) {
    const existing = await db.spCashReconciliationBreak.findFirst({
      where: { exceptionId: exc.id },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    let batchId = exc.batchId || null;
    if (!batchId && exc.cashAccountId) {
      const batch = await db.spCashReconciliationBatch.findFirst({
        where: { cashAccountId: exc.cashAccountId },
        orderBy: { updatedAt: "desc" },
      });
      batchId = batch?.id || null;
    }
    if (!batchId) {
      const account = await db.spCashClientAccount.findUnique({
        where: { id: exc.cashAccountId },
        select: { id: true, currency: true, portfolioId: true },
      });
      const today = new Date();
      const periodFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const created = await db.spCashReconciliationBatch.create({
        data: {
          cashAccountId: exc.cashAccountId,
          currency: exc.currencyTxn || account?.currency || "USD",
          periodFrom,
          periodTo: today,
          reconType: "EXCEPTION_HEAL",
          status: "OPEN",
          fundId: account?.portfolioId || null,
          version: 1,
        },
      });
      batchId = created.id;
      if (!exc.batchId) {
        await db.spCashReconciliationException.update({
          where: { id: exc.id },
          data: { batchId },
        });
      }
    }

    return db.spCashReconciliationBreak.create({
      data: {
        batchId,
        breakCode: `EXC_${String(exc.category || "BREAK").toUpperCase()}`,
        category: exc.category || "EXCEPTION",
        valueDate: exc.settleDate || exc.tradeDate || null,
        details: `Healed from exception ${exc.id}${exc.source ? ` (${exc.source})` : ""}`,
        amount: exc.amountTxn ?? exc.amountReporting ?? null,
        currency: exc.currencyTxn || exc.currencyReporting || null,
        status: ["CLOSED", "REJECTED", "APPROVED"].includes(String(exc.status || "").toUpperCase())
          ? "REVIEWED"
          : "OPEN",
        exceptionId: exc.id,
        version: 1,
      },
    });
  }

  static async adjustInternal(breakId: string, body: any, actorId: string) {
    const brk = await this.getBreak(breakId);
    let journalDraftId = body.adjustmentJournalDraftId;
    if (!journalDraftId && body.journal) {
      const draft = await SpCashJournalService.create(
        { ...body.journal, postingPurpose: body.journal.postingPurpose || "BREAK_ADJUSTMENT" },
        actorId,
        body.idempotencyKey
      );
      journalDraftId = draft.id;
    }
    const updated = await db.spCashReconciliationBreak.update({
      where: { id: brk.breakId },
      data: {
        status: "ADJUSTMENT_DRAFTED",
        details: `${brk.details || ""}\nLinked journal draft ${journalDraftId || ""}`.trim(),
        version: { increment: 1 },
      },
    });
    return {
      ...brk,
      status: updated.status,
      adjustmentJournalDraftId: journalDraftId,
      version: updated.version,
    };
  }

  static async markReviewed(breakId: string, body: any, actorId: string) {
    const brk = await this.resolveBreakRow(breakId);
    if (String(brk.status || "").toUpperCase() === "REVIEWED") {
      if (body?.notes) {
        await db.spCashBreakComment.create({
          data: {
            breakId: brk.id,
            authorId: actorId,
            body: `Review note: ${body.notes}`,
          },
        });
      }
      return this.getBreak(brk.id);
    }

    const updated = await db.spCashReconciliationBreak.update({
      where: { id: brk.id },
      data: {
        status: "REVIEWED",
        details: body?.notes
          ? `${brk.details || ""}\nReviewed: ${body.notes}`.trim()
          : brk.details,
        version: { increment: 1 },
      },
    });
    if (brk.exceptionId) {
      const exc = await db.spCashReconciliationException.findUnique({
        where: { id: brk.exceptionId },
      });
      if (exc && ["OPEN", "ASSIGNED", "INVESTIGATING"].includes(String(exc.status || "").toUpperCase())) {
        await db.spCashReconciliationException.update({
          where: { id: exc.id },
          data: { status: "INVESTIGATING", version: { increment: 1 } },
        });
        await appendTimeline(exc.id, "MARK_REVIEWED", actorId, body?.notes || "Break marked reviewed", {
          breakId: updated.id,
        });
      }
    }
    return this.getBreak(updated.id);
  }

  static async createManualEntry(breakId: string, body: any, actorId: string) {
    const brkRow = await this.resolveBreakRow(breakId);
    const journal = await SpCashJournalService.create(
      {
        sourceSystem: "RECON",
        sourceEventId: `BREAK-${brkRow.id}`,
        postingPurpose: "MANUAL_ENTRY",
        currency: body.currency || brkRow.currency || "USD",
        valueDate: body.valueDate || brkRow.valueDate,
        lines: body.lines,
        cashAccountId: body.cashAccountId,
        portfolioId: body.portfolioId,
      },
      actorId,
      body.idempotencyKey
    );
    await db.spCashReconciliationBreak.update({
      where: { id: brkRow.id },
      data: {
        status: "MANUAL_ENTRY_CREATED",
        details: `${brkRow.details || ""}\nManual entry ${journal.id}`.trim(),
        version: { increment: 1 },
      },
    });
    return { breakId: brkRow.id, journal };
  }

  static async addBreakComment(breakId: string, body: any, actorId: string) {
    const brk = await this.resolveBreakRow(breakId);
    const comment = await db.spCashBreakComment.create({
      data: {
        breakId: brk.id,
        authorId: actorId,
        body: requireStr(body.body || body.comment || body.notes, "body"),
      },
    });
    return comment;
  }
}
