import { prisma } from "../src/utils/database";

const id = "cmnvkably000lktl9c86ytg26";

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { entityId: id },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  console.log(
    "entity_logs",
    JSON.stringify(
      logs.map((l) => ({
        action: l.action,
        entityType: l.entityType,
        createdAt: l.createdAt.toISOString(),
        newValues: l.newValues,
        oldValues: l.oldValues,
      })),
      null,
      2
    )
  );

  const catchUps = await prisma.auditLog.findMany({
    where: { entityType: "ShortTermInvestmentAccrualCatchUp", entityId: id },
    orderBy: { createdAt: "asc" },
  });
  console.log("catch_up_audits", JSON.stringify(catchUps.map((c) => c.newValues), null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
