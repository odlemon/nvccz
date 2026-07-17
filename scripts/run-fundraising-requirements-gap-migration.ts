/**
 * Fundraising requirements gaps 9–24 + outcome-rich meetings.
 * Campaign templates/lists/events/materials, RFP proposal versions, DDQ Q&A/library,
 * compliance holds, placement exclusions/commission ledger, report jobs/schedules,
 * approval events, and column extensions on existing fundraising tables.
 * Idempotent. Run: npm run db:migrate:fundraising-requirements-gap
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

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!(await tableExists(table))) {
    console.log(`[skip] ${table}.${column} — table missing`);
    return;
  }
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  );
  console.log(`[ok] ${table}.${column}`);
}

async function makeColumnNullableIfNeeded(table: string, column: string, definition: string) {
  if (!(await tableExists(table)) || !(await columnExists(table, column))) {
    console.log(`[skip] nullable ${table}.${column} — table/column missing`);
    return;
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ is_nullable: string }>>(
    `SELECT IS_NULLABLE AS is_nullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  if (String(rows[0]?.is_nullable || "").toUpperCase() === "YES") {
    console.log(`[skip] nullable ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition} NULL`
  );
  console.log(`[ok] nullable ${table}.${column}`);
}

async function addIndexIfMissing(table: string, indexName: string, ddl: string) {
  if (!(await tableExists(table))) {
    console.log(`[skip] index ${indexName} on ${table} — table missing`);
    return;
  }
  if (await indexExists(table, indexName)) {
    console.log(`[skip] index ${table}.${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD ${ddl}`);
  console.log(`[ok] index ${table}.${indexName}`);
}

async function createTables() {
  const tables: Array<{ name: string; ddl: string }> = [
    {
      name: "fundraising_meeting_action_items",
      ddl: `
      CREATE TABLE \`fundraising_meeting_action_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`meeting_id\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(512) NOT NULL,
        \`owner_id\` VARCHAR(191) NULL,
        \`due_date\` DATE NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`linked_task_id\` VARCHAR(191) NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`idempotency_key\` VARCHAR(64) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_meeting_action_items_meeting_key\` (\`meeting_id\`, \`idempotency_key\`),
        INDEX \`fundraising_meeting_action_items_meeting_idx\` (\`meeting_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_campaign_templates",
      ddl: `
      CREATE TABLE \`fundraising_campaign_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`template_type\` VARCHAR(32) NOT NULL,
        \`subject\` VARCHAR(512) NULL,
        \`body_html\` TEXT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_campaign_templates_campaign_idx\` (\`campaign_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_campaign_distribution_lists",
      ddl: `
      CREATE TABLE \`fundraising_campaign_distribution_lists\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`segment_json\` JSON NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_campaign_distribution_lists_campaign_idx\` (\`campaign_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_campaign_distribution_list_members",
      ddl: `
      CREATE TABLE \`fundraising_campaign_distribution_list_members\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`list_id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NULL,
        \`contact_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_campaign_list_members_key\` (\`list_id\`, \`investor_id\`, \`contact_id\`),
        INDEX \`fundraising_campaign_list_members_list_idx\` (\`list_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_campaign_events",
      ddl: `
      CREATE TABLE \`fundraising_campaign_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`event_type\` VARCHAR(64) NOT NULL,
        \`starts_at\` DATETIME(3) NOT NULL,
        \`ends_at\` DATETIME(3) NULL,
        \`location\` VARCHAR(512) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_campaign_events_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_campaign_events_starts_idx\` (\`starts_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_campaign_materials",
      ddl: `
      CREATE TABLE \`fundraising_campaign_materials\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(64) NULL,
        \`confidential\` BOOLEAN NOT NULL DEFAULT false,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_campaign_materials_campaign_idx\` (\`campaign_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_campaign_material_versions",
      ddl: `
      CREATE TABLE \`fundraising_campaign_material_versions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`material_id\` VARCHAR(191) NOT NULL,
        \`version_number\` INT NOT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NOT NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`uploaded_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_campaign_material_versions_key\` (\`material_id\`, \`version_number\`),
        INDEX \`fundraising_campaign_material_versions_material_idx\` (\`material_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_rfp_proposal_versions",
      ddl: `
      CREATE TABLE \`fundraising_rfp_proposal_versions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`rfp_id\` VARCHAR(191) NOT NULL,
        \`version_number\` INT NOT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`approval_request_id\` VARCHAR(191) NULL,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_rfp_proposal_versions_key\` (\`rfp_id\`, \`version_number\`),
        INDEX \`fundraising_rfp_proposal_versions_rfp_idx\` (\`rfp_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_ddq_item_evidence",
      ddl: `
      CREATE TABLE \`fundraising_ddq_item_evidence\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`item_id\` VARCHAR(191) NOT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NOT NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`uploaded_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_item_evidence_item_idx\` (\`item_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_ddq_item_comments",
      ddl: `
      CREATE TABLE \`fundraising_ddq_item_comments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`item_id\` VARCHAR(191) NOT NULL,
        \`author_id\` VARCHAR(191) NOT NULL,
        \`body\` TEXT NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_item_comments_item_idx\` (\`item_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_ddq_questions",
      ddl: `
      CREATE TABLE \`fundraising_ddq_questions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`case_id\` VARCHAR(191) NOT NULL,
        \`question\` TEXT NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`asked_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_questions_case_idx\` (\`case_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_ddq_question_replies",
      ddl: `
      CREATE TABLE \`fundraising_ddq_question_replies\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`question_id\` VARCHAR(191) NOT NULL,
        \`body\` TEXT NOT NULL,
        \`attachments_json\` JSON NULL,
        \`author_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_question_replies_question_idx\` (\`question_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_ddq_answer_library",
      ddl: `
      CREATE TABLE \`fundraising_ddq_answer_library\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`question_key\` VARCHAR(128) NOT NULL,
        \`category\` VARCHAR(128) NULL,
        \`approved_answer\` TEXT NOT NULL,
        \`version\` INT NOT NULL DEFAULT 1,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
        \`approved_by_id\` VARCHAR(191) NULL,
        \`approved_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_answer_library_key_idx\` (\`question_key\`),
        INDEX \`fundraising_ddq_answer_library_category_idx\` (\`category\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_compliance_holds",
      ddl: `
      CREATE TABLE \`fundraising_compliance_holds\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`reason\` TEXT NOT NULL,
        \`placed_by_id\` VARCHAR(191) NOT NULL,
        \`placed_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`released_by_id\` VARCHAR(191) NULL,
        \`released_at\` DATETIME(3) NULL,
        \`release_reason\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_compliance_holds_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_compliance_holds_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_placement_exclusions",
      ddl: `
      CREATE TABLE \`fundraising_placement_exclusions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`agent_id\` VARCHAR(191) NOT NULL,
        \`exclusion_type\` VARCHAR(32) NOT NULL,
        \`investor_id\` VARCHAR(191) NULL,
        \`country_code\` VARCHAR(8) NULL,
        \`geography_json\` JSON NULL,
        \`reason\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_placement_exclusions_agent_idx\` (\`agent_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_placement_commission_ledger",
      ddl: `
      CREATE TABLE \`fundraising_placement_commission_ledger\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`agent_id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`commitment_id\` VARCHAR(191) NULL,
        \`event_type\` VARCHAR(32) NOT NULL,
        \`amount\` DECIMAL(24, 6) NOT NULL,
        \`currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACCRUING',
        \`paid_at\` DATETIME(3) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_placement_commission_ledger_agent_idx\` (\`agent_id\`),
        INDEX \`fundraising_placement_commission_ledger_opp_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_placement_commission_ledger_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_closing_readiness_events",
      ddl: `
      CREATE TABLE \`fundraising_closing_readiness_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`closing_id\` VARCHAR(191) NOT NULL,
        \`event_type\` VARCHAR(64) NOT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`notes\` TEXT NULL,
        \`payload_json\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_closing_readiness_events_closing_idx\` (\`closing_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_report_jobs",
      ddl: `
      CREATE TABLE \`fundraising_report_jobs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`job_type\` VARCHAR(32) NOT NULL DEFAULT 'REPORT',
        \`report_key\` VARCHAR(128) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        \`filters_json\` JSON NULL,
        \`format\` VARCHAR(16) NOT NULL DEFAULT 'JSON',
        \`artifact_url\` VARCHAR(1024) NULL,
        \`artifact_storage_path\` VARCHAR(512) NULL,
        \`error_message\` TEXT NULL,
        \`schedule_id\` VARCHAR(191) NULL,
        \`triggered_by_id\` VARCHAR(191) NOT NULL,
        \`started_at\` DATETIME(3) NULL,
        \`completed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_report_jobs_status_idx\` (\`status\`),
        INDEX \`fundraising_report_jobs_report_key_idx\` (\`report_key\`),
        INDEX \`fundraising_report_jobs_job_type_idx\` (\`job_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_report_schedules",
      ddl: `
      CREATE TABLE \`fundraising_report_schedules\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`report_key\` VARCHAR(128) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`cadence\` VARCHAR(32) NOT NULL,
        \`recipients_json\` JSON NULL,
        \`format\` VARCHAR(16) NOT NULL DEFAULT 'CSV',
        \`filters_json\` JSON NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`next_run_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_report_schedules_report_key_idx\` (\`report_key\`),
        INDEX \`fundraising_report_schedules_next_run_idx\` (\`next_run_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_report_runs",
      ddl: `
      CREATE TABLE \`fundraising_report_runs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`schedule_id\` VARCHAR(191) NULL,
        \`job_id\` VARCHAR(191) NULL,
        \`report_key\` VARCHAR(128) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
        \`run_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`artifact_url\` VARCHAR(1024) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_report_runs_schedule_idx\` (\`schedule_id\`),
        INDEX \`fundraising_report_runs_job_idx\` (\`job_id\`),
        INDEX \`fundraising_report_runs_report_idx\` (\`report_key\`, \`run_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_approval_events",
      ddl: `
      CREATE TABLE \`fundraising_approval_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`approval_id\` VARCHAR(191) NOT NULL,
        \`event_type\` VARCHAR(64) NOT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`notes\` TEXT NULL,
        \`payload_json\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_approval_events_approval_idx\` (\`approval_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fundraising_agreement_provider_artifacts",
      ddl: `
      CREATE TABLE \`fundraising_agreement_provider_artifacts\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`agreement_id\` VARCHAR(191) NOT NULL,
        \`version_id\` VARCHAR(191) NOT NULL,
        \`artifact_type\` VARCHAR(32) NOT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`certificate_ref\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_agreement_provider_artifacts_agreement_idx\` (\`agreement_id\`),
        INDEX \`fundraising_agreement_provider_artifacts_version_idx\` (\`version_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  for (const { name, ddl } of tables) {
    if (await tableExists(name)) {
      console.log(`[skip] ${name}`);
      continue;
    }
    await prisma.$executeRawUnsafe(ddl);
    console.log(`[ok] ${name}`);
  }
}

async function alterExistingTables() {
  // Meetings — outcome-rich completion
  await addColumnIfMissing("fundraising_meetings", "discussion_notes", "TEXT NULL");
  await addColumnIfMissing("fundraising_meetings", "outcome_summary", "TEXT NULL");
  await addColumnIfMissing("fundraising_meetings", "decisions_json", "JSON NULL");
  await addColumnIfMissing("fundraising_meetings", "completed_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_meetings", "completed_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("fundraising_meetings", "cancel_reason", "TEXT NULL");
  await addColumnIfMissing("fundraising_meetings", "completion_nonce", "VARCHAR(64) NULL");
  await addIndexIfMissing(
    "fundraising_meetings",
    "fundraising_meetings_completion_nonce_key",
    "UNIQUE INDEX `fundraising_meetings_completion_nonce_key` (`completion_nonce`)"
  );

  // Campaigns — pause / submit for approval
  await addColumnIfMissing("fundraising_campaigns", "paused_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_campaigns", "paused_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("fundraising_campaigns", "pause_reason", "TEXT NULL");
  await addColumnIfMissing("fundraising_campaigns", "submitted_for_approval_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_campaigns", "activation_approval_id", "VARCHAR(191) NULL");

  // Investors — compliance hold denorm + filter index (gap 9 / 17)
  await addColumnIfMissing(
    "investor_organisations",
    "compliance_hold_active",
    "BOOLEAN NOT NULL DEFAULT false"
  );
  await addColumnIfMissing("investor_organisations", "compliance_hold_id", "VARCHAR(191) NULL");
  await addIndexIfMissing(
    "investor_organisations",
    "investor_organisations_filter_idx",
    "INDEX `investor_organisations_filter_idx` (`country_code`, `kyc_status`, `sanctions_status`, `risk_rating`, `relationship_owner_id`, `estimated_aum`)"
  );
  await addIndexIfMissing(
    "investor_contacts",
    "investor_contacts_filter_idx",
    "INDEX `investor_contacts_filter_idx` (`investor_id`, `status`, `decision_influence`, `last_interaction_at`)"
  );

  // RFP / Mandate stage + onboarding KYC link (gap 12)
  for (const table of ["fundraising_rfps", "fundraising_mandates"]) {
    await addColumnIfMissing(table, "stage_code", "VARCHAR(64) NULL");
    await addColumnIfMissing(table, "stage_name", "VARCHAR(128) NULL");
    await addColumnIfMissing(table, "current_stage_id", "VARCHAR(191) NULL");
    await addColumnIfMissing(table, "onboarding_kyc_case_id", "VARCHAR(191) NULL");
  }

  // DDQ case lifecycle + item question key (gap 13)
  await addColumnIfMissing("fundraising_ddq_cases", "archived_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_ddq_cases", "submitted_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_ddq_cases", "approved_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_ddq_cases", "internal_review_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_ddq_items", "question_key", "VARCHAR(128) NULL");

  // Data rooms — permissions / revoke / monitoring (gap 14)
  await addColumnIfMissing("fundraising_data_rooms", "expires_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_data_rooms", "revoked_at", "DATETIME(3) NULL");
  await addColumnIfMissing(
    "fundraising_data_rooms",
    "default_watermark_enabled",
    "BOOLEAN NOT NULL DEFAULT false"
  );
  await addColumnIfMissing("fundraising_data_rooms", "default_download_limit", "INT NULL");

  await addColumnIfMissing("fundraising_data_room_access", "contact_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(
    "fundraising_data_room_access",
    "permission_level",
    "VARCHAR(32) NOT NULL DEFAULT 'DOWNLOAD'"
  );
  await addColumnIfMissing("fundraising_data_room_access", "download_limit", "INT NULL");
  await addColumnIfMissing(
    "fundraising_data_room_access",
    "watermark_enabled",
    "BOOLEAN NOT NULL DEFAULT false"
  );
  await addColumnIfMissing("fundraising_data_room_access", "revoked_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("fundraising_data_room_access", "revoke_reason", "TEXT NULL");
  await addIndexIfMissing(
    "fundraising_data_room_access",
    "fundraising_data_room_access_grant_idx",
    "INDEX `fundraising_data_room_access_grant_idx` (`data_room_id`, `investor_id`, `contact_id`, `revoked_at`)"
  );

  await addColumnIfMissing("fundraising_data_room_access_logs", "investor_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(
    "fundraising_data_room_access_logs",
    "success",
    "BOOLEAN NOT NULL DEFAULT true"
  );
  await addColumnIfMissing(
    "fundraising_data_room_access_logs",
    "failure_reason",
    "VARCHAR(255) NULL"
  );
  await addIndexIfMissing(
    "fundraising_data_room_access_logs",
    "fundraising_data_room_access_logs_monitor_idx",
    "INDEX `fundraising_data_room_access_logs_monitor_idx` (`data_room_id`, `action`, `created_at`)"
  );

  // Documents — version metadata (gap 15)
  await addColumnIfMissing("fundraising_documents", "current_version_number", "INT NULL");
  await addColumnIfMissing("fundraising_document_versions", "change_notes", "TEXT NULL");
  await addColumnIfMissing(
    "fundraising_document_versions",
    "status",
    "VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'"
  );

  // Agreements — provider / decline (gap 16)
  await addColumnIfMissing(
    "fundraising_agreements",
    "provider",
    "VARCHAR(32) NOT NULL DEFAULT 'MANUAL'"
  );
  await addColumnIfMissing("fundraising_agreements", "provider_envelope_id", "VARCHAR(255) NULL");
  await addColumnIfMissing("fundraising_agreements", "provider_status", "VARCHAR(32) NULL");
  await addColumnIfMissing("fundraising_agreements", "sent_at", "DATETIME(3) NULL");

  await addColumnIfMissing("fundraising_agreement_signatories", "declined_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_agreement_signatories", "decline_reason", "TEXT NULL");
  await addColumnIfMissing("fundraising_agreement_signatories", "voided_at", "DATETIME(3) NULL");
  await addColumnIfMissing("fundraising_agreement_signatories", "void_reason", "TEXT NULL");
  await addColumnIfMissing(
    "fundraising_agreement_signatories",
    "provider_recipient_id",
    "VARCHAR(255) NULL"
  );
  await makeColumnNullableIfNeeded(
    "fundraising_agreement_signatories",
    "version_id",
    "VARCHAR(191)"
  );
  await addColumnIfMissing("fundraising_agreement_versions", "checksum", "VARCHAR(64) NULL");

  // KYC lifecycle (gap 17)
  await addColumnIfMissing("fundraising_kyc_cases", "docs_note", "TEXT NULL");
  await addColumnIfMissing("fundraising_kyc_cases", "conditions_json", "JSON NULL");
  await addColumnIfMissing("fundraising_kyc_cases", "terminal_status", "VARCHAR(32) NULL");
  await addColumnIfMissing("fundraising_kyc_cases", "approved_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("fundraising_kyc_cases", "rejected_by_id", "VARCHAR(191) NULL");

  // Placement — unassign + ledger source (gap 18)
  await addColumnIfMissing("fundraising_placement_assignments", "unassigned_at", "DATETIME(3) NULL");
  await addColumnIfMissing(
    "fundraising_placement_assignments",
    "unassigned_by_id",
    "VARCHAR(191) NULL"
  );

  // Closings — readiness / post-close (gap 19)
  await addColumnIfMissing("fundraising_closings", "name", "VARCHAR(255) NULL");
  await addColumnIfMissing("fundraising_closings", "target_amount", "DECIMAL(24, 6) NULL");
  await addColumnIfMissing("fundraising_closings", "readiness_json", "JSON NULL");
  await addColumnIfMissing("fundraising_closings", "post_close_json", "JSON NULL");
  await addColumnIfMissing("fundraising_closings", "closed_at", "DATETIME(3) NULL");

  // Forecasts — recalc metadata (gap 21)
  await addColumnIfMissing("fundraising_forecast_scenarios", "recalculated_at", "DATETIME(3) NULL");
  await addColumnIfMissing(
    "fundraising_forecast_scenarios",
    "assumption_hash",
    "VARCHAR(64) NULL"
  );

  // Approvals — amount + history support (gap 23)
  await addColumnIfMissing("fundraising_approval_requests", "amount", "DECIMAL(24, 6) NULL");
  await addColumnIfMissing("fundraising_approval_requests", "currency", "VARCHAR(8) NULL");
  await addColumnIfMissing("fundraising_approval_requests", "decided_at", "DATETIME(3) NULL");

  // Audit — export range index (gap 24)
  await addIndexIfMissing(
    "fundraising_audit_logs",
    "fundraising_audit_logs_export_idx",
    "INDEX `fundraising_audit_logs_export_idx` (`timestamp`, `object_type`, `user_id`)"
  );
}

async function backfillLegacyEvidence() {
  if (!(await tableExists("fundraising_ddq_items")) || !(await tableExists("fundraising_ddq_item_evidence"))) {
    console.log("[skip] DDQ evidence backfill — tables missing");
    return;
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; evidence_url: string | null; evidence_storage_path: string | null; evidence_sha256: string | null }>
  >(
    `SELECT \`id\`, \`evidence_url\`, \`evidence_storage_path\`, \`evidence_sha256\`
     FROM \`fundraising_ddq_items\`
     WHERE \`evidence_url\` IS NOT NULL OR \`evidence_storage_path\` IS NOT NULL`
  );

  let inserted = 0;
  for (const row of rows) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM \`fundraising_ddq_item_evidence\` WHERE \`item_id\` = ?`,
      row.id
    );
    if (Number(existing[0]?.c ?? 0) > 0) continue;

    const id = "c" + Buffer.from(`${row.id}:legacy`).toString("hex").slice(0, 24);
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`fundraising_ddq_item_evidence\`
       (\`id\`, \`item_id\`, \`file_url\`, \`storage_path\`, \`file_name\`, \`sha256\`, \`uploaded_by_id\`, \`created_at\`)
       VALUES (?, ?, ?, ?, 'legacy-evidence', ?, 'system', CURRENT_TIMESTAMP(3))`,
      id,
      row.id,
      row.evidence_url,
      row.evidence_storage_path,
      row.evidence_sha256
    );
    inserted++;
  }
  console.log(`[ok] DDQ evidence backfill inserted ${inserted} row(s)`);
}

async function backfillDocumentVersionNumbers() {
  if (!(await tableExists("fundraising_documents")) || !(await tableExists("fundraising_document_versions"))) {
    console.log("[skip] document version number backfill — tables missing");
    return;
  }

  await prisma.$executeRawUnsafe(`
    UPDATE \`fundraising_documents\` d
    SET \`current_version_number\` = (
      SELECT MAX(\`version_number\`) FROM \`fundraising_document_versions\` v WHERE v.\`document_id\` = d.\`id\`
    )
    WHERE \`current_version_number\` IS NULL
      AND EXISTS (SELECT 1 FROM \`fundraising_document_versions\` v2 WHERE v2.\`document_id\` = d.\`id\`)
  `);
  console.log("[ok] fundraising_documents.current_version_number backfill");
}

async function main() {
  await createTables();
  await alterExistingTables();
  await backfillLegacyEvidence();
  await backfillDocumentVersionNumbers();
  console.log("Fundraising requirements gap migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
