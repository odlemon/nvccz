import { Request, Response } from "express";
import { PerformanceScorecardEntryService } from "../services/PerformanceScorecardEntryService";
import { responseHelper } from "../utils/responseHelper";

/** Employee Scorecard workspace apparatus — notes / evidence / history / publish. */

function statusForError(message: string): number {
  const msg = String(message || "");
  if (msg.includes("not found")) return 404;
  if (msg.includes("is required") || msg.includes("A file is required")) return 400;
  return 500;
}

function fail(res: Response, error: any) {
  const message = error?.message || "Unexpected error";
  return responseHelper.error(res, message, undefined, statusForError(message));
}

export class PerformanceScorecardEntryController {
  /** GET /api/performance/scorecard-entries?employeeId=&period= */
  static async list(req: Request, res: Response) {
    try {
      const employeeId = String(req.query.employeeId || "");
      const period = String(req.query.period || "");
      const entries = await PerformanceScorecardEntryService.listForEmployeePeriod(employeeId, period);
      const publication = await PerformanceScorecardEntryService.getPublicationStatus(employeeId, period);
      return responseHelper.success(
        res,
        {
          notes: entries.filter((e) => e.kind === "note"),
          evidence: entries.filter((e) => e.kind === "evidence"),
          history: entries.filter((e) => e.kind === "history"),
          publication,
        },
        "Scorecard entries retrieved successfully"
      );
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** POST /api/performance/scorecard-entries/notes */
  static async addNote(req: Request, res: Response) {
    try {
      const { employeeId, period, noteType, text } = req.body;
      const data = await PerformanceScorecardEntryService.addNote({
        employeeId,
        period,
        noteType,
        text,
        actorId: (req as any).user?.id,
      });
      return responseHelper.success(res, data, "Note recorded successfully", 201);
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** POST /api/performance/scorecard-entries/evidence (multipart: file, employeeId, period) */
  static async addEvidence(req: Request, res: Response) {
    try {
      const file = (req as any).file;
      if (!file) {
        return responseHelper.error(res, "A file is required.", undefined, 400);
      }
      const { employeeId, period } = req.body;
      const data = await PerformanceScorecardEntryService.addEvidence({
        employeeId,
        period,
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        actorId: (req as any).user?.id,
      });
      return responseHelper.success(res, data, "Evidence recorded successfully", 201);
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** POST /api/performance/scorecard-entries/history */
  static async addHistory(req: Request, res: Response) {
    try {
      const { employeeId, period, text } = req.body;
      const data = await PerformanceScorecardEntryService.addHistory({
        employeeId,
        period,
        text,
        actorId: (req as any).user?.id,
      });
      return responseHelper.success(res, data, "History entry recorded successfully", 201);
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** POST /api/performance/scorecard-entries/publish */
  static async publish(req: Request, res: Response) {
    try {
      const { employeeId, period } = req.body;
      const data = await PerformanceScorecardEntryService.publish({
        employeeId,
        period,
        actorId: (req as any).user?.id,
      });
      return responseHelper.success(res, data, "Scorecard published successfully", 201);
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** DELETE /api/performance/scorecard-entries/:id */
  static async remove(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = await PerformanceScorecardEntryService.deleteEntry(id);
      return responseHelper.success(res, data, "Scorecard entry deleted successfully");
    } catch (error: any) {
      return fail(res, error);
    }
  }
}
