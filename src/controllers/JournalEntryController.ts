// @ts-nocheck
import { Request, Response } from "express";
import JournalEntryService from "../services/JournalEntryService";
import { ResponseHelper } from "../utils/responseHelper";

export class JournalEntryController {
  /**
   * Create a manual journal entry
   */
  static async createJournalEntry(req: Request, res: Response) {
    try {
      const { 
        transactionDate, 
        referenceNumber, 
        description, 
        currencyId, 
        journalEntryLines 
      } = req.body;

      const userId = (req as any).user?.id;

      if (!transactionDate || !referenceNumber || !description || !currencyId || !journalEntryLines) {
        return ResponseHelper.badRequest(res, "Missing required fields: transactionDate, referenceNumber, description, currencyId, journalEntryLines");
      }

      if (!Array.isArray(journalEntryLines) || journalEntryLines.length < 2) {
        return ResponseHelper.badRequest(res, "Journal entry must have at least 2 lines");
      }

      // Validate that debits equal credits
      const totalDebits = journalEntryLines.reduce((sum, line) => sum + (parseFloat(line.debitAmount) || 0), 0);
      const totalCredits = journalEntryLines.reduce((sum, line) => sum + (parseFloat(line.creditAmount) || 0), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return ResponseHelper.badRequest(res, "Total debits must equal total credits");
      }

      const journalEntry = await JournalEntryService.createManualJournalEntry({
        transactionDate: new Date(transactionDate),
        referenceNumber,
        description,
        currencyId,
        journalEntryLines,
        createdById: userId
      });

      return ResponseHelper.success(res, "Manual journal entry created successfully", journalEntry);
    } catch (error) {
      console.error("Error creating manual journal entry:", error);
      if (error instanceof Error) {
        return ResponseHelper.badRequest(res, error.message);
      }
      return ResponseHelper.error(res, "Failed to create manual journal entry", undefined, 500);
    }
  }

  /**
   * Get all journal entries
   * Defaults to POSTED and PENDING entries only. Use ?status=ALL to see all entries including VOID.
   * Returns entries with cumulative totals (totalDebits, totalCredits).
   */
  static async getJournalEntries(req: Request, res: Response) {
    try {
      const status = req.query.status as 'POSTED' | 'PENDING' | 'VOID' | 'ALL' | undefined;
      
      // Default to POSTED and PENDING only if no status specified
      const filterStatus = status || 'POSTED_AND_PENDING';
      
      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(
        new Date('2020-01-01'), // Default start date
        new Date(), // Current date
        filterStatus // Pass status filter (defaults to POSTED_AND_PENDING)
      );

      // Calculate cumulative totals from all journal entry lines
      let totalDebits = 0;
      let totalCredits = 0;
      
      for (const entry of journalEntries) {
        if (entry.journalEntryLines && Array.isArray(entry.journalEntryLines)) {
          for (const line of entry.journalEntryLines) {
            totalDebits += parseFloat(line.debitAmount?.toString() || '0');
            totalCredits += parseFloat(line.creditAmount?.toString() || '0');
          }
        }
      }

      return ResponseHelper.success(res, "Journal entries retrieved successfully", {
        entries: journalEntries,
        totals: {
          totalDebits,
          totalCredits,
          isBalanced: Math.abs(totalDebits - totalCredits) < 0.01, // Allow for small rounding differences
          entryCount: journalEntries.length
        }
      });
    } catch (error) {
      console.error("Error getting journal entries:", error);
      return ResponseHelper.error(res, "Failed to retrieve journal entries", undefined, 500);
    }
  }

  /**
   * Get a specific journal entry by ID
   */
  static async getJournalEntry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const journalEntry = await JournalEntryService.getJournalEntryWithLines(id);

      if (!journalEntry) {
        return ResponseHelper.notFound(res, "Journal entry not found");
      }

      return ResponseHelper.success(res, "Journal entry retrieved successfully", journalEntry);
    } catch (error) {
      console.error("Error getting journal entry:", error);
      return ResponseHelper.error(res, "Failed to retrieve journal entry", undefined, 500);
    }
  }

  /**
   * Post a journal entry (change status from PENDING to POSTED)
   */
  static async postJournalEntry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const journalEntry = await JournalEntryService.postJournalEntry(id, userId);

      return ResponseHelper.success(res, "Journal entry posted successfully", journalEntry);
    } catch (error) {
      console.error("Error posting journal entry:", error);
      if (error instanceof Error) {
        return ResponseHelper.badRequest(res, error.message);
      }
      return ResponseHelper.error(res, "Failed to post journal entry", undefined, 500);
    }
  }

  /**
   * Void a journal entry (change status to VOID)
   */
  static async voidJournalEntry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const journalEntry = await JournalEntryService.voidJournalEntry(id, userId);

      return ResponseHelper.success(res, "Journal entry voided successfully", journalEntry);
    } catch (error) {
      console.error("Error voiding journal entry:", error);
      if (error instanceof Error) {
        return ResponseHelper.badRequest(res, error.message);
      }
      return ResponseHelper.error(res, "Failed to void journal entry", undefined, 500);
    }
  }

  /**
   * Get journal entries by date range
   * Defaults to POSTED entries only. Use ?status=ALL to see all entries.
   * Returns entries with cumulative totals (totalDebits, totalCredits) for the date range.
   */
  static async getJournalEntriesByDateRange(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const status = req.query.status as 'POSTED' | 'PENDING' | 'VOID' | 'ALL' | undefined;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(res, "Start date and end date are required");
      }

      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(
        new Date(startDate as string),
        new Date(endDate as string),
        status // Pass status filter (defaults to POSTED)
      );

      // Calculate cumulative totals from all journal entry lines
      let totalDebits = 0;
      let totalCredits = 0;
      
      for (const entry of journalEntries) {
        if (entry.journalEntryLines && Array.isArray(entry.journalEntryLines)) {
          for (const line of entry.journalEntryLines) {
            totalDebits += parseFloat(line.debitAmount?.toString() || '0');
            totalCredits += parseFloat(line.creditAmount?.toString() || '0');
          }
        }
      }

      return ResponseHelper.success(res, "Journal entries retrieved successfully", {
        entries: journalEntries,
        totals: {
          totalDebits,
          totalCredits,
          isBalanced: Math.abs(totalDebits - totalCredits) < 0.01, // Allow for small rounding differences
          entryCount: journalEntries.length
        },
        dateRange: {
          startDate: startDate as string,
          endDate: endDate as string
        }
      });
    } catch (error) {
      console.error("Error getting journal entries by date range:", error);
      return ResponseHelper.error(res, "Failed to retrieve journal entries", undefined, 500);
    }
  }
}

export default JournalEntryController; 