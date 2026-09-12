/**
 * Ensure one ACTIVE EMPLOYEE PerformanceContract for a user identified by email.
 * Uses the same logic as POST /api/performance/contracts/employee (calendar year).
 *
 * Usage:
 *   npx ts-node scripts/ensure-employee-performance-contract-for-email.ts nyashakarata1@gmail.com
 *   npx ts-node scripts/ensure-employee-performance-contract-for-email.ts nyashakarata1@gmail.com 2026
 *
 * Env:
 *   PERFORMANCE_BACKFILL_ACTOR_USER_ID — user id for createdById (defaults to oldest user)
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { createEmployeePerformanceContractInTransaction } from "../src/services/PerformanceContractSetupService";

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const yearArg = process.argv[3];
  const periodYear = yearArg ? parseInt(yearArg, 10) : new Date().getUTCFullYear();
  if (!email) {
    console.error("Usage: npx ts-node scripts/ensure-employee-performance-contract-for-email.ts <email> [periodYear]");
    process.exit(1);
  }
  if (!Number.isFinite(periodYear) || periodYear < 2000 || periodYear > 2100) {
    console.error("Invalid period year");
    process.exit(1);
  }

  const actorId =
    process.env.PERFORMANCE_BACKFILL_ACTOR_USER_ID ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;

  if (!actorId) {
    console.error("No actor user — set PERFORMANCE_BACKFILL_ACTOR_USER_ID");
    process.exit(1);
  }

  let user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      userDepartment: true
    }
  });
  if (!user && process.argv[2] !== email) {
    user = await prisma.user.findFirst({
      where: { email: process.argv[2].trim() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userDepartment: true
      }
    });
  }

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    return createEmployeePerformanceContractInTransaction(tx, {
      subjectUserId: user.id,
      departmentName: user.userDepartment ?? null,
      createdById: actorId,
      employeeFirstName: user.firstName || "",
      employeeLastName: user.lastName || "",
      periodYear,
      rejectIfDuplicate: false
    });
  });

  console.log(
    result.created
      ? `[created] Performance contract ${result.contract.id} for ${user.firstName} ${user.lastName} <${user.email}> (${periodYear})`
      : `[exists] Already had contract ${result.contract.id} for same year window — no change`
  );
  console.log(`subjectUserId=${user.id}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
