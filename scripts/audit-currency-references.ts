/**
 * Deep audit: find any DB rows still referencing a currency code (e.g. ZWL).
 *
 * This scans information_schema for columns whose names look like currency foreign keys and then
 * counts matches for the target currency id.
 *
 * Run:
 *   npx ts-node scripts/audit-currency-references.ts ZWL
 *   npx ts-node scripts/audit-currency-references.ts ZIG
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Col = {
  tableName: string;
  columnName: string;
  dataType: string;
};

async function main() {
  const code = (process.argv[2] || "ZWL").trim().toUpperCase();
  const currency = await prisma.currency.findFirst({
    where: { code },
    select: { id: true, code: true, name: true },
  });

  if (!currency) {
    console.log(`[ok] No currency with code ${code} exists in currencies table.`);
    return;
  }

  console.log(`Auditing references to ${currency.code} (${currency.name}) id=${currency.id}`);

  const cols = await prisma.$queryRawUnsafe<Col[]>(`
    SELECT TABLE_NAME as tableName, COLUMN_NAME as columnName, DATA_TYPE as dataType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
        COLUMN_NAME IN ('currency_id', 'recorded_currency_id')
        OR COLUMN_NAME LIKE '%currencyId'
        OR COLUMN_NAME LIKE '%currency_id'
        OR COLUMN_NAME LIKE '%recorded_currency_id'
      )
      AND DATA_TYPE IN ('varchar','char','text')
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);

  if (!cols.length) {
    console.log("[warn] No currency-like columns found to scan.");
    return;
  }

  const hits: Array<{ table: string; column: string; count: number }> = [];
  for (const c of cols) {
    // Backtick identifiers; use parameter for value
    const sql = `SELECT COUNT(*) AS c FROM \`${c.tableName}\` WHERE \`${c.columnName}\` = ?`;
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(sql, currency.id);
    const n = Number(rows?.[0]?.c ?? 0);
    if (n > 0) {
      hits.push({ table: c.tableName, column: c.columnName, count: n });
    }
  }

  if (hits.length === 0) {
    console.log(`[ok] No rows reference ${code} in scanned columns.`);
    return;
  }

  console.log(`[warn] Found ${hits.length} table/column hits referencing ${code}:`);
  console.table(hits);
  const total = hits.reduce((s, h) => s + h.count, 0);
  console.log(`[warn] Total referencing rows: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

