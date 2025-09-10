// @ts-nocheck
import { DataIntegrationService, FundPerformanceMetrics, AssetsUnderManagement, PipelineMetrics, PortfolioValuation, OperationalMetrics, AdvancedDealMetrics } from "./DataIntegrationService";
import { DatabaseConnection } from "../utils/database";

const dbConnection = DatabaseConnection.getInstance();
const prisma = dbConnection.getPrismaClient();
import { Decimal } from "@prisma/client/runtime/library";

export interface CEODashboardData {
  financialPerformance: {
    totalAUM: Decimal;
    totalFunds: number;
    activeFunds: number;
    fundPerformance: FundPerformanceMetrics[];
    averageIRR: number;
    averageTVPI: number;
    averageDPI: number;
  };
  investmentPipeline: PipelineMetrics;
  advancedDealMetrics: AdvancedDealMetrics;
  portfolioHealth: PortfolioValuation;
  operationalMetrics: OperationalMetrics;
  hierarchicalTaskView: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
    assignedTasks: number;
    tasksByDepartment: Array<{
      departmentId: string;
      departmentName: string;
      total: number;
      completed: number;
      inProgress: number;
      overdue: number;
    }>;
  };
  keyInsights: Array<{
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    description: string;
    value?: string;
    trend?: 'up' | 'down' | 'stable';
  }>;
  lastUpdated: Date;
}

export interface DrillDownData {
  type: 'fund' | 'portfolio' | 'pipeline' | 'department' | 'task';
  id: string;
  data: any;
  relatedData?: any;
}

export class CEODashboardService {
  /**
   * Get comprehensive CEO dashboard data
   */
  static async getDashboardData(): Promise<CEODashboardData> {
    try {
      // Fetch all data in parallel for better performance
      const [
        aumData,
        pipelineData,
        advancedDealMetrics,
        portfolioData,
        operationalData,
        fundPerformanceData,
        taskData
      ] = await Promise.all([
        DataIntegrationService.calculateAUM(),
        DataIntegrationService.calculatePipelineMetrics(),
        DataIntegrationService.calculateAdvancedDealMetrics(),
        DataIntegrationService.calculatePortfolioValuation(),
        DataIntegrationService.calculateOperationalMetrics(),
        this.getAllFundPerformance(),
        this.getHierarchicalTaskView()
      ]);

      // Calculate fund performance averages
      const averageIRR = fundPerformanceData.length > 0 
        ? fundPerformanceData.reduce((sum, fund) => sum + fund.irr, 0) / fundPerformanceData.length 
        : 0;
      
      const averageTVPI = fundPerformanceData.length > 0 
        ? fundPerformanceData.reduce((sum, fund) => sum + fund.tvpi, 0) / fundPerformanceData.length 
        : 0;
      
      const averageDPI = fundPerformanceData.length > 0 
        ? fundPerformanceData.reduce((sum, fund) => sum + fund.dpi, 0) / fundPerformanceData.length 
        : 0;

      // Generate key insights
      const keyInsights = this.generateKeyInsights(
        aumData,
        pipelineData,
        advancedDealMetrics,
        portfolioData,
        operationalData,
        fundPerformanceData
      );

      return {
        financialPerformance: {
          totalAUM: aumData.totalAUM,
          totalFunds: aumData.totalFunds,
          activeFunds: aumData.activeFunds,
          fundPerformance: fundPerformanceData,
          averageIRR,
          averageTVPI,
          averageDPI
        },
        investmentPipeline: pipelineData,
        advancedDealMetrics: advancedDealMetrics,
        portfolioHealth: portfolioData,
        operationalMetrics: operationalData,
        hierarchicalTaskView: taskData,
        keyInsights,
        lastUpdated: new Date()
      };
    } catch (error: any) {
      throw new Error(`Failed to get CEO dashboard data: ${error.message}`);
    }
  }

  /**
   * Get drill-down data for specific entities
   */
  static async getDrillDownData(type: string, id: string): Promise<DrillDownData> {
    try {
      switch (type) {
        case 'fund':
          return await this.getFundDrillDown(id);
        case 'portfolio':
          return await this.getPortfolioDrillDown(id);
        case 'pipeline':
          return await this.getPipelineDrillDown(id);
        case 'department':
          return await this.getDepartmentDrillDown(id);
        case 'task':
          return await this.getTaskDrillDown(id);
        default:
          throw new Error(`Invalid drill-down type: ${type}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to get drill-down data: ${error.message}`);
    }
  }

  /**
   * Get fund performance for all funds
   */
  private static async getAllFundPerformance(): Promise<FundPerformanceMetrics[]> {
    try {
      const funds = await prisma.fund.findMany({
        where: { status: { in: ['OPEN', 'CLOSED'] } }
      });

      const fundPerformancePromises = funds.map(fund => 
        DataIntegrationService.calculateFundPerformance(fund.id)
      );

      return await Promise.all(fundPerformancePromises);
    } catch (error: any) {
      throw new Error(`Failed to get all fund performance: ${error.message}`);
    }
  }

  /**
   * Get hierarchical task view
   */
  private static async getHierarchicalTaskView(): Promise<{
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
    assignedTasks: number;
    tasksByDepartment: Array<{
      departmentId: string;
      departmentName: string;
      total: number;
      completed: number;
      inProgress: number;
      overdue: number;
    }>;
  }> {
    try {
      const tasks = await prisma.task.findMany({
        include: {
          goal: {
            include: {
              department: true
            }
          }
        }
      });

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
      const overdueTasks = tasks.filter(t => t.isOverdue).length;
      const assignedTasks = tasks.filter(t => {
        try {
          if (t.team) {
            const teamData = typeof t.team === 'string' ? JSON.parse(t.team) : t.team;
            return Array.isArray(teamData) && teamData.length > 0;
          }
          return false;
        } catch (error) {
          return false;
        }
      }).length;

      // Group by department
      const departmentGroups = tasks.reduce((groups, task) => {
        const departmentName = task.goal?.department?.name || 'Unassigned';
        const departmentId = task.goal?.department?.id || 'unassigned';
        
        if (!groups[departmentId]) {
          groups[departmentId] = {
            departmentId,
            departmentName,
            total: 0,
            completed: 0,
            inProgress: 0,
            overdue: 0
          };
        }
        
        groups[departmentId].total++;
        if (task.status === 'completed') groups[departmentId].completed++;
        if (task.status === 'in_progress') groups[departmentId].inProgress++;
        if (task.isOverdue) groups[departmentId].overdue++;
        
        return groups;
      }, {} as Record<string, any>);

      const tasksByDepartment = Object.values(departmentGroups);

      return {
        totalTasks,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        assignedTasks,
        tasksByDepartment
      };
    } catch (error: any) {
      throw new Error(`Failed to get hierarchical task view: ${error.message}`);
    }
  }

  /**
   * Generate key insights based on data
   */
  private static generateKeyInsights(
    aumData: AssetsUnderManagement,
    pipelineData: PipelineMetrics,
    advancedDealMetrics: AdvancedDealMetrics,
    portfolioData: PortfolioValuation,
    operationalData: OperationalMetrics,
    fundPerformanceData: FundPerformanceMetrics[]
  ): Array<{
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    description: string;
    value?: string;
    trend?: 'up' | 'down' | 'stable';
  }> {
    const insights: Array<{
      type: 'success' | 'warning' | 'error' | 'info';
      title: string;
      description: string;
      value?: string;
      trend?: 'up' | 'down' | 'stable';
    }> = [];

    // AUM insights
    if (aumData.totalAUM.greaterThan(new Decimal(10000000))) { // $10M+
      insights.push({
        type: 'success',
        title: 'Strong AUM Growth',
        description: `Total AUM has reached $${aumData.totalAUM.toFixed(0)}`,
        value: `$${aumData.totalAUM.toFixed(0)}`,
        trend: 'up'
      });
    }

    // Fund performance insights
    const avgIRR = fundPerformanceData.length > 0 
      ? fundPerformanceData.reduce((sum, fund) => sum + fund.irr, 0) / fundPerformanceData.length 
      : 0;

    if (avgIRR > 15) {
      insights.push({
        type: 'success',
        title: 'Excellent Fund Performance',
        description: `Average IRR across all funds is ${avgIRR.toFixed(1)}%`,
        value: `${avgIRR.toFixed(1)}%`,
        trend: 'up'
      });
    } else if (avgIRR < 5) {
      insights.push({
        type: 'warning',
        title: 'Fund Performance Below Target',
        description: `Average IRR is ${avgIRR.toFixed(1)}%, below target of 15%`,
        value: `${avgIRR.toFixed(1)}%`,
        trend: 'down'
      });
    }

    // Pipeline insights
    if (pipelineData.totalDeals > 50) {
      insights.push({
        type: 'info',
        title: 'Active Pipeline',
        description: `${pipelineData.totalDeals} deals in pipeline worth $${pipelineData.totalPipelineValue.toFixed(0)}`,
        value: `${pipelineData.totalDeals} deals`
      });
    }

    // Advanced Deal Metrics insights
    if (advancedDealMetrics.totalDealsSourced > 0) {
      const conversionRate = (advancedDealMetrics.totalDealsClosed / advancedDealMetrics.totalDealsSourced) * 100;
      
      if (conversionRate > 70) {
        insights.push({
          type: 'success',
          title: 'High Deal Conversion Rate',
          description: `${conversionRate.toFixed(1)}% of sourced deals are being closed`,
          value: `${conversionRate.toFixed(1)}%`,
          trend: 'up'
        });
      } else if (conversionRate < 30) {
        insights.push({
          type: 'warning',
          title: 'Low Deal Conversion Rate',
          description: `Only ${conversionRate.toFixed(1)}% of sourced deals are being closed`,
          value: `${conversionRate.toFixed(1)}%`,
          trend: 'down'
        });
      }

      // Time to close insights
      if (advancedDealMetrics.averageTimeToClose > 90) {
        insights.push({
          type: 'warning',
          title: 'Slow Deal Closing',
          description: `Average time to close deals is ${advancedDealMetrics.averageTimeToClose.toFixed(0)} days`,
          value: `${advancedDealMetrics.averageTimeToClose.toFixed(0)} days`,
          trend: 'up'
        });
      } else if (advancedDealMetrics.averageTimeToClose < 30) {
        insights.push({
          type: 'success',
          title: 'Fast Deal Closing',
          description: `Average time to close deals is ${advancedDealMetrics.averageTimeToClose.toFixed(0)} days`,
          value: `${advancedDealMetrics.averageTimeToClose.toFixed(0)} days`,
          trend: 'down'
        });
      }

      // Top performing manager
      if (advancedDealMetrics.dealsByManager.length > 0) {
        const topManager = advancedDealMetrics.dealsByManager.reduce((prev, current) => 
          (prev.conversionRate > current.conversionRate) ? prev : current
        );
        
        if (topManager.conversionRate > 80) {
          insights.push({
            type: 'success',
            title: 'Top Performing Manager',
            description: `${topManager.managerName} has ${topManager.conversionRate.toFixed(1)}% conversion rate`,
            value: `${topManager.conversionRate.toFixed(1)}%`,
            trend: 'up'
          });
        }
      }
    }

    // Operational insights
    if (operationalData.expenseVariancePercentage > 10) {
      insights.push({
        type: 'warning',
        title: 'Budget Variance Alert',
        description: `Expenses are ${operationalData.expenseVariancePercentage.toFixed(1)}% over budget`,
        value: `${operationalData.expenseVariancePercentage.toFixed(1)}%`,
        trend: 'up'
      });
    }

    // Task insights
    const overduePercentage = operationalData.taskSummary.total > 0 
      ? (operationalData.taskSummary.overdue / operationalData.taskSummary.total) * 100 
      : 0;

    if (overduePercentage > 20) {
      insights.push({
        type: 'error',
        title: 'High Overdue Task Rate',
        description: `${overduePercentage.toFixed(1)}% of tasks are overdue`,
        value: `${overduePercentage.toFixed(1)}%`,
        trend: 'up'
      });
    }

    return insights;
  }

  /**
   * Get fund drill-down data
   */
  private static async getFundDrillDown(fundId: string): Promise<DrillDownData> {
    try {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId },
        include: {
          portfolioCompanies: {
            include: {
              investmentImplementation: {
                include: {
                  fundDisbursements: true
                }
              }
            }
          },
          applications: true,
          fundManagers: {
            include: {
              user: true
            }
          }
        }
      });

      if (!fund) {
        throw new Error(`Fund with ID ${fundId} not found`);
      }

      const fundPerformance = await DataIntegrationService.calculateFundPerformance(fundId);

      return {
        type: 'fund',
        id: fundId,
        data: {
          fund,
          performance: fundPerformance
        },
        relatedData: {
          portfolioCompanies: fund.portfolioCompanies,
          applications: fund.applications,
          fundManagers: fund.fundManagers
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get fund drill-down: ${error.message}`);
    }
  }

  /**
   * Get portfolio drill-down data
   */
  private static async getPortfolioDrillDown(companyId: string): Promise<DrillDownData> {
    try {
      const company = await prisma.portfolioCompany.findUnique({
        where: { id: companyId },
        include: {
          fund: true,
          investmentImplementation: {
            include: {
              fundDisbursements: true,
              milestones: true
            }
          },
          user: true
        }
      });

      if (!company) {
        throw new Error(`Portfolio company with ID ${companyId} not found`);
      }

      return {
        type: 'portfolio',
        id: companyId,
        data: company,
        relatedData: {
          fund: company.fund,
          investmentImplementation: company.investmentImplementation,
          user: company.user
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get portfolio drill-down: ${error.message}`);
    }
  }

  /**
   * Get pipeline drill-down data
   */
  private static async getPipelineDrillDown(stage: string): Promise<DrillDownData> {
    try {
      const applications = await prisma.application.findMany({
        where: { currentStage: stage },
        include: {
          fund: true,
          documents: true
        }
      });

      return {
        type: 'pipeline',
        id: stage,
        data: {
          stage,
          applications,
          totalValue: applications.reduce((sum, app) => sum.plus(app.requestedAmount), new Decimal(0)),
          count: applications.length
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get pipeline drill-down: ${error.message}`);
    }
  }

  /**
   * Get department drill-down data
   */
  private static async getDepartmentDrillDown(departmentId: string): Promise<DrillDownData> {
    try {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        include: {
          users: {
            include: {
              performanceGoals: {
                include: {
                  tasks: true
                }
              }
            }
          },
          goals: {
            include: {
              tasks: true,
              subGoals: true
            }
          }
        }
      });

      if (!department) {
        throw new Error(`Department with ID ${departmentId} not found`);
      }

      return {
        type: 'department',
        id: departmentId,
        data: department,
        relatedData: {
          users: department.users,
          goals: department.goals
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get department drill-down: ${error.message}`);
    }
  }

  /**
   * Get task drill-down data
   */
  private static async getTaskDrillDown(taskId: string): Promise<DrillDownData> {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          goal: {
            include: {
              department: true,
              assignedTo: true
            }
          },
          creator: true,
          activityLogs: true
        }
      });

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      return {
        type: 'task',
        id: taskId,
        data: task,
        relatedData: {
          goal: task.goal,
          creator: task.creator,
          activityLogs: task.activityLogs
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get task drill-down: ${error.message}`);
    }
  }

  /**
   * Get advanced deal metrics
   */
  static async getAdvancedDealMetrics() {
    try {
      const advancedDealMetrics = await DataIntegrationService.calculateAdvancedDealMetrics();
      return advancedDealMetrics;
    } catch (error: any) {
      throw new Error(`Failed to get advanced deal metrics: ${error.message}`);
    }
  }
}
