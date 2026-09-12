/**
 * Verify Payroll E&T migration DDL + seeds applied.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/verify-payroll-employment-training-migration.ts
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

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  let failed = 0;
  const ok = (label: string) => console.log(`[OK] ${label}`);
  const fail = (label: string) => {
    console.error(`[FAIL] ${label}`);
    failed++;
  };

  const employeeCols = [
    "lifecycle_status",
    "department_code",
    "zimra_bp_number",
    "salary_split_usd_pct",
    "salary_split_zig_pct",
    "contract_effective_date",
    "compliance_blocked_permissions",
  ];
  for (const col of employeeCols) {
    (await columnExists("employees", col)) ? ok(`employees.${col}`) : fail(`employees.${col}`);
  }

  const runCols = [
    "journal_entry_id",
    "fx_rate_usd_zig",
    "dual_currency",
    "approval_status",
    "submitted_for_approval_at",
    "approved_at",
    "approved_by_id",
    "submitted_by_id",
    "process_error",
  ];
  for (const col of runCols) {
    (await columnExists("payroll_runs", col)) ? ok(`payroll_runs.${col}`) : fail(`payroll_runs.${col}`);
  }

  const payslipCols = ["sha256_checksum", "storage_path", "file_url", "generated_at"];
  for (const col of payslipCols) {
    (await columnExists("payslips", col)) ? ok(`payslips.${col}`) : fail(`payslips.${col}`);
  }

  const tables = [
    "employee_change_requests",
    "employee_payroll_legs",
    "zimra_tax_brackets",
    "statutory_levy_config",
    "training_courses",
    "training_assignments",
    "employee_certifications",
  ];
  for (const t of tables) {
    (await tableExists(t)) ? ok(`table ${t}`) : fail(`table ${t}`);
  }

  const statusRow = await prisma.$queryRawUnsafe<Array<{ COLUMN_TYPE: string }>>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_runs' AND COLUMN_NAME = 'status'`
  );
  const colType = statusRow[0]?.COLUMN_TYPE || "";
  for (const val of ["PENDING_APPROVAL", "APPROVED", "FAILED"]) {
    colType.includes(val) ? ok(`payroll_runs.status includes ${val}`) : fail(`payroll_runs.status missing ${val}`);
  }

  const bracketCount = await prisma.zimraTaxBracket.count();
  const levyCount = await prisma.statutoryLevyConfig.count();
  const courseCount = await prisma.trainingCourse.count();
  bracketCount > 0 ? ok(`zimra_tax_brackets seeded (${bracketCount} rows)`) : fail("zimra_tax_brackets empty");
  levyCount > 0 ? ok(`statutory_levy_config seeded (${levyCount} rows)`) : fail("statutory_levy_config empty");
  courseCount > 0 ? ok(`training_courses seeded (${courseCount} rows)`) : fail("training_courses empty");

  const usdBrackets = await prisma.zimraTaxBracket.count({ where: { currencyCode: "USD" } });
  const zigBrackets = await prisma.zimraTaxBracket.count({ where: { currencyCode: "ZIG" } });
  usdBrackets > 0 ? ok(`USD brackets (${usdBrackets})`) : fail("no USD brackets");
  zigBrackets > 0 ? ok(`ZIG brackets (${zigBrackets})`) : fail("no ZIG brackets");

  console.log(failed ? `\nVerification FAILED: ${failed} issue(s)` : "\nAll Payroll E&T migration checks passed.");
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
