require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const dt = await prisma.deductionTypes.findMany({
      orderBy: [{ isStatutory: "desc" }, { code: "asc" }, { name: "asc" }],
    });
    console.log("DEDUCTION_TYPES_COUNT", dt.length);
    console.log(
      JSON.stringify(
        dt.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
          isStatutory: d.isStatutory,
          isActive: d.isActive,
          rate: d.rate?.toString(),
          threshold: d.threshold?.toString?.() ?? null,
          ceiling: d.ceiling?.toString?.() ?? null,
          effectiveDate: d.effectiveDate,
          endDate: d.endDate,
          currencyId: d.currencyId,
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
