// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import {
  getAllRoles,
  getRolesByDepartment,
  getRoleByCode,
  getAllDepartmentsWithRoles,
  getDepartmentWithRoles,
  DEPARTMENTS
} from "../config/hardcodedRoles";

export class HardcodedRoleController {
  /**
   * Get all hardcoded roles
   */
  async getAllRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const roles = getAllRoles();

      res.status(200).json({
        success: true,
        message: "Hardcoded roles retrieved successfully",
        data: roles,
        count: roles.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get roles by department
   */
  async getRolesByDepartment(req: Request, res: Response, next: NextFunction) {
    try {
      const { department } = req.params;

      if (!DEPARTMENTS.includes(department as any)) {
        res.status(404).json({
          success: false,
          message: `Department '${department}' not found. Valid departments: ${DEPARTMENTS.join(', ')}`
        });
        return;
      }

      const roles = getRolesByDepartment(department);

      res.status(200).json({
        success: true,
        message: `Roles for ${department} department retrieved successfully`,
        data: {
          department: department,
          roles: roles,
          count: roles.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get role by code
   */
  async getRoleByCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;

      const role = getRoleByCode(code);

      if (!role) {
        res.status(404).json({
          success: false,
          message: `Role with code '${code}' not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Role retrieved successfully",
        data: role
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all departments with their roles
   */
  async getAllDepartmentsWithRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const departmentsWithRoles = getAllDepartmentsWithRoles();

      res.status(200).json({
        success: true,
        message: "All departments with roles retrieved successfully",
        data: departmentsWithRoles,
        count: departmentsWithRoles.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single department with roles
   */
  async getDepartmentWithRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const { department } = req.params;

      const departmentWithRoles = getDepartmentWithRoles(department);

      if (!departmentWithRoles) {
        res.status(404).json({
          success: false,
          message: `Department '${department}' not found. Valid departments: ${DEPARTMENTS.join(', ')}`
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Department with roles retrieved successfully`,
        data: departmentWithRoles
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get list of all departments
   */
  async getAllDepartments(req: Request, res: Response, next: NextFunction) {
    try {
      const departments = DEPARTMENTS.map(dept => ({
        name: dept,
        code: dept.toUpperCase().replace(/\s+/g, '_'),
        description: `${dept} Department`
      }));

      res.status(200).json({
        success: true,
        message: "All departments retrieved successfully",
        data: departments,
        count: departments.length
      });
    } catch (error) {
      next(error);
    }
  }
}






