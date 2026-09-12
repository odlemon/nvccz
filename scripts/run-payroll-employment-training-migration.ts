/**
 * Payroll, Employment & Training — schema extensions (US-3.13.1–3.13.4).
 * Idempotent. Run: npm run db:migrate:payroll-employment-training
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function cuid(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(8).toString("hex");
  return `c${t}${r}`.slice(0, 25);
}

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

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
  comment?: string
) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  const sql = comment
    ? `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} COMMENT '${comment.replace(/'/g, "''")}'`
    : `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`[ok] ${table}.${column}`);
}

async function extendPayrollStatusEnum() {
  const rows = await prisma.$queryRawUnsafe<Array<{ COLUMN_TYPE: string }>>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_runs' AND COLUMN_NAME = 'status'`
  );
  const colType = rows[0]?.COLUMN_TYPE || "";
  for (const val of ["PENDING_APPROVAL", "APPROVED", "FAILED"]) {
    if (!colType.includes(`'${val}'`)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`payroll_runs\` MODIFY COLUMN \`status\` ENUM('DRAFT','PENDING_APPROVAL','APPROVED','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'DRAFT'`
      );
      console.log(`[ok] payroll_runs.status enum extended (${val})`);
      return;
    }
  }
  console.log("[skip] payroll_runs.status enum already extended");
}

async function main() {
  // --- employees ---
  await addColumnIfMissing("employees", "lifecycle_status", "VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'");
  await addColumnIfMissing("employees", "department_code", "VARCHAR(64) NULL");
  await addColumnIfMissing("employees", "zimra_bp_number", "VARCHAR(64) NULL");
  await addColumnIfMissing(
    "employees",
    "salary_split_usd_pct",
    "DECIMAL(8,6) NOT NULL DEFAULT 1.000000"
  );
  await addColumnIfMissing(
    "employees",
    "salary_split_zig_pct",
    "DECIMAL(8,6) NOT NULL DEFAULT 0.000000"
  );
  await addColumnIfMissing("employees", "contract_effective_date", "DATE NULL");
  await addColumnIfMissing("employees", "compliance_blocked_permissions", "JSON NULL");

  await prisma.$executeRawUnsafe(`
    UPDATE employees SET lifecycle_status = 'TERMINATED'
    WHERE \`terminated\` = 1 AND lifecycle_status = 'ACTIVE'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE employees SET lifecycle_status = 'SUSPENDED'
    WHERE \`terminated\` = 0 AND isActive = 0 AND lifecycle_status = 'ACTIVE'
  `);

  // --- payroll_runs ---
  await extendPayrollStatusEnum();
  await addColumnIfMissing("payroll_runs", "journal_entry_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("payroll_runs", "fx_rate_usd_zig", "DECIMAL(18,8) NULL");
  await addColumnIfMissing("payroll_runs", "dual_currency", "BOOLEAN NOT NULL DEFAULT false");
  await addColumnIfMissing(
    "payroll_runs",
    "approval_status",
    "VARCHAR(16) NOT NULL DEFAULT 'NONE'"
  );
  await addColumnIfMissing("payroll_runs", "submitted_for_approval_at", "DATETIME(3) NULL");
  await addColumnIfMissing("payroll_runs", "approved_at", "DATETIME(3) NULL");
  await addColumnIfMissing("payroll_runs", "approved_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("payroll_runs", "submitted_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("payroll_runs", "process_error", "TEXT NULL");

  // --- payslips ---
  await addColumnIfMissing("payslips", "sha256_checksum", "VARCHAR(64) NULL");
  await addColumnIfMissing("payslips", "storage_path", "VARCHAR(512) NULL");
  await addColumnIfMissing("payslips", "file_url", "VARCHAR(1024) NULL");
  await addColumnIfMissing("payslips", "generated_at", "DATETIME(3) NULL");

  if (!(await tableExists("employee_change_requests"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`employee_change_requests\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`change_type\` VARCHAR(32) NOT NULL,
        \`payload\` JSON NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`maker_user_id\` VARCHAR(191) NOT NULL,
        \`checker_user_id\` VARCHAR(191) NULL,
        \`rejection_reason\` TEXT NULL,
        \`submitted_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`resolved_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`employee_change_requests_employee_status_idx\` (\`employee_id\`, \`status\`),
        INDEX \`employee_change_requests_maker_idx\` (\`maker_user_id\`),
        CONSTRAINT \`employee_change_requests_employee_fk\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`employee_change_requests_maker_fk\` FOREIGN KEY (\`maker_user_id\`) REFERENCES \`users\`(\`id\`),
        CONSTRAINT \`employee_change_requests_checker_fk\` FOREIGN KEY (\`checker_user_id\`) REFERENCES \`users\`(\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created employee_change_requests");
  } else {
    console.log("[skip] employee_change_requests exists");
  }

  if (!(await tableExists("employee_payroll_legs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`employee_payroll_legs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employee_payroll_id\` VARCHAR(191) NOT NULL,
        \`currency_code\` VARCHAR(3) NOT NULL,
        \`gross_pay\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`paye_amount\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`aids_levy_amount\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`nssa_amount\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`sdl_amount\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`other_deductions\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`total_deductions\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`net_pay\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`employee_payroll_legs_payroll_currency_key\` (\`employee_payroll_id\`, \`currency_code\`),
        CONSTRAINT \`employee_payroll_legs_ep_fk\` FOREIGN KEY (\`employee_payroll_id\`) REFERENCES \`employee_payrolls\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created employee_payroll_legs");
  } else {
    console.log("[skip] employee_payroll_legs exists");
  }

  if (!(await tableExists("zimra_tax_brackets"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`zimra_tax_brackets\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`currency_code\` VARCHAR(3) NOT NULL,
        \`lower_bound\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`upper_bound\` DECIMAL(15,3) NULL,
        \`marginal_rate\` DECIMAL(8,6) NOT NULL,
        \`deduction_offset\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`effective_from\` DATE NOT NULL,
        \`effective_to\` DATE NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`zimra_tax_brackets_currency_effective_idx\` (\`currency_code\`, \`effective_from\`, \`is_active\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created zimra_tax_brackets");
  } else {
    console.log("[skip] zimra_tax_brackets exists");
  }

  if (!(await tableExists("statutory_levy_config"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`statutory_levy_config\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`levy_code\` VARCHAR(64) NOT NULL,
        \`currency_code\` VARCHAR(3) NOT NULL,
        \`rate\` DECIMAL(8,6) NULL,
        \`ceiling\` DECIMAL(15,3) NULL,
        \`effective_from\` DATE NOT NULL,
        \`effective_to\` DATE NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`statutory_levy_config_code_currency_from_key\` (\`levy_code\`, \`currency_code\`, \`effective_from\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created statutory_levy_config");
  } else {
    console.log("[skip] statutory_levy_config exists");
  }

  if (!(await tableExists("training_courses"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`training_courses\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(64) NOT NULL,
        \`title\` VARCHAR(512) NOT NULL,
        \`description\` TEXT NULL,
        \`renewal_period_months\` INT NOT NULL DEFAULT 12,
        \`required_permission_codes\` JSON NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`training_courses_code_key\` (\`code\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created training_courses");
  } else {
    console.log("[skip] training_courses exists");
  }

  if (!(await tableExists("training_assignments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`training_assignments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`course_id\` VARCHAR(191) NOT NULL,
        \`scope_type\` VARCHAR(16) NOT NULL,
        \`scope_value\` VARCHAR(191) NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`training_assignments_course_idx\` (\`course_id\`),
        CONSTRAINT \`training_assignments_course_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`training_courses\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created training_assignments");
  } else {
    console.log("[skip] training_assignments exists");
  }

  if (!(await tableExists("employee_certifications"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`employee_certifications\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`course_id\` VARCHAR(191) NOT NULL,
        \`issued_date\` DATE NOT NULL,
        \`expiration_date\` DATE NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`sha256_checksum\` VARCHAR(64) NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'VALID',
        \`verified_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`employee_certifications_employee_idx\` (\`employee_id\`),
        INDEX \`employee_certifications_expiry_idx\` (\`expiration_date\`, \`status\`),
        CONSTRAINT \`employee_certifications_employee_fk\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`employee_certifications_course_fk\` FOREIGN KEY (\`course_id\`) REFERENCES \`training_courses\`(\`id\`),
        CONSTRAINT \`employee_certifications_verified_fk\` FOREIGN KEY (\`verified_by_id\`) REFERENCES \`users\`(\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created employee_certifications");
  } else {
    console.log("[skip] employee_certifications exists");
  }

  // --- illustrative seeds ---
  const bracketCount = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM zimra_tax_brackets`
  );
  if (Number(bracketCount[0]?.c ?? 0) === 0) {
    const eff = "2024-01-01";
    const usdBands = [
      { lo: 0, hi: 500, rate: 0, offset: 0 },
      { lo: 500, hi: 2000, rate: 0.2, offset: 100 },
      { lo: 2000, hi: null, rate: 0.25, offset: 200 }
    ];
    const zigBands = [
      { lo: 0, hi: 6780, rate: 0, offset: 0 },
      { lo: 6780, hi: 27120, rate: 0.2, offset: 1356 },
      { lo: 27120, hi: null, rate: 0.25, offset: 2712 }
    ];
    for (const b of usdBands) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO zimra_tax_brackets (id, currency_code, lower_bound, upper_bound, marginal_rate, deduction_offset, effective_from, is_active, updated_at)
         VALUES (?, 'USD', ?, ?, ?, ?, ?, true, NOW(3))`,
        cuid(),
        b.lo,
        b.hi,
        b.rate,
        b.offset,
        eff
      );
    }
    for (const b of zigBands) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO zimra_tax_brackets (id, currency_code, lower_bound, upper_bound, marginal_rate, deduction_offset, effective_from, is_active, updated_at)
         VALUES (?, 'ZIG', ?, ?, ?, ?, ?, true, NOW(3))`,
        cuid(),
        b.lo,
        b.hi,
        b.rate,
        b.offset,
        eff
      );
    }
    console.log("[ok] seeded illustrative ZIMRA brackets (USD + ZIG)");
  } else {
    console.log("[skip] zimra_tax_brackets already has rows");
  }

  const levyCount = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM statutory_levy_config`
  );
  if (Number(levyCount[0]?.c ?? 0) === 0) {
    const eff = "2024-01-01";
    const levies = [
      { code: "NSSA_RATE", cur: "USD", rate: 0.045, ceiling: null },
      { code: "NSSA_CEILING", cur: "USD", rate: null, ceiling: 700 },
      { code: "NSSA_RATE", cur: "ZIG", rate: 0.045, ceiling: null },
      { code: "NSSA_CEILING", cur: "ZIG", rate: null, ceiling: 9492 },
      { code: "AIDS_RATE", cur: "USD", rate: 0.03, ceiling: null },
      { code: "AIDS_RATE", cur: "ZIG", rate: 0.03, ceiling: null },
      { code: "SDL_RATE", cur: "USD", rate: 0.005, ceiling: null },
      { code: "SDL_RATE", cur: "ZIG", rate: 0.005, ceiling: null }
    ];
    for (const l of levies) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO statutory_levy_config (id, levy_code, currency_code, rate, ceiling, effective_from, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, true, NOW(3))`,
        cuid(),
        l.code,
        l.cur,
        l.rate,
        l.ceiling,
        eff
      );
    }
    console.log("[ok] seeded statutory levy config");
  } else {
    console.log("[skip] statutory_levy_config already has rows");
  }

  const courseCount = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM training_courses`
  );
  if (Number(courseCount[0]?.c ?? 0) === 0) {
    const amlId = cuid();
    await prisma.$executeRawUnsafe(
      `INSERT INTO training_courses (id, code, title, description, renewal_period_months, required_permission_codes, is_active, updated_at)
       VALUES (?, 'AML-SEC-01', 'Anti-Money Laundering Compliance', 'Mandatory AML training for trading and approval roles', 12, ?, true, NOW(3))`,
      amlId,
      JSON.stringify(["trading_approve", "deal_approve"])
    );
    console.log("[ok] seeded sample training course AML-SEC-01");
  }

  console.log("Payroll employment & training migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
