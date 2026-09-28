// @ts-nocheck
import { prisma } from "../../utils/database";
import { FxService } from "../fx/FxService";
import { getRules } from "../notifications/ProcurementNotifier";
import { statusLabel } from "../status/StatusTransitions";

/**
 * SRD §35: the two role-specific dashboards. Every figure here is computed from the records when the dashboard is opened (no
 * constants); each chart datum carries a `drill` (a report and its filters) so a click can open the records behind it.
 *
 *   procurement : Open Requisitions, Pending Approvals, RFQs in Progress, Tenders Closing Soon, Evaluations Pending, Purchase Orders
 *                 Issued, Vendor Compliance Exceptions, Procurement Spend, Cycle Time, Savings / Variance, Overdue Activities.
 *   executive   : Total procurement value, procurement volume, spend by category / department / supplier, cycle time, pending
 *                 approvals, exception transactions, vendor concentration, sourcing method split.
 *
 * Money is reported per currency and, where a rate exists, converted into the reporting currency with the rates shown; it is never
 * added across currencies (see src/services/fx).
 */
const OPEN_REQ = ["SUBMITTED", "PENDING_APPROVAL", "PENDING_VC_EXECUTIVE_REVIEW", "APPROVED", "RETURNED"];
const IN_PROGRESS_RFQ = ["PUBLISHED", "OPEN", "CLOSED", "UNDER_EVALUATION", "AWAITING_APPROVAL"];
const ISSUED_PO = ["SENT", "ACKNOWLEDGED", "PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "DELIVERED", "RECEIVED", "BILLED", "CLOSED"];
const num = (v: any) => (v == null ? 0 : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: Date) => d.toISOString().slice(0, 10);

export type Period = { from: Date; to: Date };
export function parsePeriod(q: { from?: string; to?: string; preset?: string } = {}): Period {
  const now = new Date();
  let to = q.to ? new Date(q.to) : now;
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setUTCHours(23, 59, 59, 999);
  let from: Date;
  if (q.from) from = new Date(q.from);
  else {
    from = new Date(now);
    const p = String(q.preset || "12m");
    if (p === "month") from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    else if (p === "quarter") from = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
    else if (p === "year") from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    else if (p === "all") from = new Date("2000-01-01");
    else from.setUTCFullYear(from.getUTCFullYear() - 1);
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw Object.assign(new Error("The dates are not valid."), { status: 400 });
  if (from > to) throw Object.assign(new Error("The from date is after the to date."), { status: 400 });
  return { from, to };
}

const codeMap = async () => new Map((await prisma.currency.findMany({ select: { id: true, code: true } })).map((c) => [c.id, c.code]));
const drill = (report: string, filters: Record<string, string> = {}) => ({ report, filters });

/** value per currency for a set of records, with the converted total and the rates used */
async function moneyOf(rows: Array<{ amount: any; currency: string | null }>, convertTo?: string) {
  const c = await FxService.consolidate(rows, { to: convertTo });
  return { byCurrency: c.byCurrency, converted: c.converted, unconverted: c.unconverted, mixed: c.mixed, targetCurrency: c.targetCurrency };
}


/** Statuses that read the same on screen (Converted to Sourcing: two stored statuses) are one bar, drilling to both. */
function mergeByLabel(kind: "REQUISITION" | "PURCHASE_ORDER", groups: Array<{ status: string; _count: { _all: number } }>, report: string, period: Period) {
  const merged = new Map<string, { codes: string[]; value: number }>();
  for (const g of groups) {
    const label = statusLabel(kind, g.status);
    const m = merged.get(label) ?? { codes: [], value: 0 };
    m.codes.push(g.status); m.value += g._count._all;
    merged.set(label, m);
  }
  return [...merged.entries()].sort((a, b) => b[1].value - a[1].value).map(([label, m]) => ({ key: m.codes.join(","), label, value: m.value, drill: drill(report, { status: m.codes.join(","), from: day(period.from), to: day(period.to) }) }));
}

// ------------------------------------------------------------------------------------------------ procurement dashboard

export async function procurementDashboard(period: Period, opts: { convertTo?: string } = {}) {
  await (await import("../status/ProcurementLifecycleService")).ProcurementLifecycleService.closeExpiredRfqs().catch(() => 0);
  const now = new Date();
  const codes = await codeMap();
  const inPeriod = { gte: period.from, lte: period.to };
  const rules = await getRules();
  const escalateHours = rules.TASK_ESCALATION?.params?.afterHours ?? 48;

  const [openReqs, pendingReqs, pendingPos, pendingInvoices, rfqsInProgress, closingSoon, committeeOpen, posIssued, vendors, kycExpired, overdueRfqs, overdueDeliveries, overdueInvoices, reqsForCycle] = await Promise.all([
    prisma.purchaseRequisition.count({ where: { status: { in: OPEN_REQ } } }),
    prisma.purchaseRequisition.findMany({ where: { status: { in: ["SUBMITTED", "PENDING_APPROVAL", "PENDING_VC_EXECUTIVE_REVIEW"] } }, select: { id: true, updatedAt: true } }),
    prisma.purchaseOrder.count({ where: { OR: [{ status: "PENDING" }, { approvalStatus: "PENDING" }] } }),
    prisma.procurementInvoice.count({ where: { status: { in: ["PENDING", "PENDING_APPROVAL"] } } }),
    prisma.procurementRfq.findMany({ where: { status: { in: IN_PROGRESS_RFQ } }, select: { status: true } }),
    prisma.procurementRfq.findMany({ where: { status: { in: ["OPEN", "PUBLISHED"] }, closingAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } }, select: { rfqNumber: true, title: true, closingAt: true }, orderBy: { closingAt: "asc" }, take: 8 }),
    prisma.rfqEvaluationMember.findMany({ where: { scorecardSubmittedAt: null, recused: false }, select: { rfqId: true } }),
    prisma.purchaseOrder.findMany({ where: { status: { in: ISSUED_PO }, OR: [{ sentAt: inPeriod }, { sentAt: null, orderDate: inPeriod }] }, select: { totalAmount: true, currencyId: true, requisitionId: true, orderDate: true } }),
    prisma.vendor.findMany({ where: { OR: [{ complianceStatus: { in: ["NON_COMPLIANT", "EXPIRING_SOON"] } }, { isBlacklisted: true }] }, select: { name: true, complianceStatus: true, isBlacklisted: true } }),
    prisma.vendorKycDocument.count({ where: { expiryDate: { lt: now } } }),
    prisma.procurementRfq.count({ where: { status: "OPEN", closingAt: { lt: now } } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["SENT", "ACKNOWLEDGED", "PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED"] }, expectedDeliveryDate: { lt: now } } }),
    prisma.procurementInvoice.count({ where: { paymentStatus: { not: "PAID" }, dueDate: { lt: now }, status: "APPROVED" } }),
    prisma.purchaseRequisition.findMany({ where: { createdAt: inPeriod, approvedAt: { not: null } }, select: { id: true, createdAt: true, approvedAt: true, totalAmount: true, currencyId: true } }),
  ]);
  const evaluationsPending = committeeOpen.length
    ? await prisma.procurementRfq.count({ where: { id: { in: [...new Set(committeeOpen.map((m) => m.rfqId))] }, status: { notIn: ["AWARDED", "CANCELLED", "COMPLETED", "DRAFT"] } } })
    : 0;
  const rfqByStatus: Record<string, number> = {};
  rfqsInProgress.forEach((r) => (rfqByStatus[r.status] = (rfqByStatus[r.status] ?? 0) + 1));
  const escalated = pendingReqs.filter((r) => (now.getTime() - +new Date(r.updatedAt)) / 3600000 > escalateHours).length;

  // spend: committed value of the orders issued in the period
  const spendRows = posIssued.map((p) => ({ amount: p.totalAmount, currency: codes.get(p.currencyId ?? "") ?? null }));
  const spend = await moneyOf(spendRows, opts.convertTo);

  // by month, per currency: a series per currency, never one blended line
  const monthly = new Map<string, Record<string, number>>();
  for (const p of posIssued) {
    const m = day(new Date(p.orderDate)).slice(0, 7);
    const cur = codes.get(p.currencyId ?? "") ?? "UNSPECIFIED";
    const row = monthly.get(m) ?? {};
    row[cur] = r2((row[cur] ?? 0) + num(p.totalAmount));
    monthly.set(m, row);
  }
  const months = [...monthly.keys()].sort();
  const spendCurrencies = [...new Set(posIssued.map((p) => codes.get(p.currencyId ?? "") ?? "UNSPECIFIED"))].sort();

  // cycle time and savings
  const toApproval = reqsForCycle.map((r) => (+new Date(r.approvedAt) - +new Date(r.createdAt)) / 86400000);
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10000) / 10000 : null);
  const poByReq = new Map<string, { amount: number; currencyId: string | null }>();
  posIssued.forEach((p) => p.requisitionId && poByReq.set(p.requisitionId, { amount: (poByReq.get(p.requisitionId)?.amount ?? 0) + num(p.totalAmount), currencyId: p.currencyId }));
  const reqAll = await prisma.purchaseRequisition.findMany({ where: { id: { in: [...poByReq.keys()] } }, select: { id: true, totalAmount: true, currencyId: true } });
  const variance: Record<string, { estimate: number; ordered: number; count: number }> = {};
  for (const r of reqAll) {
    const po = poByReq.get(r.id)!;
    if (!po || !r.currencyId || r.currencyId !== po.currencyId) continue; // only where both sides are in the same currency
    const cur = codes.get(r.currencyId) ?? "UNSPECIFIED";
    const e = (variance[cur] ??= { estimate: 0, ordered: 0, count: 0 });
    e.estimate = r2(e.estimate + num(r.totalAmount)); e.ordered = r2(e.ordered + po.amount); e.count += 1;
  }

  const requisitionStatus = await prisma.purchaseRequisition.groupBy({ by: ["status"], _count: { _all: true }, where: { createdAt: inPeriod } });
  const poStatus = await prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true }, where: { orderDate: inPeriod } });

  return {
    kind: "procurement",
    period: { from: day(period.from), to: day(period.to) },
    generatedAt: now.toISOString(),
    tiles: {
      openRequisitions: { value: openReqs, drill: drill("requisition-register") },
      pendingApprovals: { value: pendingReqs.length + pendingPos + pendingInvoices, parts: { requisitions: pendingReqs.length, purchaseOrders: pendingPos, invoices: pendingInvoices }, drill: drill("pending-approvals") },
      rfqsInProgress: { value: rfqsInProgress.length, byStatus: Object.entries(rfqByStatus).map(([s, n]) => ({ status: s, label: statusLabel("RFQ", s), count: n })), drill: drill("rfq-tender-register") },
      tendersClosingSoon: { value: closingSoon.length, items: closingSoon.map((r) => ({ reference: r.rfqNumber, title: r.title, closing: r.closingAt })), withinDays: 7, drill: drill("rfq-tender-register", { status: "OPEN" }) },
      evaluationsPending: { value: evaluationsPending, drill: drill("rfq-tender-register", { status: "UNDER_EVALUATION" }) },
      purchaseOrdersIssued: { value: posIssued.length, drill: drill("purchase-order-register", { from: day(period.from), to: day(period.to) }) },
      vendorComplianceExceptions: { value: vendors.length, expiredDocuments: kycExpired, items: vendors.slice(0, 6).map((v) => ({ name: v.name, reason: v.isBlacklisted ? "Blacklisted" : v.complianceStatus })), drill: drill("vendor-compliance") },
      procurementSpend: { ...spend, orders: posIssued.length, drill: drill("procurement-spend", { from: day(period.from), to: day(period.to) }) },
      cycleTime: { approvalDays: avg(toApproval), sample: toApproval.length, drill: drill("cycle-time", { from: day(period.from), to: day(period.to) }) },
      savingsVariance: { byCurrency: Object.entries(variance).map(([currency, v]) => ({ currency, estimate: v.estimate, ordered: v.ordered, variance: r2(v.estimate - v.ordered), pct: v.estimate ? r2(((v.estimate - v.ordered) / v.estimate) * 100) : null, requisitions: v.count })), available: Object.keys(variance).length > 0 },
      overdueActivities: {
        value: overdueRfqs + overdueDeliveries + overdueInvoices + escalated,
        parts: { rfqsPastClosing: overdueRfqs, deliveriesLate: overdueDeliveries, invoicesPastDue: overdueInvoices, approvalsWaitingOver: { hours: escalateHours, count: escalated } },
        drill: drill("pending-approvals"),
      },
    },
    charts: {
      spendByMonth: { title: "Committed spend by month", unit: "currency", labels: months, series: spendCurrencies.map((c) => ({ name: c, data: months.map((m) => monthly.get(m)?.[c] ?? 0) })), drill: drill("procurement-spend") },
      requisitionsByStatus: { title: "Requisitions by status", data: mergeByLabel("REQUISITION", requisitionStatus, "requisition-register", period) },
      purchaseOrdersByStatus: { title: "Purchase orders by status", data: mergeByLabel("PURCHASE_ORDER", poStatus, "purchase-order-register", period) },
      sourcingPipeline: { title: "Sourcing events in progress", data: Object.entries(rfqByStatus).map(([s, n]) => ({ key: s, label: statusLabel("RFQ", s), value: n, drill: drill("rfq-tender-register", { status: s }) })) },
    },
  };
}

// ------------------------------------------------------------------------------------------------ executive dashboard

export async function executiveDashboard(period: Period, opts: { convertTo?: string } = {}) {
  const now = new Date();
  const codes = await codeMap();
  const inPeriod = { gte: period.from, lte: period.to };
  const pos = await prisma.purchaseOrder.findMany({
    where: { orderDate: inPeriod, status: { notIn: ["DRAFT", "CANCELLED", "REJECTED"] } },
    include: { vendor: { select: { id: true, name: true } }, requisition: { select: { department: true, sourcingCategory: true, procurementMethod: true } } },
  });
  const cur = (p: any) => codes.get(p.currencyId ?? "") ?? "UNSPECIFIED";
  const total = await moneyOf(pos.map((p) => ({ amount: p.totalAmount, currency: cur(p) })), opts.convertTo);
  const target = total.targetCurrency;

  /** grouped spend, per group per currency, with each group's converted value so the ranking is comparable */
  const group = async (keyOf: (p: any) => string | null, limit = 10) => {
    const g = new Map<string, Array<{ amount: any; currency: string }>>();
    for (const p of pos) { const k = keyOf(p) || "Unassigned"; g.set(k, [...(g.get(k) ?? []), { amount: p.totalAmount, currency: cur(p) }]); }
    const rows = [];
    for (const [k, list] of g) {
      const m = await moneyOf(list, target);
      rows.push({ label: k, orders: list.length, byCurrency: m.byCurrency, value: m.converted.total, currency: target, hasUnconverted: Object.keys(m.unconverted).length > 0, unconverted: m.unconverted });
    }
    return rows.sort((a, b) => b.value - a.value).slice(0, limit);
  };
  const [byCategory, byDepartment, bySupplier] = await Promise.all([
    group((p) => p.requisition?.sourcingCategory), group((p) => p.requisition?.department), group((p) => p.vendor?.name),
  ]);

  // vendor concentration: the share of the (converted) spend held by the largest suppliers, and the Herfindahl index
  const all = await group((p) => p.vendor?.name, 10000);
  const sum = all.reduce((s, r) => s + r.value, 0);
  const shares = all.map((r) => (sum ? r.value / sum : 0));
  const top = (n: number) => r2(shares.slice(0, n).reduce((s, x) => s + x, 0) * 100);
  const hhi = Math.round(shares.reduce((s, x) => s + (x * 100) ** 2, 0));

  // method split
  const methodMap = new Map<string, Array<{ amount: any; currency: string }>>();
  for (const p of pos) { const k = String(p.requisition?.procurementMethod || "Not recorded").toUpperCase(); methodMap.set(k, [...(methodMap.get(k) ?? []), { amount: p.totalAmount, currency: cur(p) }]); }
  const rfqMethods = await prisma.procurementRfq.groupBy({ by: ["procurementMethod"], _count: { _all: true }, where: { createdAt: inPeriod } });
  const methodSplit = rfqMethods.map((m) => ({ label: String(m.procurementMethod || "RFQ"), events: m._count._all }));

  // pending approvals and exceptions
  const [pendReq, pendPo, pendInv, invoicesWithMatch, overrides, policyBlocks] = await Promise.all([
    prisma.purchaseRequisition.findMany({ where: { status: { in: ["SUBMITTED", "PENDING_APPROVAL", "PENDING_VC_EXECUTIVE_REVIEW"] } }, select: { totalAmount: true, currencyId: true } }),
    prisma.purchaseOrder.findMany({ where: { OR: [{ status: "PENDING" }, { approvalStatus: "PENDING" }] }, select: { totalAmount: true, currencyId: true } }),
    prisma.procurementInvoice.findMany({ where: { status: { in: ["PENDING", "PENDING_APPROVAL"] } }, select: { totalAmount: true, currencyId: true } }),
    prisma.procurementInvoice.findMany({ where: { createdAt: inPeriod, matchResult: { not: null } }, select: { matchResult: true, matchOverrideAt: true } }),
    prisma.procurementInvoice.count({ where: { matchOverrideAt: inPeriod } }),
    prisma.auditLog.count({ where: { createdAt: inPeriod, action: { startsWith: "POLICY_BLOCK" } } }),
  ]);
  const pending = await moneyOf([...pendReq, ...pendPo, ...pendInv].map((x) => ({ amount: x.totalAmount, currency: codes.get(x.currencyId ?? "") ?? null })), target);
  const withExceptions = invoicesWithMatch.filter((i) => Array.isArray((i.matchResult as any)?.exceptions) && (i.matchResult as any).exceptions.length).length;

  // cycle time by stage
  const reqs = await prisma.purchaseRequisition.findMany({ where: { createdAt: inPeriod, approvedAt: { not: null } }, select: { id: true, createdAt: true, approvedAt: true } });
  const rfqs = await prisma.procurementRfq.findMany({ where: { requisitionId: { in: reqs.map((r) => r.id) } }, select: { requisitionId: true, createdAt: true } });
  const ords = await prisma.purchaseOrder.findMany({ where: { requisitionId: { in: reqs.map((r) => r.id) } }, select: { requisitionId: true, createdAt: true, sentAt: true } });
  const stage = { toApproval: [] as number[], toSourcing: [] as number[], toOrder: [] as number[], toIssue: [] as number[], total: [] as number[] };
  const dd = (a: any, b: any) => (a && b ? (+new Date(b) - +new Date(a)) / 86400000 : null);
  for (const r of reqs) {
    const rfq = rfqs.find((x) => x.requisitionId === r.id);
    const po = ords.find((x) => x.requisitionId === r.id);
    const push = (k: keyof typeof stage, v: number | null) => v != null && v >= 0 && stage[k].push(v);
    push("toApproval", dd(r.createdAt, r.approvedAt)); push("toSourcing", dd(r.approvedAt, rfq?.createdAt)); push("toOrder", dd(rfq?.createdAt ?? r.approvedAt, po?.createdAt)); push("toIssue", dd(po?.createdAt, po?.sentAt)); push("total", dd(r.createdAt, po?.sentAt ?? po?.createdAt));
  }
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10000) / 10000 : null);

  return {
    kind: "executive",
    period: { from: day(period.from), to: day(period.to) },
    generatedAt: now.toISOString(),
    tiles: {
      totalProcurementValue: { ...total, orders: pos.length, drill: drill("procurement-spend", { from: day(period.from), to: day(period.to) }) },
      procurementVolume: { orders: pos.length, requisitions: await prisma.purchaseRequisition.count({ where: { createdAt: inPeriod } }), sourcingEvents: await prisma.procurementRfq.count({ where: { createdAt: inPeriod } }), suppliersUsed: new Set(pos.map((p) => p.vendorId)).size, drill: drill("purchase-order-register", { from: day(period.from), to: day(period.to) }) },
      cycleTime: { toApproval: avg(stage.toApproval), toSourcing: avg(stage.toSourcing), toOrder: avg(stage.toOrder), toIssue: avg(stage.toIssue), total: avg(stage.total), sample: stage.total.length, drill: drill("cycle-time", { from: day(period.from), to: day(period.to) }) },
      pendingApprovals: { count: pendReq.length + pendPo.length + pendInv.length, parts: { requisitions: pendReq.length, purchaseOrders: pendPo.length, invoices: pendInv.length }, value: pending, drill: drill("pending-approvals") },
      exceptionTransactions: { invoiceExceptions: withExceptions, matchOverrides: overrides, policyBlocks, total: withExceptions + overrides + policyBlocks, drill: drill("invoice-exceptions", { from: day(period.from), to: day(period.to) }) },
      vendorConcentration: { top1Pct: top(1), top3Pct: top(3), top5Pct: top(5), herfindahl: hhi, suppliers: all.length, basis: `Share of spend converted to ${target}${all.some((r) => r.hasUnconverted) ? " (spend in a currency with no rate is left out)" : ""}`, drill: drill("spend-by-supplier", { from: day(period.from), to: day(period.to) }) },
    },
    charts: {
      spendByCategory: { title: `Spend by category (${target})`, data: byCategory.map((r) => ({ label: r.label, value: r.value, orders: r.orders, byCurrency: r.byCurrency, hasUnconverted: r.hasUnconverted, drill: drill("spend-by-category", { category: r.label === "Unassigned" ? "" : r.label, from: day(period.from), to: day(period.to) }) })) },
      spendByDepartment: { title: `Spend by department (${target})`, data: byDepartment.map((r) => ({ label: r.label, value: r.value, orders: r.orders, byCurrency: r.byCurrency, hasUnconverted: r.hasUnconverted, drill: drill("spend-by-department", { department: r.label === "Unassigned" ? "" : r.label, from: day(period.from), to: day(period.to) }) })) },
      spendBySupplier: { title: `Spend by supplier (${target})`, data: bySupplier.map((r) => ({ label: r.label, value: r.value, orders: r.orders, byCurrency: r.byCurrency, hasUnconverted: r.hasUnconverted, drill: drill("spend-by-supplier", { supplier: r.label === "Unassigned" ? "" : r.label, from: day(period.from), to: day(period.to) }) })) },
      sourcingMethodSplit: { title: "Sourcing method split", data: methodSplit.map((m) => ({ label: m.label, value: m.events, drill: drill("rfq-tender-register", { from: day(period.from), to: day(period.to) }) })), spendByMethod: await Promise.all([...methodMap].map(async ([k, list]) => ({ method: k, orders: list.length, ...(await moneyOf(list, target)) }))) },
    },
  };
}
