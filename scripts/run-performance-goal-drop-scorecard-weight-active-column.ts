/**
 * Drops `performance_goals.isScorecardWeightActive` and backfills goal `status` for the new flow:
 * - company goals with `scorecardWeight IS NOT NULL` => status = 'active'
 * - company goals with `scorecardWeight IS NULL`     => status = 'inactive'
 *
 * Idempotent: checks information_schema before ALTER; safe to re-run.
 *
 * Run: npm run db:migrate:drop-scorecard-weight-active-column
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(1) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function main() {
  const table = "performance_goals";
  const col = "isScorecardWeightActive";

  // Backfill statuses first (works whether column exists or not).
  const activeRes = await prisma.$executeRawUnsafe(
    `UPDATE \`${table}\`
     SET status = 'active'
     WHERE type = 'company' AND scorecardWeight IS NOT NULL`
  );
  const inactiveRes = await prisma.$executeRawUnsafe(
    `UPDATE \`${table}\`
     SET status = 'inactive'
     WHERE type = 'company' AND scorecardWeight IS NULL`
  );
  console.log(`[ok] backfill status active rows: ${activeRes}; inactive rows: ${inactiveRes}`);

  if (await columnExists(table, col)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
    console.log(`[ok] dropped ${table}.${col}`);
  } else {
    console.log(`[skip] ${table}.${col} does not exist`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

