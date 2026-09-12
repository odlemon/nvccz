// @ts-nocheck
import { Request, Response } from "express";
import { CEODashboardService } from "../services/CEODashboardService";
import { DataIntegrationService } from "../services/DataIntegrationService";
import { PortfolioDashboardService } from "../services/PortfolioDashboardService";
import { prisma } from "../utils/database";
import { computeTaskPercentage } from "../services/TaskService";

export class CEODashboardController {
  /**
   * Get comprehensive CEO dashboard data
   */
  static async getDashboard(req: Request, res: Response) {
    try {
      const dashboardData = await CEODashboardService.getDashboardData();

      res.status(200).json({
        success: true,
        message: "CEO dashboard data retrieved successfully",
        data: dashboardData
      });
    } catch (error: any) {
      console.error("CEO Dashboard Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve CEO dashboard data",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get drill-down data for specific entities
   */
  static async getDrillDown(req: Request, res: Response) {
    try {
      const { type, id } = req.params;

      if (!type || !id) {
        return res.status(400).json({
          success: false,
          message: "Type and ID parameters are required"
        });
      }

      const drillDownData = await CEODashboardService.getDrillDownData(type, id);

      res.status(200).json({
        success: true,
        message: "Drill-down data retrieved successfully",
        data: drillDownData
      });
    } catch (error: any) {
      console.error("Drill-down Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve drill-down data",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get fund performance metrics
   */
  static async getFundPerformance(req: Request, res: Response) {
    try {
      const { fundId } = req.params;

      if (!fundId) {
        return res.status(400).json({
          success: false,
          message: "Fund ID is required"
        });
      }

      const fundPerformance = await DataIntegrationService.calculateFundPerformance(fundId);

      res.status(200).json({
        success: true,
        message: "Fund performance calculated successfully",
        data: fundPerformance
      });
    } catch (error: any) {
      console.error("Fund Performance Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to calculate fund performance",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get all funds performance
   */
  static async getAllFundsPerformance(req: Request, res: Response) {
    try {
      const funds = await DataIntegrationService.calculateAUM();
      
      // Get performance for each fund
      const fundPerformancePromises = funds.fundBreakdown.map(fund => 
        DataIntegrationService.calculateFundPerformance(fund.fundId)
      );
      
      const allFundPerformance = await Promise.all(fundPerformancePromises);

      res.status(200).json({
        success: true,
        message: "All funds performance retrieved successfully",
        data: {
          aum: funds,
          fundPerformance: allFundPerformance
        }
      });
    } catch (error: any) {
      console.error("All Funds Performance Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve all funds performance",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get investment pipeline analytics
   */
  static async getPipelineAnalytics(req: Request, res: Response) {
    try {
      const pipelineData = await DataIntegrationService.calculatePipelineMetrics();

      res.status(200).json({
        success: true,
        message: "Investment pipeline analytics retrieved successfully",
        data: pipelineData
      });
    } catch (error: any) {
      console.error("Pipeline Analytics Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve pipeline analytics",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get portfolio health metrics
   */
  static async getPortfolioHealth(req: Request, res: Response) {
    try {
      const portfolioData = await DataIntegrationService.calculatePortfolioValuation();

      res.status(200).json({
        success: true,
        message: "Portfolio health metrics retrieved successfully",
        data: portfolioData
      });
    } catch (error: any) {
      console.error("Portfolio Health Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve portfolio health metrics",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get operational metrics
   */
  static async getOperationalMetrics(req: Request, res: Response) {
    try {
      const operationalData = await DataIntegrationService.calculateOperationalMetrics();

      res.status(200).json({
        success: true,
        message: "Operational metrics retrieved successfully",
        data: operationalData
      });
    } catch (error: any) {
      console.error("Operational Metrics Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve operational metrics",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get hierarchical task view
   */
  static async getHierarchicalTaskView(req: Request, res: Response) {
    try {
      const { departmentId } = req.query;

      let taskData;
      if (departmentId) {
        const department = await prisma.department.findUnique({
          where: { id: departmentId as string },
        });

        if (!department) {
          return res.status(404).json({
            success: false,
            message: "Department not found",
            timestamp: new Date().toISOString(),
          });
        }

        // PerformanceGoal has scalar `departmentName`, not a `department` relation — match by department name (and task `department` string).
        const tasks = await prisma.task.findMany({
          where: {
            OR: [
              { goal: { departmentName: department.name } },
              { department: department.name },
            ],
          },
          include: {
            goal: {
              include: {
                assignedTo: true,
              },
            },
            creator: true,
          },
        });

        // Add taskPercentage to each task
        const tasksWithPercentage = tasks.map(task => ({
          ...task,
          taskPercentage: computeTaskPercentage(task)
        }));

        taskData = {
          department: department,
          tasks: tasksWithPercentage,
          summary: {
            total: tasks.length,
            completed: tasks.filter(t => t.status === 'completed').length,
            inProgress: tasks.filter(t => t.status === 'in_progress').length,
            overdue: tasks.filter(t => t.isOverdue).length,
            assigned: tasks.filter(t => t.team && JSON.parse(t.team as string).length > 0).length
          }
        };
      } else {
        // Get all tasks with hierarchical view
        const dashboardData = await CEODashboardService.getDashboardData();
        taskData = dashboardData.hierarchicalTaskView;
      }

      res.status(200).json({
        success: true,
        message: "Hierarchical task view retrieved successfully",
        data: taskData
      });
    } catch (error: any) {
      console.error("Hierarchical Task View Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve hierarchical task view",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get key insights and alerts
   */
  static async getKeyInsights(req: Request, res: Response) {
    try {
      const dashboardData = await CEODashboardService.getDashboardData();

      res.status(200).json({
        success: true,
        message: "Key insights retrieved successfully",
        data: {
          insights: dashboardData.keyInsights,
          lastUpdated: dashboardData.lastUpdated
        }
      });
    } catch (error: any) {
      console.error("Key Insights Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve key insights",
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get real-time metrics (for live updates)
   */
  static async getRealTimeMetrics(req: Request, res: Response) {
    try {
      const { metrics } = req.query;
      
      if (!metrics) {
        return res.status(400).json({
          success: false,
          message: "Metrics parameter is required (comma-separated list)"
        });
      }

      const requestedMetrics = (metrics as string).split(',');
      const results: any = {};

      // Fetch only requested metrics for better performance
      for (const metric of requestedMetrics) {
        switch (metric.trim()) {
          case 'aum':
            results.aum = await DataIntegrationService.calculateAUM();
            break;
          case 'holdingsAum':
          case 'holdings_aum':
            results.holdingsAum = await PortfolioDashboardService.getAggregatedHoldingsAumSnapshot();
            break;
          case 'pipeline':
            results.pipeline = await DataIntegrationService.calculatePipelineMetrics();
            break;
          case 'portfolio':
            results.portfolio = await DataIntegrationService.calculatePortfolioValuation();
            break;
          case 'operational':
            results.operational = await DataIntegrationService.calculateOperationalMetrics();
            break;
          default:
            console.warn(`Unknown metric requested: ${metric}`);
        }
      }

      res.status(200).json({
        success: true,
        message: "Real-time metrics retrieved successfully",
        data: {
          metrics: results,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("Real-time Metrics Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve real-time metrics",
        timestamp: new Date().toISOString()
      });
    }
  }

  static async getAdvancedDealMetrics(req: Request, res: Response) {
    try {
      const advancedDealMetrics = await CEODashboardService.getAdvancedDealMetrics();
      
      res.status(200).json({
        success: true,
        message: "Advanced deal metrics retrieved successfully",
        data: advancedDealMetrics
      });
    } catch (error: any) {
      console.error("Advanced Deal Metrics Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve advanced deal metrics",
        timestamp: new Date().toISOString()
      });
    }
  }
}
