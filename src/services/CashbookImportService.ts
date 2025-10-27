// @ts-nocheck
// Cashbook Import Service with Firebase Storage Integration
// Handles CSV file uploads, processing, and cashbook transaction creation

import { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/database';
import FirebaseStorageService from './FirebaseStorageService';
import { Decimal } from '@prisma/client/runtime/library';

export interface ImportTransaction {
  date: string;
  type: 'RECEIPT' | 'PAYMENT';
  description: string;
  amount: number;
  reference?: string;
  bank: string;
  contraAccount: string;
  vatCode?: string;
  project?: string;
  customer?: string;
  supplier?: string;
}

export interface ImportResult {
  batchId: string;
  totalRecords: number;
  validRecords: number;
  errorRecords: number;
  transactions: any[];
  errors: ImportError[];
}

export interface ImportError {
  rowNumber: number;
  fieldName: string;
  errorMessage: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

export class CashbookImportService {
  
  /**
   * Upload and process CSV import file
   */
  static async processImportFile(
    file: Buffer,
    fileName: string,
    userId: string,
    mappings: any = {}
  ): Promise<ImportResult> {
    try {
      console.log(`📥 Processing import file: ${fileName}`);
      
      // 1. Create import batch record
      const batch = await prisma.cashbookImportBatch.create({
        data: {
          fileName: fileName,
          fileSize: file.length,
          status: 'PROCESSING',
          totalRecords: 0,
          validRecords: 0,
          errorRecords: 0,
          createdById: userId
        }
      });
      
      console.log(`✅ Created import batch: ${batch.id}`);
      
      // 2. Upload file to Firebase Storage
      const { filePath, downloadURL } = await FirebaseStorageService.uploadImportFile(
        file,
        fileName,
        batch.id,
        userId
      );
      
      // 3. Update batch with file path
      await prisma.cashbookImportBatch.update({
        where: { id: batch.id },
        data: { filePath: filePath }
      });
      
      // 4. Parse CSV data
      const csvData = file.toString('utf8');
      const transactions = await this.parseCSV(csvData, mappings);
      
      console.log(`📊 Parsed ${transactions.length} transactions from CSV`);
      
      // 5. Validate transactions
      const validationResult = await this.validateTransactions(transactions);
      
      // 6. Process valid transactions
      const processedTransactions = await this.processTransactions(
        validationResult.validTransactions,
        batch.id,
        userId
      );
      
      // 7. Update batch status
      await prisma.cashbookImportBatch.update({
        where: { id: batch.id },
        data: {
          status: validationResult.errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
          totalRecords: transactions.length,
          validRecords: validationResult.validTransactions.length,
          errorRecords: validationResult.errors.length
        }
      });
      
      // 8. Store errors
      if (validationResult.errors.length > 0) {
        await this.storeImportErrors(batch.id, validationResult.errors);
      }
      
      console.log(`✅ Import completed: ${validationResult.validTransactions.length} valid, ${validationResult.errors.length} errors`);
      
      return {
        batchId: batch.id,
        totalRecords: transactions.length,
        validRecords: validationResult.validTransactions.length,
        errorRecords: validationResult.errors.length,
        transactions: processedTransactions,
        errors: validationResult.errors
      };
      
    } catch (error: any) {
      console.error('❌ Error processing import file:', error.message);
      throw new Error(`Import failed: ${error.message}`);
    }
  }
  
  /**
   * Parse CSV data into transaction objects
   */
  static async parseCSV(csvData: string, mappings: any): Promise<ImportTransaction[]> {
    try {
      const lines = csvData.split('\n').filter(line => line.trim());
      const transactions: ImportTransaction[] = [];
      
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
        
        const transaction: ImportTransaction = {
          date: columns[0] || '',
          type: (columns[1] || '').toUpperCase() as 'RECEIPT' | 'PAYMENT',
          description: columns[2] || '',
          amount: parseFloat(columns[3] || '0'),
          reference: columns[4] || undefined,
          bank: columns[5] || '',
          contraAccount: columns[6] || '',
          vatCode: columns[7] || '15%',
          project: columns[8] || undefined,
          customer: columns[9] || undefined,
          supplier: columns[10] || undefined
        };
        
        transactions.push(transaction);
      }
      
      return transactions;
      
    } catch (error: any) {
      console.error('❌ Error parsing CSV:', error.message);
      throw new Error(`CSV parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Validate imported transactions
   */
  static async validateTransactions(transactions: ImportTransaction[]): Promise<{
    validTransactions: ImportTransaction[];
    errors: ImportError[];
  }> {
    const validTransactions: ImportTransaction[] = [];
    const errors: ImportError[] = [];
    
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const rowNumber = i + 2; // +2 because CSV has header and 0-based index
      const transactionErrors: ImportError[] = [];
      
      // Validate date
      if (!transaction.date || isNaN(Date.parse(transaction.date))) {
        transactionErrors.push({
          rowNumber,
          fieldName: 'date',
          errorMessage: 'Invalid date format',
          severity: 'ERROR'
        });
      }
      
      // Validate type
      if (!['RECEIPT', 'PAYMENT'].includes(transaction.type)) {
        transactionErrors.push({
          rowNumber,
          fieldName: 'type',
          errorMessage: 'Type must be RECEIPT or PAYMENT',
          severity: 'ERROR'
        });
      }
      
      // Validate amount
      if (!transaction.amount || transaction.amount <= 0) {
        transactionErrors.push({
          rowNumber,
          fieldName: 'amount',
          errorMessage: 'Amount must be greater than 0',
          severity: 'ERROR'
        });
      }
      
      // Validate bank account
      const bank = await prisma.bank.findFirst({
        where: { 
          OR: [
            { name: { contains: transaction.bank } },
            { accountNumber: { contains: transaction.bank } }
          ]
        }
      });
      
      if (!bank) {
        transactionErrors.push({
          rowNumber,
          fieldName: 'bank',
          errorMessage: `Bank account not found: ${transaction.bank}`,
          severity: 'ERROR'
        });
      }
      
      // Validate contra account
      const contraAccount = await prisma.chartOfAccounts.findFirst({
        where: { accountNo: transaction.contraAccount }
      });
      
      if (!contraAccount) {
        transactionErrors.push({
          rowNumber,
          fieldName: 'contraAccount',
          errorMessage: `GL account not found: ${transaction.contraAccount}`,
          severity: 'ERROR'
        });
      }
      
      // Validate VAT code
      if (transaction.vatCode && !['15%', '0%', 'EXEMPT'].includes(transaction.vatCode)) {
        transactionErrors.push({
          rowNumber,
          fieldName: 'vatCode',
          errorMessage: 'VAT code must be 15%, 0%, or EXEMPT',
          severity: 'WARNING'
        });
      }
      
      if (transactionErrors.length === 0) {
        validTransactions.push(transaction);
      } else {
        errors.push(...transactionErrors);
      }
    }
    
    return { validTransactions, errors };
  }
  
  /**
   * Process valid transactions and create cashbook entries
   */
  static async processTransactions(
    transactions: ImportTransaction[],
    batchId: string,
    userId: string
  ): Promise<any[]> {
    const processedTransactions = [];
    
    for (const transaction of transactions) {
      try {
        // Get bank account
        const bank = await prisma.bank.findFirst({
          where: { 
            OR: [
              { name: { contains: transaction.bank } },
              { accountNumber: { contains: transaction.bank } }
            ]
          }
        });
        
        // Get contra account
        const contraAccount = await prisma.chartOfAccounts.findFirst({
          where: { accountNo: transaction.contraAccount }
        });
        
        // Calculate VAT
        const vatRate = transaction.vatCode === '15%' ? 0.15 : 0;
        const vatAmount = transaction.amount * vatRate;
        const netAmount = transaction.amount - vatAmount;
        
        // Create cashbook transaction
        const cashbookTransaction = await prisma.cashbookTransaction.create({
          data: {
            bankId: bank!.id,
            transactionDate: new Date(transaction.date),
            transactionType: transaction.type,
            totalAmount: new Decimal(transaction.amount),
            reference: transaction.reference,
            description: transaction.description,
            status: 'DRAFT',
            counterpartyType: transaction.customer ? 'CUSTOMER' : 
                            transaction.supplier ? 'SUPPLIER' : 'GL',
            glAccountId: contraAccount!.id,
            customerId: transaction.customer,
            vendorId: transaction.supplier,
            createdById: userId
          }
        });
        
        // Create cashbook line item
        await prisma.cashbookLineItem.create({
          data: {
            transactionId: cashbookTransaction.id,
            contraGlAccountId: contraAccount!.id,
            amount: new Decimal(transaction.amount),
            vatCodeId: transaction.vatCode || '15%',
            vatAmount: new Decimal(vatAmount),
            netAmount: new Decimal(netAmount),
            debtorCreditorId: transaction.customer || transaction.supplier,
            description: transaction.description
          }
        });
        
        processedTransactions.push(cashbookTransaction);
        
      } catch (error: any) {
        console.error(`❌ Error processing transaction:`, error.message);
      }
    }
    
    return processedTransactions;
  }
  
  /**
   * Store import errors in database
   */
  static async storeImportErrors(batchId: string, errors: ImportError[]): Promise<void> {
    try {
      await prisma.cashbookImportError.createMany({
        data: errors.map(error => ({
          batchId: batchId,
          rowNumber: error.rowNumber,
          fieldName: error.fieldName,
          errorType: 'VALIDATION',
          errorMessage: error.errorMessage,
          severity: error.severity
        }))
      });
    } catch (error: any) {
      console.error('❌ Error storing import errors:', error.message);
    }
  }
  
  /**
   * Get import batch details
   */
  static async getImportBatch(batchId: string): Promise<any> {
    try {
      const batch = await prisma.cashbookImportBatch.findUnique({
        where: { id: batchId },
        include: {
          transactions: true,
          importErrors: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });
      
      return batch;
    } catch (error: any) {
      console.error('❌ Error getting import batch:', error.message);
      throw new Error(`Failed to get import batch: ${error.message}`);
    }
  }
  
  /**
   * Clean up old import files
   */
  static async cleanupOldImports(userId: string, daysOld: number = 7): Promise<void> {
    try {
      console.log(`🧹 Cleaning up imports older than ${daysOld} days`);
      
      // Clean up Firebase Storage files
      await FirebaseStorageService.cleanupOldImportFiles(userId, daysOld);
      
      // Clean up database records
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      await prisma.cashbookImportBatch.deleteMany({
        where: {
          createdById: userId,
          createdAt: { lt: cutoffDate }
        }
      });
      
      console.log(`✅ Cleanup completed`);
      
    } catch (error: any) {
      console.error('❌ Error cleaning up imports:', error.message);
    }
  }
}

export default CashbookImportService;


