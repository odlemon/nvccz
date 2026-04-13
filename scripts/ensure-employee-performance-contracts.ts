/**
 * Idempotent: for each active Employee, ensure one ACTIVE EMPLOYEE PerformanceContract
 * overlapping the current calendar year. PCs are not created from payroll hire — use this
 * backfill or POST /api/performance/contracts/employee after Manager/HR sets up the period.
 *
 * Uses PERFORMANCE_BACKFILL_ACTOR_USER_ID if set; otherwise the earliest-created User id.
 *
 * Run: npx ts-node scripts/ensure-employee-performance-contracts.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  createDefaultEmployeePerformanceContract,
  defaultEmployeePerformanceContractPeriod
} from "../src/services/EmployeePerformanceContractService";

async function main() {
  const actorId =
    process.env.PERFORMANCE_BACKFILL_ACTOR_USER_ID ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;

  if (!actorId) {
    console.error("No actor user id (set PERFORMANCE_BACKFILL_ACTOR_USER_ID or seed users).");
    process.exit(1);
  }

  const { periodStart, periodEnd } = defaultEmployeePerformanceContractPeriod();
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, userDepartment: true } }
    }
  });

  let created = 0;
  let skipped = 0;

  for (const e of employees) {
    const existing = await prisma.performanceContract.findFirst({
      where: {
        contractType: "EMPLOYEE",
        subjectUserId: e.userId,
        status: { notIn: ["ARCHIVED", "CANCELLED"] },
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart }
      }
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await createDefaultEmployeePerformanceContract(tx, {
        subjectUserId: e.userId,
        departmentName: e.user?.userDepartment || null,
        createdById: actorId,
        employeeFirstName: e.user?.firstName || "",
        employeeLastName: e.user?.lastName || ""
      });
    });
    created += 1;
    console.log(
      `Created EMPLOYEE performance contract for ${e.user?.firstName} ${e.user?.lastName} (${e.userId})`
    );
  }

  console.log(`Done. Created: ${created}, skipped (already had overlapping contract): ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
