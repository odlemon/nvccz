// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { HARDCODED_KPIS, getAllKPIs, getKPIsByDepartment, getKPIByCode, getFinancialKPIs, getKPIsByAccountType } from "../config/hardcodedKPIs";
import { buildHardcodedDetailsForResponse } from "../utils/kpiCatalogMetadata";

export class HardcodedKPIController {
  /**
   * Get all hardcoded KPIs from database
   */
  static async getAllKPIs(req: Request, res: Response) {
    try {
      const kpis = await prisma.kPI.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      });

      const enrichedKPIs = kpis.map((kpi) => {
        const hardcodedKPI = HARDCODED_KPIS.find((h) => h.name === kpi.name);
        return {
          ...kpi,
          hardcodedDetails: buildHardcodedDetailsForResponse(kpi, hardcodedKPI ?? null)
        };
      });
      
      res.status(200).json({
        success: true,
        message: "Hardcoded KPIs retrieved successfully",
        data: enrichedKPIs,
        total: enrichedKPIs.length
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
   * Get KPIs by department from database
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

      // First get the department ID
      const departmentRecord = await prisma.department.findFirst({
        where: { name: department }
      });

      if (!departmentRecord) {
        return res.status(404).json({
          success: false,
          message: `Department '${department}' not found`
        });
      }

      const kpis = await prisma.kPI.findMany({
        where: {
          isActive: true,
          catalogDepartmentName: departmentRecord.name
        },
        orderBy: { name: "asc" }
      });

      const enrichedKPIs = kpis.map((kpi) => {
        const hardcodedKPI = HARDCODED_KPIS.find((h) => h.name === kpi.name);
        return {
          ...kpi,
          hardcodedDetails: buildHardcodedDetailsForResponse(kpi, hardcodedKPI ?? null)
        };
      });
      
      res.status(200).json({
        success: true,
        message: `KPIs for ${department} department retrieved successfully`,
        data: enrichedKPIs,
        total: enrichedKPIs.length,
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
   * Get KPI by code from database
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

      const trimmed = String(code).trim();

      let kpi = await prisma.kPI.findFirst({
        where: { code: trimmed, isActive: true }
      });

      let hardcodedKPI = getKPIByCode(trimmed);

      if (!kpi && hardcodedKPI) {
        kpi = await prisma.kPI.findFirst({
          where: { name: hardcodedKPI.name, isActive: true }
        });
      }

      if (!kpi) {
        return res.status(404).json({
          success: false,
          message: "KPI not found in database"
        });
      }

      if (!hardcodedKPI) {
        hardcodedKPI = HARDCODED_KPIS.find((h) => h.name === kpi.name || h.code === kpi.code) ?? null;
      }

      const enrichedKPI = {
        ...kpi,
        hardcodedDetails: buildHardcodedDetailsForResponse(kpi, hardcodedKPI)
      };

      res.status(200).json({
        success: true,
        message: "KPI retrieved successfully",
        data: enrichedKPI
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
   * Get financial KPIs only from database
   */
  static async getFinancialKPIs(req: Request, res: Response) {
    try {
      // Get financial KPI names from hardcoded config
      const financialKPINames = getFinancialKPIs().map(kpi => kpi.name);
      
      const kpis = await prisma.kPI.findMany({
        where: {
          isActive: true,
          OR: [{ name: { in: financialKPINames } }, { isFinancial: true }]
        },
        orderBy: { name: 'asc' }
      });

      const enrichedKPIs = kpis.map((kpi) => {
        const hardcodedKPI = HARDCODED_KPIS.find((h) => h.name === kpi.name);
        return {
          ...kpi,
          hardcodedDetails: buildHardcodedDetailsForResponse(kpi, hardcodedKPI ?? null)
        };
      });
      
      res.status(200).json({
        success: true,
        message: "Financial KPIs retrieved successfully",
        data: enrichedKPIs,
        total: enrichedKPIs.length
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
   * Get KPIs by account type from database
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

      // Get KPI names for this account type from hardcoded config
      const accountTypeKPINames = getKPIsByAccountType(accountType as 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity').map(kpi => kpi.name);
      
      const kpis = await prisma.kPI.findMany({
        where: {
          isActive: true,
          OR: [{ name: { in: accountTypeKPINames } }, { accountType }]
        },
        orderBy: { name: 'asc' }
      });

      const enrichedKPIs = kpis.map((kpi) => {
        const hardcodedKPI = HARDCODED_KPIS.find((h) => h.name === kpi.name);
        return {
          ...kpi,
          hardcodedDetails: buildHardcodedDetailsForResponse(kpi, hardcodedKPI ?? null)
        };
      });
      
      res.status(200).json({
        success: true,
        message: `KPIs for ${accountType} account type retrieved successfully`,
        data: enrichedKPIs,
        total: enrichedKPIs.length,
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
   * Get KPI statistics from database
   */
  static async getKPIStatistics(req: Request, res: Response) {
    try {
      const allKPIs = await prisma.kPI.findMany({
        where: { isActive: true }
      });

      // Get hardcoded KPI details for statistics
      const hardcodedKPIs = getAllKPIs();
      const financialKPINames = getFinancialKPIs().map(kpi => kpi.name);
      
      const financialKPIs = allKPIs.filter(kpi => financialKPINames.includes(kpi.name));
      const nonFinancialKPIs = allKPIs.filter(kpi => !financialKPINames.includes(kpi.name));
      
      // Group by department using hardcoded data
      const byDepartment = hardcodedKPIs.reduce((acc, kpi) => {
        if (!acc[kpi.department]) {
          acc[kpi.department] = [];
        }
        acc[kpi.department].push(kpi);
        return acc;
      }, {} as Record<string, any[]>);

      // Group by account type using hardcoded data
      const byAccountType = hardcodedKPIs.reduce((acc, kpi) => {
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
