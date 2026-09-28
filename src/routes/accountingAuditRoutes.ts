// @ts-nocheck
/** The Accounting audit trail (SRD ACC-AUD-01…04): every recorded change to an accounting record — journals, accounts,
 *  cash and bank, receivables, expenses, assets, investments, rates, inventory, recurring journals — together with the
 *  period-lock log, newest first, each with who, when, the record's reference and the values before and after.
 *  GET  /api/accounting/audit?area=&action=&userId=&q=&from=&to=&page=&limit=   one page (dates are tenant days)
 *  GET  /api/accounting/audit/export?…same filters                              CSV (at most 10,000 rows); the export is itself logged
 *  GET  /api/accounting/audit/integrity                                          every journal's audit number checked
 *  Mounted behind the Accounting access guard (read keys). */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";

const router = express.Router();
router.use(authenticate);

export const AUDIT_AREAS: Record<string, { label: string; types: string[] }> = {
  journals: { label: "Journals", types: ["JournalEntry", "ForexGainLoss"] },
  accounts: { label: "Chart of accounts", types: ["ChartOfAccounts"] },
  cash: { label: "Cash and bank", types: ["Bank", "CashbookEntry", "CASHBOOK_ENTRY", "CASHBOOK_TRANSFER", "CashbookBatch", "CashbookAudit", "CashbookReconciliationSession", "BankStatementImport", "BankStatementItem", "BankReconciliationAutoMatch"] },
  receivables: { label: "Receivables", types: ["Invoice", "CreditNote"] },
  payables: { label: "Payables", types: ["PurchaseInvoice", "PaymentRun"] },
  expenses: { label: "Expenses", types: ["Expense", "ExpenseClaim", "ExpenseClaimPolicy"] },
  assets: { label: "Fixed assets", types: ["Asset", "DepreciationRecord"] },
  investments: { label: "Short-term investments", types: ["ShortTermInvestmentInstrument", "ShortTermInvestmentApyRate", "ShortTermInvestmentAccrualCatchUp", "ShortTermInvestmentSettings"] },
  fx: { label: "Exchange rates", types: ["ExchangeRate"] },
  inventory: { label: "Inventory", types: ["InventoryItem", "StockMovement"] },
  recurring: { label: "Recurring journals", types: ["RecurringJournalTemplate"] },
  documents: { label: "Document vault", types: ["AccountingDocument"] },
  period: { label: "Period locks", types: [] },
};
const ALL_TYPES = Object.values(AUDIT_AREAS).flatMap((a) => a.types);
const AREA_OF = new Map(Object.entries(AUDIT_AREAS).flatMap(([k, a]) => a.types.map((t) => [t, k])));
const dayStart = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00+02:00`) : null);
const dayEnd = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T23:59:59.999+02:00`) : null);
const name = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);

async function fetchEvents(qs: any, max: number) {
  const area = String(qs.area || "");
  const from = dayStart(String(qs.from || "")), to = dayEnd(String(qs.to || ""));
  const created = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const q = String(qs.q || "").trim();
  const action = String(qs.action || "").trim();
  const userId = String(qs.userId || "").trim();
  const wantLog = area !== "period";
  const wantLock = !area || area === "period";
  const types = area && AUDIT_AREAS[area] ? AUDIT_AREAS[area].types : ALL_TYPES;
  // a search matches a record id directly, or a journal / account / invoice / credit note by its reference
  let ids: string[] | null = null;
  if (q) {
    const [je, coa, inv, cn] = await Promise.all([
      prisma.journalEntry.findMany({ where: { referenceNumber: { contains: q } }, select: { id: true }, take: 200 }),
      prisma.chartOfAccounts.findMany({ where: { OR: [{ accountNo: { startsWith: q } }, { accountName: { contains: q } }] }, select: { id: true }, take: 200 }),
      prisma.invoice.findMany({ where: { invoiceNumber: { contains: q } }, select: { id: true }, take: 200 }),
      prisma.creditNote.findMany({ where: { creditNoteNumber: { contains: q } }, select: { id: true }, take: 200 }),
    ]);
    ids = [q, ...je, ...coa, ...inv, ...cn].map((x) => (typeof x === "string" ? x : x.id));
    // a record since deleted is found by what its log entries recorded
    const hits: any[] = await prisma.$queryRawUnsafe(`SELECT DISTINCT entityId AS id FROM audit_logs WHERE entityType IN (${types.map(() => "?").join(",")}) AND (CAST(newValues AS CHAR) LIKE ? OR CAST(oldValues AS CHAR) LIKE ?) LIMIT 500`, ...types, `%${q}%`, `%${q}%`).catch(() => []);
    ids.push(...hits.map((h) => h.id));
  }
  const [logs, logCount, locks, lockCount] = await Promise.all([
    wantLog ? prisma.auditLog.findMany({
      where: { entityType: { in: types }, ...(created ? { createdAt: created } : {}), ...(action ? { action } : {}), ...(userId ? { userId } : {}), ...(ids ? { entityId: { in: ids } } : {}) },
      include: { user: { select: { firstName: true, lastName: true, email: true, role: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" }, take: max,
    }) : [],
    wantLog ? prisma.auditLog.count({ where: { entityType: { in: types }, ...(created ? { createdAt: created } : {}), ...(action ? { action } : {}), ...(userId ? { userId } : {}), ...(ids ? { entityId: { in: ids } } : {}) } }) : 0,
    wantLock && !q ? prisma.periodLockAuditLog.findMany({
      where: { ...(created ? { createdAt: created } : {}), ...(action ? { actionType: action } : {}), ...(userId ? { performedById: userId } : {}) },
      include: { performedBy: { select: { firstName: true, lastName: true, email: true, role: { select: { name: true } } } }, fiscalPeriod: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: max,
    }).catch(() => []) : [],
    wantLock && !q ? prisma.periodLockAuditLog.count({ where: { ...(created ? { createdAt: created } : {}), ...(action ? { actionType: action } : {}), ...(userId ? { performedById: userId } : {}) } }).catch(() => 0) : 0,
  ]);
  const events = [
    ...logs.map((l) => ({ id: l.id, at: l.createdAt, action: l.action, area: AREA_OF.get(l.entityType) || "", entityType: l.entityType, entityId: l.entityId, userId: l.userId, user: name(l.user), role: l.user?.role?.name || null, oldValues: l.oldValues, newValues: l.newValues, ip: l.ipAddress || null, reason: (l.newValues && (l.newValues.reason || l.newValues.voidReason)) || null })),
    ...locks.map((l) => ({ id: l.id, at: l.createdAt, action: l.actionType, area: "period", entityType: "PeriodLock", entityId: l.fiscalPeriodId, userId: l.performedById, user: name(l.performedBy), role: l.performedBy?.role?.name || null, oldValues: l.oldValue, newValues: l.newValue, ip: null, reason: l.reason, reference: [l.fiscalPeriod?.name, l.moduleCode].filter(Boolean).join(" · ") || null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { events, total: logCount + lockCount };
}

/** The record's own reference (journal number, account, invoice, credit note), else one found in its logged values. */
async function withReferences(events: any[]) {
  const by = (t) => [...new Set(events.filter((e) => e.entityType === t && !e.reference).map((e) => e.entityId))];
  const [je, coa, inv, cn] = await Promise.all([
    prisma.journalEntry.findMany({ where: { id: { in: by("JournalEntry") } }, select: { id: true, referenceNumber: true } }),
    prisma.chartOfAccounts.findMany({ where: { id: { in: by("ChartOfAccounts") } }, select: { id: true, accountNo: true, accountName: true } }),
    prisma.invoice.findMany({ where: { id: { in: by("Invoice") } }, select: { id: true, invoiceNumber: true } }),
    prisma.creditNote.findMany({ where: { id: { in: by("CreditNote") } }, select: { id: true, creditNoteNumber: true } }),
  ]);
  const ref = new Map([...je.map((x) => [x.id, x.referenceNumber]), ...coa.map((x) => [x.id, `${x.accountNo} ${x.accountName}`]), ...inv.map((x) => [x.id, x.invoiceNumber]), ...cn.map((x) => [x.id, x.creditNoteNumber])]);
  const pick = (v) => v && typeof v === "object" ? v.referenceNumber || v.invoiceNumber || v.creditNoteNumber || (v.accountNo && `${v.accountNo} ${v.accountName || ""}`.trim()) || v.reference || v.name || v.assetName || null : null;
  return events.map((e) => ({ ...e, reference: e.reference || ref.get(e.entityId) || pick(e.newValues) || pick(e.oldValues) || null }));
}

router.get("/", async (req: any, res: any) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
    const { events, total } = await fetchEvents(req.query, page * limit);
    const items = await withReferences(events.slice((page - 1) * limit, page * limit));
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set((await prisma.auditLog.findMany({ where: { entityType: { in: ALL_TYPES } }, select: { userId: true }, distinct: ["userId"], take: 500 })).map((x) => x.userId))] } }, select: { id: true, firstName: true, lastName: true, email: true } });
    res.json({ success: true, data: { items, total, page, limit, areas: Object.entries(AUDIT_AREAS).map(([id, a]) => ({ id, label: a.label })), users: users.map((u) => ({ id: u.id, name: name(u), email: u.email })).map((u, _i, all) => ({ id: u.id, name: all.filter((x) => x.name === u.name).length > 1 ? `${u.name} (${u.email})` : u.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))) } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to load the audit trail" });
  }
});

router.get("/export", async (req: any, res: any) => {
  try {
    const { events, total } = await fetchEvents(req.query, 10000);
    const rows = await withReferences(events.slice(0, 10000));
    const cell = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["When (UTC)", "Area", "Record type", "Record", "Record id", "Action", "User", "Role", "Reason", "Before", "After", "IP address"];
    const csv = [head, ...rows.map((e) => [e.at.toISOString(), AUDIT_AREAS[e.area]?.label || e.area, e.entityType, e.reference, e.entityId, e.action, e.user, e.role, e.reason, e.oldValues, e.newValues, e.ip])].map((r) => r.map(cell).join(",")).join("\r\n");
    await AuditService.log({ userId: req.user.id, action: "AUDIT_EXPORT", entityType: "AccountingAudit", entityId: "accounting", newValues: { filters: req.query, rows: rows.length, total } }).catch(() => null);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="accounting-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to export the audit trail" });
  }
});

/** Every journal carries a number from one counter: none missing, none repeated, the counter ahead of them all, and
 *  every posted journal balanced on its own lines — including a void's VR- reversal: reversing a balanced journal
 *  always balances too, so excluding VR-/REV- here (as the *reports* correctly do, to avoid double-counting activity
 *  that nets to zero) only hid a reversal that was itself broken. That blind spot let 13 unbalanced VR-PAYROLL-…
 *  journals sit posted, undetected, for weeks (see A12 in the migration log) — this check must never share that
 *  exclusion. A missing number means a journal was removed after it was numbered. */
router.get("/integrity", async (_req: any, res: any) => {
  try {
    const nums: any[] = await prisma.$queryRawUnsafe(`SELECT auditTrailSequenceNumber AS n FROM journal_entries WHERE auditTrailSequenceNumber IS NOT NULL ORDER BY auditTrailSequenceNumber`);
    const list = nums.map((r) => Number(r.n));
    const [unnumbered, counter, unbalanced] = await Promise.all([
      prisma.journalEntry.count({ where: { auditTrailSequenceNumber: null } }),
      prisma.auditTrailSequence.findUnique({ where: { name: "journal_entry" } }),
      prisma.$queryRawUnsafe(`SELECT j.referenceNumber AS ref FROM journal_entries j JOIN journal_entry_lines l ON l.journalEntryId = j.id
        WHERE j.status = 'POSTED' GROUP BY j.id, j.referenceNumber HAVING ABS(SUM(l.debitAmount) - SUM(l.creditAmount)) > 0.01 LIMIT 50`),
    ]);
    const missing: Array<{ from: number; to: number }> = [];
    let dupes = 0;
    for (let i = 1; i < list.length; i++) {
      if (list[i] === list[i - 1]) dupes++;
      else if (list[i] > list[i - 1] + 1) missing.push({ from: list[i - 1] + 1, to: list[i] - 1 });
    }
    const last = list.length ? list[list.length - 1] : null;
    const issued = counter ? counter.value : null;
    if (issued != null && last != null && issued > last) missing.push({ from: last + 1, to: issued });
    const missingCount = missing.reduce((s, m) => s + m.to - m.from + 1, 0);
    const behind = issued != null && last != null && issued < last;
    const ok = !missingCount && !dupes && !unnumbered && !behind && !(unbalanced as any[]).length;
    res.json({ success: true, data: { ok, journals: list.length + unnumbered, first: list[0] ?? null, last, lastIssued: issued, missing: missing.slice(0, 100), missingCount, duplicates: dupes, unnumbered, counterBehind: behind, unbalancedPosted: (unbalanced as any[]).map((r) => r.ref), checkedAt: new Date() } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to check the audit trail" });
  }
});

export default router;
