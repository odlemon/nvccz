// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import ExpenseService, { CreateExpenseParams } from "../services/ExpenseService";

export class ExpenseController {
  /**
   * Create a new expense
   */
  async createExpense(req: AuthRequest, res: Response) {
    try {
      const {
        vendorId,
        categoryId,
        amount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable
      } = req.body;

      // Validate required fields
      if (!vendorId || !categoryId || !amount || !currencyId || !transactionDate || !description) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: vendorId, categoryId, amount, currencyId, transactionDate, description"
        });
      }

      const expenseParams: CreateExpenseParams = {
        vendorId,
        categoryId,
        amount: parseFloat(amount),
        currencyId,
        transactionDate: new Date(transactionDate),
        description,
        receiptNumber,
        isTaxable: Boolean(isTaxable),
        createdById: req.user!.id
      };

      const expense = await ExpenseService.createExpense(expenseParams);

      res.status(201).json({
        success: true,
        message: "Expense created successfully",
        data: expense
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to create expense",
        error: error.message
      });
    }
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const expense = await ExpenseService.getExpenseById(id);

      if (!expense) {
        return res.status(404).json({
          success: false,
          message: "Expense not found"
        });
      }

      res.status(200).json({
        success: true,
        data: expense
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get expense",
        error: error.message
      });
    }
  }

  /**
   * Get all expenses with filtering and pagination
   */
  async getExpenses(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        vendorId,
        categoryId,
        currencyId,
        startDate,
        endDate,
        status
      } = req.query;

      const params = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        vendorId: vendorId as string,
        categoryId: categoryId as string,
        currencyId: currencyId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        status: status as string
      };

      const result = await ExpenseService.getExpenses(params);

      res.status(200).json({
        success: true,
        data: result.expenses,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get expenses",
        error: error.message
      });
    }
  }

  /**
   * Update an expense
   * Now supports updating both DRAFT and POSTED expenses with proper double-entry bookkeeping
   */
  async updateExpense(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated
      delete updateData.id;
      delete updateData.createdById;
      delete updateData.createdAt;
      delete updateData.updatedAt;
      delete updateData.journalEntryId; // Don't allow direct journal entry updates

      // Convert amount to number if provided
      if (updateData.amount) {
        updateData.amount = parseFloat(updateData.amount);
      }

      // Convert transactionDate to Date if provided
      if (updateData.transactionDate) {
        updateData.transactionDate = new Date(updateData.transactionDate);
      }

      // Convert isTaxable to boolean if provided
      if (updateData.isTaxable !== undefined) {
        updateData.isTaxable = Boolean(updateData.isTaxable);
      }

      const updatedExpense = await ExpenseService.updateExpense(id, updateData);

      res.status(200).json({
        success: true,
        message: "Expense updated successfully",
        data: updatedExpense
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update expense",
        error: error.message
      });
    }
  }

  /**
   * Delete an expense (soft delete)
   */
  async deleteExpense(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      await ExpenseService.deleteExpense(id);

      res.status(200).json({
        success: true,
        message: "Expense deleted successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete expense",
        error: error.message
      });
    }
  }

  /**
   * Get expense summary statistics
   */
  async getExpenseSummary(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.query;

      const params = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        currencyId: currencyId as string
      };

      const summary = await ExpenseService.getExpenseSummary(params);

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get expense summary",
        error: error.message
      });
    }
  }

  /**
   * Calculate VAT for a given amount (preview)
   */
  async calculateVAT(req: AuthRequest, res: Response) {
    try {
      const { amount, isTaxable } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: "Amount is required"
        });
      }

      const numericAmount = parseFloat(amount);
      const taxable = Boolean(isTaxable);

      // Import VATService here to avoid circular dependency
      const { VATService } = await import("../services/VATService");

      const vatAmount = VATService.isVATEligible(numericAmount, taxable) 
        ? VATService.calculateVAT(numericAmount) 
        : 0;
      const totalAmount = numericAmount + vatAmount;

      res.status(200).json({
        success: true,
        data: {
          baseAmount: numericAmount,
          vatAmount,
          totalAmount,
          vatRate: VATService.getVATRate(),
          isTaxable: taxable
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to calculate VAT",
        error: error.message
      });
    }
  }
}

export const expenseController = new ExpenseController(); 