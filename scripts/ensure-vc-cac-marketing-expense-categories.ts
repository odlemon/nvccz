/**
 * Idempotent: upserts `expense_categories` rows for every name in
 * `VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES` (see src/config/vcCacMarketingExpenseCategories.ts).
 *
 * Run: npm run db:ensure:vc-cac-marketing-categories
 * Or:  npx ts-node --transpile-only scripts/ensure-vc-cac-marketing-expense-categories.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES } from "../src/config/vcCacMarketingExpenseCategories";

const prisma = new PrismaClient();

const DESCRIPTIONS: Record<string, string> = {
  "Branding and Marketing": "Marketing campaigns, advertising, and branding (VC CAC / seed)",
  Marketing: "General marketing spend (VC CAC)",
  "Marketing & Advertising": "Marketing and advertising (VC CAC)",
  Advertising: "Advertising and promotions (VC CAC)"
};

async function main() {
  for (const name of VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES) {
    const description = DESCRIPTIONS[name] ?? `Marketing-related expense (VC CAC) — ${name}`;
    const row = await prisma.expenseCategory.upsert({
      where: { name },
      create: { name, description, isActive: true },
      update: { description, isActive: true }
    });
    console.log(`OK: expense category — ${row.name} (${row.id})`);
  }
  console.log(`\nDone. ${VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES.length} marketing categories ensured.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
