/**
 * One-off: npx ts-node scripts/lookup-user-performance-contracts.ts <userId>
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: npx ts-node scripts/lookup-user-performance-contracts.ts <userId>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, firstName: true, lastName: true, userDepartment: true }
  });

  const contracts = await prisma.performanceContract.findMany({
    where: { subjectUserId: id },
    select: {
      id: true,
      contractType: true,
      status: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      title: true
    },
    orderBy: { updatedAt: "desc" }
  });

  const year = 2026;
  const yStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const yEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const emp2026 = contracts.find(
    (c) =>
      c.contractType === "EMPLOYEE" &&
      c.status !== "ARCHIVED" &&
      c.status !== "CANCELLED" &&
      c.periodStart <= yEnd &&
      c.periodEnd >= yStart
  );

  console.log(JSON.stringify({ userFound: !!user, user, contracts, hasActiveEmployeeContractOverlapping2026: !!emp2026 }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
