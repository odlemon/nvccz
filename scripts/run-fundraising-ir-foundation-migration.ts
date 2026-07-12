/**
 * Fundraising & IR foundation — alter campaigns, widen stage_code, create IR tables.
 * Idempotent. Run: npm run db:migrate:fundraising-ir-foundation
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

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
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
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function addIndexIfMissing(table: string, indexName: string, ddl: string) {
  if (await indexExists(table, indexName)) {
    console.log(`[skip] index ${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] index ${indexName}`);
}

async function getColumnMeta(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ IS_NULLABLE: string; COLUMN_TYPE: string; COLUMN_KEY: string }>
  >(
    `SELECT IS_NULLABLE, COLUMN_TYPE, COLUMN_KEY FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return rows[0] || null;
}

async function alterFundraisingCampaigns() {
  if (!(await tableExists("fundraising_campaigns"))) {
    console.log("[skip] fundraising_campaigns missing — run LP pipeline migration first");
    return;
  }

  // Make fund_id nullable for AM mandate campaigns
  const fundCol = await getColumnMeta("fundraising_campaigns", "fund_id");
  if (fundCol && fundCol.IS_NULLABLE === "NO") {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`fundraising_campaigns\` MODIFY COLUMN \`fund_id\` VARCHAR(191) NULL`
    );
    console.log("[ok] fundraising_campaigns.fund_id nullable");
  } else {
    console.log("[skip] fundraising_campaigns.fund_id already nullable or missing");
  }

  // Widen target_capital
  const targetCol = await getColumnMeta("fundraising_campaigns", "target_capital");
  if (targetCol && !String(targetCol.COLUMN_TYPE).includes("24,6") && !String(targetCol.COLUMN_TYPE).includes("24, 6")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`fundraising_campaigns\` MODIFY COLUMN \`target_capital\` DECIMAL(24, 6) NOT NULL`
    );
    console.log("[ok] fundraising_campaigns.target_capital DECIMAL(24,6)");
  } else {
    console.log("[skip] fundraising_campaigns.target_capital");
  }

  // Widen status if needed
  const statusCol = await getColumnMeta("fundraising_campaigns", "status");
  if (statusCol && String(statusCol.COLUMN_TYPE).includes("varchar(16)")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`fundraising_campaigns\` MODIFY COLUMN \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT'`
    );
    console.log("[ok] fundraising_campaigns.status VARCHAR(32)");
  } else {
    console.log("[skip] fundraising_campaigns.status");
  }

  await addColumnIfMissing(
    "fundraising_campaigns",
    "product_id",
    "VARCHAR(64) NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "campaign_type",
    "VARCHAR(64) NOT NULL DEFAULT 'PE_FUNDRAISE'"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "description",
    "TEXT NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "minimum_target_amount",
    "DECIMAL(24, 6) NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "hard_cap_amount",
    "DECIMAL(24, 6) NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "first_close_target_date",
    "DATE NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "final_close_target_date",
    "DATE NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "investor_segments",
    "JSON NULL"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "approval_status",
    "VARCHAR(32) NOT NULL DEFAULT 'PENDING'"
  );
  await addColumnIfMissing(
    "fundraising_campaigns",
    "campaign_owner_id",
    "VARCHAR(191) NULL"
  );

  await addIndexIfMissing(
    "fundraising_campaigns",
    "fundraising_campaigns_type_idx",
    "CREATE INDEX `fundraising_campaigns_type_idx` ON `fundraising_campaigns` (`campaign_type`)"
  );

  // Backfill existing campaigns
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE \`fundraising_campaigns\`
     SET \`campaign_type\` = COALESCE(NULLIF(\`campaign_type\`, ''), 'PE_FUNDRAISE'),
         \`approval_status\` = CASE
           WHEN UPPER(\`status\`) = 'ACTIVE' THEN 'APPROVED'
           ELSE COALESCE(NULLIF(\`approval_status\`, ''), 'PENDING')
         END
     WHERE \`campaign_type\` IS NULL
        OR \`campaign_type\` = ''
        OR \`approval_status\` IS NULL
        OR \`approval_status\` = ''
        OR (UPPER(\`status\`) = 'ACTIVE' AND UPPER(\`approval_status\`) <> 'APPROVED')`
  );
  console.log(`[ok] backfill fundraising_campaigns (rows touched ~${updated})`);
}

async function widenStageCode() {
  if (!(await tableExists("fundraising_pipeline_stages"))) {
    console.log("[skip] fundraising_pipeline_stages");
    return;
  }
  const col = await getColumnMeta("fundraising_pipeline_stages", "stage_code");
  if (col && (String(col.COLUMN_TYPE).includes("varchar(32)") || String(col.COLUMN_TYPE).includes("varchar(40)"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`fundraising_pipeline_stages\` MODIFY COLUMN \`stage_code\` VARCHAR(64) NOT NULL`
    );
    console.log("[ok] fundraising_pipeline_stages.stage_code VARCHAR(64)");
  } else {
    console.log("[skip] fundraising_pipeline_stages.stage_code");
  }
}

async function createIrTables() {
  if (!(await tableExists("investor_organisations"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investor_organisations\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`legal_name\` VARCHAR(255) NOT NULL,
        \`trading_name\` VARCHAR(255) NULL,
        \`investor_type\` VARCHAR(100) NOT NULL,
        \`registration_number\` VARCHAR(100) NULL,
        \`country_code\` VARCHAR(8) NULL,
        \`jurisdiction\` VARCHAR(100) NULL,
        \`base_currency\` VARCHAR(8) NULL DEFAULT 'USD',
        \`estimated_aum\` DECIMAL(24, 6) NULL,
        \`typical_minimum_ticket\` DECIMAL(24, 6) NULL,
        \`typical_maximum_ticket\` DECIMAL(24, 6) NULL,
        \`asset_class_preferences\` JSON NULL,
        \`geographic_interests\` JSON NULL,
        \`relationship_owner_id\` VARCHAR(191) NULL,
        \`source\` VARCHAR(128) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`kyc_status\` VARCHAR(64) NOT NULL DEFAULT 'NOT_STARTED',
        \`sanctions_status\` VARCHAR(64) NOT NULL DEFAULT 'NOT_SCREENED',
        \`risk_rating\` VARCHAR(32) NULL,
        \`investor_classification\` VARCHAR(64) NULL,
        \`last_interaction_at\` DATETIME(3) NULL,
        \`next_action\` VARCHAR(512) NULL,
        \`next_action_date\` DATE NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`investor_organisations_legal_name_idx\` (\`legal_name\`),
        INDEX \`investor_organisations_type_idx\` (\`investor_type\`),
        INDEX \`investor_organisations_status_idx\` (\`status\`),
        INDEX \`investor_organisations_owner_idx\` (\`relationship_owner_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investor_organisations");
  } else {
    console.log("[skip] investor_organisations");
  }

  if (!(await tableExists("investor_contacts"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investor_contacts\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`full_name\` VARCHAR(255) NOT NULL,
        \`role_title\` VARCHAR(128) NULL,
        \`department\` VARCHAR(128) NULL,
        \`email\` VARCHAR(255) NULL,
        \`phone\` VARCHAR(64) NULL,
        \`decision_influence\` VARCHAR(64) NULL,
        \`communication_consent\` BOOLEAN NOT NULL DEFAULT true,
        \`is_primary\` BOOLEAN NOT NULL DEFAULT false,
        \`last_interaction_at\` DATETIME(3) NULL,
        \`next_action\` VARCHAR(512) NULL,
        \`next_action_date\` DATE NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`investor_contacts_investor_idx\` (\`investor_id\`),
        INDEX \`investor_contacts_email_idx\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investor_contacts");
  } else {
    console.log("[skip] investor_contacts");
  }

  if (!(await tableExists("fundraising_opportunities"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_opportunities\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`investor_id\` VARCHAR(191) NOT NULL,
        \`primary_contact_id\` VARCHAR(191) NULL,
        \`current_stage_id\` VARCHAR(191) NOT NULL,
        \`opportunity_type\` VARCHAR(64) NOT NULL,
        \`opportunity_currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`indicative_amount\` DECIMAL(24, 6) NULL,
        \`qualified_amount\` DECIMAL(24, 6) NULL,
        \`soft_circle_amount\` DECIMAL(24, 6) NULL,
        \`proposed_amount\` DECIMAL(24, 6) NULL,
        \`signed_amount\` DECIMAL(24, 6) NULL,
        \`admitted_amount\` DECIMAL(24, 6) NULL,
        \`funded_amount\` DECIMAL(24, 6) NULL DEFAULT 0,
        \`expected_aum\` DECIMAL(24, 6) NULL,
        \`activated_aum\` DECIMAL(24, 6) NULL DEFAULT 0,
        \`stage_probability\` DECIMAL(5, 2) NULL,
        \`confidence_adjustment\` DECIMAL(5, 4) NOT NULL DEFAULT 1,
        \`expected_close_date\` DATE NULL,
        \`opportunity_owner_id\` VARCHAR(191) NOT NULL,
        \`priority\` VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`lost_reason\` VARCHAR(255) NULL,
        \`source\` VARCHAR(128) NULL,
        \`consultant_name\` VARCHAR(255) NULL,
        \`placement_agent_name\` VARCHAR(255) NULL,
        \`legacy_deal_id\` VARCHAR(191) NULL,
        \`client_id\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_opportunities_legacy_deal_id_key\` (\`legacy_deal_id\`),
        INDEX \`fundraising_opportunities_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_opportunities_investor_idx\` (\`investor_id\`),
        INDEX \`fundraising_opportunities_stage_idx\` (\`current_stage_id\`),
        INDEX \`fundraising_opportunities_status_idx\` (\`status\`),
        INDEX \`fundraising_opportunities_owner_idx\` (\`opportunity_owner_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_opportunities");
  } else {
    console.log("[skip] fundraising_opportunities");
  }

  if (!(await tableExists("opportunity_amount_history"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`opportunity_amount_history\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NOT NULL,
        \`amount_type\` VARCHAR(64) NOT NULL,
        \`old_value\` DECIMAL(24, 6) NULL,
        \`new_value\` DECIMAL(24, 6) NULL,
        \`currency\` VARCHAR(8) NULL,
        \`reason\` VARCHAR(512) NULL,
        \`changed_by_id\` VARCHAR(191) NOT NULL,
        \`changed_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`opportunity_amount_history_opp_idx\` (\`opportunity_id\`, \`changed_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] opportunity_amount_history");
  } else {
    console.log("[skip] opportunity_amount_history");
  }

  if (!(await tableExists("opportunity_stage_history"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`opportunity_stage_history\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`opportunity_id\` VARCHAR(191) NOT NULL,
        \`from_stage_id\` VARCHAR(191) NULL,
        \`to_stage_id\` VARCHAR(191) NOT NULL,
        \`from_stage_code\` VARCHAR(64) NULL,
        \`to_stage_code\` VARCHAR(64) NOT NULL,
        \`reason\` VARCHAR(512) NULL,
        \`changed_by_id\` VARCHAR(191) NOT NULL,
        \`changed_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gate_result\` JSON NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`opportunity_stage_history_opp_idx\` (\`opportunity_id\`, \`changed_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] opportunity_stage_history");
  } else {
    console.log("[skip] opportunity_stage_history");
  }
}

async function main() {
  await alterFundraisingCampaigns();
  await widenStageCode();
  await createIrTables();
  console.log("Fundraising IR foundation migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
