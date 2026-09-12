/**
 * Lists performance contracts in the DB: counts by type/status/year, sample EMPLOYEE rows.
 * Use when scorecards fail with "No active performance contract" — verify contracts exist
 * and periods overlap the scorecard period (annual UTC year vs archived/cancelled).
 *
 * Usage: npx ts-node scripts/diagnose-performance-contracts.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const total = await prisma.performanceContract.count();
  console.log(`\n=== Performance contracts (total: ${total}) ===\n`);

  const byType = await prisma.performanceContract.groupBy({
    by: ["contractType"],
    _count: { id: true }
  });
  console.log("By contractType:");
  for (const row of byType.sort((a, b) => String(a.contractType).localeCompare(String(b.contractType)))) {
    console.log(`  ${row.contractType}: ${row._count.id}`);
  }

  const byStatus = await prisma.performanceContract.groupBy({
    by: ["status"],
    _count: { id: true }
  });
  console.log("\nBy status:");
  for (const row of byStatus.sort((a, b) => String(a.status).localeCompare(String(b.status)))) {
    console.log(`  ${row.status}: ${row._count.id}`);
  }

  const employees = await prisma.performanceContract.findMany({
    where: { contractType: "EMPLOYEE" },
    select: {
      id: true,
      title: true,
      status: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      subjectUserId: true,
      subjectUser: { select: { email: true, firstName: true, lastName: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 40
  });

  console.log(`\nEMPLOYEE contracts (latest ${employees.length}, all time):`);
  if (employees.length === 0) {
    console.log("  (none — create EMPLOYEE contracts or run db:ensure:employee-performance-contracts if your package has it)");
  } else {
    for (const c of employees) {
      const who = c.subjectUser
        ? `${c.subjectUser.firstName} ${c.subjectUser.lastName} <${c.subjectUser.email}>`
        : "(no subject user)";
      console.log(
        `  ${c.id.slice(0, 12)}…  label=${c.periodLabel ?? "?"}  ${c.periodStart.toISOString().slice(0, 10)}→${c.periodEnd.toISOString().slice(0, 10)}  ${c.status}  ${who}`
      );
    }
  }

  const activeEmp = await prisma.performanceContract.count({
    where: {
      contractType: "EMPLOYEE",
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    }
  });
  console.log(`\nActive EMPLOYEE (not ARCHIVED/CANCELLED): ${activeEmp}`);

  const year = new Date().getUTCFullYear();
  const yStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const yEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const overlapWhere = {
    status: { notIn: ["ARCHIVED", "CANCELLED"] as string[] },
    periodStart: { lte: yEnd },
    periodEnd: { gte: yStart }
  };

  for (const types of [
    ["EMPLOYEE"] as const,
    ["DEPARTMENT"] as const,
    ["CEO", "ceo"] as const,
    ["BOARD", "board"] as const
  ]) {
    const n = await prisma.performanceContract.count({
      where: {
        contractType: types.length === 1 ? types[0] : { in: [...types] },
        ...overlapWhere
      }
    });
    const label = types.length === 1 ? types[0] : types.join("/");
    console.log(`Contracts overlapping default scorecard year ${year} (UTC) — ${label}: ${n}`);
  }
  console.log("");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
