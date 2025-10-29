// @ts-nocheck
import { Request, Response } from "express";
import { HARDCODED_KPIS, getAllKPIs, getKPIsByDepartment, getKPIByCode, getFinancialKPIs, getKPIsByAccountType } from "../config/hardcodedKPIs";

export class HardcodedKPIController {
  /**
   * Get all hardcoded KPIs
   */
  static async getAllKPIs(req: Request, res: Response) {
    try {
      const kpis = getAllKPIs();
      
      res.status(200).json({
        success: true,
        message: "Hardcoded KPIs retrieved successfully",
        data: kpis,
        total: kpis.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve hardcoded KPIs",
        error: error.message
      });
    }
  }

  /**
   * Get KPIs by department
   */
  static async getKPIsByDepartment(req: Request, res: Response) {
    try {
      const { department } = req.params;
      
      if (!department) {
        return res.status(400).json({
          success: false,
          message: "Department parameter is required"
        });
      }

      const kpis = getKPIsByDepartment(department);
      
      res.status(200).json({
        success: true,
        message: `KPIs for ${department} department retrieved successfully`,
        data: kpis,
        total: kpis.length,
        department
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve KPIs by department",
        error: error.message
      });
    }
  }

  /**
   * Get KPI by code
   */
  static async getKPIByCode(req: Request, res: Response) {
    try {
      const { code } = req.params;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: "KPI code parameter is required"
        });
      }

      const kpi = getKPIByCode(code);
      
      if (!kpi) {
        return res.status(404).json({
          success: false,
          message: "KPI not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "KPI retrieved successfully",
        data: kpi
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve KPI by code",
        error: error.message
      });
    }
  }

  /**
   * Get financial KPIs only
   */
  static async getFinancialKPIs(req: Request, res: Response) {
    try {
      const kpis = getFinancialKPIs();
      
      res.status(200).json({
        success: true,
        message: "Financial KPIs retrieved successfully",
        data: kpis,
        total: kpis.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve financial KPIs",
        error: error.message
      });
    }
  }

  /**
   * Get KPIs by account type
   */
  static async getKPIsByAccountType(req: Request, res: Response) {
    try {
      const { accountType } = req.params;
      
      if (!accountType) {
        return res.status(400).json({
          success: false,
          message: "Account type parameter is required"
        });
      }

      const validAccountTypes = ['Revenue', 'Expense', 'Asset', 'Liability', 'Equity'];
      if (!validAccountTypes.includes(accountType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid account type. Must be one of: Revenue, Expense, Asset, Liability, Equity"
        });
      }

      const kpis = getKPIsByAccountType(accountType as 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity');
      
      res.status(200).json({
        success: true,
        message: `KPIs for ${accountType} account type retrieved successfully`,
        data: kpis,
        total: kpis.length,
        accountType
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve KPIs by account type",
        error: error.message
      });
    }
  }

  /**
   * Get KPI statistics
   */
  static async getKPIStatistics(req: Request, res: Response) {
    try {
      const allKPIs = getAllKPIs();
      const financialKPIs = getFinancialKPIs();
      const nonFinancialKPIs = allKPIs.filter(kpi => !kpi.isFinancial);
      
      // Group by department
      const byDepartment = allKPIs.reduce((acc, kpi) => {
        if (!acc[kpi.department]) {
          acc[kpi.department] = [];
        }
        acc[kpi.department].push(kpi);
        return acc;
      }, {} as Record<string, any[]>);

      // Group by account type
      const byAccountType = allKPIs.reduce((acc, kpi) => {
        if (!acc[kpi.accountType]) {
          acc[kpi.accountType] = [];
        }
        acc[kpi.accountType].push(kpi);
        return acc;
      }, {} as Record<string, any[]>);

      res.status(200).json({
        success: true,
        message: "KPI statistics retrieved successfully",
        data: {
          total: allKPIs.length,
          financial: financialKPIs.length,
          nonFinancial: nonFinancialKPIs.length,
          byDepartment: Object.keys(byDepartment).map(dept => ({
            department: dept,
            count: byDepartment[dept].length
          })),
          byAccountType: Object.keys(byAccountType).map(type => ({
            accountType: type,
            count: byAccountType[type].length
          }))
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve KPI statistics",
        error: error.message
      });
    }
  }
}
