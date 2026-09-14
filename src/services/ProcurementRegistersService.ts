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

async function audit(userId: string | undefined, action: string, entityType: string, entityId: string, newValues: any) {
  try {
    await AuditService.log({ userId, action, entityType, entityId, newValues });
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

export const DOCUMENT_STATUSES = ["under_review", "approved", "archived"] as const;
/** The remote upload type that maps to a durable folder (see PerformanceDocumentService). */
const DOCUMENT_UPLOAD_TYPE = "application-documents";

async function storeFile(file: { buffer: Buffer; originalname: string; mimetype?: string; size?: number }) {
  const safe = String(file.originalname || "document").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  try {
    return await remoteUploadService.uploadSingleFile(
      {
        buffer: file.buffer,
        originalname: `${Date.now()}-${safe}`,
        mimetype: file.mimetype || "application/octet-stream",
        size: file.size ?? file.buffer.length,
      },
      DOCUMENT_UPLOAD_TYPE
    );
  } catch (err: any) {
    throw new RegisterError(502, `The file could not be stored: ${err?.message || err}`);
  }
}

function nextVersion(v: string): string {
  const m = String(v || "").match(/^v?(\d+)(?:\.(\d+))?$/i);
  return m ? `v${Number(m[1]) + 1}.0` : "v2.0";
}

export const ProcurementDocuments = {
  async list(filters: { folder?: string; status?: string; search?: string } = {}) {
    const where: any = {};
    const folder = str(filters.folder);
    if (folder) where.folder = folder;
    const status = str(filters.status);
    where.status = status ? status : { not: "archived" };
    const search = str(filters.search);
    if (search) where.OR = [{ name: { contains: search } }, { relatedRecord: { contains: search } }];
    const rows = await prisma.procurementDocument.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    const ids = [...new Set(rows.map((r) => r.uploadedById).filter(Boolean))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ")]));
    return rows.map((r) => ({ ...r, uploadedByName: names.get(r.uploadedById) ?? null }));
  },

  async upload(params: {
    files: Array<{ buffer: Buffer; originalname: string; mimetype?: string; size?: number }>;
    name?: string;
    folder?: string;
    documentType?: string;
    relatedRecord?: string;
    classification?: string;
    source?: string;
    description?: string;
    uploadedById: string;
  }) {
    if (!params.files?.length) throw bad("Attach at least one file");
    const created = [];
    for (const [idx, file] of params.files.entries()) {
      if (!file?.buffer?.length) throw bad(`${file?.originalname || "A file"} is empty`);
      const { filePath, downloadURL } = await storeFile(file);
      const base = str(params.name);
      const name = base ? (params.files.length > 1 ? `${base} (${idx + 1})` : base) : file.originalname;
      const doc = await prisma.procurementDocument.create({
        data: {
          name: name.slice(0, 255),
          folder: str(params.folder) ?? "General",
          documentType: str(params.documentType) ?? null,
          relatedRecord: str(params.relatedRecord) ?? null,
          classification: str(params.classification) ?? "Internal",
          source: str(params.source) ?? "Internal upload",
          description: str(params.description) ?? null,
          fileUrl: downloadURL,
          storagePath: filePath,
          mimeType: file.mimetype ?? null,
          fileSizeBytes: file.size ?? file.buffer.length,
          uploadedById: params.uploadedById,
        },
      });
      await audit(params.uploadedById, "CREATE", "ProcurementDocument", doc.id, { name: doc.name, folder: doc.folder });
      created.push(doc);
    }
    return created;
  },

  async uploadVersion(id: string, file: any, userId: string) {
    const existing = await prisma.procurementDocument.findUnique({ where: { id } });
    if (!existing) throw notFound("Document");
    if (!file?.buffer?.length) throw bad("Attach the new version's file");
    const { filePath, downloadURL } = await storeFile(file);
    const updated = await prisma.procurementDocument.update({
      where: { id },
      data: {
        version: nextVersion(existing.version),
        status: "under_review",
        fileUrl: downloadURL,
        storagePath: filePath,
        mimeType: file.mimetype ?? null,
        fileSizeBytes: file.size ?? file.buffer.length,
      },
    });
    await audit(userId, "UPDATE", "ProcurementDocument", id, { version: updated.version });
    return updated;
  },

  async setStatus(id: string, status: string, userId: string) {
    const s = str(status)?.toLowerCase();
    if (!s || !DOCUMENT_STATUSES.includes(s as any)) throw bad(`status must be one of: ${DOCUMENT_STATUSES.join(", ")}`);
    const existing = await prisma.procurementDocument.findUnique({ where: { id } });
    if (!existing) throw notFound("Document");
    const updated = await prisma.procurementDocument.update({ where: { id }, data: { status: s } });
    await audit(userId, s === "approved" ? "APPROVE" : "UPDATE", "ProcurementDocument", id, { status: s });
    return updated;
  },
};

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
    await audit(userId, "UPDATE", "ProcurementContract", id, data);
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
    await audit(userId, next === "ACTIVE" ? "APPROVE" : "UPDATE", "ProcurementContract", id, { status: next });
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
    return rows.map(planOut);
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
    return planOut(plan);
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
    if (body.fiscalYear !== undefined) data.fiscalYear = (str(body.fiscalYear) ?? plan.fiscalYear).slice(0, 16);
    if (body.budget !== undefined) data.budget = money(body.budget, "budget");
    if (body.notes !== undefined) data.notes = str(body.notes) ?? null;
    await prisma.procurementPlan.update({ where: { id }, data });
    await audit(userId, "UPDATE", "ProcurementPlan", id, data);
    return planOut(await planOrThrow(id));
  },

  async addItem(id: string, body: any, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; lines are added to a draft or rejected plan`);
    const description = str(body.description);
    if (!description) throw bad("A line description is required");
    const quarter = str(body.quarter);
    if (quarter && !/^Q[1-4]$/i.test(quarter)) throw bad("quarter must be Q1, Q2, Q3 or Q4");
    await prisma.procurementPlanItem.create({
      data: {
        planId: id,
        description: description.slice(0, 255),
        category: str(body.category) ?? null,
        quarter: quarter ? quarter.toUpperCase() : null,
        method: str(body.method) ?? null,
        estimatedValue: money(body.estimatedValue ?? 0, "estimatedValue"),
        department: str(body.department) ?? plan.department ?? null,
      },
    });
    await audit(userId, "UPDATE", "ProcurementPlan", id, { addedLine: description });
    return planOut(await planOrThrow(id));
  },

  async updateItem(id: string, itemId: string, body: any, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; lines are edited on a draft or rejected plan`);
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw notFound("Plan line");
    const data: any = {};
    if (body.description !== undefined) {
      const d = str(body.description);
      if (!d) throw bad("A line description is required");
      data.description = d.slice(0, 255);
    }
    if (body.category !== undefined) data.category = str(body.category) ?? null;
    if (body.quarter !== undefined) {
      const quarter = str(body.quarter);
      if (quarter && !/^Q[1-4]$/i.test(quarter)) throw bad("quarter must be Q1, Q2, Q3 or Q4");
      data.quarter = quarter ? quarter.toUpperCase() : null;
    }
    if (body.method !== undefined) data.method = str(body.method) ?? null;
    if (body.estimatedValue !== undefined) data.estimatedValue = money(body.estimatedValue, "estimatedValue");
    if (body.department !== undefined) data.department = str(body.department) ?? null;
    await prisma.procurementPlanItem.update({ where: { id: itemId }, data });
    await audit(userId, "UPDATE", "ProcurementPlan", id, { editedLine: item.description });
    return planOut(await planOrThrow(id));
  },

  async removeItem(id: string, itemId: string, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status}; lines are removed from a draft or rejected plan`);
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw notFound("Plan line");
    await prisma.procurementPlanItem.delete({ where: { id: itemId } });
    await audit(userId, "UPDATE", "ProcurementPlan", id, { removedLine: item.description });
    return planOut(await planOrThrow(id));
  },

  async submit(id: string, userId: string) {
    const plan = await planOrThrow(id);
    if (!EDITABLE_PLAN.includes(plan.status)) throw conflict(`${plan.planNumber} is ${plan.status} and cannot be submitted`);
    if (!plan.items.length) throw bad("Add at least one plan line before submitting");
    if (!(Number(plan.budget) > 0)) throw bad("Set the plan budget before submitting");
    await prisma.procurementPlan.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date(), rejectionReason: null, ...(plan.status === "REJECTED" ? { version: plan.version + 1 } : {}) },
    });
    await audit(userId, "SUBMIT", "ProcurementPlan", id, { status: "SUBMITTED" });
    return planOut(await planOrThrow(id));
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
    await audit(userId, decision === "APPROVED" ? "APPROVE" : "REJECT", "ProcurementPlan", id, { status: decision, reason: r ?? null });
    return planOut(await planOrThrow(id));
  },
};
