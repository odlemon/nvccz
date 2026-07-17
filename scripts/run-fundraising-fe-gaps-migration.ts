/**
 * Fundraising FE gaps — settings, meetings, documents register, commitment checklist,
 * mandate/RFP fields, placement commissions, forecast curve, campaign engagement cache.
 * Idempotent. Run: npm run db:migrate:fundraising-fe-gaps
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import {
  PE_VC_STAGE_SEED,
  AM_MANDATE_STAGE_SEED,
} from "../src/services/fundraising/FundraisingIrStageSeeds";

const prisma = new PrismaClient();

function cuid(): string {
  return "c" + randomBytes(12).toString("hex").slice(0, 24);
}

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

const DEFAULT_AMOUNT_TYPES = [
  { key: "INDICATIVE", label: "Indicative", enabled: true },
  { key: "QUALIFIED", label: "Qualified", enabled: true },
  { key: "SOFT_CIRCLE", label: "Soft Circle", enabled: true },
  { key: "PROPOSED", label: "Proposed", enabled: true },
  { key: "SIGNED", label: "Signed", enabled: true },
  { key: "ADMITTED", label: "Admitted", enabled: true },
  { key: "FUNDED", label: "Funded", enabled: true },
  { key: "EXPECTED_AUM", label: "Expected AUM", enabled: true },
  { key: "ACTIVATED_AUM", label: "Activated AUM", enabled: true },
];

const DEFAULT_NOTIFICATIONS = [
  {
    id: "notif-stage-gate-failed",
    eventKey: "STAGE_GATE_FAILED",
    channel: "IN_APP",
    enabled: true,
    recipients: ["CAMPAIGN_OWNER", "OPPORTUNITY_OWNER"],
  },
];

async function createTables() {
  if (!(await tableExists("fundraising_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_settings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`settings_key\` VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
        \`pipelines_json\` JSON NULL,
        \`amount_types_json\` JSON NOT NULL,
        \`notifications_json\` JSON NOT NULL,
        \`roles_json\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_settings_key\` (\`settings_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_settings");
  } else {
    console.log("[skip] fundraising_settings");
  }

  if (!(await tableExists("fundraising_pipeline_templates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_pipeline_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pipeline_key\` VARCHAR(32) NOT NULL,
        \`stage_code\` VARCHAR(64) NOT NULL,
        \`stage_name\` VARCHAR(128) NOT NULL,
        \`sort_order\` INT NOT NULL,
        \`win_probability_pct\` DECIMAL(5, 2) NOT NULL,
        \`gate_rules\` JSON NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_pipeline_templates_key_code\` (\`pipeline_key\`, \`stage_code\`),
        INDEX \`fundraising_pipeline_templates_key_sort\` (\`pipeline_key\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_pipeline_templates");
  } else {
    console.log("[skip] fundraising_pipeline_templates");
  }

  if (!(await tableExists("fundraising_meetings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_meetings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`meeting_type\` VARCHAR(32) NOT NULL,
        \`scheduled_start\` DATETIME(3) NOT NULL,
        \`scheduled_end\` DATETIME(3) NOT NULL,
        \`timezone\` VARCHAR(64) NOT NULL DEFAULT 'UTC',
        \`location\` TEXT NULL,
        \`video_link\` VARCHAR(1024) NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`investor_id\` VARCHAR(191) NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`contact_id\` VARCHAR(191) NULL,
        \`owner_id\` VARCHAR(191) NOT NULL,
        \`agenda\` TEXT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
        \`communication_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_meetings_scheduled_start_idx\` (\`scheduled_start\`),
        INDEX \`fundraising_meetings_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_meetings_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_meetings_opportunity_idx\` (\`opportunity_id\`),
        INDEX \`fundraising_meetings_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_meetings");
  } else {
    console.log("[skip] fundraising_meetings");
  }

  if (!(await tableExists("fundraising_meeting_attendees"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_meeting_attendees\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`meeting_id\` VARCHAR(191) NOT NULL,
        \`email\` VARCHAR(255) NULL,
        \`full_name\` VARCHAR(255) NULL,
        \`user_id\` VARCHAR(191) NULL,
        \`role\` VARCHAR(32) NOT NULL DEFAULT 'EXTERNAL',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_meeting_attendees_meeting_idx\` (\`meeting_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_meeting_attendees");
  } else {
    console.log("[skip] fundraising_meeting_attendees");
  }

  if (!(await tableExists("fundraising_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(64) NOT NULL,
        \`source_type\` VARCHAR(32) NOT NULL,
        \`source_id\` VARCHAR(191) NULL,
        \`campaign_id\` VARCHAR(191) NULL,
        \`investor_id\` VARCHAR(191) NULL,
        \`opportunity_id\` VARCHAR(191) NULL,
        \`confidential\` BOOLEAN NOT NULL DEFAULT false,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_documents_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_documents_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_documents_category_idx\` (\`category\`),
        INDEX \`fundraising_documents_source_type_idx\` (\`source_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_documents");
  } else {
    console.log("[skip] fundraising_documents");
  }

  if (!(await tableExists("fundraising_document_versions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_document_versions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`document_id\` VARCHAR(191) NOT NULL,
        \`version_number\` INT NOT NULL,
        \`file_url\` VARCHAR(1024) NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NOT NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`uploaded_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_document_versions_doc_version\` (\`document_id\`, \`version_number\`),
        INDEX \`fundraising_document_versions_document_idx\` (\`document_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_document_versions");
  } else {
    console.log("[skip] fundraising_document_versions");
  }

  if (!(await tableExists("fundraising_commitment_checklist_items"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_commitment_checklist_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`commitment_id\` VARCHAR(191) NOT NULL,
        \`item_key\` VARCHAR(64) NOT NULL,
        \`label\` VARCHAR(255) NOT NULL,
        \`is_required\` BOOLEAN NOT NULL DEFAULT true,
        \`is_complete\` BOOLEAN NOT NULL DEFAULT false,
        \`completed_at\` DATETIME(3) NULL,
        \`completed_by_id\` VARCHAR(191) NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_commitment_checklist_commitment_key\` (\`commitment_id\`, \`item_key\`),
        INDEX \`fundraising_commitment_checklist_commitment_idx\` (\`commitment_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_commitment_checklist_items");
  } else {
    console.log("[skip] fundraising_commitment_checklist_items");
  }
}

async function alterExistingTables() {
  if (await tableExists("fundraising_mandates")) {
    await addColumnIfMissing("fundraising_mandates", "asset_class", "VARCHAR(128) NULL");
    await addColumnIfMissing("fundraising_mandates", "geography", "VARCHAR(255) NULL");
    await addColumnIfMissing("fundraising_mandates", "rfp_due_date", "DATE NULL");
  } else {
    console.log("[skip] fundraising_mandates alter — table missing");
  }

  if (await tableExists("fundraising_rfps")) {
    await addColumnIfMissing("fundraising_rfps", "asset_class", "VARCHAR(128) NULL");
    await addColumnIfMissing("fundraising_rfps", "geography", "VARCHAR(255) NULL");
    await addColumnIfMissing("fundraising_rfps", "fit_score", "DECIMAL(5, 2) NULL");
  } else {
    console.log("[skip] fundraising_rfps alter — table missing");
  }

  if (await tableExists("fundraising_placement_agents")) {
    await addColumnIfMissing(
      "fundraising_placement_agents",
      "commission_status",
      "VARCHAR(32) NULL DEFAULT 'ACCRUING'"
    );
    await addColumnIfMissing(
      "fundraising_placement_agents",
      "accrued_commission",
      "DECIMAL(24, 6) NOT NULL DEFAULT 0"
    );
    await addColumnIfMissing(
      "fundraising_placement_agents",
      "paid_commission",
      "DECIMAL(24, 6) NOT NULL DEFAULT 0"
    );
  } else {
    console.log("[skip] fundraising_placement_agents alter — table missing");
  }

  if (await tableExists("fundraising_forecast_scenarios")) {
    await addColumnIfMissing("fundraising_forecast_scenarios", "monthly_projection", "JSON NULL");
  } else {
    console.log("[skip] fundraising_forecast_scenarios alter — table missing");
  }

  if (await tableExists("fundraising_campaigns")) {
    await addColumnIfMissing("fundraising_campaigns", "engagement_json", "JSON NULL");
  } else {
    console.log("[skip] fundraising_campaigns alter — table missing");
  }
}

async function seedPipelineTemplates() {
  const pipelines: Array<{ key: string; seed: typeof PE_VC_STAGE_SEED }> = [
    { key: "PE_VC", seed: PE_VC_STAGE_SEED },
    { key: "AM", seed: AM_MANDATE_STAGE_SEED },
  ];

  for (const { key, seed } of pipelines) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM \`fundraising_pipeline_templates\` WHERE \`pipeline_key\` = ?`,
      key
    );
    if (Number(existing[0]?.c ?? 0) > 0) {
      console.log(`[skip] pipeline templates seed ${key} — already populated`);
      continue;
    }

    for (const stage of seed) {
      const id = cuid();
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`fundraising_pipeline_templates\`
         (\`id\`, \`pipeline_key\`, \`stage_code\`, \`stage_name\`, \`sort_order\`, \`win_probability_pct\`, \`gate_rules\`, \`is_active\`, \`updated_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, true, CURRENT_TIMESTAMP(3))`,
        id,
        key,
        stage.stageCode,
        stage.stageName,
        stage.sortOrder,
        stage.winProbabilityPct,
        stage.gateRules ? JSON.stringify(stage.gateRules) : null
      );
    }
    console.log(`[ok] pipeline templates seed ${key} (${seed.length} stages)`);
  }
}

async function seedSettings() {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`fundraising_settings\` WHERE \`settings_key\` = 'DEFAULT'`
  );
  if (Number(rows[0]?.c ?? 0) > 0) {
    console.log("[skip] fundraising_settings DEFAULT row");
    return;
  }

  const id = cuid();
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`fundraising_settings\`
     (\`id\`, \`settings_key\`, \`amount_types_json\`, \`notifications_json\`, \`roles_json\`, \`updated_at\`)
     VALUES (?, 'DEFAULT', ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    id,
    JSON.stringify(DEFAULT_AMOUNT_TYPES),
    JSON.stringify(DEFAULT_NOTIFICATIONS),
    JSON.stringify([])
  );
  console.log("[ok] fundraising_settings DEFAULT row");
}

async function main() {
  await createTables();
  await alterExistingTables();
  await seedPipelineTemplates();
  await seedSettings();
  console.log("Fundraising FE gaps migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
