/**
 * Idempotent: link department goals missing `performanceContractId` to an ACTIVE
 * DEPARTMENT contract for the UTC calendar year of each goal's `startDate`
 * (creates the contract via the same helper as new goal creation).
 *
 * Uses PERFORMANCE_BACKFILL_ACTOR_USER_ID if set; otherwise each goal's `createdById`.
 *
 * Run: npx ts-node scripts/backfill-department-goal-performance-contracts.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { ensureDepartmentPerformanceContractForGoal } from "../src/services/DepartmentPerformanceContractService";

async function main() {
  const fallbackActor =
    process.env.PERFORMANCE_BACKFILL_ACTOR_USER_ID ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;

  if (!fallbackActor) {
    console.error("No actor user id (set PERFORMANCE_BACKFILL_ACTOR_USER_ID or seed users).");
    process.exit(1);
  }

  const goals = await prisma.performanceGoal.findMany({
    where: {
      type: "department",
      departmentName: { not: null },
      performanceContractId: null
    },
    select: {
      id: true,
      departmentName: true,
      startDate: true,
      createdById: true
    }
  });

  let updated = 0;
  for (const g of goals) {
    const dept = g.departmentName?.trim();
    if (!dept) continue;
    const actorId = g.createdById || fallbackActor;
    const contractId = await ensureDepartmentPerformanceContractForGoal({
      departmentName: dept,
      goalStart: g.startDate,
      createdById: actorId
    });
    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: { performanceContractId: contractId }
    });
    updated += 1;
    console.log(`Linked goal ${g.id} (${dept}) → contract ${contractId}`);
  }

  console.log(`Done. Updated ${updated} department goal(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
