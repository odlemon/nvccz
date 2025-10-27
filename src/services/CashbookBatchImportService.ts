// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// const prisma = dbConnection.getPrismaClient(); // Moved inside methods

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAjxju0tSJoLtKnwOVqLRTMkVkpZ_iEstw",
  authDomain: "otcebp.firebaseapp.com",
  projectId: "otcebp",
  storageBucket: "otcebp.appspot.com",
  messagingSenderId: "904504797201",
  appId: "1:904504797201:web:091e69c41ba296362fe9b0",
  measurementId: "G-RS3VTZWQ3D"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export interface CSVTransaction {
  bankId: string;
  transactionDate: string;
  description: string;
  amount: number;
  reference: string;
  counterpartyType: 'CUSTOMER' | 'SUPPLIER' | 'GL';
  customerId?: string;
  vendorId?: string;
  glAccountId?: string;
  vatCode?: string;
  projectCode?: string;
  discount?: number;
}

export interface BatchImportResult {
  batchId: string;
  totalTransactions: number;
  validTransactions: number;
  invalidTransactions: number;
  errors: string[];
  fileUrl: string;
}

export class CashbookBatchImportService {
  
  /**
   * Import CSV file and create batch
   * POST /api/cashbook/batches/import
   */
  static async importCSV(file: Buffer, fileName: string, userId: string): Promise<BatchImportResult> {
    try {
      console.log(`📁 Processing CSV import: ${fileName}`);
      
      // 1. Upload file to Firebase
      const fileRef = ref(storage, `cashbook-imports/${Date.now()}-${fileName}`);
      const uploadResult = await uploadBytes(fileRef, file);
      const fileUrl = await getDownloadURL(uploadResult.ref);
      
      console.log(`✅ File uploaded to Firebase: ${fileUrl}`);
      
      // 2. Parse CSV content
      const csvContent = file.toString('utf-8');
      const transactions = this.parseCSV(csvContent);
      
      console.log(`📊 Parsed ${transactions.length} transactions from CSV`);
      
      // 3. Validate transactions
      const validationResult = await this.validateTransactions(transactions);
      
      // 4. Create batch
      const batch = await prisma.cashbookBatch.create({
        data: {
          name: `CSV Import - ${new Date().toISOString().split('T')[0]}`,
          description: `Imported from ${fileName}`,
          status: 'PENDING',
          totalAmount: new Decimal(0), // Will be calculated
          createdById: userId,
          importFileUrl: fileUrl
        }
      });
      
      // 5. Create cashbook entries for valid transactions
      let validCount = 0;
      for (const transaction of validationResult.validTransactions) {
        try {
          await prisma.cashbookEntry.create({
            data: {
              bankId: transaction.bankId,
              transactionDate: new Date(transaction.transactionDate),
              type: transaction.counterpartyType === 'CUSTOMER' ? 'RECEIPT' : 'PAYMENT',
              amount: new Decimal(transaction.amount),
              reference: transaction.reference,
              description: transaction.description,
              status: 'PENDING',
              counterpartyType: transaction.counterpartyType,
              glAccountId: transaction.glAccountId,
              customerId: transaction.customerId,
              vendorId: transaction.vendorId,
              batchId: batch.id,
              createdById: userId
            }
          });
          validCount++;
        } catch (error) {
          console.error(`❌ Error creating transaction: ${error.message}`);
        }
      }
      
      // 6. Update batch with final counts
      await prisma.cashbookBatch.update({
        where: { id: batch.id },
        data: {
          totalAmount: new Decimal(
            validationResult.validTransactions.reduce((sum, t) => sum + t.amount, 0)
          )
        }
      });
      
      console.log(`✅ Batch created: ${batch.id} with ${validCount} valid transactions`);
      
      return {
        batchId: batch.id,
        totalTransactions: transactions.length,
        validTransactions: validCount,
        invalidTransactions: validationResult.errors.length,
        errors: validationResult.errors,
        fileUrl
      };
      
    } catch (error: any) {
      console.error('❌ Error importing CSV:', error.message);
      throw error;
    }
  }
  
  /**
   * Parse CSV content into transaction objects
   */
  private static parseCSV(csvContent: string): CSVTransaction[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    const transactions: CSVTransaction[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values.length !== headers.length) continue;
      
      const transaction: CSVTransaction = {
        bankId: values[0] || '',
        transactionDate: values[1] || '',
        description: values[2] || '',
        amount: parseFloat(values[3]) || 0,
        reference: values[4] || '',
        counterpartyType: (values[5] as any) || 'GL',
        customerId: values[6] || undefined,
        vendorId: values[7] || undefined,
        glAccountId: values[8] || undefined,
        vatCode: values[9] || '15%',
        projectCode: values[10] || undefined,
        discount: parseFloat(values[11]) || 0
      };
      
      transactions.push(transaction);
    }
    
    return transactions;
  }
  
  /**
   * Validate all transactions
   */
  private static async validateTransactions(transactions: CSVTransaction[]): Promise<{
    validTransactions: CSVTransaction[];
    errors: string[];
  }> {
    const validTransactions: CSVTransaction[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const rowNumber = i + 2; // +2 because CSV is 1-indexed and we skip header
      
      try {
        // Validate required fields
        if (!transaction.bankId) {
          errors.push(`Row ${rowNumber}: Bank ID is required`);
          continue;
        }
        
        if (!transaction.transactionDate) {
          errors.push(`Row ${rowNumber}: Transaction date is required`);
          continue;
        }
        
        if (!transaction.description) {
          errors.push(`Row ${rowNumber}: Description is required`);
          continue;
        }
        
        if (!transaction.amount || transaction.amount <= 0) {
          errors.push(`Row ${rowNumber}: Valid amount is required`);
          continue;
        }
        
        // Validate bank exists
        const bank = await prisma.bank.findUnique({
          where: { id: transaction.bankId }
        });
        
        if (!bank) {
          errors.push(`Row ${rowNumber}: Bank account not found`);
          continue;
        }
        
        // Validate counterparty
        if (transaction.counterpartyType === 'CUSTOMER' && transaction.customerId) {
          const customer = await prisma.customer.findUnique({
            where: { id: transaction.customerId }
          });
          if (!customer) {
            errors.push(`Row ${rowNumber}: Customer not found`);
            continue;
          }
        }
        
        if (transaction.counterpartyType === 'SUPPLIER' && transaction.vendorId) {
          const vendor = await prisma.vendor.findUnique({
            where: { id: transaction.vendorId }
          });
          if (!vendor) {
            errors.push(`Row ${rowNumber}: Vendor not found`);
            continue;
          }
        }
        
        if (transaction.counterpartyType === 'GL' && transaction.glAccountId) {
          const glAccount = await prisma.chartOfAccounts.findUnique({
            where: { id: transaction.glAccountId }
          });
          if (!glAccount) {
            errors.push(`Row ${rowNumber}: GL account not found`);
            continue;
          }
        }
        
        validTransactions.push(transaction);
        
      } catch (error: any) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }
    
    return { validTransactions, errors };
  }
  
  /**
   * Post batch to GL (SRD-compliant batch posting)
   */
  static async postBatch(batchId: string, userId: string): Promise<any> {
    try {
      console.log(`📤 Posting batch: ${batchId}`);
      
      // 1. Get batch with all transactions
      const batch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: {
          transactions: {
            where: { status: 'DRAFT' }
          }
        }
      });
      
      if (!batch) {
        throw new Error('Batch not found');
      }
      
      if (batch.status === 'POSTED') {
        throw new Error('Batch already posted');
      }
      
      // 2. Create journal entries for all transactions
      for (const transaction of batch.transactions) {
        // Create journal entry (reuse existing logic)
        const journalEntry = await this.createJournalEntry(transaction, userId);
        
        // Update transaction status
        await prisma.cashbookEntry.update({
          where: { id: transaction.id },
          data: {
            status: 'POSTED',
            journalEntryId: journalEntry.id
          }
        });
      }
      
      // 3. Update batch status
      await prisma.cashbookBatch.update({
        where: { id: batchId },
        data: { status: 'POSTED' }
      });
      
      console.log(`✅ Batch posted successfully: ${batchId}`);
      
      return {
        batchId,
        totalTransactions: batch.transactions.length,
        status: 'POSTED'
      };
      
    } catch (error: any) {
      console.error('❌ Error posting batch:', error.message);
      throw error;
    }
  }
  
  /**
   * Create journal entry for transaction
   */
  private static async createJournalEntry(transaction: any, userId: string): Promise<any> {
    const referenceNumber = `CB-${transaction.id.substring(transaction.id.length - 8).toUpperCase()}`;
    
    // Fetch bank details
    const bank = await prisma.bank.findUnique({
      where: { id: transaction.bankId },
      include: { currency: true }
    });
    
    if (!bank) {
      throw new Error('Bank account not found');
    }
    
    const journalEntry = await prisma.journalEntry.create({
      data: {
        transactionDate: transaction.transactionDate,
        referenceNumber,
        description: `Cashbook ${transaction.type}: ${transaction.description}`,
        totalAmount: transaction.amount,
        currencyId: bank.currency.id,
        status: 'POSTED',
        createdById: userId
      }
    });
    
    // Create journal entry lines for double-entry accounting
    if (transaction.type === 'RECEIPT') {
      // Receipt: Dr. Bank, Cr. Customer/GL Account
      
      // 1. Debit Bank Account
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccountId,
          debitAmount: transaction.amount,
          creditAmount: new Decimal(0),
          description: `Bank receipt: ${transaction.description}`
        }
      });
      
      // 2. Credit Customer/GL Account
      let contraAccountId: string;
      if (transaction.counterpartyType === 'CUSTOMER' && transaction.customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: transaction.customerId }
        });
        contraAccountId = customer?.glAccountId || '';
      } else if (transaction.counterpartyType === 'GL' && transaction.glAccountId) {
        contraAccountId = transaction.glAccountId;
      } else {
        throw new Error('Invalid counterparty for receipt');
      }
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: contraAccountId,
          debitAmount: new Decimal(0),
          creditAmount: transaction.amount,
          description: `Receipt from: ${transaction.description}`
        }
      });
      
    } else if (transaction.type === 'PAYMENT') {
      // Payment: Dr. Supplier/GL Account, Cr. Bank
      
      // 1. Debit Supplier/GL Account
      let contraAccountId: string;
      if (transaction.counterpartyType === 'SUPPLIER' && transaction.vendorId) {
        const vendor = await prisma.vendor.findUnique({
          where: { id: transaction.vendorId }
        });
        contraAccountId = vendor?.glAccountId || '';
      } else if (transaction.counterpartyType === 'GL' && transaction.glAccountId) {
        contraAccountId = transaction.glAccountId;
      } else {
        throw new Error('Invalid counterparty for payment');
      }
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: contraAccountId,
          debitAmount: transaction.amount,
          creditAmount: new Decimal(0),
          description: `Payment to: ${transaction.description}`
        }
      });
      
      // 2. Credit Bank Account
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccountId,
          debitAmount: new Decimal(0),
          creditAmount: transaction.amount,
          description: `Bank payment: ${transaction.description}`
        }
      });
    }
    
    return journalEntry;
  }
  
  /**
   * Get batch details with transactions
   */
  static async getBatchDetails(batchId: string): Promise<any> {
    const batch = await prisma.cashbookBatch.findUnique({
      where: { id: batchId },
      include: {
        transactions: {
          include: {
            bank: true,
            customer: true,
            vendor: true,
            glAccount: true
          }
        }
      }
    });
    
    if (!batch) {
      throw new Error('Batch not found');
    }
    
    return batch;
  }
  
  /**
   * List all batches with pagination and filtering
   */
  static async listBatches(
    page: number = 1,
    limit: number = 10,
    status?: string,
    userId?: string
  ): Promise<{
    batches: any[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const whereClause: any = {};
      if (status) {
        whereClause.status = status;
      }
      if (userId) {
        whereClause.createdById = userId;
      }
      
      const [batches, totalCount] = await Promise.all([
        prisma.cashbookBatch.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            transactions: {
              select: {
                id: true,
                type: true,
                amount: true,
                description: true,
                status: true
              }
            },
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }),
        prisma.cashbookBatch.count({ where: whereClause })
      ]);
      
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        batches,
        totalCount,
        totalPages,
        currentPage: page
      };
      
    } catch (error: any) {
      console.error('❌ Error listing batches:', error.message);
      throw new Error(`Failed to list batches: ${error.message}`);
    }
  }
  
  /**
   * Update batch details
   */
  static async updateBatch(
    batchId: string,
    updateData: {
      name?: string;
      description?: string;
      status?: string;
    },
    userId: string
  ): Promise<any> {
    try {
      // Check if batch exists and user has permission
      const existingBatch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId }
      });
      
      if (!existingBatch) {
        throw new Error('Batch not found');
      }
      
      if (existingBatch.createdById !== userId) {
        throw new Error('You do not have permission to update this batch');
      }
      
      if (existingBatch.status === 'POSTED') {
        throw new Error('Cannot update a posted batch');
      }
      
      const updatedBatch = await prisma.cashbookBatch.update({
        where: { id: batchId },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: {
          transactions: {
            include: {
              bank: true,
              customer: true,
              vendor: true,
              glAccount: true
            }
          }
        }
      });
      
      console.log(`✅ Batch updated: ${batchId}`);
      return updatedBatch;
      
    } catch (error: any) {
      console.error('❌ Error updating batch:', error.message);
      throw new Error(`Failed to update batch: ${error.message}`);
    }
  }
  
  /**
   * Delete batch (only if not posted)
   */
  static async deleteBatch(batchId: string, userId: string): Promise<any> {
    try {
      // Check if batch exists and user has permission
      const existingBatch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: { transactions: true }
      });
      
      if (!existingBatch) {
        throw new Error('Batch not found');
      }
      
      if (existingBatch.createdById !== userId) {
        throw new Error('You do not have permission to delete this batch');
      }
      
      if (existingBatch.status === 'POSTED') {
        throw new Error('Cannot delete a posted batch');
      }
      
      // Delete all transactions first
      await prisma.cashbookEntry.deleteMany({
        where: { batchId: batchId }
      });
      
      // Delete the batch
      await prisma.cashbookBatch.delete({
        where: { id: batchId }
      });
      
      console.log(`✅ Batch deleted: ${batchId}`);
      return { success: true, message: 'Batch deleted successfully' };
      
    } catch (error: any) {
      console.error('❌ Error deleting batch:', error.message);
      throw new Error(`Failed to delete batch: ${error.message}`);
    }
  }

  /**
   * Export batch to CSV format
   */
  static async exportBatch(batchId: string, userId: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      // Get batch with all transactions and related data
      const batch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: {
          createdBy: true,
          transactions: {
            include: {
              bank: true,
              customer: true,
              vendor: true,
              glAccount: true
            }
          }
        }
      });

      if (!batch) {
        return { success: false, message: 'Batch not found' };
      }

      // Check if user has permission to view this batch
      if (batch.createdById !== userId) {
        return { success: false, message: 'You can only export batches you created' };
      }

      // Convert transactions to CSV format
      const csvData = batch.transactions.map(transaction => ({
        bankId: transaction.bankId,
        transactionDate: transaction.transactionDate.toISOString().split('T')[0],
        description: transaction.description || '',
        amount: transaction.amount.toString(),
        reference: transaction.reference || '',
        counterpartyType: transaction.counterpartyType,
        customerId: transaction.customerId || '',
        vendorId: transaction.vendorId || '',
        glAccountId: transaction.glAccountId || '',
        vatCode: transaction.vatCode || '',
        projectCode: transaction.projectCode || '',
        discount: transaction.discount?.toString() || '0',
        status: transaction.status,
        type: transaction.type
      }));

      // Create CSV content
      const headers = [
        'bankId',
        'transactionDate', 
        'description',
        'amount',
        'reference',
        'counterpartyType',
        'customerId',
        'vendorId',
        'glAccountId',
        'vatCode',
        'projectCode',
        'discount',
        'status',
        'type'
      ];

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => {
            const value = row[header] || '';
            // Escape commas and quotes in CSV
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
      ].join('\n');

      // Upload to Firebase Storage
      const fileName = `batch-export-${batchId}-${Date.now()}.csv`;
      const storageRef = ref(storage, `cashbook-exports/${fileName}`);
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      
      await uploadBytes(storageRef, csvBlob);
      const downloadUrl = await getDownloadURL(storageRef);

      console.log(`✅ Batch exported: ${batchId}`);
      return {
        success: true,
        data: {
          batchId: batch.id,
          batchName: batch.name,
          totalTransactions: batch.transactions.length,
          exportUrl: downloadUrl,
          fileName: fileName,
          exportedAt: new Date().toISOString(),
          csvContent: csvContent // Include for immediate download
        },
        message: 'Batch exported successfully'
      };

    } catch (error: any) {
      console.error('❌ Error exporting batch:', error.message);
      return { success: false, message: `Failed to export batch: ${error.message}` };
    }
  }

  /**
   * Export all batches for a user
   */
  static async exportAllBatches(userId: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      // Get all batches for the user
      const batches = await prisma.cashbookBatch.findMany({
        where: { createdById: userId },
        include: {
          transactions: {
            include: {
              bank: true,
              customer: true,
              vendor: true,
              glAccount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (batches.length === 0) {
        return { success: false, message: 'No batches found to export' };
      }

      // Combine all transactions from all batches
      const allTransactions = batches.flatMap(batch => 
        batch.transactions.map(transaction => ({
          batchId: batch.id,
          batchName: batch.name,
          batchStatus: batch.status,
          batchCreatedAt: batch.createdAt.toISOString(),
          bankId: transaction.bankId,
          transactionDate: transaction.transactionDate.toISOString().split('T')[0],
          description: transaction.description || '',
          amount: transaction.amount.toString(),
          reference: transaction.reference || '',
          counterpartyType: transaction.counterpartyType,
          customerId: transaction.customerId || '',
          vendorId: transaction.vendorId || '',
          glAccountId: transaction.glAccountId || '',
          vatCode: transaction.vatCode || '',
          projectCode: transaction.projectCode || '',
          discount: transaction.discount?.toString() || '0',
          status: transaction.status,
          type: transaction.type
        }))
      );

      // Create CSV content
      const headers = [
        'batchId',
        'batchName',
        'batchStatus',
        'batchCreatedAt',
        'bankId',
        'transactionDate', 
        'description',
        'amount',
        'reference',
        'counterpartyType',
        'customerId',
        'vendorId',
        'glAccountId',
        'vatCode',
        'projectCode',
        'discount',
        'status',
        'type'
      ];

      const csvContent = [
        headers.join(','),
        ...allTransactions.map(row => 
          headers.map(header => {
            const value = row[header] || '';
            // Escape commas and quotes in CSV
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
      ].join('\n');

      // Upload to Firebase Storage
      const fileName = `all-batches-export-${userId}-${Date.now()}.csv`;
      const storageRef = ref(storage, `cashbook-exports/${fileName}`);
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      
      await uploadBytes(storageRef, csvBlob);
      const downloadUrl = await getDownloadURL(storageRef);

      console.log(`✅ All batches exported for user: ${userId}`);
      return {
        success: true,
        data: {
          totalBatches: batches.length,
          totalTransactions: allTransactions.length,
          exportUrl: downloadUrl,
          fileName: fileName,
          exportedAt: new Date().toISOString(),
          csvContent: csvContent // Include for immediate download
        },
        message: 'All batches exported successfully'
      };

    } catch (error: any) {
      console.error('❌ Error exporting all batches:', error.message);
      return { success: false, message: `Failed to export batches: ${error.message}` };
    }
  }
}
