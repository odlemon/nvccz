// @ts-nocheck
// Employee self-service requests (Home hub Services page). Queried with raw SQL rather than
// `prisma.serviceRequest` for the same reason as HomepageController's preference endpoints —
// see the comment there and design-refs/home-page/execution-plan.md in the frontend repo.
import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

// Deliberately not a strict enum: `type` is the Home hub's service-catalog id
// (lib/home-v3-mock/matanho-data.ts's `services` array on the frontend, e.g. "expenses" not
// "expense" — plus a couple of ids from that page that aren't in the catalog, like "support"
// for "Report an issue"). Coupling this to an exact enum broke the very first live test when
// the catalog didn't match; length/shape validation catches garbage without needing this
// backend to track the frontend's catalog.
const MAX_TYPE_LENGTH = 32;

export const serviceRequestController = {
  async listMine(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, type, summary, amount, status, next_action AS nextAction, created_at AS createdAt
         FROM service_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        userId
      );
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      console.error("Error listing service requests:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { type, summary, amount } = req.body || {};
      if (!type || typeof type !== "string" || !type.trim() || type.length > MAX_TYPE_LENGTH) {
        res.status(400).json({ success: false, message: `type is required (max ${MAX_TYPE_LENGTH} chars)` });
        return;
      }
      if (!summary || typeof summary !== "string" || !summary.trim()) {
        res.status(400).json({ success: false, message: "summary is required" });
        return;
      }
      const parsedAmount =
        amount === undefined || amount === null || amount === "" ? null : Number(amount);
      if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
        res.status(400).json({ success: false, message: "amount must be a non-negative number" });
        return;
      }

      const id = randomUUID();
      const nextAction = type === "leave" ? "Manager approval" : "Review submitted details";
      await prisma.$executeRawUnsafe(
        `INSERT INTO service_requests (id, user_id, type, summary, amount, status, next_action)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        id,
        userId,
        String(type),
        summary.trim(),
        parsedAmount,
        nextAction
      );
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, type, summary, amount, status, next_action AS nextAction, created_at AS createdAt
         FROM service_requests WHERE id = ?`,
        id
      );
      res.status(201).json({ success: true, message: "Service request submitted successfully", data: rows[0] });
    } catch (error: any) {
      console.error("Error creating service request:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
};
