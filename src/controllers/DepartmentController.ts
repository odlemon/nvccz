// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { DEPARTMENTS } from "../config/hardcodedRoles";

/**
 * Org departments from `departments` table (cuid ids).
 * Used by FP&A budgeting owners picker: GET /api/departments → { id, name }.
 */
export class DepartmentController {
  static async list(req: Request, res: Response) {
    try {
      let rows = await prisma.department.findMany({
        where: req.query.includeInactive === "true" ? undefined : { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          branch: true,
          isActive: true,
        },
      });

      // Ensure catalog rows exist so budget-cycle owners can bind real ids
      if (!rows.length) {
        for (const name of DEPARTMENTS) {
          await prisma.department.upsert({
            where: { name },
            create: { name, description: `${name} Department`, isActive: true },
            update: { isActive: true },
          });
        }
        rows = await prisma.department.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            branch: true,
            isActive: true,
          },
        });
      }

      res.json({
        success: true,
        data: rows.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          branch: d.branch,
          isActive: d.isActive,
        })),
        count: rows.length,
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        code: "ERROR",
        message: e?.message || "Failed to list departments",
      });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const row = await prisma.department.findUnique({
        where: { id: String(req.params.id) },
        select: {
          id: true,
          name: true,
          description: true,
          branch: true,
          isActive: true,
        },
      });
      if (!row) {
        res.status(404).json({ success: false, code: "NOT_FOUND", message: "Department not found" });
        return;
      }
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        code: "ERROR",
        message: e?.message || "Failed to get department",
      });
    }
  }
}
