// @ts-nocheck
/**
 * Delete all users except the keeper admin. Reassigns all FK references to admin first.
 *
 * Usage: npx ts-node scripts/delete-all-users-except-admin.ts [--dry-run]
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  deleteUserRecord,
  getUserDeleteBlockers,
  reassignUserReferences,
  scanUserReferences,
} from "../src/services/userDeleteHelpers";

const ALLOWED_DATABASE = (process.env.ALLOWED_DATABASE || "demo_env").trim();
const KEEP_ADMIN_EMAIL = (process.env.KEEP_ADMIN_EMAIL || "admin@nts.com").trim().toLowerCase();
const DRY_RUN = process.argv.includes("--dry-run");

async function cleanupEphemeralUserRows(userId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ TABLE_NAME: string; COLUMN_NAME: string }>
  >(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME IN ('userId', 'user_id')
       AND TABLE_NAME IN (
         'password_reset_tokens', 'user_mfa_totp', 'notifications', 'user_activity'
       )`
  );

  for (const { TABLE_NAME, COLUMN_NAME } of rows) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM \`${TABLE_NAME}\` WHERE \`${COLUMN_NAME}\` = ?`,
        userId
      );
    } catch {
      // ignore
    }
  }
}

async function deleteUserById(userId: string) {
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, userId);
  }
}

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>("SELECT DATABASE() AS db");
  const dbName = dbRows[0]?.db ?? "(unknown)";
  if (dbName !== ALLOWED_DATABASE) {
    throw new Error(
      `Refusing to run: connected to "${dbName}" but only "${ALLOWED_DATABASE}" is allowed. Check DATABASE_URL.`
    );
  }
  console.log(`Database: ${dbName}`);
  console.log(`Keeper admin: ${KEEP_ADMIN_EMAIL}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  const keeperRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; email: string; firstName: string; lastName: string }>
  >(`SELECT id, email, firstName, lastName FROM users WHERE email = ? LIMIT 1`, KEEP_ADMIN_EMAIL);

  const keeper = keeperRows[0];
  if (!keeper) {
    throw new Error(`Keeper admin not found: ${KEEP_ADMIN_EMAIL}`);
  }

  console.log(`Keeper: ${keeper.firstName} ${keeper.lastName} (${keeper.id})\n`);

  const allUsers = await prisma.$queryRawUnsafe<
    Array<{ id: string; email: string; firstName: string; lastName: string }>
  >(`SELECT id, email, firstName, lastName FROM users ORDER BY email`);

  const toDelete = allUsers.filter((u) => u.id !== keeper.id);
  console.log(`Total users: ${allUsers.length}`);
  console.log(`Users to delete: ${toDelete.length}\n`);

  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  for (const user of toDelete) {
    const refs = await scanUserReferences(user.id);
    const refCount =
      refs.prisma.reduce((n, r) => n + (r?.count ?? 0), 0) +
      refs.database.reduce((n, r) => n + (r?.count ?? 0), 0);

    console.log(`--- ${user.email} (${user.firstName} ${user.lastName})`);
    console.log(`    id: ${user.id}`);
    console.log(`    references: ${refCount}`);

    if (DRY_RUN) {
      if (refs.database.length > 0) {
        for (const r of refs.database.slice(0, 5)) {
          console.log(`      ${r.table}.${r.column}: ${r.count}`);
        }
      }
      continue;
    }

    await reassignUserReferences(user.id, keeper.id);
    await cleanupEphemeralUserRows(user.id);

    const blockers = await getUserDeleteBlockers(user.id);
    if (blockers.length > 0) {
      console.log(`    remaining refs before delete: ${blockers.map((b) => `${b.count} ${b.label}`).join(", ")}`);
    }

    await deleteUserRecordSafe(user.id);
    console.log(`    deleted`);
    await prisma.$queryRawUnsafe(`SELECT 1`);
  }

  const remainingUsers = await prisma.$queryRawUnsafe<
    Array<{ email: string; firstName: string; lastName: string }>
  >(`SELECT email, firstName, lastName FROM users ORDER BY email`);

  console.log(`\nDone. Remaining users: ${remainingUsers.length}`);
  for (const u of remainingUsers) {
    console.log(`  ${u.email} — ${u.firstName} ${u.lastName}`);
  }
}

async function deleteUserRecordSafe(userId: string) {
  try {
    await deleteUserRecord(userId);
  } catch {
    await deleteUserById(userId);
  }
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
