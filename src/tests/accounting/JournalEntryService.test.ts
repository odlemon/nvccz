// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import JournalEntryService from '../../services/JournalEntryService';
import { PrismaClient } from '@prisma/client';

// Mock Prisma client
jest.mock('@prisma/client');
jest.mock('../../utils/database', () => ({
  dbConnection: {
    getPrismaClient: jest.fn()
  }
}));

const mockPrisma = {
  journalEntry: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  journalEntryLine: {
    create: jest.fn(),
    findMany: jest.fn()
  },
  chartOfAccounts: {
    findFirst: jest.fn()
  }
} as any;

describe('JournalEntryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up the mock to return our mockPrisma
    const { dbConnection } = require('../../utils/database');
    dbConnection.getPrismaClient.mockReturnValue(mockPrisma);
  });

  describe('createExpenseJournalEntry', () => {
    const mockExpenseAccount = {
      id: 'expense-account-id',
      accountNo: '5000',
      accountName: 'Legal Fees',
      accountType: 'Expense'
    };

    const mockVATInputAccount = {
      id: 'vat-input-id',
      accountNo: '1101',
      accountName: 'VAT Input',
      accountType: 'Current Asset'
    };

    const mockAccountsPayableAccount = {
      id: 'ap-account-id',
      accountNo: '2000',
      accountName: 'Accounts Payable',
      accountType: 'Current Liability'
    };

    const mockJournalEntry = {
      id: 'journal-entry-id',
      transactionDate: new Date(),
      referenceNumber: 'JE-2024-001',
      description: 'Expense transaction',
      totalAmount: 1145,
      currencyId: 'currency-id',
      status: 'POSTED',
      createdById: 'user-id'
    };

    const mockJournalEntryLines = [
      {
        id: 'line-1',
        journalEntryId: 'journal-entry-id',
        chartOfAccountId: 'expense-account-id',
        debitAmount: 1000,
        creditAmount: 0,
        description: 'Legal Fees',
        vatAmount: 0
      },
      {
        id: 'line-2',
        journalEntryId: 'journal-entry-id',
        chartOfAccountId: 'vat-input-id',
        debitAmount: 145,
        creditAmount: 0,
        description: 'VAT Input',
        vatAmount: 145
      },
      {
        id: 'line-3',
        journalEntryId: 'journal-entry-id',
        chartOfAccountId: 'ap-account-id',
        debitAmount: 0,
        creditAmount: 1145,
        description: 'Accounts Payable',
        vatAmount: 0
      }
    ];

    beforeEach(() => {
      // Mock account lookups
      mockPrisma.chartOfAccounts.findFirst
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(mockVATInputAccount)
        .mockResolvedValueOnce(mockAccountsPayableAccount);

      // Mock journal entry creation
      mockPrisma.journalEntry.create.mockResolvedValue(mockJournalEntry);

      // Mock journal entry lines creation
      mockPrisma.journalEntryLine.create
        .mockResolvedValueOnce(mockJournalEntryLines[0])
        .mockResolvedValueOnce(mockJournalEntryLines[1])
        .mockResolvedValueOnce(mockJournalEntryLines[2]);
    });

    it('should create expense journal entry with VAT correctly', async () => {
      const params = {
        expenseId: 'expense-id',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        categoryId: 'category-id',
        vendorId: 'vendor-id',
        currencyId: 'currency-id',
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id'
      };

      const result = await JournalEntryService.createExpenseJournalEntry(params);

      expect(result).toBeDefined();
      expect(result.journalEntry).toEqual(mockJournalEntry);
      expect(result.journalEntryLines).toHaveLength(3);

      // Verify expense account debit
      expect(result.journalEntryLines[0].chartOfAccountId).toBe('expense-account-id');
      expect(result.journalEntryLines[0].debitAmount).toBe(1000);
      expect(result.journalEntryLines[0].creditAmount).toBe(0);

      // Verify VAT input debit
      expect(result.journalEntryLines[1].chartOfAccountId).toBe('vat-input-id');
      expect(result.journalEntryLines[1].debitAmount).toBe(145);
      expect(result.journalEntryLines[1].creditAmount).toBe(0);
      expect(result.journalEntryLines[1].vatAmount).toBe(145);

      // Verify accounts payable credit
      expect(result.journalEntryLines[2].chartOfAccountId).toBe('ap-account-id');
      expect(result.journalEntryLines[2].debitAmount).toBe(0);
      expect(result.journalEntryLines[2].creditAmount).toBe(1145);
    });

    it('should create expense journal entry without VAT for non-taxable expenses', async () => {
      const params = {
        expenseId: 'expense-id',
        amount: 1000,
        vatAmount: 0,
        totalAmount: 1000,
        categoryId: 'category-id',
        vendorId: 'vendor-id',
        currencyId: 'currency-id',
        isTaxable: false,
        description: 'Legal Fees',
        createdById: 'user-id'
      };

      const result = await JournalEntryService.createExpenseJournalEntry(params);

      expect(result).toBeDefined();
      expect(result.journalEntryLines).toHaveLength(2); // No VAT line

      // Verify expense account debit
      expect(result.journalEntryLines[0].debitAmount).toBe(1000);
      expect(result.journalEntryLines[0].creditAmount).toBe(0);

      // Verify accounts payable credit (no VAT line)
      expect(result.journalEntryLines[1].debitAmount).toBe(0);
      expect(result.journalEntryLines[1].creditAmount).toBe(1000);
    });

    it('should throw error if expense account not found', async () => {
      mockPrisma.chartOfAccounts.findFirst.mockResolvedValue(null);

      const params = {
        expenseId: 'expense-id',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        categoryId: 'category-id',
        vendorId: 'vendor-id',
        currencyId: 'currency-id',
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id'
      };

      await expect(JournalEntryService.createExpenseJournalEntry(params))
        .rejects.toThrow('Expense account not found');
    });

    it('should throw error if VAT input account not found', async () => {
      mockPrisma.chartOfAccounts.findFirst
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(null);

      const params = {
        expenseId: 'expense-id',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        categoryId: 'category-id',
        vendorId: 'vendor-id',
        currencyId: 'currency-id',
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id'
      };

      await expect(JournalEntryService.createExpenseJournalEntry(params))
        .rejects.toThrow('VAT Input account not found');
    });

    it('should throw error if accounts payable account not found', async () => {
      mockPrisma.chartOfAccounts.findFirst
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(mockVATInputAccount)
        .mockResolvedValueOnce(null);

      const params = {
        expenseId: 'expense-id',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        categoryId: 'category-id',
        vendorId: 'vendor-id',
        currencyId: 'currency-id',
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id'
      };

      await expect(JournalEntryService.createExpenseJournalEntry(params))
        .rejects.toThrow('Accounts Payable account not found');
    });
  });

  describe('validateJournalEntryBalance', () => {
    it('should return true for balanced journal entry', () => {
      const journalEntryLines = [
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 145, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 1145 }
      ];

      const result = JournalEntryService.validateJournalEntryBalance(journalEntryLines);

      expect(result).toBe(true);
    });

    it('should return false for unbalanced journal entry', () => {
      const journalEntryLines = [
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 145, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 1000 } // Missing 145
      ];

      const result = JournalEntryService.validateJournalEntryBalance(journalEntryLines);

      expect(result).toBe(false);
    });

    it('should return true for empty journal entry lines', () => {
      const journalEntryLines: any[] = [];

      const result = JournalEntryService.validateJournalEntryBalance(journalEntryLines);

      expect(result).toBe(true);
    });
  });

  describe('getJournalEntryWithLines', () => {
    it('should return journal entry with lines', async () => {
      const mockJournalEntry = {
        id: 'journal-entry-id',
        transactionDate: new Date(),
        referenceNumber: 'JE-2024-001',
        description: 'Test entry',
        totalAmount: 1000,
        currencyId: 'currency-id',
        status: 'POSTED',
        createdById: 'user-id'
      };

      const mockLines = [
        { id: 'line-1', debitAmount: 1000, creditAmount: 0 },
        { id: 'line-2', debitAmount: 0, creditAmount: 1000 }
      ];

      mockPrisma.journalEntry.findUnique.mockResolvedValue(mockJournalEntry);
      mockPrisma.journalEntryLine.findMany.mockResolvedValue(mockLines);

      const result = await JournalEntryService.getJournalEntryWithLines('journal-entry-id');

      expect(result).toBeDefined();
      expect(result?.journalEntry).toEqual(mockJournalEntry);
      expect(result?.journalEntryLines).toEqual(mockLines);
    });

    it('should return null for non-existent journal entry', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(null);

      const result = await JournalEntryService.getJournalEntryWithLines('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getJournalEntriesByDateRange', () => {
    it('should return journal entries within date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const mockEntries = [
        { id: 'entry-1', transactionDate: new Date('2024-01-15') },
        { id: 'entry-2', transactionDate: new Date('2024-01-20') }
      ];

      mockPrisma.journalEntry.findMany.mockResolvedValue(mockEntries);

      const result = await JournalEntryService.getJournalEntriesByDateRange(startDate, endDate);

      expect(result).toEqual(mockEntries);
      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith({
        where: {
          transactionDate: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { transactionDate: 'desc' }
      });
    });
  });
}); 