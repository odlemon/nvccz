/**
 * SRD §32 (document management) and §33 (audit trail).
 *
 * audit_logs                    : event_type (the class the audit page filters on; one of the eighteen in auditEventTypes.ts),
 *                                 back-filled for every existing row from its action and record type; indexed.
 * procurement_documents         : original_name, extension, related_record_type / _id (a structured link to the record the
 *                                 document belongs to), current_version_no, checksum.
 * procurement_document_versions : one row per stored file of a document, oldest to newest, so a new version keeps the history
 *                                 (file, size, type, checksum, who, when, note). Existing documents get their v1 row.
 *
 * Idempotent. Run: npm run db:migrate:document-audit   then: npx prisma generate
 */
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import mysql from "mysql2/promise";
import { classifyAuditEvent } from "../src/services/audit/auditEventTypes";

const prisma = new PrismaClient();

const TRIGGERS = [
`    CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
    BEGIN
      IF COALESCE(@audit_maintenance, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit history is immutable: entries cannot be deleted';
      END IF;
    END`,
`    CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
    BEGIN
      IF COALESCE(@audit_maintenance, 0) <> 1 AND (
           NOT (NEW.action <=> OLD.action) OR NOT (NEW.entityType <=> OLD.entityType) OR NOT (NEW.entityId <=> OLD.entityId)
        OR NOT (NEW.ipAddress <=> OLD.ipAddress) OR NOT (NEW.userAgent <=> OLD.userAgent) OR NOT (NEW.createdAt <=> OLD.createdAt)
        OR CAST(NEW.oldValues AS CHAR) <=> CAST(OLD.oldValues AS CHAR) IS FALSE OR CAST(NEW.newValues AS CHAR) <=> CAST(OLD.newValues AS CHAR) IS FALSE
        OR (NOT (NEW.event_type <=> OLD.event_type) AND OLD.event_type IS NOT NULL)
        OR (NOT (NEW.userId <=> OLD.userId) AND NEW.userId IS NOT NULL)
      ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit history is immutable: entries cannot be modified';
      END IF;
    END`,
];

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
  if (await indexExists(table, name)) return console.log(`[skip] index ${table}.${name}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD ${ddl}`);
  console.log(`[ok] index ${table}.${name}`);
}

async function main() {
  // The triggers below refuse UPDATE/DELETE on audit_logs; lift them while this script back-fills, and put them back at the end.
  const raw = await mysql.createConnection({ uri: String(process.env.DATABASE_URL).replace(/\?.*$/, "") });
  await raw.query("SET SESSION lock_wait_timeout = 30");
  console.log("[..] lifting audit triggers");
  await raw.query("DROP TRIGGER IF EXISTS audit_logs_no_update");
  await raw.query("DROP TRIGGER IF EXISTS audit_logs_no_delete");
  // ---- audit_logs: the event class
  await addColumn("audit_logs", "event_type", "VARCHAR(32) NULL");
  await addIndex("audit_logs", "audit_logs_event_type_created_idx", "INDEX `audit_logs_event_type_created_idx` (`event_type`, `createdAt`)");
  const pairs = await prisma.$queryRawUnsafe<{ action: string; entity_type: string; n: bigint }[]>(
    "SELECT action, `entityType` AS entity_type, COUNT(*) AS n FROM audit_logs WHERE event_type IS NULL OR event_type = 'OTHER' GROUP BY action, `entityType`",
  );
  let classified = 0;
  for (const p of pairs) {
    const type = classifyAuditEvent(p.action, p.entity_type);
    await prisma.$executeRawUnsafe("UPDATE audit_logs SET event_type = ? WHERE (event_type IS NULL OR event_type = 'OTHER') AND action = ? AND `entityType` = ?", type, p.action, p.entity_type);
    classified += Number(p.n);
  }
  console.log(`[ok] audit_logs.event_type back-filled for ${classified} rows (${pairs.length} action/record pairs)`);

  // ---- procurement_documents
  await addColumn("procurement_documents", "original_name", "VARCHAR(255) NULL");
  await addColumn("procurement_documents", "extension", "VARCHAR(16) NULL");
  await addColumn("procurement_documents", "related_record_type", "VARCHAR(32) NULL");
  await addColumn("procurement_documents", "related_record_id", "VARCHAR(64) NULL");
  await addColumn("procurement_documents", "current_version_no", "INT NOT NULL DEFAULT 1");
  await addColumn("procurement_documents", "checksum", "VARCHAR(64) NULL");
  await addIndex("procurement_documents", "procurement_documents_related_idx", "INDEX `procurement_documents_related_idx` (`related_record_type`, `related_record_id`)");

  // ---- version history
  if (!(await tableExists("procurement_document_versions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE procurement_document_versions (
        id              VARCHAR(191) NOT NULL,
        document_id     VARCHAR(191) NOT NULL,
        version_no      INT NOT NULL,
        version_label   VARCHAR(16) NOT NULL,
        original_name   VARCHAR(255) NULL,
        file_url        TEXT NOT NULL,
        storage_path    VARCHAR(512) NULL,
        mime_type       VARCHAR(128) NULL,
        file_size_bytes BIGINT NULL,
        checksum        VARCHAR(64) NULL,
        change_note     TEXT NULL,
        uploaded_by_id  VARCHAR(191) NULL,
        uploaded_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY procurement_document_versions_doc_no_key (document_id, version_no),
        KEY procurement_document_versions_doc_idx (document_id),
        CONSTRAINT procurement_document_versions_doc_fk FOREIGN KEY (document_id) REFERENCES procurement_documents (id) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log("[ok] created procurement_document_versions");
  } else console.log("[skip] table procurement_document_versions");

  // Existing documents: their file becomes version 1 (the label they already carry), and the extension is worked out.
  const docs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT d.id, d.name, d.version, d.file_url, d.storage_path, d.mime_type, d.file_size_bytes, d.uploaded_by_id, d.created_at
       FROM procurement_documents d
       LEFT JOIN procurement_document_versions v ON v.document_id = d.id
      WHERE v.id IS NULL`,
  );
  for (const d of docs) {
    const ext = String(d.name || d.storage_path || "").match(/\.([A-Za-z0-9]{2,5})$/)?.[1]?.toLowerCase() ?? null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO procurement_document_versions (id, document_id, version_no, version_label, original_name, file_url, storage_path, mime_type, file_size_bytes, uploaded_by_id, uploaded_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID().replace(/-/g, "").slice(0, 25), d.id, d.version || "v1.0", d.name, d.file_url, d.storage_path, d.mime_type, d.file_size_bytes, d.uploaded_by_id, d.created_at,
    );
    if (ext) await prisma.$executeRawUnsafe("UPDATE procurement_documents SET extension = ? WHERE id = ? AND extension IS NULL", ext, d.id);
  }
  console.log(`[ok] ${docs.length} existing document(s) given their version 1 row`);

  // ---- audit history is append-only at the database too, where the account is allowed to create triggers
  try {
    for (const sql of TRIGGERS) await raw.query(sql);
    console.log("[ok] audit_logs UPDATE/DELETE triggers in place");
  } catch (e: any) {
    if (e?.errno !== 1419 && e?.errno !== 1227) throw e;
    console.log("[warn] database triggers not created: this account has no SUPER privilege and binary logging is on.");
    console.log("       The application guard (src/utils/auditImmutability.ts) is active. A DBA can add the database-level guard with scripts/audit-immutability-triggers.sql");
  }
  await raw.end();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
