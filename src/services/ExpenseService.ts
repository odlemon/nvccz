// @ts-nocheck
import { PrismaClient, Expense, Vendor, ExpenseCategory, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { prismaJournalEntryRateSelect } from "../config/accountingSnapshotResponseSelect";
import VATService from "./VATService";
import JournalEntryService, { CreateExpenseJournalEntryParams } from "./JournalEntryService";
import AuditService from "./AuditService";
import { VcCacSyncService } from "./VcCacSyncService";

export interface CreateExpenseParams {
  vendorId: string;
  category: string; // Changed from categoryId to category (name)
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  receiptNumber?: string;
  isTaxable: boolean;
  paymentMethod?: "CASH" | "BANK" | "CREDIT";
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
        category,
        amount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable,
        paymentMethod = "BANK",
        createdById
      } = params;

      // Validate input parameters
      if (!amount || amount <= 0) {
        throw new Error("Amount must be greater than zero");
      }
      if (!description || description.trim().length === 0) {
        throw new Error("Description is required");
      }
      // Find or create the category by name
      const expenseCategory = await prisma.expenseCategory.upsert({
        where: { name: category },
        update: { isActive: true },
        create: {
          name: category,
          description: `Auto-created category: ${category}`,
          isActive: true
        }
      });

      // Validate that vendor and currency exist
      await this.validateExpenseData(vendorId, expenseCategory.id, currencyId);

      // Calculate VAT if taxable (as number)
      const vatAmount: number = VATService.isVATEligible(amount, isTaxable)
        ? VATService.calculateVAT(amount)
        : 0;
      const totalAmount: number = Number(amount) + Number(vatAmount);

      // Create the expense record (convert to Decimal at DB write)
      const expense = await prisma.expense.create({
        data: {
          vendorId,
          categoryId: expenseCategory.id,
          amount: new Decimal(amount),
          vatAmount: new Decimal(vatAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          transactionDate,
          description,
          receiptNumber,
          isTaxable,
          paymentMethod,
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
              status: true,
              ...prismaJournalEntryRateSelect
            }
          }
        }
      });

      // Create journal entry for double-entry bookkeeping
      const journalEntryParams: CreateExpenseJournalEntryParams = {
        vendorId,
        categoryName: category, // Use category name directly
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable,
        paymentMethod,
        createdById,
        bankId: (params as any).bankId,
      };
      const journalEntryResult = await JournalEntryService.createExpenseJournalEntry(journalEntryParams);

      // Update the expense with the journal entry reference. Its journal is a draft until an approver posts it, so the
      // expense is submitted, not posted (it becomes APPROVED when the journal is posted, REJECTED if it is voided).
      const updatedExpense = await prisma.expense.update({
        where: { id: expense.id },
        data: {
          journalEntryId: journalEntryResult.journalEntry.id,
          status: "SUBMITTED"
        },
        include: {
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          }
        }
      });

      // Audit: CREATE expense
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "Expense",
        entityId: updatedExpense.id,
        newValues: updatedExpense,
      });

      await VcCacSyncService.recomputeAndPersist({ source: "expenses" }).catch((err: any) => {
        console.error("VcCacSyncService.recomputeAndPersist failed after expense create", err?.message ?? err);
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
            status: true,
            ...prismaJournalEntryRateSelect
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
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          vendor: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
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
  static async updateExpense(id: string, updateData: Partial<CreateExpenseParams>, updatedById: string): Promise<ExpenseWithRelations> {
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

      const before = expense;
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
              status: true,
              ...prismaJournalEntryRateSelect
            }
          }
        }
      });

      // Audit: UPDATE expense (DRAFT)
      await AuditService.log({
        userId: updatedExpense.createdById,
        action: "UPDATE",
        entityType: "Expense",
        entityId: id,
        oldValues: before,
        newValues: updatedExpense,
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
        const before = expense;
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
                status: true,
                ...prismaJournalEntryRateSelect
              }
            }
          }
        });

        // Audit: UPDATE expense (DRAFT)
        await AuditService.log({
          userId: updatedExpense.createdById,
          action: "UPDATE",
          entityType: "Expense",
          entityId: id,
          oldValues: before,
          newValues: updatedExpense,
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

      // Get the original category name for reversal
      const originalCategory = await prisma.expenseCategory.findUnique({
        where: { id: expense.categoryId }
      });

      if (!originalCategory) {
        throw new Error("Original expense category not found");
      }

      // Step 1: Create reversal journal entry using original expense data
      const reversalParams: CreateExpenseJournalEntryParams = {
        vendorId: expense.vendorId,
        categoryName: originalCategory.name,
        amount: Number(expense.amount),
        vatAmount: Number(expense.vatAmount),
        totalAmount: Number(expense.totalAmount),
        currencyId: expense.currencyId,
        transactionDate: expense.transactionDate,
        description: expense.description,
        receiptNumber: expense.receiptNumber || undefined,
        isTaxable: expense.isTaxable,
        paymentMethod: expense.paymentMethod,
        createdById: expense.createdById
      };

      const before = expense;
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
              status: true,
              ...prismaJournalEntryRateSelect
            }
          }
        }
      });

      // Get the new category name (if category changed)
      const newCategory = await prisma.expenseCategory.findUnique({
        where: { id: newCategoryId }
      });

      if (!newCategory) {
        throw new Error("New expense category not found");
      }

      // Step 3: Create new journal entry with updated amounts
      const newJournalEntryParams: CreateExpenseJournalEntryParams = {
        vendorId: updatedExpense.vendorId,
        categoryName: newCategory.name,
        amount: newAmount,
        vatAmount: newVatAmount,
        totalAmount: newTotalAmount,
        currencyId: updatedExpense.currencyId,
        transactionDate: updatedExpense.transactionDate,
        description: updatedExpense.description,
        receiptNumber: updatedExpense.receiptNumber || undefined,
        isTaxable: newIsTaxable,
        paymentMethod: updatedExpense.paymentMethod,
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
              status: true,
              ...prismaJournalEntryRateSelect
            }
          }
        }
      });

      // Audit: UPDATE expense (POSTED with reversal workflow)
      await AuditService.log({
        userId: finalExpense.createdById,
        action: "UPDATE",
        entityType: "Expense",
        entityId: id,
        oldValues: before,
        newValues: finalExpense,
      });

      await VcCacSyncService.recomputeAndPersist({ source: "expenses" }).catch((err: any) => {
        console.error("VcCacSyncService.recomputeAndPersist failed after expense update", err?.message ?? err);
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
      const before = expense;
      await prisma.expense.update({
        where: { id },
        data: { isActive: false }
      });
      // Audit: DELETE (soft) expense (DRAFT)
      await AuditService.log({
        userId: before.createdById,
        action: "DELETE",
        entityType: "Expense",
        entityId: id,
        oldValues: before,
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
        paymentMethod: expense.paymentMethod,
        createdById: expense.createdById
      };

      await JournalEntryService.createReversalJournalEntry(reversalParams);

      // Soft delete the expense
      const before = expense;
      await prisma.expense.update({
        where: { id },
        data: { isActive: false }
      });
      // Audit: DELETE (soft) expense (POSTED)
      await AuditService.log({
        userId: before.createdById,
        action: "DELETE",
        entityType: "Expense",
        entityId: id,
        oldValues: before,
      });

      await VcCacSyncService.recomputeAndPersist({ source: "expenses" }).catch((err: any) => {
        console.error("VcCacSyncService.recomputeAndPersist failed after expense delete", err?.message ?? err);
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