// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export interface FundPerformanceMetrics {
  fundId: string;
  fundName: string;
  totalAmount: Decimal;
  remainingAmount: Decimal;
  disbursedAmount: Decimal;
  irr: number;
  tvpi: number;
  dpi: number;
  portfolioCompanies: number;
  totalInvestments: Decimal;
  averageInvestmentSize: Decimal;
  status: string;
}

export interface AssetsUnderManagement {
  totalAUM: Decimal;
  totalFunds: number;
  activeFunds: number;
  totalDisbursed: Decimal;
  totalRemaining: Decimal;
  fundBreakdown: Array<{
    fundId: string;
    fundName: string;
    totalAmount: Decimal;
    remainingAmount: Decimal;
    disbursedAmount: Decimal;
    percentage: number;
  }>;
}

export interface PipelineMetrics {
  totalPipelineValue: Decimal;
  totalDeals: number;
  dealsByStage: Array<{
    stage: string;
    count: number;
    totalValue: Decimal;
    averageValue: Decimal;
  }>;
  averageTimeToClose: number; // in days
  conversionRates: Array<{
    fromStage: string;
    toStage: string;
    rate: number;
  }>;
}

export interface AdvancedDealMetrics {
  totalDealsSourced: number;
  totalDealsClosed: number;
  averageDealSize: Decimal;
  averageTimeToClose: number; // in days
  dealsByManager: Array<{
    managerId: string;
    managerName: string;
    dealsSourced: number;
    dealsClosed: number;
    averageDealSize: Decimal;
    averageTimeToClose: number;
    conversionRate: number;
    totalValue: Decimal;
  }>;
  dealsByStage: Array<{
    stage: string;
    count: number;
    totalValue: Decimal;
    averageValue: Decimal;
    averageTimeInStage: number;
  }>;
  timeToCloseTrend: Array<{
    period: string;
    averageTimeToClose: number;
    dealCount: number;
  }>;
  dealFlowByManager: Array<{
    managerId: string;
    managerName: string;
    monthlyDeals: Array<{
      month: string;
      dealsSourced: number;
      dealsClosed: number;
      totalValue: Decimal;
    }>;
  }>;
}

export interface PortfolioValuation {
  totalPortfolioValue: Decimal;
  totalCompanies: number;
  averageValuation: Decimal;
  sectorBreakdown: Array<{
    sector: string;
    count: number;
    totalValue: Decimal;
    percentage: number;
  }>;
  topPerformers: Array<{
    companyId: string;
    companyName: string;
    currentValue: Decimal;
    returnMultiple: number;
  }>;
  bottomPerformers: Array<{
    companyId: string;
    companyName: string;
    currentValue: Decimal;
    returnMultiple: number;
  }>;
}

export interface OperationalMetrics {
  totalExpenses: Decimal;
  budgetedExpenses: Decimal;
  expenseVariance: Decimal;
  expenseVariancePercentage: number;
  employeeHeadcount: number;
  departmentBreakdown: Array<{
    departmentId: string;
    departmentName: string;
    headcount: number;
    percentage: number;
  }>;
  taskSummary: {
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    assigned: number;
  };
}

export class DataIntegrationService {
  /**
   * Calculate fund performance metrics including IRR, TVPI, DPI
   */
  static async calculateFundPerformance(fundId: string): Promise<FundPerformanceMetrics> {
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
          investmentImplementations: {
            include: {
              fundDisbursements: true
            }
          }
        }
      });

      if (!fund) {
        throw new Error(`Fund with ID ${fundId} not found`);
      }

      const totalAmount = fund.totalAmount;
      const remainingAmount = fund.remainingAmount;
      const disbursedAmount = totalAmount.minus(remainingAmount);

      // Calculate total investments from portfolio companies
      const totalInvestments = fund.portfolioCompanies.reduce((sum, company) => {
        if (company.investmentImplementation?.fundDisbursements) {
          const companyTotal = company.investmentImplementation.fundDisbursements
            .filter(d => d.status === 'DISBURSED')
            .reduce((companySum, disbursement) => companySum.plus(disbursement.amount), new Decimal(0));
          return sum.plus(companyTotal);
        }
        return sum;
      }, new Decimal(0));

      const portfolioCompanies = fund.portfolioCompanies.length;
      const averageInvestmentSize = portfolioCompanies > 0 
        ? totalInvestments.div(portfolioCompanies) 
        : new Decimal(0);

      // Calculate IRR (simplified calculation - in real scenario, you'd need cash flow dates)
      const irr = this.calculateIRR(totalAmount, totalInvestments, 365); // 1 year assumption

      // Calculate TVPI (Total Value to Paid-In)
      const tvpi = totalAmount.greaterThan(0) ? totalInvestments.div(totalAmount).toNumber() : 0;

      // Calculate DPI (Distributions to Paid-In) - simplified
      const dpi = totalAmount.greaterThan(0) ? disbursedAmount.div(totalAmount).toNumber() : 0;

      return {
        fundId: fund.id,
        fundName: fund.name,
        totalAmount,
        remainingAmount,
        disbursedAmount,
        irr,
        tvpi,
        dpi,
        portfolioCompanies,
        totalInvestments,
        averageInvestmentSize,
        status: fund.status
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate fund performance: ${error.message}`);
    }
  }

  /**
   * Same simplified fund gross IRR as `calculateFundPerformance` but uses a fund already loaded
   * with `portfolioCompanies.investmentImplementation.fundDisbursements` (no extra DB round-trip).
   */
  static fundGrossIrrFromLoadedFund(fund: {
    totalAmount: Decimal | unknown;
    portfolioCompanies?: Array<{
      investmentImplementation?: {
        fundDisbursements?: Array<{ status?: string; amount?: Decimal | unknown }>;
      };
    }>;
  }): number {
    const totalAmount = fund.totalAmount instanceof Decimal ? fund.totalAmount : new Decimal(fund.totalAmount ?? 0);
    let totalInvestments = new Decimal(0);
    for (const company of fund.portfolioCompanies || []) {
      const disb = company.investmentImplementation?.fundDisbursements;
      if (!disb) continue;
      for (const d of disb) {
        if (d.status === "DISBURSED") {
          const amt = d.amount instanceof Decimal ? d.amount : new Decimal(d.amount ?? 0);
          totalInvestments = totalInvestments.plus(amt);
        }
      }
    }
    return this.calculateIRR(totalAmount, totalInvestments, 365);
  }

  /**
   * Calculate Assets Under Management (AUM)
   */
  static async calculateAUM(): Promise<AssetsUnderManagement> {
    try {
      const funds = await prisma.fund.findMany({
        where: { status: { in: ['OPEN', 'CLOSED'] } }
      });

      const totalAUM = funds.reduce((sum, fund) => sum.plus(fund.totalAmount), new Decimal(0));
      const totalDisbursed = funds.reduce((sum, fund) => {
        return sum.plus(fund.totalAmount.minus(fund.remainingAmount));
      }, new Decimal(0));
      const totalRemaining = funds.reduce((sum, fund) => sum.plus(fund.remainingAmount), new Decimal(0));

      const activeFunds = funds.filter(fund => fund.status === 'OPEN').length;
      const totalFunds = funds.length;

      const fundBreakdown = funds.map(fund => {
        const disbursedAmount = fund.totalAmount.minus(fund.remainingAmount);
        const percentage = totalAUM.greaterThan(0) 
          ? fund.totalAmount.div(totalAUM).mul(100).toNumber() 
          : 0;

        return {
          fundId: fund.id,
          fundName: fund.name,
          totalAmount: fund.totalAmount,
          remainingAmount: fund.remainingAmount,
          disbursedAmount,
          percentage
        };
      });

      return {
        totalAUM,
        totalFunds,
        activeFunds,
        totalDisbursed,
        totalRemaining,
        fundBreakdown
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate AUM: ${error.message}`);
    }
  }

  /**
   * Payroll / HR headcount turnover: `Employee.isActive === false` = inactive (terminated / off active roster).
   * Turnover % = inactive / (active + inactive) × 100 (0 if no employees).
   */
  static async calculatePayrollEmployeeTurnoverMetrics(): Promise<{
    activeHeadcount: number;
    inactiveHeadcount: number;
    totalHeadcount: number;
    /** Same as inactiveHeadcount — separations reflected as inactive flags on Employee. */
    terminatedCount: number;
    turnoverRatePct: number;
  }> {
    const [activeHeadcount, inactiveHeadcount] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.employee.count({ where: { isActive: false } })
    ]);
    const totalHeadcount = activeHeadcount + inactiveHeadcount;
    const turnoverRatePct =
      totalHeadcount > 0
        ? Math.round((inactiveHeadcount / totalHeadcount) * 10000) / 100
        : 0;
    return {
      activeHeadcount,
      inactiveHeadcount,
      totalHeadcount,
      terminatedCount: inactiveHeadcount,
      turnoverRatePct
    };
  }

  /**
   * Calculate investment pipeline metrics
   */
  static async calculatePipelineMetrics(): Promise<PipelineMetrics> {
    try {
      const applications = await prisma.application.findMany({
        include: {
          fund: true
        }
      });

      const totalPipelineValue = applications.reduce((sum, app) => sum.plus(app.requestedAmount), new Decimal(0));
      const totalDeals = applications.length;

      // Group by stage
      const stageGroups = applications.reduce((groups, app) => {
        const stage = app.currentStage;
        if (!groups[stage]) {
          groups[stage] = {
            count: 0,
            totalValue: new Decimal(0),
            applications: []
          };
        }
        groups[stage].count++;
        groups[stage].totalValue = groups[stage].totalValue.plus(app.requestedAmount);
        groups[stage].applications.push(app);
        return groups;
      }, {} as Record<string, { count: number; totalValue: Decimal; applications: any[] }>);

      const dealsByStage = Object.entries(stageGroups).map(([stage, data]) => ({
        stage,
        count: data.count,
        totalValue: data.totalValue,
        averageValue: data.count > 0 ? data.totalValue.div(data.count) : new Decimal(0)
      }));

      // Calculate average time to close (simplified)
      const completedApplications = applications.filter(app => 
        ['FUNDED', 'REJECTED'].includes(app.currentStage)
      );
      
      let averageTimeToClose = 0;
      if (completedApplications.length > 0) {
        const totalDays = completedApplications.reduce((sum, app) => {
          if (app.submittedAt && app.updatedAt) {
            const days = Math.floor((app.updatedAt.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
            return sum + days;
          }
          return sum;
        }, 0);
        averageTimeToClose = totalDays / completedApplications.length;
      }

      // Calculate conversion rates (simplified)
      const conversionRates = this.calculateConversionRates(applications);

      return {
        totalPipelineValue,
        totalDeals,
        dealsByStage,
        averageTimeToClose,
        conversionRates
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate pipeline metrics: ${error.message}`);
    }
  }

  /**
   * Calculate advanced deal metrics with manager-specific tracking
   */
  static async calculateAdvancedDealMetrics(): Promise<AdvancedDealMetrics> {
    try {
      // Get all applications with fund manager information
      const applications = await prisma.application.findMany({
        include: {
          fund: {
            include: {
              fundManagers: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      const totalDealsSourced = applications.length;
      const totalDealsClosed = applications.filter(app => 
        ['FUNDED', 'REJECTED'].includes(app.currentStage)
      ).length;

      const totalValue = applications.reduce((sum, app) => sum.plus(app.requestedAmount), new Decimal(0));
      const averageDealSize = totalDealsSourced > 0 ? totalValue.div(totalDealsSourced) : new Decimal(0);

      // Calculate average time to close
      const completedApplications = applications.filter(app => 
        ['FUNDED', 'REJECTED'].includes(app.currentStage)
      );
      
      let averageTimeToClose = 0;
      if (completedApplications.length > 0) {
        const totalDays = completedApplications.reduce((sum, app) => {
          if (app.submittedAt && app.updatedAt) {
            const days = Math.floor((app.updatedAt.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
            return sum + days;
          }
          return sum;
        }, 0);
        averageTimeToClose = totalDays / completedApplications.length;
      }

      // Group deals by manager
      const managerGroups: Record<string, {
        managerId: string;
        managerName: string;
        dealsSourced: number;
        dealsClosed: number;
        totalValue: Decimal;
        timeToCloseSum: number;
        timeToCloseCount: number;
      }> = {};

      applications.forEach(app => {
        if (app.fund?.fundManagers) {
          app.fund.fundManagers.forEach(fundManager => {
            const managerId = fundManager.userId;
            const managerName = `${fundManager.user.firstName} ${fundManager.user.lastName}`;
            
            if (!managerGroups[managerId]) {
              managerGroups[managerId] = {
                managerId,
                managerName,
                dealsSourced: 0,
                dealsClosed: 0,
                totalValue: new Decimal(0),
                timeToCloseSum: 0,
                timeToCloseCount: 0
              };
            }
            
            managerGroups[managerId].dealsSourced++;
            managerGroups[managerId].totalValue = managerGroups[managerId].totalValue.plus(app.requestedAmount);
            
            if (['FUNDED', 'REJECTED'].includes(app.currentStage)) {
              managerGroups[managerId].dealsClosed++;
              
              if (app.submittedAt && app.updatedAt) {
                const days = Math.floor((app.updatedAt.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
                managerGroups[managerId].timeToCloseSum += days;
                managerGroups[managerId].timeToCloseCount++;
              }
            }
          });
        }
      });

      const dealsByManager = Object.values(managerGroups).map(manager => ({
        managerId: manager.managerId,
        managerName: manager.managerName,
        dealsSourced: manager.dealsSourced,
        dealsClosed: manager.dealsClosed,
        averageDealSize: manager.dealsSourced > 0 ? manager.totalValue.div(manager.dealsSourced) : new Decimal(0),
        averageTimeToClose: manager.timeToCloseCount > 0 ? manager.timeToCloseSum / manager.timeToCloseCount : 0,
        conversionRate: manager.dealsSourced > 0 ? (manager.dealsClosed / manager.dealsSourced) * 100 : 0,
        totalValue: manager.totalValue
      }));

      // Group deals by stage with time tracking
      const stageGroups: Record<string, {
        count: number;
        totalValue: Decimal;
        timeInStageSum: number;
        timeInStageCount: number;
      }> = {};

      applications.forEach(app => {
        const stage = app.currentStage;
        if (!stageGroups[stage]) {
          stageGroups[stage] = {
            count: 0,
            totalValue: new Decimal(0),
            timeInStageSum: 0,
            timeInStageCount: 0
          };
        }
        
        stageGroups[stage].count++;
        stageGroups[stage].totalValue = stageGroups[stage].totalValue.plus(app.requestedAmount);
        
        // Calculate time in current stage (simplified - using updatedAt as proxy)
        if (app.submittedAt && app.updatedAt) {
          const days = Math.floor((app.updatedAt.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
          stageGroups[stage].timeInStageSum += days;
          stageGroups[stage].timeInStageCount++;
        }
      });

      const dealsByStage = Object.entries(stageGroups).map(([stage, data]) => ({
        stage,
        count: data.count,
        totalValue: data.totalValue,
        averageValue: data.count > 0 ? data.totalValue.div(data.count) : new Decimal(0),
        averageTimeInStage: data.timeInStageCount > 0 ? data.timeInStageSum / data.timeInStageCount : 0
      }));

      // Calculate time to close trend (monthly for last 12 months)
      const timeToCloseTrend = this.calculateTimeToCloseTrend(completedApplications);

      // Calculate deal flow by manager (monthly for last 12 months)
      const dealFlowByManager = this.calculateDealFlowByManager(applications, managerGroups);

      return {
        totalDealsSourced,
        totalDealsClosed,
        averageDealSize,
        averageTimeToClose,
        dealsByManager,
        dealsByStage,
        timeToCloseTrend,
        dealFlowByManager
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate advanced deal metrics: ${error.message}`);
    }
  }

  /**
   * Calculate time to close trend over time
   */
  private static calculateTimeToCloseTrend(completedApplications: any[]): Array<{
    period: string;
    averageTimeToClose: number;
    dealCount: number;
  }> {
    const trend: Record<string, { timeSum: number; count: number }> = {};
    
    completedApplications.forEach(app => {
      if (app.submittedAt && app.updatedAt) {
        const month = app.submittedAt.toISOString().substring(0, 7); // YYYY-MM format
        const days = Math.floor((app.updatedAt.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
        
        if (!trend[month]) {
          trend[month] = { timeSum: 0, count: 0 };
        }
        
        trend[month].timeSum += days;
        trend[month].count++;
      }
    });

    return Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        averageTimeToClose: data.count > 0 ? data.timeSum / data.count : 0,
        dealCount: data.count
      }));
  }

  /**
   * Calculate deal flow by manager over time
   */
  private static calculateDealFlowByManager(applications: any[], managerGroups: Record<string, any>): Array<{
    managerId: string;
    managerName: string;
    monthlyDeals: Array<{
      month: string;
      dealsSourced: number;
      dealsClosed: number;
      totalValue: Decimal;
    }>;
  }> {
    const dealFlow: Record<string, Record<string, { sourced: number; closed: number; value: Decimal }>> = {};
    
    // Initialize structure
    Object.values(managerGroups).forEach((manager: any) => {
      dealFlow[manager.managerId] = {};
    });

    applications.forEach(app => {
      const month = app.submittedAt ? app.submittedAt.toISOString().substring(0, 7) : new Date().toISOString().substring(0, 7);
      
      if (app.fund?.fundManagers) {
        app.fund.fundManagers.forEach((fundManager: any) => {
          const managerId = fundManager.userId;
          
          if (!dealFlow[managerId][month]) {
            dealFlow[managerId][month] = {
              sourced: 0,
              closed: 0,
              value: new Decimal(0)
            };
          }
          
          dealFlow[managerId][month].sourced++;
          dealFlow[managerId][month].value = dealFlow[managerId][month].value.plus(app.requestedAmount);
          
          if (['FUNDED', 'REJECTED'].includes(app.currentStage)) {
            dealFlow[managerId][month].closed++;
          }
        });
      }
    });

    return Object.entries(dealFlow).map(([managerId, monthlyData]) => {
      const manager = managerGroups[managerId];
      const monthlyDeals = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          dealsSourced: data.sourced,
          dealsClosed: data.closed,
          totalValue: data.value
        }));

      return {
        managerId,
        managerName: manager?.managerName || 'Unknown Manager',
        monthlyDeals
      };
    });
  }

  /**
   * Calculate portfolio valuation and health metrics
   */
  static async calculatePortfolioValuation(): Promise<PortfolioValuation> {
    try {
      const portfolioCompanies = await prisma.portfolioCompany.findMany({
        include: {
          fund: true,
          investmentImplementation: {
            include: {
              fundDisbursements: true
            }
          }
        }
      });

      const totalPortfolioValue = portfolioCompanies.reduce((sum, company) => {
        // Use annual revenue as proxy for valuation (in real scenario, you'd have actual valuations)
        return sum.plus(company.annualRevenue || new Decimal(0));
      }, new Decimal(0));

      const totalCompanies = portfolioCompanies.length;
      const averageValuation = totalCompanies > 0 
        ? totalPortfolioValue.div(totalCompanies) 
        : new Decimal(0);

      // Sector breakdown
      const sectorGroups = portfolioCompanies.reduce((groups, company) => {
        const sector = company.industry;
        if (!groups[sector]) {
          groups[sector] = {
            count: 0,
            totalValue: new Decimal(0)
          };
        }
        groups[sector].count++;
        groups[sector].totalValue = groups[sector].totalValue.plus(company.annualRevenue || new Decimal(0));
        return groups;
      }, {} as Record<string, { count: number; totalValue: Decimal }>);

      const sectorBreakdown = Object.entries(sectorGroups).map(([sector, data]) => ({
        sector,
        count: data.count,
        totalValue: data.totalValue,
        percentage: totalPortfolioValue.greaterThan(0) 
          ? data.totalValue.div(totalPortfolioValue).mul(100).toNumber() 
          : 0
      }));

      // Top and bottom performers (using annual revenue as proxy)
      const performers = portfolioCompanies
        .filter(company => company.annualRevenue && company.annualRevenue.greaterThan(0))
        .map(company => {
          const investedAmount = company.investmentImplementation?.fundDisbursements
            ?.filter(d => d.status === 'DISBURSED')
            ?.reduce((sum, d) => sum.plus(d.amount), new Decimal(0)) || new Decimal(0);
          
          const returnMultiple = investedAmount.greaterThan(0) 
            ? (company.annualRevenue || new Decimal(0)).div(investedAmount).toNumber()
            : 0;

          return {
            companyId: company.id,
            companyName: company.name,
            currentValue: company.annualRevenue || new Decimal(0),
            returnMultiple
          };
        })
        .sort((a, b) => b.returnMultiple - a.returnMultiple);

      const topPerformers = performers.slice(0, 5);
      const bottomPerformers = performers.slice(-5).reverse();

      return {
        totalPortfolioValue,
        totalCompanies,
        averageValuation,
        sectorBreakdown,
        topPerformers,
        bottomPerformers
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate portfolio valuation: ${error.message}`);
    }
  }

  /**
   * Calculate operational metrics
   */
  static async calculateOperationalMetrics(): Promise<OperationalMetrics> {
    try {
      // Get expenses from journal entries (simplified)
      const expenseEntries = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            status: 'POSTED'
          },
          chartOfAccount: {
            accountType: 'EXPENSE'
          }
        },
        include: {
          chartOfAccount: true
        }
      });

      const totalExpenses = expenseEntries.reduce((sum, entry) => {
        return sum.plus(entry.debitAmount || new Decimal(0));
      }, new Decimal(0));

      // Budget comparison (simplified - using a fixed budget for now)
      const budgetedExpenses = new Decimal(1000000); // $1M budget
      const expenseVariance = totalExpenses.minus(budgetedExpenses);
      const expenseVariancePercentage = budgetedExpenses.greaterThan(0) 
        ? expenseVariance.div(budgetedExpenses).mul(100).toNumber() 
        : 0;

      // Employee headcount
      const users = await prisma.user.findMany({
        include: {
          department: true
        }
      });

      const employeeHeadcount = users.length;

      // Department breakdown
      const departmentGroups = users.reduce((groups, user) => {
        const departmentName = user.department?.name || 'Unassigned';
        if (!groups[departmentName]) {
          groups[departmentName] = 0;
        }
        groups[departmentName]++;
        return groups;
      }, {} as Record<string, number>);

      const departmentBreakdown = Object.entries(departmentGroups).map(([name, count]) => ({
        departmentId: '', // Would need to get actual department ID
        departmentName: name,
        headcount: count,
        percentage: employeeHeadcount > 0 ? (count / employeeHeadcount) * 100 : 0
      }));

      // Task summary
      const tasks = await prisma.task.findMany();
      const taskSummary = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        overdue: tasks.filter(t => t.isOverdue).length,
        assigned: tasks.filter(t => {
          try {
            if (t.team) {
              const teamData = typeof t.team === 'string' ? JSON.parse(t.team) : t.team;
              return Array.isArray(teamData) && teamData.length > 0;
            }
            return false;
          } catch (error) {
            return false;
          }
        }).length
      };

      return {
        totalExpenses,
        budgetedExpenses,
        expenseVariance,
        expenseVariancePercentage,
        employeeHeadcount,
        departmentBreakdown,
        taskSummary
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate operational metrics: ${error.message}`);
    }
  }

  /**
   * Calculate IRR (simplified calculation)
   */
  private static calculateIRR(investment: Decimal, returnValue: Decimal, days: number): number {
    if (investment.equals(0)) return 0;
    
    const years = days / 365;
    const rate = Math.pow(returnValue.div(investment).toNumber(), 1 / years) - 1;
    return Math.max(0, rate * 100); // Return as percentage
  }

  /**
   * Calculate conversion rates between stages
   */
  private static calculateConversionRates(applications: any[]): Array<{fromStage: string; toStage: string; rate: number}> {
    const stageTransitions: Record<string, Record<string, number>> = {};
    
    // This is simplified - in reality you'd track stage transitions over time
    const stages = ['SHORTLISTED', 'UNDER_DUE_DILIGENCE', 'DUE_DILIGENCE_COMPLETED', 'UNDER_BOARD_REVIEW', 'BOARD_APPROVED', 'FUNDED'];
    
    const conversionRates: Array<{fromStage: string; toStage: string; rate: number}> = [];
    
    for (let i = 0; i < stages.length - 1; i++) {
      const fromStage = stages[i];
      const toStage = stages[i + 1];
      
      const fromCount = applications.filter(app => app.currentStage === fromStage).length;
      const toCount = applications.filter(app => app.currentStage === toStage).length;
      
      const rate = fromCount > 0 ? (toCount / fromCount) * 100 : 0;
      
      conversionRates.push({ fromStage, toStage, rate });
    }
    
    return conversionRates;
  }
}
