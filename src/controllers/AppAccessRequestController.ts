// @ts-nocheck
// Employee requests to access another Matanho module (Home hub's Apps page). Queried with raw
// SQL rather than `prisma.appAccessRequest` for the same reason as ServiceRequestController —
// see the comment there.
import { Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

const MAX_APP_ID_LENGTH = 64;
const MAX_REASON_LENGTH = 500;

export const appAccessRequestController = {
  async listMine(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, app_id AS appId, reason, status, created_at AS createdAt
         FROM app_access_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        userId
      );
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      console.error("Error listing app access requests:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { appId, reason } = req.body || {};
      if (!appId || typeof appId !== "string" || !appId.trim() || appId.length > MAX_APP_ID_LENGTH) {
        res.status(400).json({ success: false, message: `appId is required (max ${MAX_APP_ID_LENGTH} chars)` });
        return;
      }
      if (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
        res.status(400).json({ success: false, message: `reason must be a string (max ${MAX_REASON_LENGTH} chars)` });
        return;
      }

      const existing: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM app_access_requests WHERE user_id = ? AND app_id = ? AND status = 'pending' LIMIT 1`,
        userId,
        appId.trim()
      );
      if (existing.length) {
        res.status(200).json({ success: true, message: "Request already pending", data: existing[0] });
        return;
      }

      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO app_access_requests (id, user_id, app_id, reason, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        id,
        userId,
        appId.trim(),
        reason ? String(reason).trim() : null
      );
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, app_id AS appId, reason, status, created_at AS createdAt
         FROM app_access_requests WHERE id = ?`,
        id
      );
      res.status(201).json({ success: true, message: "Access request submitted successfully", data: rows[0] });
    } catch (error: any) {
      console.error("Error creating app access request:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
};
