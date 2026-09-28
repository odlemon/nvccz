/**
 * Removes the test records the Performance UAT suites (`nvccz-new` worktree, scripts/_uat/perf-*.mjs) leave on a
 * dev database. Run after a regression: npx ts-node --transpile-only scripts/cleanup-performance-uat-debris.ts
 *
 * Scoped to Performance-domain rows only, identified by a "UAT" name/title prefix, or (contracts) by having been
 * created for one of the "Perf *" test-fixture users or carrying an implausible fiscal year. The fixture users
 * themselves are kept. Deletes in dependency order; each step re-reads current state, so a rerun is safe.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const p = new PrismaClient();
const log = (label: string, n: number) => console.log(`${label}: ${n}`);

async function main() {
  await assertDevDatabase(p, "performance-cleanup");

  // goals: UAT title, or pointing at a KPI that no longer exists; plus any sub-goal of one being removed
  const kpiIds = new Set((await p.kPI.findMany({ where: { NOT: { name: { startsWith: "UAT" } } }, select: { id: true } })).map((k) => k.id));
  const allGoals = await p.performanceGoal.findMany({ select: { id: true, title: true, kpiId: true, parentGoalId: true } });
  const goalIds = new Set(allGoals.filter((g) => g.title.startsWith("UAT") || (g.kpiId && !kpiIds.has(g.kpiId))).map((g) => g.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of allGoals) if (g.parentGoalId && goalIds.has(g.parentGoalId) && !goalIds.has(g.id)) { goalIds.add(g.id); grew = true; }
  }
  const projectIds = new Set((await p.project.findMany({ where: { name: { startsWith: "UAT" } }, select: { id: true } })).map((x) => x.id));
  const taskIds = new Set(
    (await p.task.findMany({ select: { id: true, title: true, goalId: true, projectId: true } }))
      .filter((t) => t.title.startsWith("UAT") || (t.goalId && goalIds.has(t.goalId)) || (t.projectId && projectIds.has(t.projectId)))
      .map((t) => t.id)
  );
  const G = [...goalIds], T = [...taskIds], P = [...projectIds];

  // rows that block deletion (NoAction foreign keys)
  log("activity logs", (await p.activityLog.deleteMany({ where: { OR: [{ goalId: { in: G } }, { taskId: { in: T } }] } })).count);
  log("timesheet entries", (await p.timesheetEntry.deleteMany({ where: { OR: [{ taskId: { in: T } }, { projectId: { in: P } }] } })).count);
  log("tasks", (await p.task.deleteMany({ where: { id: { in: T } } })).count);
  // a multi-row DELETE does not order child-before-parent, so break the goal hierarchy first
  await p.performanceGoal.updateMany({ where: { id: { in: G } }, data: { parentGoalId: null } });
  log("goals (progress events cascade)", (await p.performanceGoal.deleteMany({ where: { id: { in: G } } })).count);
  log("projects", (await p.project.deleteMany({ where: { id: { in: P } } })).count);
  log("kpis", (await p.kPI.deleteMany({ where: { name: { startsWith: "UAT" } } })).count);
  log("themes", (await p.performanceTheme.deleteMany({ where: { name: { startsWith: "UAT" } } })).count);

  // contracts made for a test-fixture user, or with a fiscal year no real contract would carry
  const year = new Date().getFullYear();
  const C = (await p.performanceContract.findMany({ select: { id: true, title: true, periodLabel: true } }))
    .filter((c) => /Perf (HRManager|Employee|DeptManager|Executive|SysAdmin)/.test(c.title) || (/^\d{4}$/.test(c.periodLabel || "") && (Number(c.periodLabel) < year - 2 || Number(c.periodLabel) > year + 3)))
    .map((c) => c.id);
  log("contract scorecards", (await p.performanceScorecard.deleteMany({ where: { contractId: { in: C } } })).count);
  log("contract signatures", (await p.performanceContractSignature.deleteMany({ where: { contractId: { in: C } } })).count);
  log("contract events", (await p.performanceContractEvent.deleteMany({ where: { contractId: { in: C } } })).count);
  await p.performanceGoal.updateMany({ where: { performanceContractId: { in: C } }, data: { performanceContractId: null } });
  log("contracts", (await p.performanceContract.deleteMany({ where: { id: { in: C } } })).count);

  const D = (await p.performanceDocument.findMany({ where: { name: { startsWith: "UAT" } }, select: { id: true } })).map((d) => d.id);
  await p.performanceDocumentVersion.deleteMany({ where: { documentId: { in: D } } });
  await p.performanceDocumentEvent.deleteMany({ where: { documentId: { in: D } } });
  log("vault documents", (await p.performanceDocument.deleteMany({ where: { id: { in: D } } })).count);

  const R = (await p.performanceReportDefinition.findMany({ where: { name: { startsWith: "UAT" } }, select: { id: true } })).map((r) => r.id);
  await p.performanceReportRun.deleteMany({ where: { definitionId: { in: R } } });
  await p.performanceReportSchedule.deleteMany({ where: { definitionId: { in: R } } });
  log("report definitions", (await p.performanceReportDefinition.deleteMany({ where: { id: { in: R } } })).count);

  const S = (await p.performanceStrategy.findMany({ where: { title: { startsWith: "UAT" } }, select: { id: true } })).map((s) => s.id);
  const RV = (await p.performanceStrategyReview.findMany({ where: { strategyId: { in: S } }, select: { id: true } })).map((r) => r.id);
  log("strategy decisions", (await p.performanceStrategyDecision.deleteMany({ where: { reviewId: { in: RV } } })).count);
  log("strategy reviews", (await p.performanceStrategyReview.deleteMany({ where: { id: { in: RV } } })).count);
  await p.performanceGoal.updateMany({ where: { strategyId: { in: S } }, data: { strategyId: null } });
  log("strategies", (await p.performanceStrategy.deleteMany({ where: { id: { in: S } } })).count);
  log("strategy assumptions", (await p.performanceStrategyAssumption.deleteMany({ where: { statement: { startsWith: "UAT" } } })).count);
  const K = (await p.performanceRisk.findMany({ where: { title: { startsWith: "UAT" } }, select: { id: true } })).map((r) => r.id);
  await p.performanceRiskHistory.deleteMany({ where: { riskId: { in: K } } });
  await p.performanceRiskTreatment.deleteMany({ where: { riskId: { in: K } } });
  log("risks", (await p.performanceRisk.deleteMany({ where: { id: { in: K } } })).count);

  // alerts: manual UAT alerts, and rule alerts whose source record (dedupe key "<kind>:<id>") no longer exists
  const SOURCE_TABLE: Record<string, string> = { goal: "performance_goals", corrective: "performance_corrective_actions", "risk-review": "performance_risks", "risk-appetite": "performance_risks", treatment: "performance_risk_treatments" };
  const alerts = await p.$queryRawUnsafe<Array<{ id: string; title: string; dedupe_key: string | null }>>("SELECT `id`, `title`, `dedupe_key` FROM `performance_alerts`");
  const A: string[] = [];
  for (const a of alerts) {
    if (a.title.startsWith("UAT")) { A.push(a.id); continue; }
    const m = /^([a-z-]+):(.+)$/.exec(a.dedupe_key || "");
    const table = m && SOURCE_TABLE[m[1]];
    if (!table) continue;
    const found = await p.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`id\` = ?`, m![2]);
    if (!Number(found[0]?.c)) A.push(a.id);
  }
  if (A.length) {
    const marks = A.map(() => "?").join(",");
    await p.$executeRawUnsafe(`DELETE FROM \`performance_alert_events\` WHERE \`alert_id\` IN (${marks})`, ...A);
    log("alerts", await p.$executeRawUnsafe(`DELETE FROM \`performance_alerts\` WHERE \`id\` IN (${marks})`, ...A));
  } else log("alerts", 0);

  // reviews titled UAT, with their feedback
  const RW = (await p.performanceReview.findMany({ where: { title: { startsWith: "UAT" } }, select: { id: true } })).map((r) => r.id);
  await p.performanceReviewFeedback.deleteMany({ where: { reviewId: { in: RW } } });
  log("reviews", (await p.performanceReview.deleteMany({ where: { id: { in: RW } } })).count);

  // corrective actions titled UAT, with their history
  const CA = (await p.performanceCorrectiveAction.findMany({ where: { title: { startsWith: "UAT" } }, select: { id: true } })).map((c) => c.id);
  await p.performanceCorrectiveActionEvent.deleteMany({ where: { actionId: { in: CA } } });
  log("corrective actions", (await p.performanceCorrectiveAction.deleteMany({ where: { id: { in: CA } } })).count);

  // departments the Departments suite creates ("UAT Dept …"), only while nobody belongs to them and nothing points at them
  let depts = 0;
  for (const d of await p.department.findMany({ where: { name: { startsWith: "UAT Dept" } }, select: { id: true } })) {
    if (await p.user.count({ where: { departmentId: d.id } })) continue;
    try { await p.department.delete({ where: { id: d.id } }); depts++; } catch (_) { /* still referenced: left in place */ }
  }
  log("departments", depts);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => p.$disconnect());
