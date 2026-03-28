// @ts-nocheck
/**
 * Audit cashbook export: default CSV; optional xlsx.
 * Columns Date, Payee, Reference, Amount, Tax; totals match POSTED rows in DB for the month.
 *
 * Run: npx ts-node scripts/test-cashbook-audit-export.ts
 */
import XLSX from 'xlsx';
import { prisma } from '../src/utils/database';
import { CashbookAuditExportService } from '../src/services/CashbookAuditExportService';

const EXPECTED_HEADERS = ['Date', 'Payee', 'Reference', 'Amount', 'Tax'];
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  console.log('========== Cashbook audit export (CSV default + xlsx) ==========\n');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59);
  const dbEntries = await prisma.cashbookEntry.findMany({
    where: {
      transactionDate: { gte: start, lte: end },
      originalTransactionId: null,
      status: 'POSTED'
    },
    include: {
      journalEntry: { include: { journalEntryLines: true } }
    }
  });

  const dbTotalAmount = round2(dbEntries.reduce((s, e) => s + Number(e.amount), 0));
  let dbTotalTax = 0;
  for (const e of dbEntries) {
    if (e.journalEntry?.journalEntryLines?.length) {
      dbTotalTax += e.journalEntry.journalEntryLines.reduce((s, l) => s + Number(l.vatAmount ?? 0), 0);
    }
  }
  dbTotalTax = round2(dbTotalTax);

  console.log(
    `Month ${year}-${String(month).padStart(2, '0')}: ${dbEntries.length} POSTED entries, amount=${dbTotalAmount}, tax=${dbTotalTax}\n`
  );

  const resultCsv = await CashbookAuditExportService.exportMonth({ year, month, format: 'csv' });
  assert(resultCsv.success, resultCsv.message ?? 'CSV export must succeed');
  assert(!!resultCsv.buffer, 'CSV must return buffer');
  assert(resultCsv.fileName?.endsWith('.csv'), 'CSV filename must end with .csv');
  assert(resultCsv.contentType?.includes('csv'), 'CSV content type');
  assert(resultCsv.totalAmount === dbTotalAmount, `CSV totalAmount ${resultCsv.totalAmount} vs DB ${dbTotalAmount}`);
  assert(resultCsv.totalTax === dbTotalTax, `CSV totalTax ${resultCsv.totalTax} vs DB ${dbTotalTax}`);
  assert(resultCsv.rowCount === dbEntries.length, `CSV rowCount ${resultCsv.rowCount} vs DB ${dbEntries.length}`);

  const csvText = resultCsv.buffer.toString('utf8').replace(/^\ufeff/, '');
  assert(csvText.includes('Date,'), 'CSV must contain header');
  assert(csvText.includes('Totals (sum of rows above)'), 'CSV must contain totals row');

  const resultXlsx = await CashbookAuditExportService.exportMonth({ year, month, format: 'xlsx' });
  assert(resultXlsx.success, resultXlsx.message ?? 'XLSX export must succeed');
  assert(!!resultXlsx.buffer, 'XLSX must return buffer');

  const wb = XLSX.read(resultXlsx.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];

  const headerIdx = aoa.findIndex(
    (row) =>
      Array.isArray(row) &&
      String(row[0]).trim() === 'Date' &&
      String(row[1]).trim() === 'Payee'
  );
  assert(headerIdx >= 0, 'XLSX must contain Date/Payee header row');
  const headerRow = aoa[headerIdx] as (string | number)[];
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    assert(
      String(headerRow[i]).trim() === EXPECTED_HEADERS[i],
      `Header col ${i + 1} expected "${EXPECTED_HEADERS[i]}" got "${headerRow[i]}"`
    );
  }

  const dataRows = aoa
    .slice(headerIdx + 1)
    .filter(
      (row: any) =>
        Array.isArray(row) &&
        row.length >= 5 &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(row[0]).trim())
    );
  const sheetSumAmount = round2(dataRows.reduce((s, row) => s + (Number(row[3]) || 0), 0));
  const sheetSumTax = round2(dataRows.reduce((s, row) => s + (Number(row[4]) || 0), 0));
  assert(sheetSumAmount === dbTotalAmount, `XLSX sum Amount ${sheetSumAmount} vs DB ${dbTotalAmount}`);
  assert(sheetSumTax === dbTotalTax, `XLSX sum Tax ${sheetSumTax} vs DB ${dbTotalTax}`);

  const totalRow = aoa.find(
    (row: any) => Array.isArray(row) && String(row[0]).includes('Totals (sum of rows above)')
  );
  assert(!!totalRow, 'XLSX must have totals row');
  if (totalRow) {
    assert(round2(Number(totalRow[3]) || 0) === dbTotalAmount, 'XLSX totals Amount');
    assert(round2(Number(totalRow[4]) || 0) === dbTotalTax, 'XLSX totals Tax');
  }

  console.log('CSV sample (first 200 chars):', csvText.slice(0, 200).replace(/\r\n/g, '\\n'));
  console.log('XLSX data rows:', dataRows.length);

  if (failures.length) {
    console.log('\nFAILURES:', failures);
    process.exit(1);
  }
  console.log('\nAll assertions passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
