// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/authenticate";
import JournalEntryService from "../services/JournalEntryService";

export class JournalEntryController {
  /**
   * Get journal entry by ID with all lines
   */
  static async getJournalEntryById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const journalEntry = await JournalEntryService.getJournalEntryWithLines(id);
      
      if (!journalEntry) {
        return res.status(404).json({
          success: false,
          message: "Journal entry not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: journalEntry
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all journal entries with pagination
   */
  static async getJournalEntries(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(start, end);
      
      return res.status(200).json({
        success: true,
        data: journalEntries,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: journalEntries.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate journal entry balance by ID
   */
  static async validateJournalEntryById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      const journalEntry = await JournalEntryService.getJournalEntryWithLines(id);
      
      if (!journalEntry) {
        return res.status(404).json({
          success: false,
          message: "Journal entry not found"
        });
      }

      const isValid = JournalEntryService.validateJournalEntryBalance(journalEntry.journalEntryLines);
      
      const totalDebits = journalEntry.journalEntryLines.reduce((sum, line) => sum + parseFloat(line.debitAmount.toString()), 0);
      const totalCredits = journalEntry.journalEntryLines.reduce((sum, line) => sum + parseFloat(line.creditAmount.toString()), 0);
      
      return res.status(200).json({
        success: true,
        data: {
          isBalanced: isValid,
          totalDebits,
          totalCredits,
          difference: totalDebits - totalCredits,
          message: isValid ? "Journal entry is balanced" : "Journal entry is not balanced"
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate journal entry balance
   */
  static async validateBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { journalEntryLines } = req.body;
      
      if (!Array.isArray(journalEntryLines)) {
        return res.status(400).json({
          success: false,
          message: "Journal entry lines must be an array"
        });
      }

      const isValid = JournalEntryService.validateJournalEntryBalance(journalEntryLines);
      
      return res.status(200).json({
        success: true,
        data: {
          isValid,
          message: isValid ? "Journal entry is balanced" : "Journal entry is not balanced"
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default JournalEntryController; 