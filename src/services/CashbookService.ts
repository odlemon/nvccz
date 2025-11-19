// @ts-nocheck
// Comprehensive Cashbook Service
// Implements Sage Pastel-style cashbook functionality with two-stage processing

import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';
import ControlAccountIntegrationService from './ControlAccountIntegrationService';

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
  controlAccountResult?: any;
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
      // Pass VAT information to createJournalEntry
      const journalEntry = await this.createJournalEntry(transaction, params.createdById, {
        vatCode: params.vatCode,
        vatAmount: vatAmount,
        netAmount: netAmount
      });
      
      // 6. Update transaction with journal entry reference
      const updatedTransaction = await prisma.cashbookEntry.update({
        where: { id: transaction.id },
        data: { 
          journalEntryId: journalEntry.id,
          status: 'POSTED'
        }
      });
      
      // 7. Apply Control Account Integration for customer payments
      let controlAccountResult = null;
      if (params.counterpartyType === 'CUSTOMER' && params.customerId) {
        try {
          controlAccountResult = await ControlAccountIntegrationService.applyCustomerPayment(
            updatedTransaction.id,
            params.customerId,
            params.amount,
            params.createdById,
            false // Set to true for auto-allocation
          );
          console.log(`📊 Control Account Integration: ${controlAccountResult.message}`);
        } catch (error: any) {
          console.warn(`⚠️ Control Account Integration failed (non-critical): ${error.message}`);
          // Don't fail the transaction if control account integration fails
        }
      }
      
      return {
        transaction: updatedTransaction,
        journalEntry,
        controlAccountResult,
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
      
      // 5. For SUPPLIER and CUSTOMER payments, keep as PENDING to allow allocations before posting
      // GL payments can be auto-posted if needed
      let updatedTransaction;
      if (params.counterpartyType === 'SUPPLIER' || params.counterpartyType === 'CUSTOMER') {
        // Keep payment as PENDING - user must allocate and post manually
        updatedTransaction = transaction;
        console.log(`ℹ️  Payment kept as PENDING - allocate to invoices before posting`);
      } else {
        // For GL payments, auto-post as before
        // Pass VAT information to createJournalEntry
        const vatRate = params.vatCode === '15%' ? 0.15 : 0;
        const vatAmount = params.amount * vatRate;
        const netAmount = params.amount - vatAmount;
        const journalEntry = await this.createJournalEntry(transaction, params.createdById, {
          vatCode: params.vatCode,
          vatAmount: vatAmount,
          netAmount: netAmount
        });
        updatedTransaction = await prisma.cashbookEntry.update({
          where: { id: transaction.id },
          data: { 
            journalEntryId: journalEntry.id,
            status: 'POSTED'
          }
        });
      }
      
      // 7. Apply Control Account Integration for supplier payments
      let controlAccountResult = null;
      if (params.counterpartyType === 'SUPPLIER' && params.vendorId) {
        try {
          controlAccountResult = await ControlAccountIntegrationService.applySupplierPayment(
            updatedTransaction.id,
            params.vendorId,
            params.amount,
            params.createdById,
            false // Set to true for auto-allocation
          );
          console.log(`📊 Control Account Integration: ${controlAccountResult.message}`);
        } catch (error: any) {
          console.warn(`⚠️ Control Account Integration failed (non-critical): ${error.message}`);
          // Don't fail the transaction if control account integration fails
        }
      }
      
      return {
        transaction: updatedTransaction,
        journalEntry: updatedTransaction.status === 'POSTED' ? await prisma.journalEntry.findUnique({ where: { id: updatedTransaction.journalEntryId } }) : null,
        controlAccountResult,
        success: true,
        message: updatedTransaction.status === 'POSTED' 
          ? 'Cash payment created and posted successfully'
          : 'Cash payment created successfully - allocate to invoices and post when ready'
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
      
      // 1. Get transaction with related data and allocations
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
      
      // Fetch allocations separately (they're linked via PaymentAllocation model)
      const allocations = await prisma.paymentAllocation.findMany({
        where: { cashbookEntryId: transactionId }
      });
      
      // Attach allocations to transaction object
      (transaction as any).allocations = allocations;
      console.log(`📋 Allocations found: ${allocations.length} for transaction ${transactionId}`);
      
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }
      
      if (transaction.status === 'POSTED') {
        throw new Error('Transaction already posted');
      }
      
      // 2. Validate multi-line allocation for PAYMENT transactions
      // For SUPPLIER and CUSTOMER payments, ensure all allocations sum to the payment amount
      if (transaction.type === 'PAYMENT' && 
          (transaction.counterpartyType === 'SUPPLIER' || transaction.counterpartyType === 'CUSTOMER')) {
        
        const allocations = transaction.allocations || [];
        const totalAllocated = allocations.reduce((sum, alloc) => 
          sum + parseFloat(alloc.allocatedAmount.toString()), 0
        );
        const paymentAmount = parseFloat(transaction.amount.toString());
        const remainingToAllocate = paymentAmount - totalAllocated;
        
        // For supplier/customer payments, require full allocation (allow small rounding differences)
        if (Math.abs(remainingToAllocate) > 0.01) {
          const errorMessage = `Cannot post payment: Payment total is $${paymentAmount.toFixed(2)}, but allocated amount is $${totalAllocated.toFixed(2)}. Outstanding balance required: $${Math.abs(remainingToAllocate).toFixed(2)}. Please allocate the remaining amount before posting.`;
          console.error(`❌ Allocation validation failed: ${errorMessage}`);
          throw new Error(errorMessage);
        }
      }
      
      // 3. Create journal entry
      const journalEntry = await this.createJournalEntry(transaction, userId);
      
      // 4. Update transaction status
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
      
      // Exclude reversals from normal cashbook views (reversals have originalTransactionId set)
      where.originalTransactionId = null;
      
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
  
  
  
  private static async createJournalEntry(transaction: any, userId: string, vatInfo?: { vatCode?: string; vatAmount: number; netAmount: number }): Promise<any> {
    const referenceNumber = `CB-${transaction.id.substring(transaction.id.length - 8).toUpperCase()}`;
    
    // Fetch bank details with currency
    const bank = await prisma.bank.findUnique({
      where: { id: transaction.bankId },
      include: { currency: true }
    });
    
    if (!bank) {
      throw new Error('Bank account not found');
    }
    
    // Use "Bank" instead of "Cashbook" in description
    const transactionTypeLabel = transaction.type === 'RECEIPT' ? 'Receipt' : 'Payment';
    const journalEntry = await prisma.journalEntry.create({
      data: {
        transactionDate: transaction.transactionDate,
        referenceNumber,
        description: `Bank ${transactionTypeLabel}: ${transaction.description}`,
        totalAmount: transaction.amount,
        currencyId: bank.currency.id,
        status: 'POSTED',
        createdById: userId
      }
    });
    
    // Create journal entry lines for double-entry accounting
    if (transaction.type === 'RECEIPT') {
      // Receipt: Dr. Bank, Cr. Customer/GL Account, Cr. VAT Output (if applicable)
      
      // 1. Debit Bank Account (full amount including VAT)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccountId,
          debitAmount: transaction.amount,
          creditAmount: new Decimal(0),
          description: `Bank receipt: ${transaction.description}`
        }
      });
      
      // 2. Credit Customer/GL Account (net amount if VAT, full amount if no VAT)
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
        // For GL receipts, use the provided GL account (should be Revenue account)
        contraAccountId = transaction.glAccountId;
      } else {
        throw new Error('Invalid counterparty for receipt');
      }
      
      // Calculate amounts: if VAT info provided, use net amount; otherwise use full amount
      const creditAmount = vatInfo && vatInfo.vatAmount > 0.01 
        ? new Decimal(vatInfo.netAmount) 
        : transaction.amount;
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: contraAccountId,
          debitAmount: new Decimal(0),
          creditAmount: creditAmount,
          description: `Receipt from: ${transaction.description}`
        }
      });
      
      // 3. Credit VAT Output Account (if VAT applicable)
      if (vatInfo && vatInfo.vatAmount > 0.01) {
        const vatOutputAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountNo: '2100' }, // VAT Output
              { accountName: { contains: 'VAT Output' }, accountType: 'Current Liability' }
            ],
            isActive: true
          }
        });
        
        if (vatOutputAccount) {
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatOutputAccount.id,
              debitAmount: new Decimal(0),
              creditAmount: new Decimal(vatInfo.vatAmount),
              description: `VAT Output: ${transaction.description}`
            }
          });
        } else {
          console.warn('⚠️  VAT Output account not found - VAT amount will not be recorded separately');
        }
      }
      
    } else if (transaction.type === 'PAYMENT') {
      // Payment: For SUPPLIER/CUSTOMER with allocations, use Net + VAT breakdown
      // Otherwise, use Accounts Payable for supplier or GL account for GL payments
      
      if ((transaction.counterpartyType === 'SUPPLIER' || transaction.counterpartyType === 'CUSTOMER') && 
          transaction.allocations && transaction.allocations.length > 0) {
        // UAT Requirement: DR entries (Net + VAT) totaling payment amount
        
        console.log(`📊 Creating Net + VAT breakdown for payment with ${transaction.allocations.length} allocations`);
        
        // Calculate Net and VAT from allocations based on invoice VAT rates
        let totalNet = new Decimal(0);
        let totalVAT = new Decimal(0);
        
        for (const allocation of transaction.allocations) {
          console.log(`   Processing allocation: ${allocation.invoiceId}, Amount: ${allocation.allocatedAmount}`);
          // Get invoice to determine VAT rate
          const invoice = await prisma.invoice.findUnique({
            where: { id: allocation.invoiceId }
          });
          
          if (invoice) {
            // Invoice has items stored in JSON field and VAT info
            const invoiceItems = invoice.items && typeof invoice.items === 'object' 
              ? (Array.isArray(invoice.items) ? invoice.items : [invoice.items])
              : [];
            
            if (invoiceItems.length > 0) {
              // Calculate invoice totals: Net and VAT separately from items
              let invoiceNet = new Decimal(0);
              let invoiceVAT = new Decimal(0);
              
              for (const item of invoiceItems) {
                const itemUnitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice || 0);
                const itemQuantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity || 1);
                const itemVATRate = typeof item.vatRate === 'number' ? item.vatRate : parseFloat(item.vatRate || 0);
                
                const itemNet = new Decimal(itemUnitPrice).times(itemQuantity);
                const itemVAT = itemNet.times(itemVATRate);
                
                invoiceNet = invoiceNet.add(itemNet);
                invoiceVAT = invoiceVAT.add(itemVAT);
              }
              
              const invoiceTotal = invoiceNet.add(invoiceVAT);
              
              // Prorate allocation amount based on invoice Net/VAT structure
              if (invoiceTotal.gt(0)) {
                const allocationAmount = new Decimal(allocation.allocatedAmount);
                // Calculate proportion: allocation / invoice total
                const proportion = allocationAmount.div(invoiceTotal);
                
                // Apply proportion to Net and VAT
                const netPortion = invoiceNet.times(proportion);
                const vatPortion = invoiceVAT.times(proportion);
                
                totalNet = totalNet.add(netPortion);
                totalVAT = totalVAT.add(vatPortion);
                
                console.log(`     Invoice: Net=${invoiceNet}, VAT=${invoiceVAT}, Total=${invoiceTotal}`);
                console.log(`     Allocation: Net=${netPortion}, VAT=${vatPortion}, Total=${allocationAmount}`);
              } else {
                // If invoice has no total, treat entire allocation as net
                console.log(`     Invoice has zero total, treating as net: ${allocation.allocatedAmount}`);
                totalNet = totalNet.add(new Decimal(allocation.allocatedAmount));
              }
            } else {
              // If invoice has no items, use invoice's stored VAT amount
              const invoiceVATAmount = invoice.vatAmount ? parseFloat(invoice.vatAmount.toString()) : 0;
              const invoiceNetAmount = invoice.amount ? parseFloat(invoice.amount.toString()) : 0;
              const invoiceTotalAmount = invoice.totalAmount ? parseFloat(invoice.totalAmount.toString()) : 0;
              
              if (invoiceTotalAmount > 0) {
                const allocationAmount = new Decimal(allocation.allocatedAmount);
                const proportion = allocationAmount.div(new Decimal(invoiceTotalAmount));
                
                const netPortion = new Decimal(invoiceNetAmount).times(proportion);
                const vatPortion = new Decimal(invoiceVATAmount).times(proportion);
                
                totalNet = totalNet.add(netPortion);
                totalVAT = totalVAT.add(vatPortion);
                
                console.log(`     Invoice (from totals): Net=${invoiceNetAmount}, VAT=${invoiceVATAmount}, Total=${invoiceTotalAmount}`);
                console.log(`     Allocation: Net=${netPortion}, VAT=${vatPortion}, Total=${allocationAmount}`);
              } else {
                console.log(`     Invoice has no total amount, treating as net: ${allocation.allocatedAmount}`);
                totalNet = totalNet.add(new Decimal(allocation.allocatedAmount));
              }
            }
          } else {
            // If invoice not found, treat as net (conservative)
            console.log(`     Invoice not found, treating as net: ${allocation.allocatedAmount}`);
            totalNet = totalNet.add(new Decimal(allocation.allocatedAmount));
          }
        }
        
        console.log(`   ✅ Total Net: $${totalNet.toString()}, Total VAT: $${totalVAT.toString()}`);
        
        // If we have VAT, create separate DR entries for Net and VAT Input
        const totalVATValue = parseFloat(totalVAT.toString());
        console.log(`   Checking if VAT > 0.01: ${totalVATValue} > 0.01 = ${totalVATValue > 0.01}`);
        
        if (totalVATValue > 0.01) {
          console.log(`   ✅ Creating Net + VAT breakdown: Net=$${totalNet.toString()}, VAT=$${totalVAT.toString()}`);
          // 1. Debit Expense/Net Account (use Accounts Payable as expense for supplier payments)
          const expenseAccount = await prisma.chartOfAccounts.findFirst({
            where: { 
              accountNo: '2000', // Accounts Payable
              isActive: true 
            }
          });
          if (!expenseAccount) {
            throw new Error('Accounts Payable account (2000) not found. Please create account code 2000.');
          }
          
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: expenseAccount.id,
              debitAmount: totalNet,
              creditAmount: new Decimal(0),
              description: `Payment Net: ${transaction.description}`
            }
          });
          
          // 2. Debit VAT Input Account
          const vatInputAccount = await prisma.chartOfAccounts.findFirst({
            where: {
              accountName: { contains: 'VAT Input' },
              isActive: true
            }
          });
          
          if (!vatInputAccount) {
            // Fallback to Accounts Payable if VAT Input not found
            await prisma.journalEntryLine.create({
              data: {
                journalEntryId: journalEntry.id,
                chartOfAccountId: expenseAccount.id,
                debitAmount: totalVAT,
                creditAmount: new Decimal(0),
                description: `Payment VAT (no VAT Input account): ${transaction.description}`
              }
            });
          } else {
            await prisma.journalEntryLine.create({
              data: {
                journalEntryId: journalEntry.id,
                chartOfAccountId: vatInputAccount.id,
                debitAmount: totalVAT,
                creditAmount: new Decimal(0),
                description: `VAT Input: ${transaction.description}`
              }
            });
          }
        } else {
          // No VAT - single DR entry for Net
          const expenseAccount = await prisma.chartOfAccounts.findFirst({
            where: { 
              accountNo: '2000', // Accounts Payable
              isActive: true 
            }
          });
          if (!expenseAccount) {
            throw new Error('Accounts Payable account (2000) not found. Please create account code 2000.');
          }
          
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: expenseAccount.id,
              debitAmount: transaction.amount,
              creditAmount: new Decimal(0),
              description: `Payment: ${transaction.description}`
            }
          });
        }
        
        // 3. Credit Bank Account
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: bank.glAccountId,
            debitAmount: new Decimal(0),
            creditAmount: transaction.amount,
            description: `Bank payment: ${transaction.description}`
          }
        });
        
      } else {
        // For GL payments or payments without allocations, use simple structure
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
        
        // Calculate amounts: if VAT info provided, use net amount; otherwise use full amount
        const debitAmount = vatInfo && vatInfo.vatAmount > 0.01 
          ? new Decimal(vatInfo.netAmount) 
          : transaction.amount;
        
        // 1. Debit Expense/GL Account (net amount if VAT, full amount if no VAT)
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: contraAccountId,
            debitAmount: debitAmount,
            creditAmount: new Decimal(0),
            description: `Payment to: ${transaction.description}`
          }
        });
        
        // 2. Debit VAT Input Account (if VAT applicable)
        if (vatInfo && vatInfo.vatAmount > 0.01) {
          const vatInputAccount = await prisma.chartOfAccounts.findFirst({
            where: {
              OR: [
                { accountNo: '2110' }, // VAT Input
                { accountName: { contains: 'VAT Input' }, accountType: 'Current Asset' }
              ],
              isActive: true
            }
          });
          
          if (vatInputAccount) {
            await prisma.journalEntryLine.create({
              data: {
                journalEntryId: journalEntry.id,
                chartOfAccountId: vatInputAccount.id,
                debitAmount: new Decimal(vatInfo.vatAmount),
                creditAmount: new Decimal(0),
                description: `VAT Input: ${transaction.description}`
              }
            });
          } else {
            console.warn('⚠️  VAT Input account not found - VAT amount will not be recorded separately');
          }
        }
        
        // 3. Credit Bank Account (full amount including VAT)
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

    // Check if GL account is already used by another bank
    const existingBankWithGL = await prisma.bank.findFirst({
      where: { glAccountId }
    });

    if (existingBankWithGL) {
      throw new Error(`GL account is already associated with bank account "${existingBankWithGL.name}". Each GL account can only be linked to one bank account.`);
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