// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceScorecardService } from "../services/PerformanceScorecardService";

export class PerformanceScorecardController {
  /**
   * Get performance scorecards for all users
   */
  static async getAllUsersScorecards(req: Request, res: Response) {
    try {
      const userScorecards = await PerformanceScorecardService.getAllUsersScorecards();
      
      res.status(200).json({
        success: true,
        message: "Users performance scorecards retrieved successfully",
        data: userScorecards
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get performance scorecards for all departments
   */
  static async getAllDepartmentsScorecards(req: Request, res: Response) {
    try {
      const departmentScorecards = await PerformanceScorecardService.getAllDepartmentsScorecards();
      
      res.status(200).json({
        success: true,
        message: "Departments performance scorecards retrieved successfully",
        data: departmentScorecards
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

