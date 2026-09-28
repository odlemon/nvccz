// @ts-nocheck
import { prisma } from "../../utils/database";
import { FxService } from "../fx/FxService";
import { STATUS_LABELS, statusLabel, PO_UNCONFIRMED_STATUSES } from "../status/StatusTransitions";

/**
 * SRD §37: the fifteen procurement reports. Each is a definition (columns, the filters it honours) and a query; the same
 * definition drives the screen, the CSV, the XLSX and the PDF, so the four can never disagree.
 *
 * Filters, where a report has the thing to filter on: date range, department, supplier (name or id), category, currency, status.
 * Money is never summed across currencies: a report's totals are given per currency, and converted into the reporting currency
 * through the exchange-rate mechanism (src/services/fx) with each rate used listed beside the figure.
 */
export type Col = { key: string; label: string; type?: "text" | "number" | "money" | "date" | "datetime" | "percent" };
export type Filters = { from?: string; to?: string; department?: string; supplier?: string; category?: string; currency?: string; status?: string; user?: string; eventType?: string };
export type FilterName = "date" | "department" | "supplier" | "category" | "currency" | "status";
type Row = Record<string, any>;
type Def = {
  key: string;
  name: string;
  description: string;
  filters: FilterName[];
  columns: Col[];
  /** the money column and the column holding its currency, for the totals */
  money?: { amount: string; currency: string };
  run: (f: Filters) => Promise<Row[]>;
};

export class ReportError extends Error { status = 400; }

/**
 * A status filter as people type it: the stored code (DRAFT), its name on screen (Under Review, Converted to Sourcing), or several of
 * them separated by commas. Returns the Prisma filter, or undefined for no filter.
 */
function statusFilter(kind: "REQUISITION" | "RFQ" | "PURCHASE_ORDER", text?: string) {
  const tokens = String(text ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return undefined;
  const labels = STATUS_LABELS[kind] ?? {};
  const codes = new Set<string>();
  for (const t of tokens) {
    const raw = t.toUpperCase().replace(/\s+/g, "_");
    if (raw in labels) codes.add(raw);
    for (const [code, label] of Object.entries(labels)) if (label.toLowerCase() === t.toLowerCase()) codes.add(code);
    if (!(raw in labels) && !Object.values(labels).some((l) => l.toLowerCase() === t.toLowerCase())) codes.add(raw);
  }
  return { in: [...codes] };
}

const MAX_ROWS = 10000;
const num = (v: any) => (v == null ? 0 : Number(v));
const iso = (d: any) => (d ? new Date(d).toISOString() : null);
const dateOnly = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const daysBetween = (a: any, b: any) => (a && b ? Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 86400000) * 10) / 10 : null);
const hoursBetween = (a: any, b: any) => (a && b ? Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3600000) * 10) / 10 : null);

function dateRange(f: Filters): any | undefined {
  const r: any = {};
  if (f.from) { const d = new Date(f.from); if (Number.isNaN(d.getTime())) throw new ReportError("The from date is not a valid date."); r.gte = d; }
  if (f.to) { const d = new Date(f.to); if (Number.isNaN(d.getTime())) throw new ReportError("The to date is not a valid date."); if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) d.setUTCHours(23, 59, 59, 999); r.lte = d; }
  return Object.keys(r).length ? r : undefined;
}

let currencyCache: { at: number; byId: Map<string, string>; byCode: Map<string, string> } | null = null;
async function currencies() {
  if (!currencyCache || Date.now() - currencyCache.at > 30_000) {
    const rows = await prisma.currency.findMany({ select: { id: true, code: true } });
    currencyCache = { at: Date.now(), byId: new Map(rows.map((r) => [r.id, r.code])), byCode: new Map(rows.map((r) => [r.code.toUpperCase(), r.id])) };
  }
  return currencyCache;
}
const currencyIdFilter = async (f: Filters) => {
  if (!f.currency) return undefined;
  const id = (await currencies()).byCode.get(String(f.currency).toUpperCase());
  if (!id) throw new ReportError(`"${f.currency}" is not a currency in the system.`);
  return id;
};
const contains = (v?: string) => (v ? { contains: v } : undefined);
const names = async (ids: string[]) => {
  const u = ids.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
  return new Map(u.map((x) => [x.id, `${x.firstName ?? ""} ${x.lastName ?? ""}`.trim() || x.email]));
};
const vendorFilter = (f: Filters) => (f.supplier ? { OR: [{ id: f.supplier }, { name: { contains: f.supplier } }] } : undefined);

// ---------------------------------------------------------------------------------------------- the reports

const DEFS: Def[] = [
  {
    key: "requisition-register", name: "Requisition Register", description: "Every purchase requisition with its requester, department, status and amount.",
    filters: ["date", "department", "category", "currency", "status"],
    columns: [{ key: "number", label: "Requisition" }, { key: "title", label: "Title" }, { key: "department", label: "Department" }, { key: "category", label: "Category" }, { key: "requester", label: "Requested by" }, { key: "status", label: "Status" }, { key: "created", label: "Created", type: "date" }, { key: "amount", label: "Amount", type: "money" }, { key: "currency", label: "Currency" }, { key: "budgetCode", label: "Budget code" }],
    money: { amount: "amount", currency: "currency" },
    async run(f) {
      const cur = await currencyIdFilter(f);
      const rows = await prisma.purchaseRequisition.findMany({
        where: { createdAt: dateRange(f), department: contains(f.department), sourcingCategory: contains(f.category), currencyId: cur, status: statusFilter("REQUISITION", f.status) },
        orderBy: { createdAt: "desc" }, take: MAX_ROWS,
      });
      const who = await names(rows.map((r) => r.requestedById));
      const codes = (await currencies()).byId;
      return rows.map((r) => ({ number: r.requisitionNumber, title: r.title, department: r.department, category: r.sourcingCategory, requester: who.get(r.requestedById) ?? null, status: statusLabel("REQUISITION", r.status), created: dateOnly(r.createdAt), amount: num(r.totalAmount), currency: codes.get(r.currencyId ?? "") ?? null, budgetCode: r.budgetCode }));
    },
  },
  {
    key: "rfq-tender-register", name: "RFQ / Tender Register", description: "Every sourcing event: method, status, closing date, invitations and quotations.",
    filters: ["date", "supplier", "status"],
    columns: [{ key: "number", label: "Reference" }, { key: "title", label: "Title" }, { key: "method", label: "Method" }, { key: "status", label: "Status" }, { key: "created", label: "Created", type: "date" }, { key: "closing", label: "Closing", type: "datetime" }, { key: "invited", label: "Vendors invited", type: "number" }, { key: "quotations", label: "Quotations", type: "number" }, { key: "awardedTo", label: "Awarded to" }],
    async run(f) {
      const rows = await prisma.procurementRfq.findMany({
        where: {
          createdAt: dateRange(f), status: statusFilter("RFQ", f.status),
          ...(f.supplier ? { quotations: { some: { OR: [{ vendorId: f.supplier }, { vendorName: { contains: f.supplier } }] } } } : {}),
        },
        include: { _count: { select: { invitations: true, quotations: true } }, quotations: { select: { id: true, vendorName: true } } },
        orderBy: { createdAt: "desc" }, take: MAX_ROWS,
      });
      return rows.map((r) => ({ number: r.rfqNumber, title: r.title, method: r.procurementMethod, status: statusLabel("RFQ", r.status), created: dateOnly(r.createdAt), closing: iso(r.closingAt), invited: r._count.invitations, quotations: r._count.quotations, awardedTo: r.quotations.find((q) => q.id === r.awardedQuotationId)?.vendorName ?? null }));
    },
  },
  {
    key: "purchase-order-register", name: "Purchase Order Register", description: "Every purchase order with its vendor, status, delivery date and value.",
    filters: ["date", "department", "supplier", "currency", "status"],
    columns: [{ key: "number", label: "Purchase order" }, { key: "vendor", label: "Vendor" }, { key: "department", label: "Department" }, { key: "status", label: "Status" }, { key: "ordered", label: "Ordered", type: "date" }, { key: "delivery", label: "Expected delivery", type: "date" }, { key: "amount", label: "Amount", type: "money" }, { key: "currency", label: "Currency" }, { key: "requisition", label: "Requisition" }],
    money: { amount: "amount", currency: "currency" },
    async run(f) {
      const cur = await currencyIdFilter(f);
      const rows = await prisma.purchaseOrder.findMany({
        where: { orderDate: dateRange(f), currencyId: cur, status: statusFilter("PURCHASE_ORDER", f.status), vendor: vendorFilter(f), ...(f.department ? { requisition: { department: { contains: f.department } } } : {}) },
        include: { vendor: { select: { name: true } }, requisition: { select: { requisitionNumber: true, department: true } } },
        orderBy: { orderDate: "desc" }, take: MAX_ROWS,
      });
      const codes = (await currencies()).byId;
      return rows.map((r) => ({ number: r.poNumber, vendor: r.vendor?.name ?? null, department: r.requisition?.department ?? null, status: statusLabel("PURCHASE_ORDER", r.status), ordered: dateOnly(r.orderDate), delivery: dateOnly(r.expectedDeliveryDate), amount: num(r.totalAmount), currency: codes.get(r.currencyId ?? "") ?? null, requisition: r.requisition?.requisitionNumber ?? null }));
    },
  },
  {
    key: "supplier-register", name: "Supplier Register", description: "Every vendor with its code, category, status and compliance position.",
    filters: ["date", "supplier", "category", "status"],
    columns: [{ key: "code", label: "Vendor code" }, { key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "country", label: "Country" }, { key: "status", label: "Status" }, { key: "compliance", label: "Compliance" }, { key: "taxExpiry", label: "Tax clearance expires", type: "date" }, { key: "onboarded", label: "Registered", type: "date" }],
    async run(f) {
      const rows = await prisma.vendor.findMany({
        where: { createdAt: dateRange(f), category: contains(f.category), lifecycleStatus: f.status ? String(f.status).toUpperCase() : undefined, ...(vendorFilter(f) ?? {}) },
        orderBy: { name: "asc" }, take: MAX_ROWS,
      });
      return rows.map((v) => ({ code: v.vendorCode ?? v.bpNumber, name: v.name, category: v.category, country: v.country, status: v.lifecycleStatus ?? (v.isActive ? "ACTIVE" : "INACTIVE"), compliance: v.complianceStatus, taxExpiry: dateOnly(v.taxClearanceExpiryDate), onboarded: dateOnly(v.createdAt) }));
    },
  },
  {
    key: "vendor-compliance", name: "Vendor Compliance Report", description: "Each vendor's tax clearance, documents on file and the exceptions that stop it being used.",
    filters: ["supplier", "category", "status"],
    columns: [{ key: "name", label: "Vendor" }, { key: "category", label: "Category" }, { key: "compliance", label: "Compliance" }, { key: "taxStatus", label: "Tax clearance" }, { key: "taxExpiry", label: "Tax clearance expires", type: "date" }, { key: "documents", label: "Documents on file", type: "number" }, { key: "expired", label: "Expired documents", type: "number" }, { key: "expiring", label: "Expiring in 30 days", type: "number" }, { key: "exception", label: "Exception" }],
    async run(f) {
      const vendors = await prisma.vendor.findMany({ where: { category: contains(f.category), complianceStatus: f.status ? String(f.status).toUpperCase() : undefined, ...(vendorFilter(f) ?? {}) }, orderBy: { name: "asc" }, take: MAX_ROWS });
      const docs = await prisma.vendorKycDocument.findMany({ where: { vendorId: { in: vendors.map((v) => v.id) } }, select: { vendorId: true, expiryDate: true } });
      const now = Date.now();
      const by = new Map<string, any[]>();
      docs.forEach((d) => by.set(d.vendorId, [...(by.get(d.vendorId) ?? []), d]));
      return vendors.map((v) => {
        const ds = by.get(v.id) ?? [];
        const expired = ds.filter((d) => d.expiryDate && new Date(d.expiryDate).getTime() < now).length;
        const expiring = ds.filter((d) => d.expiryDate && new Date(d.expiryDate).getTime() >= now && new Date(d.expiryDate).getTime() < now + 30 * 86400000).length;
        const taxExpired = v.taxClearanceExpiryDate && new Date(v.taxClearanceExpiryDate).getTime() < now;
        const exception = v.isBlacklisted ? "Blacklisted" : taxExpired ? "Tax clearance expired" : String(v.taxComplianceStatus) === "PENDING" ? "No tax clearance on file" : expired ? `${expired} document(s) expired` : null;
        return { name: v.name, category: v.category, compliance: v.complianceStatus, taxStatus: v.taxComplianceStatus, taxExpiry: dateOnly(v.taxClearanceExpiryDate), documents: ds.length, expired, expiring, exception };
      });
    },
  },
];

// spend: the committed, invoiced and paid value of purchase orders, grouped
async function spendRows(f: Filters, groupBy: (po: any) => string | null, groupLabel: string) {
  const cur = await currencyIdFilter(f);
  const pos = await prisma.purchaseOrder.findMany({
    where: { orderDate: dateRange(f), currencyId: cur, vendor: vendorFilter(f), status: { notIn: ["DRAFT", "CANCELLED", "REJECTED"] }, ...(f.department || f.category ? { requisition: { ...(f.department ? { department: { contains: f.department } } : {}), ...(f.category ? { sourcingCategory: { contains: f.category } } : {}) } } : {}) },
    include: { vendor: { select: { name: true, category: true } }, requisition: { select: { department: true, sourcingCategory: true } } },
    take: MAX_ROWS,
  });
  const invoices = await prisma.procurementInvoice.findMany({ where: { purchaseOrderId: { in: pos.map((p) => p.id) }, status: { notIn: ["REJECTED", "CANCELLED", "DRAFT"] } }, select: { purchaseOrderId: true, totalAmount: true, paymentStatus: true, paymentDate: true } });
  const inv = new Map<string, { invoiced: number; paid: number }>();
  invoices.forEach((i) => {
    const e = inv.get(i.purchaseOrderId!) ?? { invoiced: 0, paid: 0 };
    e.invoiced += num(i.totalAmount);
    if (String(i.paymentStatus).toUpperCase() === "PAID") e.paid += num(i.totalAmount);
    inv.set(i.purchaseOrderId!, e);
  });
  const codes = (await currencies()).byId;
  const groups = new Map<string, any>();
  for (const po of pos) {
    const g = groupBy(po) || "Unassigned";
    const c = codes.get(po.currencyId ?? "") ?? "UNSPECIFIED";
    const k = `${g}\u0000${c}`;
    const e = groups.get(k) ?? { [groupLabel]: g, currency: c, orders: 0, committed: 0, invoiced: 0, paid: 0 };
    const i = inv.get(po.id) ?? { invoiced: 0, paid: 0 };
    e.orders += 1; e.committed += num(po.totalAmount); e.invoiced += i.invoiced; e.paid += i.paid;
    groups.set(k, e);
  }
  return [...groups.values()].map((e) => ({ ...e, committed: Math.round(e.committed * 100) / 100, invoiced: Math.round(e.invoiced * 100) / 100, paid: Math.round(e.paid * 100) / 100 })).sort((a, b) => b.committed - a.committed);
}
const spendCols = (label: string, key: string): Col[] => [{ key, label }, { key: "currency", label: "Currency" }, { key: "orders", label: "Orders", type: "number" }, { key: "committed", label: "Committed", type: "money" }, { key: "invoiced", label: "Invoiced", type: "money" }, { key: "paid", label: "Paid", type: "money" }];

DEFS.push(
  {
    key: "procurement-spend", name: "Procurement Spend Report", description: "Purchase order value committed, invoiced and paid, order by order.",
    filters: ["date", "department", "supplier", "category", "currency"],
    columns: [{ key: "po", label: "Purchase order" }, { key: "vendor", label: "Vendor" }, { key: "department", label: "Department" }, { key: "category", label: "Category" }, { key: "ordered", label: "Ordered", type: "date" }, { key: "currency", label: "Currency" }, { key: "committed", label: "Committed", type: "money" }, { key: "invoiced", label: "Invoiced", type: "money" }, { key: "paid", label: "Paid", type: "money" }],
    money: { amount: "committed", currency: "currency" },
    async run(f) {
      const cur = await currencyIdFilter(f);
      const pos = await prisma.purchaseOrder.findMany({
        where: { orderDate: dateRange(f), currencyId: cur, vendor: vendorFilter(f), status: { notIn: ["DRAFT", "CANCELLED", "REJECTED"] }, ...(f.department || f.category ? { requisition: { ...(f.department ? { department: { contains: f.department } } : {}), ...(f.category ? { sourcingCategory: { contains: f.category } } : {}) } } : {}) },
        include: { vendor: { select: { name: true } }, requisition: { select: { department: true, sourcingCategory: true } } }, orderBy: { orderDate: "desc" }, take: MAX_ROWS,
      });
      const invoices = await prisma.procurementInvoice.findMany({ where: { purchaseOrderId: { in: pos.map((p) => p.id) }, status: { notIn: ["REJECTED", "CANCELLED", "DRAFT"] } }, select: { purchaseOrderId: true, totalAmount: true, paymentStatus: true } });
      const codes = (await currencies()).byId;
      return pos.map((p) => {
        const mine = invoices.filter((i) => i.purchaseOrderId === p.id);
        return { po: p.poNumber, vendor: p.vendor?.name ?? null, department: p.requisition?.department ?? null, category: p.requisition?.sourcingCategory ?? null, ordered: dateOnly(p.orderDate), currency: codes.get(p.currencyId ?? "") ?? null, committed: num(p.totalAmount), invoiced: Math.round(mine.reduce((s, i) => s + num(i.totalAmount), 0) * 100) / 100, paid: Math.round(mine.filter((i) => String(i.paymentStatus).toUpperCase() === "PAID").reduce((s, i) => s + num(i.totalAmount), 0) * 100) / 100 };
      });
    },
  },
  { key: "spend-by-department", name: "Spend by Department", description: "Committed, invoiced and paid value per requesting department.", filters: ["date", "department", "supplier", "category", "currency"], columns: spendCols("Department", "department"), money: { amount: "committed", currency: "currency" }, run: (f) => spendRows(f, (po) => po.requisition?.department ?? null, "department") },
  { key: "spend-by-category", name: "Spend by Category", description: "Committed, invoiced and paid value per sourcing category.", filters: ["date", "department", "supplier", "category", "currency"], columns: spendCols("Category", "category"), money: { amount: "committed", currency: "currency" }, run: (f) => spendRows(f, (po) => po.requisition?.sourcingCategory ?? po.vendor?.category ?? null, "category") },
  { key: "spend-by-supplier", name: "Spend by Supplier", description: "Committed, invoiced and paid value per supplier.", filters: ["date", "department", "supplier", "category", "currency"], columns: spendCols("Supplier", "supplier"), money: { amount: "committed", currency: "currency" }, run: (f) => spendRows(f, (po) => po.vendor?.name ?? null, "supplier") },
  {
    key: "approval-turnaround", name: "Approval Turnaround Report", description: "How long each approval decision took, from the step becoming active to the decision.",
    filters: ["date", "department"],
    columns: [{ key: "record", label: "Requisition" }, { key: "department", label: "Department" }, { key: "step", label: "Step" }, { key: "approver", label: "Decided by" }, { key: "decision", label: "Decision" }, { key: "decidedAt", label: "Decided", type: "datetime" }, { key: "hours", label: "Hours taken", type: "number" }],
    async run(f) {
      const logs = await prisma.procurementDecisionLog.findMany({ where: { entityType: "PurchaseRequisition", createdAt: dateRange(f) }, orderBy: [{ entityId: "asc" }, { createdAt: "asc" }], take: MAX_ROWS * 3 });
      const reqs = await prisma.purchaseRequisition.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.entityId))] }, ...(f.department ? { department: { contains: f.department } } : {}) }, select: { id: true, requisitionNumber: true, department: true } });
      const byReq = new Map(reqs.map((r) => [r.id, r]));
      const who = await names(logs.map((l) => l.actorId).filter(Boolean) as string[]);
      const out: Row[] = [];
      const last = new Map<string, any>();
      for (const l of logs) {
        const r = byReq.get(l.entityId);
        const prev = last.get(l.entityId);
        if (r && /^(APPROVE|APPROVED|REJECT|REJECTED|RETURN|RETURNED)$/.test(String(l.action))) {
          out.push({ record: r.requisitionNumber, department: r.department, step: l.stepName ?? (l.stepNumber != null ? `Step ${l.stepNumber}` : null), approver: l.actorId ? who.get(l.actorId) ?? null : null, decision: String(l.action).replace(/D$/, ""), decidedAt: iso(l.createdAt), hours: hoursBetween(prev?.createdAt, l.createdAt) });
        }
        last.set(l.entityId, l);
      }
      return out.reverse().slice(0, MAX_ROWS);
    },
  },
  {
    key: "cycle-time", name: "Procurement Cycle-Time Report", description: "Days from requisition to approval, to sourcing, to purchase order and to issue.",
    filters: ["date", "department", "category"],
    columns: [{ key: "requisition", label: "Requisition" }, { key: "department", label: "Department" }, { key: "created", label: "Created", type: "date" }, { key: "toApproval", label: "To approval (days)", type: "number" }, { key: "toSourcing", label: "Approval to RFQ (days)", type: "number" }, { key: "toOrder", label: "To purchase order (days)", type: "number" }, { key: "toIssue", label: "Order to issue (days)", type: "number" }, { key: "total", label: "Total (days)", type: "number" }],
    async run(f) {
      const reqs = await prisma.purchaseRequisition.findMany({ where: { createdAt: dateRange(f), department: contains(f.department), sourcingCategory: contains(f.category), status: { in: ["APPROVED", "RFQ_SENT", "CONVERTED_TO_PO", "CLOSED"] } }, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
      const rfqs = await prisma.procurementRfq.findMany({ where: { requisitionId: { in: reqs.map((r) => r.id) } }, select: { requisitionId: true, createdAt: true } });
      const pos = await prisma.purchaseOrder.findMany({ where: { requisitionId: { in: reqs.map((r) => r.id) } }, select: { requisitionId: true, createdAt: true, sentAt: true } });
      return reqs.map((r) => {
        const rfq = rfqs.filter((x) => x.requisitionId === r.id).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0];
        const po = pos.filter((x) => x.requisitionId === r.id).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0];
        const end = po?.sentAt ?? po?.createdAt ?? null;
        return { requisition: r.requisitionNumber, department: r.department, created: dateOnly(r.createdAt), toApproval: daysBetween(r.createdAt, r.approvedAt), toSourcing: daysBetween(r.approvedAt, rfq?.createdAt), toOrder: daysBetween(rfq?.createdAt ?? r.approvedAt, po?.createdAt), toIssue: daysBetween(po?.createdAt, po?.sentAt), total: daysBetween(r.createdAt, end) };
      });
    },
  },
  {
    key: "pending-approvals", name: "Pending Approval Report", description: "Everything waiting for an approval decision, and for how long.",
    filters: ["department", "currency"],
    columns: [{ key: "type", label: "Type" }, { key: "record", label: "Reference" }, { key: "title", label: "Title" }, { key: "department", label: "Department" }, { key: "submitted", label: "Waiting since", type: "date" }, { key: "days", label: "Days waiting", type: "number" }, { key: "amount", label: "Amount", type: "money" }, { key: "currency", label: "Currency" }],
    money: { amount: "amount", currency: "currency" },
    async run(f) {
      const cur = await currencyIdFilter(f);
      const codes = (await currencies()).byId;
      const now = Date.now();
      const reqs = await prisma.purchaseRequisition.findMany({ where: { status: { in: ["PENDING_APPROVAL", "PENDING_VC_EXECUTIVE_REVIEW", "SUBMITTED"] }, department: contains(f.department), currencyId: cur }, orderBy: { updatedAt: "asc" }, take: MAX_ROWS });
      const pos = await prisma.purchaseOrder.findMany({ where: { OR: [{ status: "PENDING" }, { approvalStatus: "PENDING" }], currencyId: cur, ...(f.department ? { requisition: { department: { contains: f.department } } } : {}) }, include: { requisition: { select: { department: true } } }, take: MAX_ROWS });
      const invs = await prisma.procurementInvoice.findMany({ where: { status: { in: ["PENDING", "PENDING_APPROVAL"] }, currencyId: cur }, include: { purchaseOrder: { select: { requisition: { select: { department: true } } } } }, take: MAX_ROWS });
      const rows: Row[] = [];
      reqs.forEach((r) => rows.push({ type: "Requisition", record: r.requisitionNumber, title: r.title, department: r.department, submitted: dateOnly(r.updatedAt), days: Math.round((now - +new Date(r.updatedAt)) / 86400000), amount: num(r.totalAmount), currency: codes.get(r.currencyId ?? "") ?? null }));
      pos.forEach((p) => rows.push({ type: "Purchase order", record: p.poNumber, title: null, department: p.requisition?.department ?? null, submitted: dateOnly(p.updatedAt), days: Math.round((now - +new Date(p.updatedAt)) / 86400000), amount: num(p.totalAmount), currency: codes.get(p.currencyId ?? "") ?? null }));
      invs.filter((i) => !f.department || String(i.purchaseOrder?.requisition?.department ?? "").toLowerCase().includes(f.department.toLowerCase())).forEach((i) => rows.push({ type: "Invoice", record: i.invoiceNumber, title: null, department: i.purchaseOrder?.requisition?.department ?? null, submitted: dateOnly(i.createdAt), days: Math.round((now - +new Date(i.createdAt)) / 86400000), amount: num(i.totalAmount), currency: codes.get(i.currencyId ?? "") ?? null }));
      return rows.sort((a, b) => b.days - a.days);
    },
  },
  {
    key: "invoice-exceptions", name: "Invoice Exception Report", description: "Invoices whose three-way match raised an exception, with what was found and whether it was overridden.",
    filters: ["date", "supplier", "currency"],
    columns: [{ key: "invoice", label: "Invoice" }, { key: "supplierInvoice", label: "Supplier's number" }, { key: "vendor", label: "Vendor" }, { key: "po", label: "Purchase order" }, { key: "amount", label: "Amount", type: "money" }, { key: "currency", label: "Currency" }, { key: "exceptions", label: "Exceptions" }, { key: "blocking", label: "Blocking", type: "number" }, { key: "status", label: "Status" }, { key: "override", label: "Override reason" }],
    money: { amount: "amount", currency: "currency" },
    async run(f) {
      const cur = await currencyIdFilter(f);
      const rows = await prisma.procurementInvoice.findMany({ where: { createdAt: dateRange(f), currencyId: cur, matchResult: { not: null }, vendor: vendorFilter(f) }, include: { vendor: { select: { name: true } }, purchaseOrder: { select: { poNumber: true } } }, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
      const codes = (await currencies()).byId;
      return rows.filter((i) => Array.isArray((i.matchResult as any)?.exceptions) && (i.matchResult as any).exceptions.length).map((i) => {
        const ex = (i.matchResult as any).exceptions as any[];
        return { invoice: i.invoiceNumber, supplierInvoice: i.supplierInvoiceNumber, vendor: i.vendor?.name ?? null, po: i.purchaseOrder?.poNumber ?? null, amount: num(i.totalAmount), currency: codes.get(i.currencyId ?? "") ?? null, exceptions: [...new Set(ex.map((e) => e.type))].join(", "), blocking: ex.filter((e) => e.severity === "BLOCKING").length, status: i.status, override: i.matchOverrideReason };
      });
    },
  },
  {
    key: "vendor-document-expiry", name: "Vendor Document Expiry Register", description: "Every vendor document with an expiry date, soonest first, and the vendors' tax clearances.",
    filters: ["supplier", "category", "status"],
    columns: [{ key: "vendor", label: "Vendor" }, { key: "category", label: "Category" }, { key: "document", label: "Document" }, { key: "number", label: "Document number" }, { key: "expiry", label: "Expires", type: "date" }, { key: "days", label: "Days to expiry", type: "number" }, { key: "status", label: "Position" }],
    async run(f) {
      const now = Date.now();
      const position = (d: Date) => { const days = Math.floor((+new Date(d) - now) / 86400000); return { days, status: days < 0 ? "Expired" : days <= 30 ? "Expiring soon" : "Valid" }; };
      const docs = await prisma.vendorKycDocument.findMany({ where: { expiryDate: { not: null }, vendor: { category: contains(f.category), ...(vendorFilter(f) ?? {}) } }, include: { vendor: { select: { name: true, category: true } } }, take: MAX_ROWS });
      const vendors = await prisma.vendor.findMany({ where: { taxClearanceExpiryDate: { not: null }, category: contains(f.category), ...(vendorFilter(f) ?? {}) }, select: { name: true, category: true, taxClearanceExpiryDate: true }, take: MAX_ROWS });
      const rows: Row[] = [
        ...docs.map((d) => ({ vendor: d.vendor?.name, category: d.vendor?.category, document: d.documentType, number: d.documentNumber, expiry: dateOnly(d.expiryDate), ...position(d.expiryDate!) })),
        ...vendors.map((v) => ({ vendor: v.name, category: v.category, document: "Tax clearance (ITF263)", number: null, expiry: dateOnly(v.taxClearanceExpiryDate), ...position(v.taxClearanceExpiryDate!) })),
      ];
      return rows.filter((r) => !f.status || r.status.toLowerCase() === String(f.status).toLowerCase()).sort((a, b) => a.days - b.days).map((r) => ({ vendor: r.vendor, category: r.category, document: r.document, number: r.number, expiry: r.expiry, days: r.days, status: r.status }));
    },
  },
  {
    key: "audit-trail", name: "Audit Trail Report", description: "The procurement audit trail: who did what, to which record, and what changed.",
    filters: ["date", "status"],
    columns: [{ key: "when", label: "Timestamp", type: "datetime" }, { key: "user", label: "User" }, { key: "event", label: "Event" }, { key: "action", label: "Action" }, { key: "record", label: "Record type" }, { key: "recordId", label: "Record ID" }, { key: "previous", label: "Previous value" }, { key: "new", label: "New value" }, { key: "ip", label: "IP" }, { key: "device", label: "Device" }],
    async run(f) {
      const { AUDIT_EVENT_LABEL } = await import("../audit/auditEventTypes");
      const scope = ["PurchaseRequisition", "ProcurementRfq", "RFQ", "VendorQuotation", "PurchaseOrder", "GoodsReceivedNote", "ProcurementInvoice", "Vendor", "VendorBank", "ProcurementPlan", "ProcurementContract", "ProcurementDocument", "ProcurementSettings", "ApprovalMatrix", "Approval", "Role"];
      const where: any = { createdAt: dateRange(f), OR: [{ entityType: { in: scope } }, { eventType: { in: ["LOGIN", "LOGOUT", "PERMISSION_CHANGE", "USER_CHANGE", "AI_PROCESSING"] } }], ...(f.eventType ? { eventType: String(f.eventType).toUpperCase() } : {}), ...(f.status ? { eventType: String(f.status).toUpperCase() } : {}) };
      // the sort runs on ids alone; the wide rows (previous and new values) are fetched afterwards, or the database runs out of sort memory
      const ids = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5000, select: { id: true } });
      const full = ids.length ? await prisma.auditLog.findMany({ where: { id: { in: ids.map((x) => x.id) } }, include: { user: { select: { firstName: true, lastName: true, email: true } } } }) : [];
      const byId = new Map(full.map((x) => [x.id, x]));
      const rows = ids.map((x) => byId.get(x.id)).filter(Boolean) as typeof full;
      const short = (v: any) => (v == null ? null : (JSON.stringify(v) ?? "").slice(0, 300));
      return rows.map((r) => ({ when: iso(r.createdAt), user: r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email : null, event: AUDIT_EVENT_LABEL[r.eventType as keyof typeof AUDIT_EVENT_LABEL] ?? "Other", action: r.action, record: r.entityType, recordId: r.entityId, previous: short(r.oldValues), new: short(r.newValues), ip: r.ipAddress, device: r.userAgent }));
    },
  },
);

// ---------------------------------------------------------------------------------------------- running and shaping

export const listReports = () => DEFS.map((d) => ({ key: d.key, name: d.name, description: d.description, filters: d.filters, columns: d.columns, hasMoney: !!d.money }));

export async function runReport(key: string, filters: Filters = {}, opts: { convertTo?: string } = {}) {
  const def = DEFS.find((d) => d.key === key);
  if (!def) throw Object.assign(new ReportError(`There is no report "${key}".`), { status: 404 });
  const applied: Filters = {};
  for (const name of def.filters) {
    const fields = name === "date" ? ["from", "to"] : [name];
    for (const fl of fields) if ((filters as any)[fl] !== undefined && String((filters as any)[fl]).trim() !== "") (applied as any)[fl] = String((filters as any)[fl]).trim();
  }
  for (const extra of ["eventType", "user"]) if ((filters as any)[extra]) (applied as any)[extra] = (filters as any)[extra];
  const rows = await def.run(applied);
  let summary: any = { count: rows.length };
  if (def.money) {
    summary.money = await FxService.consolidate(rows.map((r) => ({ amount: r[def.money!.amount], currency: r[def.money!.currency] })), { to: opts.convertTo });
    // a spend report's other money columns, per currency
    const others = def.columns.filter((c) => c.type === "money" && c.key !== def.money!.amount);
    if (others.length) {
      summary.otherMoney = Object.fromEntries(others.map((c) => {
        const per: Record<string, number> = {};
        rows.forEach((r) => { const cc = String(r[def.money!.currency] || "UNSPECIFIED"); per[cc] = Math.round(((per[cc] ?? 0) + num(r[c.key])) * 100) / 100; });
        return [c.key, per];
      }));
    }
  }
  return { key: def.key, name: def.name, description: def.description, columns: def.columns, filters: applied, supportedFilters: def.filters, rows, summary, generatedAt: new Date().toISOString() };
}

export const STATUS_VOCABULARY = { STATUS_LABELS, PO_UNCONFIRMED_STATUSES };
