// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import csv from 'csv-parser';

import { prisma } from '../utils/database';

/** Parsed row from the standard bank statement format (image format) */
export interface BankStatementRow {
  transactionDate: Date;
  valueDate?: Date | null;
  reference?: string | null;
  description: string;
  debitAmount: number;
  creditAmount: number;
  balance?: number | null;
}

/** Result of parsing the bank statement CSV (template format like the image) */
export interface ParsedBankStatement {
  accountNumber?: string | null;
  accountCurrency?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  items: BankStatementRow[];
}

interface BankTransactionData {
  transactionDate: Date;
  description: string;
  amount: Decimal;
  reference?: string;
}

interface UploadResult {
  reconciliationId: string;
  fileName: string;
  fileUrl: string;
  success: boolean;
  message: string;
}

/** Parse date from DD-Mon-YYYY (e.g. 03-Apr-2020) or ISO */
function parseStatementDate(s: string): Date | null {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/** Parse number from string (strip commas, allow minus) */
function parseNumber(s: string): number | null {
  if (s === undefined || s === null || s === '') return null;
  const str = String(s).replace(/,/g, '').trim();
  if (str === '') return null;
  const n = parseFloat(str);
  return Number.isNaN(n) ? null : n;
}

/**
 * Parse CSV in the standard bank statement format:
 * Optional rows: "Account Number", value; "Account Currency", value; "Opening Balance", value; "Closing Balance", value.
 * Then a header row: Transaction Date, Value Date, Reference, Description, Debit, Credit, Balance.
 * Then data rows.
 */
export function parseBankStatementCSV(fileBuffer: Buffer): ParsedBankStatement {
  const text = fileBuffer.toString('utf-8');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const result: ParsedBankStatement = { items: [] };
  let headerIndex = -1;
  const rows: string[][] = [];

  for (const line of lines) {
    const row = parseCSVLine(line);
    if (row.length === 0) continue;
    rows.push(row);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const first = (row[0] || '').trim();
    if (/^account\s*number$/i.test(first) && row[1] !== undefined) {
      result.accountNumber = row[1].trim() || null;
      continue;
    }
    if (/^account\s*currency$/i.test(first) && row[1] !== undefined) {
      result.accountCurrency = row[1].trim() || null;
      continue;
    }
    if (/^opening\s*balance$/i.test(first) && row[1] !== undefined) {
      result.openingBalance = parseNumber(row[1]);
      continue;
    }
    if (/^closing\s*balance$/i.test(first) && row[1] !== undefined) {
      result.closingBalance = parseNumber(row[1]);
      continue;
    }
    if (/^transaction\s*date$/i.test(first)) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0) {
    headerIndex = 0;
  }
  const dataStart = headerIndex + 1;
  const col = (r: string[], i: number) => (r[i] !== undefined ? r[i].trim() : '');

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    const transactionDate = parseStatementDate(col(r, 0));
    const valueDate = parseStatementDate(col(r, 1)) || transactionDate;
    const reference = col(r, 2) || null;
    const description = col(r, 3) || '';
    const debit = parseNumber(col(r, 4));
    const credit = parseNumber(col(r, 5));
    const balance = parseNumber(col(r, 6));

    if (!transactionDate || !description) continue;

    const debitAmount = debit != null && debit > 0 ? debit : 0;
    const creditAmount = credit != null && credit > 0 ? credit : 0;
    if (debitAmount === 0 && creditAmount === 0) continue;

    const amount = creditAmount > 0 ? creditAmount : -debitAmount;

    result.items.push({
      transactionDate,
      valueDate: valueDate || undefined,
      reference: reference || undefined,
      description,
      debitAmount: debitAmount,
      creditAmount: creditAmount,
      balance: balance ?? undefined
    });
  }

  return result;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\t' && !inQuotes)) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

export class BankStatementUploadService {
  static async uploadBankStatement(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    if (!file || !file.buffer) {
      throw new Error('No file provided');
    }

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        fileName: file.originalname,
        fileUrl: 'inline_upload',
        status: 'PENDING',
        createdById: userId
      }
    });

    return {
      reconciliationId: reconciliation.id,
      fileName: file.originalname,
      fileUrl: 'inline_upload',
      success: true,
      message: 'File received and stored inline'
    };
  }

  static async parseCSVFile(fileBuffer: Buffer): Promise<BankTransactionData[]> {
    return new Promise((resolve, reject) => {
      const transactions: BankTransactionData[] = [];
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(fileBuffer);

      bufferStream
        .pipe(csv())
        .on('data', (row: any) => {
          const normalizedRow = this.normalizeCSVRow(row);
          if (normalizedRow) {
            transactions.push(normalizedRow);
          }
        })
        .on('end', () => {
          resolve(transactions);
        })
        .on('error', (error: any) => {
          reject(error);
        });
    });
  }

  private static normalizeCSVRow(row: any): BankTransactionData | null {
    try {
      const dateField = row.date || row.Date || row.DATE || row.transactionDate || row.TransactionDate || row['Transaction Date'];
      const descriptionField = row.description || row.Description || row.DESCRIPTION || row.narrative || row.Narrative;
      const amountField = row.amount || row.Amount || row.debit || row.Debit || row.credit || row.Credit;
      const referenceField = row.reference || row.Reference || row.ref || row.Ref;

      if (!dateField || !descriptionField) return null;
      const debitVal = row.debit ?? row.Debit ?? row['Debit'];
      const creditVal = row.credit ?? row.Credit ?? row['Credit'];
      let amountNum = 0;
      if (debitVal !== undefined && debitVal !== '' && parseNumber(String(debitVal)) != null) {
        amountNum = -Math.abs(parseNumber(String(debitVal))!);
      } else if (creditVal !== undefined && creditVal !== '' && parseNumber(String(creditVal)) != null) {
        amountNum = Math.abs(parseNumber(String(creditVal))!);
      } else if (amountField !== undefined && amountField !== '') {
        amountNum = parseNumber(String(amountField)) ?? 0;
      }
      const transactionDate = parseStatementDate(String(dateField)) || new Date(dateField);
      if (isNaN(transactionDate.getTime())) return null;

      return {
        transactionDate,
        description: String(descriptionField).trim(),
        amount: new Decimal(amountNum),
        reference: referenceField ? String(referenceField).trim() : undefined
      };
    } catch (error) {
      console.error('Error normalizing CSV row:', error);
      return null;
    }
  }

  static async storeTransactions(reconciliationId: string, transactions: BankTransactionData[]): Promise<number> {
    try {
      const bankTransactions = transactions.map(transaction => ({
        reconciliationId,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        amount: transaction.amount,
        reference: transaction.reference || null,
        isMatched: false
      }));

      const result = await prisma.bankTransaction.createMany({
        data: bankTransactions
      });

      await prisma.bankReconciliation.update({
        where: { id: reconciliationId },
        data: {
          totalTransactions: result.count,
          status: 'PROCESSING'
        }
      });

      return result.count;
    } catch (error) {
      console.error('Error storing transactions:', error);
      throw error;
    }
  }
}
