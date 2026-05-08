require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rules = await prisma.taxRules.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }, { effectiveDate: "asc" }],
      include: { currency: { select: { id: true, code: true, name: true } } },
    });
    console.log("TAX_RULES_COUNT", rules.length);
    console.log(
      JSON.stringify(
        rules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          rate: r.rate?.toString(),
          threshold: r.threshold?.toString?.() ?? r.threshold,
          ceiling: r.ceiling?.toString?.() ?? r.ceiling,
          effectiveDate: r.effectiveDate,
          endDate: r.endDate,
          isActive: r.isActive,
          currency: r.currency?.code,
          currencyId: r.currencyId,
        })),
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
