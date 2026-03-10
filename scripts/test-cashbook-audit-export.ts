// @ts-nocheck
/**
 * Audit-ready cashbook export: month to Excel for tax audit.
 * Columns Date, Payee, Reference, Amount, Tax; totals match the system.
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

async function main() {
  console.log('========== Cashbook Audit Export (month to Excel) ==========\n');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59);
  const dbEntries = await prisma.cashbookEntry.findMany({
    where: {
      transactionDate: { gte: start, lte: end },
      originalTransactionId: null
    },
    include: {
      journalEntry: { include: { journalEntryLines: true } }
    }
  });

  const dbTotalAmount = dbEntries.reduce((s, e) => s + Number(e.amount), 0);
  let dbTotalTax = 0;
  for (const e of dbEntries) {
    if (e.journalEntry?.journalEntryLines?.length) {
      dbTotalTax += e.journalEntry.journalEntryLines.reduce((s, l) => s + Number(l.vatAmount ?? 0), 0);
    }
  }

  console.log(`Month ${year}-${String(month).padStart(2, '0')}: ${dbEntries.length} entries, DB total amount = ${dbTotalAmount}, DB total tax = ${dbTotalTax}\n`);

  const result = await CashbookAuditExportService.exportMonthToExcel({ year, month });
  assert(result.success, result.message ?? 'Export must succeed');
  assert(!!result.buffer, 'Export must return buffer');
  assert(result.totalAmount === dbTotalAmount, `Export totalAmount ${result.totalAmount} must match DB ${dbTotalAmount}`);
  assert(result.totalTax === dbTotalTax, `Export totalTax ${result.totalTax} must match DB ${dbTotalTax}`);
  assert(result.rowCount === dbEntries.length, `Export rowCount ${result.rowCount} must match DB entries ${dbEntries.length}`);

  if (!result.buffer) {
    console.log('No buffer; skipping Excel parse checks.');
    printResult();
    return;
  }

  const wb = XLSX.read(result.buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];

  const headerRow = aoa[0] as (string | number)[];
  assert(Array.isArray(headerRow) && headerRow.length >= EXPECTED_HEADERS.length, 'Sheet must have header row');
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    assert(String(headerRow[i]).trim() === EXPECTED_HEADERS[i], `Header col ${i + 1} must be "${EXPECTED_HEADERS[i]}", got "${headerRow[i]}"`);
  }

  const dataRows = aoa.slice(1).filter((row: any) => Array.isArray(row) && row.length > 0 && row[0] !== '' && String(row[0]) !== 'Total');
  const sheetSumAmount = dataRows.reduce((s, row) => s + (Number(row[3]) || 0), 0);
  const sheetSumTax = dataRows.reduce((s, row) => s + (Number(row[4]) || 0), 0);
  assert(Math.abs(sheetSumAmount - dbTotalAmount) < 0.01, `Sheet sum Amount ${sheetSumAmount} must match DB ${dbTotalAmount}`);
  assert(Math.abs(sheetSumTax - dbTotalTax) < 0.01, `Sheet sum Tax ${sheetSumTax} must match DB ${dbTotalTax}`);

  const totalRow = aoa.find((row: any) => Array.isArray(row) && String(row[0]).trim() === 'Total');
  assert(!!totalRow, 'Sheet must have a Total row');
  if (totalRow) {
    assert(Math.abs((Number(totalRow[3]) || 0) - dbTotalAmount) < 0.01, 'Total row Amount must match system');
    assert(Math.abs((Number(totalRow[4]) || 0) - dbTotalTax) < 0.01, 'Total row Tax must match system');
  }

  console.log('Headers:', headerRow.slice(0, 5).join(', '));
  console.log('Data rows:', dataRows.length);
  console.log('Sheet sum Amount:', sheetSumAmount, '| DB:', dbTotalAmount);
  console.log('Sheet sum Tax:', sheetSumTax, '| DB:', dbTotalTax);
  console.log('Totals row:', totalRow ? totalRow.slice(0, 5).join(', ') : 'N/A');

  printResult();
}

function printResult() {
  console.log('');
  if (failures.length) {
    console.log('FAILURES:', failures);
    process.exit(1);
  }
  console.log('All assertions passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
