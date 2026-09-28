// @ts-nocheck
// Personal calendar entries (Home hub Calendar page). Queried with raw SQL for the same reason
// as the other new Home-hub tables this build added — see HomepageController.ts's preference
// endpoints comment. Deliberately separate from the real `Event` model — see the doc comment on
// CalendarEntry in schema.prisma.
import { Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

const VALID_ENTRY_TYPES = new Set(["meeting", "focus", "reminder", "other"]);
const MAX_RANGE_DAYS = 92;

function rowSelect() {
  return `id, title, description, start_date AS startDate, end_date AS endDate, location,
          entry_type AS entryType, created_at AS createdAt`;
}

export const calendarEntryController = {
  async listMine(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { start, end } = req.query;
      const startDate = start ? new Date(String(start)) : new Date(Date.now() - 30 * 86400000);
      const endDate = end ? new Date(String(end)) : new Date(Date.now() + 60 * 86400000);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
        res.status(400).json({ success: false, message: "start/end must be valid dates with start before end" });
        return;
      }
      if ((endDate.getTime() - startDate.getTime()) / 86400000 > MAX_RANGE_DAYS) {
        res.status(400).json({ success: false, message: `Range cannot exceed ${MAX_RANGE_DAYS} days` });
        return;
      }
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT ${rowSelect()} FROM calendar_entries
         WHERE user_id = ? AND start_date < ? AND end_date > ?
         ORDER BY start_date ASC`,
        userId,
        endDate,
        startDate
      );
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      console.error("Error listing calendar entries:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { title, description, startDate, endDate, location, entryType } = req.body || {};
      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ success: false, message: "title is required" });
        return;
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        res.status(400).json({ success: false, message: "startDate/endDate are required and startDate must be before endDate" });
        return;
      }
      const type = entryType && VALID_ENTRY_TYPES.has(String(entryType)) ? String(entryType) : "meeting";

      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO calendar_entries (id, user_id, title, description, start_date, end_date, location, entry_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        userId,
        title.trim(),
        description ?? null,
        start,
        end,
        location ?? null,
        type
      );
      const rows: any[] = await prisma.$queryRawUnsafe(`SELECT ${rowSelect()} FROM calendar_entries WHERE id = ?`, id);
      res.status(201).json({ success: true, message: "Calendar entry created successfully", data: rows[0] });
    } catch (error: any) {
      console.error("Error creating calendar entry:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },

  async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM calendar_entries WHERE id = ? AND user_id = ?`,
        id,
        userId
      );
      if (!rows.length) {
        res.status(404).json({ success: false, message: "Calendar entry not found" });
        return;
      }
      await prisma.$executeRawUnsafe(`DELETE FROM calendar_entries WHERE id = ?`, id);
      res.status(200).json({ success: true, message: "Calendar entry removed" });
    } catch (error: any) {
      console.error("Error deleting calendar entry:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
};
