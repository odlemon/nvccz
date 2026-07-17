/**
 * Fundraising SRD expansion — opportunity checklist, communications, commitments,
 * closings, mandates, RFPs, DDQ, KYC, data rooms, agreements, placement agents,
 * forecasts, audit logs.
 * Idempotent. Run: npm run db:migrate:fundraising-srd-expansion
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

async function getColumnMeta(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ COLUMN_TYPE: string }>>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return rows[0] || null;
}

async function widenOpportunityAmountHistoryReason() {
  if (!(await tableExists("opportunity_amount_history"))) {
    console.log("[skip] opportunity_amount_history missing");
    return;
  }
  const col = await getColumnMeta("opportunity_amount_history", "reason");
  if (!col) {
    console.log("[skip] opportunity_amount_history.reason missing");
    return;
  }
  const type = String(col.COLUMN_TYPE).toLowerCase();
  if (type.includes("varchar(512)")) {
    console.log("[skip] opportunity_amount_history.reason already VARCHAR(512)");
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`opportunity_amount_history\` MODIFY COLUMN \`reason\` VARCHAR(512) NULL`
  );
  console.log("[ok] opportunity_amount_history.reason VARCHAR(512)");
}

async function createTables() {
  if (!(await tableExists("fundraising_opportunity_checklist_items"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_opportunity_checklist_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NOT NULL,
        \`stage_id\` VARCHAR(191) NOT NULL,
        \`item_key\` VARCHAR(64) NOT NULL,
        \`label\` VARCHAR(255) NOT NULL,
        \`is_required\` BOOLEAN NOT NULL DEFAULT true,
        \`is_complete\` BOOLEAN NOT NULL DEFAULT false,
        \`completed_at\` DATETIME(3) NULL,
        \`completed_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_opp_checklist_opp_stage_key\` (\`opportunity_id\`, \`stage_id\`, \`item_key\`),
        INDEX \`fundraising_opp_checklist_opp_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_opp_checklist_stage_idx\` (\`stage_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_opportunity_checklist_items");
  } else {
    console.log("[skip] fundraising_opportunity_checklist_items");
  }

  if (!(await tableExists("fundraising_communications"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_communications\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`investor_id\` VARCHAR(191) NULL,
        \`contact_id\` VARCHAR(191) NULL,
        \`interaction_type\` VARCHAR(64) NOT NULL,
        \`subject\` VARCHAR(512) NULL,
        \`summary\` TEXT NULL,
        \`outcome\` VARCHAR(128) NULL,
        \`sentiment\` VARCHAR(32) NULL,
        \`confidentiality\` VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
        \`next_action\` VARCHAR(512) NULL,
        \`due_date\` DATE NULL,
        \`owner_id\` VARCHAR(191) NULL,
        \`participants\` JSON NULL,
        \`attachments\` JSON NULL,
        \`occurred_at\` DATETIME(3) NOT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_communications_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_communications_opportunity_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_communications_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_communications_occurred_idx\` (\`occurred_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_communications");
  } else {
    console.log("[skip] fundraising_communications");
  }

  if (!(await tableExists("fundraising_closings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_closings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NULL,
        \`close_type\` VARCHAR(64) NOT NULL,
        \`closing_date\` DATE NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
        \`total_commitment_value\` DECIMAL(24, 6) NULL,
        \`legal_ready\` BOOLEAN NOT NULL DEFAULT false,
        \`compliance_ready\` BOOLEAN NOT NULL DEFAULT false,
        \`fund_ready\` BOOLEAN NOT NULL DEFAULT false,
        \`equalisation_status\` VARCHAR(64) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_closings_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_closings_fund_idx\` (\`fund_id\`),
        INDEX \`fundraising_closings_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_closings");
  } else {
    console.log("[skip] fundraising_closings");
  }

  if (!(await tableExists("fundraising_commitments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_commitments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NULL,
        \`currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`commitment_amount\` DECIMAL(24, 6) NOT NULL,
        \`funded_amount\` DECIMAL(24, 6) NOT NULL DEFAULT 0,
        \`unfunded_amount\` DECIMAL(24, 6) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`signed_at\` DATETIME(3) NULL,
        \`admission_date\` DATE NULL,
        \`closing_id\` VARCHAR(191) NULL,
        \`side_letter\` JSON NULL,
        \`capital_call_contact\` VARCHAR(255) NULL,
        \`compliance_status\` VARCHAR(64) NULL,
        \`accounting_status\` VARCHAR(64) NULL,
        \`client_id\` VARCHAR(191) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_commitments_opportunity_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_commitments_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_commitments_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_commitments_closing_idx\` (\`closing_id\`),
        INDEX \`fundraising_commitments_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_commitments");
  } else {
    console.log("[skip] fundraising_commitments");
  }

  if (!(await tableExists("fundraising_rfps"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_rfps\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`reference_number\` VARCHAR(128) NULL,
        \`institution_name\` VARCHAR(255) NOT NULL,
        \`deadline\` DATE NULL,
        \`presentation_date\` DATE NULL,
        \`evaluation_criteria\` JSON NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`outcome\` VARCHAR(64) NULL,
        \`debrief_notes\` TEXT NULL,
        \`loss_reason\` VARCHAR(255) NULL,
        \`next_action\` VARCHAR(512) NULL,
        \`commercial_info\` JSON NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_rfps_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_rfps_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_rfps_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_rfps");
  } else {
    console.log("[skip] fundraising_rfps");
  }

  if (!(await tableExists("fundraising_mandates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_mandates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`rfp_id\` VARCHAR(191) NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`expected_aum\` DECIMAL(24, 6) NULL,
        \`activated_aum\` DECIMAL(24, 6) NOT NULL DEFAULT 0,
        \`currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`agreement_signed\` BOOLEAN NOT NULL DEFAULT false,
        \`kyc_approved\` BOOLEAN NOT NULL DEFAULT false,
        \`guidelines_configured\` BOOLEAN NOT NULL DEFAULT false,
        \`benchmark_configured\` BOOLEAN NOT NULL DEFAULT false,
        \`fees_configured\` BOOLEAN NOT NULL DEFAULT false,
        \`reporting_configured\` BOOLEAN NOT NULL DEFAULT false,
        \`custodian_confirmed\` BOOLEAN NOT NULL DEFAULT false,
        \`opening_balances_verified\` BOOLEAN NOT NULL DEFAULT false,
        \`assets_received\` BOOLEAN NOT NULL DEFAULT false,
        \`activated_at\` DATETIME(3) NULL,
        \`owner_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_mandates_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_mandates_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_mandates_opportunity_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_mandates_rfp_idx\` (\`rfp_id\`),
        INDEX \`fundraising_mandates_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_mandates");
  } else {
    console.log("[skip] fundraising_mandates");
  }

  if (!(await tableExists("fundraising_commercial_terms"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_commercial_terms\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NOT NULL,
        \`terms_type\` VARCHAR(16) NOT NULL,
        \`terms_json\` JSON NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_commercial_terms_opportunity_key\` (\`opportunity_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_commercial_terms");
  } else {
    console.log("[skip] fundraising_commercial_terms");
  }

  if (!(await tableExists("fundraising_approval_requests"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_approval_requests\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`object_type\` VARCHAR(64) NOT NULL,
        \`object_id\` VARCHAR(191) NOT NULL,
        \`request_type\` VARCHAR(64) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`requested_by_id\` VARCHAR(191) NOT NULL,
        \`decided_by_id\` VARCHAR(191) NULL,
        \`reason\` VARCHAR(512) NULL,
        \`decision_notes\` TEXT NULL,
        \`payload\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_approval_requests_object_idx\` (\`object_type\`, \`object_id\`),
        INDEX \`fundraising_approval_requests_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_approval_requests");
  } else {
    console.log("[skip] fundraising_approval_requests");
  }

  if (!(await tableExists("fundraising_ddq_templates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_ddq_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(128) NULL,
        \`questions_json\` JSON NOT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_templates_category_idx\` (\`category\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_ddq_templates");
  } else {
    console.log("[skip] fundraising_ddq_templates");
  }

  if (!(await tableExists("fundraising_ddq_cases"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_ddq_cases\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`template_id\` VARCHAR(191) NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`progress_pct\` DECIMAL(5, 2) NOT NULL DEFAULT 0,
        \`owner_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_cases_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_ddq_cases_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_ddq_cases_opportunity_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_ddq_cases_template_idx\` (\`template_id\`),
        INDEX \`fundraising_ddq_cases_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_ddq_cases");
  } else {
    console.log("[skip] fundraising_ddq_cases");
  }

  if (!(await tableExists("fundraising_ddq_items"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_ddq_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`case_id\` VARCHAR(191) NOT NULL,
        \`category\` VARCHAR(128) NULL,
        \`requirement\` TEXT NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`owner_id\` VARCHAR(191) NULL,
        \`due_date\` DATE NULL,
        \`version\` INT NOT NULL DEFAULT 1,
        \`evidence_url\` VARCHAR(1024) NULL,
        \`evidence_storage_path\` VARCHAR(512) NULL,
        \`evidence_sha256\` VARCHAR(64) NULL,
        \`reviewer_comments\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_ddq_items_case_idx\` (\`case_id\`),
        INDEX \`fundraising_ddq_items_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_ddq_items");
  } else {
    console.log("[skip] fundraising_ddq_items");
  }

  if (!(await tableExists("fundraising_kyc_cases"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_kyc_cases\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`risk_rating\` VARCHAR(32) NULL,
        \`pep_flag\` BOOLEAN NOT NULL DEFAULT false,
        \`adverse_media_flag\` BOOLEAN NOT NULL DEFAULT false,
        \`details_json\` JSON NULL,
        \`owner_id\` VARCHAR(191) NULL,
        \`decided_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_kyc_cases_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_kyc_cases_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_kyc_cases");
  } else {
    console.log("[skip] fundraising_kyc_cases");
  }

  if (!(await tableExists("fundraising_data_rooms"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_data_rooms\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`requires_mfa\` BOOLEAN NOT NULL DEFAULT false,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_data_rooms_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_data_rooms_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_data_rooms");
  } else {
    console.log("[skip] fundraising_data_rooms");
  }

  if (!(await tableExists("fundraising_data_room_folders"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_data_room_folders\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`data_room_id\` VARCHAR(191) NOT NULL,
        \`parent_id\` VARCHAR(191) NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_data_room_folders_room_idx\` (\`data_room_id\`),
        INDEX \`fundraising_data_room_folders_parent_idx\` (\`parent_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_data_room_folders");
  } else {
    console.log("[skip] fundraising_data_room_folders");
  }

  if (!(await tableExists("fundraising_data_room_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_data_room_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`data_room_id\` VARCHAR(191) NOT NULL,
        \`folder_id\` VARCHAR(191) NULL,
        \`file_name\` VARCHAR(255) NOT NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`view_only\` BOOLEAN NOT NULL DEFAULT false,
        \`download_limit\` INT NULL,
        \`watermark_enabled\` BOOLEAN NOT NULL DEFAULT false,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_data_room_documents_room_idx\` (\`data_room_id\`),
        INDEX \`fundraising_data_room_documents_folder_idx\` (\`folder_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_data_room_documents");
  } else {
    console.log("[skip] fundraising_data_room_documents");
  }

  if (!(await tableExists("fundraising_data_room_access"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_data_room_access\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`data_room_id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`expires_at\` DATETIME(3) NULL,
        \`revoked_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_data_room_access_room_idx\` (\`data_room_id\`),
        INDEX \`fundraising_data_room_access_investor_idx\` (\`investor_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_data_room_access");
  } else {
    console.log("[skip] fundraising_data_room_access");
  }

  if (!(await tableExists("fundraising_data_room_access_logs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_data_room_access_logs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`data_room_id\` VARCHAR(191) NOT NULL,
        \`document_id\` VARCHAR(191) NULL,
        \`user_id\` VARCHAR(191) NOT NULL,
        \`action\` VARCHAR(64) NOT NULL,
        \`ip_address\` VARCHAR(64) NULL,
        \`device\` VARCHAR(255) NULL,
        \`country\` VARCHAR(8) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_data_room_access_logs_room_idx\` (\`data_room_id\`),
        INDEX \`fundraising_data_room_access_logs_document_idx\` (\`document_id\`),
        INDEX \`fundraising_data_room_access_logs_user_idx\` (\`user_id\`),
        INDEX \`fundraising_data_room_access_logs_created_idx\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_data_room_access_logs");
  } else {
    console.log("[skip] fundraising_data_room_access_logs");
  }

  if (!(await tableExists("fundraising_agreements"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_agreements\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`investor_id\` VARCHAR(191) NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`commitment_id\` VARCHAR(191) NULL,
        \`document_type\` VARCHAR(64) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_agreements_opportunity_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_agreements_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_agreements_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_agreements_commitment_idx\` (\`commitment_id\`),
        INDEX \`fundraising_agreements_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_agreements");
  } else {
    console.log("[skip] fundraising_agreements");
  }

  if (!(await tableExists("fundraising_agreement_versions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_agreement_versions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`agreement_id\` VARCHAR(191) NOT NULL,
        \`version_number\` INT NOT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`file_name\` VARCHAR(255) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_agreement_versions_agreement_idx\` (\`agreement_id\`),
        UNIQUE INDEX \`fundraising_agreement_versions_agreement_version_key\` (\`agreement_id\`, \`version_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_agreement_versions");
  } else {
    console.log("[skip] fundraising_agreement_versions");
  }

  if (!(await tableExists("fundraising_agreement_signatories"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_agreement_signatories\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`agreement_id\` VARCHAR(191) NOT NULL,
        \`version_id\` VARCHAR(191) NOT NULL,
        \`full_name\` VARCHAR(255) NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`sequence_order\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        \`invited_at\` DATETIME(3) NULL,
        \`expires_at\` DATETIME(3) NULL,
        \`signed_at\` DATETIME(3) NULL,
        \`certificate_ref\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_agreement_signatories_agreement_idx\` (\`agreement_id\`),
        INDEX \`fundraising_agreement_signatories_version_idx\` (\`version_id\`),
        INDEX \`fundraising_agreement_signatories_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_agreement_signatories");
  } else {
    console.log("[skip] fundraising_agreement_signatories");
  }

  if (!(await tableExists("fundraising_placement_agents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_placement_agents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`legal_name\` VARCHAR(255) NOT NULL,
        \`territory\` VARCHAR(128) NULL,
        \`geography_json\` JSON NULL,
        \`investor_restrictions_json\` JSON NULL,
        \`commission_pct\` DECIMAL(8, 4) NULL,
        \`retainer\` DECIMAL(24, 6) NULL,
        \`success_fee\` DECIMAL(24, 6) NULL,
        \`appointment_start\` DATE NULL,
        \`appointment_end\` DATE NULL,
        \`protected_until\` DATE NULL,
        \`supporting_agreement_url\` VARCHAR(1024) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_placement_agents_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_placement_agents");
  } else {
    console.log("[skip] fundraising_placement_agents");
  }

  if (!(await tableExists("fundraising_placement_assignments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_placement_assignments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`agent_id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_placement_assignments_agent_opp_key\` (\`agent_id\`, \`opportunity_id\`),
        INDEX \`fundraising_placement_assignments_opportunity_idx\` (\`opportunity_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_placement_assignments");
  } else {
    console.log("[skip] fundraising_placement_assignments");
  }

  if (!(await tableExists("fundraising_forecast_scenarios"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_forecast_scenarios\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`scenario_type\` VARCHAR(16) NOT NULL,
        \`assumptions_json\` JSON NULL,
        \`projected_signed\` DECIMAL(24, 6) NULL,
        \`projected_aum\` DECIMAL(24, 6) NULL,
        \`projected_fees\` DECIMAL(24, 6) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_forecast_scenarios_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_forecast_scenarios_type_idx\` (\`scenario_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_forecast_scenarios");
  } else {
    console.log("[skip] fundraising_forecast_scenarios");
  }

  if (!(await tableExists("fundraising_audit_logs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_audit_logs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`timestamp\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`user_id\` VARCHAR(191) NOT NULL,
        \`role\` VARCHAR(64) NULL,
        \`ip_address\` VARCHAR(64) NULL,
        \`session_id\` VARCHAR(128) NULL,
        \`device\` VARCHAR(255) NULL,
        \`action\` VARCHAR(128) NOT NULL,
        \`object_type\` VARCHAR(64) NOT NULL,
        \`object_id\` VARCHAR(191) NOT NULL,
        \`previous_value\` JSON NULL,
        \`new_value\` JSON NULL,
        \`reason\` TEXT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_audit_logs_timestamp_idx\` (\`timestamp\`),
        INDEX \`fundraising_audit_logs_user_idx\` (\`user_id\`),
        INDEX \`fundraising_audit_logs_object_idx\` (\`object_type\`, \`object_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_audit_logs");
  } else {
    console.log("[skip] fundraising_audit_logs");
  }
}

async function main() {
  await widenOpportunityAmountHistoryReason();
  await createTables();
  console.log("Fundraising SRD expansion migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
