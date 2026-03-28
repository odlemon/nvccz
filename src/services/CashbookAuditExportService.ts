// @ts-nocheck
/**
 * Audit-ready cashbook export for tax audit.
 * Default: CSV (RFC 4180-style escaping, UTF-8 BOM for Excel).
 * Optional format=xlsx via exportMonth({ format: 'xlsx' }).
 * Columns: Date, Payee, Reference, Amount, Tax.
 */
import XLSX from 'xlsx';
import { prisma } from '../utils/database';

const COLUMN_HEADERS = ['Date', 'Payee', 'Reference', 'Amount', 'Tax'] as const;

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function escapeCsvCell(cell: string | number): string {
  if (cell === null || cell === undefined) return '';
  const s = typeof cell === 'number' ? String(cell) : String(cell);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeCsvRow(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

function resolvePayee(e: {
  customer?: { name?: string | null } | null;
  vendor?: { name?: string | null } | null;
  glAccount?: { accountName?: string | null } | null;
  description?: string | null;
}): string {
  const c = e.customer?.name?.trim();
  if (c) return c;
  const v = e.vendor?.name?.trim();
  if (v) return v;
  const g = e.glAccount?.accountName?.trim();
  if (g) return g;
  const d = (e.description ?? '').trim();
  if (d.length > 100) return `${d.slice(0, 97)}...`;
  return d;
}

function taxFromJournal(journalEntry: { journalEntryLines?: { vatAmount?: unknown }[] } | null | undefined): number {
  if (!journalEntry?.journalEntryLines?.length) return 0;
  return journalEntry.journalEntryLines.reduce((s, l) => s + Number(l.vatAmount ?? 0), 0);
}

export interface CashbookAuditExportParams {
  bankId?: string;
  year: number;
  month: number;
  /** Default `csv`. Use `xlsx` for legacy Excel download. */
  format?: 'csv' | 'xlsx';
}

export interface CashbookAuditExportResult {
  success: boolean;
  buffer?: Buffer;
  fileName?: string;
  contentType?: string;
  totalAmount?: number;
  totalTax?: number;
  rowCount?: number;
  message: string;
}

export class CashbookAuditExportService {
  /**
   * Export a month's POSTED cashbook. Default format is CSV.
   */
  static async exportMonth(params: CashbookAuditExportParams): Promise<CashbookAuditExportResult> {
    try {
      const { bankId, year, month } = params;
      const format = params.format === 'xlsx' ? 'xlsx' : 'csv';

      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);

      const where: any = {
        transactionDate: { gte: start, lte: end },
        originalTransactionId: null,
        status: 'POSTED'
      };
      if (bankId) where.bankId = bankId;

      const entries = await prisma.cashbookEntry.findMany({
        where,
        include: {
          bank: true,
          customer: true,
          vendor: true,
          glAccount: true,
          journalEntry: {
            include: {
              journalEntryLines: true
            }
          }
        },
        orderBy: { transactionDate: 'asc' }
      });

      const matrix: (string | number)[][] = [];
      const period = `${year}-${String(month).padStart(2, '0')}`;
      matrix.push([`Cashbook — tax audit export (${period})`]);
      matrix.push(['Posted transactions only. Columns: Date, Payee, Reference, Amount, Tax.']);
      matrix.push([]);
      matrix.push([...COLUMN_HEADERS]);

      let sumAmount = 0;
      let sumTax = 0;

      for (const e of entries) {
        const dateStr = e.transactionDate.toISOString().split('T')[0];
        const payee = resolvePayee(e);
        const reference = (e.reference ?? '').trim();
        const amount = Number(e.amount);
        const tax = taxFromJournal(e.journalEntry);
        sumAmount += amount;
        sumTax += tax;
        matrix.push([dateStr, payee, reference, round2(amount), round2(tax)]);
      }

      const totalAmount = round2(sumAmount);
      const totalTax = round2(sumTax);

      matrix.push([]);
      matrix.push(['Totals (sum of rows above)', '', '', totalAmount, totalTax]);

      if (format === 'csv') {
        const lines = matrix.map((row) => (row.length === 0 ? '' : escapeCsvRow(row)));
        const csvBody = lines.join('\r\n');
        const buffer = Buffer.from('\ufeff' + csvBody, 'utf8');
        return {
          success: true,
          buffer,
          fileName: `cashbook-audit-${period}.csv`,
          contentType: 'text/csv; charset=utf-8',
          totalAmount,
          totalTax,
          rowCount: entries.length,
          message: 'Cashbook audit CSV generated successfully'
        };
      }

      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLUMN_HEADERS.length - 1 } }];
      ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 28 }, { wch: 14 }, { wch: 12 }];

      const wb = XLSX.utils.book_new();
      const sheetName = `Audit ${period}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      return {
        success: true,
        buffer,
        fileName: `cashbook-audit-${period}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        totalAmount,
        totalTax,
        rowCount: entries.length,
        message: 'Cashbook audit Excel generated successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message ?? 'Failed to export cashbook for audit'
      };
    }
  }

  /** @deprecated Use exportMonth({ ...params, format: 'xlsx' }) */
  static async exportMonthToExcel(params: CashbookAuditExportParams): Promise<CashbookAuditExportResult> {
    return this.exportMonth({ ...params, format: 'xlsx' });
  }
}
