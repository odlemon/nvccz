/**
 * Adds chart_of_accounts.naturalBalance (DEBIT | CREDIT) and backfills from accountType.
 * Run: npx ts-node scripts/run-chart-of-accounts-natural-balance-migration.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'chart_of_accounts'
       AND COLUMN_NAME = 'naturalBalance'`
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) {
    console.log('chart_of_accounts.naturalBalance already exists — running backfill only');
    await prisma.$executeRawUnsafe(`
      UPDATE chart_of_accounts
      SET naturalBalance = CASE
        WHEN accountType IN (
          'Current Asset', 'Fixed Asset', 'Long-Term Asset', 'Expense',
          'Non-Current Asset', 'Asset', 'Bank', 'Cash'
        ) THEN 'DEBIT'
        ELSE 'CREDIT'
      END
    `);
    console.log('Backfill complete');
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE chart_of_accounts
    ADD COLUMN naturalBalance VARCHAR(191) NOT NULL DEFAULT 'DEBIT'
  `);
  console.log('Added chart_of_accounts.naturalBalance');

  await prisma.$executeRawUnsafe(`
    UPDATE chart_of_accounts
    SET naturalBalance = CASE
      WHEN accountType IN (
        'Current Asset', 'Fixed Asset', 'Long-Term Asset', 'Expense',
        'Non-Current Asset', 'Asset', 'Bank', 'Cash'
      ) THEN 'DEBIT'
      ELSE 'CREDIT'
    END
  `);
  console.log('Backfilled naturalBalance from accountType');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
