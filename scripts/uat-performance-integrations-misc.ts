/**
 * Performance integration points reached by other modules and legacy endpoints (not the v22 screens): the real-time AUM and
 * VC CAC syncs (C1/G3), the legacy goal-tracking check (A8), the BSC period push (A4) and budget-alignment spend (A5).
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/uat-performance-integrations-misc.ts
 * Creates its own goals (titled "UAT Misc …") and removes them at the end.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { AumRealtimeSyncService } from "../src/services/AumRealtimeSyncService";
import { VcCacSyncService } from "../src/services/VcCacSyncService";
import { EnhancedGoalTrackingService } from "../src/services/EnhancedGoalTrackingService";
import { BscDigitalEntryService } from "../src/services/BscDigitalEntryService";
import { PerformanceGoalProgressBridge } from "../src/services/PerformanceGoalProgressBridge";
import { getPostedPeriodRevenueExpenseNetProfit } from "../src/services/AccountingGlPeriodTotalsService";

const prisma = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };
const tag = `UAT Misc ${Date.now() % 100000}`;
const value = async (id: string) => Number((await prisma.performanceGoal.findUnique({ where: { id }, select: { currentValue: true } }))!.currentValue);

async function main() {
  await assertDevDatabase(prisma, "uat-performance-integrations-misc");
  const admin = await prisma.user.findFirst({ where: { email: "admin@nts.com" }, select: { id: true } });
  const actorId = admin!.id;
  const made: string[] = [];
  const kpiIds: string[] = [];
  const goal = async (title: string, extra: any = {}) => { const g = await prisma.performanceGoal.create({ data: { title: `${tag} ${title}`, type: "company", status: "active", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), targetValue: 1000000, createdById: actorId, ...extra } }); made.push(g.id); return g; };
  try {
    // ---- C1 AUM: the value comes in through the ledger, and a person's source-system mapping is kept
    const aum = await goal("AUM", { formulaType: "AUM", syncEndpointPath: "https://feeds.example/v1/aum" });
    const r = await AumRealtimeSyncService.recomputeAndPersist({ source: "system" });
    const aumRow = await prisma.performanceGoal.findUnique({ where: { id: aum.id } });
    const aumEv = await prisma.performanceGoalProgressEvent.findMany({ where: { goalId: aum.id } });
    check("AUM sync sets the goal to the computed AUM", Math.abs(Number(aumRow!.currentValue) - Number(r.totalAum)) < 0.01, `${aumRow!.currentValue} vs ${r.totalAum}`);
    check("…through an integration event (not a direct overwrite, not posted to the GL)", aumEv.length === 1 && aumEv[0].source === "integration" && !aumEv[0].journalEntryId);
    check("…and the goal keeps its /v1/ source mapping", aumRow!.syncEndpointPath === "https://feeds.example/v1/aum", String(aumRow!.syncEndpointPath));
    await PerformanceGoalProgressBridge.applyDelta({ goalId: aum.id, delta: 5, source: "manual", actorId, skipJournal: true });
    check("a later check-in adds to the synced value instead of wiping it", Math.abs((await value(aum.id)) - (Number(r.totalAum) + 5)) < 0.01, String(await value(aum.id)));
    await AumRealtimeSyncService.recomputeAndPersist({ source: "system" });
    check("the next sync brings the goal back to the computed AUM (the source is authoritative for this KPI)", Math.abs((await value(aum.id)) - Number(r.totalAum)) < 0.01, String(await value(aum.id)));
    const evCount = await prisma.performanceGoalProgressEvent.count({ where: { goalId: aum.id } });
    await AumRealtimeSyncService.recomputeAndPersist({ source: "system" });
    check("a sync with nothing new records nothing (idempotent)", (await prisma.performanceGoalProgressEvent.count({ where: { goalId: aum.id } })) === evCount);

    // ---- G3 VC CAC: same, and an unmapped goal is marked as fed in-process
    const cac = await goal("CAC", { formulaType: "VC_CAC" });
    const c = await VcCacSyncService.recomputeAndPersist({ source: "system" });
    const cacRow = await prisma.performanceGoal.findUnique({ where: { id: cac.id } });
    check("VC CAC sync writes through the ledger when computable, and leaves the value alone when not", c.cac == null ? Number(cacRow!.currentValue || 0) === 0 : Math.abs(Number(cacRow!.currentValue) - Number(c.cac)) < 0.01, `${cacRow!.currentValue} vs ${c.cac}`);
    check("…an unmapped goal is marked as fed in-process", cacRow!.syncEndpointPath === "in-process://realtime-vc-cac", String(cacRow!.syncEndpointPath));

    // ---- A8 legacy goal tracking: a real figure over the goal window; a failed read leaves the goal alone
    const rev = await goal("Tracked revenue", { dataSourceModule: "accounting", dataSourceField: "IncomeStatement.TotalRevenue" });
    const expected = (await getPostedPeriodRevenueExpenseNetProfit(new Date("2026-01-01"), new Date(), { excludePerformanceJournals: true })).revenue;
    const t1 = await EnhancedGoalTrackingService.checkGoalStatus(rev.id);
    check("goal tracking reads posted revenue over the goal window (it used to fail and write 0)", Math.abs((await value(rev.id)) - Math.round(expected * 100) / 100) < 0.01 && t1.status !== "source_error", `${await value(rev.id)} vs ${expected} (${t1.status})`);
    await prisma.performanceGoal.update({ where: { id: rev.id }, data: { dataSourceField: "IncomeStatement.NoSuchMetric" } });
    const before = await value(rev.id);
    const t2 = await EnhancedGoalTrackingService.checkGoalStatus(rev.id);
    check("a source that cannot be read leaves the goal unchanged (not 0)", t2.status === "source_error" && (await value(rev.id)) === before, `${t2.status} ${before}→${await value(rev.id)}`);

    // ---- A4: a goal the login sync keeps in step with the ledger refuses a period push (double count)
    const k = await prisma.kPI.create({ data: { name: `${tag} Rev KPI`, code: `${tag} REV`.replace(/\W+/g, "_").toUpperCase(), isFinancial: true, accountNumber: "4000", accountType: "Revenue", journalEntryType: "Credit", approvalStatus: "approved", isActive: true } });
    kpiIds.push(k.id);
    const synced = await goal("Synced revenue", { kpiId: k.id });
    let refused = "";
    try { await BscDigitalEntryService.submitAccountingPeriodFromGl({ periodStart: "2026-09-01", periodEnd: "2026-09-30", revenueGoalId: synced.id, responsibleUserId: actorId }); } catch (e: any) { refused = e.message; }
    check("a period push onto a ledger-synced goal is refused", /kept in step with the general ledger/.test(refused), refused);

    // ---- D: source mappings refresh on their own schedule (the page showed a frequency; nothing ran it)
    const http = await import("http");
    const srv = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ data: { metrics: { value: 77 } } })); });
    await new Promise<void>((r) => srv.listen(3198, "127.0.0.1", () => r()));
    try {
      const { runDueIntegrationRefreshes } = await import("../src/services/PerformanceIntegrationOverviewService");
      const due = await goal("Mapped due", { syncEndpointPath: "http://127.0.0.1:3198/v1/metric", syncConfig: { fieldPath: "data.metrics.value" }, trackingFrequency: "daily", lastSyncedAt: new Date(Date.now() - 3 * 86400000), dataSourceModule: "external" });
      const fresh = await goal("Mapped fresh", { syncEndpointPath: "http://127.0.0.1:3198/v1/metric", syncConfig: { fieldPath: "data.metrics.value" }, trackingFrequency: "monthly", lastSyncedAt: new Date(), dataSourceModule: "external" });
      await runDueIntegrationRefreshes();
      const dRow = await prisma.performanceGoal.findUnique({ where: { id: due.id } });
      const fRow = await prisma.performanceGoal.findUnique({ where: { id: fresh.id } });
      check("a mapping past its frequency is refreshed by the schedule (value 77)", Number(dRow!.currentValue) === 77 || Number(dRow!.pendingActualValue) === 77, `${dRow!.currentValue}/${dRow!.pendingActualValue}`);
      check("a mapping that is not due is left alone", Number(fRow!.currentValue || 0) === 0 && fRow!.pendingActualValue == null, `${fRow!.currentValue}`);
    } finally {
      srv.close();
    }

    // ---- A5: budget-alignment spend is the GL expense only (procurement and event spend post their own journals)
    const spendGoal = await goal("Spend alignment", { formulaType: "STRATEGIC_ALLOCATION_COMPLIANCE" });
    await BscDigitalEntryService.submitResourceBudgetAlignment({ goalId: spendGoal.id, strategicAllocation: 1000000, responsibleUserId: actorId, periodStart: "2026-01-01", periodEnd: "2026-09-30" });
    const sc: any = (await prisma.performanceGoal.findUnique({ where: { id: spendGoal.id }, select: { syncConfig: true } }))!.syncConfig || {};
    const br = sc.moduleBreakdown || {};
    const glExpense = (await getPostedPeriodRevenueExpenseNetProfit(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-09-30T23:59:59.999Z"), { excludePerformanceJournals: true })).totalExpense;
    check("spend is the GL expense, not GL + procurement + events again", Math.abs(Number(br.totalSpend) - Number(br.accountingExpense)) < 0.01 && Math.abs(Number(br.accountingExpense) - glExpense) < 0.01, JSON.stringify({ br, glExpense }).slice(0, 260));
  } finally {
    for (const id of made) {
      await prisma.performanceGoalProgressEvent.deleteMany({ where: { goalId: id } });
      await prisma.activityLog.deleteMany({ where: { goalId: id } });
      await prisma.performanceGoal.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of kpiIds) await prisma.kPI.delete({ where: { id } }).catch(() => undefined);
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); process.exit(failed ? 1 : process.exitCode || 0); });
