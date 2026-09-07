// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { TimesheetService } from "../services/TimesheetService";

export class TimesheetController {
  async mine(req: AuthRequest, res: Response) {
    try {
      const timesheets = await TimesheetService.listTimesheetsForUser(req.user!.id);
      res.json({ success: true, data: timesheets });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || "Failed to list timesheets" });
    }
  }

  async pendingApproval(req: AuthRequest, res: Response) {
    try {
      const timesheets = await TimesheetService.listPendingApproval();
      res.json({ success: true, data: timesheets });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || "Failed to list pending timesheets" });
    }
  }

  /** Upsert an entry on the current user's timesheet for :weekEnding, creating it if needed. */
  async upsertEntry(req: AuthRequest, res: Response) {
    try {
      const { weekEnding } = req.params;
      const { projectId, date, hours, billable, notes } = req.body || {};
      if (!projectId || !date || hours == null) {
        res.status(400).json({ success: false, message: "projectId, date and hours are required" });
        return;
      }
      const timesheet = await TimesheetService.getOrCreateTimesheet(req.user!.id, weekEnding);
      const entry = await TimesheetService.upsertEntry(timesheet.id, {
        projectId,
        date,
        hours,
        billable,
        notes,
      });
      res.json({ success: true, message: "Entry saved", data: { timesheetId: timesheet.id, entry } });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to save entry" });
    }
  }

  /** Self-service only — owner must match the caller, checked here before the state transition. */
  async submit(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const timesheet = await TimesheetService.getTimesheetById(id);
      if (!timesheet) {
        res.status(404).json({ success: false, message: "Timesheet not found" });
        return;
      }
      if (timesheet.userId !== req.user!.id) {
        res.status(403).json({ success: false, message: "You can only submit your own timesheet" });
        return;
      }
      const updated = await TimesheetService.submitTimesheet(id);
      res.json({ success: true, message: "Timesheet submitted for approval", data: updated });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to submit timesheet" });
    }
  }

  async approve(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updated = await TimesheetService.approveTimesheet(id, req.user!.id);
      res.json({ success: true, message: "Timesheet approved", data: updated });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to approve timesheet" });
    }
  }

  async returnTimesheet(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updated = await TimesheetService.returnTimesheet(id, req.user!.id);
      res.json({ success: true, message: "Timesheet returned to employee", data: updated });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to return timesheet" });
    }
  }
}

export const timesheetController = new TimesheetController();
