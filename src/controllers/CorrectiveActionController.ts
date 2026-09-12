import type { Response } from "express";
import type { AuthRequest } from "../middleware/authenticate";
import CorrectiveActionService from "../services/CorrectiveActionService";
import type { CorrectiveActionUpdateInput } from "../services/CorrectiveActionService";

/** Service errors carry `statusCode` (400 validation / 404 not found); anything else is a 500. */
function statusFor(error: any): number {
  return typeof error?.statusCode === "number" ? error.statusCode : 500;
}

export class CorrectiveActionController {
  /** GET / — register list with optional status / severity / ownerId / departmentId filters. */
  static async list(req: AuthRequest, res: Response) {
    try {
      const { status, severity, ownerId, departmentId } = req.query as Record<string, string | undefined>;
      const rows = await CorrectiveActionService.list({ status, severity, ownerId, departmentId });
      res.json({ success: true, data: rows });
    } catch (error: any) {
      res
        .status(statusFor(error))
        .json({ success: false, message: error?.message ?? "Failed to load corrective actions" });
    }
  }

  /** GET /summary — dashboard counters. */
  static async summary(_req: AuthRequest, res: Response) {
    try {
      const data = await CorrectiveActionService.summary();
      res.json({ success: true, data });
    } catch (error: any) {
      res
        .status(statusFor(error))
        .json({ success: false, message: error?.message ?? "Failed to load corrective action summary" });
    }
  }

  /** GET /:id */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const data = await CorrectiveActionService.getById(req.params.id);
      res.json({ success: true, data });
    } catch (error: any) {
      res
        .status(statusFor(error))
        .json({ success: false, message: error?.message ?? "Failed to load corrective action" });
    }
  }

  /** POST / — `createdById` always comes from the authenticated session, never the request body. */
  static async create(req: AuthRequest, res: Response) {
    try {
      const body = req.body ?? {};
      const createdById = req.user?.id;
      if (!createdById) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const data = await CorrectiveActionService.create({
        reference: body.reference ?? null,
        title: body.title ?? "",
        description: body.description ?? null,
        trigger: body.trigger ?? null,
        ownerId: body.ownerId ?? null,
        departmentId: body.departmentId ?? null,
        severity: body.severity ?? null,
        status: body.status ?? null,
        progress: body.progress ?? null,
        targetDate: body.targetDate ?? null,
        createdById,
      });

      res.status(201).json({ success: true, data, message: "Corrective action created" });
    } catch (error: any) {
      res
        .status(statusFor(error))
        .json({ success: false, message: error?.message ?? "Failed to create corrective action" });
    }
  }

  /** PATCH /:id — partial update; only the keys present in the body are touched. */
  static async update(req: AuthRequest, res: Response) {
    try {
      const body = req.body ?? {};
      const patch: Record<string, unknown> = {};
      for (const key of [
        "title",
        "description",
        "trigger",
        "ownerId",
        "departmentId",
        "severity",
        "status",
        "progress",
        "targetDate",
      ]) {
        if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
      }

      const data = await CorrectiveActionService.update(
        req.params.id,
        patch as CorrectiveActionUpdateInput
      );
      res.json({ success: true, data, message: "Corrective action updated" });
    } catch (error: any) {
      res
        .status(statusFor(error))
        .json({ success: false, message: error?.message ?? "Failed to update corrective action" });
    }
  }

  /** DELETE /:id */
  static async remove(req: AuthRequest, res: Response) {
    try {
      const data = await CorrectiveActionService.remove(req.params.id);
      res.json({ success: true, data, message: "Corrective action deleted" });
    } catch (error: any) {
      res
        .status(statusFor(error))
        .json({ success: false, message: error?.message ?? "Failed to delete corrective action" });
    }
  }
}

export default CorrectiveActionController;
