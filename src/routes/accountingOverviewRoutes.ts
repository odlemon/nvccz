// @ts-nocheck
/** GET /api/accounting/overview — the Command Centre (SRD ACC-REP-11), every figure from the ledger or the records:
 *  cash per bank and per currency (ledger balance of each bank's account), receivables and payables (their control
 *  accounts, with the open documents behind them), revenue, expenses and net income for the year to date against the
 *  same period last year, results by month for the last twelve, what is waiting (approvals, drafts, unreconciled bank
 *  lines, overdue invoices, bills due), the month being closed, the last integrity check and the latest posted journals.
 *  Amounts are in the base currency except cash, which is per currency (not translated, FX-01).
 *  Mounted behind the Accounting access guard (read keys). */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import { buildJournalEntryWhereForGlReporting } from "../utils/journalEntryReportingFilter";

const router = express.Router();
router.use(authenticate);
const r2 = (x: number) => Math.round(x * 100) / 100;
const n = (v: any) => Number(v?.toString?.() ?? v ?? 0) || 0;

async function tenantToday(): Promise<string> {
  const { default: FiscalCalendarService } = await import("../services/FiscalCalendarService");
  const tz = await FiscalCalendarService.getFiscalTimezone().catch(() => "Africa/Harare");
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Income-statement totals (credit-normal revenue, debit-normal expenses) per month for a range, base currency — the
 *  same journals as the statements (buildJournalEntryWhereForGlReporting). */
async function pnlByMonth(currencyId: string, from: string, to: string) {
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccount: { financialStatement: { contains: "Income" } },
      journalEntry: buildJournalEntryWhereForGlReporting({ gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59.999Z`) }, currencyId),
    },
    select: { debitAmount: true, creditAmount: true, chartOfAccount: { select: { accountType: true } }, journalEntry: { select: { transactionDate: true } } },
  });
  const by = new Map();
  for (const l of lines) {
    const ym = l.journalEntry.transactionDate.toISOString().slice(0, 7);
    const m = by.get(ym) || { month: ym, revenue: 0, expenses: 0 };
    if (["Revenue", "Income"].includes(l.chartOfAccount.accountType)) m.revenue += n(l.creditAmount) - n(l.debitAmount);
    else m.expenses += n(l.debitAmount) - n(l.creditAmount);
    by.set(ym, m);
  }
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ month: m.month, revenue: r2(m.revenue), expenses: r2(m.expenses), netIncome: r2(m.revenue - m.expenses) }));
}

async function balanceOf(accountNo: string, currencyId: string, upto: Date) {
  const acc = await prisma.chartOfAccounts.findUnique({ where: { accountNo }, select: { id: true, accountNo: true, accountName: true } });
  if (!acc) return null;
  const agg = await prisma.journalEntryLine.aggregate({ where: { chartOfAccountId: acc.id, journalEntry: buildJournalEntryWhereForGlReporting({ lte: upto }, currencyId) }, _sum: { debitAmount: true, creditAmount: true } });
  return { account: `${acc.accountNo} ${acc.accountName}`, debitBalance: r2(n(agg._sum.debitAmount) - n(agg._sum.creditAmount)) };
}

router.get("/", async (req: any, res: any) => {
  try {
    const today = await tenantToday();
    const upto = new Date(`${today}T23:59:59.999Z`);
    const base = await prisma.currency.findFirst({ where: { isDefault: true }, select: { id: true, code: true } });
    if (!base) return res.status(500).json({ success: false, message: "No base currency is set." });
    const y = Number(today.slice(0, 4));
    const ytdFrom = `${y}-01-01`, lyFrom = `${y - 1}-01-01`, lyTo = `${y - 1}${today.slice(4)}`;
    const d12 = new Date(Date.UTC(y, Number(today.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10);

    const banks = await prisma.bank.findMany({ where: { isActive: true, glAccountId: { not: null } }, select: { id: true, name: true, currencyId: true, glAccountId: true, currency: { select: { code: true } } } });
    const cash = await Promise.all(banks.map(async (b) => {
      const agg = await prisma.journalEntryLine.aggregate({ where: { chartOfAccountId: b.glAccountId, journalEntry: buildJournalEntryWhereForGlReporting({ lte: upto }, b.currencyId) }, _sum: { debitAmount: true, creditAmount: true } });
      const unrec = await prisma.cashbookEntry.count({ where: { bankId: b.id, status: "POSTED", isReconciled: false } });
      return { bankId: b.id, bank: b.name, currency: b.currency?.code, balance: r2(n(agg._sum.debitAmount) - n(agg._sum.creditAmount)), unreconciled: unrec };
    }));
    const byCurrency = {};
    for (const c of cash) byCurrency[c.currency] = r2((byCurrency[c.currency] || 0) + c.balance);

    const [ar, ap, openInv, overdueInv, openBills, dueBills, ytd, ly, months, drafts, approvals, recent, integrity] = await Promise.all([
      balanceOf("1200", base.id, upto),
      balanceOf("2000", base.id, upto),
      prisma.invoice.aggregate({ where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, _count: { _all: true } }),
      prisma.invoice.count({ where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lt: new Date(`${today}T00:00:00Z`) } } }),
      prisma.procurementInvoice.count({ where: { status: "APPROVED", paymentStatus: { not: "PAID" } } }),
      prisma.procurementInvoice.count({ where: { status: "APPROVED", paymentStatus: { not: "PAID" }, dueDate: { lte: new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000) } } }),
      pnlByMonth(base.id, ytdFrom, today),
      pnlByMonth(base.id, lyFrom, lyTo),
      pnlByMonth(base.id, d12, today),
      prisma.journalEntry.count({ where: { status: "PENDING" } }),
      prisma.approvalRequest.count({ where: { status: "PENDING", stageType: { in: ["PAYMENT_EXECUTION", "INVESTMENT_BOOKING", "MASTER_DATA_COA"] } } }),
      prisma.journalEntry.findMany({ where: { status: "POSTED", referenceNumber: { not: { startsWith: "VR-" } } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, referenceNumber: true, description: true, transactionDate: true, totalAmount: true, currency: { select: { code: true } }, createdBy: { select: { firstName: true, lastName: true, email: true } } } }),
      prisma.$queryRawUnsafe("SELECT status, finished_at, summary FROM accounting_job_runs WHERE job_key = 'ledger.integrity' ORDER BY started_at DESC LIMIT 1").catch(() => []),
    ]);
    const sum = (rows, k) => r2(rows.reduce((s, r) => s + r[k], 0));
    const totals = (rows) => ({ revenue: sum(rows, "revenue"), expenses: sum(rows, "expenses"), netIncome: sum(rows, "netIncome") });

    // the month being closed: last month while its ledger is open, otherwise this month
    let close = null;
    try {
      const periods = await prisma.fiscalPeriod.findMany({ where: { startDate: { lte: upto } }, orderBy: { startDate: "desc" }, take: 2, include: { moduleLocks: { where: { moduleCode: "GL" } } } });
      const [cur, prev] = periods;
      const target = prev && !(prev.moduleLocks[0] && prev.moduleLocks[0].lockStatus !== "OPEN") ? prev : cur;
      if (target) {
        const tasks = await prisma.accountingCloseTask.groupBy({ by: ["status"], where: { fiscalPeriodId: target.id }, _count: { _all: true } });
        const total = tasks.reduce((s, t) => s + t._count._all, 0), done = tasks.filter((t) => t.status === "COMPLETE").reduce((s, t) => s + t._count._all, 0);
        close = { period: target.name, locked: !!(target.moduleLocks[0] && target.moduleLocks[0].lockStatus !== "OPEN"), tasks: total, complete: done };
      }
    } catch { /* no calendar */ }

    const ig = (integrity as any[])[0];
    res.json({
      success: true,
      data: {
        asOf: today, baseCurrency: base.code,
        cash: { banks: cash, byCurrency },
        receivables: { control: ar, openInvoices: openInv._count._all, overdue: overdueInv },
        payables: { control: ap, openBills, dueWithin7Days: dueBills },
        results: { ytd: { from: ytdFrom, to: today, ...totals(ytd) }, lastYear: { from: lyFrom, to: lyTo, ...totals(ly) }, months },
        waiting: { draftJournals: drafts, approvalRequests: approvals, unreconciledBankLines: cash.reduce((s, c) => s + c.unreconciled, 0), overdueInvoices: overdueInv, billsDue: dueBills },
        close,
        integrity: ig ? { status: ig.status, at: ig.finished_at, summary: typeof ig.summary === "string" ? JSON.parse(ig.summary || "{}") : ig.summary } : null,
        recent: recent.map((j) => ({ id: j.id, reference: j.referenceNumber, description: j.description, date: j.transactionDate, amount: n(j.totalAmount), currency: j.currency?.code, by: j.createdBy ? [j.createdBy.firstName, j.createdBy.lastName].filter(Boolean).join(" ") || j.createdBy.email : null })),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to build the overview" });
  }
});

export default router;
