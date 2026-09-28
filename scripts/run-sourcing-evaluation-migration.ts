/**
 * SRD §15-§20: Quotation management, bid opening, supplier comparison, evaluation, conflict controls and award recommendation.
 *
 * vendor_quotations        : quotation_reference, quotation_date, submission_method (VENDOR_PORTAL | STAFF_CAPTURE), capture_channel,
 *                            captured_by_id, capture_reason, received_at, vat_rate, delivery_period_days, submitted_snapshot + hash.
 * vendor_document_attachments : envelope (TECHNICAL | COMMERCIAL) for two-envelope evaluation.
 * procurement_rfqs         : evaluation_mode, pass_rule, min_evaluators, criteria_locked_at; existing open events become sealed.
 * procurement_settings     : sealed_bidding_default, min_opening_attendees, require_evaluator_declaration, default criteria template.
 * rfq_bid_openings (+ attendees): the immutable record of a formal opening (database triggers refuse UPDATE and DELETE).
 * rfq_evaluation_criteria / _committee / _scores / _notes, evaluation_declaration_options: configurable evaluation.
 * rfq_award_recommendations: the recommendation package and its approval route.
 *
 * Idempotent. Run: npm run db:migrate:sourcing-evaluation   then: npx prisma generate
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
const triggerExists = async (n: string) =>
  Number((await one(`SELECT COUNT(*) AS c FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`, n))?.c ?? 0) > 0;

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
/** MySQL refuses CREATE TRIGGER over the prepared-statement protocol Prisma uses, so this one statement goes over a plain connection. */
async function immutable(table: string) {
  const mysql = await import("mysql2/promise");
  const url = new URL(String(process.env.DATABASE_URL));
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  });
  try {
    for (const op of ["UPDATE", "DELETE"]) {
      const name = `${table}_no_${op.toLowerCase()}`;
      if (await triggerExists(name)) {
        console.log(`[skip] trigger ${name}`);
        continue;
      }
      try {
        await conn.query(
          `CREATE TRIGGER \`${name}\` BEFORE ${op} ON \`${table}\` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The ${table} record is immutable: it cannot be changed or removed.'`
        );
        console.log(`[ok] trigger ${name}`);
      } catch (e: any) {
        // Without the privilege (binary logging on and no SUPER) the application enforces it: there is no update or delete
        // path for these tables, and record_sha256 makes any out-of-band change detectable (GET /procurement/rfqs/:id/opening/verify).
        console.log(`[warn] trigger ${name} not created (${e?.code || e?.message}); immutability is enforced by the application and record_sha256`);
      }
    }
  } finally {
    await conn.end();
  }
}

async function main() {
  // ---------------------------------------------------------------- quotation record
  await addColumn("vendor_quotations", "quotation_reference", "VARCHAR(64) NULL");
  await addColumn("vendor_quotations", "quotation_date", "DATE NULL");
  await addColumn("vendor_quotations", "submission_method", "VARCHAR(24) NOT NULL DEFAULT 'VENDOR_PORTAL'");
  await addColumn("vendor_quotations", "capture_channel", "VARCHAR(32) NULL");
  await addColumn("vendor_quotations", "captured_by_id", "VARCHAR(191) NULL");
  await addColumn("vendor_quotations", "capture_reason", "TEXT NULL");
  await addColumn("vendor_quotations", "received_at", "DATETIME(3) NULL");
  await addColumn("vendor_quotations", "vat_rate", "DECIMAL(7,4) NULL");
  await addColumn("vendor_quotations", "delivery_period_days", "INT NULL");
  await addColumn("vendor_quotations", "submitted_snapshot", "JSON NULL");
  await addColumn("vendor_quotations", "snapshot_sha256", "VARCHAR(64) NULL");
  await addColumn("vendor_document_attachments", "envelope", "VARCHAR(12) NOT NULL DEFAULT 'COMMERCIAL'");
  await addColumn("vendor_document_attachments", "capture_channel", "VARCHAR(32) NULL");

  // ---------------------------------------------------------------- event
  await addColumn("procurement_rfqs", "evaluation_mode", "VARCHAR(16) NOT NULL DEFAULT 'SINGLE_ENVELOPE'");
  await addColumn("procurement_rfqs", "pass_rule", "VARCHAR(12) NOT NULL DEFAULT 'ALL'");
  await addColumn("procurement_rfqs", "min_evaluators", "INT NOT NULL DEFAULT 1");
  await addColumn("procurement_rfqs", "criteria_locked_at", "DATETIME(3) NULL");
  // A rate stated for a currency that had none at opening: { ZIG: { rate, reason, setById, setAt } }.
  await addColumn("procurement_rfqs", "fx_overrides", "JSON NULL");
  // Confidentiality first: an event whose bids have not been formally opened and that is not yet decided is sealed.
  const sealed = await prisma.$executeRawUnsafe(
    "UPDATE procurement_rfqs SET sealed_bidding = 1 WHERE sealed_bidding = 0 AND bid_opened_at IS NULL AND status NOT IN ('AWARDED','CLOSED','CANCELLED','COMPLETED')"
  );
  console.log(`[ok] sealed ${sealed} open event(s) that were not sealed`);

  // ---------------------------------------------------------------- settings
  await addColumn("procurement_settings", "sealed_bidding_default", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumn("procurement_settings", "min_opening_attendees", "INT NOT NULL DEFAULT 2");
  await addColumn("procurement_settings", "require_evaluator_declaration", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumn("procurement_settings", "default_evaluation_criteria", "JSON NULL");
  if (!(await one("SELECT id FROM procurement_settings WHERE id = 'default'"))) {
    await prisma.$executeRawUnsafe("INSERT INTO procurement_settings (id, updated_at) VALUES ('default', NOW(3))").catch(() => undefined);
  }
  const template = [
    { code: "COMPLIANCE", name: "Mandatory compliance", category: "COMPLIANCE", kind: "PASS_FAIL", weight: 0, mandatory: true },
    { code: "TECHNICAL", name: "Technical capability", category: "TECHNICAL", kind: "SCORED", weight: 35, mandatory: false },
    { code: "EXPERIENCE", name: "Experience", category: "EXPERIENCE", kind: "SCORED", weight: 10, mandatory: false },
    { code: "DELIVERY", name: "Delivery", category: "DELIVERY", kind: "SCORED", weight: 10, mandatory: false },
    { code: "PRICE", name: "Price", category: "PRICE", kind: "PRICE", weight: 45, mandatory: false },
  ];
  await prisma.$executeRawUnsafe("UPDATE procurement_settings SET default_evaluation_criteria = ? WHERE id = 'default' AND default_evaluation_criteria IS NULL", JSON.stringify(template));

  // ---------------------------------------------------------------- bid opening (immutable)
  await createTable(
    "rfq_bid_openings",
    `CREATE TABLE rfq_bid_openings (
      id VARCHAR(191) NOT NULL, rfq_id VARCHAR(191) NOT NULL, opened_at DATETIME(3) NOT NULL, opened_by_id VARCHAR(191) NOT NULL,
      notes TEXT NULL, submissions_count INT NOT NULL DEFAULT 0, reporting_currency_code VARCHAR(8) NULL, fx_snapshot JSON NULL, record_sha256 VARCHAR(64) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY rfq_bid_openings_rfq (rfq_id))`
  );
  await createTable(
    "rfq_bid_opening_attendees",
    `CREATE TABLE rfq_bid_opening_attendees (
      id VARCHAR(191) NOT NULL, opening_id VARCHAR(191) NOT NULL, user_id VARCHAR(191) NULL, name VARCHAR(191) NOT NULL,
      role VARCHAR(64) NULL, external TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), INDEX rfq_bid_opening_attendees_opening (opening_id))`
  );
  await addColumn("rfq_bid_openings", "record_sha256", "VARCHAR(64) NULL");
  await immutable("rfq_bid_openings");
  await immutable("rfq_bid_opening_attendees");

  // ---------------------------------------------------------------- evaluation
  await createTable(
    "evaluation_declaration_options",
    `CREATE TABLE evaluation_declaration_options (
      id VARCHAR(191) NOT NULL, code VARCHAR(32) NOT NULL, label VARCHAR(191) NOT NULL, statement TEXT NOT NULL,
      effect VARCHAR(12) NOT NULL DEFAULT 'CLEAR', requires_details TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY evaluation_declaration_options_code (code))`
  );
  const haveOptions = Number((await one("SELECT COUNT(*) AS c FROM evaluation_declaration_options"))?.c ?? 0);
  if (!haveOptions) {
    const seed = [
      ["NO_CONFLICT", "No known conflict", "I confirm that I have no known conflict of interest with any supplier in this sourcing event and will evaluate impartially.", "CLEAR", 0, 1],
      ["CONFLICT_DISCLOSED", "Conflict disclosed", "I disclose a potential conflict of interest, described below, and will abide by the committee's decision on it.", "DISCLOSED", 1, 2],
      ["RECUSAL_REQUIRED", "Recusal required", "I have a conflict of interest that requires me to be recused from evaluating this sourcing event.", "RECUSE", 1, 3],
    ];
    for (const [code, label, statement, effect, req, sort] of seed) {
      await prisma.$executeRawUnsafe(
        "INSERT INTO evaluation_declaration_options (id, code, label, statement, effect, requires_details, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
        `edo_${code.toLowerCase()}`, code, label, statement, effect, req, sort
      );
    }
    console.log("[ok] seeded the default declaration wording (configurable)");
  }
  await createTable(
    "rfq_evaluation_criteria",
    `CREATE TABLE rfq_evaluation_criteria (
      id VARCHAR(191) NOT NULL, rfq_id VARCHAR(191) NOT NULL, code VARCHAR(48) NOT NULL, name VARCHAR(191) NOT NULL,
      category VARCHAR(24) NOT NULL DEFAULT 'TECHNICAL', kind VARCHAR(12) NOT NULL DEFAULT 'SCORED', weight DECIMAL(7,3) NOT NULL DEFAULT 0,
      max_score INT NOT NULL DEFAULT 100, mandatory TINYINT(1) NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0, description TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id), UNIQUE KEY rfq_evaluation_criteria_code (rfq_id, code))`
  );
  await createTable(
    "rfq_evaluation_committee",
    `CREATE TABLE rfq_evaluation_committee (
      id VARCHAR(191) NOT NULL, rfq_id VARCHAR(191) NOT NULL, user_id VARCHAR(191) NOT NULL, role VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
      added_by_id VARCHAR(191) NULL, declaration_code VARCHAR(32) NULL, declaration_statement TEXT NULL, declaration_details TEXT NULL,
      declared_at DATETIME(3) NULL, recused TINYINT(1) NOT NULL DEFAULT 0, scorecard_submitted_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY rfq_evaluation_committee_member (rfq_id, user_id))`
  );
  await createTable(
    "rfq_evaluation_scores",
    `CREATE TABLE rfq_evaluation_scores (
      id VARCHAR(191) NOT NULL, rfq_id VARCHAR(191) NOT NULL, quotation_id VARCHAR(191) NOT NULL, criterion_id VARCHAR(191) NOT NULL,
      evaluator_id VARCHAR(191) NOT NULL, score DECIMAL(7,2) NULL, passed TINYINT(1) NULL, comment TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id), UNIQUE KEY rfq_evaluation_scores_one (quotation_id, criterion_id, evaluator_id), INDEX rfq_evaluation_scores_rfq (rfq_id))`
  );
  await createTable(
    "rfq_evaluation_notes",
    `CREATE TABLE rfq_evaluation_notes (
      id VARCHAR(191) NOT NULL, rfq_id VARCHAR(191) NOT NULL, quotation_id VARCHAR(191) NOT NULL, evaluator_id VARCHAR(191) NOT NULL,
      comment TEXT NULL, attachments JSON NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY rfq_evaluation_notes_one (quotation_id, evaluator_id))`
  );

  // ---------------------------------------------------------------- award recommendation
  await createTable(
    "rfq_award_recommendations",
    `CREATE TABLE rfq_award_recommendations (
      id VARCHAR(191) NOT NULL, rfq_id VARCHAR(191) NOT NULL, version INT NOT NULL DEFAULT 1, status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
      recommended_quotation_id VARCHAR(191) NOT NULL, recommended_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00, currency_code VARCHAR(8) NULL,
      justification TEXT NULL, deviations TEXT NULL, evaluation_summary JSON NULL, supporting_documents JSON NULL,
      prepared_by_id VARCHAR(191) NOT NULL, submitted_at DATETIME(3) NULL, approval_request_id VARCHAR(191) NULL,
      decided_at DATETIME(3) NULL, decision_comments TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id), INDEX rfq_award_recommendations_rfq (rfq_id, version))`
  );

  for (const [t, c] of [
    ["vendor_quotations", "submission_method"],
    ["vendor_quotations", "submitted_snapshot"],
    ["procurement_rfqs", "evaluation_mode"],
    ["procurement_settings", "min_opening_attendees"],
    ["vendor_document_attachments", "envelope"],
  ]) if (!(await columnExists(t, c))) throw new Error(`missing ${t}.${c}`);
  for (const t of ["rfq_bid_openings", "rfq_bid_opening_attendees", "rfq_evaluation_criteria", "rfq_evaluation_committee", "rfq_evaluation_scores", "rfq_evaluation_notes", "evaluation_declaration_options", "rfq_award_recommendations"]) {
    if (!(await tableExists(t))) throw new Error(`missing ${t}`);
  }
  console.log("[verify OK]\nSourcing/evaluation migration finished.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
