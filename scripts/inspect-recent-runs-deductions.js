require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.payrollRun.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        employeePayrolls: {
          include: { deductions: { include: { deductionType: true } } },
        },
      },
    });

    for (const run of runs) {
      console.log(
        `\n=== RUN ${run.name} (${run.payPeriod}) [${run.id}] gross=${run.totalGrossPay} ded=${run.totalDeductions} net=${run.totalNetPay} ===`
      );
      for (const ep of run.employeePayrolls) {
        const buckets = {};
        for (const d of ep.deductions) {
          const key = (d.deductionType?.code || d.deductionType?.name || "?")
            .toUpperCase()
            .trim();
          buckets[key] = (buckets[key] || 0) + 1;
        }
        const dupKeys = Object.entries(buckets)
          .filter(([, n]) => n > 1)
          .map(([k, n]) => `${k}=${n}`)
          .join(", ");
        console.log(
          `  emp=${ep.employeeId} rows=${ep.deductions.length}${
            dupKeys ? `  DUPLICATES{ ${dupKeys} }` : ""
          }`
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
