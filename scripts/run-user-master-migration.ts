/**
 * SRD "User Master" (Procurement + Admin /users).
 *
 * Adds the remaining User Master columns to `users`, a minimum approval level to approval stages, and a cost
 * centre to purchase requisitions. Idempotent: every column/index is skipped when already present.
 *
 * Existing `users.status` / approval_limit_amount / delegated_approver_id / branch / business_unit / cost_centre
 * come from earlier migrations (db:migrate:user-status and the §7 ProcMS extension).
 *
 * Run: npm run db:migrate:user-master
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

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  console.log(`[ok] added ${table}.${column}`);
}

async function addIndex(table: string, name: string, ddl: string) {
  if (await indexExists(table, name)) {
    console.log(`[skip] index ${name} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`CREATE ${ddl}`);
  console.log(`[ok] added index ${name}`);
}

const USER_COLUMNS: Array<[string, string]> = [
  // Prerequisites from db:migrate:user-status / db:migrate:nts-remaining, repeated so this script is self-sufficient.
  ["status", "VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'"],
  ["approval_limit_amount", "DECIMAL(15,2) NULL"],
  ["delegated_approver_id", "VARCHAR(191) NULL"],
  ["branch", "VARCHAR(128) NULL"],
  ["business_unit", "VARCHAR(128) NULL"],
  ["cost_centre", "VARCHAR(128) NULL"],
  ["employee_code", "VARCHAR(64) NULL"],
  ["mobile_number", "VARCHAR(32) NULL"],
  ["location", "VARCHAR(128) NULL"],
  ["job_title", "VARCHAR(128) NULL"],
  ["reporting_manager_id", "VARCHAR(191) NULL"],
  ["procurement_function", "VARCHAR(48) NULL"],
  ["access_profile", "VARCHAR(48) NULL"],
  ["approval_level", "INT NULL"],
  ["sod_restrictions", "JSON NULL"],
  ["sso_username", "VARCHAR(128) NULL"],
  ["uat_role", "VARCHAR(64) NULL"],
  ["effective_date", "DATETIME(3) NULL"],
  ["end_date", "DATETIME(3) NULL"],
  ["last_login_at", "DATETIME(3) NULL"],
  ["created_by_id", "VARCHAR(191) NULL"],
  ["updated_by_id", "VARCHAR(191) NULL"],
  ["deactivated_at", "DATETIME(3) NULL"],
];

async function main() {
  for (const [col, ddl] of USER_COLUMNS) await addColumn("users", col, ddl);

  await addIndex("users", "users_employee_code_key", "UNIQUE INDEX `users_employee_code_key` ON `users` (`employee_code`)");
  await addIndex("users", "users_sso_username_key", "UNIQUE INDEX `users_sso_username_key` ON `users` (`sso_username`)");
  await addIndex("users", "users_reporting_manager_idx", "INDEX `users_reporting_manager_idx` ON `users` (`reporting_manager_id`)");
  await addIndex("users", "users_procurement_function_idx", "INDEX `users_procurement_function_idx` ON `users` (`procurement_function`)");

  // Employee/User ID: every existing user gets a stable code, oldest first (EMP-00001 ...).
  const missing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    "SELECT id FROM `users` WHERE `employee_code` IS NULL ORDER BY `createdAt` ASC, `id` ASC"
  );
  if (missing.length) {
    const max = await prisma.$queryRawUnsafe<Array<{ n: bigint | number | null }>>(
      "SELECT MAX(CAST(SUBSTRING(`employee_code`, 5) AS UNSIGNED)) AS n FROM `users` WHERE `employee_code` REGEXP '^EMP-[0-9]+$'"
    );
    let next = Number(max[0]?.n ?? 0);
    for (const row of missing) {
      next += 1;
      await prisma.$executeRawUnsafe(
        "UPDATE `users` SET `employee_code` = ? WHERE `id` = ?",
        `EMP-${String(next).padStart(5, "0")}`,
        row.id
      );
    }
    console.log(`[ok] backfilled employee_code for ${missing.length} user(s)`);
  } else {
    console.log("[skip] employee_code already populated");
  }

  // Approval routing by level: a stage may require approvers of at least this level.
  await addColumn("procurement_approval_stages", "min_approval_level", "INT NULL");

  // Cost centre drives budget attribution and routing (matchRules.costCentres); requisitions lacked the column.
  await addColumn("purchase_requisitions", "cost_centre", "VARCHAR(128) NULL");

  for (const [t, c] of [
    ["users", "employee_code"],
    ["users", "approval_level"],
    ["users", "procurement_function"],
    ["users", "sod_restrictions"],
    ["users", "effective_date"],
    ["users", "end_date"],
    ["users", "last_login_at"],
    ["procurement_approval_stages", "min_approval_level"],
    ["purchase_requisitions", "cost_centre"],
  ]) {
    if (!(await columnExists(t, c))) throw new Error(`Missing column after migration: ${t}.${c}`);
  }
  console.log("[verify OK] user master columns present");
  console.log("\nUser master migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
