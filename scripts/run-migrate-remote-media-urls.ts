/**
 * Data migration: rewrite legacy remote upload URLs (http://…/uploads/… or old /api/public-media/…)
 * to the current public base from env (BASE_URL → …/api/public-media, same as RemoteUploadService).
 *
 * Prerequisites: set BASE_URL and/or REMOTE_MEDIA_BASE_URL / FRONTEND_URL like production.
 * Idempotent: safe to re-run; only updates rows where the rewritten URL differs.
 *
 * Usage:
 *   npx ts-node scripts/run-migrate-remote-media-urls.ts
 *   DRY_RUN=1 npx ts-node scripts/run-migrate-remote-media-urls.ts   # print only, no UPDATE
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { rewritePublicMediaUrl } from "../src/services/RemoteUploadService";

const prisma = new PrismaClient();

const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

type StringCol = { table: string; columnCandidates: string[] };

/** Prefer Prisma @map snake_case first when both exist; DB drift may use camelCase. */
const STRING_COLUMNS: StringCol[] = [
  { table: "vendor_kyc_documents", columnCandidates: ["file_url", "fileUrl"] },
  { table: "company_profile", columnCandidates: ["logo_url", "logoUrl"] },
  { table: "company_profile_addresses", columnCandidates: ["logo_url", "logoUrl"] },
  { table: "portfolio_companies", columnCandidates: ["logoUrl", "logo_url"] },
  { table: "application_documents", columnCandidates: ["file_url", "fileUrl"] },
  { table: "board_reviews", columnCandidates: ["im_document_url", "imDocumentUrl"] },
  { table: "term_sheets", columnCandidates: ["documentUrl", "document_url"] },
  { table: "term_sheets", columnCandidates: ["applicantSignatureUrl", "applicant_signature_url"] },
  { table: "term_sheets", columnCandidates: ["investorSignatureUrl", "investor_signature_url"] },
  { table: "bsc_statutory_submissions", columnCandidates: ["evidence_document_url", "evidenceDocumentUrl"] },
  { table: "performance_contracts", columnCandidates: ["strategyDocumentUrl", "strategy_document_url"] },
  { table: "performance_strategies", columnCandidates: ["strategyDocumentUrl", "strategy_document_url"] },
  { table: "rfq_clarifications", columnCandidates: ["attachment_url", "attachmentUrl"] },
  { table: "vendor_invoice_intakes", columnCandidates: ["document_url", "documentUrl"] },
  { table: "generated_reports", columnCandidates: ["fileUrl", "file_url"] },
  { table: "cashbook_entries", columnCandidates: ["receipt_attachment_url", "receiptAttachmentUrl"] },
  { table: "cashbook_batches", columnCandidates: ["importFileUrl", "import_file_url"] },
  { table: "newsletters", columnCandidates: ["imageUrl", "image_url"] },
  { table: "bank_reconciliations", columnCandidates: ["fileUrl", "file_url"] },
  { table: "employees", columnCandidates: ["pictureUrl", "picture_url"] },
  {
    table: "purchase_requisitions",
    columnCandidates: ["use_of_funds_document_url", "useOfFundsDocumentUrl"],
  },
];

const tableColumnsCache = new Map<string, Set<string>>();

async function loadTableColumns(table: string): Promise<Set<string> | null> {
  if (tableColumnsCache.has(table)) return tableColumnsCache.get(table)!;
  const rows = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  if (!rows.length) {
    console.warn(`[warn] Table not found or no columns: ${table}`);
    return null;
  }
  const set = new Set(rows.map((r) => r.COLUMN_NAME));
  tableColumnsCache.set(table, set);
  return set;
}

function pickColumn(cols: Set<string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (cols.has(c)) return c;
  }
  return null;
}

function requireEnvHint(): void {
  const ok =
    Boolean(process.env.REMOTE_MEDIA_BASE_URL?.trim()) ||
    Boolean(process.env.BASE_URL?.trim()) ||
    Boolean(process.env.FRONTEND_URL?.trim()) ||
    Boolean(process.env.API_PUBLIC_BASE_URL?.trim());
  if (!ok) {
    console.error(
      "Missing env: set at least one of REMOTE_MEDIA_BASE_URL, BASE_URL, FRONTEND_URL, API_PUBLIC_BASE_URL so rewrite targets match production."
    );
    process.exit(1);
  }
}

function matchWhereClause(column: string): string {
  return `(
  \`${column}\` LIKE '%/uploads/%'
  OR \`${column}\` LIKE '%31.220.82.129%'
  OR \`${column}\` LIKE '%/api/public-media/%'
)`;
}

async function migrateStringColumn(
  table: string,
  columnCandidates: string[]
): Promise<{ updated: number; column: string }> {
  const cols = await loadTableColumns(table);
  if (!cols) return { updated: 0, column: "" };
  const column = pickColumn(cols, columnCandidates);
  if (!column) {
    console.warn(`[warn] ${table}: missing column (tried ${columnCandidates.join(", ")})`);
    return { updated: 0, column: "" };
  }
  const where = matchWhereClause(column);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; v: string | null }>>(
    `SELECT \`id\`, \`${column}\` AS v FROM \`${table}\` WHERE ${where}`
  );
  let updated = 0;
  for (const row of rows) {
    if (row.v == null || row.v === "") continue;
    const next = rewritePublicMediaUrl(row.v);
    if (next == null || next === row.v) continue;
    if (DRY) {
      console.log(`[dry-run] ${table}.${column} id=${row.id}`);
      console.log(`  from: ${row.v.substring(0, 200)}${row.v.length > 200 ? "…" : ""}`);
      console.log(`  to:   ${next.substring(0, 200)}${next.length > 200 ? "…" : ""}`);
      updated++;
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`id\` = ?`,
      next,
      row.id
    );
    updated++;
  }
  return { updated, column };
}

type JsonVal = Record<string, unknown> | unknown[] | string | number | boolean | null;

function deepRewriteUrls(val: JsonVal): { changed: boolean; next: JsonVal } {
  if (typeof val === "string") {
    const next = rewritePublicMediaUrl(val) ?? val;
    if (next !== val) return { changed: true, next };
    return { changed: false, next: val };
  }
  if (Array.isArray(val)) {
    let changed = false;
    const next: unknown[] = [];
    for (const x of val) {
      const r = deepRewriteUrls(x as JsonVal);
      if (r.changed) changed = true;
      next.push(r.next);
    }
    return { changed, next };
  }
  if (val !== null && typeof val === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      const r = deepRewriteUrls(v as JsonVal);
      if (r.changed) changed = true;
      next[k] = r.next;
    }
    return { changed, next };
  }
  return { changed: false, next: val };
}

/** goods_received_notes.attachment_urls — JSON array/object of URL strings. */
async function migrateGoodsReceivedNoteAttachments(): Promise<number> {
  const table = "goods_received_notes";
  const cols = await loadTableColumns(table);
  const column = cols ? pickColumn(cols, ["attachment_urls", "attachmentUrls"]) : null;
  if (!column) {
    console.warn("[warn] goods_received_notes: attachment_urls column missing");
    return 0;
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; raw: unknown }>>(
    `SELECT \`id\`, \`${column}\` AS raw FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND (
      CAST(\`${column}\` AS CHAR(10000)) LIKE '%/uploads/%'
      OR CAST(\`${column}\` AS CHAR(10000)) LIKE '%31.220.82.129%'
      OR CAST(\`${column}\` AS CHAR(10000)) LIKE '%/api/public-media/%'
    )`
  );
  let updated = 0;
  for (const row of rows) {
    let parsed: JsonVal;
    try {
      parsed =
        typeof row.raw === "string"
          ? (JSON.parse(row.raw) as JsonVal)
          : (row.raw as JsonVal);
    } catch {
      console.warn(`[skip] ${table}.${column} id=${row.id} invalid JSON`);
      continue;
    }
    const { changed, next } = deepRewriteUrls(parsed);
    if (!changed) continue;
    const jsonStr = JSON.stringify(next);
    if (DRY) {
      console.log(`[dry-run] ${table}.${column} id=${row.id} -> (json updated)`);
      updated++;
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`id\` = ?`,
      jsonStr,
      row.id
    );
    updated++;
  }
  return updated;
}

async function main(): Promise<void> {
  requireEnvHint();
  console.log(
    DRY ? "DRY_RUN: no writes." : "Applying updates.",
    `BASE_URL=${process.env.BASE_URL ? "(set)" : "(unset)"} REMOTE_MEDIA_BASE_URL=${process.env.REMOTE_MEDIA_BASE_URL ? "(set)" : "(unset)"}`
  );

  let total = 0;
  for (const { table, columnCandidates } of STRING_COLUMNS) {
    const { updated, column } = await migrateStringColumn(table, columnCandidates);
    if (updated > 0) console.log(`[ok] ${table}.${column}: ${updated} row(s)`);
    total += updated;
  }
  const gn = await migrateGoodsReceivedNoteAttachments();
  if (gn > 0) console.log(`[ok] goods_received_notes (attachment JSON): ${gn} row(s)`);
  total += gn;

  console.log(`Done. Total cells updated: ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
