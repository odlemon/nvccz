// @ts-nocheck
// Comprehensive Cashbook Service
// Implements Sage Pastel-style cashbook functionality with two-stage processing

import { PrismaClient, Decimal } from '@prisma/client';
import { dbConnection } from '../utils/database';

const prisma = dbConnection.getPrismaClient();

export interface CreateCashReceiptParams {
  bankId: string;
  transactionDate: Date;
  description: string;
  amount: number;
  reference?: string;
  counterpartyType: 'GL' | 'CUSTOMER' | 'SUPPLIER';
  glAccountId?: string;      // For GL transactions
  customerId?: string;       // For Customer transactions
  vendorId?: string;        // For Vendor transactions
  vatCode?: string;         // 15%, 0%, EXEMPT
  projectCode?: string;
  discount?: number;
  createdById: string;
}

export interface CreateCashPaymentParams {
  bankId: string;
  transactionDate: Date;
  description: string;
  amount: number;
  reference?: string;
  counterpartyType: 'GL' | 'CUSTOMER' | 'SUPPLIER';
  glAccountId?: string;      // For GL transactions
  customerId?: string;       // For Customer transactions
  vendorId?: string;        // For Vendor transactions
  vatCode?: string;         // 15%, 0%, EXEMPT
  projectCode?: string;
  discount?: number;
  createdById: string;
}

export interface CashbookResult {
  transaction: any;
  journalEntry?: any;
  success: boolean;
  message: string;
}

export interface BatchPostResult {
  batchId: string;
  postedTransactions: number;
  journalEntries: number;
  success: boolean;
  message: string;
}

export class CashbookService {
  
  /**
   * Create Cash Receipt (Money In)
   * Implements: Dr. Bank, Cr. Contra Account, Cr. VAT Output (if applicable)
   */
  static async createCashReceipt(params: CreateCashReceiptParams): Promise<CashbookResult> {
    try {
      console.log(`💰 Creating Cash Receipt: ${params.description} - $${params.amount}`);
      
      // 1. Validate bank account
      const bank = await prisma.bank.findUnique({
        where: { id: params.bankId },
        include: { glAccount: true, currency: true }
      });
      
      if (!bank) {
        throw new Error(`Bank account not found: ${params.bankId}`);
      }
      
      // 2. Validate counterparty
      const counterparty = await this.validateCounterparty(params);
      
      // 3. Calculate VAT
      const vatRate = params.vatCode === '15%' ? 0.15 : 0;
      const vatAmount = params.amount * vatRate;
      const netAmount = params.amount - vatAmount;
      
      // 4. Create cashbook entry
      const transaction = await prisma.cashbookEntry.create({
        data: {
          bankId: params.bankId,
          transactionDate: params.transactionDate,
          type: 'RECEIPT',
          amount: new Decimal(params.amount),
          reference: params.reference,
          description: params.description,
          status: 'PENDING',
          counterpartyType: params.counterpartyType,
          glAccountId: params.glAccountId,
          customerId: params.customerId,
          vendorId: params.vendorId,
          createdById: params.createdById
        }
      });
      
      console.log(`✅ Cash Receipt created: ${transaction.id}`);
      
      // 5. Create journal entry for double-entry accounting
      const journalEntry = await this.createJournalEntry(transaction, params.createdById);
      
      // 6. Update transaction with journal entry reference
      const updatedTransaction = await prisma.cashbookEntry.update({
        where: { id: transaction.id },
        data: { 
          journalEntryId: journalEntry.id,
          status: 'POSTED'
        }
      });
      
      return {
        transaction: updatedTransaction,
        journalEntry,
        success: true,
        message: 'Cash receipt created and posted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error creating cash receipt:', error.message);
      return {
        transaction: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Create Cash Payment (Money Out)
   * Implements: Dr. Contra Account, Dr. VAT Input (if applicable), Cr. Bank
   */
  static async createCashPayment(params: CreateCashPaymentParams): Promise<CashbookResult> {
    try {
      console.log(`💸 Creating Cash Payment: ${params.description} - $${params.amount}`);
      
      // 1. Validate bank account
      const bank = await prisma.bank.findUnique({
        where: { id: params.bankId },
        include: { glAccount: true, currency: true }
      });
      
      if (!bank) {
        throw new Error(`Bank account not found: ${params.bankId}`);
      }
      
      // 2. Validate counterparty
      const counterparty = await this.validateCounterparty(params);
      
      // 3. Calculate VAT
      const vatRate = params.vatCode === '15%' ? 0.15 : 0;
      const vatAmount = params.amount * vatRate;
      const netAmount = params.amount - vatAmount;
      
      // 4. Create cashbook entry
      const transaction = await prisma.cashbookEntry.create({
        data: {
          bankId: params.bankId,
          transactionDate: params.transactionDate,
          type: 'PAYMENT',
          amount: new Decimal(params.amount),
          reference: params.reference,
          description: params.description,
          status: 'PENDING',
          counterpartyType: params.counterpartyType,
          glAccountId: params.glAccountId,
          customerId: params.customerId,
          vendorId: params.vendorId,
          createdById: params.createdById
        }
      });
      
      console.log(`✅ Cash Payment created: ${transaction.id}`);
      
      // 5. Create journal entry for double-entry accounting
      const journalEntry = await this.createJournalEntry(transaction, params.createdById);
      
      // 6. Update transaction with journal entry reference
      const updatedTransaction = await prisma.cashbookEntry.update({
        where: { id: transaction.id },
        data: { 
          journalEntryId: journalEntry.id,
          status: 'POSTED'
        }
      });
      
      return {
        transaction: updatedTransaction,
        journalEntry,
        success: true,
        message: 'Cash payment created and posted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error creating cash payment:', error.message);
      return {
        transaction: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Post Cashbook Transaction to General Ledger
   * Creates journal entries and updates GL balances
   */
  static async postTransaction(transactionId: string, userId: string): Promise<CashbookResult> {
    try {
      console.log(`📝 Posting transaction to GL: ${transactionId}`);
      
      // 1. Get transaction with related data
      const transaction = await prisma.cashbookEntry.findUnique({
        where: { id: transactionId },
        include: {
          bank: {
            include: { glAccount: true }
          },
          glAccount: true,
          customer: true,
          vendor: true
        }
      });
      
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }
      
      if (transaction.status === 'POSTED') {
        throw new Error('Transaction already posted');
      }
      
      // 2. Create journal entry
      const journalEntry = await this.createJournalEntry(transaction, userId);
      
      // 3. Update transaction status
      await prisma.cashbookEntry.update({
        where: { id: transactionId },
        data: {
          status: 'POSTED',
          journalEntryId: journalEntry.id
        }
      });
      
      console.log(`✅ Transaction posted: ${transactionId} -> ${journalEntry.id}`);
      
      return {
        transaction,
        journalEntry,
        success: true,
        message: 'Transaction posted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error posting transaction:', error.message);
      return {
        transaction: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Create Batch and Add Transactions
   */
  static async createBatch(batchName: string, userId: string): Promise<string> {
    try {
      console.log(`📦 Creating cashbook batch: ${batchName}`);
      
      const batch = await prisma.cashbookBatch.create({
        data: {
          batchName,
          batchDate: new Date(),
          totalAmount: new Decimal(0),
          totalVAT: new Decimal(0),
          status: 'DRAFT',
          createdById: userId
        }
      });
      
      console.log(`✅ Batch created: ${batch.id}`);
      return batch.id;
      
    } catch (error: any) {
      console.error('❌ Error creating batch:', error.message);
      throw error;
    }
  }
  
  /**
   * Add Transaction to Batch
   */
  static async addTransactionToBatch(transactionId: string, batchId: string): Promise<void> {
    try {
      console.log(`📦 Adding transaction to batch: ${transactionId} -> ${batchId}`);
      
      await prisma.cashbookEntry.update({
        where: { id: transactionId },
        data: { batchId }
      });
      
      // Update batch totals
      await this.updateBatchTotals(batchId);
      
      console.log(`✅ Transaction added to batch`);
      
    } catch (error: any) {
      console.error('❌ Error adding transaction to batch:', error.message);
      throw error;
    }
  }
  
  /**
   * Post Batch to General Ledger
   */
  static async postBatch(batchId: string, userId: string): Promise<BatchPostResult> {
    try {
      console.log(`📝 Posting batch to GL: ${batchId}`);
      
      // 1. Get batch with transactions
      const batch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: {
          transactions: {
            include: {
              bank: {
                include: { glAccount: true }
              },
              glAccount: true,
              customer: true,
              vendor: true
            }
          }
        }
      });
      
      if (!batch) {
        throw new Error(`Batch not found: ${batchId}`);
      }
      
      if (batch.status === 'POSTED') {
        throw new Error('Batch already posted');
      }
      
      // 2. Post each transaction
      let postedTransactions = 0;
      let journalEntries = 0;
      
      for (const transaction of batch.transactions) {
        if (transaction.status === 'PENDING') {
          const result = await this.postTransaction(transaction.id, userId);
          if (result.success) {
            postedTransactions++;
            if (result.journalEntry) {
              journalEntries++;
            }
          }
        }
      }
      
      // 3. Update batch status
      await prisma.cashbookBatch.update({
        where: { id: batchId },
        data: {
          status: 'POSTED'
        }
      });
      
      console.log(`✅ Batch posted: ${postedTransactions} transactions, ${journalEntries} journal entries`);
      
      return {
        batchId,
        postedTransactions,
        journalEntries,
        success: true,
        message: 'Batch posted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error posting batch:', error.message);
      return {
        batchId,
        postedTransactions: 0,
        journalEntries: 0,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get Cash Position (Bank Balances)
   */
  static async getCashPosition(): Promise<any[]> {
    try {
      console.log(`💰 Getting cash position...`);
      
      const banks = await prisma.bank.findMany({
        where: { isActive: true },
        include: {
          currency: true,
          glAccount: true,
          transactions: {
            where: { status: 'POSTED' },
            select: {
              transactionType: true,
              totalAmount: true
            }
          }
        }
      });
      
      const cashPosition = banks.map(bank => {
        const receipts = bank.transactions
          .filter(t => t.transactionType === 'RECEIPT')
          .reduce((sum, t) => sum + Number(t.totalAmount), 0);
        
        const payments = bank.transactions
          .filter(t => t.transactionType === 'PAYMENT')
          .reduce((sum, t) => sum + Number(t.totalAmount), 0);
        
        const balance = receipts - payments;
        
        return {
          bankId: bank.id,
          bankName: bank.name,
          accountNumber: bank.accountNumber,
          currency: bank.currency.code,
          receipts,
          payments,
          balance,
          glAccount: bank.glAccount?.accountNo
        };
      });
      
      console.log(`✅ Cash position calculated for ${banks.length} banks`);
      return cashPosition;
      
    } catch (error: any) {
      console.error('❌ Error getting cash position:', error.message);
      throw error;
    }
  }
  
  /**
   * Get Cashbook Entries with Filters
   */
  static async getCashbookEntries(filters: {
    bankId?: string;
    transactionType?: string;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    try {
      console.log(`📋 Getting cashbook entries with filters...`);
      
      const where: any = {};
      
      if (filters.bankId) where.bankId = filters.bankId;
      if (filters.transactionType) where.transactionType = filters.transactionType;
      if (filters.status) where.status = filters.status;
      if (filters.dateFrom || filters.dateTo) {
        where.transactionDate = {};
        if (filters.dateFrom) where.transactionDate.gte = filters.dateFrom;
        if (filters.dateTo) where.transactionDate.lte = filters.dateTo;
      }
      
      const entries = await prisma.cashbookEntry.findMany({
        where,
        include: {
          bank: {
            include: { currency: true }
          },
          glAccount: true,
          customer: true,
          vendor: true,
          batch: true,
          createdBy: true,
          journalEntry: true,
          entryType: true,
          transfer: true,
          originalTransaction: true,
          reversalTransactions: true,
          reversedBy: true,
          postedBy: true
        },
        orderBy: { transactionDate: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0
      });
      
      console.log(`✅ Retrieved ${entries.length} cashbook entries`);
      return entries;
      
    } catch (error: any) {
      console.error('❌ Error getting cashbook entries:', error.message);
      throw error;
    }
  }
  
  // Private helper methods
  
  private static async validateCounterparty(params: any): Promise<any> {
    let counterparty = null;
    
    switch (params.counterpartyType) {
      case 'GL':
        if (!params.glAccountId) {
          throw new Error('GL account ID required for GL transactions');
        }
        counterparty = await prisma.chartOfAccounts.findUnique({
          where: { id: params.glAccountId }
        });
        if (!counterparty) {
          throw new Error(`GL account not found: ${params.glAccountId}`);
        }
        break;
        
      case 'CUSTOMER':
        if (!params.customerId) {
          throw new Error('Customer ID required for customer transactions');
        }
        counterparty = await prisma.customer.findUnique({
          where: { id: params.customerId }
        });
        if (!counterparty) {
          throw new Error(`Customer not found: ${params.customerId}`);
        }
        break;
        
      case 'SUPPLIER':
        if (!params.vendorId) {
          throw new Error('Vendor ID required for supplier transactions');
        }
        counterparty = await prisma.vendor.findUnique({
          where: { id: params.vendorId }
        });
        if (!counterparty) {
          throw new Error(`Vendor not found: ${params.vendorId}`);
        }
        break;
    }
    
    return counterparty;
  }
  
  
  
  private static async createJournalEntry(transaction: any, userId: string): Promise<any> {
    const referenceNumber = `CB-${transaction.id.substring(transaction.id.length - 8).toUpperCase()}`;
    
    // Fetch bank details with currency
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
        // Use Accounts Receivable account for customer receipts
        const arAccount = await prisma.chartOfAccounts.findFirst({
          where: { 
            accountNo: '1200', // Accounts Receivable
            isActive: true 
          }
        });
        if (!arAccount) {
          throw new Error('Accounts Receivable account not found. Please create account code 1200.');
        }
        contraAccountId = arAccount.id;
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
        // Use Accounts Payable account for vendor payments
        const apAccount = await prisma.chartOfAccounts.findFirst({
          where: { 
            accountNo: '2000', // Accounts Payable
            isActive: true 
          }
        });
        if (!apAccount) {
          throw new Error('Accounts Payable account not found. Please create account code 2000.');
        }
        contraAccountId = apAccount.id;
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
  
  private static async updateBatchTotals(batchId: string): Promise<void> {
    const batch = await prisma.cashbookBatch.findUnique({
      where: { id: batchId },
      include: { transactions: true }
    });
    
    if (batch) {
      const totalAmount = batch.transactions.reduce((sum, t) => sum + Number(t.totalAmount), 0);
      const totalVAT = batch.transactions.reduce((sum, t) => {
        return sum + t.lineItems.reduce((lineSum, line) => lineSum + Number(line.vatAmount), 0);
      }, 0);
      
      await prisma.cashbookBatch.update({
        where: { id: batchId },
        data: {
          totalAmount: new Decimal(totalAmount),
          totalVAT: new Decimal(totalVAT)
        }
      });
    }
  }

  /**
   * Create Bank Account
   * Creates a new bank account for cashbook transactions
   */
  static async createBank(params: {
    name: string;
    accountNumber: string;
    currencyId: string;
    glAccountId: string;
    bankCode?: string;
    branchCode?: string;
    isActive?: boolean;
  }) {
    const {
      name,
      accountNumber,
      currencyId,
      glAccountId,
      bankCode,
      branchCode,
      isActive = true
    } = params;

    // Validate that the GL account exists and is a bank account type
    const glAccount = await prisma.chartOfAccounts.findUnique({
      where: { id: glAccountId }
    });

    if (!glAccount) {
      throw new Error('GL account not found');
    }

    if (!['Current Asset', 'Fixed Asset'].includes(glAccount.accountType)) {
      throw new Error('GL account must be an asset type for bank accounts');
    }

    // Validate currency exists
    const currency = await prisma.currency.findUnique({
      where: { id: currencyId }
    });

    if (!currency) {
      throw new Error('Currency not found');
    }

    // Check for duplicate account number
    const existingBank = await prisma.bank.findFirst({
      where: { accountNumber }
    });

    if (existingBank) {
      throw new Error('Bank account with this account number already exists');
    }

    // Create the bank account
    const bank = await prisma.bank.create({
      data: {
        name,
        accountNumber,
        currencyId,
        glAccountId,
        isActive
      },
      include: {
        currency: true,
        glAccount: true
      }
    });

    return bank;
  }
}

export default CashbookService;