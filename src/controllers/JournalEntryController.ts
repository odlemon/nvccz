// @ts-nocheck
import { Request, Response } from "express";
import JournalEntryService from "../services/JournalEntryService";
import { ResponseHelper } from "../utils/responseHelper";

export class JournalEntryController {
  /**
   * Get all journal entries
   */
  static async getJournalEntries(req: Request, res: Response) {
    try {
      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(
        new Date('2020-01-01'), // Default start date
        new Date() // Current date
      );

      return ResponseHelper.success(res, "Journal entries retrieved successfully", journalEntries);
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
   */
  static async getJournalEntriesByDateRange(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(res, "Start date and end date are required");
      }

      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(
        new Date(startDate as string),
        new Date(endDate as string)
      );

      return ResponseHelper.success(res, "Journal entries retrieved successfully", journalEntries);
    } catch (error) {
      console.error("Error getting journal entries by date range:", error);
      return ResponseHelper.error(res, "Failed to retrieve journal entries", undefined, 500);
    }
  }
}

export default JournalEntryController; 