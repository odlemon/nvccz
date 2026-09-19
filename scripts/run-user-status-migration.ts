/**
 * Adds `status` to `users` (SRD "User Master": Active / Suspended / Locked / Deactivated).
 * Backfills every existing row to 'ACTIVE'. Idempotent: skips the column/index if already present.
 *
 * Run: npm run db:migrate:user-status
 * Then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALLOWED_STATUSES = ["ACTIVE", "SUSPENDED", "LOCKED", "DEACTIVATED"];

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "users";

  if (!(await columnExists(table, "status"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${table}\`
      ADD COLUMN \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    `);
    console.log("[ok] added users.status");
  } else {
    console.log("[skip] users.status exists");
  }

  const backfilled = await prisma.$executeRawUnsafe(
    `UPDATE \`${table}\` SET \`status\` = 'ACTIVE' WHERE \`status\` IS NULL OR \`status\` = ''`
  );
  console.log("[ok] backfill: blank/null status -> ACTIVE (affected row count is driver-dependent):", backfilled);

  const indexName = "users_status_idx";
  if (!(await indexExists(table, indexName))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`${indexName}\` ON \`${table}\` (\`status\`)`
    );
    console.log(`[ok] added index ${indexName}`);
  } else {
    console.log(`[skip] index ${indexName} exists`);
  }

  if (!(await columnExists(table, "status"))) {
    throw new Error(`Missing column after migration: ${table}.status`);
  }
  console.log("[verify OK] users.status");

  const bad = await prisma.$queryRawUnsafe<Array<{ status: string; c: bigint }>>(
    `SELECT \`status\`, COUNT(*) AS c FROM \`${table}\`
     WHERE \`status\` NOT IN (${ALLOWED_STATUSES.map((s) => `'${s}'`).join(", ")})
     GROUP BY \`status\``
  );
  if (bad.length > 0) {
    console.warn("[warn] rows with unexpected status values found:", bad);
  } else {
    console.log("[verify OK] all users.status values are within the allowed SRD set");
  }

  console.log("\nUser status migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
