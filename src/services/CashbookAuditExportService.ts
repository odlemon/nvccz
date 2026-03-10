// @ts-nocheck
/**
 * Audit-ready cashbook export to Excel for tax audit.
 * Columns: Date, Payee, Reference, Amount, Tax. Totals match the system.
 */
import XLSX from 'xlsx';
import { prisma } from '../utils/database';

const COLUMNS = ['Date', 'Payee', 'Reference', 'Amount', 'Tax'] as const;

export interface CashbookAuditExportParams {
  bankId?: string;
  year: number;
  month: number;
}

export interface CashbookAuditExportResult {
  success: boolean;
  buffer?: Buffer;
  fileName?: string;
  totalAmount?: number;
  totalTax?: number;
  rowCount?: number;
  message: string;
}

export class CashbookAuditExportService {
  /**
   * Export a month's cashbook to Excel. Columns: Date, Payee, Reference, Amount, Tax.
   * Totals row at bottom; totals match the system exactly.
   */
  static async exportMonthToExcel(params: CashbookAuditExportParams): Promise<CashbookAuditExportResult> {
    try {
      const { bankId, year, month } = params;
      const start = new Date(year, month - 1, 1, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59);

      const where: any = {
        transactionDate: { gte: start, lte: end },
        originalTransactionId: null
      };
      if (bankId) where.bankId = bankId;

      const entries = await prisma.cashbookEntry.findMany({
        where,
        include: {
          bank: true,
          customer: true,
          vendor: true,
          journalEntry: {
            include: {
              journalEntryLines: true
            }
          }
        },
        orderBy: { transactionDate: 'asc' }
      });

      const rows: (string | number)[][] = [];
      rows.push([...COLUMNS]);

      let totalAmount = 0;
      let totalTax = 0;

      for (const e of entries) {
        const dateStr = e.transactionDate.toISOString().split('T')[0];
        const payee = e.customer?.name ?? e.vendor?.name ?? e.description ?? '';
        const reference = e.reference ?? '';
        const amount = Number(e.amount);
        let tax = 0;
        if (e.journalEntry?.journalEntryLines?.length) {
          tax = e.journalEntry.journalEntryLines.reduce((s, l) => s + Number(l.vatAmount ?? 0), 0);
        }
        totalAmount += amount;
        totalTax += tax;
        rows.push([dateStr, payee, reference, amount, tax]);
      }

      rows.push([]);
      rows.push(['Total', '', '', totalAmount, totalTax]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      const sheetName = `Cashbook ${year}-${String(month).padStart(2, '0')}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const fileName = `cashbook-audit-${year}-${String(month).padStart(2, '0')}.xlsx`;

      return {
        success: true,
        buffer,
        fileName,
        totalAmount,
        totalTax,
        rowCount: entries.length,
        message: 'Cashbook export for tax audit generated successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message ?? 'Failed to export cashbook to Excel'
      };
    }
  }
}
