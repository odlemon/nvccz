/**
 * Fund Performance Reporting — schema (US-3.5.1–US-3.5.4).
 * Idempotent. Run: npm run db:migrate:fund-performance-reporting
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

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  );
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  await addColumnIfMissing("clients", "user_id", "VARCHAR(191) NULL");

  if (!(await columnExists("clients", "user_id"))) {
    throw new Error("clients.user_id column missing after add");
  }

  const idxRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND INDEX_NAME = 'clients_user_id_key'`
  );
  if (Number(idxRows[0]?.c ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX \`clients_user_id_key\` ON \`clients\` (\`user_id\`)`
    );
    console.log("[ok] clients.user_id unique index");
  } else {
    console.log("[skip] clients.user_id unique index");
  }

  if (!(await tableExists("fund_report_templates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`report_level\` VARCHAR(16) NOT NULL,
        \`description\` TEXT NULL,
        \`section_config\` JSON NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_templates_fund_idx\` (\`fund_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_templates");
  } else {
    console.log("[skip] fund_report_templates");
  }

  if (!(await tableExists("fund_report_distribution_lists"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_distribution_lists\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`source_type\` VARCHAR(32) NOT NULL,
        \`role_codes\` JSON NULL,
        \`cohort_filter\` JSON NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_distribution_lists_fund_idx\` (\`fund_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_distribution_lists");
  } else {
    console.log("[skip] fund_report_distribution_lists");
  }

  if (!(await tableExists("fund_report_schedules"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_schedules\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`template_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`period_type\` VARCHAR(16) NOT NULL,
        \`cron_expression\` VARCHAR(64) NOT NULL,
        \`timezone\` VARCHAR(64) NOT NULL DEFAULT 'Africa/Harare',
        \`day_of_month\` INT NULL,
        \`hour_of_day\` INT NOT NULL DEFAULT 8,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`next_run_at\` DATETIME(3) NULL,
        \`distribution_list_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_schedules_fund_idx\` (\`fund_id\`),
        INDEX \`fund_report_schedules_next_run_idx\` (\`next_run_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_schedules");
  } else {
    console.log("[skip] fund_report_schedules");
  }

  if (!(await tableExists("fund_report_runs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_runs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`template_id\` VARCHAR(191) NOT NULL,
        \`schedule_id\` VARCHAR(191) NULL,
        \`period_start\` DATE NOT NULL,
        \`period_end\` DATE NOT NULL,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
        \`trigger_type\` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
        \`triggered_by_id\` VARCHAR(191) NULL,
        \`target_count\` INT NOT NULL DEFAULT 0,
        \`compiled_count\` INT NOT NULL DEFAULT 0,
        \`dispatched_count\` INT NOT NULL DEFAULT 0,
        \`delivered_count\` INT NOT NULL DEFAULT 0,
        \`failed_count\` INT NOT NULL DEFAULT 0,
        \`error_message\` TEXT NULL,
        \`started_at\` DATETIME(3) NULL,
        \`completed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_runs_fund_idx\` (\`fund_id\`),
        INDEX \`fund_report_runs_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_runs");
  } else {
    console.log("[skip] fund_report_runs");
  }

  if (!(await tableExists("fund_report_recipient_jobs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_recipient_jobs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`run_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NULL,
        \`email\` VARCHAR(320) NOT NULL,
        \`lp_legal_name\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
        \`pdf_status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`transport_method\` VARCHAR(16) NULL,
        \`pdf_storage_path\` VARCHAR(512) NULL,
        \`pdf_file_url\` VARCHAR(1024) NULL,
        \`pdf_file_size\` INT NULL,
        \`pdf_sha256\` VARCHAR(64) NULL,
        \`metrics_snapshot\` JSON NULL,
        \`retry_count\` INT NOT NULL DEFAULT 0,
        \`last_error\` TEXT NULL,
        \`compiled_at\` DATETIME(3) NULL,
        \`dispatched_at\` DATETIME(3) NULL,
        \`delivered_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_recipient_jobs_run_idx\` (\`run_id\`),
        INDEX \`fund_report_recipient_jobs_client_idx\` (\`client_id\`),
        INDEX \`fund_report_recipient_jobs_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_recipient_jobs");
  } else {
    console.log("[skip] fund_report_recipient_jobs");
  }

  if (!(await tableExists("fund_report_distribution_logs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_distribution_logs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`job_id\` VARCHAR(191) NOT NULL,
        \`event_type\` VARCHAR(24) NOT NULL,
        \`provider_ref\` VARCHAR(255) NULL,
        \`payload\` JSON NULL,
        \`message\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_distribution_logs_job_idx\` (\`job_id\`),
        INDEX \`fund_report_distribution_logs_event_idx\` (\`event_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_distribution_logs");
  } else {
    console.log("[skip] fund_report_distribution_logs");
  }

  if (!(await tableExists("fund_report_download_tokens"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_download_tokens\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`job_id\` VARCHAR(191) NOT NULL,
        \`token_hash\` VARCHAR(64) NOT NULL,
        \`expires_at\` DATETIME(3) NOT NULL,
        \`revoked_at\` DATETIME(3) NULL,
        \`used_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fund_report_download_tokens_token_hash_key\` (\`token_hash\`),
        INDEX \`fund_report_download_tokens_job_idx\` (\`job_id\`),
        INDEX \`fund_report_download_tokens_expires_idx\` (\`expires_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_download_tokens");
  } else {
    console.log("[skip] fund_report_download_tokens");
  }

  if (!(await tableExists("fund_report_audit_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_report_audit_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`entity_type\` VARCHAR(64) NOT NULL,
        \`entity_id\` VARCHAR(191) NOT NULL,
        \`action\` VARCHAR(32) NOT NULL,
        \`author_id\` VARCHAR(191) NOT NULL,
        \`diff_json\` JSON NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fund_report_audit_entity_idx\` (\`entity_type\`, \`entity_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_report_audit_events");
  } else {
    console.log("[skip] fund_report_audit_events");
  }

  console.log("Fund performance reporting migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
