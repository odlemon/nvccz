// @ts-nocheck
import { PrismaClient, Revenue, Customer, RevenueSource, RevenueCategory, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { dbConnection } from "../utils/database";
import VATService from "./VATService";
import JournalEntryService, { CreateRevenueJournalEntryParams } from "./JournalEntryService";

const prisma = dbConnection.getPrismaClient();

export interface CreateRevenueParams {
  sourceId: string;
  categoryId: string;
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  isTaxable: boolean;
  paymentMethod?: "CASH" | "BANK" | "CREDIT";
  createdById: string;
}

export interface RevenueWithRelations extends Revenue {
  source: RevenueSource;
  category: RevenueCategory;
  currency: Currency;
  journalEntry?: {
    id: string;
    referenceNumber: string;
    status: string;
  };
}

export class RevenueService {
  /**
   * Create a new revenue with automatic VAT calculation and journal entry creation
   */
  static async createRevenue(params: CreateRevenueParams): Promise<RevenueWithRelations> {
    try {
      const {
        sourceId,
        categoryId,
        amount,
        currencyId,
        transactionDate,
        description,
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
      // Validate that source, category, and currency exist
      await this.validateRevenueData(sourceId, categoryId, currencyId);

      // Calculate VAT if taxable (as number)
      const vatAmount: number = VATService.isVATEligible(amount, isTaxable)
        ? VATService.calculateVAT(amount)
        : 0;
      const totalAmount: number = Number(amount) + Number(vatAmount);

      // Create the revenue record (convert to Decimal at DB write)
      const revenue = await prisma.revenue.create({
        data: {
          sourceId,
          categoryId,
          amount: new Decimal(amount),
          vatAmount: new Decimal(vatAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          transactionDate,
          description,
          isTaxable,
          paymentMethod,
          status: "DRAFT",
          createdById
        },
        include: {
          source: true,
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

      // Create journal entry for the revenue transaction
      const journalEntry = await JournalEntryService.createRevenueJournalEntry({
        sourceId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        isTaxable,
        paymentMethod,
        createdById
      });

      // Update revenue with journal entry ID
      const updatedRevenue = await prisma.revenue.update({
        where: { id: revenue.id },
        data: { journalEntryId: journalEntry.journalEntry.id },
        include: {
          source: true,
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

      return updatedRevenue;
    } catch (error: any) {
      console.error("Error creating revenue:", error);
      throw error;
    }
  }

  /**
   * Get all revenues with optional filtering
   */
  static async getRevenues(filters: {
    sourceId?: string;
    categoryId?: string;
    currencyId?: string;
    isTaxable?: boolean;
    paymentMethod?: string;
    status?: string;
    isActive?: boolean;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<RevenueWithRelations[]> {
    try {
      const where: any = {};

      if (filters.sourceId) where.sourceId = filters.sourceId;
      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.currencyId) where.currencyId = filters.currencyId;
      if (filters.isTaxable !== undefined) where.isTaxable = filters.isTaxable;
      if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
      if (filters.status) where.status = filters.status;
      if (filters.isActive !== undefined) where.isActive = filters.isActive;
      if (filters.startDate || filters.endDate) {
        where.transactionDate = {};
        if (filters.startDate) where.transactionDate.gte = filters.startDate;
        if (filters.endDate) where.transactionDate.lte = filters.endDate;
      }

      return await prisma.revenue.findMany({
        where,
        include: {
          source: true,
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
        orderBy: { transactionDate: "desc" }
      });
    } catch (error: any) {
      console.error("Error getting revenues:", error);
      throw error;
    }
  }

  /**
   * Get a single revenue by ID
   */
  static async getRevenueById(id: string): Promise<RevenueWithRelations | null> {
    try {
      return await prisma.revenue.findUnique({
        where: { id },
        include: {
          source: true,
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
    } catch (error: any) {
      console.error("Error getting revenue by ID:", error);
      throw error;
    }
  }

  /**
   * Update a revenue with proper double-entry bookkeeping
   * For DRAFT revenues: Direct update
   * For POSTED revenues: Create reversal entry, update revenue, create new entry
   */
  static async updateRevenue(id: string, updateData: Partial<CreateRevenueParams>): Promise<RevenueWithRelations> {
    try {
      const revenue = await prisma.revenue.findUnique({
        where: { id },
        include: { journalEntry: true }
      });

      if (!revenue) {
        throw new Error("Revenue not found");
      }

      // Remove journalEntryId from updateData to prevent direct manipulation
      delete updateData.journalEntryId;

      // For DRAFT revenues, allow direct updates
      if (revenue.status === "DRAFT") {
        // Recalculate VAT and total if amount or taxable status changed
        let vatAmount = Number(revenue.vatAmount);
        let totalAmount = Number(revenue.totalAmount);

        if (updateData.amount !== undefined || updateData.isTaxable !== undefined) {
          const newAmount = Number(updateData.amount ?? revenue.amount);
          const newIsTaxable = updateData.isTaxable ?? revenue.isTaxable;
          
          vatAmount = VATService.isVATEligible(newAmount, newIsTaxable)
            ? VATService.calculateVAT(newAmount)
            : 0;
          totalAmount = newAmount + vatAmount;
        }

        const updatedRevenue = await prisma.revenue.update({
          where: { id },
          data: {
            ...updateData,
            ...(updateData.amount !== undefined && { amount: new Decimal(updateData.amount) }),
            ...(updateData.isTaxable !== undefined && { isTaxable: updateData.isTaxable }),
            vatAmount: new Decimal(vatAmount),
            totalAmount: new Decimal(totalAmount)
          },
          include: {
            source: true,
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

        return updatedRevenue;
      }

      // For POSTED revenues, implement double-entry bookkeeping workflow
      if (revenue.status === "POSTED") {
        // Check if there are financial changes that require journal entry updates
        const hasFinancialChanges = 
          updateData.amount !== undefined || 
          updateData.isTaxable !== undefined || 
          updateData.categoryId !== undefined;

        // If no financial changes, just update non-financial fields directly
        if (!hasFinancialChanges) {
          const updatedRevenue = await prisma.revenue.update({
            where: { id },
            data: updateData,
            include: {
              source: true,
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

          return updatedRevenue;
        }

        // For financial changes, implement the reversal workflow
        const newAmount = Number(updateData.amount ?? revenue.amount);
        const newIsTaxable = updateData.isTaxable ?? revenue.isTaxable;
        const newCategoryId = updateData.categoryId ?? revenue.categoryId;
        
        // Calculate new VAT and total amounts
        const newVatAmount = VATService.isVATEligible(newAmount, newIsTaxable)
          ? VATService.calculateVAT(newAmount)
          : 0;
        const newTotalAmount = newAmount + newVatAmount;

        // Step 1: Create reversal journal entry using original revenue data
        const reversalParams: CreateRevenueJournalEntryParams = {
          sourceId: revenue.sourceId,
          categoryId: revenue.categoryId,
          amount: Number(revenue.amount),
          vatAmount: Number(revenue.vatAmount),
          totalAmount: Number(revenue.totalAmount),
          currencyId: revenue.currencyId,
          transactionDate: revenue.transactionDate,
          description: revenue.description,
          isTaxable: revenue.isTaxable,
          paymentMethod: revenue.paymentMethod,
          createdById: revenue.createdById
        };

        const reversalResult = await JournalEntryService.createReversalRevenueJournalEntry(reversalParams);

        // Step 2: Update the revenue with new amounts and temporarily link to reversal
        const updatedRevenue = await prisma.revenue.update({
          where: { id },
          data: {
            ...updateData,
            amount: new Decimal(newAmount),
            vatAmount: new Decimal(newVatAmount),
            totalAmount: new Decimal(newTotalAmount),
            journalEntryId: reversalResult.journalEntry.id // Temporarily link to reversal
          },
          include: {
            source: true,
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

        // Step 3: Create new journal entry with updated data
        const newJournalEntryParams: CreateRevenueJournalEntryParams = {
          sourceId: newCategoryId,
          categoryId: newCategoryId,
          amount: newAmount,
          vatAmount: newVatAmount,
          totalAmount: newTotalAmount,
          currencyId: revenue.currencyId,
          transactionDate: revenue.transactionDate,
          description: updateData.description ?? revenue.description,
          isTaxable: newIsTaxable,
          paymentMethod: revenue.paymentMethod,
          createdById: revenue.createdById
        };

        const newJournalEntry = await JournalEntryService.createRevenueJournalEntry(newJournalEntryParams);

        // Step 4: Update revenue to link to the new journal entry
        const finalUpdatedRevenue = await prisma.revenue.update({
          where: { id },
          data: { journalEntryId: newJournalEntry.journalEntry.id },
          include: {
            source: true,
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

        return finalUpdatedRevenue;
      }

      return revenue;
    } catch (error: any) {
      console.error("Error updating revenue:", error);
      throw error;
    }
  }

  /**
   * Delete a revenue (soft delete by setting isActive to false)
   */
  static async deleteRevenue(id: string): Promise<RevenueWithRelations> {
    try {
      return await prisma.revenue.update({
        where: { id },
        data: { isActive: false },
        include: {
          source: true,
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
    } catch (error: any) {
      console.error("Error deleting revenue:", error);
      throw error;
    }
  }

  /**
   * Validate that source, category, and currency exist
   */
  private static async validateRevenueData(sourceId: string, categoryId: string, currencyId: string): Promise<void> {
    const [source, category, currency] = await Promise.all([
      prisma.revenueSource.findUnique({ where: { id: sourceId } }),
      prisma.revenueCategory.findUnique({ where: { id: categoryId } }),
      prisma.currency.findUnique({ where: { id: currencyId } })
    ]);

    if (!source) throw new Error("Revenue source not found");
    if (!category) throw new Error("Revenue category not found");
    if (!currency) throw new Error("Currency not found");
  }
}

export default RevenueService; 