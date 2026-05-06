/**
 * Ensure core payroll deduction types exist (used for payslip breakdown + GL mapping).
 *
 * This does NOT rely on Prisma migrations; it uses PrismaClient writes and is safe to re-run.
 *
 * Usage:
 *   npm run db:ensure:payroll-deduction-types
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";

type SeedRow = {
  code: string;
  name: string;
  description: string;
  isStatutory: boolean;
};

const DEFAULT_ROWS: SeedRow[] = [
  { code: "PAYE", name: "PAYE", description: "Pay As You Earn (income tax)", isStatutory: true },
  { code: "NSSA", name: "NSSA", description: "National Social Security Authority contribution", isStatutory: true },
  { code: "AIDS_LEVY", name: "AIDS Levy", description: "AIDS levy (often based on PAYE)", isStatutory: true },
  { code: "PENSION", name: "Pension", description: "Pension / provident fund contribution", isStatutory: false },
];

async function main() {
  const actor =
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } })) || null;
  if (!actor) throw new Error("No user found to set createdById");

  const effectiveDate = new Date("2020-01-01T00:00:00.000Z");

  let created = 0;
  let skipped = 0;
  for (const row of DEFAULT_ROWS) {
    const exists = await prisma.deductionTypes.findUnique({ where: { code: row.code } }).catch(() => null);
    if (exists) {
      skipped += 1;
      continue;
    }
    await prisma.deductionTypes.create({
      data: {
        code: row.code,
        name: row.name,
        description: row.description,
        isStatutory: row.isStatutory,
        isActive: true,
        createdById: actor.id,
        effectiveDate,
        endDate: null,
        // Rate/threshold/ceiling are only used by the generic statutory deduction engine.
        // For PAYE/NSSA we calculate from TaxRules, so keep these at 0 to avoid double-deduction.
        rate: new Decimal(0),
        threshold: null,
        ceiling: null,
        currencyId: null,
      },
    });
    created += 1;
  }

  console.log("ensure-payroll-deduction-types:", { created, skipped, createdBy: actor.email || actor.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

