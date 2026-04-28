import { PrismaClient } from "@prisma/client";

/**
 * Adds `users.board_voting_disabled` (BOOLEAN NOT NULL DEFAULT 0) if missing.
 *
 * Project rule: apply DDL via idempotent TypeScript script (no prisma migrate).
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const row = (await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'board_voting_disabled'
    `))[0];

    const exists = Number(row?.cnt || 0) > 0;
    if (exists) {
      console.log("✅ users.board_voting_disabled already exists — skipping");
      return;
    }

    console.log("🔄 Adding users.board_voting_disabled ...");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE users
      ADD COLUMN board_voting_disabled BOOLEAN NOT NULL DEFAULT 0
    `);
    console.log("✅ Added users.board_voting_disabled");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});

