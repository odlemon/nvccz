/**
 * UAT: incremental login GL sync for TOTAL_REVENUE only.
 * npm run uat:login-gl-sync-incremental
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { AccountingGoalSyncService } from "../src/services/AccountingGoalSyncService";
import { defaultLoginSyncPeriod } from "../src/services/performanceGoalSyncUtils";

const COMPANY_GOAL_ID = process.env.COMPANY_GOAL_ID ?? "cmpjts5fo0001kt6k6qy97pms";
const DEPARTMENT_GOAL_ID = process.env.DEPARTMENT_GOAL_ID ?? "cmpju3tm40005kt6kz0qshclx";
const INDIVIDUAL_GOAL_ID = process.env.INDIVIDUAL_GOAL_ID ?? "cmpk6l30z0001kt79agp4u5fk";

async function main() {
  const actorId = (await prisma.user.findFirst({ select: { id: true } }))?.id;
  if (!actorId) throw new Error("No user");

  const before = await Promise.all(
    [COMPANY_GOAL_ID, DEPARTMENT_GOAL_ID, INDIVIDUAL_GOAL_ID].map((id) =>
      prisma.performanceGoal.findUnique({
        where: { id },
        select: { id: true, type: true, currentValue: true }
      })
    )
  );
  console.log("Before:", before);

  const { periodStart, periodEnd } = defaultLoginSyncPeriod();
  const result = await AccountingGoalSyncService.runFullSync({
    periodStart,
    periodEnd,
    actorId,
    kpiCodes: ["TOTAL_REVENUE"],
    loginSyncOnly: true
  });
  console.log("Sync:", result);

  const after = await Promise.all(
    [COMPANY_GOAL_ID, DEPARTMENT_GOAL_ID, INDIVIDUAL_GOAL_ID].map((id) =>
      prisma.performanceGoal.findUnique({
        where: { id },
        select: { id: true, type: true, currentValue: true, syncConfig: true }
      })
    )
  );
  console.log("After:", after);

  const companyCurrent = Number(after[0]?.currentValue ?? 0);
  const expected = Number(process.env.EXPECTED_COMPANY_CURRENT ?? "53200");
  if (Math.abs(companyCurrent - expected) > 0.01) {
    console.error(`FAIL: company current ${companyCurrent} expected ${expected}`);
    process.exit(1);
  }
  if (Number(after[2]?.currentValue) !== Number(before[2]?.currentValue)) {
    console.error("FAIL: individual goal was modified");
    process.exit(1);
  }
  console.log("✅ PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
