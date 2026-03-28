// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import JournalEntryService from '../../services/JournalEntryService';

jest.mock('../../services/AuditTrailSequenceService', () => ({
  createJournalEntryWithAuditSequence: jest.fn(),
}));

jest.mock('../../services/AuditService', () => ({
  __esModule: true,
  default: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../utils/database', () => {
  const prisma = {
    journalEntry: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    journalEntryLine: { create: jest.fn(), findMany: jest.fn() },
    chartOfAccounts: { findFirst: jest.fn() },
  };
  return { prisma };
});

const { prisma: mockPrisma } = require('../../utils/database');
const { createJournalEntryWithAuditSequence } = require('../../services/AuditTrailSequenceService');

describe('JournalEntryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createExpenseJournalEntry', () => {
    const mockExpenseAccount = {
      id: 'expense-account-id',
      accountNo: '5070',
      accountName: 'Travel Expense',
      accountType: 'Expense',
    };

    const mockVATInputAccount = {
      id: 'vat-input-id',
      accountNo: '1101',
      accountName: 'VAT Input',
      accountType: 'Current Asset',
    };

    const mockBankGlAccount = {
      id: 'bank-gl-id',
      accountNo: '1000',
      accountName: 'Cash and Cash Equivalents',
      accountType: 'Current Asset',
    };

    const mockJournalEntry = {
      id: 'journal-entry-id',
      transactionDate: new Date(),
      referenceNumber: 'JE-2024-001',
      description: 'Expense transaction',
      totalAmount: 1145,
      currencyId: 'currency-id',
      status: 'PENDING',
      createdById: 'user-id',
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
        chartOfAccountId: 'bank-gl-id',
        debitAmount: 0,
        creditAmount: 1145,
        description: 'Cash and Cash Equivalents: Legal Fees',
        vatAmount: 0,
      }
    ];

    beforeEach(() => {
      mockPrisma.chartOfAccounts.findFirst
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(mockVATInputAccount)
        .mockResolvedValueOnce(mockBankGlAccount);

      createJournalEntryWithAuditSequence.mockResolvedValue(mockJournalEntry);

      mockPrisma.journalEntryLine.create
        .mockResolvedValueOnce(mockJournalEntryLines[0])
        .mockResolvedValueOnce(mockJournalEntryLines[1])
        .mockResolvedValueOnce(mockJournalEntryLines[2]);
    });

    it('should create expense journal entry with VAT correctly', async () => {
      const params = {
        vendorId: 'vendor-id',
        categoryName: 'Travel and Accommodation',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        currencyId: 'currency-id',
        transactionDate: new Date('2024-06-01'),
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id',
        paymentMethod: 'BANK' as const,
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

      // Verify bank / cash equivalent credit
      expect(result.journalEntryLines[2].chartOfAccountId).toBe('bank-gl-id');
      expect(result.journalEntryLines[2].debitAmount).toBe(0);
      expect(result.journalEntryLines[2].creditAmount).toBe(1145);
    });

    it('should create expense journal entry without VAT for non-taxable expenses', async () => {
      mockPrisma.chartOfAccounts.findFirst
        .mockReset()
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(mockVATInputAccount)
        .mockResolvedValueOnce(mockBankGlAccount);
      createJournalEntryWithAuditSequence.mockResolvedValue({
        ...mockJournalEntry,
        totalAmount: 1000,
      });
      mockPrisma.journalEntryLine.create
        .mockReset()
        .mockResolvedValueOnce({ ...mockJournalEntryLines[0], debitAmount: 1000, creditAmount: 0 })
        .mockResolvedValueOnce({
          ...mockJournalEntryLines[2],
          debitAmount: 0,
          creditAmount: 1000,
          chartOfAccountId: 'bank-gl-id',
        });

      const params = {
        vendorId: 'vendor-id',
        categoryName: 'Travel and Accommodation',
        amount: 1000,
        vatAmount: 0,
        totalAmount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date('2024-06-01'),
        isTaxable: false,
        description: 'Legal Fees',
        createdById: 'user-id',
        paymentMethod: 'BANK' as const,
      };

      const result = await JournalEntryService.createExpenseJournalEntry(params);

      expect(result).toBeDefined();
      expect(result.journalEntryLines).toHaveLength(2);
      expect(result.journalEntryLines[0].debitAmount).toBe(1000);
      expect(result.journalEntryLines[0].creditAmount).toBe(0);
      expect(result.journalEntryLines[1].debitAmount).toBe(0);
      expect(result.journalEntryLines[1].creditAmount).toBe(1000);
    });

    it('should throw error if expense account not found', async () => {
      mockPrisma.chartOfAccounts.findFirst.mockReset().mockResolvedValue(null);

      const params = {
        vendorId: 'vendor-id',
        categoryName: 'Travel and Accommodation',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        currencyId: 'currency-id',
        transactionDate: new Date('2024-06-01'),
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id',
        paymentMethod: 'BANK' as const,
      };

      await expect(JournalEntryService.createExpenseJournalEntry(params)).rejects.toThrow(
        'Expense account 5070 not found in chart of accounts'
      );
    });

    it('should throw error if VAT input account not found', async () => {
      mockPrisma.chartOfAccounts.findFirst
        .mockReset()
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(null);

      const params = {
        vendorId: 'vendor-id',
        categoryName: 'Travel and Accommodation',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        currencyId: 'currency-id',
        transactionDate: new Date('2024-06-01'),
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id',
        paymentMethod: 'BANK' as const,
      };

      await expect(JournalEntryService.createExpenseJournalEntry(params)).rejects.toThrow(
        'No VAT Input account found in chart of accounts'
      );
    });

    it('should throw error if bank GL account not found for BANK payment', async () => {
      mockPrisma.chartOfAccounts.findFirst
        .mockReset()
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(mockVATInputAccount)
        .mockResolvedValueOnce(null);

      const params = {
        vendorId: 'vendor-id',
        categoryName: 'Travel and Accommodation',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        currencyId: 'currency-id',
        transactionDate: new Date('2024-06-01'),
        isTaxable: true,
        description: 'Legal Fees',
        createdById: 'user-id',
        paymentMethod: 'BANK' as const,
      };

      await expect(JournalEntryService.createExpenseJournalEntry(params)).rejects.toThrow(
        'No Cash and Cash Equivalents account found in chart of accounts'
      );
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
      const baseJe = {
        id: 'journal-entry-id',
        transactionDate: new Date(),
        referenceNumber: 'JE-2024-001',
        description: 'Test entry',
        totalAmount: 1000,
        currencyId: 'currency-id',
        status: 'POSTED',
        createdById: 'user-id',
        createdAt: new Date(),
        createdBy: { id: 'user-id', email: 'u@test.com', firstName: 'U', lastName: 'Ser' },
        journalEntryLines: [
          { id: 'line-1', debitAmount: 1000, creditAmount: 0, paymentMethod: null },
          { id: 'line-2', debitAmount: 0, creditAmount: 1000, paymentMethod: null },
        ],
        expenses: [],
        revenues: [],
        invoices: [],
        cashbookEntries: [],
      };

      mockPrisma.journalEntry.findUnique.mockResolvedValue(baseJe);

      const result = await JournalEntryService.getJournalEntryWithLines('journal-entry-id');

      expect(result).toBeDefined();
      expect(result?.journalEntry.id).toBe('journal-entry-id');
      expect(result?.journalEntryLines).toHaveLength(2);
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
        {
          id: 'entry-1',
          transactionDate: new Date('2024-01-15'),
          referenceNumber: 'JE-1',
          journalEntryLines: [],
          expenses: [],
          revenues: [],
          invoices: [],
          cashbookEntries: [],
        },
        {
          id: 'entry-2',
          transactionDate: new Date('2024-01-20'),
          referenceNumber: 'JE-2',
          journalEntryLines: [],
          expenses: [],
          revenues: [],
          invoices: [],
          cashbookEntries: [],
        },
      ];

      mockPrisma.journalEntry.findMany.mockResolvedValue(mockEntries);

      const result = await JournalEntryService.getJournalEntriesByDateRange(startDate, endDate);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('entry-1');
      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalled();
      const arg = mockPrisma.journalEntry.findMany.mock.calls[0][0];
      expect(arg.where.transactionDate).toEqual({ gte: startDate, lte: endDate });
      expect(arg.where.status).toBe('POSTED');
      expect(arg.orderBy).toEqual({ transactionDate: 'desc' });
    });
  });
}); 