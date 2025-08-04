// @ts-nocheck
import { PrismaClient, Expense, Vendor, ExpenseCategory, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { dbConnection } from "../utils/database";
import VATService from "./VATService";
import JournalEntryService, { CreateExpenseJournalEntryParams } from "./JournalEntryService";

const prisma = dbConnection.getPrismaClient();

export interface CreateExpenseParams {
  vendorId: string;
  categoryId: string;
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  receiptNumber?: string;
  isTaxable: boolean;
  createdById: string;
}

export interface ExpenseWithRelations extends Expense {
  vendor: Vendor;
  category: ExpenseCategory;
  currency: Currency;
  journalEntry?: {
    id: string;
    referenceNumber: string;
    status: string;
  } | null;
}

export class ExpenseService {
  /**
   * Create a new expense with automatic VAT calculation and journal entry creation
   */
  static async createExpense(params: CreateExpenseParams): Promise<ExpenseWithRelations> {
    try {
      const {
        vendorId,
        categoryId,
        amount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable,
        createdById
      } = params;

      // Validate input parameters
      if (!amount || amount <= 0) {
        throw new Error("Amount must be greater than zero");
      }
      if (!description || description.trim().length === 0) {
        throw new Error("Description is required");
      }
      // Validate that vendor, category, and currency exist
      await this.validateExpenseData(vendorId, categoryId, currencyId);

      // Calculate VAT if taxable (as number)
      const vatAmount: number = VATService.isVATEligible(amount, isTaxable)
        ? VATService.calculateVAT(amount)
        : 0;
      const totalAmount: number = Number(amount) + Number(vatAmount);

      // Create the expense record (convert to Decimal at DB write)
      const expense = await prisma.expense.create({
        data: {
          vendorId,
          categoryId,
          amount: new Decimal(amount),
          vatAmount: new Decimal(vatAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          transactionDate,
          description,
          receiptNumber,
          isTaxable,
          status: "DRAFT",
          createdById
        },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      // Create journal entry for double-entry bookkeeping
      const journalEntryParams: CreateExpenseJournalEntryParams = {
        vendorId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable,
        createdById
      };
      const journalEntryResult = await JournalEntryService.createExpenseJournalEntry(journalEntryParams);

      // Update the expense with the journal entry reference
      const updatedExpense = await prisma.expense.update({
        where: { id: expense.id },
        data: {
          journalEntryId: journalEntryResult.journalEntry.id,
          status: "POSTED"
        },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });
      return updatedExpense;
    } catch (error) {
      console.error("Error creating expense:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to create expense. Please try again.");
    }
  }

  /**
   * Validate that vendor, category, and currency exist and are active
   */
  private static async validateExpenseData(vendorId: string, categoryId: string, currencyId: string): Promise<void> {
    const [vendor, category, currency] = await Promise.all([
      prisma.vendor.findUnique({ where: { id: vendorId } }),
      prisma.expenseCategory.findUnique({ where: { id: categoryId } }),
      prisma.currency.findUnique({ where: { id: currencyId } })
    ]);

    if (!vendor || !vendor.isActive) {
      throw new Error("Vendor not found or inactive");
    }

    if (!category || !category.isActive) {
      throw new Error("Expense category not found or inactive");
    }

    if (!currency || !currency.isActive) {
      throw new Error("Currency not found or inactive");
    }
  }

  /**
   * Get expense by ID with all relations
   */
  static async getExpenseById(id: string): Promise<ExpenseWithRelations | null> {
    return await prisma.expense.findUnique({
      where: { 
        id,
        isActive: true // Only return active expenses
      },
      include: {
        vendor: true,
        category: true,
        currency: true,
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            status: true
          }
        }
      }
    });
  }

  /**
   * Get all expenses with pagination and filtering
   */
  static async getExpenses(params: {
    page?: number;
    limit?: number;
    vendorId?: string;
    categoryId?: string;
    currencyId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }): Promise<{
    expenses: ExpenseWithRelations[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      vendorId,
      categoryId,
      currencyId,
      startDate,
      endDate,
      status
    } = params;

    const where: any = { isActive: true }; // Only show active expenses by default

    if (vendorId) where.vendorId = vendorId;
    if (categoryId) where.categoryId = categoryId;
    if (currencyId) where.currencyId = currencyId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = startDate;
      if (endDate) where.transactionDate.lte = endDate;
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        },
        orderBy: {
          transactionDate: 'desc'
        },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.expense.count({ where })
    ]);

    return {
      expenses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Update an expense with proper double-entry bookkeeping
   * For DRAFT expenses: Direct update
   * For POSTED expenses: Create reversal entry, update expense, create new entry
   */
  static async updateExpense(id: string, updateData: Partial<CreateExpenseParams>): Promise<ExpenseWithRelations> {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { journalEntry: true }
    });

    if (!expense) {
      throw new Error("Expense not found");
    }

    // Remove journalEntryId from updateData to prevent direct manipulation
    delete updateData.journalEntryId;

    // For DRAFT expenses, allow direct updates
    if (expense.status === "DRAFT") {
      // Recalculate VAT and total if amount or taxable status changed
      let vatAmount = Number(expense.vatAmount);
      let totalAmount = Number(expense.totalAmount);

      if (updateData.amount !== undefined || updateData.isTaxable !== undefined) {
        const newAmount = Number(updateData.amount ?? expense.amount);
        const newIsTaxable = updateData.isTaxable ?? expense.isTaxable;
        vatAmount = VATService.isVATEligible(newAmount, newIsTaxable)
          ? VATService.calculateVAT(newAmount)
          : 0;
        totalAmount = newAmount + vatAmount;
      }

      const updatedExpense = await prisma.expense.update({
        where: { id },
        data: {
          ...updateData,
          vatAmount: new Decimal(vatAmount),
          totalAmount: new Decimal(totalAmount)
        },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      return updatedExpense;
    }

    // For POSTED expenses, implement double-entry bookkeeping workflow
    if (expense.status === "POSTED") {
      // Check if there are financial changes that require journal entry updates
      const hasFinancialChanges = 
        updateData.amount !== undefined || 
        updateData.isTaxable !== undefined || 
        updateData.categoryId !== undefined;

      // If no financial changes, just update non-financial fields directly
      if (!hasFinancialChanges) {
        const updatedExpense = await prisma.expense.update({
          where: { id },
          data: updateData,
          include: {
            vendor: true,
            category: true,
            currency: true,
            journalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true
              }
            }
          }
        });

        return updatedExpense;
      }

      // For financial changes, implement the reversal workflow
      const newAmount = Number(updateData.amount ?? expense.amount);
      const newIsTaxable = updateData.isTaxable ?? expense.isTaxable;
      const newCategoryId = updateData.categoryId ?? expense.categoryId;
      
      // Calculate new VAT and total amounts
      const newVatAmount = VATService.isVATEligible(newAmount, newIsTaxable)
        ? VATService.calculateVAT(newAmount)
        : 0;
      const newTotalAmount = newAmount + newVatAmount;

      // Step 1: Create reversal journal entry using original expense data
      const reversalParams: CreateExpenseJournalEntryParams = {
        vendorId: expense.vendorId,
        categoryId: expense.categoryId,
        amount: Number(expense.amount),
        vatAmount: Number(expense.vatAmount),
        totalAmount: Number(expense.totalAmount),
        currencyId: expense.currencyId,
        transactionDate: expense.transactionDate,
        description: expense.description,
        receiptNumber: expense.receiptNumber || undefined,
        isTaxable: expense.isTaxable,
        createdById: expense.createdById
      };

      const reversalResult = await JournalEntryService.createReversalJournalEntry(reversalParams);

      // Step 2: Update the expense with new amounts and temporarily link to reversal
      const updatedExpense = await prisma.expense.update({
        where: { id },
        data: {
          ...updateData,
          amount: new Decimal(newAmount),
          vatAmount: new Decimal(newVatAmount),
          totalAmount: new Decimal(newTotalAmount),
          journalEntryId: reversalResult.journalEntry.id // Temporarily link to reversal
        },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      // Step 3: Create new journal entry with updated amounts
      const newJournalEntryParams: CreateExpenseJournalEntryParams = {
        vendorId: updatedExpense.vendorId,
        categoryId: newCategoryId,
        amount: newAmount,
        vatAmount: newVatAmount,
        totalAmount: newTotalAmount,
        currencyId: updatedExpense.currencyId,
        transactionDate: updatedExpense.transactionDate,
        description: updatedExpense.description,
        receiptNumber: updatedExpense.receiptNumber || undefined,
        isTaxable: newIsTaxable,
        createdById: updatedExpense.createdById
      };

      const newJournalResult = await JournalEntryService.createExpenseJournalEntry(newJournalEntryParams);

      // Step 4: Update expense to link to the new journal entry
      const finalExpense = await prisma.expense.update({
        where: { id },
        data: {
          journalEntryId: newJournalResult.journalEntry.id
        },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      return finalExpense;
    }

    throw new Error("Cannot update expense with current status");
  }

  /**
   * Delete an expense (soft delete)
   * For DRAFT expenses: Direct soft delete
   * For POSTED expenses: Create reversal entry, then soft delete
   */
  static async deleteExpense(id: string): Promise<void> {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { journalEntry: true }
    });

    if (!expense) {
      throw new Error("Expense not found");
    }

    // For DRAFT expenses, just soft delete
    if (expense.status === "DRAFT") {
      await prisma.expense.update({
        where: { id },
        data: { isActive: false }
      });
      return;
    }

    // For POSTED expenses, create reversal entry before soft delete
    if (expense.status === "POSTED") {
      // Create reversal journal entry to cancel the original transaction
      const reversalParams: CreateExpenseJournalEntryParams = {
        vendorId: expense.vendorId,
        categoryId: expense.categoryId,
        amount: Number(expense.amount),
        vatAmount: Number(expense.vatAmount),
        totalAmount: Number(expense.totalAmount),
        currencyId: expense.currencyId,
        transactionDate: expense.transactionDate,
        description: expense.description,
        receiptNumber: expense.receiptNumber || undefined,
        isTaxable: expense.isTaxable,
        createdById: expense.createdById
      };

      await JournalEntryService.createReversalJournalEntry(reversalParams);

      // Soft delete the expense
      await prisma.expense.update({
        where: { id },
        data: { isActive: false }
      });
      return;
    }

    throw new Error("Cannot delete expense with current status");
  }

  /**
   * Get expense summary statistics
   */
  static async getExpenseSummary(params: {
    startDate?: Date;
    endDate?: Date;
    currencyId?: string;
  }): Promise<{
    totalExpenses: number;
    totalVAT: number;
    averageExpense: number;
    expenseCount: number;
    byCategory: Array<{
      categoryName: string;
      total: number;
      count: number;
    }>;
    byVendor: Array<{
      vendorName: string;
      total: number;
      count: number;
    }>;
  }> {
    const { startDate, endDate, currencyId } = params;

    const where: any = { status: "POSTED", isActive: true };
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = startDate;
      if (endDate) where.transactionDate.lte = endDate;
    }
    if (currencyId) where.currencyId = currencyId;

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: true,
        vendor: true
      }
    });

    const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.totalAmount.toString()), 0);
    const totalVAT = expenses.reduce((sum, exp) => sum + parseFloat(exp.vatAmount.toString()), 0);
    const averageExpense = expenses.length > 0 ? totalExpenses / expenses.length : 0;

    // Group by category
    const byCategory = expenses.reduce((acc, exp) => {
      const categoryName = exp.category.name;
      const existing = acc.find(c => c.categoryName === categoryName);
      if (existing) {
        existing.total += parseFloat(exp.totalAmount.toString());
        existing.count += 1;
      } else {
        acc.push({
          categoryName,
          total: parseFloat(exp.totalAmount.toString()),
          count: 1
        });
      }
      return acc;
    }, [] as Array<{ categoryName: string; total: number; count: number }>);

    // Group by vendor
    const byVendor = expenses.reduce((acc, exp) => {
      const vendorName = exp.vendor.name;
      const existing = acc.find(v => v.vendorName === vendorName);
      if (existing) {
        existing.total += parseFloat(exp.totalAmount.toString());
        existing.count += 1;
      } else {
        acc.push({
          vendorName,
          total: parseFloat(exp.totalAmount.toString()),
          count: 1
        });
      }
      return acc;
    }, [] as Array<{ vendorName: string; total: number; count: number }>);

    return {
      totalExpenses,
      totalVAT,
      averageExpense,
      expenseCount: expenses.length,
      byCategory,
      byVendor
    };
  }
}

export default ExpenseService; 