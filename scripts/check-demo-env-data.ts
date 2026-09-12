import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>("SELECT DATABASE() AS db");
  const dbName = dbRows[0]?.db ?? "(unknown)";
  console.log(`Connected database: ${dbName}\n`);

  const tables = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
  );

  console.log(`Tables: ${tables.length}`);
  if (tables.length === 0) {
    console.log("\ndemo_env is empty — no tables found.");
    return;
  }

  const sampleTables = [
    "users",
    "roles",
    "clients",
    "applications",
    "journal_entries",
    "invoices",
    "employees",
    "funds",
    "audit_logs",
  ];

  console.log("\nRow counts (key tables):");
  for (const name of sampleTables) {
    const exists = tables.some((t) => t.TABLE_NAME === name);
    if (!exists) {
      console.log(`  ${name}: (table missing)`);
      continue;
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM \`${name}\``
    );
    console.log(`  ${name}: ${Number(rows[0]?.c ?? 0)}`);
  }

  const hasUsers = tables.some((t) => t.TABLE_NAME === "users");
  if (hasUsers) {
    const users = await prisma.$queryRawUnsafe<
      Array<{ email: string; firstName: string; lastName: string }>
    >(`SELECT email, firstName, lastName FROM users ORDER BY email`);
    console.log(`\nUsers (${users.length}):`);
    for (const u of users) {
      console.log(`  ${u.email} — ${u.firstName} ${u.lastName}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
