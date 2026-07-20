// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  assertMakerNotChecker,
  assertVersion,
  d,
  db,
  emitCash,
  fingerprint,
  hashFile,
  moneyStr,
  parseDateOnly,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

type StagingLine = {
  valueDate?: string;
  tradeDate?: string;
  amount?: string | number;
  signedCashAmount?: string | number;
  debitCredit?: string;
  reference?: string;
  counterparty?: string;
  raw?: any;
};

function applySignMap(
  amount: Decimal,
  debitCredit: string | undefined,
  signMap: any
): Decimal {
  const abs = amount.abs();
  const dc = String(debitCredit || "").toUpperCase();
  // Default: Debit = money leaving = negative canonical (AT-04)
  const debitIsNegative =
    signMap?.Debit === "NEGATIVE" ||
    signMap?.debit === "NEGATIVE" ||
    signMap?.Debit === -1 ||
    signMap?.["Debit"] === "outflow" ||
    signMap == null;
  if (dc === "DEBIT" || dc === "D") {
    return debitIsNegative ? abs.negated() : abs;
  }
  if (dc === "CREDIT" || dc === "C") {
    return debitIsNegative ? abs : abs.negated();
  }
  return amount;
}

function presentImport(row: any, extras: any = {}) {
  return {
    id: row.id,
    providerId: row.providerId,
    cashAccountId: row.cashAccountId,
    currency: row.currency,
    fileName: row.fileName,
    fileHash: row.fileHash,
    layoutId: row.layoutId,
    status: row.status,
    controlOpening: row.controlOpening != null ? moneyStr(row.controlOpening) : null,
    controlClosing: row.controlClosing != null ? moneyStr(row.controlClosing) : null,
    lineCount: row.lineCount,
    makerId: row.makerId,
    checkerId: row.checkerId,
    rejectReason: row.rejectReason,
    version: row.version,
    committedAt: row.committedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...extras,
  };
}

// In-memory staging for draft imports (lines stored until commit via JSON on import — we use a parallel staging approach)
// For durability without a staging table, store lines in spCashAuditEvent payload or reconstruct from body.
// We persist staging lines as SpCashExternalStatement with status STAGED only at commit; until then keep on import via control fields + companion JSON audit.

async function loadStaging(importId: string): Promise<StagingLine[]> {
  const ev = await db.spCashAuditEvent.findFirst({
    where: { objectType: "SpCashStatementImportStaging", objectId: importId, eventType: "staging.lines" },
    orderBy: { createdAt: "desc" },
  });
  return (ev?.payloadJson as any)?.lines || [];
}

async function saveStaging(importId: string, lines: StagingLine[], actorId: string) {
  await db.spCashAuditEvent.create({
    data: {
      actorId,
      objectType: "SpCashStatementImportStaging",
      objectId: importId,
      eventType: "staging.lines",
      outcome: "SUCCESS",
      payloadJson: { lines },
    },
  });
}

export class SpCashImportService {
  static async create(body: any, actorId: string, idempotencyKey?: string) {
    const contentB64 = body.contentBase64 || body.content;
    const content =
      body.rawContent != null
        ? String(body.rawContent)
        : contentB64
          ? Buffer.from(String(contentB64), "base64").toString("utf8")
          : null;
    if (content == null && !Array.isArray(body.lines)) {
      throw new InvestmentOpsError(
        "VALIDATION_ERROR",
        "contentBase64, rawContent, or lines required",
        400
      );
    }

    const fileName = requireStr(body.fileName || "statement.csv", "fileName");
    const fileHash = body.fileHash || hashFile(content || JSON.stringify(body.lines || []));
    const cashAccountId = requireStr(body.cashAccountId, "cashAccountId");
    const providerId = requireStr(body.providerId, "providerId");
    const currency = requireStr(body.currency, "currency").toUpperCase();

    return withIdempotency(
      "sp-cash:import:create",
      idempotencyKey || body.idempotencyKey,
      { fileHash, cashAccountId, providerId, fileName },
      async () => {
        const dup = await db.spCashExternalStatement.findUnique({
          where: { fileHash },
        }).catch(() => null);
        if (dup) {
          throw new InvestmentOpsError(
            "DUPLICATE_SOURCE",
            "A statement with this file hash was already committed",
            409,
            { fileHash }
          );
        }

        let lines: StagingLine[] = Array.isArray(body.lines) ? body.lines : [];
        if (!lines.length && content) {
          lines = parseSimpleCsv(content);
        }

        let layout: any = null;
        if (body.layoutId) {
          layout = await db.spCashFileLayout.findUnique({ where: { id: body.layoutId } });
        }

        const signedLines = lines.map((l) => {
          const rawAmt = d(l.signedCashAmount ?? l.amount ?? 0);
          const signed = applySignMap(rawAmt, l.debitCredit, layout?.signMapJson);
          return {
            ...l,
            signedCashAmount: moneyStr(signed),
          };
        });

        try {
          const created = await db.spCashStatementImport.create({
            data: {
              providerId,
              cashAccountId,
              currency,
              fileName,
              fileHash,
              layoutId: body.layoutId || null,
              status: "PENDING",
              controlOpening: body.controlOpening != null ? d(body.controlOpening) : null,
              controlClosing: body.controlClosing != null ? d(body.controlClosing) : null,
              lineCount: signedLines.length,
              maker: actorId,
              makerId: actorId,
              version: 1,
            },
          });
          await saveStaging(created.id, signedLines, actorId);
          await emitCash({
            eventType: "cash.import.created",
            aggregateType: "SpCashStatementImport",
            aggregateId: created.id,
            aggregateVersion: 1,
            actorId,
            payload: { fileHash, lineCount: signedLines.length },
          });
          return presentImport(created, { stagedLineCount: signedLines.length });
        } catch (error: any) {
          if (String(error?.code) === "P2002") {
            throw new InvestmentOpsError(
              "DUPLICATE_SOURCE",
              "Duplicate import for this account and file hash",
              409,
              { fileHash }
            );
          }
          throw error;
        }
      },
      201
    );
  }

  static async get(id: string) {
    const row = await db.spCashStatementImport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Import not found", 404);
    const lines = await loadStaging(id);
    return presentImport(row, { stagedLines: lines.slice(0, 100), stagedLineCount: lines.length });
  }

  static async errors(id: string) {
    const row = await db.spCashStatementImport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Import not found", 404);
    const validation = await this.validate(id, {}, row.makerId || "system");
    return { importId: id, errors: validation.errors || [] };
  }

  static async validate(id: string, body: any, actorId: string) {
    const row = await db.spCashStatementImport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Import not found", 404);
    const lines = await loadStaging(id);
    const errors: any[] = [];

    if (!lines.length) {
      errors.push({ code: "NO_LINES", message: "No staged lines" });
    }

    let sum = new Decimal(0);
    for (const [i, l] of lines.entries()) {
      const amt = d(l.signedCashAmount ?? l.amount ?? 0);
      sum = sum.plus(amt);
      if (!l.valueDate && !l.tradeDate) {
        errors.push({ code: "MISSING_DATE", lineIndex: i, message: "Missing value/trade date" });
      }
    }

    if (row.controlOpening != null && row.controlClosing != null) {
      const expected = d(row.controlClosing).minus(d(row.controlOpening));
      // control movement vs sum of lines
      if (sum.minus(expected).abs().gt(new Decimal("0.01"))) {
        errors.push({
          code: "CONTROL_TOTAL_MISMATCH",
          message: "Line sum does not reconcile opening→closing control totals",
          expectedMovement: moneyStr(expected),
          actualMovement: moneyStr(sum),
        });
      }
    }

    const committed = await db.spCashExternalStatement.findFirst({
      where: { fileHash: row.fileHash },
    });
    if (committed) {
      errors.push({ code: "DUPLICATE_SOURCE", message: "File hash already committed", fileHash: row.fileHash });
    }

    const status = errors.length ? "VALIDATION_FAILED" : "VALIDATED";
    const updated = await db.spCashStatementImport.update({
      where: { id },
      data: { status, version: { increment: 1 } },
    });

    await emitCash({
      eventType: "cash.import.validated",
      aggregateType: "SpCashStatementImport",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
      payload: { errorCount: errors.length, status },
    });

    return presentImport(updated, { valid: errors.length === 0, errors });
  }

  static async submit(id: string, body: any, actorId: string) {
    const row = await db.spCashStatementImport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Import not found", 404);
    if (!["VALIDATED", "PENDING", "REJECTED"].includes(row.status)) {
      throw new InvestmentOpsError("INVALID_STATUS", `Cannot submit import in ${row.status}`, 409);
    }
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);
    const updated = await db.spCashStatementImport.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        makerId: row.makerId || actorId,
        version: { increment: 1 },
      },
    });
    await emitCash({
      eventType: "cash.import.submitted",
      aggregateType: "SpCashStatementImport",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
    });
    return presentImport(updated);
  }

  static async commit(id: string, body: any, actorId: string) {
    const stagedLines = await loadStaging(id);
    if (!stagedLines.length) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "No lines to commit", 400);
    }

    const committed = await db.$transaction(
      async (tx: any) => {
        const row = await tx.spCashStatementImport.findUnique({ where: { id } });
        if (!row) throw new InvestmentOpsError("NOT_FOUND", "Import not found", 404);
        if (!["PENDING_APPROVAL", "VALIDATED"].includes(row.status)) {
          throw new InvestmentOpsError(
            "INVALID_STATUS",
            `Cannot commit import in ${row.status}`,
            409
          );
        }
        assertMakerNotChecker(row.makerId, actorId);
        if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

        const existingStmt = await tx.spCashExternalStatement.findFirst({
          where: { fileHash: row.fileHash },
        });
        if (existingStmt) {
          throw new InvestmentOpsError("DUPLICATE_SOURCE", "File hash already committed", 409, {
            fileHash: row.fileHash,
          });
        }

        const lines = stagedLines;

        let sum = new Decimal(0);
        for (const l of lines) sum = sum.plus(d(l.signedCashAmount ?? l.amount ?? 0));
        if (row.controlOpening != null && row.controlClosing != null) {
          const expected = d(row.controlClosing).minus(d(row.controlOpening));
          if (sum.minus(expected).abs().gt(new Decimal("0.01"))) {
            throw new InvestmentOpsError(
              "CONTROL_TOTAL_MISMATCH",
              "Control totals failed on commit",
              400,
              { expectedMovement: moneyStr(expected), actualMovement: moneyStr(sum) }
            );
          }
        }

        const dates = lines
          .map((l) => parseDateOnly(l.valueDate || l.tradeDate))
          .filter(Boolean) as Date[];
        const periodFrom = dates.length
          ? new Date(Math.min(...dates.map((dt) => dt.getTime())))
          : new Date();
        const periodTo = dates.length
          ? new Date(Math.max(...dates.map((dt) => dt.getTime())))
          : new Date();

        const statement = await tx.spCashExternalStatement.create({
          data: {
            importId: row.id,
            providerId: row.providerId,
            cashAccountId: row.cashAccountId,
            periodFrom,
            periodTo,
            currency: row.currency,
            openingBalance: row.controlOpening ?? new Decimal(0),
            closingBalance: row.controlClosing ?? sum,
            fileHash: row.fileHash,
            parserVersion: body?.parserVersion || "v1",
            status: "COMMITTED",
            evidenceUri: body?.evidenceUri || null,
            version: 1,
            lines: {
              create: lines.map((l) => {
                const signed = d(l.signedCashAmount ?? l.amount ?? 0);
                const vd = parseDateOnly(l.valueDate || l.tradeDate);
                const fp = fingerprint([
                  row.fileHash,
                  vd?.toISOString().slice(0, 10),
                  moneyStr(signed),
                  l.reference,
                  l.counterparty,
                ]);
                return {
                  importId: row.id,
                  rawPayloadJson: l.raw || l,
                  valueDate: vd,
                  tradeDate: parseDateOnly(l.tradeDate),
                  signedCashAmount: signed,
                  currency: row.currency,
                  reference: l.reference || null,
                  counterparty: l.counterparty || null,
                  fingerprint: fp,
                  matchStatus: "UNMATCHED",
                  residualAmount: signed,
                };
              }),
            },
          },
          include: { lines: true },
        });

        const updated = await tx.spCashStatementImport.update({
          where: { id },
          data: {
            status: "COMMITTED",
            checkerId: actorId,
            committedAt: new Date(),
            version: { increment: 1 },
          },
        });

        return {
          updated,
          statement,
          periodFrom,
          periodTo,
          cashAccountId: row.cashAccountId,
          currency: row.currency,
          fileHash: row.fileHash,
        };
      },
      { maxWait: 15000, timeout: 60000 }
    );

    await emitCash({
      eventType: "cash.statement.committed",
      aggregateType: "SpCashExternalStatement",
      aggregateId: committed.statement.id,
      aggregateVersion: 1,
      actorId,
      payload: {
        importId: id,
        cashAccountId: committed.cashAccountId,
        lineCount: committed.statement.lines.length,
        fileHash: committed.fileHash,
      },
    });

    const result: any = presentImport(committed.updated, {
      statementId: committed.statement.id,
      lineCount: committed.statement.lines.length,
    });

    if (committed.statement.lines.length <= 500) {
      try {
        const { SpCashMatchingService } = require("./SpCashMatchingService");
        const batch = await SpCashMatchingService.createBatch(
          {
            cashAccountId: committed.cashAccountId,
            currency: committed.currency,
            periodFrom: committed.periodFrom.toISOString().slice(0, 10),
            periodTo: committed.periodTo.toISOString().slice(0, 10),
            reconType: "CASH_STATEMENT",
            autoMatchEnabled: true,
          },
          actorId
        );
        await SpCashMatchingService.run(batch.id, { autoMatch: true }, actorId);
        result.matchingBatchId = batch.id;
      } catch {
        /* non-fatal */
      }
    }
    return result;
  }

  static async reject(id: string, body: any, actorId: string) {
    const row = await db.spCashStatementImport.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Import not found", 404);
    if (row.status === "COMMITTED") {
      throw new InvestmentOpsError("IMMUTABLE", "Committed imports cannot be rejected", 409);
    }
    if (row.makerId) assertMakerNotChecker(row.makerId, actorId);
    const updated = await db.spCashStatementImport.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectReason: body?.reason || null,
        checkerId: actorId,
        version: { increment: 1 },
      },
    });
    await emitCash({
      eventType: "cash.import.rejected",
      aggregateType: "SpCashStatementImport",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.reason || null,
    });
    return presentImport(updated);
  }
}

function parseSimpleCsv(content: string): StagingLine[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: StagingLine[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cols[j] : undefined;
    };
    out.push({
      valueDate: get("value_date") || get("valuedate") || get("date"),
      tradeDate: get("trade_date") || get("tradedate"),
      amount: get("amount") || get("signed_cash_amount"),
      debitCredit: get("debit_credit") || get("drcr") || get("side"),
      reference: get("reference") || get("ref"),
      counterparty: get("counterparty") || get("cpty"),
      raw: { cols, header },
    });
  }
  return out;
}
