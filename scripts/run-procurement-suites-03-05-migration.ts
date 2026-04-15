// @ts-nocheck
/**
 * Idempotent DDL for Suites 03–05: RFQ entities, PO extensions, GRN extensions, procurement settings, RTV.
 * Run: npx ts-node scripts/run-procurement-suites-03-05-migration.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?`,
    name
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok]   ${table}.${column}`);
}

async function main() {
  console.log("=== Procurement Suites 03–05 migration ===\n");

  if (!(await tableExists("procurement_rfqs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`procurement_rfqs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`rfq_number\` VARCHAR(191) NOT NULL,
        \`requisition_id\` VARCHAR(191) NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
        \`visibility\` VARCHAR(191) NOT NULL DEFAULT 'INVITED_ONLY',
        \`closing_at\` DATETIME(3) NULL,
        \`reporting_currency_id\` VARCHAR(191) NULL,
        \`price_weight\` DECIMAL(5,4) NULL,
        \`technical_weight\` DECIMAL(5,4) NULL,
        \`scoring_config\` JSON NULL,
        \`awarded_quotation_id\` VARCHAR(191) NULL,
        \`award_rationale\` TEXT NULL,
        \`delivery_address\` TEXT NULL,
        \`expected_delivery_date\` DATETIME(3) NULL,
        \`special_requirements\` TEXT NULL,
        \`items_snapshot\` JSON NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        UNIQUE INDEX \`procurement_rfqs_rfq_number_key\`(\`rfq_number\`),
        UNIQUE INDEX \`procurement_rfqs_awarded_quotation_id_key\`(\`awarded_quotation_id\`),
        INDEX \`procurement_rfqs_requisition_id_idx\`(\`requisition_id\`),
        INDEX \`procurement_rfqs_status_idx\`(\`status\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   created table procurement_rfqs");
  } else {
    console.log("[skip] table procurement_rfqs");
  }

  if (!(await tableExists("rfq_vendor_invitations"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`rfq_vendor_invitations\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`procurement_rfq_id\` VARCHAR(191) NOT NULL,
        \`vendor_id\` VARCHAR(191) NOT NULL,
        \`invitation_token\` VARCHAR(64) NOT NULL,
        \`email_sent_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`rfq_vendor_invitations_invitation_token_key\`(\`invitation_token\`),
        UNIQUE INDEX \`rfq_vendor_invitations_procurement_rfq_id_vendor_id_key\`(\`procurement_rfq_id\`, \`vendor_id\`),
        INDEX \`rfq_vendor_invitations_vendor_id_idx\`(\`vendor_id\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   created table rfq_vendor_invitations");
  } else {
    console.log("[skip] table rfq_vendor_invitations");
  }

  if (!(await tableExists("rfq_clarifications"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`rfq_clarifications\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`procurement_rfq_id\` VARCHAR(191) NOT NULL,
        \`author_type\` VARCHAR(32) NOT NULL,
        \`vendor_id\` VARCHAR(191) NULL,
        \`user_id\` VARCHAR(191) NULL,
        \`body\` TEXT NOT NULL,
        \`attachment_url\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`rfq_clarifications_procurement_rfq_id_idx\`(\`procurement_rfq_id\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   created table rfq_clarifications");
  } else {
    console.log("[skip] table rfq_clarifications");
  }

  if (!(await tableExists("procurement_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`procurement_settings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`over_delivery_tolerance_pct\` DECIMAL(5,2) NOT NULL DEFAULT 5.00,
        \`po_validity_grace_days\` INT NOT NULL DEFAULT 30,
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO \`procurement_settings\` (\`id\`, \`over_delivery_tolerance_pct\`, \`po_validity_grace_days\`, \`updated_at\`)
      VALUES ('default', 5.00, 30, NOW())
    `);
    console.log("[ok]   created + seeded procurement_settings");
  } else {
    console.log("[skip] table procurement_settings");
  }

  if (!(await tableExists("grn_return_to_vendors"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`grn_return_to_vendors\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`goods_received_note_id\` VARCHAR(191) NOT NULL,
        \`purchase_order_item_id\` VARCHAR(191) NOT NULL,
        \`quantity\` DECIMAL(10,2) NOT NULL,
        \`reason\` TEXT NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`grn_return_to_vendors_goods_received_note_id_idx\`(\`goods_received_note_id\`),
        INDEX \`grn_return_to_vendors_purchase_order_item_id_idx\`(\`purchase_order_item_id\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   created table grn_return_to_vendors");
  } else {
    console.log("[skip] table grn_return_to_vendors");
  }

  // vendor_quotations
  await addColumn(
    "vendor_quotations",
    "procurement_rfq_id",
    "`procurement_rfq_id` VARCHAR(191) NULL"
  );
  await addColumn(
    "vendor_quotations",
    "technical_score_json",
    "`technical_score_json` JSON NULL"
  );
  if (!(await indexExists("vendor_quotations_procurement_rfq_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`vendor_quotations_procurement_rfq_id_idx\` ON \`vendor_quotations\`(\`procurement_rfq_id\`)`
    );
    console.log("[ok]   index vendor_quotations.procurement_rfq_id");
  }

  // purchase_orders
  await addColumn("purchase_orders", "portfolio_company_id", "`portfolio_company_id` VARCHAR(191) NULL");
  await addColumn("purchase_orders", "fund_id", "`fund_id` VARCHAR(191) NULL");
  await addColumn(
    "purchase_orders",
    "drawdown_tranche_id",
    "`drawdown_tranche_id` VARCHAR(191) NULL"
  );
  await addColumn("purchase_orders", "version", "`version` INT NOT NULL DEFAULT 1");
  await addColumn("purchase_orders", "amendment_of_po_id", "`amendment_of_po_id` VARCHAR(191) NULL");
  await addColumn("purchase_orders", "validity_end_date", "`validity_end_date` DATETIME(3) NULL");
  await addColumn("purchase_orders", "dispatched_at", "`dispatched_at` DATETIME(3) NULL");
  await addColumn(
    "purchase_orders",
    "vendor_ack_token",
    "`vendor_ack_token` VARCHAR(64) NULL"
  );
  await addColumn(
    "purchase_orders",
    "vendor_acknowledged_at",
    "`vendor_acknowledged_at` DATETIME(3) NULL"
  );
  await addColumn(
    "purchase_orders",
    "po_pdf_verification_token",
    "`po_pdf_verification_token` VARCHAR(64) NULL"
  );
  if (!(await indexExists("purchase_orders_portfolio_company_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`purchase_orders_portfolio_company_id_idx\` ON \`purchase_orders\`(\`portfolio_company_id\`)`
    );
    console.log("[ok]   index purchase_orders.portfolio_company_id");
  }
  if (!(await indexExists("purchase_orders_fund_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`purchase_orders_fund_id_idx\` ON \`purchase_orders\`(\`fund_id\`)`
    );
    console.log("[ok]   index purchase_orders.fund_id");
  }

  // purchase_order_items
  await addColumn(
    "purchase_order_items",
    "expected_delivery_date",
    "`expected_delivery_date` DATETIME(3) NULL"
  );
  await addColumn(
    "purchase_order_items",
    "line_status",
    "`line_status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'"
  );

  // goods_received_notes
  await addColumn("goods_received_notes", "attachment_urls", "`attachment_urls` JSON NULL");
  await addColumn("goods_received_notes", "latitude", "`latitude` DECIMAL(10,7) NULL");
  await addColumn("goods_received_notes", "longitude", "`longitude` DECIMAL(10,7) NULL");
  await addColumn(
    "goods_received_notes",
    "geo_captured_at",
    "`geo_captured_at` DATETIME(3) NULL"
  );
  await addColumn(
    "goods_received_notes",
    "submitted_by_investee",
    "`submitted_by_investee` TINYINT(1) NOT NULL DEFAULT 0"
  );

  // goods_received_note_items
  await addColumn(
    "goods_received_note_items",
    "line_type",
    "`line_type` VARCHAR(32) NOT NULL DEFAULT 'GOODS'"
  );
  await addColumn(
    "goods_received_note_items",
    "milestone_description",
    "`milestone_description` TEXT NULL"
  );
  await addColumn(
    "goods_received_note_items",
    "serial_numbers",
    "`serial_numbers` JSON NULL"
  );

  console.log("\n=== done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
