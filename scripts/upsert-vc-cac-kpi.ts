/**
 * Idempotent: ensures KPI `VC_CUSTOMER_ACQUISITION_COST` exists in `kpis` with BSC Customer & Market pillar.
 *
 * Run: npx ts-node scripts/upsert-vc-cac-kpi.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const CODE = "VC_CUSTOMER_ACQUISITION_COST";
const NAME = "Customer Acquisition Cost";

const prisma = new PrismaClient();

async function main() {
  const marketing = await prisma.department.findFirst({
    where: { name: "Marketing" },
    select: { id: true }
  });
  if (!marketing) {
    throw new Error("Department 'Marketing' not found. Seed departments first.");
  }

  const existing = await prisma.kPI.findUnique({ where: { code: CODE } });
  if (existing) {
    await prisma.kPI.update({
      where: { code: CODE },
      data: {
        name: NAME,
        departmentId: marketing.id,
        catalogDescription:
          "Blended all-time VC company CAC: cumulative marketing-classified expense (USD) divided by active customer count.",
        catalogDepartmentName: "Marketing",
        accountType: "Expense",
        isFinancial: false,
        isReverseKpi: true,
        scorecardPillar: "Customer & Market",
        journalEntryType: "Debit",
        hasUnit: true,
        unitCategory: "currency",
        unit: "USD per customer",
        unitSymbol: "$",
        unitPosition: "prefix"
      }
    });
    console.log(`Updated KPI ${CODE}`);
  } else {
    await prisma.kPI.create({
      data: {
        name: NAME,
        type: "Metric",
        code: CODE,
        departmentId: marketing.id,
        catalogDescription:
          "Blended all-time VC company CAC: cumulative marketing-classified expense (USD) divided by active customer count.",
        catalogDepartmentName: "Marketing",
        accountType: "Expense",
        accountNumber: null,
        journalEntryType: "Debit",
        isFinancial: false,
        isReverseKpi: true,
        scorecardPillar: "Customer & Market",
        weightValue: 0.1,
        hasUnit: true,
        unitCategory: "currency",
        unit: "USD per customer",
        unitSymbol: "$",
        unitPosition: "prefix",
        isActive: true
      }
    });
    console.log(`Created KPI ${CODE}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
