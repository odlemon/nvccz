/**
 * SRD §10-§12: Procurement Planning, Purchase Requisitions and Requisition Approval.
 *
 * procurement_plan_items : requirement, business_unit, planned_start_date, required_delivery_date, budget_code, cost_centre,
 *                          responsible_officer_id, currency_code.        procurement_plans: business_unit.
 * purchase_requisitions  : required_date, procurement_method, risk_level, exception_type, resubmission_count.
 * purchase_orders / procurement_rfqs : plan_item_id (traceability back to the approved plan line).
 * purchase_requisition_attachments   : requisition attachments.
 * document_sequences     : atomic, gap-free counters (requisition numbering).
 * procurement_settings   : PR number format default PR-{YYYY}-{######}, suggested_vendor_policy, budget_check_mode, plan_link_policy.
 * procurement_budgets    : budget master (financial year, budget code, cost centre) the requisition budget check draws on.
 * procurement_decision_log: every approval decision with user, action, date/time, comments, previous and resulting status.
 *
 * Idempotent. Run: npm run db:migrate:planning-requisitions   then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function one(sql: string, ...args: any[]) {
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...args);
  return rows[0];
}
const columnExists = async (t: string, c: string) =>
  Number((await one(`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, t, c))?.c ?? 0) > 0;
const tableExists = async (t: string) =>
  Number((await one(`SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, t))?.c ?? 0) > 0;
const indexExists = async (t: string, i: string) =>
  Number((await one(`SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, t, i))?.c ?? 0) > 0;

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) return console.log(`[skip] ${table}.${column}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  console.log(`[ok] added ${table}.${column}`);
}
async function addIndex(table: string, name: string, ddl: string) {
  if (await indexExists(table, name)) return console.log(`[skip] index ${name}`);
  await prisma.$executeRawUnsafe(`CREATE ${ddl}`);
  console.log(`[ok] added index ${name}`);
}
async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) return console.log(`[skip] table ${name}`);
  await prisma.$executeRawUnsafe(`${ddl} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`[ok] created ${name}`);
}

async function main() {
  // ---------------------------------------------------------------- plan
  for (const [c, d] of [
    ["requirement", "VARCHAR(255) NULL"],
    ["business_unit", "VARCHAR(128) NULL"],
    ["planned_start_date", "DATE NULL"],
    ["required_delivery_date", "DATE NULL"],
    ["budget_code", "VARCHAR(64) NULL"],
    ["cost_centre", "VARCHAR(128) NULL"],
    ["responsible_officer_id", "VARCHAR(191) NULL"],
    ["currency_code", "VARCHAR(8) NULL"],
  ] as Array<[string, string]>) await addColumn("procurement_plan_items", c, d);
  await addColumn("procurement_plans", "business_unit", "VARCHAR(128) NULL");
  await prisma.$executeRawUnsafe("UPDATE procurement_plan_items SET requirement = LEFT(description, 255) WHERE requirement IS NULL");
  await addIndex("procurement_plan_items", "procurement_plan_items_officer_idx", "INDEX `procurement_plan_items_officer_idx` ON `procurement_plan_items` (`responsible_officer_id`)");

  // ---------------------------------------------------------------- requisition
  await addColumn("purchase_requisitions", "required_date", "DATE NULL");
  await addColumn("purchase_requisitions", "procurement_method", "VARCHAR(32) NULL");
  await addColumn("purchase_requisitions", "risk_level", "VARCHAR(16) NULL");
  await addColumn("purchase_requisitions", "exception_type", "VARCHAR(32) NULL");
  await addColumn("purchase_requisitions", "resubmission_count", "INT NOT NULL DEFAULT 0");
  await addColumn("purchase_requisitions", "suggested_vendor_id", "VARCHAR(191) NULL");
  // A plan_item_id that points nowhere is meaningless: clear it, then index it for the reverse lookup (consumption).
  await prisma.$executeRawUnsafe("UPDATE purchase_requisitions r LEFT JOIN procurement_plan_items p ON p.id = r.plan_item_id SET r.plan_item_id = NULL WHERE r.plan_item_id IS NOT NULL AND p.id IS NULL");
  await addIndex("purchase_requisitions", "purchase_requisitions_plan_item_idx", "INDEX `purchase_requisitions_plan_item_idx` ON `purchase_requisitions` (`plan_item_id`)");
  await addIndex("purchase_requisitions", "purchase_requisitions_budget_idx", "INDEX `purchase_requisitions_budget_idx` ON `purchase_requisitions` (`budget_code`, `cost_centre`)");
  await addColumn("purchase_orders", "plan_item_id", "VARCHAR(191) NULL");
  await addColumn("procurement_rfqs", "plan_item_id", "VARCHAR(191) NULL");
  // Orders and RFQs raised from a requisition trace back to its plan line.
  await prisma.$executeRawUnsafe("UPDATE purchase_orders o JOIN purchase_requisitions r ON r.id = o.requisitionId SET o.plan_item_id = r.plan_item_id WHERE o.plan_item_id IS NULL AND r.plan_item_id IS NOT NULL").catch(() => undefined);
  await prisma.$executeRawUnsafe("UPDATE procurement_rfqs f JOIN purchase_requisitions r ON r.id = f.requisition_id SET f.plan_item_id = r.plan_item_id WHERE f.plan_item_id IS NULL AND r.plan_item_id IS NOT NULL").catch(() => undefined);

  await createTable(
    "purchase_requisition_attachments",
    `CREATE TABLE purchase_requisition_attachments (
      id VARCHAR(191) NOT NULL, requisition_id VARCHAR(191) NOT NULL, file_name VARCHAR(255) NOT NULL, file_url TEXT NOT NULL,
      mime_type VARCHAR(128) NULL, file_size_bytes INT NULL, uploaded_by_id VARCHAR(191) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), INDEX pr_attachments_req_idx (requisition_id))`
  );

  // ---------------------------------------------------------------- numbering
  await createTable(
    "document_sequences",
    `CREATE TABLE document_sequences (
      seq_key VARCHAR(191) NOT NULL, counter BIGINT NOT NULL DEFAULT 0, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (seq_key))`
  );

  // ---------------------------------------------------------------- settings
  await addColumn("procurement_settings", "suggested_vendor_policy", "VARCHAR(32) NOT NULL DEFAULT 'ALLOWED_APPROVED_ONLY'");
  await addColumn("procurement_settings", "budget_check_mode", "VARCHAR(16) NOT NULL DEFAULT 'ENFORCE'");
  await addColumn("procurement_settings", "plan_link_policy", "VARCHAR(16) NOT NULL DEFAULT 'OPTIONAL'");
  const def = await one(`SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procurement_settings' AND COLUMN_NAME = 'pr_number_format'`);
  if (!String(def?.d ?? "").includes("PR-{YYYY}")) {
    await prisma.$executeRawUnsafe("ALTER TABLE `procurement_settings` ALTER COLUMN `pr_number_format` SET DEFAULT 'PR-{YYYY}-{######}'");
    console.log("[ok] procurement_settings.pr_number_format default -> PR-{YYYY}-{######}");
  }
  // A saved format from before this migration is the old daily 4-digit one: move it to the yearly 6-digit form.
  await prisma.$executeRawUnsafe("UPDATE procurement_settings SET pr_number_format = 'PR-{YYYY}-{######}' WHERE pr_number_format IS NULL OR pr_number_format = 'PR_{YYYY}{MM}{DD}_{####}'");
  if (!(await one("SELECT id FROM procurement_settings WHERE id = 'default'"))) {
    await prisma.$executeRawUnsafe("INSERT INTO procurement_settings (id, updated_at) VALUES ('default', NOW(3))").catch(() => undefined);
  }

  // ---------------------------------------------------------------- budget master
  await createTable(
    "procurement_budgets",
    `CREATE TABLE procurement_budgets (
      id VARCHAR(191) NOT NULL, financial_year VARCHAR(16) NOT NULL, budget_code VARCHAR(64) NOT NULL, cost_centre VARCHAR(128) NOT NULL DEFAULT '',
      department VARCHAR(191) NULL, description VARCHAR(255) NULL, amount DECIMAL(15,2) NOT NULL DEFAULT 0.00, currency_code VARCHAR(8) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', created_by_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id), UNIQUE KEY procurement_budgets_key (financial_year, budget_code, cost_centre))`
  );

  // ---------------------------------------------------------------- decision log
  await createTable(
    "procurement_decision_log",
    `CREATE TABLE procurement_decision_log (
      id VARCHAR(191) NOT NULL, entity_type VARCHAR(32) NOT NULL, entity_id VARCHAR(191) NOT NULL, approval_request_id VARCHAR(191) NULL,
      approval_id VARCHAR(191) NULL, step_number INT NULL, step_name VARCHAR(191) NULL, actor_id VARCHAR(191) NULL,
      on_behalf_of_id VARCHAR(191) NULL, action VARCHAR(24) NOT NULL, comments TEXT NULL,
      previous_status VARCHAR(48) NULL, resulting_status VARCHAR(48) NULL, detail JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
      INDEX procurement_decision_log_entity_idx (entity_type, entity_id, created_at))`
  );

  for (const [t, c] of [
    ["procurement_plan_items", "budget_code"],
    ["purchase_requisitions", "procurement_method"],
    ["purchase_requisitions", "exception_type"],
    ["purchase_requisitions", "suggested_vendor_id"],
    ["purchase_orders", "plan_item_id"],
    ["procurement_settings", "suggested_vendor_policy"],
  ]) if (!(await columnExists(t, c))) throw new Error(`missing ${t}.${c}`);
  for (const t of ["document_sequences", "procurement_budgets", "procurement_decision_log", "purchase_requisition_attachments"]) {
    if (!(await tableExists(t))) throw new Error(`missing ${t}`);
  }
  console.log("[verify OK]\nPlanning/requisitions migration finished.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
