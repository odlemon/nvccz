/**
 * SRD §21-§25 and §29-§31: purchase orders, receipts, invoices, matching, finance handoff and the optional AI layer.
 *
 * purchase_orders          : vendor_code, rfq_id, award_recommendation_id (links carried from the award), cost_centre, budget_code,
 *                            gl_code, purchase_conditions, approval_status + request (the PO's own approval).
 * procurement_budgets      : gl_code (the PO takes its GL code from its budget line).
 * goods_received_notes     : delivery_note_number, location_name, receipt_type (GOODS | SERVICE | MIXED).
 * goods_received_note_items: service_period_start / _end, service_amount, service_evidence (service receipts).
 * procurement_invoices     : supplier_invoice_number + key (unique per vendor), grn_id, rfq_id, payment_terms, tax_source,
 *                            match_result / matched_at / override, and the finance handoff actors and times.
 * procurement_invoice_handoff_events : the append-only record of every handoff transition (who, when, from, to, why).
 * procurement_settings     : value / tax / absolute match tolerances, match_enforcement, and the AI controls (switch, monthly limits,
 *                            approved roles, permitted document types).
 * procurement_ai_usage     : document type, status, model, entity, duration, error (every AI call is recorded).
 * procurement_ai_extractions: an AI reading of a document, held for human review: value, source, decision, confirmed value.
 *
 * Idempotent. Run: npm run db:migrate:p2p-controls   then: npx prisma generate
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
async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) return console.log(`[skip] table ${name}`);
  await prisma.$executeRawUnsafe(`${ddl} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`[ok] created ${name}`);
}
async function addIndex(table: string, name: string, ddl: string) {
  if (await indexExists(table, name)) return console.log(`[skip] index ${table}.${name}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD ${ddl}`);
  console.log(`[ok] index ${table}.${name}`);
}

async function main() {
  // ---- purchase orders
  await addColumn("purchase_orders", "vendor_code", "VARCHAR(64) NULL");
  await addColumn("purchase_orders", "rfq_id", "VARCHAR(191) NULL");
  await addColumn("purchase_orders", "award_recommendation_id", "VARCHAR(191) NULL");
  await addColumn("purchase_orders", "cost_centre", "VARCHAR(128) NULL");
  await addColumn("purchase_orders", "budget_code", "VARCHAR(64) NULL");
  await addColumn("purchase_orders", "gl_code", "VARCHAR(64) NULL");
  await addColumn("purchase_orders", "purchase_conditions", "TEXT NULL");
  await addColumn("purchase_orders", "approval_status", "VARCHAR(24) NOT NULL DEFAULT 'NOT_REQUIRED'");
  await addColumn("purchase_orders", "approval_request_id", "VARCHAR(191) NULL");
  await addColumn("procurement_budgets", "gl_code", "VARCHAR(64) NULL");

  // Existing orders: take the vendor code, RFQ and award links from what they already point at.
  await prisma.$executeRawUnsafe(
    `UPDATE purchase_orders po JOIN vendors v ON v.id = po.vendorId SET po.vendor_code = COALESCE(v.vendor_code, v.bp_number) WHERE po.vendor_code IS NULL`
  ).catch((e) => console.log(`[warn] vendor code backfill skipped: ${e?.message?.slice(0, 120)}`));
  await prisma.$executeRawUnsafe(
    `UPDATE purchase_orders po JOIN vendor_quotations q ON q.id = po.quotationId SET po.rfq_id = q.procurement_rfq_id WHERE po.rfq_id IS NULL AND q.procurement_rfq_id IS NOT NULL`
  ).catch((e) => console.log(`[warn] rfq backfill skipped: ${e?.message?.slice(0, 120)}`));
  await prisma.$executeRawUnsafe(
    `UPDATE purchase_orders po JOIN purchase_requisitions r ON r.id = po.requisitionId SET po.cost_centre = r.cost_centre, po.budget_code = r.budget_code WHERE po.cost_centre IS NULL AND po.budget_code IS NULL`
  ).catch((e) => console.log(`[warn] cost centre backfill skipped: ${e?.message?.slice(0, 120)}`));

  // ---- receipts
  await addColumn("goods_received_notes", "delivery_note_number", "VARCHAR(128) NULL");
  await addColumn("goods_received_notes", "location_name", "VARCHAR(191) NULL");
  await addColumn("goods_received_notes", "receipt_type", "VARCHAR(16) NOT NULL DEFAULT 'GOODS'");
  await addColumn("goods_received_note_items", "service_period_start", "DATE NULL");
  await addColumn("goods_received_note_items", "service_period_end", "DATE NULL");
  await addColumn("goods_received_note_items", "service_amount", "DECIMAL(15,2) NULL");
  await addColumn("goods_received_note_items", "service_evidence", "JSON NULL");
  await prisma.$executeRawUnsafe(
    `UPDATE goods_received_notes g SET receipt_type = 'SERVICE' WHERE receipt_type = 'GOODS' AND EXISTS (SELECT 1 FROM goods_received_note_items i WHERE i.grnId = g.id AND i.line_type = 'SERVICE') AND NOT EXISTS (SELECT 1 FROM goods_received_note_items i WHERE i.grnId = g.id AND i.line_type <> 'SERVICE')`
  ).catch(() => undefined);

  // ---- invoices
  await addColumn("procurement_invoices", "supplier_invoice_number", "VARCHAR(128) NULL");
  await addColumn("procurement_invoices", "supplier_invoice_key", "VARCHAR(128) NULL");
  await addColumn("procurement_invoices", "grn_id", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "rfq_id", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "payment_terms", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "tax_source", "VARCHAR(16) NOT NULL DEFAULT 'COMPUTED'");
  await addColumn("procurement_invoices", "match_result", "JSON NULL");
  await addColumn("procurement_invoices", "matched_at", "DATETIME(3) NULL");
  await addColumn("procurement_invoices", "match_override_reason", "TEXT NULL");
  await addColumn("procurement_invoices", "match_override_by_id", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "match_override_at", "DATETIME(3) NULL");
  await addColumn("procurement_invoices", "finance_submitted_at", "DATETIME(3) NULL");
  await addColumn("procurement_invoices", "finance_submitted_by_id", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "finance_accepted_at", "DATETIME(3) NULL");
  await addColumn("procurement_invoices", "finance_accepted_by_id", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "finance_returned_at", "DATETIME(3) NULL");
  await addColumn("procurement_invoices", "finance_returned_by_id", "VARCHAR(191) NULL");
  await addColumn("procurement_invoices", "finance_return_reason", "TEXT NULL");
  await addColumn("procurement_invoices", "finance_closed_at", "DATETIME(3) NULL");
  await addColumn("procurement_invoices", "finance_closed_by_id", "VARCHAR(191) NULL");
  // The supplier's own invoice number is what makes a duplicate a duplicate: one per vendor, however it is punctuated or cased.
  await addIndex("procurement_invoices", "procurement_invoices_vendor_supplier_key", "UNIQUE INDEX `procurement_invoices_vendor_supplier_key` (`vendorId`, `supplier_invoice_key`)");
  await addIndex("procurement_invoices", "procurement_invoices_grn_idx", "INDEX `procurement_invoices_grn_idx` (`grn_id`)");
  // A handoff status only means something once an invoice is approved: before that there is nothing to hand off.
  const cleared = await prisma.$executeRawUnsafe(
    `UPDATE procurement_invoices SET finance_handoff_status = NULL WHERE finance_handoff_status = 'READY_FOR_FINANCE' AND status <> 'APPROVED' AND payment_status = 'PENDING'`
  ).catch(async () =>
    prisma.$executeRawUnsafe(`UPDATE procurement_invoices SET finance_handoff_status = NULL WHERE finance_handoff_status = 'READY_FOR_FINANCE' AND status <> 'APPROVED' AND paymentStatus = 'PENDING'`)
  );
  console.log(`[ok] handoff status cleared on ${cleared} unapproved invoices`);
  await prisma.$executeRawUnsafe(
    `UPDATE procurement_invoices SET finance_handoff_status = 'PAID' WHERE paymentStatus = 'PAID' AND (finance_handoff_status IS NULL OR finance_handoff_status = 'READY_FOR_FINANCE')`
  ).catch(() => undefined);

  await createTable(
    "procurement_invoice_handoff_events",
    `CREATE TABLE \`procurement_invoice_handoff_events\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`invoice_id\` VARCHAR(191) NOT NULL,
      \`from_status\` VARCHAR(32) NULL,
      \`to_status\` VARCHAR(32) NOT NULL,
      \`actor_id\` VARCHAR(191) NULL,
      \`comment\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`pihe_invoice_idx\` (\`invoice_id\`, \`created_at\`)
    ) ENGINE=InnoDB`
  );

  // ---- settings: matching tolerances and the AI controls
  await addColumn("procurement_settings", "match_value_tolerance_pct", "DECIMAL(5,2) NOT NULL DEFAULT 2.00");
  await addColumn("procurement_settings", "match_tax_tolerance_pct", "DECIMAL(5,2) NOT NULL DEFAULT 1.00");
  await addColumn("procurement_settings", "match_amount_tolerance_abs", "DECIMAL(15,2) NOT NULL DEFAULT 0.50");
  await addColumn("procurement_settings", "match_enforcement", "VARCHAR(8) NOT NULL DEFAULT 'ENFORCE'");
  await addColumn("procurement_settings", "ai_enabled", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumn("procurement_settings", "ai_monthly_document_limit", "INT NULL");
  await addColumn("procurement_settings", "ai_monthly_call_limit", "INT NULL");
  await addColumn("procurement_settings", "ai_allowed_role_codes", "JSON NULL");
  await addColumn("procurement_settings", "ai_allowed_document_types", "JSON NULL");
  await addColumn("procurement_settings", "po_approval_required", "TINYINT(1) NOT NULL DEFAULT 0");

  // ---- AI usage and reviews
  await addColumn("procurement_ai_usage", "document_type", "VARCHAR(48) NULL");
  await addColumn("procurement_ai_usage", "status", "VARCHAR(16) NOT NULL DEFAULT 'SUCCESS'");
  await addColumn("procurement_ai_usage", "model", "VARCHAR(96) NULL");
  await addColumn("procurement_ai_usage", "entity_type", "VARCHAR(48) NULL");
  await addColumn("procurement_ai_usage", "entity_id", "VARCHAR(191) NULL");
  await addColumn("procurement_ai_usage", "document_name", "VARCHAR(255) NULL");
  await addColumn("procurement_ai_usage", "duration_ms", "INT NULL");
  await addColumn("procurement_ai_usage", "error_message", "VARCHAR(500) NULL");
  await addIndex("procurement_ai_usage", "procurement_ai_usage_user_idx", "INDEX `procurement_ai_usage_user_idx` (`user_id`)");

  await createTable(
    "procurement_ai_extractions",
    `CREATE TABLE \`procurement_ai_extractions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`document_type\` VARCHAR(48) NOT NULL,
      \`source_type\` VARCHAR(32) NOT NULL,
      \`source_ref\` VARCHAR(191) NULL,
      \`file_name\` VARCHAR(255) NULL,
      \`file_path\` VARCHAR(500) NULL,
      \`requested_by_id\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(24) NOT NULL DEFAULT 'PENDING_REVIEW',
      \`fields\` JSON NULL,
      \`missing\` JSON NULL,
      \`inconsistencies\` JSON NULL,
      \`summary\` TEXT NULL,
      \`model\` VARCHAR(96) NULL,
      \`applied_to\` JSON NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`pae_requester_idx\` (\`requested_by_id\`, \`created_at\`),
      INDEX \`pae_source_idx\` (\`source_type\`, \`source_ref\`)
    ) ENGINE=InnoDB`
  );
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
