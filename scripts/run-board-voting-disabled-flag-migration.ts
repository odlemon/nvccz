import { PrismaClient } from "@prisma/client";

/**
 * Adds `board_voting_disabled` (BOOLEAN NOT NULL DEFAULT 0) if missing.
 *
 * Some deployments use `users`, others legacy `db_users`. This script applies to whichever exists.
 *
 * Project rule: apply DDL via idempotent TypeScript script (no prisma migrate).
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const tables = ["users", "db_users"];
    let foundAnyTable = false;
    let didAdd = false;
    for (const table of tables) {
      const t = (await prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
      `))[0];
      const tableExists = Number(t?.cnt || 0) > 0;
      if (!tableExists) continue;
      foundAnyTable = true;

      const row = (await prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
          AND COLUMN_NAME = 'board_voting_disabled'
      `))[0];

      const exists = Number(row?.cnt || 0) > 0;
      if (exists) {
        console.log(`✅ ${table}.board_voting_disabled already exists — skipping`);
        continue;
      }

      console.log(`🔄 Adding ${table}.board_voting_disabled ...`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE ${table}
        ADD COLUMN board_voting_disabled BOOLEAN NOT NULL DEFAULT 0
      `);
      console.log(`✅ Added ${table}.board_voting_disabled`);
      didAdd = true;
    }

    if (!foundAnyTable) {
      console.log("ℹ️ No users table found (users/db_users) — nothing to migrate");
    } else if (!didAdd) {
      console.log("✅ No changes needed");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});

