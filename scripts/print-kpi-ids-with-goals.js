require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT kpiId, COUNT(1) as goalCount FROM performance_goals WHERE kpiId IS NOT NULL GROUP BY kpiId ORDER BY goalCount DESC LIMIT 10"
    );

    const out = [];
    for (const r of rows) {
      const kpi = await prisma.kPI.findUnique({
        where: { id: r.kpiId },
        select: { id: true, name: true, code: true },
      });
      const goals = await prisma.performanceGoal.findMany({
        where: { kpiId: r.kpiId },
        select: { id: true, title: true, type: true, status: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      });
      out.push({
        kpi,
        goalCount: Number(r.goalCount),
        sampleGoals: goals,
      });
    }

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

