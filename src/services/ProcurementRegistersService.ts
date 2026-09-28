// @ts-nocheck
import { prisma } from "../utils/database";
import { remoteUploadService } from "./RemoteUploadService";
import AuditService from "./AuditService";

/**
 * Procurement V23 registers: document vault, contracts and annual procurement plans.
 * Tables: scripts/run-procurement-registers-migration.ts. Routes: src/routes/procurementRegistersRoutes.ts.
 *
 * Errors are thrown as RegisterError with an HTTP status so the controller can answer 400/404/409
 * rather than 500 for a request that is at fault.
 */
export class RegisterError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const bad = (message: string) => new RegisterError(400, message);
const notFound = (what: string) => new RegisterError(404, `${what} not found`);
const conflict = (message: string) => new RegisterError(409, message);

const str = (v: any): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

const money = (v: any, field: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw bad(`${field} must be a number of zero or more`);
  return Math.round(n * 100) / 100;
};

const date = (v: any, field: string): Date | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`${field} must be a valid date`);
  return d;
};

/** The values a change replaced: the current value of every field the change sets. */
const previous = (existing: any, data: Record<string, any>) => Object.fromEntries(Object.keys(data).map((k) => [k, existing?.[k] ?? null]));

async function audit(userId: string | undefined, action: string, entityType: string, entityId: string, newValues: any, oldValues?: any) {
  try {
    await AuditService.log({ userId, action, entityType, entityId, newValues, oldValues });
  } catch (err) {
    console.error(`audit ${entityType} ${action}:`, (err as Error)?.message || err);
  }
}

/** Next "<PREFIX>-<year>-<seq>" number, retried by the caller on a unique collision. */
async function nextNumber(model: "procurementContract" | "procurementPlan", field: string, prefix: string, width: number, forYear?: number) {
  const year = forYear || new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const last = await prisma[model].findFirst({
    where: { [field]: { startsWith: stem } },
    orderBy: { [field]: "desc" },
    select: { [field]: true },
  });
  const seq = last ? Number(String(last[field]).slice(stem.length)) + 1 : 1;
  return `${stem}${String(Number.isFinite(seq) ? seq : 1).padStart(width, "0")}`;
}

async function createWithNumber<T>(make: (n: string) => Promise<T>, model, field, prefix, width, forYear?: number): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const n = await nextNumber(model, field, prefix, width, forYear);
    try {
      return await make(n);
    } catch (err: any) {
      if (err?.code === "P2002") continue;
      throw err;
    }
  }
  throw conflict("Could not allocate a register number; try again");
}

// ------------------------------------------------------------------------------------ documents

/** The remote upload type that maps to a durable folder (see PerformanceDocumentService). */
const DOCUMENT_UPLOAD_TYPE = "application-documents";

export async function storeFile(file: { buffer: Buffer; originalname: string; mimetype?: string; size?: number }) {
  const safe = String(file.originalname || "document").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  try {
    const stored = await remoteUploadService.uploadSingleFile(
      {
        buffer: file.buffer,
        originalname: `${Date.now()}-${safe}`,
        mimetype: file.mimetype || "application/octet-stream",
        size: file.size ?? file.buffer.length,
      },
      DOCUMENT_UPLOAD_TYPE
    );
    // Every file stored for a receipt, requisition attachment or AI reading is an audited file upload, whoever asked.
    await audit(undefined, "FILE_UPLOAD", "StoredFile", stored.filePath, { name: file.originalname, mimeType: file.mimetype ?? null, sizeBytes: file.size ?? file.buffer.length });
    return stored;
  } catch (err: any) {
    throw new RegisterError(502, `The file could not be stored: ${err?.message || err}`);
  }
}

function nextVersion(v: string): string {
  const m = String(v || "").match(/^v?(\d+)(?:\.(\d+))?$/i);
  return m ? `v${Number(m[1]) + 1}.0` : "v2.0";
}

// The vault itself (formats, versions, preview, related record, audit) lives in ProcurementDocumentService.
export { ProcurementDocuments } from "./ProcurementDocumentService";

// ------------------------------------------------------------------------------------ contracts

const withContractState = (c: any, vendors: Map<string, string>) => {
  const expired = c.status === "ACTIVE" && c.endDate && new Date(c.endDate).getTime() < Date.now();
  return {
    ...c,
    value: Number(c.value),
    vendorName: vendors.get(c.vendorId) ?? null,
    effectiveStatus: expired ? "EXPIRED" : c.status,
  };
};

export const ProcurementContracts = {
  async list() {
    const rows = await prisma.procurementContract.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
    const vendors = vendorIds.length
      ? await prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(vendors.map((v) => [v.id, v.name]));
    return rows.map((r) => withContractState(r, names));
  },

  async create(body: any, userId: string) {
    const title = str(body.title);
    if (!title) throw bad("A contract title is required");
    let vendorId = str(body.vendorId);
    const quotationId = str(body.quotationId);
    let rfqNumber = str(body.rfqNumber);
    let purchaseOrderId = str(body.purchaseOrderId);
    if (quotationId) {
      const q = await prisma.vendorQuotation.findUnique({
        where: { id: quotationId },
        select: { id: true, status: true, vendorId: true, rfqNumber: true, quotationNumber: true },
      });
      if (!q) throw notFound("Quotation");
      if (String(q.status).toUpperCase() !== "ACCEPTED") throw bad(`${q.quotationNumber} has not been awarded, so no contract can follow it`);
      const already = await prisma.procurementContract.findFirst({ where: { quotationId, status: { not: "TERMINATED" } }, select: { contractNumber: true } });
      if (already) throw conflict(`${q.quotationNumber} already has contract ${already.contractNumber}`);
      vendorId = vendorId ?? q.vendorId ?? undefined;
      if (q.vendorId && vendorId !== q.vendorId) throw bad("The vendor does not match the awarded quotation");
      rfqNumber = rfqNumber ?? q.rfqNumber ?? undefined;
      if (!purchaseOrderId) {
        const po = await prisma.purchaseOrder.findFirst({ where: { quotationId }, select: { id: true } });
        purchaseOrderId = po?.id;
      }
    }
    if (!vendorId) throw bad("Select the vendor");
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, isBlacklisted: true, name: true } });
    if (!vendor) throw notFound("Vendor");
    if (vendor.isBlacklisted) throw bad(`${vendor.name} is blacklisted and cannot be contracted`);
    const startDate = date(body.startDate, "startDate");
    const endDate = date(body.endDate, "endDate");
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) throw bad("The end date cannot be before the start date");
    const value = money(body.value ?? 0, "value");

    const contract = await createWithNumber(
      (contractNumber) =>
        prisma.procurementContract.create({
          data: {
            contractNumber,
            title: title.slice(0, 255),
            vendorId,
            quotationId: quotationId ?? null,
            purchaseOrderId: purchaseOrderId ?? null,
            rfqNumber: rfqNumber ?? null,
            value,
            currencyCode: str(body.currencyCode) ?? null,
            startDate,
            endDate,
            paymentTerms: str(body.paymentTerms) ?? null,
            scope: str(body.scope) ?? null,
            createdById: userId,
          },
        }),
      "procurementContract",
      "contractNumber",
      "CTR",
      4
    );
    await audit(userId, "CREATE", "ProcurementContract", contract.id, { contractNumber: contract.contractNumber, vendorId, value });
    return withContractState(contract, new Map([[vendor.id, vendor.name]]));
  },

  async update(id: string, body: any, userId: string) {
    const existing = await prisma.procurementContract.findUnique({ where: { id } });
    if (!existing) throw notFound("Contract");
    if (existing.status !== "DRAFT") throw conflict(`${existing.contractNumber} is ${existing.status}; only a draft contract is edited`);
    const data: any = {};
    if (body.title !== undefined) {
      const t = str(body.title);
      if (!t) throw bad("A contract title is required");
      data.title = t.slice(0, 255);
    }
    if (body.value !== undefined) data.value = money(body.value, "value");
    if (body.currencyCode !== undefined) data.currencyCode = str(body.currencyCode) ?? null;
    if (body.startDate !== undefined) data.startDate = date(body.startDate, "startDate");
    if (body.endDate !== undefined) data.endDate = date(body.endDate, "endDate");
    if (body.paymentTerms !== undefined) data.paymentTerms = str(body.paymentTerms) ?? null;
    if (body.scope !== undefined) data.scope = str(body.scope) ?? null;
    const start = data.startDate !== undefined ? data.startDate : existing.startDate;
    const end = data.endDate !== undefined ? data.endDate : existing.endDate;
    if (start && end && new Date(end).getTime() < new Date(start).getTime()) throw bad("The end date cannot be before the start date");
    const updated = await prisma.procurementContract.update({ where: { id }, data });
    await audit(userId, "UPDATE", "ProcurementContract", id, data, previous(existing, data));
    const v = await prisma.vendor.findUnique({ where: { id: updated.vendorId }, select: { id: true, name: true } });
    return withContractState(updated, new Map(v ? [[v.id, v.name]] : []));
  },

  async setStatus(id: string, next: "ACTIVE" | "TERMINATED", userId: string) {
    const existing = await prisma.procurementContract.findUnique({ where: { id } });
    if (!existing) throw notFound("Contract");
    const allowed = next === "ACTIVE" ? ["DRAFT"] : ["DRAFT", "ACTIVE"];
    if (!allowed.includes(existing.status)) throw conflict(`${existing.contractNumber} is ${existing.status} and cannot become ${next}`);
    if (next === "ACTIVE" && (!existing.startDate || !existing.endDate)) throw bad("Set the start and end dates before activating the contract");
    const updated = await prisma.procurementContract.update({
      where: { id },
      data: { status: next, ...(next === "ACTIVE" ? { activatedAt: new Date() } : {}) },
    });
    await audit(userId, next === "ACTIVE" ? "APPROVE" : "TERMINATE", "ProcurementContract", id, { status: next }, { status: existing.status });
    const v = await prisma.vendor.findUnique({ where: { id: updated.vendorId }, select: { id: true, name: true } });
    return withContractState(updated, new Map(v ? [[v.id, v.name]] : []));
  },
};

// ------------------------------------------------------------------------------------ plans

const planOut = (p: any) => ({
  ...p,
  budget: Number(p.budget),
  items: (p.items ?? []).map((i: any) => ({ ...i, estimatedValue: Number(i.estimatedValue) })),
  plannedValue: (p.items ?? []).reduce((t: number, i: any) => t + Number(i.estimatedValue || 0), 0),
});

/** Requisition statuses that have not drawn on a plan line (they hold nothing yet, or gave it back). */
const RELEASED_PR = ["DRAFT", "REJECTED", "CANCELLED", "RETURNED", "RETURNED_FOR_AMENDMENT"];

/** planOut plus what each line has been drawn for by requisitions: consumed, remaining and how many requisitions. */
async function planView(p: any) {
  const [out] = await plansView([p]);
  return out;
}
async function plansView(plans: any[]) {
  const ids = plans.flatMap((p) => (p.items ?? []).map((i: any) => i.id));
  const drawn = ids.length
    ? await prisma.purchaseRequisition.groupBy({
        by: ["planItemId"],
        where: { planItemId: { in: ids }, status: { notIn: RELEASED_PR } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      })
    : [];
  const use = new Map(drawn.map((d) => [d.planItemId as string, { consumed: Number(d._sum.totalAmount ?? 0), count: d._count._all }]));
  const officerIds = [...new Set(plans.flatMap((p) => (p.items ?? []).map((i: any) => i.responsibleOfficerId)).filter(Boolean))] as string[];
  const officers = officerIds.length
    ? await prisma.user.findMany({ where: { id: { in: officerIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : [];
  const creatorIds = [...new Set(plans.map((p) => p.createdById).filter(Boolean))] as string[];
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : [];
  return plans.map((p) => {
    const base = planOut(p);
    const creator = creators.find((x) => x.id === p.createdById);
    base.createdByName = creator ? [creator.firstName, creator.lastName].filter(Boolean).join(" ") || creator.email : null;
    const items = base.items.map((i: any) => {
      const u = use.get(i.id) ?? { consumed: 0, count: 0 };
      const o = officers.find((x) => x.id === i.responsibleOfficerId);
      return {
        ...i,
        consumed: u.consumed,
        remaining: i.estimatedValue - u.consumed,
        requisitionCount: u.count,
        responsibleOfficer: o ? [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email : null,
      };
    });
    return { ...base, items, consumedValue: items.reduce((s: number, i: any) => s + i.consumed, 0) };
  });
}

function assertDates(d: { plannedStartDate?: any; requiredDeliveryDate?: any }) {
  if (d.plannedStartDate && d.requiredDeliveryDate && new Date(d.requiredDeliveryDate).getTime() < new Date(d.plannedStartDate).getTime()) {
    throw bad("The required delivery date cannot be before the planned start date");
  }
}

const PLAN_METHODS = ["RFQ", "OPEN_TENDER", "RESTRICTED_TENDER", "SINGLE_SOURCE", "DIRECT_PURCHASE", "FRAMEWORK_CALL_OFF"];

/** Normalises the §10 plan-line fields from a request body; only the fields present are returned. */
async function lineFields(body: any, plan: any, partial: boolean) {
  const out: any = {};
  const requirement = str(body.requirement ?? body.description);
  if (body.requirement !== undefined || body.description !== undefined || !partial) {
    if (!requirement) throw bad("A requirement description is required");
    out.description = requirement.slice(0, 255);
    out.requirement = requirement.slice(0, 255);
  }
  if (body.category !== undefined || !partial) out.category = str(body.category) ?? null;
  if (body.quarter !== undefined || !partial) {
    const quarter = str(body.quarter);
    if (quarter && !/^Q[1-4]$/i.test(quarter)) throw bad("quarter must be Q1, Q2, Q3 or Q4");
    out.quarter = quarter ? quarter.toUpperCase() : null;
  }
  if (body.method !== undefined || !partial) {
    const SYN: Record<string, string> = { FRAMEWORK: "FRAMEWORK_CALL_OFF", DIRECT_PROCUREMENT: "DIRECT_PURCHASE", REQUEST_FOR_QUOTATION: "RFQ" };
    const raw = str(body.method)?.toUpperCase().replace(/[\s-]+/g, "_");
    const m = raw ? SYN[raw] ?? raw : raw;
    if (m && !PLAN_METHODS.includes(m)) throw bad(`method must be one of: ${PLAN_METHODS.join(", ")}`);
    out.method = m ?? null;
  }
  if (body.estimatedValue !== undefined || !partial) out.estimatedValue = money(body.estimatedValue ?? 0, "estimatedValue");
  if (body.department !== undefined || !partial) out.department = str(body.department) ?? plan.department ?? null;
  if (body.businessUnit !== undefined || !partial) out.businessUnit = str(body.businessUnit) ?? plan.businessUnit ?? null;
  if (body.budgetCode !== undefined || !partial) out.budgetCode = str(body.budgetCode)?.slice(0, 64) ?? null;
  if (body.costCentre !== undefined || !partial) out.costCentre = str(body.costCentre)?.slice(0, 128) ?? null;
  if (body.plannedStartDate !== undefined || !partial) out.plannedStartDate = date(body.plannedStartDate, "plannedStartDate");
  if (body.requiredDeliveryDate !== undefined || !partial) out.requiredDeliveryDate = date(body.requiredDeliveryDate, "requiredDeliveryDate");
  if (body.currencyCode !== undefined || !partial) out.currencyCode = (str(body.currencyCode) ?? plan.currencyCode ?? null)?.toUpperCase() ?? null;
  if (body.responsibleOfficerId !== undefined || !partial) {
    const id = str(body.responsibleOfficerId);
    if (id) {
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!u) throw bad("The responsible officer was not found");
    }
    out.responsibleOfficerId = id ?? null;
  }
  return out;
}

async function planOrThrow(id: string) {
  const plan = await prisma.procurementPlan.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
  if (!plan) throw notFound("Plan");
  return plan;
}

const EDITABLE_PLAN = ["DRAFT", "REJECTED"];

export const ProcurementPlans = {
  async list(filters: { fiscalYear?: string } = {}) {
    const where: any = {};
    const fy = str(filters.fiscalYear);
    if (fy) where.fiscalYear = fy;
    const rows = await prisma.procurementPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { createdAt: "asc" } } },
      take: 200,
    });
    return plansView(rows);
  },

  async create(body: any, userId: string) {
    const name = str(body.name);
    if (!name) throw bad("A plan name is required");
    const fiscalYear = str(body.fiscalYear) ?? `FY ${new Date().getFullYear()}`;
    const plan = await createWithNumber(
      (planNumber) =>
        prisma.procurementPlan.create({
          data: {
            planNumber,
            name: name.slice(0, 255),
            department: str(body.department) ?? null,
            businessUnit: str(body.businessUnit) ?? null,
            fiscalYear: fiscalYear.slice(0, 16),
            budget: money(body.budget ?? 0, "budget"),
            currencyCode: str(body.currencyCode) ?? null,
            notes: str(body.notes) ?? null,
            createdById: userId,
          },
          include: { items: true },
        }),
      "procurementPlan",
      "planNumber",
      "APP",
      3,
      // A plan is numbered by the year it plans for, not the year it was drafted in.
      Number(fiscalYear.match(/(\d{4})/)?.[1]) || undefined
    );
    await audit(userId, "CREATE", "ProcurementPlan", plan.id, { planNumber: plan.planNumber, name: plan.name });
    return planView(plan);
  },

  async update(id: string, body: any, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; only a draft or rejected plan is edited`);
    const data: any = {};
    if (body.name !== undefined) {
      const n = str(body.name);
      if (!n) throw bad("A plan name is required");
      data.name = n.slice(0, 255);
    }
    if (body.department !== undefined) data.department = str(body.department) ?? null;
    if (body.businessUnit !== undefined) data.businessUnit = str(body.businessUnit) ?? null;
    if (body.currencyCode !== undefined) data.currencyCode = str(body.currencyCode)?.toUpperCase() ?? null;
    if (body.fiscalYear !== undefined) data.fiscalYear = (str(body.fiscalYear) ?? plan.fiscalYear).slice(0, 16);
    if (body.budget !== undefined) data.budget = money(body.budget, "budget");
    if (body.notes !== undefined) data.notes = str(body.notes) ?? null;
    await prisma.procurementPlan.update({ where: { id }, data });
    await audit(userId, "UPDATE", "ProcurementPlan", id, data, previous(plan, data));
    return planView(await planOrThrow(id));
  },

  async addItem(id: string, body: any, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; lines are added to a draft or rejected plan`);
    const data = await lineFields(body, plan, false);
    assertDates(data);
    await prisma.procurementPlanItem.create({ data: { planId: id, ...data } });
    await audit(userId, "UPDATE", "ProcurementPlan", id, { addedLine: data.description });
    return planView(await planOrThrow(id));
  },

  async updateItem(id: string, itemId: string, body: any, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; lines are edited on a draft or rejected plan`);
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw notFound("Plan line");
    const data = await lineFields(body, plan, true);
    assertDates({
      plannedStartDate: data.plannedStartDate !== undefined ? data.plannedStartDate : item.plannedStartDate,
      requiredDeliveryDate: data.requiredDeliveryDate !== undefined ? data.requiredDeliveryDate : item.requiredDeliveryDate,
    });
    await prisma.procurementPlanItem.update({ where: { id: itemId }, data });
    await audit(userId, "UPDATE", "ProcurementPlan", id, { editedLine: item.description });
    return planView(await planOrThrow(id));
  },

  async removeItem(id: string, itemId: string, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; lines are removed from a draft or rejected plan`);
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw notFound("Plan line");
    await prisma.procurementPlanItem.delete({ where: { id: itemId } });
    await audit(userId, "UPDATE", "ProcurementPlan", id, { removedLine: item.description });
    return planView(await planOrThrow(id));
  },

  async submit(id: string, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status} and cannot be submitted`);
    if (!plan.items.length) throw bad("Add at least one plan line before submitting");
    if (!(Number(plan.budget) > 0)) throw bad("Set the plan budget before submitting");
    // SRD §10: every line is a complete, usable planning record before the plan can be approved and drawn on.
    const gaps: string[] = [];
    plan.items.forEach((i, n) => {
      const miss: string[] = [];
      if (!(Number(i.estimatedValue) > 0)) miss.push("an estimated value");
      if (!i.method) miss.push("a procurement method");
      if (!i.requiredDeliveryDate) miss.push("a required delivery date");
      if (!i.budgetCode) miss.push("a budget code");
      if (!i.responsibleOfficerId) miss.push("a responsible officer");
      if (miss.length) gaps.push(`Line ${n + 1} (${i.description}) needs ${miss.join(", ")}`);
    });
    if (gaps.length) throw bad(gaps.slice(0, 5).join("; ") + (gaps.length > 5 ? `; and ${gaps.length - 5} more line(s)` : ""));
    const lines = plan.items.reduce((s, i) => s + Number(i.estimatedValue || 0), 0);
    if (lines > Number(plan.budget) + 0.005) {
      throw bad(`The lines total ${lines.toFixed(2)}, more than the plan budget of ${Number(plan.budget).toFixed(2)}`);
    }
    await prisma.procurementPlan.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date(), rejectionReason: null, ...(plan.status === "REJECTED" ? { version: plan.version + 1 } : {}) },
    });
    await audit(userId, "SUBMIT", "ProcurementPlan", id, { status: "SUBMITTED" }, { status: plan.status });
    return planView(await planOrThrow(id));
  },

  async decide(id: string, decision: "APPROVED" | "REJECTED", userId: string, reason?: string) {
    const plan = await planOrThrow(id);
    if (plan.status !== "SUBMITTED") throw conflict(`${plan.planNumber} is ${plan.status}; only a submitted plan is decided`);
    // Segregation of duties: whoever drafted and submitted the plan does not approve it.
    if (plan.createdById === userId) throw new RegisterError(403, "The plan's author cannot approve or reject it");
    const r = str(reason);
    if (decision === "REJECTED" && !r) throw bad("A reason is required to reject a plan");
    await prisma.procurementPlan.update({
      where: { id },
      data:
        decision === "APPROVED"
          ? { status: "APPROVED", approvedById: userId, approvedAt: new Date() }
          : { status: "REJECTED", rejectionReason: r },
    });
    await audit(userId, decision === "APPROVED" ? "APPROVE" : "REJECT", "ProcurementPlan", id, { status: decision, reason: r ?? null }, { status: plan.status });
    return planView(await planOrThrow(id));
  },
};

/** Plan-line drawing: what each approved line has been consumed by, and the lines a requisition may still draw on. */
export const ProcurementPlanUse = {
  async lineConsumption(planItemId: string) {
    const { ProcurementRequisitionRulesService } = await import("./ProcurementRequisitionRulesService");
    const c = await ProcurementRequisitionRulesService.planLineConsumption(planItemId);
    if (!c) throw notFound("Plan line");
    return {
      planId: c.item.planId,
      planNumber: c.item.plan.planNumber,
      planStatus: c.item.plan.status,
      description: c.item.description,
      planned: c.planned,
      consumed: c.consumed,
      remaining: c.remaining,
      requisitions: c.requisitions,
    };
  },

  /** Lines of approved plans only, with what is left, optionally narrowed to a department. */
  async availableLines(filters: { department?: string; q?: string } = {}) {
    const dept = str(filters.department);
    const plans = await prisma.procurementPlan.findMany({
      where: { status: "APPROVED" },
      include: { items: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const views = await plansView(plans);
    const q = str(filters.q)?.toLowerCase();
    return views.flatMap((p) =>
      p.items
        .filter((i: any) => (!dept || !i.department || i.department === dept) && (!q || `${i.description} ${p.planNumber}`.toLowerCase().includes(q)))
        .map((i: any) => ({
          id: i.id,
          planId: p.id,
          planNumber: p.planNumber,
          fiscalYear: p.fiscalYear,
          requirement: i.description,
          department: i.department,
          budgetCode: i.budgetCode,
          costCentre: i.costCentre,
          currencyCode: i.currencyCode || p.currencyCode,
          method: i.method,
          estimatedValue: i.estimatedValue,
          consumed: i.consumed,
          remaining: i.remaining,
        }))
    );
  },
};
