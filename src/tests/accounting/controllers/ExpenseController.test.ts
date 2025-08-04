// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';
import { ExpenseController } from '../../../controllers/ExpenseController';
import ExpenseService from '../../../services/ExpenseService';

// Mock the ExpenseService
jest.mock('../../../services/accounting/ExpenseService');

describe('ExpenseController', () => {
  let expenseController: ExpenseController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    expenseController = new ExpenseController();
    mockNext = jest.fn();
    
    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: { id: 'user-id', email: 'test@example.com' }
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('createExpense', () => {
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
      status: 'POSTED',
      journalEntryId: 'journal-entry-id',
      createdById: 'user-id'
    };

    beforeEach(() => {
      (ExpenseService.createExpense as jest.Mock).mockResolvedValue(mockExpense);
    });

    it('should create expense successfully', async () => {
      mockRequest.body = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        receiptNumber: 'RCP-001',
        isTaxable: true
      };

      await expenseController.createExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(ExpenseService.createExpense).toHaveBeenCalledWith({
        ...mockRequest.body,
        createdById: 'user-id'
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Expense created successfully',
        data: mockExpense
      });
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Vendor ID is required');
      (ExpenseService.createExpense as jest.Mock).mockRejectedValue(validationError);

      mockRequest.body = {
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      await expenseController.createExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(validationError);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      (ExpenseService.createExpense as jest.Mock).mockRejectedValue(dbError);

      mockRequest.body = {
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        amount: 1000,
        currencyId: 'currency-id',
        transactionDate: new Date(),
        description: 'Legal consultation',
        isTaxable: true
      };

      await expenseController.createExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(dbError);
    });
  });

  describe('getExpenses', () => {
    const mockExpenses = [
      {
        id: 'expense-1',
        amount: 1000,
        vatAmount: 145,
        totalAmount: 1145,
        vendor: { name: 'Test Vendor' },
        category: { name: 'Legal Fees' },
        currency: { code: 'USD' }
      },
      {
        id: 'expense-2',
        amount: 2000,
        vatAmount: 290,
        totalAmount: 2290,
        vendor: { name: 'Another Vendor' },
        category: { name: 'Travel' },
        currency: { code: 'USD' }
      }
    ];

    const mockPagination = {
      page: 1,
      limit: 10,
      total: 2,
      pages: 1
    };

    beforeEach(() => {
      (ExpenseService.getExpenses as jest.Mock).mockResolvedValue({
        expenses: mockExpenses,
        pagination: mockPagination
      });
    });

    it('should return expenses with pagination', async () => {
      mockRequest.query = {
        page: '1',
        limit: '10',
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      await expenseController.getExpenses(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(ExpenseService.getExpenses).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        vendorId: 'vendor-id',
        categoryId: 'category-id',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          expenses: mockExpenses,
          pagination: mockPagination
        }
      });
    });

    it('should handle service errors', async () => {
      const serviceError = new Error('Failed to fetch expenses');
      (ExpenseService.getExpenses as jest.Mock).mockRejectedValue(serviceError);

      await expenseController.getExpenses(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(serviceError);
    });
  });

  describe('getExpenseById', () => {
    const mockExpense = {
      id: 'expense-id',
      amount: 1000,
      vatAmount: 145,
      totalAmount: 1145,
      vendor: { name: 'Test Vendor' },
      category: { name: 'Legal Fees' },
      currency: { code: 'USD' },
      journalEntry: {
        id: 'journal-entry-id',
        journalEntryLines: [
          { debitAmount: 1000, creditAmount: 0 },
          { debitAmount: 145, creditAmount: 0 },
          { debitAmount: 0, creditAmount: 1145 }
        ]
      }
    };

    beforeEach(() => {
      (ExpenseService.getExpenseById as jest.Mock).mockResolvedValue(mockExpense);
    });

    it('should return expense by ID', async () => {
      mockRequest.params = { id: 'expense-id' };

      await expenseController.getExpenseById(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(ExpenseService.getExpenseById).toHaveBeenCalledWith('expense-id');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockExpense
      });
    });

    it('should return 404 for non-existent expense', async () => {
      (ExpenseService.getExpenseById as jest.Mock).mockResolvedValue(null);
      mockRequest.params = { id: 'non-existent-id' };

      await expenseController.getExpenseById(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Expense not found'
      });
    });
  });

  describe('calculateVAT', () => {
    it('should calculate VAT preview correctly', async () => {
      mockRequest.body = {
        amount: 1000,
        isTaxable: true
      };

      await expenseController.calculateVAT(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          amount: 1000,
          vatRate: 14.5,
          vatAmount: 145,
          totalAmount: 1145,
          isTaxable: true
        }
      });
    });

    it('should handle non-taxable amounts', async () => {
      mockRequest.body = {
        amount: 1000,
        isTaxable: false
      };

      await expenseController.calculateVAT(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          amount: 1000,
          vatRate: 14.5,
          vatAmount: 0,
          totalAmount: 1000,
          isTaxable: false
        }
      });
    });

    it('should validate required fields', async () => {
      mockRequest.body = {
        isTaxable: true
      };

      await expenseController.calculateVAT(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Amount is required'
      });
    });

    it('should validate amount is positive', async () => {
      mockRequest.body = {
        amount: -100,
        isTaxable: true
      };

      await expenseController.calculateVAT(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Amount must be greater than 0'
      });
    });
  });

  describe('updateExpense', () => {
    const mockUpdatedExpense = {
      id: 'expense-id',
      amount: 1500,
      vatAmount: 217.5,
      totalAmount: 1717.5,
      description: 'Updated legal consultation',
      status: 'POSTED'
    };

    beforeEach(() => {
      (ExpenseService.updateExpense as jest.Mock).mockResolvedValue(mockUpdatedExpense);
    });

    it('should update expense successfully', async () => {
      mockRequest.params = { id: 'expense-id' };
      mockRequest.body = {
        amount: 1500,
        description: 'Updated legal consultation',
        isTaxable: true
      };

      await expenseController.updateExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(ExpenseService.updateExpense).toHaveBeenCalledWith('expense-id', {
        amount: 1500,
        description: 'Updated legal consultation',
        isTaxable: true
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Expense updated successfully',
        data: mockUpdatedExpense
      });
    });

    it('should handle non-existent expense', async () => {
      (ExpenseService.updateExpense as jest.Mock).mockRejectedValue(
        new Error('Expense not found')
      );

      mockRequest.params = { id: 'non-existent-id' };
      mockRequest.body = { amount: 1500 };

      await expenseController.updateExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('deleteExpense', () => {
    beforeEach(() => {
      (ExpenseService.deleteExpense as jest.Mock).mockResolvedValue(true);
    });

    it('should delete expense successfully', async () => {
      mockRequest.params = { id: 'expense-id' };

      await expenseController.deleteExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(ExpenseService.deleteExpense).toHaveBeenCalledWith('expense-id');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Expense deleted successfully'
      });
    });

    it('should handle non-existent expense', async () => {
      (ExpenseService.deleteExpense as jest.Mock).mockRejectedValue(
        new Error('Expense not found')
      );

      mockRequest.params = { id: 'non-existent-id' };

      await expenseController.deleteExpense(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getExpenseSummary', () => {
    const mockSummary = {
      totalExpenses: 5000,
      totalVAT: 725,
      expenseCount: 5,
      averageExpense: 1000,
      topCategories: [
        { name: 'Legal Fees', total: 2000 },
        { name: 'Travel', total: 1500 }
      ]
    };

    beforeEach(() => {
      (ExpenseService.getExpenseSummary as jest.Mock).mockResolvedValue(mockSummary);
    });

    it('should return expense summary', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      await expenseController.getExpenseSummary(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      expect(ExpenseService.getExpenseSummary).toHaveBeenCalledWith({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockSummary
      });
    });
  });
}); 