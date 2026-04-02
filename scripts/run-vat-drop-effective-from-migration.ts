/**
 * Idempotent migration: drop the `effective_from` column from `vat_rates`.
 * Run with: npm run db:migrate:vat-drop-effective-from
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  // Check column exists before dropping
  const [rows] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'vat_rates'
      AND COLUMN_NAME  = 'effective_from'
  `);

  if (!rows) {
    console.log("✓ Column effective_from does not exist — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE \`vat_rates\` DROP COLUMN \`effective_from\``);
  console.log("✓ Dropped column effective_from from vat_rates.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
