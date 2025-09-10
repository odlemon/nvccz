// @ts-nocheck
import { Request, Response } from "express";
import { DepartmentService } from "../services/DepartmentService";

export class DepartmentController {
  // Create a new department
  static async createDepartment(req: Request, res: Response) {
    try {
      const { name, description, branch } = req.body;
      const userId = req.user.id;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Department name is required"
        });
      }

      const department = await DepartmentService.createDepartment({
        name,
        description,
        branch
      });

      res.status(201).json({
        success: true,
        message: "Department created successfully",
        department
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all departments
  static async getAllDepartments(req: Request, res: Response) {
    try {
      const { isActive, branch, search } = req.query;

      const filters: any = {};
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      if (branch) {
        filters.branch = branch as string;
      }
      if (search) {
        filters.search = search as string;
      }

      const departments = await DepartmentService.getAllDepartments(filters);

      res.status(200).json({
        success: true,
        count: departments.length,
        departments
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get department by ID
  static async getDepartmentById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const department = await DepartmentService.getDepartmentById(id);

      res.status(200).json({
        success: true,
        department
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update department
  static async updateDepartment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, branch, isActive } = req.body;

      const department = await DepartmentService.updateDepartment(id, {
        name,
        description,
        branch,
        isActive
      });

      res.status(200).json({
        success: true,
        message: "Department updated successfully",
        department
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete department
  static async deleteDepartment(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const result = await DepartmentService.deleteDepartment(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get department statistics
  static async getDepartmentStatistics(req: Request, res: Response) {
    try {
      const statistics = await DepartmentService.getDepartmentStatistics();

      res.status(200).json({
        success: true,
        statistics
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

