/**
 * SRD §8 Vendor Management + §9 Supplier Submission.
 *
 * vendors            : vendor_code, registration_number, vat_number, commodity_categories, onboarding_date,
 *                      approval_status, compliance_status, notes, approved_by/at, status_reason/changed_at/changed_by.
 *                      `lifecycle_status` (already present, never read before) becomes THE Vendor Status:
 *                      DRAFT | PENDING_REVIEW | PENDING_APPROVAL | APPROVED | SUSPENDED | BLOCKED | EXPIRED | INACTIVE.
 * vendor_kyc_documents: expiry_date, issue_date, document_number, notify_days_before, last_expiry_notice_at.
 * vendor_document_upload_settings: expiry_notice_days (default lead time for pre-expiry notices).
 * vendor_quotations  : acknowledged_at, superseded_at (one live submission per vendor per RFQ; revisions supersede).
 * rfq_reopen_events  : audit of every formal reopen of a sourcing event.
 *
 * Idempotent. Run: npm run db:migrate:vendor-master   then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function one(sql: string, ...args: any[]) {
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...args);
  return rows[0];
}
async function columnExists(table: string, column: string) {
  const r = await one(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(r?.c ?? 0) > 0;
}
async function indexExists(table: string, name: string) {
  const r = await one(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    name
  );
  return Number(r?.c ?? 0) > 0;
}
async function tableExists(table: string) {
  const r = await one(`SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, table);
  return Number(r?.c ?? 0) > 0;
}
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

async function main() {
  // ---------------------------------------------------------------- vendors
  // The status backfill is a one-time translation of the old flags; it must never run again on rows created afterwards.
  const firstRun = !(await columnExists("vendors", "approval_status"));
  const vendorCols: Array<[string, string]> = [
    ["vendor_code", "VARCHAR(32) NULL"],
    ["registration_number", "VARCHAR(64) NULL"],
    ["vat_number", "VARCHAR(64) NULL"],
    ["commodity_categories", "JSON NULL"],
    ["onboarding_date", "DATETIME(3) NULL"],
    ["approval_status", "VARCHAR(24) NOT NULL DEFAULT 'NOT_SUBMITTED'"],
    ["compliance_status", "VARCHAR(24) NOT NULL DEFAULT 'PENDING'"],
    ["notes", "TEXT NULL"],
    ["approved_by_id", "VARCHAR(191) NULL"],
    ["approved_at", "DATETIME(3) NULL"],
    ["status_reason", "TEXT NULL"],
    ["status_changed_at", "DATETIME(3) NULL"],
    ["status_changed_by_id", "VARCHAR(191) NULL"],
  ];
  for (const [c, d] of vendorCols) await addColumn("vendors", c, d);
  await addIndex("vendors", "vendors_vendor_code_key", "UNIQUE INDEX `vendors_vendor_code_key` ON `vendors` (`vendor_code`)");
  await addIndex("vendors", "vendors_lifecycle_status_idx", "INDEX `vendors_lifecycle_status_idx` ON `vendors` (`lifecycle_status`)");

  // Backfill the single Vendor Status from the three loose axes it replaces. Only rows still on the old default.
  if (firstRun) {
    await prisma.$executeRawUnsafe(`
      UPDATE vendors SET
        lifecycle_status = CASE
          WHEN is_blacklisted = 1 THEN 'BLOCKED'
          WHEN registration_status = 'PENDING_REVIEW' THEN 'PENDING_REVIEW'
          WHEN registration_status = 'DECLINED' THEN 'INACTIVE'
          WHEN registration_status = 'SUSPENDED' THEN 'SUSPENDED'
          WHEN isActive = 0 THEN 'INACTIVE'
          WHEN tax_clearance_expiry_date IS NOT NULL AND tax_clearance_expiry_date < NOW() THEN 'EXPIRED'
          ELSE 'APPROVED' END,
        approval_status = CASE
          WHEN registration_status = 'PENDING_REVIEW' THEN 'PENDING_APPROVAL'
          WHEN registration_status = 'DECLINED' THEN 'REJECTED'
          ELSE 'APPROVED' END,
        onboarding_date = COALESCE(onboarding_date, createdAt)
      WHERE lifecycle_status IN ('ACTIVE') OR lifecycle_status IS NULL`);
    console.log("[ok] backfilled vendors.lifecycle_status / approval_status / onboarding_date");
  } else console.log("[skip] vendor status backfill (already done on a previous run)");

  // New vendors start as Draft (never silently Approved): the column default moves off the old 'ACTIVE'.
  const def = await one(`SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'lifecycle_status'`);
  if (String(def?.d ?? "").replace(/'/g, "") !== "DRAFT") {
    await prisma.$executeRawUnsafe("ALTER TABLE `vendors` ALTER COLUMN `lifecycle_status` SET DEFAULT 'DRAFT'");
    console.log("[ok] vendors.lifecycle_status default -> DRAFT");
  } else console.log("[skip] vendors.lifecycle_status default already DRAFT");

  await prisma.$executeRawUnsafe(
    `UPDATE vendors SET tax_compliance_status = 'EXPIRED' WHERE tax_clearance_expiry_date IS NOT NULL AND tax_clearance_expiry_date < NOW() AND tax_compliance_status <> 'EXPIRED'`
  );
  await prisma.$executeRawUnsafe(`
    UPDATE vendors SET compliance_status = CASE
      WHEN tax_compliance_status IN ('EXPIRED','INVALID') THEN 'NON_COMPLIANT'
      WHEN tax_compliance_status = 'ACTIVE' AND tax_clearance_expiry_date IS NOT NULL AND tax_clearance_expiry_date < DATE_ADD(NOW(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
      WHEN tax_compliance_status = 'ACTIVE' THEN 'COMPLIANT'
      ELSE 'PENDING' END
    WHERE compliance_status = 'PENDING'`);
  console.log("[ok] backfilled tax status + compliance_status");

  // Vendor code: VND-00001 ... oldest first
  const missing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM vendors WHERE vendor_code IS NULL ORDER BY createdAt ASC, id ASC`);
  if (missing.length) {
    const max = await one(`SELECT MAX(CAST(SUBSTRING(vendor_code, 5) AS UNSIGNED)) AS n FROM vendors WHERE vendor_code REGEXP '^VND-[0-9]+$'`);
    let n = Number(max?.n ?? 0);
    for (const row of missing) {
      n += 1;
      await prisma.$executeRawUnsafe(`UPDATE vendors SET vendor_code = ? WHERE id = ?`, `VND-${String(n).padStart(5, "0")}`, row.id);
    }
    console.log(`[ok] assigned vendor_code to ${missing.length} vendor(s)`);
  } else console.log("[skip] vendor_code populated");

  // ---------------------------------------------------------------- documents
  for (const [c, d] of [
    ["expiry_date", "DATE NULL"],
    ["issue_date", "DATE NULL"],
    ["document_number", "VARCHAR(64) NULL"],
    ["notify_days_before", "INT NULL"],
    ["last_expiry_notice_at", "DATETIME(3) NULL"],
  ] as Array<[string, string]>) await addColumn("vendor_kyc_documents", c, d);
  await addIndex("vendor_kyc_documents", "vendor_kyc_documents_expiry_idx", "INDEX `vendor_kyc_documents_expiry_idx` ON `vendor_kyc_documents` (`expiry_date`)");
  await addColumn("vendor_document_upload_settings", "expiry_notice_days", "INT NOT NULL DEFAULT 30");

  // ---------------------------------------------------------------- invoice origin
  // A supplier's own submission is attributed to a system user (it has no staff author); this marks that origin so segregation
  // of duties never mistakes the system attribution for a person who raised the invoice.
  await addColumn("procurement_invoices", "submitted_via", "VARCHAR(16) NULL");

  // ---------------------------------------------------------------- submissions
  await addColumn("vendor_quotations", "acknowledged_at", "DATETIME(3) NULL");
  await addColumn("vendor_quotations", "superseded_at", "DATETIME(3) NULL");

  if (!(await tableExists("rfq_reopen_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE rfq_reopen_events (
        id VARCHAR(191) NOT NULL,
        procurement_rfq_id VARCHAR(191) NOT NULL,
        reopened_by_id VARCHAR(191) NOT NULL,
        reason TEXT NOT NULL,
        previous_status VARCHAR(32) NULL,
        previous_closing_at DATETIME(3) NULL,
        new_closing_at DATETIME(3) NOT NULL,
        vendor_ids JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX rfq_reopen_events_rfq_idx (procurement_rfq_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log("[ok] created rfq_reopen_events");
  } else console.log("[skip] rfq_reopen_events");

  for (const [t, c] of [
    ["vendors", "vendor_code"],
    ["vendors", "approval_status"],
    ["vendors", "compliance_status"],
    ["vendor_kyc_documents", "expiry_date"],
    ["vendor_document_upload_settings", "expiry_notice_days"],
    ["vendor_quotations", "superseded_at"],
    ["procurement_invoices", "submitted_via"],
  ]) if (!(await columnExists(t, c))) throw new Error(`missing ${t}.${c}`);
  if (!(await tableExists("rfq_reopen_events"))) throw new Error("missing rfq_reopen_events");
  console.log("[verify OK]");
  const dist = await prisma.$queryRawUnsafe<any[]>(`SELECT lifecycle_status s, approval_status a, compliance_status c, COUNT(*) n FROM vendors GROUP BY 1,2,3`);
  console.log("vendor status distribution:", JSON.stringify(dist, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  console.log("\nVendor master migration finished.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
