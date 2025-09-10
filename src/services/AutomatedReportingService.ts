// @ts-nocheck
import { DatabaseConnection } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

const dbConnection = DatabaseConnection.getInstance();
const prisma = dbConnection.getPrismaClient();

export interface CreateReportTemplateRequest {
  name: string;
  description?: string;
  reportType: string;
  category: string;
  frequency: string;
  schedule?: string;
  template: any;
  parameters: any;
  recipients: string[];
}

export interface UpdateReportTemplateRequest {
  name?: string;
  description?: string;
  reportType?: string;
  category?: string;
  frequency?: string;
  schedule?: string;
  template?: any;
  parameters?: any;
  recipients?: string[];
  isActive?: boolean;
}

export interface GenerateReportRequest {
  templateId: string;
  reportPeriod: string;
  parameters?: any;
}

export interface CreateVarianceReportRequest {
  reportPeriod: string;
  reportType: string;
  actualExpenses: number;
  budgetedExpenses: number;
  significantVariances: any[];
  explanations: any[];
  actionItems: any[];
}

export interface CreateTurnoverAnalysisReportRequest {
  reportPeriod: string;
  reportType: string;
  totalEmployees: number;
  employeesLeft: number;
  voluntaryTurnover: number;
  involuntaryTurnover: number;
  departmentBreakdown: any;
  roleBreakdown: any;
  tenureBreakdown: any;
  exitInterviewData: any;
  commonReasons: any;
  retentionRecommendations: any;
}

export class AutomatedReportingService {
  // ===== REPORT TEMPLATE OPERATIONS =====

  static async createReportTemplate(request: CreateReportTemplateRequest) {
    try {
      // Check if template name already exists
      const existingTemplate = await prisma.reportTemplate.findUnique({
        where: { name: request.name }
      });

      if (existingTemplate) {
        throw new Error(`Report template with name ${request.name} already exists`);
      }

      // Validate creator exists
      const creator = await prisma.user.findUnique({
        where: { id: request.recipients[0] } // Assuming first recipient is the creator
      });

      if (!creator) {
        throw new Error(`User with ID ${request.recipients[0]} not found`);
      }

      const template = await prisma.reportTemplate.create({
        data: {
          name: request.name,
          description: request.description,
          reportType: request.reportType,
          category: request.category,
          frequency: request.frequency,
          schedule: request.schedule,
          template: request.template,
          parameters: request.parameters,
          recipients: request.recipients,
          createdBy: request.recipients[0] // Assuming first recipient is the creator
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return template;
    } catch (error) {
      throw new Error(`Failed to create report template: ${error.message}`);
    }
  }

  static async getAllReportTemplates(page: number = 1, limit: number = 10, filters?: any) {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      
      if (filters?.reportType) {
        where.reportType = filters.reportType;
      }
      
      if (filters?.category) {
        where.category = filters.category;
      }
      
      if (filters?.frequency) {
        where.frequency = filters.frequency;
      }
      
      if (filters?.isActive !== undefined) {
        where.isActive = filters.isActive;
      }
      
      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const [templates, total] = await Promise.all([
        prisma.reportTemplate.findMany({
          where,
          skip,
          take: limit,
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            generatedReports: {
              orderBy: { generatedAt: 'desc' },
              take: 3
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.reportTemplate.count({ where })
      ]);

      return {
        templates,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get report templates: ${error.message}`);
    }
  }

  static async getReportTemplateById(id: string) {
    try {
      const template = await prisma.reportTemplate.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          generatedReports: {
            orderBy: { generatedAt: 'desc' }
          }
        }
      });

      if (!template) {
        throw new Error(`Report template with ID ${id} not found`);
      }

      return template;
    } catch (error) {
      throw new Error(`Failed to get report template: ${error.message}`);
    }
  }

  static async updateReportTemplate(id: string, request: UpdateReportTemplateRequest) {
    try {
      const existingTemplate = await prisma.reportTemplate.findUnique({
        where: { id }
      });

      if (!existingTemplate) {
        throw new Error(`Report template with ID ${id} not found`);
      }

      // Check if name is being updated and if it already exists
      if (request.name && request.name !== existingTemplate.name) {
        const existingName = await prisma.reportTemplate.findUnique({
          where: { name: request.name }
        });

        if (existingName) {
          throw new Error(`Report template with name ${request.name} already exists`);
        }
      }

      const template = await prisma.reportTemplate.update({
        where: { id },
        data: request,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          generatedReports: {
            orderBy: { generatedAt: 'desc' },
            take: 3
          }
        }
      });

      return template;
    } catch (error) {
      throw new Error(`Failed to update report template: ${error.message}`);
    }
  }

  static async deleteReportTemplate(id: string) {
    try {
      const existingTemplate = await prisma.reportTemplate.findUnique({
        where: { id }
      });

      if (!existingTemplate) {
        throw new Error(`Report template with ID ${id} not found`);
      }

      await prisma.reportTemplate.delete({
        where: { id }
      });

      return { message: "Report template deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete report template: ${error.message}`);
    }
  }

  // ===== REPORT GENERATION OPERATIONS =====

  static async generateReport(request: GenerateReportRequest) {
    try {
      const template = await prisma.reportTemplate.findUnique({
        where: { id: request.templateId }
      });

      if (!template) {
        throw new Error(`Report template with ID ${request.templateId} not found`);
      }

      if (!template.isActive) {
        throw new Error(`Report template is not active`);
      }

      // Generate report data based on template type
      let reportData: any = {};
      let insights: any[] = [];
      let recommendations: any[] = [];

      switch (template.reportType) {
        case 'VARIANCE':
          reportData = await this.generateVarianceReportData(request.reportPeriod, request.parameters);
          insights = this.generateVarianceInsights(reportData);
          recommendations = this.generateVarianceRecommendations(reportData);
          break;
        case 'TURNOVER':
          reportData = await this.generateTurnoverReportData(request.reportPeriod, request.parameters);
          insights = this.generateTurnoverInsights(reportData);
          recommendations = this.generateTurnoverRecommendations(reportData);
          break;
        case 'PERFORMANCE':
          reportData = await this.generatePerformanceReportData(request.reportPeriod, request.parameters);
          insights = this.generatePerformanceInsights(reportData);
          recommendations = this.generatePerformanceRecommendations(reportData);
          break;
        case 'STAKEHOLDER':
          reportData = await this.generateStakeholderReportData(request.reportPeriod, request.parameters);
          insights = this.generateStakeholderInsights(reportData);
          recommendations = this.generateStakeholderRecommendations(reportData);
          break;
        case 'DEAL_METRICS':
          reportData = await this.generateDealMetricsReportData(request.reportPeriod, request.parameters);
          insights = this.generateDealMetricsInsights(reportData);
          recommendations = this.generateDealMetricsRecommendations(reportData);
          break;
        default:
          throw new Error(`Unsupported report type: ${template.reportType}`);
      }

      const generatedReport = await prisma.generatedReport.create({
        data: {
          templateId: request.templateId,
          reportName: `${template.name} - ${request.reportPeriod}`,
          reportType: template.reportType,
          reportPeriod: request.reportPeriod,
          data: reportData,
          summary: this.generateReportSummary(reportData, template.reportType),
          insights: insights,
          recommendations: recommendations,
          recipients: template.recipients
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              reportType: true,
              category: true
            }
          }
        }
      });

      return generatedReport;
    } catch (error) {
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  // ===== VARIANCE REPORT OPERATIONS =====

  static async createVarianceReport(request: CreateVarianceReportRequest) {
    try {
      const variance = new Decimal(request.actualExpenses).minus(new Decimal(request.budgetedExpenses));
      const variancePercentage = request.budgetedExpenses > 0 
        ? variance.div(new Decimal(request.budgetedExpenses)).mul(100)
        : new Decimal(0);

      const varianceReport = await prisma.varianceReport.create({
        data: {
          reportPeriod: request.reportPeriod,
          reportType: request.reportType,
          actualExpenses: new Decimal(request.actualExpenses),
          budgetedExpenses: new Decimal(request.budgetedExpenses),
          variance: variance,
          variancePercentage: variancePercentage,
          significantVariances: request.significantVariances,
          explanations: request.explanations,
          actionItems: request.actionItems,
          preparedBy: "system" // This should be passed from the request
        },
        include: {
          preparer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return varianceReport;
    } catch (error) {
      throw new Error(`Failed to create variance report: ${error.message}`);
    }
  }

  // ===== TURNOVER ANALYSIS REPORT OPERATIONS =====

  static async createTurnoverAnalysisReport(request: CreateTurnoverAnalysisReportRequest) {
    try {
      const turnoverRate = request.totalEmployees > 0 
        ? new Decimal(request.employeesLeft).div(new Decimal(request.totalEmployees)).mul(100)
        : new Decimal(0);

      const turnoverReport = await prisma.turnoverAnalysisReport.create({
        data: {
          reportPeriod: request.reportPeriod,
          reportType: request.reportType,
          totalEmployees: request.totalEmployees,
          employeesLeft: request.employeesLeft,
          turnoverRate: turnoverRate,
          voluntaryTurnover: request.voluntaryTurnover,
          involuntaryTurnover: request.involuntaryTurnover,
          departmentBreakdown: request.departmentBreakdown,
          roleBreakdown: request.roleBreakdown,
          tenureBreakdown: request.tenureBreakdown,
          exitInterviewData: request.exitInterviewData,
          commonReasons: request.commonReasons,
          retentionRecommendations: request.retentionRecommendations,
          preparedBy: "system" // This should be passed from the request
        },
        include: {
          preparer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return turnoverReport;
    } catch (error) {
      throw new Error(`Failed to create turnover analysis report: ${error.message}`);
    }
  }

  // ===== REPORT DATA GENERATION METHODS =====

  private static async generateVarianceReportData(period: string, parameters?: any) {
    // This would typically query actual financial data
    // For now, returning mock data structure
    return {
      period,
      actualExpenses: 150000,
      budgetedExpenses: 140000,
      variance: 10000,
      variancePercentage: 7.14,
      significantVariances: [
        { category: "Marketing", actual: 25000, budgeted: 20000, variance: 5000, percentage: 25 },
        { category: "Travel", actual: 15000, budgeted: 10000, variance: 5000, percentage: 50 }
      ],
      explanations: [
        { category: "Marketing", reason: "Increased digital advertising spend" },
        { category: "Travel", reason: "Additional client meetings and conferences" }
      ]
    };
  }

  private static async generateTurnoverReportData(period: string, parameters?: any) {
    // This would typically query HR data
    return {
      period,
      totalEmployees: 50,
      employeesLeft: 5,
      turnoverRate: 10,
      voluntaryTurnover: 4,
      involuntaryTurnover: 1,
      departmentBreakdown: {
        "Engineering": { total: 20, left: 2, rate: 10 },
        "Sales": { total: 15, left: 2, rate: 13.33 },
        "Marketing": { total: 10, left: 1, rate: 10 }
      },
      commonReasons: [
        { reason: "Better compensation", count: 2 },
        { reason: "Career growth", count: 1 },
        { reason: "Work-life balance", count: 1 }
      ]
    };
  }

  private static async generatePerformanceReportData(period: string, parameters?: any) {
    // This would typically query performance data
    return {
      period,
      totalReviews: 25,
      completedReviews: 20,
      completionRate: 80,
      averageScore: 85.5,
      departmentPerformance: {
        "Engineering": { averageScore: 88, completionRate: 90 },
        "Sales": { averageScore: 82, completionRate: 75 },
        "Marketing": { averageScore: 87, completionRate: 85 }
      }
    };
  }

  private static async generateStakeholderReportData(period: string, parameters?: any) {
    // This would typically query stakeholder data
    return {
      period,
      totalStakeholders: 15,
      activeStakeholders: 12,
      retentionRate: 80,
      newStakeholders: 3,
      engagementMetrics: {
        averageSatisfaction: 4.2,
        totalEngagements: 45,
        averageEngagementDuration: 60
      }
    };
  }

  private static async generateDealMetricsReportData(period: string, parameters?: any) {
    // This would typically query deal data
    return {
      period,
      totalDeals: 12,
      dealsClosed: 8,
      averageDealSize: 250000,
      averageTimeToClose: 45,
      conversionRate: 66.67,
      dealsByStage: {
        "Sourcing": 4,
        "Due Diligence": 3,
        "Term Sheet": 2,
        "Closed": 3
      }
    };
  }

  // ===== INSIGHTS AND RECOMMENDATIONS GENERATION =====

  private static generateVarianceInsights(data: any): any[] {
    return [
      {
        type: "warning",
        title: "Budget Variance Alert",
        description: `Expenses exceeded budget by ${data.variancePercentage}%`,
        value: `$${data.variance.toLocaleString()}`
      }
    ];
  }

  private static generateVarianceRecommendations(data: any): any[] {
    return [
      {
        priority: "high",
        title: "Review Marketing Spend",
        description: "Marketing expenses exceeded budget by 25%. Review campaign effectiveness.",
        action: "Schedule budget review meeting"
      }
    ];
  }

  private static generateTurnoverInsights(data: any): any[] {
    return [
      {
        type: "info",
        title: "Turnover Rate",
        description: `Overall turnover rate is ${data.turnoverRate}%`,
        value: `${data.employeesLeft}/${data.totalEmployees}`
      }
    ];
  }

  private static generateTurnoverRecommendations(data: any): any[] {
    return [
      {
        priority: "medium",
        title: "Improve Retention",
        description: "Focus on compensation and career growth opportunities",
        action: "Conduct salary review"
      }
    ];
  }

  private static generatePerformanceInsights(data: any): any[] {
    return [
      {
        type: "success",
        title: "Performance Review Completion",
        description: `${data.completionRate}% of reviews completed`,
        value: `${data.completedReviews}/${data.totalReviews}`
      }
    ];
  }

  private static generatePerformanceRecommendations(data: any): any[] {
    return [
      {
        priority: "low",
        title: "Improve Review Completion",
        description: "Focus on completing remaining performance reviews",
        action: "Send reminder notifications"
      }
    ];
  }

  private static generateStakeholderInsights(data: any): any[] {
    return [
      {
        type: "success",
        title: "Stakeholder Retention",
        description: `${data.retentionRate}% stakeholder retention rate`,
        value: `${data.activeStakeholders}/${data.totalStakeholders}`
      }
    ];
  }

  private static generateStakeholderRecommendations(data: any): any[] {
    return [
      {
        priority: "medium",
        title: "Increase Engagement",
        description: "Improve stakeholder engagement activities",
        action: "Schedule quarterly stakeholder meetings"
      }
    ];
  }

  private static generateDealMetricsInsights(data: any): any[] {
    return [
      {
        type: "success",
        title: "Deal Conversion Rate",
        description: `${data.conversionRate}% conversion rate`,
        value: `${data.dealsClosed}/${data.totalDeals}`
      }
    ];
  }

  private static generateDealMetricsRecommendations(data: any): any[] {
    return [
      {
        priority: "high",
        title: "Improve Deal Velocity",
        description: "Focus on reducing time to close deals",
        action: "Streamline due diligence process"
      }
    ];
  }

  private static generateReportSummary(data: any, reportType: string): string {
    switch (reportType) {
      case 'VARIANCE':
        return `Budget variance report for ${data.period}: ${data.variancePercentage}% variance with $${data.variance} over budget.`;
      case 'TURNOVER':
        return `Turnover analysis for ${data.period}: ${data.turnoverRate}% turnover rate with ${data.employeesLeft} employees leaving.`;
      case 'PERFORMANCE':
        return `Performance review summary for ${data.period}: ${data.completionRate}% completion rate with average score of ${data.averageScore}.`;
      case 'STAKEHOLDER':
        return `Stakeholder report for ${data.period}: ${data.retentionRate}% retention rate with ${data.totalStakeholders} total stakeholders.`;
      case 'DEAL_METRICS':
        return `Deal metrics for ${data.period}: ${data.conversionRate}% conversion rate with ${data.dealsClosed} deals closed.`;
      default:
        return `Report summary for ${data.period}.`;
    }
  }

  // ===== REPORT ANALYTICS =====

  static async getReportingAnalytics() {
    try {
      const [
        totalTemplates,
        activeTemplates,
        totalReports,
        reportsByType,
        reportsByStatus
      ] = await Promise.all([
        prisma.reportTemplate.count(),
        prisma.reportTemplate.count({ where: { isActive: true } }),
        prisma.generatedReport.count(),
        
        prisma.generatedReport.groupBy({
          by: ['reportType'],
          _count: { reportType: true }
        }),
        
        prisma.generatedReport.groupBy({
          by: ['status'],
          _count: { status: true }
        })
      ]);

      return {
        totalTemplates,
        activeTemplates,
        totalReports,
        reportsByType: reportsByType.map(item => ({
          reportType: item.reportType,
          count: item._count.reportType
        })),
        reportsByStatus: reportsByStatus.map(item => ({
          status: item.status,
          count: item._count.status
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get reporting analytics: ${error.message}`);
    }
  }
}
