// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

/**
 * Lightweight internal/client work-item catalog used by timesheets. Deliberately separate from
 * the investment `Fund` model — entries here mix real fund names with plain internal work items
 * (e.g. "Corporate Close", "Workshop ERP"), so this is its own lookup table, not fund-domain data.
 */
export type CreateProjectInput = {
  name: string;
  clientName?: string | null;
  projectType?: string | null;
  budget?: number | string | null;
  status?: string;
  isActive?: boolean;
  createdById?: string | null;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

export class ProjectService {
  static async listProjects(activeOnly = false) {
    return prisma.project.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: "asc" },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  static async createProject(data: CreateProjectInput) {
    if (!data.name || !data.name.trim()) {
      throw new Error("Project name is required");
    }
    return prisma.project.create({
      data: {
        name: data.name.trim(),
        clientName: data.clientName?.trim() || null,
        projectType: data.projectType?.trim() || null,
        budget: data.budget != null ? new Decimal(data.budget) : null,
        status: data.status || "ACTIVE",
        isActive: data.isActive ?? true,
        createdById: data.createdById ?? null,
      },
    });
  }

  static async updateProject(id: string, data: UpdateProjectInput) {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Project not found");
    }
    if (data.name !== undefined && !data.name.trim()) {
      throw new Error("Project name cannot be empty");
    }
    return prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.clientName !== undefined ? { clientName: data.clientName?.trim() || null } : {}),
        ...(data.projectType !== undefined ? { projectType: data.projectType?.trim() || null } : {}),
        ...(data.budget !== undefined
          ? { budget: data.budget != null ? new Decimal(data.budget) : null }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }
}
