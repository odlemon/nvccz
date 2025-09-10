// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export interface CreateKPIRequest {
  name: string;
  type: string; // "Metric", "Percentage"
  branch?: string;
  weightValue?: number;
  hasUnit?: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition?: string; // "prefix", "suffix"
}

export interface UpdateKPIRequest {
  name?: string;
  type?: string;
  branch?: string;
  weightValue?: number;
  hasUnit?: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition?: string;
  isActive?: boolean;
}

export class KPIService {
  // Create a new KPI
  static async createKPI(request: CreateKPIRequest) {
    try {
      // Check if KPI name already exists
      const existingKPI = await prisma.kPI.findFirst({
        where: { 
          name: request.name,
          branch: request.branch || null
        }
      });

      if (existingKPI) {
        throw new Error("KPI with this name already exists in this branch");
      }

      // Create the KPI
      const kpi = await prisma.kPI.create({
        data: {
          name: request.name,
          type: request.type,
          branch: request.branch,
          weightValue: request.weightValue,
          hasUnit: request.hasUnit || false,
          unitCategory: request.unitCategory,
          unit: request.unit,
          unitSymbol: request.unitSymbol,
          unitPosition: request.unitPosition || "suffix",
          isActive: true
        }
      });

      return kpi;
    } catch (error) {
      throw error;
    }
  }

  // Get all KPIs
  static async getAllKPIs(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.branch) {
        where.branch = filters.branch;
      }

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.hasUnit !== undefined) {
        where.hasUnit = filters.hasUnit;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { unitCategory: { contains: filters.search, mode: 'insensitive' } },
          { unit: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const kpis = await prisma.kPI.findMany({
        where,
        include: {
          performanceGoals: {
            select: {
              id: true,
              title: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              performanceGoals: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return kpis;
    } catch (error) {
      throw error;
    }
  }

  // Get KPI by ID
  static async getKPIById(id: string) {
    try {
      const kpi = await prisma.kPI.findUnique({
        where: { id },
        include: {
          performanceGoals: {
            include: {
              department: {
                select: {
                  id: true,
                  name: true
                }
              },
              assignedTo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          _count: {
            select: {
              performanceGoals: true
            }
          }
        }
      });

      if (!kpi) {
        throw new Error("KPI not found");
      }

      return kpi;
    } catch (error) {
      throw error;
    }
  }

  // Update KPI
  static async updateKPI(id: string, request: UpdateKPIRequest) {
    try {
      const existingKPI = await prisma.kPI.findUnique({
        where: { id }
      });

      if (!existingKPI) {
        throw new Error("KPI not found");
      }

      // Check if new name conflicts with existing KPI
      if (request.name && request.name !== existingKPI.name) {
        const nameConflict = await prisma.kPI.findFirst({
          where: { 
            name: request.name,
            branch: request.branch || existingKPI.branch,
            id: { not: id }
          }
        });

        if (nameConflict) {
          throw new Error("KPI with this name already exists in this branch");
        }
      }

      // Update the KPI
      const updatedKPI = await prisma.kPI.update({
        where: { id },
        data: {
          ...(request.name && { name: request.name }),
          ...(request.type && { type: request.type }),
          ...(request.branch !== undefined && { branch: request.branch }),
          ...(request.weightValue !== undefined && { weightValue: request.weightValue }),
          ...(request.hasUnit !== undefined && { hasUnit: request.hasUnit }),
          ...(request.unitCategory !== undefined && { unitCategory: request.unitCategory }),
          ...(request.unit !== undefined && { unit: request.unit }),
          ...(request.unitSymbol !== undefined && { unitSymbol: request.unitSymbol }),
          ...(request.unitPosition !== undefined && { unitPosition: request.unitPosition }),
          ...(request.isActive !== undefined && { isActive: request.isActive })
        },
        include: {
          performanceGoals: {
            select: {
              id: true,
              title: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              performanceGoals: true
            }
          }
        }
      });

      return updatedKPI;
    } catch (error) {
      throw error;
    }
  }

  // Delete KPI
  static async deleteKPI(id: string) {
    try {
      const existingKPI = await prisma.kPI.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              performanceGoals: true
            }
          }
        }
      });

      if (!existingKPI) {
        throw new Error("KPI not found");
      }

      // Check if KPI has associated performance goals
      if (existingKPI._count.performanceGoals > 0) {
        throw new Error("Cannot delete KPI with associated performance goals");
      }

      await prisma.kPI.delete({
        where: { id }
      });

      return { message: "KPI deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get KPI statistics
  static async getKPIStatistics() {
    try {
      const [
        totalKPIs,
        metricKPIs,
        percentageKPIs,
        activeKPIs,
        kpisWithUnits
      ] = await Promise.all([
        prisma.kPI.count(),
        prisma.kPI.count({ where: { type: "Metric" } }),
        prisma.kPI.count({ where: { type: "Percentage" } }),
        prisma.kPI.count({ where: { isActive: true } }),
        prisma.kPI.count({ where: { hasUnit: true } })
      ]);

      // Get KPIs by branch
      const kpisByBranch = await prisma.kPI.groupBy({
        by: ['branch'],
        _count: {
          id: true
        },
        where: {
          branch: { not: null }
        }
      });

      // Get KPIs by type
      const kpisByType = await prisma.kPI.groupBy({
        by: ['type'],
        _count: {
          id: true
        }
      });

      return {
        totalKPIs,
        metricKPIs,
        percentageKPIs,
        activeKPIs,
        kpisWithUnits,
        kpisByBranch,
        kpisByType
      };
    } catch (error) {
      throw error;
    }
  }
}
