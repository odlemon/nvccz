/**
 * Fiscal calendar + module period locking tables (MySQL). Idempotent.
 * Run: npm run db:migrate:fiscal-period-lock
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

function fiscalYearId(year: number): string {
  return `fy_${year}`;
}

function fiscalPeriodId(year: number, month: number): string {
  const m = String(month).padStart(2, "0");
  return `fp_${year}_${m}`;
}

async function main() {
  if (!(await tableExists("fiscal_years"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fiscal_years\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(128) NOT NULL,
        \`start_date\` DATE NOT NULL,
        \`end_date\` DATE NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fiscal_years_start_end_idx\` (\`start_date\`, \`end_date\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created fiscal_years");
  } else {
    console.log("[skip] fiscal_years exists");
  }

  if (!(await tableExists("fiscal_periods"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fiscal_periods\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fiscal_year_id\` VARCHAR(191) NOT NULL,
        \`period_number\` INT NOT NULL,
        \`name\` VARCHAR(128) NOT NULL,
        \`start_date\` DATE NOT NULL,
        \`end_date\` DATE NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fiscal_periods_year_num_key\` (\`fiscal_year_id\`, \`period_number\`),
        INDEX \`fiscal_periods_start_end_idx\` (\`start_date\`, \`end_date\`),
        CONSTRAINT \`fiscal_periods_year_fk\`
          FOREIGN KEY (\`fiscal_year_id\`) REFERENCES \`fiscal_years\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created fiscal_periods");
  } else {
    console.log("[skip] fiscal_periods exists");
  }

  if (!(await tableExists("module_period_locks"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`module_period_locks\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`module_code\` VARCHAR(16) NOT NULL,
        \`fiscal_period_id\` VARCHAR(191) NOT NULL,
        \`lock_status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`reason\` VARCHAR(512) NULL,
        \`updated_by_id\` VARCHAR(191) NULL,
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`module_period_locks_mod_fp_key\` (\`module_code\`, \`fiscal_period_id\`),
        INDEX \`module_period_locks_fp_idx\` (\`fiscal_period_id\`),
        CONSTRAINT \`module_period_locks_fp_fk\`
          FOREIGN KEY (\`fiscal_period_id\`) REFERENCES \`fiscal_periods\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`module_period_locks_user_fk\`
          FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created module_period_locks");
  } else {
    console.log("[skip] module_period_locks exists");
  }

  if (!(await tableExists("company_accounting_policies"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`company_accounting_policies\` (
        \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`locked_period_policy\` VARCHAR(16) NOT NULL DEFAULT 'ERROR',
        \`allow_override_posting\` BOOLEAN NOT NULL DEFAULT false,
        \`gl_error_batch_enabled\` BOOLEAN NOT NULL DEFAULT true,
        \`lock_config_version\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created company_accounting_policies");
  } else {
    console.log("[skip] company_accounting_policies exists");
  }

  if (!(await tableExists("period_lock_drafts"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`period_lock_drafts\` (
        \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`draft_json\` JSON NOT NULL,
        \`updated_by_id\` VARCHAR(191) NULL,
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`period_lock_drafts_user_fk\`
          FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created period_lock_drafts");
  } else {
    console.log("[skip] period_lock_drafts exists");
  }

  if (!(await tableExists("posting_exceptions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`posting_exceptions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`source_module\` VARCHAR(16) NOT NULL,
        \`target_module\` VARCHAR(16) NOT NULL,
        \`source_document_type\` VARCHAR(64) NOT NULL,
        \`source_document_id\` VARCHAR(191) NOT NULL,
        \`accounting_date\` DATE NOT NULL,
        \`reason_code\` VARCHAR(64) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`payload_snapshot\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`posting_exceptions_status_created_idx\` (\`status\`, \`created_at\`),
        INDEX \`posting_exceptions_tgt_date_idx\` (\`target_module\`, \`accounting_date\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created posting_exceptions");
  } else {
    console.log("[skip] posting_exceptions exists");
  }

  if (!(await tableExists("period_lock_audit_logs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`period_lock_audit_logs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`action_type\` VARCHAR(64) NOT NULL,
        \`module_code\` VARCHAR(16) NULL,
        \`fiscal_period_id\` VARCHAR(191) NULL,
        \`old_value\` JSON NULL,
        \`new_value\` JSON NULL,
        \`reason\` TEXT NULL,
        \`performed_by_id\` VARCHAR(191) NOT NULL,
        \`source\` VARCHAR(32) NOT NULL DEFAULT 'API',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`period_lock_audit_logs_created_idx\` (\`created_at\`),
        INDEX \`period_lock_audit_logs_action_idx\` (\`action_type\`),
        CONSTRAINT \`period_lock_audit_fp_fk\`
          FOREIGN KEY (\`fiscal_period_id\`) REFERENCES \`fiscal_periods\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`period_lock_audit_user_fk\`
          FOREIGN KEY (\`performed_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created period_lock_audit_logs");
  } else {
    console.log("[skip] period_lock_audit_logs exists");
  }

  // Seed fiscal years + monthly periods (2020–2035)
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  for (let year = 2020; year <= 2035; year++) {
    const fyId = fiscalYearId(year);
    const fyRow = await prisma.fiscalYear.findUnique({ where: { id: fyId } });
    if (fyRow) continue;

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    await prisma.fiscalYear.create({
      data: {
        id: fyId,
        name: `FY ${year}`,
        startDate: start,
        endDate: end,
        status: "OPEN",
      },
    });
    for (let m = 1; m <= 12; m++) {
      const startD = new Date(Date.UTC(year, m - 1, 1));
      const endD = new Date(Date.UTC(year, m, 0));
      await prisma.fiscalPeriod.create({
        data: {
          id: fiscalPeriodId(year, m),
          fiscalYearId: fyId,
          periodNumber: m,
          name: `${monthNames[m - 1]} ${year}`,
          startDate: startD,
          endDate: endD,
          status: "OPEN",
        },
      });
    }
    console.log(`[ok] seeded fiscal year ${year}`);
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO \`company_accounting_policies\` (\`id\`, \`locked_period_policy\`, \`allow_override_posting\`, \`gl_error_batch_enabled\`, \`lock_config_version\`, \`created_at\`, \`updated_at\`)
    SELECT 'default', 'ERROR', false, true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM \`company_accounting_policies\` WHERE \`id\` = 'default')
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO \`period_lock_drafts\` (\`id\`, \`draft_json\`, \`updated_at\`)
    SELECT 'default', CAST('{"moduleLocks":[]}' AS JSON), CURRENT_TIMESTAMP(3)
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM \`period_lock_drafts\` WHERE \`id\` = 'default')
  `);

  // Backfill module locks from legacy tables (GL + BANK locked when either legacy says locked)
  const lockedMonths = new Set<string>();

  const apRows = await prisma.accountingPeriod.findMany({
    where: { isLocked: true },
    select: { period: true },
  });
  for (const r of apRows) {
    if (/^\d{4}-\d{2}$/.test(r.period)) lockedMonths.add(r.period);
  }

  const plRows = await prisma.periodLockout.findMany({
    where: { isLocked: true },
    select: { year: true, month: true },
  });
  for (const r of plRows) {
    lockedMonths.add(`${r.year}-${String(r.month).padStart(2, "0")}`);
  }

  const modules = ["GL", "BANK"] as const;
  for (const ym of lockedMonths) {
    const [ys, ms] = ym.split("-");
    const year = parseInt(ys, 10);
    const month = parseInt(ms, 10);
    const fpId = fiscalPeriodId(year, month);
    const fp = await prisma.fiscalPeriod.findUnique({ where: { id: fpId } });
    if (!fp) {
      console.warn(`[warn] no fiscal period for ${ym}, skip backfill`);
      continue;
    }
    for (const mod of modules) {
      await prisma.modulePeriodLock.upsert({
        where: {
          moduleCode_fiscalPeriodId: { moduleCode: mod, fiscalPeriodId: fpId },
        },
        create: {
          moduleCode: mod,
          fiscalPeriodId: fpId,
          lockStatus: "LOCKED",
          reason: "Backfill from legacy accounting_periods / period_lockouts",
        },
        update: {
          lockStatus: "LOCKED",
          reason: "Backfill from legacy accounting_periods / period_lockouts",
        },
      });
    }
  }
  if (lockedMonths.size > 0) {
    console.log(`[ok] backfilled module locks for ${lockedMonths.size} month(s)`);
    await prisma.companyAccountingPolicy.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        lockedPeriodPolicy: "ERROR",
        allowOverridePosting: false,
        glErrorBatchEnabled: true,
        lockConfigVersion: 1,
      },
      update: { lockConfigVersion: { increment: 1 } },
    });
  }

  console.log("\nFiscal period lock migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
