// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { ProjectService } from "../services/ProjectService";

export class ProjectController {
  async list(req: AuthRequest, res: Response) {
    try {
      const activeOnly = req.query.activeOnly === "true";
      const projects = await ProjectService.listProjects(activeOnly);
      // hours booked to each project: approved (and of those billable) and still waiting for approval
      const { prisma } = await import("../utils/database");
      const [approved, billable, waiting] = await Promise.all([
        prisma.timesheetEntry.groupBy({ by: ["projectId"], where: { timesheet: { status: "APPROVED" } }, _sum: { hours: true } }),
        prisma.timesheetEntry.groupBy({ by: ["projectId"], where: { billable: true, timesheet: { status: "APPROVED" } }, _sum: { hours: true } }),
        prisma.timesheetEntry.groupBy({ by: ["projectId"], where: { timesheet: { status: "SUBMITTED" } }, _sum: { hours: true } }),
      ]);
      const h = (rows, id) => Number(rows.find((r) => r.projectId === id)?._sum?.hours || 0);
      res.json({ success: true, data: projects.map((p) => ({ ...p, hours: { approved: h(approved, p.id), billable: h(billable, p.id), waiting: h(waiting, p.id) } })) });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || "Failed to list projects" });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const { name, clientName, projectType, budget, status, isActive } = req.body || {};
      if (!name || !String(name).trim()) {
        res.status(400).json({ success: false, message: "name is required" });
        return;
      }
      const project = await ProjectService.createProject({
        name,
        clientName,
        projectType,
        budget,
        status,
        isActive,
        createdById: req.user!.id,
      });
      res.status(201).json({ success: true, message: "Project created successfully", data: project });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || "Failed to create project" });
    }
  }

  /** Not on the originally sketched route list, but ProjectService.updateProject() needs a way in. */
  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const project = await ProjectService.updateProject(id, req.body || {});
      res.json({ success: true, message: "Project updated successfully", data: project });
    } catch (e: any) {
      const status = e.message === "Project not found" ? 404 : 400;
      res.status(status).json({ success: false, message: e.message || "Failed to update project" });
    }
  }
}

export const projectController = new ProjectController();
