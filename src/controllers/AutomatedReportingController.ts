// @ts-nocheck
import { Request, Response } from "express";
import { AutomatedReportingService } from "../services/AutomatedReportingService";
import { responseHelper } from "../utils/responseHelper";

export class AutomatedReportingController {
  // ===== REPORT TEMPLATE OPERATIONS =====

  static async createReportTemplate(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        reportType,
        category,
        frequency,
        schedule,
        template,
        parameters,
        recipients
      } = req.body;

      const request = {
        name,
        description,
        reportType,
        category,
        frequency,
        schedule,
        template,
        parameters,
        recipients
      };

      const reportTemplate = await AutomatedReportingService.createReportTemplate(request);
      
      return responseHelper.success(res, reportTemplate, "Report template created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getAllReportTemplates(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const filters: any = {};
      
      if (req.query.reportType) {
        filters.reportType = req.query.reportType as string;
      }
      
      if (req.query.category) {
        filters.category = req.query.category as string;
      }
      
      if (req.query.frequency) {
        filters.frequency = req.query.frequency as string;
      }
      
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === 'true';
      }
      
      if (req.query.search) {
        filters.search = req.query.search as string;
      }

      const result = await AutomatedReportingService.getAllReportTemplates(page, limit, filters);
      
      return responseHelper.success(res, result, "Report templates retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getReportTemplateById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const template = await AutomatedReportingService.getReportTemplateById(id);
      
      return responseHelper.success(res, template, "Report template retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async updateReportTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        reportType,
        category,
        frequency,
        schedule,
        template,
        parameters,
        recipients,
        isActive
      } = req.body;

      const request = {
        name,
        description,
        reportType,
        category,
        frequency,
        schedule,
        template,
        parameters,
        recipients,
        isActive
      };

      const reportTemplate = await AutomatedReportingService.updateReportTemplate(id, request);
      
      return responseHelper.success(res, reportTemplate, "Report template updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async deleteReportTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await AutomatedReportingService.deleteReportTemplate(id);
      
      return responseHelper.success(res, result, "Report template deleted successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== REPORT GENERATION OPERATIONS =====

  static async generateReport(req: Request, res: Response) {
    try {
      const {
        templateId,
        reportPeriod,
        parameters
      } = req.body;

      const request = {
        templateId,
        reportPeriod,
        parameters
      };

      const generatedReport = await AutomatedReportingService.generateReport(request);
      
      return responseHelper.success(res, generatedReport, "Report generated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== VARIANCE REPORT OPERATIONS =====

  static async createVarianceReport(req: Request, res: Response) {
    try {
      const {
        reportPeriod,
        reportType,
        actualExpenses,
        budgetedExpenses,
        significantVariances,
        explanations,
        actionItems
      } = req.body;

      const request = {
        reportPeriod,
        reportType,
        actualExpenses,
        budgetedExpenses,
        significantVariances,
        explanations,
        actionItems
      };

      const varianceReport = await AutomatedReportingService.createVarianceReport(request);
      
      return responseHelper.success(res, varianceReport, "Variance report created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== TURNOVER ANALYSIS REPORT OPERATIONS =====

  static async createTurnoverAnalysisReport(req: Request, res: Response) {
    try {
      const {
        reportPeriod,
        reportType,
        totalEmployees,
        employeesLeft,
        voluntaryTurnover,
        involuntaryTurnover,
        departmentBreakdown,
        roleBreakdown,
        tenureBreakdown,
        exitInterviewData,
        commonReasons,
        retentionRecommendations
      } = req.body;

      const request = {
        reportPeriod,
        reportType,
        totalEmployees,
        employeesLeft,
        voluntaryTurnover,
        involuntaryTurnover,
        departmentBreakdown,
        roleBreakdown,
        tenureBreakdown,
        exitInterviewData,
        commonReasons,
        retentionRecommendations
      };

      const turnoverReport = await AutomatedReportingService.createTurnoverAnalysisReport(request);
      
      return responseHelper.success(res, turnoverReport, "Turnover analysis report created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== REPORTING ANALYTICS =====

  static async getReportingAnalytics(req: Request, res: Response) {
    try {
      const analytics = await AutomatedReportingService.getReportingAnalytics();
      
      return responseHelper.success(res, analytics, "Reporting analytics retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }
}
