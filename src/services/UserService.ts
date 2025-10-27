// @ts-nocheck
import { prisma } from "../utils/database";

export class UserService {
  /**
   * Get users filtered by department and/or role
   * Used for approval configuration
   */
  static async getUsersByDepartmentAndRole(
    department?: string,
    departmentRole?: string
  ) {
    try {
      const where: any = {};

      if (department) {
        where.userDepartment = department;
      }

      if (departmentRole) {
        where.departmentRole = departmentRole;
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          role: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { userDepartment: 'asc' },
          { departmentRole: 'asc' },
          { firstName: 'asc' }
        ]
      });

      return users;
    } catch (error) {
      console.error("Error getting users by department and role:", error);
      throw error;
    }
  }
}


