// @ts-nocheck
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../../utils/database";
import {
  LpPortalError,
  assertFundAccess,
  moneyStr,
  parseListQuery,
} from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

const db = () => prisma as any;

const VISIBLE_CALL_STATUSES = new Set([
  "NOTICES_SENT",
  "ISSUED",
  "ACTIVE",
  "PARTIALLY_PAID",
  "PAID",
  "CLOSED",
]);

function dateOnly(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCapitalCallVisible(cc: { status: string; noticesSentAt: Date | null }): boolean {
  const status = String(cc.status || "").toUpperCase();
  if (status === "DRAFT" || status === "CANCELLED") return false;
  if (cc.noticesSentAt != null) return true;
  return VISIBLE_CALL_STATUSES.has(status);
}

/** Portal investor status — never mutates amountPaid / allocation payment status. */
function mapPortalCallStatus(alloc: any, cc: any, portalState: any): string {
  const ccStatus = String(cc.status || "").toUpperCase();
  if (ccStatus === "CANCELLED") return "CANCELLED";

  const amount = Number(alloc.currentCallAmount?.toString?.() ?? alloc.currentCallAmount ?? 0);
  const paid = Number(alloc.amountPaid?.toString?.() ?? alloc.amountPaid ?? 0);
  if (amount > 0 && paid >= amount) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";

  if (portalState?.acknowledgedAt) return "ACKNOWLEDGED";

  const due = dateOnly(cc.paymentDueDate);
  if (due && due < todayDateOnly() && paid < amount) return "OVERDUE";

  return "ISSUED";
}

function parseWiring(bankInstructions: string | null | undefined) {
  const raw = String(bankInstructions || "").trim();
  if (!raw) {
    return {
      bankName: null,
      accountName: null,
      accountNumber: null,
      accountNumberMasked: null,
      abaRouting: null,
      reference: null,
      raw: null,
    };
  }
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      const acct = j.accountNumber || j.account_number || null;
      return {
        bankName: j.bankName || j.bank_name || null,
        accountName: j.accountName || j.account_name || null,
        accountNumber: acct,
        accountNumberMasked: j.accountNumberMasked || (acct ? `••••${String(acct).slice(-4)}` : null),
        abaRouting: j.abaRouting || j.routing || j.swift || null,
        reference: j.reference || null,
        raw,
      };
    }
  } catch {
    /* plain text */
  }
  return {
    bankName: null,
    accountName: null,
    accountNumber: null,
    accountNumberMasked: null,
    abaRouting: null,
    reference: null,
    raw,
  };
}

function mapDistributionType(source: string): string {
  const s = String(source || "").toUpperCase();
  if (s === "EXIT_PROCEEDS" || s === "REALISATION_PROCEEDS") return "REALISATION_PROCEEDS";
  if (s === "DIVIDEND") return "DIVIDEND";
  if (s === "INTEREST") return "INTEREST";
  if (s === "INCOME") return "INCOME";
  if (s === "RETURN_OF_CAPITAL") return "RETURN_OF_CAPITAL";
  return s || "OTHER";
}

function isDistributionVisible(dist: { status: string; noticesSentAt: Date | null }): boolean {
  const status = String(dist.status || "").toUpperCase();
  if (status === "DRAFT" || status === "CANCELLED") return false;
  if (dist.noticesSentAt != null) return true;
  return !["DRAFT", "CANCELLED"].includes(status);
}

export class LpPortalCapitalActivityService {
  static async listCapitalCalls(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);
    if (q.fundId) assertFundAccess(ctx, q.fundId);

    const allocations = await prisma.capitalCallAllocation.findMany({
      where: {
        clientId: ctx.clientId,
        ...(q.fundId ? { capitalCall: { fundId: q.fundId } } : {}),
      },
      include: {
        capitalCall: {
          include: {
            fund: { select: { id: true, name: true } },
            currency: { select: { code: true } },
          },
        },
        portalState: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let items = allocations
      .filter((a) => LpPortalAccessService.fundAllowed(ctx, a.capitalCall.fundId))
      .filter((a) => isCapitalCallVisible(a.capitalCall))
      .map((a) => this.mapCallSummary(a));

    if (q.status) {
      const st = String(q.status).toUpperCase();
      items = items.filter((i) => i.status === st);
    }

    const total = items.length;
    const pageItems = items.slice(q.skip, q.skip + q.take);
    return { items: pageItems, page: q.page, pageSize: q.pageSize, total };
  }

  static async getCapitalCall(ctx: LpPortalContext, allocationId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const alloc = await this.loadAllocation(ctx, allocationId);
    return this.mapCallDetail(alloc);
  }

  static async summary(ctx: LpPortalContext, opts: { fundId?: string } = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (opts.fundId) assertFundAccess(ctx, opts.fundId);

    const { items } = await this.listCapitalCalls(ctx, {
      fundId: opts.fundId,
      page: 1,
      pageSize: 200,
    });

    let outstanding = 0;
    let overdue = 0;
    let paidYtd = 0;
    let openCount = 0;
    const year = new Date().getFullYear();

    let paidCallCount = 0;
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    const today = todayDateOnly();
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const soonStr = soon.toISOString().slice(0, 10);

    for (const i of items) {
      const amt = Number(i.outstanding);
      if (i.status === "OVERDUE") overdue += amt;
      if (["ISSUED", "ACKNOWLEDGED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)) {
        outstanding += amt;
        openCount += 1;
      }
      if (i.status === "PAID") paidCallCount += 1;
      if (i.dueDate && i.dueDate >= today && i.dueDate <= soonStr && i.status !== "PAID") {
        dueSoonCount += 1;
        dueSoonAmount += amt;
      }
      if (i.status === "PAID" && i.dueDate && String(i.dueDate).startsWith(String(year))) {
        paidYtd += Number(i.paid);
      }
    }

    const dists = await this.listDistributions(ctx, { page: 1, pageSize: 200, fundId: opts.fundId });
    let totalDistributions = 0;
    let upcomingDistributionNotices = 0;
    let upcomingDistributionAmount = 0;
    for (const d of dists.items || []) {
      totalDistributions += Number(d.amount || 0);
      if (["DECLARED", "NOTIFIED", "ISSUED"].includes(String(d.status || "").toUpperCase())) {
        upcomingDistributionNotices += 1;
        upcomingDistributionAmount += Number(d.amount || 0);
      }
    }

    return {
      openCount,
      outstanding: moneyStr(outstanding),
      overdue: moneyStr(overdue),
      paidYtd: moneyStr(paidYtd),
      paidCallCount,
      dueSoonCount,
      dueSoonAmount: moneyStr(dueSoonAmount),
      totalDistributions: moneyStr(totalDistributions),
      upcomingDistributionNotices: {
        count: upcomingDistributionNotices,
        amount: moneyStr(upcomingDistributionAmount),
      },
      currencyCode: "USD",
    };
  }

  static async acknowledge(ctx: LpPortalContext, allocationId: string, userId?: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const alloc = await this.loadAllocation(ctx, allocationId);
    const status = mapPortalCallStatus(alloc, alloc.capitalCall, alloc.portalState);

    if (status === "CANCELLED") {
      throw new LpPortalError("LP_CALL_NOT_ISSUED", "Capital call is cancelled", 409);
    }
    if (!isCapitalCallVisible(alloc.capitalCall)) {
      throw new LpPortalError("LP_CALL_NOT_ISSUED", "Capital call is not issued", 409);
    }
    if (alloc.portalState?.acknowledgedAt) {
      throw new LpPortalError("LP_CALL_ALREADY_ACKNOWLEDGED", "Already acknowledged", 409);
    }

    const now = new Date();
    const state = await db().lpCapitalCallPortalState.upsert({
      where: { capitalCallAllocationId: allocationId },
      create: {
        capitalCallAllocationId: allocationId,
        clientId: ctx.clientId,
        acknowledgedAt: now,
        acknowledgedById: userId || ctx.userId || null,
      },
      update: {
        acknowledgedAt: now,
        acknowledgedById: userId || ctx.userId || null,
      },
    });

    // Never touch amountPaid or allocation.status
    return { acknowledgedAt: state.acknowledgedAt.toISOString() };
  }

  static async uploadPaymentConfirmation(
    ctx: LpPortalContext,
    allocationId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    opts: { amountClaimed?: number | string; notes?: string; userId?: string } = {}
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    await this.loadAllocation(ctx, allocationId);

    const dir = path.join(process.cwd(), "uploads", "lp-portal", "payment-confirmations", allocationId);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = String(file.originalname || "confirmation.bin").replace(/[^\w.\-]+/g, "_");
    const filename = `${Date.now()}_${safeName}`;
    const storagePath = path.join(dir, filename);
    fs.writeFileSync(storagePath, file.buffer);
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

    const row = await db().lpCapitalCallPaymentConfirmation.create({
      data: {
        capitalCallAllocationId: allocationId,
        clientId: ctx.clientId,
        uploadedById: opts.userId || ctx.userId || null,
        fileName: safeName,
        mimeType: file.mimetype || "application/octet-stream",
        storagePath: path.relative(process.cwd(), storagePath).replace(/\\/g, "/"),
        sha256,
        amountClaimed: opts.amountClaimed != null ? Number(opts.amountClaimed) : null,
        notes: opts.notes || null,
      },
    });

    return {
      id: row.id,
      fileName: row.fileName,
      sha256: row.sha256,
      amountClaimed: row.amountClaimed != null ? moneyStr(row.amountClaimed) : null,
      uploadedAt: row.createdAt.toISOString(),
    };
  }

  static async downloadNotice(ctx: LpPortalContext, allocationId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const alloc = await this.loadAllocation(ctx, allocationId);
    const detail = this.mapCallDetail(alloc);
    const text = [
      `CAPITAL CALL NOTICE`,
      `Fund: ${detail.fundName}`,
      `Call #: ${detail.callNo}`,
      `Issue Date: ${detail.issueDate}`,
      `Due Date: ${detail.dueDate}`,
      `Amount: ${detail.currencyCode} ${detail.amount}`,
      `Outstanding: ${detail.currencyCode} ${detail.outstanding}`,
      `Status: ${detail.status}`,
      ``,
      `Wiring instructions:`,
      detail.wiring?.raw ||
        [
          detail.wiring?.bankName,
          detail.wiring?.accountName,
          detail.wiring?.accountNumber,
          detail.wiring?.abaRouting,
          detail.wiring?.reference,
        ]
          .filter(Boolean)
          .join("\n") ||
        "(see fund administrator)",
      ``,
      `This is an investor notice stub. Final PDF may be attached via Document Centre.`,
    ].join("\n");

    const buffer = Buffer.from(text, "utf8");
    const filename = `capital-call-${detail.callNo || allocationId}-notice.txt`;
    return { buffer, filename, contentType: "text/plain; charset=utf-8" };
  }

  static async listCallDocuments(ctx: LpPortalContext, allocationId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    await this.loadAllocation(ctx, allocationId);

    const docs = await prisma.lpPortalDocument.findMany({
      where: {
        clientId: ctx.clientId,
        OR: [
          { sourceType: "CAPITAL_CALL", sourceRefId: allocationId },
          { sourceType: "CAPITAL_CALL_ALLOCATION", sourceRefId: allocationId },
        ],
      },
      orderBy: { publishedAt: "desc" },
    });

    return docs.map((d) => ({
      id: d.id,
      name: d.title,
      category: d.category,
      publishedDate: dateOnly(d.publishedAt),
      checksumSha256: d.sha256,
      status: d.publishedAt ? "PUBLISHED" : "DRAFT",
    }));
  }

  static async listDistributions(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);
    if (q.fundId) assertFundAccess(ctx, q.fundId);

    const rows = await prisma.distributionAllocation.findMany({
      where: {
        clientId: ctx.clientId,
        ...(q.fundId ? { distribution: { fundId: q.fundId } } : {}),
      },
      include: {
        distribution: {
          include: {
            fund: { select: { id: true, name: true } },
            currency: { select: { code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let items = rows
      .filter((r) => LpPortalAccessService.fundAllowed(ctx, r.distribution.fundId))
      .filter((r) => isDistributionVisible(r.distribution))
      .map((r) => this.mapDistSummary(r));

    if (q.from) items = items.filter((i) => !i.paymentDate || i.paymentDate >= q.from!);
    if (q.to) items = items.filter((i) => !i.paymentDate || i.paymentDate <= q.to!);

    const total = items.length;
    return {
      items: items.slice(q.skip, q.skip + q.take),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  static async getDistribution(ctx: LpPortalContext, allocationId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const row = await this.loadDistAllocation(ctx, allocationId);
    return this.mapDistDetail(row);
  }

  static async downloadDistribution(ctx: LpPortalContext, allocationId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const detail = await this.getDistribution(ctx, allocationId);
    const text = [
      `DISTRIBUTION NOTICE`,
      `Reference: ${detail.reference}`,
      `Fund: ${detail.fundId}`,
      `Payment Date: ${detail.paymentDate}`,
      `Type: ${detail.type}`,
      `Gross: ${detail.currencyCode} ${detail.gross}`,
      `Net Paid: ${detail.currencyCode} ${detail.netPaid}`,
      `Status: ${detail.status}`,
    ].join("\n");
    return {
      buffer: Buffer.from(text, "utf8"),
      filename: `distribution-${detail.reference || allocationId}.txt`,
      contentType: "text/plain; charset=utf-8",
    };
  }

  static async downloadDistributionStatement(
    ctx: LpPortalContext,
    opts: { fundId?: string; asOfDate?: string }
  ) {
    const list = await this.listDistributions(ctx, {
      fundId: opts.fundId,
      page: 1,
      pageSize: 200,
    });
    const asOf = opts.asOfDate || new Date().toISOString().slice(0, 10);
    const lines = [
      "Distribution statement",
      `As of: ${asOf}`,
      `Fund: ${opts.fundId || "ALL"}`,
      "",
      ...list.items.map(
        (d: any) =>
          `${d.id}\t${d.distributionDate || ""}\t${d.grossAmount || d.shareAmount || ""}\t${d.status || ""}`
      ),
    ];
    return {
      buffer: Buffer.from(lines.join("\n"), "utf8"),
      filename: `distribution-statement-${asOf}.txt`,
      contentType: "text/plain; charset=utf-8",
    };
  }

  // —— internals ——

  private static async loadAllocation(ctx: LpPortalContext, allocationId: string) {
    const alloc = await prisma.capitalCallAllocation.findUnique({
      where: { id: allocationId },
      include: {
        capitalCall: {
          include: {
            fund: { select: { id: true, name: true } },
            currency: { select: { code: true } },
          },
        },
        payments: { orderBy: { recordedAt: "asc" } },
      },
    });
    if (!alloc || alloc.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Capital call not found", 404);
    }
    if (!LpPortalAccessService.fundAllowed(ctx, alloc.capitalCall.fundId)) {
      throw new LpPortalError("LP_NOT_FOUND", "Capital call not found", 404);
    }
    if (!isCapitalCallVisible(alloc.capitalCall)) {
      throw new LpPortalError("LP_NOT_FOUND", "Capital call not found", 404);
    }
    const portalState = await db().lpCapitalCallPortalState.findUnique({
      where: { capitalCallAllocationId: allocationId },
    });
    return { ...alloc, portalState };
  }

  private static async loadDistAllocation(ctx: LpPortalContext, allocationId: string) {
    const row = await prisma.distributionAllocation.findUnique({
      where: { id: allocationId },
      include: {
        distribution: {
          include: {
            fund: { select: { id: true, name: true } },
            currency: { select: { code: true } },
          },
        },
      },
    });
    if (!row || row.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Distribution not found", 404);
    }
    if (!LpPortalAccessService.fundAllowed(ctx, row.distribution.fundId)) {
      throw new LpPortalError("LP_NOT_FOUND", "Distribution not found", 404);
    }
    if (!isDistributionVisible(row.distribution)) {
      throw new LpPortalError("LP_NOT_FOUND", "Distribution not found", 404);
    }
    return row;
  }

  private static mapCallSummary(alloc: any) {
    const cc = alloc.capitalCall;
    const amount = Number(alloc.currentCallAmount.toString());
    const paid = Number(alloc.amountPaid.toString());
    const outstanding = Math.max(0, amount - paid);
    const status = mapPortalCallStatus(alloc, cc, alloc.portalState);
    return {
      id: alloc.id,
      callNo: this.deriveCallNo(cc),
      fundId: cc.fundId,
      fundName: cc.fund?.name ?? null,
      issueDate: dateOnly(cc.noticesSentAt || cc.transactionDate),
      dueDate: dateOnly(cc.paymentDueDate),
      currencyCode: cc.currency?.code || "USD",
      amount: moneyStr(amount),
      paid: moneyStr(paid),
      outstanding: moneyStr(outstanding),
      status,
      acknowledgedAt: alloc.portalState?.acknowledgedAt?.toISOString?.() ?? null,
    };
  }

  private static mapCallDetail(alloc: any) {
    const summary = this.mapCallSummary(alloc);
    const wiring = parseWiring(alloc.capitalCall.bankInstructions);
    const amount = Number(alloc.currentCallAmount.toString());
    const paid = Number(alloc.amountPaid.toString());
    const ackAt = alloc.portalState?.acknowledgedAt ?? null;
    const paidAt =
      paid >= amount && alloc.payments?.length
        ? alloc.payments[alloc.payments.length - 1].recordedAt
        : paid > 0 && alloc.payments?.length
          ? alloc.payments[alloc.payments.length - 1].recordedAt
          : null;

    return {
      ...summary,
      wiring: {
        bankName: wiring.bankName,
        accountName: wiring.accountName,
        accountNumber: wiring.accountNumber,
        accountNumberMasked: wiring.accountNumberMasked,
        abaRouting: wiring.abaRouting,
        reference:
          wiring.reference ||
          `${summary.fundName || "Fund"} Call ${summary.callNo} – Investor`,
        raw: wiring.raw,
      },
      timeline: [
        {
          code: "ISSUED",
          at: alloc.capitalCall.noticesSentAt?.toISOString?.() ||
            alloc.capitalCall.transactionDate?.toISOString?.() ||
            null,
          completed: true,
        },
        {
          code: "ACKNOWLEDGED",
          at: ackAt?.toISOString?.() ?? null,
          completed: Boolean(ackAt),
        },
        {
          code: "PAYMENT_RECEIVED",
          at: paidAt?.toISOString?.() ?? null,
          completed: paid > 0,
        },
        {
          code: "CLOSED",
          at: paid >= amount && paidAt ? paidAt.toISOString() : null,
          completed: paid >= amount && amount > 0,
        },
      ],
    };
  }

  private static mapDistSummary(row: any) {
    const d = row.distribution;
    const gross = Number(row.shareAmount.toString());
    const net = Number(row.amountPaid.toString()) || gross;
    const adjustments = Math.max(0, gross - net);
    return {
      id: row.id,
      reference: `DIST-${String(row.id).slice(-6).toUpperCase()}`,
      fundId: d.fundId,
      fundName: d.fund?.name ?? null,
      paymentDate: dateOnly(d.distributionDate),
      type: mapDistributionType(d.source),
      currencyCode: d.currency?.code || "USD",
      gross: moneyStr(gross),
      adjustments: moneyStr(adjustments),
      netPaid: moneyStr(net),
      status: String(row.status || "PENDING").toUpperCase() === "PAID" ? "PAID" : String(row.status || "PENDING").toUpperCase(),
      destinationBankMasked: null,
      documentId: null,
    };
  }

  private static mapDistDetail(row: any) {
    return this.mapDistSummary(row);
  }

  private static deriveCallNo(cc: any): number | string {
    // Use transaction date ordinal hash as a stable display number when none stored
    if (cc.callNumber != null) return cc.callNumber;
    const iso = dateOnly(cc.transactionDate) || "";
    const parts = iso.split("-");
    if (parts.length === 3) return Number(parts[1] + parts[2]) || iso;
    return String(cc.id).slice(-4).toUpperCase();
  }
}
