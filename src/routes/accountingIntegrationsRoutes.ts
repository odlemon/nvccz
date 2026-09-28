// @ts-nocheck
/** GET /api/accounting/integrations: how each connected module feeds the ledger, measured from the records — journals it
 *  raised (all time, last 30 days, waiting to be posted, voided, the latest), the scheduled jobs that carry it with their
 *  last run, and the failures recorded for it. Nothing here is configured by hand; a module with no journals shows none.
 *  Mounted behind the Accounting access guard (read keys). */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { prisma } from "../utils/database";

const router = express.Router();
router.use(authenticate);

const pre = (...p: string[]) => p.map((x) => ({ referenceNumber: { startsWith: `${x}-` } }));
export const SOURCES = [
  { id: "procurement", label: "Procurement", feeds: "Supplier invoices and payments", link: "/procurement",
    where: { OR: [{ procurementInvoices: { some: {} } }, { purchaseInvoices: { some: {} } }, { purchaseInvoicePayments: { some: {} } }] }, failures: ["FINANCE_HANDOFF_REJECTED"] },
  { id: "payroll", label: "Payroll", feeds: "Payroll accruals and payments", link: "/payroll",
    where: { OR: [{ payrollRuns: { some: {} } }, ...pre("PAYROLL")] } },
  { id: "investments", label: "Short-term investments", feeds: "Placements, daily interest, settlements, month-end FX", page: "investments",
    where: { OR: [{ stiAccrualsAsJournal: { some: {} } }, { stiAccrualsAsReversal: { some: {} } }, { stiLiquidationInstruments: { some: {} } }, { stiFxRevaluationEntries: { some: {} } }, ...pre("STI")] }, jobs: ["sti.accrual", "sti.maturity", "sti.fx-month-end"] },
  { id: "assets", label: "Fixed assets", feeds: "Purchases, depreciation, disposals", page: "assets",
    where: { OR: pre("ASSET", "DEP", "DISPOSAL") }, jobs: ["assets.depreciation"] },
  { id: "performance", label: "Performance", feeds: "Goal-linked financial postings", link: "/performance",
    where: { OR: [{ performanceProgressEvents: { some: {} } }, ...pre("PERF")] }, failures: ["GL_POST_FAILED"] },
  { id: "funds", label: "Funds and portfolio", feeds: "Capital calls, distributions, management fees, dividends, listed trades", link: "/portfolio",
    where: { OR: [{ capitalCall: { isNot: null } }, { distribution: { isNot: null } }, { managementFeePeriod: { isNot: null } }, { portfolioDividends: { some: {} } }, { listedEquityTradeSettlements: { some: {} } }, ...pre("CCALL", "CCALLPAY", "DIST", "DISTPAY", "MGMTFEE")] } },
  { id: "rates", label: "Exchange rates", feeds: "The official USD/ZiG rate each day", page: "fx", jobs: ["rates.daily"] },
];
const JOB_LABEL = { "sti.accrual": "Daily interest", "sti.maturity": "Maturity alerts", "sti.fx-month-end": "Month-end FX", "assets.depreciation": "Monthly depreciation", "rates.daily": "Daily rate" };

router.get("/", async (_req: any, res: any) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const runs: any[] = await prisma.$queryRawUnsafe("SELECT job_key, status, started_at, finished_at, error FROM accounting_job_runs WHERE (job_key, started_at) IN (SELECT job_key, MAX(started_at) FROM accounting_job_runs GROUP BY job_key)").catch(() => []);
    const lastRun = new Map(runs.map((r) => [r.job_key, r]));
    const out = [];
    for (const s of SOURCES) {
      let journals = null;
      if (s.where) {
        const [total, last30, pending, voided, latest] = await Promise.all([
          prisma.journalEntry.count({ where: s.where }),
          prisma.journalEntry.count({ where: { AND: [s.where, { createdAt: { gte: since } }] } }),
          prisma.journalEntry.count({ where: { AND: [s.where, { status: "PENDING" }] } }),
          prisma.journalEntry.count({ where: { AND: [s.where, { status: "VOID" }] } }),
          prisma.journalEntry.findFirst({ where: s.where, orderBy: { createdAt: "desc" }, select: { referenceNumber: true, createdAt: true, status: true } }),
        ]);
        journals = { total, last30, pending, voided, latest };
      }
      const failures = s.failures ? await prisma.auditLog.count({ where: { action: { in: s.failures }, createdAt: { gte: since } } }) : null;
      const jobs = (s.jobs || []).map((k) => { const r = lastRun.get(k); return { key: k, label: JOB_LABEL[k] || k, status: r ? r.status : null, at: r ? r.finished_at || r.started_at : null, error: r && r.status === "failed" ? r.error : null }; });
      let extra = null;
      if (s.id === "rates") {
        const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: "desc" }, select: { date: true, rate: true, source: true } }).catch(() => null);
        extra = latest ? { lastRateDate: latest.date, source: latest.source } : null;
      }
      out.push({ id: s.id, label: s.label, feeds: s.feeds, link: s.link || null, page: s.page || null, journals, jobs, failures30: failures, extra });
    }
    res.json({ success: true, data: out });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to load integrations" });
  }
});

export default router;
