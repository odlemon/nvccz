// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import csv from 'csv-parser';

import { prisma } from '../utils/database';

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

export class BankStatementUploadService {
  // Deprecated: external storage upload path. We now process CSV in-memory.
  static async uploadBankStatement(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    // Keep method for backward compatibility, but avoid S3 usage.
    if (!file || !file.buffer) {
      throw new Error('No file provided');
    }

    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.originalname}`;

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
      // Try different possible column names for date
      const dateField = row.date || row.Date || row.DATE || row.transactionDate || row.TransactionDate || row.TRANSACTION_DATE;
      const descriptionField = row.description || row.Description || row.DESCRIPTION || row.narrative || row.Narrative || row.NARRATIVE;
      const amountField = row.amount || row.Amount || row.AMOUNT || row.debit || row.Debit || row.DEBIT || row.credit || row.Credit || row.CREDIT;
      const referenceField = row.reference || row.Reference || row.REFERENCE || row.ref || row.Ref || row.REF;

      if (!dateField || !descriptionField || !amountField) {
        return null;
      }

      // Parse date
      const transactionDate = new Date(dateField);
      if (isNaN(transactionDate.getTime())) {
        return null;
      }

      // Parse amount
      const amountStr = amountField.toString().replace(/[^\d.-]/g, '');
      const amount = new Decimal(amountStr);
      if (amount.isNaN()) {
        return null;
      }

      return {
        transactionDate,
        description: descriptionField.toString().trim(),
        amount,
        reference: referenceField ? referenceField.toString().trim() : undefined
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

      // Update reconciliation with transaction count
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