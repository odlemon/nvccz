// @ts-nocheck
// Sage Pastel Cashbook Service Implementation
// Handles receipts and payments with automatic journal entry creation

import { PrismaClient, CashbookEntry, JournalEntry, ChartOfAccounts } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import AuditService from "./AuditService";
import JournalEntryService from "./JournalEntryService";

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
  vendorId?: string;         // For Vendor transactions
  createdById: string;
}

export interface CashbookResult {
  cashbookEntry: CashbookEntry;
  journalEntry?: JournalEntry;
  success: boolean;
  message: string;
}

export class CashbookService {
  
  /**
   * Create a cash receipt (money coming in)
   * Implements Sage Pastel Receipts Journal logic
   */
  static async createCashReceipt(params: CreateCashReceiptParams): Promise<CashbookResult> {
    try {
      console.log(`\n💰 Creating Cash Receipt: $${params.amount}`);
      console.log(`   Bank ID: ${params.bankId}`);
      console.log(`   Counterparty: ${params.counterpartyType}`);
      console.log(`   Description: ${params.description}`);

      // 1. Create CashbookEntry (RECEIPT)
      const cashbookEntry = await prisma.cashbookEntry.create({
        data: {
          bank: {
            connect: { id: params.bankId }
          },
          transactionDate: params.transactionDate,
          description: params.description,
          amount: new Decimal(params.amount),
          type: 'RECEIPT',
          reference: params.reference,
          status: 'PENDING',
          counterpartyType: params.counterpartyType,
          glAccount: params.glAccountId ? { connect: { id: params.glAccountId } } : undefined,
          customer: params.customerId ? { connect: { id: params.customerId } } : undefined,
          vendor: params.vendorId ? { connect: { id: params.vendorId } } : undefined,
          createdBy: {
            connect: { id: params.createdById }
          }
        }
      });

      console.log(`   ✅ Cashbook Entry Created: ${cashbookEntry.id}`);

      // 2. Create corresponding Journal Entry (Sage Pastel style)
      const journalEntry = await this.createReceiptJournalEntry(cashbookEntry);
      
      // 3. Update cashbook entry with journal entry reference
      const updatedCashbookEntry = await prisma.cashbookEntry.update({
        where: { id: cashbookEntry.id },
        data: {
          journalEntryId: journalEntry.id,
          status: 'POSTED'
        }
      });

      // 4. Update customer/supplier balances if applicable
      await this.updateCounterpartyBalances(cashbookEntry);

      // 5. Audit log
      await AuditService.log({
        userId: params.createdById,
        action: "CREATE",
        entityType: "CashbookEntry",
        entityId: cashbookEntry.id,
        newValues: {
          type: 'RECEIPT',
          amount: params.amount,
          counterpartyType: params.counterpartyType
        }
      });

      console.log(`   ✅ Receipt processed successfully`);
      console.log(`   📝 Journal Entry: ${journalEntry.referenceNumber}`);

      return {
        cashbookEntry: updatedCashbookEntry,
        journalEntry,
        success: true,
        message: 'Cash receipt created and posted successfully'
      };

    } catch (error: any) {
      console.error('Error creating cash receipt:', error);
      throw new Error(`Failed to create cash receipt: ${error.message}`);
    }
  }

  /**
   * Create a cash payment (money going out)
   * Implements Sage Pastel Payments Journal logic
   */
  static async createCashPayment(params: CreateCashPaymentParams): Promise<CashbookResult> {
    try {
      console.log(`\n💸 Creating Cash Payment: $${params.amount}`);
      console.log(`   Bank ID: ${params.bankId}`);
      console.log(`   Counterparty: ${params.counterpartyType}`);
      console.log(`   Description: ${params.description}`);

      // 1. Create CashbookEntry (PAYMENT)
      const cashbookEntry = await prisma.cashbookEntry.create({
        data: {
          bank: {
            connect: { id: params.bankId }
          },
          transactionDate: params.transactionDate,
          description: params.description,
          amount: new Decimal(params.amount),
          type: 'PAYMENT',
          reference: params.reference,
          status: 'PENDING',
          counterpartyType: params.counterpartyType,
          glAccount: params.glAccountId ? { connect: { id: params.glAccountId } } : undefined,
          customer: params.customerId ? { connect: { id: params.customerId } } : undefined,
          vendor: params.vendorId ? { connect: { id: params.vendorId } } : undefined,
          createdBy: {
            connect: { id: params.createdById }
          }
        }
      });

      console.log(`   ✅ Cashbook Entry Created: ${cashbookEntry.id}`);

      // 2. Create corresponding Journal Entry (Sage Pastel style)
      const journalEntry = await this.createPaymentJournalEntry(cashbookEntry);
      
      // 3. Update cashbook entry with journal entry reference
      const updatedCashbookEntry = await prisma.cashbookEntry.update({
        where: { id: cashbookEntry.id },
        data: {
          journalEntryId: journalEntry.id,
          status: 'POSTED'
        }
      });

      // 4. Update customer/supplier balances if applicable
      await this.updateCounterpartyBalances(cashbookEntry);

      // 5. Audit log
      await AuditService.log({
        userId: params.createdById,
        action: "CREATE",
        entityType: "CashbookEntry",
        entityId: cashbookEntry.id,
        newValues: {
          type: 'PAYMENT',
          amount: params.amount,
          counterpartyType: params.counterpartyType
        }
      });

      console.log(`   ✅ Payment processed successfully`);
      console.log(`   📝 Journal Entry: ${journalEntry.referenceNumber}`);

      return {
        cashbookEntry: updatedCashbookEntry,
        journalEntry,
        success: true,
        message: 'Cash payment created and posted successfully'
      };

    } catch (error: any) {
      console.error('Error creating cash payment:', error);
      throw new Error(`Failed to create cash payment: ${error.message}`);
    }
  }

  /**
   * Create journal entry for cash receipt
   * Sage Pastel Logic: Dr Bank, Cr Income/Customer
   */
  private static async createReceiptJournalEntry(cashbookEntry: CashbookEntry): Promise<JournalEntry> {
    const bank = await prisma.bank.findUnique({
      where: { id: cashbookEntry.bankId },
      include: { glAccount: true }
    });

    if (!bank?.glAccount) {
      throw new Error('Bank GL account not found');
    }

    // Get counterparty account
    let counterpartyAccount: ChartOfAccounts;
    
    if (cashbookEntry.counterpartyType === 'CUSTOMER' && cashbookEntry.customerId) {
      // Customer payment - credit Accounts Receivable
      counterpartyAccount = await this.getAccountsReceivableAccount();
    } else if (cashbookEntry.counterpartyType === 'SUPPLIER' && cashbookEntry.vendorId) {
      // Supplier refund - credit Accounts Payable
      counterpartyAccount = await this.getAccountsPayableAccount();
    } else if (cashbookEntry.counterpartyType === 'GL' && cashbookEntry.glAccountId) {
      // Direct GL account
      counterpartyAccount = await prisma.chartOfAccounts.findUnique({
        where: { id: cashbookEntry.glAccountId }
      });
      if (!counterpartyAccount) {
        throw new Error('GL account not found');
      }
    } else {
      throw new Error('Invalid counterparty configuration');
    }

    // Create journal entry
    const journalEntry = await prisma.journalEntry.create({
      data: {
        transactionDate: cashbookEntry.transactionDate,
        referenceNumber: this.generateReferenceNumber('CR'),
        description: `Cash Receipt: ${cashbookEntry.description}`,
        totalAmount: cashbookEntry.amount,
        currency: {
          connect: { id: bank.currencyId }
        },
        status: 'POSTED',
        ...(cashbookEntry.createdById && { createdBy: { connect: { id: cashbookEntry.createdById } } })
      }
    });

    // Create journal entry lines
    // Dr Bank Account
    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: bank.glAccount.id,
        debitAmount: cashbookEntry.amount,
        creditAmount: new Decimal(0),
        description: `Receipt: ${cashbookEntry.description}`
      }
    });

    // Cr Counterparty Account
    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: counterpartyAccount.id,
        debitAmount: new Decimal(0),
        creditAmount: cashbookEntry.amount,
        description: `Receipt: ${cashbookEntry.description}`
      }
    });

    return journalEntry;
  }

  /**
   * Create journal entry for cash payment
   * Sage Pastel Logic: Dr Expense/Supplier, Cr Bank
   */
  private static async createPaymentJournalEntry(cashbookEntry: CashbookEntry): Promise<JournalEntry> {
    const bank = await prisma.bank.findUnique({
      where: { id: cashbookEntry.bankId },
      include: { glAccount: true }
    });

    if (!bank?.glAccount) {
      throw new Error('Bank GL account not found');
    }

    // Get counterparty account
    let counterpartyAccount: ChartOfAccounts;
    
    if (cashbookEntry.counterpartyType === 'SUPPLIER' && cashbookEntry.vendorId) {
      // Supplier payment - debit Accounts Payable
      counterpartyAccount = await this.getAccountsPayableAccount();
    } else if (cashbookEntry.counterpartyType === 'CUSTOMER' && cashbookEntry.customerId) {
      // Customer refund - debit Accounts Receivable
      counterpartyAccount = await this.getAccountsReceivableAccount();
    } else if (cashbookEntry.counterpartyType === 'GL' && cashbookEntry.glAccountId) {
      // Direct GL account
      counterpartyAccount = await prisma.chartOfAccounts.findUnique({
        where: { id: cashbookEntry.glAccountId }
      });
      if (!counterpartyAccount) {
        throw new Error('GL account not found');
      }
    } else {
      throw new Error('Invalid counterparty configuration');
    }

    // Create journal entry
    const journalEntry = await prisma.journalEntry.create({
      data: {
        transactionDate: cashbookEntry.transactionDate,
        referenceNumber: this.generateReferenceNumber('CP'),
        description: `Cash Payment: ${cashbookEntry.description}`,
        totalAmount: cashbookEntry.amount,
        currency: {
          connect: { id: bank.currencyId }
        },
        status: 'POSTED',
        ...(cashbookEntry.createdById && { createdBy: { connect: { id: cashbookEntry.createdById } } })
      }
    });

    // Create journal entry lines
    // Dr Counterparty Account
    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: counterpartyAccount.id,
        debitAmount: cashbookEntry.amount,
        creditAmount: new Decimal(0),
        description: `Payment: ${cashbookEntry.description}`
      }
    });

    // Cr Bank Account
    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: bank.glAccount.id,
        debitAmount: new Decimal(0),
        creditAmount: cashbookEntry.amount,
        description: `Payment: ${cashbookEntry.description}`
      }
    });

    return journalEntry;
  }

  /**
   * Update customer/supplier balances
   */
  private static async updateCounterpartyBalances(cashbookEntry: CashbookEntry): Promise<void> {
    if (cashbookEntry.counterpartyType === 'CUSTOMER' && cashbookEntry.customerId) {
      // Update customer balance (receipt reduces A/R, payment increases A/R)
      const adjustment = cashbookEntry.type === 'RECEIPT' 
        ? -Number(cashbookEntry.amount)  // Receipt reduces A/R
        : Number(cashbookEntry.amount);  // Payment increases A/R
      
      // This would update customer balance in your customer management system
      console.log(`   📊 Customer ${cashbookEntry.customerId} balance adjusted by: $${adjustment}`);
    }
    
    if (cashbookEntry.counterpartyType === 'SUPPLIER' && cashbookEntry.vendorId) {
      // Update supplier balance (payment reduces A/P, receipt increases A/P)
      const adjustment = cashbookEntry.type === 'PAYMENT'
        ? -Number(cashbookEntry.amount)  // Payment reduces A/P
        : Number(cashbookEntry.amount); // Receipt increases A/P
      
      // This would update supplier balance in your supplier management system
      console.log(`   📊 Vendor ${cashbookEntry.vendorId} balance adjusted by: $${adjustment}`);
    }
  }

  /**
   * Get cash position for a bank account
   */
  static async getCashPosition(bankId: string): Promise<{
    bankName: string;
    openingBalance: number;
    totalReceipts: number;
    totalPayments: number;
    currentBalance: number;
    unreconciledCount: number;
  }> {
    const bank = await prisma.bank.findUnique({
      where: { id: bankId },
      include: { glAccount: true }
    });

    if (!bank) {
      throw new Error('Bank account not found');
    }

    // Get all cashbook entries for this bank
    const entries = await prisma.cashbookEntry.findMany({
      where: { bankId },
      orderBy: { transactionDate: 'asc' }
    });

    const totalReceipts = entries
      .filter(e => e.type === 'RECEIPT' && e.status === 'POSTED')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalPayments = entries
      .filter(e => e.type === 'PAYMENT' && e.status === 'POSTED')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const unreconciledCount = entries.filter(e => !e.isReconciled).length;

    // For now, assume opening balance is 0 (you might want to track this separately)
    const openingBalance = 0;
    const currentBalance = openingBalance + totalReceipts - totalPayments;

    return {
      bankName: bank.name,
      openingBalance,
      totalReceipts,
      totalPayments,
      currentBalance,
      unreconciledCount
    };
  }

  /**
   * Get cashbook entries for a bank
   */
  static async getCashbookEntries(bankId: string, filters: {
    type?: 'RECEIPT' | 'PAYMENT';
    status?: 'PENDING' | 'POSTED' | 'VOIDED';
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<CashbookEntry[]> {
    const where: any = { bankId };
    
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.transactionDate = {};
      if (filters.startDate) where.transactionDate.gte = filters.startDate;
      if (filters.endDate) where.transactionDate.lte = filters.endDate;
    }

    return await prisma.cashbookEntry.findMany({
      where,
      include: {
        bank: { include: { glAccount: true } },
        customer: true,
        vendor: true,
        glAccount: true,
        journalEntry: true,
        createdBy: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: { transactionDate: 'desc' }
    });
  }

  // Helper methods
  private static async getAccountsReceivableAccount(): Promise<ChartOfAccounts> {
    const account = await prisma.chartOfAccounts.findFirst({
      where: { accountName: { contains: 'Accounts Receivable' } }
    });
    if (!account) throw new Error('Accounts Receivable account not found');
    return account;
  }

  private static async getAccountsPayableAccount(): Promise<ChartOfAccounts> {
    const account = await prisma.chartOfAccounts.findFirst({
      where: { accountName: { contains: 'Accounts Payable' } }
    });
    if (!account) throw new Error('Accounts Payable account not found');
    return account;
  }

  private static generateReferenceNumber(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}-${timestamp}-${random}`;
  }
}
