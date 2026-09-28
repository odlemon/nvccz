import type { Response } from "express";
import type { AuthRequest } from "../middleware/authenticate";
import PerformanceAlertService from "../services/PerformanceAlertService";
import PerformanceAlertRuleService from "../services/PerformanceAlertRuleService";
import { perfActor } from "../services/PerformanceScope";

/** The caller's reach over the register (PerformanceScope): none for the organisation scope. */
async function alertScopeFor(req: any) {
  const a = await perfActor(req.user);
  return a.org ? null : { userId: a.id, departmentId: a.scope === "department" ? a.departmentId : null };
}

/** Service errors carry `statusCode` (400 validation / 404 not found); everything else is a 500. */
function statusFor(e: unknown): number {
  const code = (e as { statusCode?: unknown })?.statusCode;
  return typeof code === "number" ? code : 500;
}

function messageFor(e: unknown, fallback: string): string {
  const message = (e as { message?: unknown })?.message;
  return typeof message === "string" && message ? message : fallback;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export default class PerformanceAlertController {
  /** GET / — list with optional status / severity / ownerId / departmentId / search / paging. */
  static async listAlerts(req: AuthRequest, res: Response) {
    try {
      const { status, severity, ownerId, departmentId, search, limit, offset } = req.query;
      const alerts = await PerformanceAlertService.listAlerts({
        status: asString(status),
        severity: asString(severity),
        ownerId: asString(ownerId),
        departmentId: asString(departmentId),
        search: asString(search),
        limit: limit !== undefined ? Number(limit) : undefined,
        offset: offset !== undefined ? Number(offset) : undefined,
        scope: await alertScopeFor(req),
      });
      res.json({ success: true, data: alerts });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to load alerts") });
    }
  }

  /** GET /summary — board KPI counts. Declared before GET /:id in the router. */
  static async getSummary(req: AuthRequest, res: Response) {
    try {
      const summary = await PerformanceAlertService.summary(await alertScopeFor(req));
      res.json({ success: true, data: summary });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to load alert summary") });
    }
  }

  /** GET /:id */
  static async getAlertById(req: AuthRequest, res: Response) {
    try {
      const alert = await PerformanceAlertService.getAlertById(req.params.id);
      res.json({ success: true, data: alert });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to load alert") });
    }
  }

  /** POST / */
  static async createAlert(req: AuthRequest, res: Response) {
    try {
      const body = req.body as {
        title?: string;
        description?: string | null;
        source?: string | null;
        severity?: string | null;
        status?: string | null;
        ownerId?: string | null;
        departmentId?: string | null;
        escalationLevel?: number | null;
        raisedAt?: string | null;
      };
      // createdById always comes from the authenticated session, never the request body.
      const createdById = req.user?.id;
      if (!createdById) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const alert = await PerformanceAlertService.createAlert(
        {
          title: body?.title ?? "",
          description: body?.description ?? null,
          source: body?.source ?? null,
          severity: body?.severity ?? null,
          status: body?.status ?? null,
          ownerId: body?.ownerId ?? null,
          departmentId: body?.departmentId ?? null,
          escalationLevel: body?.escalationLevel ?? null,
          raisedAt: body?.raisedAt ? new Date(body.raisedAt) : null,
        },
        createdById
      );
      res.status(201).json({ success: true, message: "Alert created successfully", data: alert });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to create alert") });
    }
  }

  /** PATCH /:id — partial update; only keys present on the body are written. */
  static async updateAlert(req: AuthRequest, res: Response) {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Parameters<typeof PerformanceAlertService.updateAlert>[1] = {};

      if ("title" in body) patch.title = String(body.title ?? "");
      if ("description" in body) patch.description = (body.description as string | null) ?? null;
      if ("source" in body) patch.source = String(body.source ?? "");
      if ("severity" in body) patch.severity = String(body.severity ?? "");
      if ("status" in body) patch.status = String(body.status ?? "");
      if ("ownerId" in body) patch.ownerId = (body.ownerId as string | null) ?? null;
      if ("departmentId" in body) patch.departmentId = (body.departmentId as string | null) ?? null;
      if ("escalationLevel" in body) patch.escalationLevel = Number(body.escalationLevel);
      if ("raisedAt" in body) patch.raisedAt = new Date(String(body.raisedAt));

      const alert = await PerformanceAlertService.updateAlert(req.params.id, patch);
      res.json({ success: true, message: "Alert updated successfully", data: alert });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to update alert") });
    }
  }

  /** POST /:id/acknowledge */
  static async acknowledgeAlert(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const alert = await PerformanceAlertService.acknowledge(req.params.id, userId);
      await PerformanceAlertRuleService.recordEvent(req.params.id, "acknowledged", req.body?.note ?? null, userId);
      res.json({ success: true, message: "Alert acknowledged", data: alert });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to acknowledge alert") });
    }
  }

  /** POST /:id/escalate */
  static async escalateAlert(req: AuthRequest, res: Response) {
    try {
      const note = String(req.body?.note ?? "").trim();
      if (!note) {
        res.status(400).json({ success: false, message: "Say why the alert is being escalated." });
        return;
      }
      const alert = await PerformanceAlertService.escalate(req.params.id);
      await PerformanceAlertRuleService.recordEvent(req.params.id, "escalated", note, req.user?.id ?? null);
      res.json({ success: true, message: "Alert escalated", data: alert });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to escalate alert") });
    }
  }

  /** POST /:id/resolve */
  static async resolveAlert(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const note = String(req.body?.note ?? "").trim();
      if (!note) {
        res.status(400).json({ success: false, message: "Say how the alert was resolved." });
        return;
      }
      const alert = await PerformanceAlertService.resolve(req.params.id, userId);
      await PerformanceAlertRuleService.recordEvent(req.params.id, "resolved", note, userId);
      res.json({ success: true, message: "Alert resolved", data: alert });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to resolve alert") });
    }
  }

  /** DELETE /:id */
  static async deleteAlert(req: AuthRequest, res: Response) {
    try {
      const result = await PerformanceAlertService.deleteAlert(req.params.id);
      res.json({ success: true, message: "Alert deleted successfully", data: result });
    } catch (e: unknown) {
      res.status(statusFor(e)).json({ success: false, message: messageFor(e, "Failed to delete alert") });
    }
  }
}
