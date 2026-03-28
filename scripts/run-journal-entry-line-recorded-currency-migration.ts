/**
 * Idempotent migration: add recorded_currency_id to journal_entry_lines (optional FK to currencies).
 * Run: npx ts-node scripts/run-journal-entry-line-recorded-currency-migration.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'journal_entry_lines'
       AND COLUMN_NAME = 'recorded_currency_id'`
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) {
    console.log('journal_entry_lines.recorded_currency_id already exists — skipping');
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE journal_entry_lines
    ADD COLUMN recorded_currency_id VARCHAR(191) NULL,
    ADD CONSTRAINT journal_entry_lines_recorded_currency_id_fkey
      FOREIGN KEY (recorded_currency_id) REFERENCES currencies(id) ON DELETE SET NULL ON UPDATE CASCADE
  `);
  console.log('Added journal_entry_lines.recorded_currency_id');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
