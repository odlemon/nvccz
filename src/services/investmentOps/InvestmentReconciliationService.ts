// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { assertFourEyeSeparation } from "./investmentOpsFourEye";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { InvestmentJobWorkerService, registerInvestmentJobHandler } from "./InvestmentJobWorkerService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;

export const RECON_TYPES = [
  "CASH",
  "HOLDINGS",
  "TRADE",
  "BROKER_CONFIRMATION",
  "CUSTODIAN_POSITION",
  "ACCOUNTING_LEDGER",
  "NAV",
  "PRICE",
  "FX",
] as const;

const MATERIAL_THRESHOLD = new Decimal("1000");

const ITEM_TRANSITIONS: Record<string, string[]> = {
  UNMATCHED: ["INVESTIGATING", "ESCALATED", "RESOLVED", "WRITE_OFF_PENDING", "MATCHED"],
  PARTIALLY_MATCHED: ["INVESTIGATING", "ESCALATED", "RESOLVED", "WRITE_OFF_PENDING"],
  INVESTIGATING: ["INVESTIGATING", "RESOLVED", "ESCALATED", "WRITE_OFF_PENDING", "UNMATCHED"],
  ESCALATED: ["INVESTIGATING", "RESOLVED", "WRITE_OFF_PENDING"],
  WRITE_OFF_PENDING: ["WRITTEN_OFF", "REJECTED_WRITE_OFF", "INVESTIGATING"],
  REJECTED_WRITE_OFF: ["INVESTIGATING", "WRITE_OFF_PENDING", "RESOLVED"],
  RESOLVED: ["REOPENED"],
  WRITTEN_OFF: ["REOPENED"],
  REOPENED: ["INVESTIGATING", "RESOLVED", "WRITE_OFF_PENDING", "ESCALATED"],
  MATCHED: ["REOPENED"],
};

function fail(code: string, message: string, status = 400, details: unknown = null): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function parseCsvLines(csvText: string): Array<Record<string, string>> {
  const lines = String(csvText || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function dec(value: unknown): Decimal {
  try {
    return new Decimal(String(value ?? 0));
  } catch {
    return new Decimal(0);
  }
}

function serializeItem(item: any) {
  if (!item) return item;
  return {
    ...item,
    internalAmount: item.internalAmount != null ? String(item.internalAmount) : null,
    externalAmount: item.externalAmount != null ? String(item.externalAmount) : null,
    variance: item.variance != null ? String(item.variance) : null,
  };
}

async function nextHistorySequence(tx: any, itemId: string) {
  const last = await tx.investmentReconciliationItemHistory.findFirst({
    where: { itemId },
    orderBy: { sequenceNo: "desc" },
  });
  return (last?.sequenceNo || 0) + 1;
}

async function appendHistory(
  tx: any,
  item: any,
  toStatus: string,
  actorId: string,
  reason?: string,
  extra?: Record<string, unknown>
) {
  const sequenceNo = await nextHistorySequence(tx, item.id);
  await tx.investmentReconciliationItemHistory.create({
    data: {
      itemId: item.id,
      sequenceNo,
      fromStatus: item.status,
      toStatus,
      snapshotJson: {
        internalRef: item.internalRef,
        externalRef: item.externalRef,
        internalAmount: item.internalAmount != null ? String(item.internalAmount) : null,
        externalAmount: item.externalAmount != null ? String(item.externalAmount) : null,
        variance: item.variance != null ? String(item.variance) : null,
        ...extra,
      },
      actorId,
      reason: reason || null,
    },
  });
}

async function itemWithAccess(itemId: string, userId: string, user: any) {
  const fundId = await ListedEquityAccessService.assertObjectFundAccess(
    userId,
    user,
    "Reconciliation item",
    itemId,
    async () =>
      (
        await db.investmentReconciliationItem.findUnique({
          where: { id: itemId },
          select: { batch: { select: { fundId: true } } },
        })
      )?.batch?.fundId
  );
  const item = await db.investmentReconciliationItem.findUnique({
    where: { id: itemId },
    include: { batch: true },
  });
  if (!item) fail("RECON_ITEM_NOT_FOUND", "Reconciliation item not found", 404);
  return { item, fundId };
}

function assertTransition(from: string, to: string) {
  const allowed = ITEM_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    fail("INVALID_RECON_TRANSITION", `Cannot transition from ${from} to ${to}`, 409, { from, to });
  }
}

function isMaterial(item: any) {
  const variance = dec(item.variance).abs();
  return variance.gte(MATERIAL_THRESHOLD);
}

async function requireEvidence(documentId: string | undefined, fundId: string, required: boolean) {
  if (!required && !documentId) return;
  if (!documentId) {
    fail("EVIDENCE_REQUIRED", "Material reconciliation resolutions require supporting evidence", 422);
  }
  const document = await db.investmentDocument.findUnique({ where: { id: documentId } });
  if (!document || document.isDeleted) fail("DOCUMENT_NOT_FOUND", "Evidence document not found", 404);
  if (document.fundId && document.fundId !== fundId) {
    fail("DOCUMENT_FUND_MISMATCH", "Evidence document belongs to another fund", 403);
  }
  if (document.approvalStatus && !["APPROVED", "PENDING", "PENDING_REVIEW"].includes(document.approvalStatus)) {
    fail("EVIDENCE_NOT_APPROVED", "Evidence document is not usable", 422, {
      approvalStatus: document.approvalStatus,
    });
  }
}

export class InvestmentReconciliationService {
  static async createUpload(
    data: {
      fundId: string;
      reconType: string;
      csvText?: string;
      contentBase64?: string;
      fileName?: string;
      sourceCode?: string;
    },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const fundId = String(data.fundId || "").trim();
    const reconType = String(data.reconType || "").toUpperCase();
    if (!fundId) fail("VALIDATION_ERROR", "fundId is required");
    if (!RECON_TYPES.includes(reconType as any)) {
      fail("INVALID_RECON_TYPE", `reconType must be one of ${RECON_TYPES.join(", ")}`);
    }
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    const existing = await db.investmentJob.findUnique({ where: { idempotencyKey } });
    if (existing) return existing.payloadJson;

    let csvText = data.csvText;
    if (!csvText && data.contentBase64) {
      csvText = Buffer.from(data.contentBase64, "base64").toString("utf8");
    }
    if (!csvText) fail("VALIDATION_ERROR", "csvText or contentBase64 is required");

    let sourceId: string | null = null;
    if (data.sourceCode) {
      const source = await db.investmentReconciliationSource.upsert({
        where: { fundId_sourceCode: { fundId, sourceCode: data.sourceCode } },
        create: {
          fundId,
          sourceCode: data.sourceCode,
          sourceType: reconType,
          displayName: data.sourceCode,
          isActive: true,
        },
        update: { isActive: true, sourceType: reconType },
      });
      sourceId = source.id;
    }

    const upload = {
      id: idempotencyKey,
      fundId,
      reconType,
      fileName: data.fileName || "upload.csv",
      rowCount: parseCsvLines(csvText).length,
      sourceId,
      csvText,
      uploadedById: userId,
      createdAt: new Date().toISOString(),
    };

    await InvestmentJobWorkerService.enqueue({
      jobType: "RECONCILIATION_UPLOAD",
      aggregateType: "ReconciliationUpload",
      aggregateId: fundId,
      payloadJson: upload,
      idempotencyKey,
      priority: 80,
    });

    // Mark completed immediately — upload is durable payload on the job
    const job = await db.investmentJob.findUnique({ where: { idempotencyKey } });
    if (job?.status === "PENDING") {
      await db.investmentJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    await InvestmentOpsAuditService.log(
      "RECONCILIATION_UPLOAD",
      "ReconciliationUpload",
      job.id,
      { fundId, reconType, fileName: upload.fileName, rowCount: upload.rowCount },
      userId
    );

    return {
      uploadId: job.id,
      fundId,
      reconType,
      fileName: upload.fileName,
      rowCount: upload.rowCount,
      sourceId,
    };
  }

  static async run(
    data: {
      fundId: string;
      reconType: string;
      asOfDate?: string;
      uploadId?: string;
      csvText?: string;
      fileName?: string;
      processNow?: boolean;
    },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const fundId = String(data.fundId || "").trim();
    const reconType = String(data.reconType || "").toUpperCase();
    if (!fundId) fail("VALIDATION_ERROR", "fundId is required");
    if (!RECON_TYPES.includes(reconType as any)) {
      fail("INVALID_RECON_TYPE", `reconType must be one of ${RECON_TYPES.join(", ")}`);
    }
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    const existing = await db.investmentReconciliationBatch.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return db.investmentReconciliationBatch.findUnique({
        where: { id: existing.id },
        include: { items: true },
      });
    }

    let csvText = data.csvText;
    let fileName = data.fileName;
    let sourceId: string | null = null;
    if (data.uploadId) {
      const uploadJob = await db.investmentJob.findUnique({ where: { id: data.uploadId } });
      if (!uploadJob || uploadJob.jobType !== "RECONCILIATION_UPLOAD") {
        fail("UPLOAD_NOT_FOUND", "Reconciliation upload not found", 404);
      }
      const payload = uploadJob.payloadJson as any;
      if (payload.fundId !== fundId) fail("UPLOAD_FUND_MISMATCH", "Upload belongs to another fund", 403);
      csvText = payload.csvText;
      fileName = payload.fileName;
      sourceId = payload.sourceId || null;
    }

    const batch = await db.investmentReconciliationBatch.create({
      data: {
        fundId,
        reconType,
        asOfDate: data.asOfDate ? new Date(data.asOfDate) : new Date(),
        status: "QUEUED",
        createdById: userId,
        externalFileName: fileName || null,
        idempotencyKey,
        sourceId,
      },
    });

    const job = await InvestmentJobWorkerService.enqueue({
      jobType: "RECONCILIATION_RUN",
      aggregateType: "ReconciliationBatch",
      aggregateId: batch.id,
      payloadJson: {
        batchId: batch.id,
        fundId,
        reconType,
        csvText: csvText || null,
        fileName: fileName || null,
        requestedById: userId,
      },
      idempotencyKey: `recon-run:${idempotencyKey}`,
      priority: 60,
    });

    if (data.processNow !== false) {
      await InvestmentJobWorkerService.processJobById(job.id);
    }

    return db.investmentReconciliationBatch.findUnique({
      where: { id: batch.id },
      include: { items: true },
    });
  }

  /** Legacy wrappers */
  static async uploadExternalFile(
    fundId: string,
    reconType: string,
    csvText: string,
    fileName: string,
    userId: string,
    user: any
  ) {
    const upload = await this.createUpload(
      { fundId, reconType, csvText, fileName },
      `legacy-upload:${fundId}:${reconType}:${Date.now()}`,
      userId,
      user
    );
    return this.run(
      { fundId, reconType, uploadId: upload.uploadId, processNow: true },
      `legacy-run:${upload.uploadId}`,
      userId,
      user
    );
  }

  static async executeBatch(batchId: string, csvText?: string | null) {
    const batch = await db.investmentReconciliationBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new InvestmentOpsError("RECON_BATCH_NOT_FOUND", "Batch not found", 404);
    if (batch.status === "COMPLETED") {
      return db.investmentReconciliationBatch.findUnique({
        where: { id: batchId },
        include: { items: true },
      });
    }

    await db.investmentReconciliationBatch.update({
      where: { id: batchId },
      data: { status: "RUNNING" },
    });

    const fundId = batch.fundId;
    const reconType = batch.reconType;
    const externalRows = csvText ? parseCsvLines(csvText) : [];
    const items: any[] = [];

    if (reconType === "HOLDINGS" || reconType === "CUSTODIAN_POSITION") {
      const holdings = await db.listedEquityHolding.findMany({
        where: { fundId },
        include: { security: true },
      });
      const externalByRef = new Map<string, number>();
      for (const row of externalRows) {
        const ref = row.ref || row.symbol || row.ticker || row.internal_ref;
        const qty = Number(row.quantity || row.qty || row.amount || 0);
        if (ref) externalByRef.set(ref.toUpperCase(), qty);
      }
      for (const h of holdings) {
        const ref = `${h.security.symbol}:${h.security.exchangeCode}`;
        const internalQty = Number(h.quantity);
        const internalAmount = internalQty * Number(h.wac);
        const extQty =
          externalByRef.get(ref.toUpperCase()) ?? externalByRef.get(h.security.symbol.toUpperCase());
        let status = "MATCHED";
        let externalAmount = internalAmount;
        let variance = 0;
        let message = "Internal holding snapshot";
        if (externalRows.length) {
          if (extQty == null) {
            status = "UNMATCHED";
            message = "No external line for holding";
          } else {
            externalAmount = extQty * Number(h.wac);
            variance = internalAmount - externalAmount;
            status = Math.abs(variance) < 0.01 ? "MATCHED" : "PARTIALLY_MATCHED";
            message =
              status === "MATCHED"
                ? "Custodian quantity matches"
                : `Qty variance internal=${internalQty} external=${extQty}`;
          }
        }
        items.push({
          batchId,
          status,
          internalRef: ref,
          internalAmount,
          externalAmount,
          variance,
          message,
        });
      }
      for (const row of externalRows) {
        const ref = (row.ref || row.symbol || row.ticker || "").toUpperCase();
        if (!ref) continue;
        const matched = holdings.some(
          (h: any) =>
            `${h.security.symbol}:${h.security.exchangeCode}`.toUpperCase() === ref ||
            h.security.symbol.toUpperCase() === ref
        );
        if (!matched) {
          items.push({
            batchId,
            status: "UNMATCHED",
            internalRef: null,
            externalRef: ref,
            externalAmount: Number(row.quantity || row.qty || 0),
            message: "External line with no internal holding",
          });
        }
      }
    } else if (reconType === "TRADE" || reconType === "BROKER_CONFIRMATION") {
      const trades = await db.listedEquityTrade.findMany({
        where: { fundId, status: { in: ["SETTLED", "ROUTING", "EXECUTED", "PENDING_SETTLEMENT"] } },
        take: 200,
      });
      const externalByRef = new Map<string, number>();
      for (const row of externalRows) {
        const ref = row.trade_ref || row.ref || row.reference;
        if (ref) externalByRef.set(ref.toUpperCase(), Number(row.amount || row.value || 0));
      }
      for (const t of trades) {
        const amt = Number(t.quantity) * Number(t.executionPrice);
        const ext = externalByRef.get(t.tradeRef.toUpperCase());
        let status = t.status === "SETTLED" ? "MATCHED" : "UNMATCHED";
        if (externalRows.length && ext != null) {
          status = Math.abs(amt - ext) < 0.01 ? "MATCHED" : "PARTIALLY_MATCHED";
        }
        items.push({
          batchId,
          status,
          internalRef: t.tradeRef,
          internalAmount: amt,
          externalAmount: ext ?? null,
          variance: ext != null ? amt - ext : null,
          message: externalRows.length ? "Broker trade compare" : `Trade status ${t.status}`,
        });
      }
    } else if (reconType === "PRICE") {
      const holdings = await db.listedEquityHolding.findMany({ where: { fundId } });
      for (const h of holdings) {
        const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
        items.push({
          batchId,
          status: price != null ? "MATCHED" : "UNMATCHED",
          internalRef: h.securityId,
          message: price != null ? `Approved price ${price}` : "Missing approved price",
        });
      }
    } else if (reconType === "FX") {
      const approved = await db.investmentFxRateSnapshot.count({ where: { approvalStatus: "APPROVED" } });
      items.push({
        batchId,
        status: approved > 0 ? "MATCHED" : "UNMATCHED",
        internalRef: "FX_SNAPSHOTS",
        message: approved > 0 ? `${approved} approved FX snapshots` : "No approved FX snapshots",
      });
    } else if (reconType === "NAV") {
      const snap = await db.listedEquityValuationSnapshot.findFirst({
        where: { fundId },
        orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
      });
      const extNav = externalRows.reduce((s, r) => s + Number(r.nav || r.amount || 0), 0);
      const internal = snap ? Number(snap.navBaseCurrency) : 0;
      items.push({
        batchId,
        status: !snap
          ? "UNMATCHED"
          : externalRows.length
            ? Math.abs(internal - extNav) < 0.01
              ? "MATCHED"
              : "PARTIALLY_MATCHED"
            : "INVESTIGATING",
        internalRef: snap?.id || "NO_NAV",
        internalAmount: internal,
        externalAmount: externalRows.length ? extNav : null,
        variance: externalRows.length ? internal - extNav : null,
        message: snap ? "NAV snapshot compare" : "No valuation snapshot",
      });
    } else if (reconType === "ACCOUNTING_LEDGER") {
      const events = await db.investmentAccountingEvent.findMany({
        where: { fundId, status: { in: ["POSTED", "FAILED", "NOT_POSTED"] } },
        take: 200,
      });
      for (const e of events) {
        items.push({
          batchId,
          status: e.status === "POSTED" ? "MATCHED" : "UNMATCHED",
          internalRef: e.id,
          internalAmount: e.amount != null ? Number(e.amount) : null,
          message: `Accounting event ${e.status}`,
        });
      }
    } else {
      // CASH default
      const config = await db.listedEquityFundConfig.findUnique({ where: { fundId } });
      let internalAmount = 0;
      if (config?.trustBankId) {
        const entries = await db.cashbookEntry.aggregate({
          where: { bankId: config.trustBankId },
          _sum: { amount: true },
        });
        internalAmount = Number(entries._sum.amount || 0);
      }
      const extCash = externalRows.reduce((s, r) => s + Number(r.amount || r.balance || 0), 0);
      items.push({
        batchId,
        status: externalRows.length
          ? Math.abs(internalAmount - extCash) < 0.01
            ? "MATCHED"
            : "UNMATCHED"
          : config?.trustBankId
            ? "INVESTIGATING"
            : "UNMATCHED",
        internalRef: `trust:${config?.trustBankId ?? "none"}`,
        internalAmount,
        externalAmount: externalRows.length ? extCash : null,
        variance: externalRows.length ? internalAmount - extCash : null,
        message: externalRows.length
          ? "Bank statement vs trust cashbook"
          : "Upload bank statement CSV (columns: ref, amount/balance)",
      });
    }

    if (items.length) {
      await db.investmentReconciliationItem.createMany({ data: items });
    }
    const created = await db.investmentReconciliationItem.findMany({ where: { batchId } });
    for (const item of created) {
      await appendHistory(db, { ...item, status: null }, item.status, batch.createdById, "Batch created");
    }

    const matched = items.filter((i) => i.status === "MATCHED").length;
    const unmatched = items.filter((i) => i.status === "UNMATCHED" || i.status === "PARTIALLY_MATCHED").length;
    await db.investmentReconciliationBatch.update({
      where: { id: batchId },
      data: {
        status: "COMPLETED",
        matchedCount: matched,
        unmatchedCount: unmatched,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await InvestmentOpsAuditService.log(
      "RECONCILIATION_RUN",
      "ReconciliationBatch",
      batchId,
      { reconType, itemCount: items.length },
      batch.createdById
    );
    return db.investmentReconciliationBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
  }

  static async listBatches(query: any, userId: string, user: any) {
    if (!query.fundId) fail("VALIDATION_ERROR", "fundId is required");
    await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    const page = parsePagination(query);
    const where: any = { fundId: query.fundId };
    if (query.reconType) where.reconType = String(query.reconType).toUpperCase();
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      db.investmentReconciliationBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentReconciliationBatch.count({ where }),
    ]);
    return paginatedResult(rows, total, page.page, page.pageSize);
  }

  static async getBatch(id: string, userId: string, user: any) {
    await ListedEquityAccessService.assertObjectFundAccess(
      userId,
      user,
      "Reconciliation batch",
      id,
      async () =>
        (await db.investmentReconciliationBatch.findUnique({ where: { id }, select: { fundId: true } }))
          ?.fundId
    );
    const batch = await db.investmentReconciliationBatch.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!batch) fail("RECON_BATCH_NOT_FOUND", "Batch not found", 404);
    return { ...batch, items: batch.items.map(serializeItem) };
  }

  static async listItems(query: any, userId: string, user: any) {
    if (!query.fundId && !query.batchId) fail("VALIDATION_ERROR", "fundId or batchId is required");
    const page = parsePagination(query);
    const where: any = {};
    if (query.batchId) where.batchId = query.batchId;
    if (query.status) where.status = query.status;
    if (query.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
      where.batch = { fundId: query.fundId };
    } else if (query.batchId) {
      await ListedEquityAccessService.assertObjectFundAccess(
        userId,
        user,
        "Reconciliation batch",
        query.batchId,
        async () =>
          (
            await db.investmentReconciliationBatch.findUnique({
              where: { id: query.batchId },
              select: { fundId: true },
            })
          )?.fundId
      );
    }
    const [rows, total] = await Promise.all([
      db.investmentReconciliationItem.findMany({
        where,
        include: { batch: { select: { fundId: true, reconType: true } } },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentReconciliationItem.count({ where }),
    ]);
    return paginatedResult(rows.map(serializeItem), total, page.page, page.pageSize);
  }

  static async getItem(itemId: string, userId: string, user: any) {
    const { item } = await itemWithAccess(itemId, userId, user);
    return serializeItem(item);
  }

  static async transitionItem(
    itemId: string,
    toStatus: string,
    userId: string,
    user: any,
    opts: {
      reason?: string;
      documentId?: string;
      assigneeId?: string;
      adjustmentJson?: any;
      requireEvidence?: boolean;
    } = {}
  ) {
    const { item, fundId } = await itemWithAccess(itemId, userId, user);
    assertTransition(item.status, toStatus);
    const material = isMaterial(item);
    const needsEvidence =
      opts.requireEvidence === true ||
      (material && ["RESOLVED", "WRITE_OFF_PENDING", "WRITTEN_OFF"].includes(toStatus));
    await requireEvidence(opts.documentId, fundId, needsEvidence);

    return db.$transaction(async (tx: any) => {
      await appendHistory(tx, item, toStatus, userId, opts.reason, {
        documentId: opts.documentId,
        assigneeId: opts.assigneeId,
      });
      const updated = await tx.investmentReconciliationItem.update({
        where: { id: itemId },
        data: {
          status: toStatus === "REJECTED_WRITE_OFF" ? "INVESTIGATING" : toStatus,
          resolvedById: ["RESOLVED", "WRITTEN_OFF"].includes(toStatus) ? userId : item.resolvedById,
          resolvedAt: ["RESOLVED", "WRITTEN_OFF"].includes(toStatus) ? new Date() : item.resolvedAt,
          resolutionReason: opts.reason || item.resolutionReason,
          resolutionDocumentId: opts.documentId || item.resolutionDocumentId,
        },
      });
      if (opts.adjustmentJson || opts.reason) {
        await tx.investmentReconciliationResolution.create({
          data: {
            itemId,
            resolutionType: toStatus,
            status:
              toStatus === "WRITE_OFF_PENDING"
                ? "PROPOSED"
                : toStatus === "WRITTEN_OFF"
                  ? "APPROVED"
                  : toStatus === "REJECTED_WRITE_OFF"
                    ? "REJECTED"
                    : "RECORDED",
            reason: opts.reason || toStatus,
            adjustmentJson: opts.adjustmentJson || null,
            documentId: opts.documentId || null,
            proposedById: userId,
            approvedById: toStatus === "WRITTEN_OFF" ? userId : null,
            approvedAt: toStatus === "WRITTEN_OFF" ? new Date() : null,
          },
        });
      }
      return serializeItem(updated);
    });
  }

  static async assign(itemId: string, userId: string, user: any, assigneeId: string, reason?: string) {
    if (!assigneeId) fail("VALIDATION_ERROR", "assigneeId is required");
    return this.transitionItem(itemId, "INVESTIGATING", userId, user, {
      reason: reason || `Assigned to ${assigneeId}`,
      assigneeId,
    });
  }

  static async investigate(itemId: string, userId: string, user: any, reason?: string) {
    return this.transitionItem(itemId, "INVESTIGATING", userId, user, { reason });
  }

  static async resolve(
    itemId: string,
    userId: string,
    user: any,
    reason: string,
    documentId?: string
  ) {
    if (!reason?.trim()) fail("VALIDATION_ERROR", "reason is required");
    return this.transitionItem(itemId, "RESOLVED", userId, user, { reason, documentId });
  }

  /** Legacy */
  static async resolveItem(
    itemId: string,
    userId: string,
    user: any,
    reason: string,
    documentId?: string
  ) {
    return this.resolve(itemId, userId, user, reason, documentId);
  }

  static async escalate(itemId: string, userId: string, user: any, reason?: string) {
    return this.transitionItem(itemId, "ESCALATED", userId, user, { reason });
  }

  static async writeOff(
    itemId: string,
    userId: string,
    user: any,
    reason: string,
    documentId?: string
  ) {
    if (!reason?.trim()) fail("VALIDATION_ERROR", "reason is required");
    return this.transitionItem(itemId, "WRITE_OFF_PENDING", userId, user, {
      reason,
      documentId,
      requireEvidence: true,
    });
  }

  static async approveWriteOff(itemId: string, userId: string, user: any, reason?: string) {
    const { item } = await itemWithAccess(itemId, userId, user);
    const pending = await db.investmentReconciliationResolution.findFirst({
      where: { itemId, status: "PROPOSED", resolutionType: "WRITE_OFF_PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (pending?.proposedById && pending.proposedById === userId) {
      assertFourEyeSeparation(
        pending.proposedById,
        userId,
        user,
        "Requester cannot approve their own write-off"
      );
    }
    return this.transitionItem(itemId, "WRITTEN_OFF", userId, user, {
      reason: reason || item.resolutionReason || "Write-off approved",
      documentId: item.resolutionDocumentId,
      requireEvidence: true,
    });
  }

  static async rejectWriteOff(itemId: string, userId: string, user: any, reason?: string) {
    return this.transitionItem(itemId, "REJECTED_WRITE_OFF", userId, user, { reason });
  }

  static async reopen(itemId: string, userId: string, user: any, reason?: string) {
    return this.transitionItem(itemId, "REOPENED", userId, user, { reason });
  }

  static async itemHistory(itemId: string, userId: string, user: any) {
    await itemWithAccess(itemId, userId, user);
    return db.investmentReconciliationItemHistory.findMany({
      where: { itemId },
      orderBy: { sequenceNo: "asc" },
    });
  }

  static async summary(fundId: string, userId: string, user: any, reconType?: string) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const batchWhere: any = { fundId };
    if (reconType) batchWhere.reconType = String(reconType).toUpperCase();
    const batches = await db.investmentReconciliationBatch.findMany({
      where: batchWhere,
      select: { id: true },
    });
    const batchIds = batches.map((b: any) => b.id);
    if (!batchIds.length) {
      return { fundId, byStatus: {}, totalItems: 0, openExceptions: 0 };
    }
    const grouped = await db.investmentReconciliationItem.groupBy({
      by: ["status"],
      where: { batchId: { in: batchIds } },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    let totalItems = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      totalItems += g._count._all;
    }
    const openExceptions =
      (byStatus.UNMATCHED || 0) +
      (byStatus.PARTIALLY_MATCHED || 0) +
      (byStatus.INVESTIGATING || 0) +
      (byStatus.ESCALATED || 0) +
      (byStatus.WRITE_OFF_PENDING || 0) +
      (byStatus.REOPENED || 0);
    return { fundId, reconType: reconType || null, byStatus, totalItems, openExceptions };
  }
}

registerInvestmentJobHandler("RECONCILIATION_RUN", async (job) => {
  const payload = job.payloadJson as any;
  return InvestmentReconciliationService.executeBatch(payload.batchId, payload.csvText);
});

registerInvestmentJobHandler("RECONCILIATION_UPLOAD", async () => ({ stored: true }));
