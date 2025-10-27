// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateDepartmentRequest {
  name: string;
  description?: string;
  branch?: string;
}

export interface UpdateDepartmentRequest {
  name?: string;
  description?: string;
  branch?: string;
  isActive?: boolean;
}

export class DepartmentService {
  // Create a new department
  static async createDepartment(request: CreateDepartmentRequest) {
    try {
      // Check if department name already exists
      const existingDepartment = await prisma.department.findUnique({
        where: { name: request.name }
      });

      if (existingDepartment) {
        throw new Error("Department with this name already exists");
      }

      // Create the department
      const department = await prisma.department.create({
        data: {
          name: request.name,
          description: request.description,
          branch: request.branch,
          isActive: true
        }
      });

      return department;
    } catch (error) {
      throw error;
    }
  }

  // Get all departments
  static async getAllDepartments(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.branch) {
        where.branch = filters.branch;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const departments = await prisma.department.findMany({
        where,
        include: {
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          goals: {
            select: {
              id: true,
              title: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              users: true,
              goals: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return departments;
    } catch (error) {
      throw error;
    }
  }

  // Get department by ID
  static async getDepartmentById(id: string) {
    try {
      const department = await prisma.department.findUnique({
        where: { id },
        include: {
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          goals: {
            include: {
              kpi: {
                select: {
                  id: true,
                  name: true,
                  type: true
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
              users: true,
              goals: true
            }
          }
        }
      });

      if (!department) {
        throw new Error("Department not found");
      }

      return department;
    } catch (error) {
      throw error;
    }
  }

  // Update department
  static async updateDepartment(id: string, request: UpdateDepartmentRequest) {
    try {
      const existingDepartment = await prisma.department.findUnique({
        where: { id }
      });

      if (!existingDepartment) {
        throw new Error("Department not found");
      }

      // Check if new name conflicts with existing department
      if (request.name && request.name !== existingDepartment.name) {
        const nameConflict = await prisma.department.findUnique({
          where: { name: request.name }
        });

        if (nameConflict) {
          throw new Error("Department with this name already exists");
        }
      }

      // Update the department
      const updatedDepartment = await prisma.department.update({
        where: { id },
        data: {
          ...(request.name && { name: request.name }),
          ...(request.description !== undefined && { description: request.description }),
          ...(request.branch !== undefined && { branch: request.branch }),
          ...(request.isActive !== undefined && { isActive: request.isActive })
        },
        include: {
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          _count: {
            select: {
              users: true,
              goals: true
            }
          }
        }
      });

      return updatedDepartment;
    } catch (error) {
      throw error;
    }
  }

  // Delete department
  static async deleteDepartment(id: string) {
    try {
      const existingDepartment = await prisma.department.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              users: true,
              goals: true
            }
          }
        }
      });

      if (!existingDepartment) {
        throw new Error("Department not found");
      }

      // Check if department has users or goals
      if (existingDepartment._count.users > 0) {
        throw new Error("Cannot delete department with assigned users");
      }

      if (existingDepartment._count.goals > 0) {
        throw new Error("Cannot delete department with active goals");
      }

      await prisma.department.delete({
        where: { id }
      });

      return { message: "Department deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get department statistics
  static async getDepartmentStatistics() {
    try {
      const [
        totalDepartments,
        activeDepartments,
        totalUsers,
        totalGoals
      ] = await Promise.all([
        prisma.department.count(),
        prisma.department.count({ where: { isActive: true } }),
        prisma.user.count({ where: { departmentId: { not: null } } }),
        prisma.performanceGoal.count()
      ]);

      // Get departments with user counts
      const departmentsWithCounts = await prisma.department.findMany({
        select: {
          id: true,
          name: true,
          isActive: true,
          _count: {
            select: {
              users: true,
              goals: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      return {
        totalDepartments,
        activeDepartments,
        totalUsers,
        totalGoals,
        departments: departmentsWithCounts
      };
    } catch (error) {
      throw error;
    }
  }
}

