// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { ResponseHelper } from "../utils/responseHelper";
import { CashbookReconciliationSessionService } from "../services/CashbookReconciliationSessionService";

export class CashbookReconciliationSessionController {
  /** GET /api/cashbook/reconciliation/banks/:bankId/entries?asOf=&includeReconciled= */
  static async listEntries(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;
      const { asOf, includeReconciled } = req.query;
      if (!asOf) {
        return ResponseHelper.badRequest(res, "asOf (statement / period end date) is required");
      }
      const data = await CashbookReconciliationSessionService.listCandidateEntries({
        bankId,
        asOf: new Date(asOf as string),
        includeReconciled: includeReconciled === "true" || includeReconciled === "1",
      });
      return ResponseHelper.success(res, "Cashbook reconciliation candidates retrieved", data);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.listEntries:", error);
      return ResponseHelper.error(res, error?.message || "Failed to list entries", undefined, 500);
    }
  }

  /** GET /api/cashbook/reconciliation/banks/:bankId/sessions */
  static async listSessions(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;
      const data = await CashbookReconciliationSessionService.listForBank(bankId);
      return ResponseHelper.success(res, "Reconciliation sessions retrieved", data);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.listSessions:", error);
      const msg = error?.message || "Failed to list sessions";
      if (msg.includes("not found")) return ResponseHelper.notFound(res, msg);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }

  /** POST /api/cashbook/reconciliation/banks/:bankId/sessions */
  static async createDraft(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;
      const b = req.body ?? {};
      if (!b.statementDate || b.statementEndBalance === undefined || b.statementEndBalance === null) {
        return ResponseHelper.badRequest(res, "statementDate and statementEndBalance are required");
      }
      const statementEndBalance = Number(b.statementEndBalance);
      if (!Number.isFinite(statementEndBalance)) {
        return ResponseHelper.badRequest(res, "statementEndBalance must be a number");
      }
      let openingBalanceOpt: number | null | undefined = undefined;
      if (b.openingBalance !== undefined) {
        if (b.openingBalance === null) openingBalanceOpt = null;
        else {
          const o = Number(b.openingBalance);
          if (!Number.isFinite(o)) {
            return ResponseHelper.badRequest(res, "openingBalance must be a number when provided");
          }
          openingBalanceOpt = o;
        }
      }

      const data = await CashbookReconciliationSessionService.createDraft({
        bankId,
        userId: req.user!.id,
        statementDate: new Date(b.statementDate),
        statementEndBalance,
        reference: b.reference,
        openingBalance: openingBalanceOpt,
        selectedEntryIds: Array.isArray(b.selectedEntryIds) ? b.selectedEntryIds : undefined,
      });
      return ResponseHelper.created(res, "Draft reconciliation session created", data);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.createDraft:", error);
      const msg = error?.message || "Failed to create session";
      if (msg.includes("already reconciled") || msg.includes("not POSTED") || msg.includes("after statement")) {
        return ResponseHelper.badRequest(res, msg);
      }
      if (msg.includes("not found")) return ResponseHelper.notFound(res, msg);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }

  /** GET /api/cashbook/reconciliation/sessions/:sessionId */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const row = await CashbookReconciliationSessionService.getById(req.params.sessionId);
      if (!row) return ResponseHelper.notFound(res, "Reconciliation session not found");
      return ResponseHelper.success(res, "Reconciliation session retrieved", row);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.getById:", error);
      return ResponseHelper.error(res, error?.message || "Failed to get session", undefined, 500);
    }
  }

  /** PATCH /api/cashbook/reconciliation/sessions/:sessionId */
  static async updateDraft(req: AuthRequest, res: Response) {
    try {
      const b = req.body ?? {};
      const lines =
        b.lines === undefined
          ? undefined
          : Array.isArray(b.lines)
            ? b.lines.map((x: any) => ({
                cashbookEntryId: String(x.cashbookEntryId),
                selected: Boolean(x.selected),
              }))
            : null;
      if (lines === null) {
        return ResponseHelper.badRequest(res, "lines must be an array of { cashbookEntryId, selected }");
      }

      let openingBalance: number | null | undefined = undefined;
      if (b.openingBalance !== undefined) {
        if (b.openingBalance === null) openingBalance = null;
        else {
          openingBalance = Number(b.openingBalance);
          if (!Number.isFinite(openingBalance)) {
            return ResponseHelper.badRequest(res, "openingBalance must be a number or null");
          }
        }
      }

      let statementEndBalance: number | undefined = undefined;
      if (b.statementEndBalance !== undefined && b.statementEndBalance !== null) {
        statementEndBalance = Number(b.statementEndBalance);
        if (!Number.isFinite(statementEndBalance)) {
          return ResponseHelper.badRequest(res, "statementEndBalance must be a number");
        }
      }

      const data = await CashbookReconciliationSessionService.updateDraft({
        sessionId: req.params.sessionId,
        userId: req.user!.id,
        statementDate: b.statementDate ? new Date(b.statementDate) : undefined,
        statementEndBalance,
        reference: b.reference,
        openingBalance,
        lines,
      });
      return ResponseHelper.success(res, "Draft reconciliation updated", data);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.updateDraft:", error);
      const msg = error?.message || "Failed to update session";
      if (
        msg.includes("Only draft") ||
        msg.includes("already reconciled") ||
        msg.includes("not POSTED") ||
        msg.includes("after statement") ||
        msg.includes("Duplicate") ||
        msg.includes("Invalid")
      ) {
        return ResponseHelper.badRequest(res, msg);
      }
      if (msg.includes("not found")) return ResponseHelper.notFound(res, msg);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }

  /** POST /api/cashbook/reconciliation/sessions/:sessionId/finish */
  static async finish(req: AuthRequest, res: Response) {
    try {
      const data = await CashbookReconciliationSessionService.finish({
        sessionId: req.params.sessionId,
        userId: req.user!.id,
      });
      return ResponseHelper.success(res, "Reconciliation finalized", data);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.finish:", error);
      const msg = error?.message || "Failed to finish reconciliation";
      if (
        msg.includes("Only draft") ||
        msg.includes("openingBalance") ||
        msg.includes("Select at least one") ||
        msg.includes("does not match statement") ||
        msg.includes("already reconciled") ||
        msg.includes("not POSTED") ||
        msg.includes("after statement")
      ) {
        return ResponseHelper.badRequest(res, msg);
      }
      if (msg.includes("not found")) return ResponseHelper.notFound(res, msg);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }

  /** POST /api/cashbook/reconciliation/sessions/:sessionId/discard */
  static async discard(req: AuthRequest, res: Response) {
    try {
      const data = await CashbookReconciliationSessionService.discard({
        sessionId: req.params.sessionId,
      });
      return ResponseHelper.success(res, "Draft reconciliation discarded", data);
    } catch (error: any) {
      console.error("CashbookReconciliationSessionController.discard:", error);
      const msg = error?.message || "Failed to discard session";
      if (msg.includes("Only draft")) return ResponseHelper.badRequest(res, msg);
      if (msg.includes("not found")) return ResponseHelper.notFound(res, msg);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }
}
