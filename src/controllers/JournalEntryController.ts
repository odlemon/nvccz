// @ts-nocheck
import { Request, Response } from "express";
import JournalEntryService, { JournalEntryImmutableError } from "../services/JournalEntryService";
import { getLastAuditTrailEntries, verifySequentialIntegrity } from "../services/AuditTrailSequenceService";
import { ResponseHelper } from "../utils/responseHelper";
import { parseDate } from "../utils/dateHelper";

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

      const ipAddress = (req as any).ip || (req as any).headers?.["x-forwarded-for"] || (req as any).socket?.remoteAddress || null;
      const userAgent = ((req as any).headers?.["user-agent"] as string) || null;
      const journalEntry = await JournalEntryService.createManualJournalEntry({
        transactionDate: parseDate(transactionDate),
        referenceNumber,
        description,
        currencyId,
        journalEntryLines: journalEntryLines.map((line: any) => ({
          chartOfAccountId: line.chartOfAccountId,
          debitAmount: parseFloat(line.debitAmount) || 0,
          creditAmount: parseFloat(line.creditAmount) || 0,
          description: line.description,
          ...(line.currencyId ? { currencyId: line.currencyId } : {}),
        })),
        createdById: userId,
        ipAddress: typeof ipAddress === "string" ? ipAddress : (Array.isArray(ipAddress) ? ipAddress[0] : String(ipAddress ?? "")),
        userAgent,
      });

      if (journalEntry && journalEntry.success === false) {
        return ResponseHelper.badRequest(
          res,
          journalEntry.error || "Failed to create manual journal entry"
        );
      }

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
   */
  static async getJournalEntries(req: Request, res: Response) {
    try {
      const status = req.query.status as 'POSTED' | 'PENDING' | 'VOID' | 'ALL' | undefined;
      const currencyId = req.query.currencyId as string | undefined;
      const filterStatus = status || 'POSTED_AND_PENDING';
      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(
        new Date('2020-01-01'),
        new Date(),
        filterStatus,
        currencyId
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
   * Update a journal entry (PENDING only). Posted/voided entries return 409 — use a reversing journal.
   */
  static async updateJournalEntry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        transactionDate,
        referenceNumber,
        description,
        currencyId,
        journalEntryLines,
      } = req.body;

      if (!transactionDate || !referenceNumber || !description || !currencyId || !journalEntryLines) {
        return ResponseHelper.badRequest(
          res,
          "Missing required fields: transactionDate, referenceNumber, description, currencyId, journalEntryLines"
        );
      }

      if (!Array.isArray(journalEntryLines) || journalEntryLines.length < 2) {
        return ResponseHelper.badRequest(res, "Journal entry must have at least 2 lines");
      }

      const userId = (req as any).user?.id;
      const ipAddress =
        (req as any).ip ||
        (req as any).headers?.["x-forwarded-for"] ||
        (req as any).socket?.remoteAddress ||
        null;
      const userAgent = ((req as any).headers?.["user-agent"] as string) || null;

      const updated = await JournalEntryService.updatePendingJournalEntry(
        id,
        {
          transactionDate: parseDate(transactionDate),
          referenceNumber,
          description,
          currencyId,
          journalEntryLines: journalEntryLines.map((line: any) => ({
            chartOfAccountId: line.chartOfAccountId,
            debitAmount: parseFloat(line.debitAmount) || 0,
            creditAmount: parseFloat(line.creditAmount) || 0,
            description: line.description,
            ...(line.currencyId ? { currencyId: line.currencyId } : {}),
          })),
          createdById: userId,
        },
        userId,
        typeof ipAddress === "string"
          ? ipAddress
          : Array.isArray(ipAddress)
            ? ipAddress[0]
            : String(ipAddress ?? ""),
        userAgent
      );

      return ResponseHelper.success(res, "Journal entry updated successfully", updated);
    } catch (error) {
      console.error("Error updating journal entry:", error);
      if (error instanceof JournalEntryImmutableError) {
        return ResponseHelper.conflict(res, error.message);
      }
      if (error instanceof Error) {
        if (error.message === "Journal entry not found") {
          return ResponseHelper.notFound(res, error.message);
        }
        return ResponseHelper.badRequest(res, error.message);
      }
      return ResponseHelper.error(res, "Failed to update journal entry", undefined, 500);
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
   */
  static async getJournalEntriesByDateRange(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const status = req.query.status as 'POSTED' | 'PENDING' | 'VOID' | 'ALL' | undefined;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(res, "Start date and end date are required");
      }

      const currencyId = req.query.currencyId as string | undefined;
      const journalEntries = await JournalEntryService.getJournalEntriesByDateRange(
        parseDate(startDate as string),
        parseDate(endDate as string),
        status,
        currencyId
      );

      return ResponseHelper.success(res, "Journal entries retrieved successfully", journalEntries);
    } catch (error) {
      console.error("Error getting journal entries by date range:", error);
      return ResponseHelper.error(res, "Failed to retrieve journal entries", undefined, 500);
    }
  }

  /**
   * Get last 10 audit trail entries (journal entries with sequential audit trail IDs).
   */
  static async getLastAuditTrailEntries(req: Request, res: Response) {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "10"), 10) || 10, 100);
      const entries = await getLastAuditTrailEntries(limit);
      return ResponseHelper.success(res, "Last audit trail entries retrieved", { entries, count: entries.length });
    } catch (error) {
      console.error("Error getting last audit trail entries:", error);
      return ResponseHelper.error(res, "Failed to retrieve audit trail entries", undefined, 500);
    }
  }

  /**
   * Verify sequential integrity of the last 10 audit trail IDs (no gaps).
   */
  static async verifySequentialIntegrity(req: Request, res: Response) {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "10"), 10) || 10, 100);
      const result = await verifySequentialIntegrity(limit);
      return ResponseHelper.success(res, result.message, result);
    } catch (error) {
      console.error("Error verifying audit trail sequential integrity:", error);
      return ResponseHelper.error(res, "Failed to verify sequential integrity", undefined, 500);
    }
  }
}

export default JournalEntryController; 