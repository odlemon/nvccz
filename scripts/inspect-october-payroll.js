require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const runId = "cmoumr5j8008zktd3odm7vous";
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        employeePayrolls: {
          include: {
            deductions: { include: { deductionType: true } },
            allowances: true,
          },
        },
      },
    });

    const empSummary = (run?.employeePayrolls || []).map((ep) => ({
      employeeId: ep.employeeId,
      grossPay: ep.grossPay?.toString(),
      totalDeductions: ep.totalDeductions?.toString(),
      netPay: ep.netPay?.toString(),
      deductionRows: ep.deductions.length,
      deductions: ep.deductions.map((d) => ({
        name: d.deductionType?.name,
        code: d.deductionType?.code,
        amount: d.amount?.toString(),
      })),
    }));

    console.log(
      "RUN",
      JSON.stringify(
        {
          id: run?.id,
          name: run?.name,
          status: run?.status,
          payPeriod: run?.payPeriod,
          totalGrossPay: run?.totalGrossPay?.toString(),
          totalDeductions: run?.totalDeductions?.toString(),
          totalNetPay: run?.totalNetPay?.toString(),
          startDate: run?.startDate,
          endDate: run?.endDate,
          employeeCount: run?.employeePayrolls?.length,
          empSummary,
        },
        null,
        2
      )
    );

    const jes = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { referenceNumber: { contains: "PAYROLL-OCTOBER" } },
          { description: { contains: "October 2026" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        transactionDate: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        journalEntryLines: {
          select: {
            debitAmount: true,
            creditAmount: true,
            description: true,
            chartOfAccount: { select: { accountNo: true, accountName: true } },
          },
        },
      },
    });

    console.log("JOURNAL_ENTRIES_OCT", JSON.stringify(jes, null, 2));

    const refOnly = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: { contains: "PAYROLL-" },
        transactionDate: {
          gte: new Date("2026-09-01"),
          lte: new Date("2026-12-15"),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        transactionDate: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
    });
    console.log("PAYROLL_JES_FALL_2026", JSON.stringify(refOnly, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
