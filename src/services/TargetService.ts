// @ts-nocheck
import { PrismaClient, Target, User } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

export interface CreateTargetParams {
  type: "Sales" | "Revenue" | "Expenses" | "Profit";
  value: number;
  deadline: Date;
  createdById: string;
}

export interface UpdateTargetParams {
  type?: "Sales" | "Revenue" | "Expenses" | "Profit";
  value?: number;
  deadline?: Date;
  isActive?: boolean;
}

export interface TargetWithRelations extends Target {
  createdBy: User;
}

export class TargetService {
  /**
   * Create a new target
   */
  static async createTarget(params: CreateTargetParams): Promise<TargetWithRelations> {
    try {
      const { type, value, deadline, createdById } = params;

      // Validate input parameters
      if (!type || !["Sales", "Revenue", "Expenses", "Profit"].includes(type)) {
        throw new Error("Invalid target type. Must be one of: Sales, Revenue, Expenses, Profit");
      }
      if (!value || value <= 0) {
        throw new Error("Value must be greater than zero");
      }
      if (!deadline || deadline <= new Date()) {
        throw new Error("Deadline must be in the future");
      }

      // Validate that user exists
      const user = await prisma.user.findUnique({
        where: { id: createdById }
      });
      if (!user) {
        throw new Error("User not found");
      }

      const target = await prisma.target.create({
        data: {
          type,
          value: new Decimal(value),
          deadline,
          createdById
        },
        include: {
          createdBy: true
        }
      });

      return target;
    } catch (error: any) {
      throw new Error(`Failed to create target: ${error.message}`);
    }
  }

  /**
   * Get target by ID
   */
  static async getTargetById(id: string): Promise<TargetWithRelations | null> {
    try {
      const target = await prisma.target.findUnique({
        where: { id },
        include: {
          createdBy: true
        }
      });

      return target;
    } catch (error: any) {
      throw new Error(`Failed to get target: ${error.message}`);
    }
  }

  /**
   * Get all targets with filtering and pagination
   */
  static async getTargets(params: {
    page?: number;
    limit?: number;
    type?: string;
    isActive?: boolean;
    createdById?: string;
  }): Promise<{
    targets: TargetWithRelations[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        page = 1,
        limit = 10,
        type,
        isActive,
        createdById
      } = params;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};
      if (type) {
        where.type = type;
      }
      if (isActive !== undefined) {
        where.isActive = isActive;
      } else {
        // Default to showing only active targets
        where.isActive = true;
      }
      if (createdById) {
        where.createdById = createdById;
      }

      const [targets, total] = await Promise.all([
        prisma.target.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: true
          }
        }),
        prisma.target.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        targets,
        total,
        page,
        limit,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get targets: ${error.message}`);
    }
  }

  /**
   * Update target
   */
  static async updateTarget(id: string, updateData: UpdateTargetParams): Promise<TargetWithRelations> {
    try {
      // Check if target exists
      const existingTarget = await prisma.target.findUnique({
        where: { id }
      });

      if (!existingTarget) {
        throw new Error("Target not found");
      }

      // Validate type if provided
      if (updateData.type && !["Sales", "Revenue", "Expenses", "Profit"].includes(updateData.type)) {
        throw new Error("Invalid target type. Must be one of: Sales, Revenue, Expenses, Profit");
      }

      // Validate value if provided
      if (updateData.value !== undefined && updateData.value <= 0) {
        throw new Error("Value must be greater than zero");
      }

      // Validate deadline if provided
      if (updateData.deadline && updateData.deadline <= new Date()) {
        throw new Error("Deadline must be in the future");
      }

      // Prepare update data
      const data: any = {};
      if (updateData.type) data.type = updateData.type;
      if (updateData.value !== undefined) data.value = new Decimal(updateData.value);
      if (updateData.deadline) data.deadline = updateData.deadline;
      if (updateData.isActive !== undefined) data.isActive = updateData.isActive;

      const target = await prisma.target.update({
        where: { id },
        data,
        include: {
          createdBy: true
        }
      });

      return target;
    } catch (error: any) {
      throw new Error(`Failed to update target: ${error.message}`);
    }
  }

  /**
   * Delete target (permanent deletion)
   */
  static async deleteTarget(id: string): Promise<void> {
    try {
      const existingTarget = await prisma.target.findUnique({
        where: { id }
      });

      if (!existingTarget) {
        throw new Error("Target not found");
      }

      await prisma.target.delete({
        where: { id }
      });
    } catch (error: any) {
      throw new Error(`Failed to delete target: ${error.message}`);
    }
  }

  /**
   * Get target summary by type
   */
  static async getTargetSummary(): Promise<{
    totalTargets: number;
    activeTargets: number;
    byType: Array<{
      type: string;
      count: number;
      totalValue: number;
    }>;
    upcomingDeadlines: Array<{
      id: string;
      type: string;
      value: number;
      deadline: Date;
      daysRemaining: number;
    }>;
  }> {
    try {
      const [totalTargets, activeTargets, byType, upcomingDeadlines] = await Promise.all([
        prisma.target.count(),
        prisma.target.count({ where: { isActive: true } }),
        prisma.target.groupBy({
          by: ["type"],
          where: { isActive: true },
          _count: { type: true },
          _sum: { value: true }
        }),
        prisma.target.findMany({
          where: {
            isActive: true,
            deadline: {
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
            }
          },
          orderBy: { deadline: "asc" },
          take: 10
        })
      ]);

      const byTypeFormatted = byType.map(item => ({
        type: item.type,
        count: item._count.type,
        totalValue: Number(item._sum.value || 0)
      }));

      const upcomingDeadlinesFormatted = upcomingDeadlines.map(target => {
        const daysRemaining = Math.ceil((target.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: target.id,
          type: target.type,
          value: Number(target.value),
          deadline: target.deadline,
          daysRemaining
        };
      });

      return {
        totalTargets,
        activeTargets,
        byType: byTypeFormatted,
        upcomingDeadlines: upcomingDeadlinesFormatted
      };
    } catch (error: any) {
      throw new Error(`Failed to get target summary: ${error.message}`);
    }
  }
}

export default TargetService; 