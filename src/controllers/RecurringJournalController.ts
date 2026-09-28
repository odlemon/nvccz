// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { RecurringJournalService } from "../services/RecurringJournalService";

export class RecurringJournalController {
  async listTemplates(req: AuthRequest, res: Response) {
    try {
      const activeOnly = req.query.activeOnly === "true";
      const templates = await RecurringJournalService.listTemplates(activeOnly);
      res.json({ success: true, data: templates });
    } catch (e: any) {
      res.status(500).json({ success: false, message: "Failed to list recurring journal templates", error: e.message });
    }
  }

  async createTemplate(req: AuthRequest, res: Response) {
    try {
      const { name, description, dayOfMonth, currencyId, lines, referencePrefix } = req.body;
      if (!name || !currencyId || !Array.isArray(lines) || !lines.length) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: name, currencyId, lines (non-empty array)",
        });
      }
      const template = await RecurringJournalService.createTemplate({
        name,
        description,
        dayOfMonth,
        currencyId,
        lines,
        referencePrefix,
        createdById: req.user!.id,
      });
      res.status(201).json({ success: true, message: "Recurring journal template created successfully", data: template });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to create recurring journal template" });
    }
  }

  async setActive(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ success: false, message: "isActive (boolean) is required" });
      }
      const template = await RecurringJournalService.setActive(id, isActive, req.user?.id);
      res.json({ success: true, message: `Template ${isActive ? "activated" : "paused"}`, data: template });
    } catch (e: any) {
      res.status(e?.statusCode || 400).json({ success: false, message: e.message || "Failed to update template status" });
    }
  }

  async runTemplate(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date();
      const yearMonth = RecurringJournalService.yearMonthKey(asOf);
      const result = await RecurringJournalService.postTemplateForMonth(id, asOf, yearMonth);
      res.json({ success: true, message: result.skipped ? "Already posted for this month" : "Recurring journal posted", data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to post recurring journal" });
    }
  }

  async runDue(req: AuthRequest, res: Response) {
    try {
      const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date();
      const result = await RecurringJournalService.runDueTemplates(asOf);
      res.json({ success: true, message: `${result.posted.length} due schedule(s) processed`, data: result });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || "Failed to run due recurring journals" });
    }
  }
}

export const recurringJournalController = new RecurringJournalController();
