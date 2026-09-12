// @ts-nocheck
import { prisma } from "../../utils/database";

const db = () => prisma as any;

/**
 * The four payroll domains that had no backend at all.
 *
 * Inputs & Validation, Pay Groups & Calendar, Onboarding and the RFQ half of Vendors were each
 * rendering the runtime's fixtures because there was nothing to call — invented batch counts,
 * invented pay calendars, invented candidates, invented bids. `payroll-v6-backend-asks.md` §2.2,
 * §2.4, §2.5 and §2.8 record them as asks; these are the reads and writes behind them.
 *
 * Nothing here invents a figure. Every count is derived from rows that exist, and an empty domain
 * returns an empty list with zeroed totals — which is the honest answer, and the whole point.
 */

const INPUT_ROW_STATUSES = new Set(["VALID", "ERROR", "RESOLVED"]);
const BATCH_STATUSES = new Set(["DRAFT", "VALIDATED", "COMMITTED", "REJECTED"]);
const PERIOD_STATUSES = new Set(["PLANNED", "OPEN", "LOCKED", "PAID"]);
const CANDIDATE_STATUSES = new Set([
  "INVITED",
  "DOCUMENTS",
  "CONTRACT",
  "PAYROLL_SETUP",
  "COMPLETE",
  "WITHDRAWN",
]);
const RFQ_STATUSES = new Set(["DRAFT", "OPEN", "EVALUATING", "AWARDED", "CANCELLED"]);

function bad(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

function ref(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Inputs & Validation  (asks §2.2)
// ---------------------------------------------------------------------------

export class PayrollInputService {
  /** Batches with their row tallies. The screen's "N of M valid" comes from here. */
  static async listBatches(query: Record<string, unknown> = {}) {
    const status = query.status ? String(query.status).toUpperCase() : undefined;
    const take = Math.min(200, Math.max(1, Number(query.limit ?? 50) || 50));
    const rows = await db().payrollInputBatch.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take,
    });

    const items = rows.map((b: any) => ({
      id: b.id,
      reference: b.reference,
      periodLabel: b.periodLabel,
      payrollRunId: b.payrollRunId,
      sourceFileName: b.sourceFileName,
      status: b.status,
      totalRows: b.totalRows,
      validRows: b.validRows,
      errorRows: b.errorRows,
      committedAt: b.committedAt,
      createdAt: b.createdAt,
    }));

    return {
      items,
      total: items.length,
      summary: {
        batches: items.length,
        totalRows: items.reduce((s: number, b: any) => s + b.totalRows, 0),
        validRows: items.reduce((s: number, b: any) => s + b.validRows, 0),
        errorRows: items.reduce((s: number, b: any) => s + b.errorRows, 0),
        awaitingCommit: items.filter((b: any) => b.status === "VALIDATED").length,
      },
    };
  }

  static async getBatch(id: string) {
    const b = await db().payrollInputBatch.findUnique({
      where: { id: String(id) },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (!b) throw bad("Input batch not found", 404);
    return {
      id: b.id,
      reference: b.reference,
      periodLabel: b.periodLabel,
      status: b.status,
      totalRows: b.totalRows,
      validRows: b.validRows,
      errorRows: b.errorRows,
      rows: (b.rows ?? []).map((r: any) => ({
        id: r.id,
        rowNumber: r.rowNumber,
        employeeNumber: r.employeeNumber,
        employeeName: r.employeeName,
        inputType: r.inputType,
        amount: r.amount == null ? null : Number(r.amount.toString()),
        currencyCode: r.currencyCode,
        status: r.status,
        errorMessage: r.errorMessage,
        resolvedAt: r.resolvedAt,
      })),
    };
  }

  /**
   * Create a batch and validate its rows in one step.
   *
   * Validation is real, not a label: a row is an ERROR when it has no employee number, when that
   * number matches no employee, or when the amount is missing or not a number. The tallies the
   * screen shows are counted from the outcome.
   */
  static async createBatch(params: {
    periodLabel: string;
    sourceFileName?: string | null;
    payrollRunId?: string | null;
    uploadedById?: string | null;
    rows: Array<Record<string, unknown>>;
  }) {
    const periodLabel = String(params.periodLabel ?? "").trim();
    if (!periodLabel) throw bad("periodLabel is required");
    const incoming = Array.isArray(params.rows) ? params.rows : [];
    if (!incoming.length) throw bad("At least one input row is required");

    const numbers = incoming
      .map((r) => (r.employeeNumber == null ? "" : String(r.employeeNumber).trim()))
      .filter(Boolean);
    const known = new Set<string>(
      numbers.length
        ? (
            await db().employee.findMany({
              where: { employeeNumber: { in: numbers } },
              select: { employeeNumber: true },
            })
          ).map((e: any) => e.employeeNumber)
        : []
    );

    const prepared = incoming.map((r, i) => {
      const employeeNumber = r.employeeNumber == null ? "" : String(r.employeeNumber).trim();
      const amountRaw = r.amount;
      const amount =
        amountRaw == null || String(amountRaw).trim() === "" ? null : Number(amountRaw);
      let errorMessage: string | null = null;
      if (!employeeNumber) errorMessage = "Employee number is missing";
      else if (!known.has(employeeNumber)) errorMessage = `No employee matches ${employeeNumber}`;
      else if (amount == null || !Number.isFinite(amount)) errorMessage = "Amount is missing or not a number";
      return {
        rowNumber: Number(r.rowNumber) || i + 1,
        employeeNumber: employeeNumber || null,
        employeeName: r.employeeName == null ? null : String(r.employeeName),
        inputType: String(r.inputType ?? "OTHER").toUpperCase(),
        amount: amount != null && Number.isFinite(amount) ? amount : null,
        currencyCode: String(r.currencyCode ?? "USD").toUpperCase(),
        status: errorMessage ? "ERROR" : "VALID",
        errorMessage,
      };
    });

    const errorRows = prepared.filter((r) => r.status === "ERROR").length;
    const batch = await db().payrollInputBatch.create({
      data: {
        reference: ref("PIB"),
        periodLabel,
        payrollRunId: params.payrollRunId ?? null,
        sourceFileName: params.sourceFileName ?? null,
        uploadedById: params.uploadedById ?? null,
        status: errorRows ? "DRAFT" : "VALIDATED",
        totalRows: prepared.length,
        validRows: prepared.length - errorRows,
        errorRows,
        rows: { create: prepared },
      },
    });
    return this.getBatch(batch.id);
  }

  /** Resolve one error row. Recounts the batch from its rows rather than adjusting a counter. */
  static async resolveRow(rowId: string, params: { amount?: unknown; resolvedById?: string | null }) {
    const row = await db().payrollInputRow.findUnique({ where: { id: String(rowId) } });
    if (!row) throw bad("Input row not found", 404);

    const data: Record<string, unknown> = {
      status: "RESOLVED",
      errorMessage: null,
      resolvedById: params.resolvedById ?? null,
      resolvedAt: new Date(),
    };
    if (params.amount != null && String(params.amount).trim() !== "") {
      const amount = Number(params.amount);
      if (!Number.isFinite(amount)) throw bad("amount must be a number");
      data.amount = amount;
    }
    await db().payrollInputRow.update({ where: { id: row.id }, data });

    const siblings = await db().payrollInputRow.findMany({
      where: { batchId: row.batchId },
      select: { status: true },
    });
    const errorRows = siblings.filter((r: any) => r.status === "ERROR").length;
    await db().payrollInputBatch.update({
      where: { id: row.batchId },
      data: {
        errorRows,
        validRows: siblings.length - errorRows,
        totalRows: siblings.length,
        status: errorRows ? "DRAFT" : "VALIDATED",
      },
    });
    return this.getBatch(row.batchId);
  }

  /** Commit a batch. Refused while any row is still in error — that is the point of validation. */
  static async commitBatch(id: string) {
    const b = await db().payrollInputBatch.findUnique({ where: { id: String(id) } });
    if (!b) throw bad("Input batch not found", 404);
    if (b.status === "COMMITTED") throw bad("Batch is already committed");
    if (b.errorRows > 0) throw bad(`Cannot commit: ${b.errorRows} row(s) still in error`);
    await db().payrollInputBatch.update({
      where: { id: b.id },
      data: { status: "COMMITTED", committedAt: new Date() },
    });
    return this.getBatch(b.id);
  }
}

// ---------------------------------------------------------------------------
// Pay groups and calendar  (asks §2.4)
// ---------------------------------------------------------------------------

export class PayrollCalendarService {
  static async listGroups() {
    const groups = await db().payrollPayGroup.findMany({
      orderBy: { name: "asc" },
      include: { periods: { orderBy: { periodStart: "desc" } } },
    });
    const items = groups.map((g: any) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      frequency: g.frequency,
      payDayOfMonth: g.payDayOfMonth,
      currencyCode: g.currencyCode,
      isActive: g.isActive,
      periodCount: g.periods.length,
      openPeriods: g.periods.filter((p: any) => p.status === "OPEN").length,
      nextPayDate:
        g.periods
          .filter((p: any) => p.payDate && new Date(p.payDate) >= new Date())
          .sort((a: any, b: any) => new Date(a.payDate).getTime() - new Date(b.payDate).getTime())[0]
          ?.payDate ?? null,
      periods: g.periods.map((p: any) => ({
        id: p.id,
        periodLabel: p.periodLabel,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        cutoffDate: p.cutoffDate,
        payDate: p.payDate,
        status: p.status,
      })),
    }));
    return {
      items,
      total: items.length,
      summary: {
        groups: items.length,
        active: items.filter((g: any) => g.isActive).length,
        periods: items.reduce((s: number, g: any) => s + g.periodCount, 0),
        openPeriods: items.reduce((s: number, g: any) => s + g.openPeriods, 0),
      },
    };
  }

  static async createGroup(params: Record<string, unknown>) {
    const name = String(params.name ?? "").trim();
    const code = String(params.code ?? "").trim().toUpperCase();
    if (!name) throw bad("name is required");
    if (!code) throw bad("code is required");
    const frequency = String(params.frequency ?? "MONTHLY").toUpperCase();
    if (!["MONTHLY", "FORTNIGHTLY", "WEEKLY"].includes(frequency)) {
      throw bad("frequency must be MONTHLY, FORTNIGHTLY or WEEKLY");
    }
    const existing = await db().payrollPayGroup.findUnique({ where: { code } });
    if (existing) throw bad(`A pay group with code ${code} already exists`, 409);

    await db().payrollPayGroup.create({
      data: {
        name,
        code,
        frequency,
        payDayOfMonth: params.payDayOfMonth == null ? null : Number(params.payDayOfMonth),
        currencyCode: String(params.currencyCode ?? "USD").toUpperCase(),
        isActive: params.isActive == null ? true : !!params.isActive,
      },
    });
    return this.listGroups();
  }

  static async updateGroup(id: string, params: Record<string, unknown>) {
    const g = await db().payrollPayGroup.findUnique({ where: { id: String(id) } });
    if (!g) throw bad("Pay group not found", 404);
    const data: Record<string, unknown> = {};
    if (params.name != null) data.name = String(params.name).trim();
    if (params.frequency != null) data.frequency = String(params.frequency).toUpperCase();
    if (params.payDayOfMonth !== undefined) {
      data.payDayOfMonth = params.payDayOfMonth == null ? null : Number(params.payDayOfMonth);
    }
    if (params.currencyCode != null) data.currencyCode = String(params.currencyCode).toUpperCase();
    if (params.isActive != null) data.isActive = !!params.isActive;
    if (!Object.keys(data).length) throw bad("Nothing to update");
    await db().payrollPayGroup.update({ where: { id: g.id }, data });
    return this.listGroups();
  }

  static async upsertPeriod(payGroupId: string, params: Record<string, unknown>) {
    const g = await db().payrollPayGroup.findUnique({ where: { id: String(payGroupId) } });
    if (!g) throw bad("Pay group not found", 404);
    const periodLabel = String(params.periodLabel ?? "").trim();
    if (!periodLabel) throw bad("periodLabel is required");
    const periodStart = params.periodStart ? new Date(String(params.periodStart)) : null;
    const periodEnd = params.periodEnd ? new Date(String(params.periodEnd)) : null;
    if (!periodStart || Number.isNaN(periodStart.getTime())) throw bad("periodStart is required");
    if (!periodEnd || Number.isNaN(periodEnd.getTime())) throw bad("periodEnd is required");
    if (periodEnd < periodStart) throw bad("periodEnd cannot be before periodStart");
    const status = String(params.status ?? "PLANNED").toUpperCase();
    if (!PERIOD_STATUSES.has(status)) {
      throw bad(`status must be one of: ${[...PERIOD_STATUSES].join(", ")}`);
    }

    const data = {
      periodStart,
      periodEnd,
      cutoffDate: params.cutoffDate ? new Date(String(params.cutoffDate)) : null,
      payDate: params.payDate ? new Date(String(params.payDate)) : null,
      status,
    };
    await db().payrollCalendarPeriod.upsert({
      where: { payGroupId_periodLabel: { payGroupId: g.id, periodLabel } },
      create: { payGroupId: g.id, periodLabel, ...data },
      update: data,
    });
    return this.listGroups();
  }
}

// ---------------------------------------------------------------------------
// Onboarding  (asks §2.8)
// ---------------------------------------------------------------------------

export class PayrollOnboardingService {
  static async list(query: Record<string, unknown> = {}) {
    const status = query.status ? String(query.status).toUpperCase() : undefined;
    const rows = await db().payrollOnboardingCandidate.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, Number(query.limit ?? 100) || 100)),
    });
    const items = rows.map((c: any) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      position: c.position,
      department: c.department,
      startDate: c.startDate,
      payGroupId: c.payGroupId,
      status: c.status,
      checklist: c.checklist ?? null,
      employeeId: c.employeeId,
      completedAt: c.completedAt,
    }));
    const byStatus: Record<string, number> = {};
    for (const s of CANDIDATE_STATUSES) byStatus[s] = items.filter((i: any) => i.status === s).length;
    return {
      items,
      total: items.length,
      summary: {
        candidates: items.length,
        inProgress: items.filter((i: any) => !["COMPLETE", "WITHDRAWN"].includes(i.status)).length,
        complete: byStatus.COMPLETE ?? 0,
        byStatus,
      },
    };
  }

  static async create(params: Record<string, unknown>) {
    const firstName = String(params.firstName ?? "").trim();
    const lastName = String(params.lastName ?? "").trim();
    if (!firstName || !lastName) throw bad("firstName and lastName are required");
    await db().payrollOnboardingCandidate.create({
      data: {
        firstName,
        lastName,
        email: params.email ? String(params.email).trim().toLowerCase() : null,
        position: params.position ? String(params.position) : null,
        department: params.department ? String(params.department) : null,
        startDate: params.startDate ? new Date(String(params.startDate)) : null,
        payGroupId: params.payGroupId ? String(params.payGroupId) : null,
        checklist: params.checklist ?? null,
        createdById: params.createdById ? String(params.createdById) : null,
      },
    });
    return this.list();
  }

  static async update(id: string, params: Record<string, unknown>) {
    const c = await db().payrollOnboardingCandidate.findUnique({ where: { id: String(id) } });
    if (!c) throw bad("Candidate not found", 404);
    const data: Record<string, unknown> = {};
    if (params.status != null) {
      const status = String(params.status).toUpperCase();
      if (!CANDIDATE_STATUSES.has(status)) {
        throw bad(`status must be one of: ${[...CANDIDATE_STATUSES].join(", ")}`);
      }
      data.status = status;
      if (status === "COMPLETE") data.completedAt = new Date();
    }
    for (const f of ["position", "department", "email"]) {
      if (params[f] != null) data[f] = String(params[f]);
    }
    if (params.startDate != null) data.startDate = new Date(String(params.startDate));
    if (params.checklist !== undefined) data.checklist = params.checklist;
    if (params.payGroupId !== undefined) {
      data.payGroupId = params.payGroupId ? String(params.payGroupId) : null;
    }
    if (!Object.keys(data).length) throw bad("Nothing to update");
    await db().payrollOnboardingCandidate.update({ where: { id: c.id }, data });
    return this.list();
  }
}

// ---------------------------------------------------------------------------
// RFQs and quotations  (asks §2.5, the half the vendor registry did not cover)
// ---------------------------------------------------------------------------

export class PayrollRfqService {
  static async list(query: Record<string, unknown> = {}) {
    const status = query.status ? String(query.status).toUpperCase() : undefined;
    const rows = await db().payrollRfq.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, Number(query.limit ?? 50) || 50)),
      include: { bids: { orderBy: { createdAt: "asc" } } },
    });

    const now = Date.now();
    const items = rows.map((r: any) => {
      const bids = (r.bids ?? []).map((b: any) => {
        const t = b.technicalScore == null ? null : Number(b.technicalScore.toString());
        const c = b.commercialScore == null ? null : Number(b.commercialScore.toString());
        const k = b.complianceScore == null ? null : Number(b.complianceScore.toString());
        const scored = [t, c, k].filter((x) => x != null) as number[];
        return {
          id: b.id,
          vendorId: b.vendorId,
          vendorName: b.vendorName,
          amount: b.amount == null ? null : Number(b.amount.toString()),
          currencyCode: b.currencyCode,
          technicalScore: t,
          commercialScore: c,
          complianceScore: k,
          // Null rather than 0 when nothing has been scored: an unscored bid is not a zero-scoring one.
          weightedScore: scored.length
            ? Number((scored.reduce((s, x) => s + x, 0) / scored.length).toFixed(2))
            : null,
          status: b.status,
          submittedAt: b.submittedAt,
        };
      });
      const submitted = bids.filter((b: any) => b.status !== "INVITED");
      return {
        id: r.id,
        reference: r.reference,
        title: r.title,
        category: r.category,
        status: r.status,
        issueDate: r.issueDate,
        closingDate: r.closingDate,
        awardedBidId: r.awardedBidId,
        invitedCount: bids.length,
        bidCount: submitted.length,
        closesInDays:
          r.closingDate != null
            ? Math.ceil((new Date(r.closingDate).getTime() - now) / 86400000)
            : null,
        bids,
      };
    });

    return {
      items,
      total: items.length,
      summary: {
        open: items.filter((r: any) => r.status === "OPEN").length,
        evaluating: items.filter((r: any) => r.status === "EVALUATING").length,
        awarded: items.filter((r: any) => r.status === "AWARDED").length,
        bidsReceived: items.reduce((s: number, r: any) => s + r.bidCount, 0),
        closingSoon: items.filter(
          (r: any) => r.closesInDays != null && r.closesInDays >= 0 && r.closesInDays <= 7
        ).length,
      },
    };
  }

  static async create(params: Record<string, unknown>) {
    const title = String(params.title ?? "").trim();
    if (!title) throw bad("title is required");
    const status = String(params.status ?? "DRAFT").toUpperCase();
    if (!RFQ_STATUSES.has(status)) {
      throw bad(`status must be one of: ${[...RFQ_STATUSES].join(", ")}`);
    }
    const invited = Array.isArray(params.invitedVendors) ? params.invitedVendors : [];
    await db().payrollRfq.create({
      data: {
        reference: ref("RFQ"),
        title,
        category: params.category ? String(params.category) : null,
        status,
        issueDate: params.issueDate ? new Date(String(params.issueDate)) : null,
        closingDate: params.closingDate ? new Date(String(params.closingDate)) : null,
        createdById: params.createdById ? String(params.createdById) : null,
        bids: invited.length
          ? {
              create: invited.map((v: any) => ({
                vendorId: v.vendorId ? String(v.vendorId) : null,
                vendorName: String(v.vendorName ?? v.name ?? "Unnamed vendor"),
              })),
            }
          : undefined,
      },
    });
    return this.list();
  }

  static async recordBid(rfqId: string, params: Record<string, unknown>) {
    const r = await db().payrollRfq.findUnique({ where: { id: String(rfqId) } });
    if (!r) throw bad("RFQ not found", 404);
    const vendorName = String(params.vendorName ?? "").trim();
    if (!vendorName) throw bad("vendorName is required");
    const num = (v: unknown) => (v == null || String(v).trim() === "" ? null : Number(v));
    await db().payrollRfqBid.create({
      data: {
        rfqId: r.id,
        vendorId: params.vendorId ? String(params.vendorId) : null,
        vendorName,
        amount: num(params.amount),
        currencyCode: String(params.currencyCode ?? "USD").toUpperCase(),
        technicalScore: num(params.technicalScore),
        commercialScore: num(params.commercialScore),
        complianceScore: num(params.complianceScore),
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    return this.list();
  }

  static async award(rfqId: string, bidId: string) {
    const bid = await db().payrollRfqBid.findUnique({ where: { id: String(bidId) } });
    if (!bid || bid.rfqId !== String(rfqId)) throw bad("Bid not found on this RFQ", 404);
    await db().$transaction([
      db().payrollRfqBid.updateMany({ where: { rfqId: String(rfqId) }, data: { status: "REJECTED" } }),
      db().payrollRfqBid.update({ where: { id: bid.id }, data: { status: "AWARDED" } }),
      db().payrollRfq.update({
        where: { id: String(rfqId) },
        data: { status: "AWARDED", awardedBidId: bid.id },
      }),
    ]);
    return this.list();
  }
}
