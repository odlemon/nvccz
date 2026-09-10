/**
 * Creates the payroll tables that four Payroll V6 screens needed and never had.
 *
 * Inputs & Validation, Pay Groups & Calendar, Onboarding and the RFQ/quotation half of Vendors
 * were all rendering the runtime's fixtures because there was nothing to call — invented batch
 * counts, invented pay calendars, invented candidates and invented bids, each looking like a
 * finished screen. `payroll-v6-backend-asks.md` §2.2, §2.4, §2.5 and §2.8 record them as asks;
 * this builds them.
 *
 * Seeds nothing. An empty screen showing nothing is correct; an empty screen showing invented
 * data is the defect being removed.
 *
 * Idempotent: each table is created only if absent, and re-running is a no-op.
 *
 * Run with:  npx ts-node scripts/create-payroll-v6-missing-tables.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    name
  );
  return Number(rows?.[0]?.c ?? 0) > 0;
}

const TABLES: Array<{ name: string; ddl: string }> = [
  {
    name: "payroll_input_batches",
    ddl: `CREATE TABLE \`payroll_input_batches\` (
      \`id\`               VARCHAR(191) NOT NULL,
      \`reference\`        VARCHAR(64)  NOT NULL,
      \`period_label\`     VARCHAR(64)  NOT NULL,
      \`payroll_run_id\`   VARCHAR(191) NULL,
      \`source_file_name\` VARCHAR(255) NULL,
      \`status\`           VARCHAR(24)  NOT NULL DEFAULT 'DRAFT',
      \`total_rows\`       INT          NOT NULL DEFAULT 0,
      \`valid_rows\`       INT          NOT NULL DEFAULT 0,
      \`error_rows\`       INT          NOT NULL DEFAULT 0,
      \`uploaded_by_id\`   VARCHAR(191) NULL,
      \`committed_at\`     DATETIME(3)  NULL,
      \`created_at\`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`payroll_input_batches_reference_key\` (\`reference\`),
      KEY \`payroll_input_batches_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "payroll_input_rows",
    ddl: `CREATE TABLE \`payroll_input_rows\` (
      \`id\`              VARCHAR(191) NOT NULL,
      \`batch_id\`        VARCHAR(191) NOT NULL,
      \`row_number\`      INT          NOT NULL,
      \`employee_number\` VARCHAR(64)  NULL,
      \`employee_name\`   VARCHAR(255) NULL,
      \`input_type\`      VARCHAR(24)  NOT NULL DEFAULT 'OTHER',
      \`amount\`          DECIMAL(15,2) NULL,
      \`currency_code\`   VARCHAR(8)   NOT NULL DEFAULT 'USD',
      \`status\`          VARCHAR(16)  NOT NULL DEFAULT 'VALID',
      \`error_message\`   TEXT         NULL,
      \`resolved_by_id\`  VARCHAR(191) NULL,
      \`resolved_at\`     DATETIME(3)  NULL,
      \`created_at\`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`payroll_input_rows_batch_status_idx\` (\`batch_id\`, \`status\`),
      CONSTRAINT \`payroll_input_rows_batch_fk\` FOREIGN KEY (\`batch_id\`)
        REFERENCES \`payroll_input_batches\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "payroll_pay_groups",
    ddl: `CREATE TABLE \`payroll_pay_groups\` (
      \`id\`               VARCHAR(191) NOT NULL,
      \`name\`             VARCHAR(128) NOT NULL,
      \`code\`             VARCHAR(32)  NOT NULL,
      \`frequency\`        VARCHAR(24)  NOT NULL DEFAULT 'MONTHLY',
      \`pay_day_of_month\` INT          NULL,
      \`currency_code\`    VARCHAR(8)   NOT NULL DEFAULT 'USD',
      \`is_active\`        BOOLEAN      NOT NULL DEFAULT TRUE,
      \`created_at\`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`payroll_pay_groups_code_key\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "payroll_calendar_periods",
    ddl: `CREATE TABLE \`payroll_calendar_periods\` (
      \`id\`           VARCHAR(191) NOT NULL,
      \`pay_group_id\` VARCHAR(191) NOT NULL,
      \`period_label\` VARCHAR(64)  NOT NULL,
      \`period_start\` DATE         NOT NULL,
      \`period_end\`   DATE         NOT NULL,
      \`cutoff_date\`  DATE         NULL,
      \`pay_date\`     DATE         NULL,
      \`status\`       VARCHAR(16)  NOT NULL DEFAULT 'PLANNED',
      \`created_at\`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`payroll_calendar_periods_group_label_key\` (\`pay_group_id\`, \`period_label\`),
      KEY \`payroll_calendar_periods_status_idx\` (\`status\`),
      CONSTRAINT \`payroll_calendar_periods_group_fk\` FOREIGN KEY (\`pay_group_id\`)
        REFERENCES \`payroll_pay_groups\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "payroll_onboarding_candidates",
    ddl: `CREATE TABLE \`payroll_onboarding_candidates\` (
      \`id\`            VARCHAR(191) NOT NULL,
      \`first_name\`    VARCHAR(128) NOT NULL,
      \`last_name\`     VARCHAR(128) NOT NULL,
      \`email\`         VARCHAR(255) NULL,
      \`position\`      VARCHAR(128) NULL,
      \`department\`    VARCHAR(128) NULL,
      \`start_date\`    DATE         NULL,
      \`pay_group_id\`  VARCHAR(191) NULL,
      \`status\`        VARCHAR(24)  NOT NULL DEFAULT 'INVITED',
      \`checklist\`     JSON         NULL,
      \`employee_id\`   VARCHAR(191) NULL,
      \`completed_at\`  DATETIME(3)  NULL,
      \`created_by_id\` VARCHAR(191) NULL,
      \`created_at\`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`payroll_onboarding_candidates_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "payroll_rfqs",
    ddl: `CREATE TABLE \`payroll_rfqs\` (
      \`id\`             VARCHAR(191) NOT NULL,
      \`reference\`      VARCHAR(64)  NOT NULL,
      \`title\`          VARCHAR(255) NOT NULL,
      \`category\`       VARCHAR(128) NULL,
      \`status\`         VARCHAR(24)  NOT NULL DEFAULT 'DRAFT',
      \`issue_date\`     DATE         NULL,
      \`closing_date\`   DATE         NULL,
      \`awarded_bid_id\` VARCHAR(191) NULL,
      \`created_by_id\`  VARCHAR(191) NULL,
      \`created_at\`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`payroll_rfqs_reference_key\` (\`reference\`),
      KEY \`payroll_rfqs_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: "payroll_rfq_bids",
    ddl: `CREATE TABLE \`payroll_rfq_bids\` (
      \`id\`               VARCHAR(191) NOT NULL,
      \`rfq_id\`           VARCHAR(191) NOT NULL,
      \`vendor_id\`        VARCHAR(191) NULL,
      \`vendor_name\`      VARCHAR(255) NOT NULL,
      \`amount\`           DECIMAL(15,2) NULL,
      \`currency_code\`    VARCHAR(8)   NOT NULL DEFAULT 'USD',
      \`technical_score\`  DECIMAL(5,2) NULL,
      \`commercial_score\` DECIMAL(5,2) NULL,
      \`compliance_score\` DECIMAL(5,2) NULL,
      \`status\`           VARCHAR(24)  NOT NULL DEFAULT 'INVITED',
      \`submitted_at\`     DATETIME(3)  NULL,
      \`created_at\`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`payroll_rfq_bids_rfq_status_idx\` (\`rfq_id\`, \`status\`),
      CONSTRAINT \`payroll_rfq_bids_rfq_fk\` FOREIGN KEY (\`rfq_id\`)
        REFERENCES \`payroll_rfqs\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];

async function main() {
  let created = 0;
  for (const t of TABLES) {
    if (await tableExists(t.name)) {
      console.log(`[skip]    ${t.name}`);
      continue;
    }
    await prisma.$executeRawUnsafe(t.ddl);
    console.log(`[created] ${t.name}`);
    created++;
  }
  console.log(`\n${created} table(s) created, ${TABLES.length - created} already present.`);
  console.log("[info] Nothing is seeded: these screens should render empty until real data exists.");
}

main()
  .catch((e) => {
    console.error("[failed]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
