// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ExpenseService from '../../services/ExpenseService';
import VATService from '../../services/VATService';
import JournalEntryService from '../../services/JournalEntryService';

// Mock dependencies
jest.mock('../../services/VATService');
jest.mock('../../services/JournalEntryService');
jest.mock('../../utils/database', () => {
  const prisma = {
    expense: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    vendor: { findUnique: jest.fn() },
    expenseCategory: { findUnique: jest.fn() },
    currency: { findUnique: jest.fn() },
  };
  return { prisma };
});

const { prisma: mockPrisma } = require('../../utils/database');

describe('ExpenseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createExpense', () => {
    const mockVendor = {
      id: 'vendor-id',
      name: 'Test Vendor',
      isActive: true
    };

    const mockCategory = {
      id: 'category-id',
      name: 'Legal Fees',
      isActive: true
    };

    const mockCurrency = {
      id: 'currency-id',
      code: 'USD',
      isActive: true
    };

    const mockExpense = {
      id: 'expense-id',
      vendorId: 'vendor-id',
      categoryId: 'category-id',
      amount: 1000,
      vatAmount: 145,
      totalAmount: 1145,
      currencyId: 'currency-id',
      transactionDate: new Date(),
      description: 'Legal consultation',
      receiptNumber: 'RCP-001',
      isTaxable: true,
      status: 'DRAFT',
      journalEntryId: null,
      createdById: 'user-id'
    };

    const mockUpdatedExpense = {
      ...mockExpense,
      status: 'POSTED',
      journalEntryId: 'journal-entry-id'
    };

    const mockJournalEntryResult = {
      journalEntry: { id: 'journal-entry-id' },
      journalEntryLines: [
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 145, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 1145 }
      ]
    };

    beforeEach(() => {
      // Mock VAT calculation
      (VATService.calculateVAT as jest.Mock).mockReturnValue(155);
      (VATService.isVATEligible as jest.Mock).mockReturnValue(true);

      // Mock account lookups
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrisma.expenseCategory.findUnique.mockResolvedValue(mockCategory);
      mockPrisma.currency.findUnique.mockResolvedValue(mockCurrency);

      // Mock expense creation
      mockPrisma.expense.create.mockResolvedValue(mockExpense);
      mockPrisma.expense.update.mockResolvedValue(mockUpdatedExpense);

      // Mock journal entry creation
      (JournalEntryService.createExpenseJournalEntry as jest.Mock).mockResolvedValue(mockJournalEntryResult);
    });

    it('should create expense with VAT correctly', async () => {
      const params = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      const result = await ExpenseService.createExpense(params);

      expect(result).toBeDefined();
      expect(result.amount).toBe(1000);
      expect(result.vatAmount).toBe(145);
      expect(result.totalAmount).toBe(1145);
      expect(result.status).toBe('POSTED');
      expect(result.journalEntryId).toBe('journal-entry-id');

      // Verify VAT calculation was called
      expect(VATService.calculateVAT).toHaveBeenCalledWith(1000);
      expect(VATService.isVATEligible).toHaveBeenCalledWith(1000, true);

      // Verify journal entry creation was called
      expect(JournalEntryService.createExpenseJournalEntry).toHaveBeenCalledWith({
        expenseId: 'expense-id',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        categoryId: 'category-id',
        vendorId: 'vendor-id',
        currencyId: 'currency-id',
        isTaxable: true,
        description: 'Legal consultation',
        createdById: 'user-id'
      });
    });

    it('should create expense without VAT for non-taxable expenses', async () => {
      (VATService.isVATEligible as jest.Mock).mockReturnValue(false);

      const params = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: false,
        createdById: 'user-id'
      };

      const result = await ExpenseService.createExpense(params);

      expect(result.vatAmount).toBe(0);
      expect(result.totalAmount).toBe(1000);

      // Verify VAT calculation was not called
      expect(VATService.calculateVAT).not.toHaveBeenCalled();
    });

    it('should throw error if vendor not found', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue(null);

      const params = {
        vendorId: 'non-existent-vendor',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      await expect(ExpenseService.createExpense(params))
        .rejects.toThrow('Vendor not found');
    });

    it('should throw error if vendor is inactive', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue({
        ...mockVendor,
        isActive: false
      });

      const params = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      await expect(ExpenseService.createExpense(params))
        .rejects.toThrow('Vendor is inactive');
    });

    it('should throw error if category not found', async () => {
      mockPrisma.expenseCategory.findUnique.mockResolvedValue(null);

      const params = {
        vendorId: 'vendor-id',
        categoryId: 'non-existent-category',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      await expect(ExpenseService.createExpense(params))
        .rejects.toThrow('Expense category not found');
    });

    it('should throw error if category is inactive', async () => {
      mockPrisma.expenseCategory.findUnique.mockResolvedValue({
        ...mockCategory,
        isActive: false
      });

      const params = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      await expect(ExpenseService.createExpense(params))
        .rejects.toThrow('Expense category is inactive');
    });

    it('should throw error if currency not found', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue(null);

      const params = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'non-existent-currency',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      await expect(ExpenseService.createExpense(params))
        .rejects.toThrow('Currency not found');
    });

    it('should throw error if currency is inactive', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue({
        ...mockCurrency,
        isActive: false
      });

      const params = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true,
        createdById: 'user-id'
      };

      await expect(ExpenseService.createExpense(params))
        .rejects.toThrow('Currency is inactive');
    });
  });

  describe('validateExpenseData', () => {
    it('should return true for valid expense data', () => {
      const data = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      const result = ExpenseService.validateExpenseData(data);

      expect(result).toBe(true);
    });

    it('should throw error for missing vendorId', () => {
      const data = {
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      expect(() => ExpenseService.validateExpenseData(data))
        .toThrow('Vendor ID is required');
    });

    it('should throw error for missing categoryId', () => {
      const data = {
        vendorId: 'vendor-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      expect(() => ExpenseService.validateExpenseData(data))
        .toThrow('Category ID is required');
    });

    it('should throw error for missing amount', () => {
      const data = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      expect(() => ExpenseService.validateExpenseData(data))
        .toThrow('Amount is required');
    });

    it('should throw error for invalid amount', () => {
      const data = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: -100,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      expect(() => ExpenseService.validateExpenseData(data))
        .toThrow('Amount must be greater than 0');
    });

    it('should throw error for missing currencyId', () => {
      const data = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      expect(() => ExpenseService.validateExpenseData(data))
        .toThrow('Currency ID is required');
    });

    it('should throw error for missing transactionDate', () => {
      const data = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        description: 'Legal consultation',
        isTaxable: true
      };

      expect(() => ExpenseService.validateExpenseData(data))
        .toThrow('Transaction date is required');
    });
  });

  describe('getExpenseById', () => {
    it('should return expense with relations', async () => {
      const mockExpense = {
        id: 'expense-id',
        vendor: { name: 'Test Vendor' },
        category: { name: 'Legal Fees' },
        currency: { code: 'USD' },
        journalEntry: { id: 'journal-entry-id' }
      };

      mockPrisma.expense.findUnique.mockResolvedValue(mockExpense);

      const result = await ExpenseService.getExpenseById('expense-id');

      expect(result).toEqual(mockExpense);
      expect(mockPrisma.expense.findUnique).toHaveBeenCalledWith({
        where: { id: 'expense-id' },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            include: {
              journalEntryLines: {
                include: {
                  chartOfAccounts: true
                }
              }
            }
          }
        }
      });
    });

    it('should return null for non-existent expense', async () => {
      mockPrisma.expense.findUnique.mockResolvedValue(null);

      const result = await ExpenseService.getExpenseById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getExpenses', () => {
    it('should return expenses with pagination', async () => {
      const mockExpenses = [
        { id: 'expense-1', amount: 1000 },
        { id: 'expense-2', amount: 2000 }
      ];

      mockPrisma.expense.findMany.mockResolvedValue(mockExpenses);
      mockPrisma.expense.count.mockResolvedValue(2);

      const result = await ExpenseService.getExpenses({
        page: 1,
        limit: 10,
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });

      expect(result.expenses).toEqual(mockExpenses);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('getExpenseSummary', () => {
    it('should return expense summary statistics', async () => {
      const mockSummary = {
        totalExpenses: 5000,
        totalVAT: 725,
        expenseCount: 5,
        averageExpense: 1000
      };

      mockPrisma.expense.aggregate.mockResolvedValue({
        _sum: { amount: 5000, vatAmount: 725 },
        _count: { id: 5 },
        _avg: { amount: 1000 }
      });

      const result = await ExpenseService.getExpenseSummary({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });

      expect(result.totalExpenses).toBe(5000);
      expect(result.totalVAT).toBe(725);
      expect(result.expenseCount).toBe(5);
      expect(result.averageExpense).toBe(1000);
    });
  });
}); 