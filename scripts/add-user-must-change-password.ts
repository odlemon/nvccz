/**
 * Adds `users.must_change_password`.
 *
 * An invited LP is emailed a temporary password so they can sign in to the portal, and must then
 * choose their own before doing anything else. Nothing in the schema could express "this password
 * was issued by us and has to be replaced", so a temporary password would otherwise have remained
 * valid indefinitely and the investor would never be prompted to change it.
 *
 * Defaults to false, so every existing account is unaffected.
 *
 * Idempotent: adds the column only if absent.
 *
 * Run with:  npx ts-node scripts/add-user-must-change-password.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    column
  );
  return Number(rows?.[0]?.c ?? 0) > 0;
}

async function main() {
  if (await columnExists("users", "must_change_password")) {
    console.log("[skip]    users.must_change_password already exists");
  } else {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `users` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT FALSE"
    );
    console.log("[created] users.must_change_password (default FALSE)");
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    "SELECT COUNT(*) AS c FROM `users` WHERE `must_change_password` = TRUE"
  );
  console.log(`[info] ${Number(rows?.[0]?.c ?? 0)} user(s) currently required to change password.`);
}

main()
  .catch((e) => {
    console.error("[failed]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
