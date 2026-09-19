/**
 * Adds `approval_limit` to `users` (SRD "User Master": Approval Level / Approval Limit).
 * Nullable -- null means "no personal ceiling override, defer entirely to workflow routing" (AMOUNT_THRESHOLD
 * steps, department/role/named-person steps), so every existing user is unaffected until an admin sets one.
 * Idempotent: skips the column if already present.
 *
 * Run: npm run db:migrate:approval-limit
 * Then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "users";
  const column = "approval_limit";

  if (!(await columnExists(table, column))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${table}\`
      ADD COLUMN \`${column}\` DECIMAL(15, 2) NULL
      COMMENT 'SRD User Master Approval Limit -- personal approval ceiling; null defers to workflow routing'
    `);
    console.log(`[ok] added ${table}.${column}`);
  } else {
    console.log(`[skip] ${table}.${column} already exists`);
  }

  if (!(await columnExists(table, column))) {
    throw new Error(`Missing column after migration: ${table}.${column}`);
  }
  console.log(`[verify OK] ${table}.${column}`);

  const nonNull = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`
  );
  console.log(
    `[info] ${Number(nonNull[0]?.c ?? 0)} user(s) currently have a personal approval limit set (expected 0 on a fresh migration)`
  );

  console.log("\nApproval limit migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
