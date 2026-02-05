// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { DataIntegrationService } from "./DataIntegrationService";

export interface PortfolioDashboardParams {
  fundId?: string; // Optional fund filter - if not provided, aggregates all funds
  year?: number; // Optional year filter for historical data
  currencyId?: string; // Optional currency filter
  asOfDate?: Date; // Optional date for snapshot
}

export interface PortfolioDashboardData {
  // High-Level Metrics
  metrics: {
    totalInvested: number;
    availableForDrawdown: number;
    fundGrossIRR: number;
    lpNetIRR: number;
    tvpi: number;
  };
  
  // Performance Overview (Bar Chart Data)
  performanceOverview: {
    paidIn: number;
    totalInvestment: number;
    managementExpenses: number;
    otherExpenses: number;
    realizedProceedsAndIncome: number;
    fmvUnrealizedPortfolio: number;
  };
  
  // J Curve Data
  jCurve: Array<{
    year: number;
    contribution: number;
    distribution: number;
    cumulativeAmount: number;
  }>;
  
  // Deal Allocation (Pie Chart)
  dealAllocation: Array<{
    sector: string;
    investmentCost: number;
    percentage: number;
  }>;
  
  // IRR by Quarter
  irrByQuarter: Array<{
    quarter: string; // "Q1 2025"
    quarterNumber: number;
    year: number;
    investorNetIRR: number;
    fundNetIRR: number;
    fundGrossIRR: number;
  }>;
  
  // Portfolio Summary Table
  portfolioSummary: Array<{
    companyId: string;
    name: string;
    initialInvestment: Date | null;
    mainIndustry: string;
    commitReserves: number;
    currentOwnership: number | null;
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
    totalRevenue: number | null;
    netProfit: number | null;
    cashFlowNet: number | null;
  }>;
  
  // Totals Row
  totals: {
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
  };
  
  // Period Information
  period: {
    asOfDate: Date;
    fundName: string | null;
    year: number | null;
  };
  
  generatedAt: Date;
}

export class PortfolioDashboardService {
  /**
   * Get comprehensive portfolio dashboard data
   */
  static async getDashboardData(params: PortfolioDashboardParams = {}): Promise<PortfolioDashboardData> {
    try {
      const asOfDate = params.asOfDate || new Date();
      const filterYear = params.year;
      
      // Get fund(s) - if fundId provided, get specific fund, otherwise get all funds
      let funds: any[];
      if (params.fundId) {
        const fund = await prisma.fund.findUnique({
          where: { id: params.fundId },
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
            investmentCommitments: true
          }
        });
        // If fund not found, return empty dashboard with zeros
        if (!fund) {
          const asOfDate = params.asOfDate || new Date();
          return {
            metrics: {
              totalInvested: 0,
              availableForDrawdown: 0,
              fundGrossIRR: 0,
              lpNetIRR: 0,
              tvpi: 0
            },
            performanceOverview: {
              paidIn: 0,
              totalInvestment: 0,
              managementExpenses: 0,
              otherExpenses: 0,
              realizedProceedsAndIncome: 0,
              fmvUnrealizedPortfolio: 0
            },
            jCurve: [],
            dealAllocation: [],
            irrByQuarter: [],
            portfolioSummary: [],
            totals: {
              totalInvestmentCost: 0,
              currentInvestmentCost: 0,
              realized: 0,
              fairMarketValue: 0,
              totalValue: 0,
              multiplesOfCost: 0,
              grossIRR: 0
            },
            period: {
              asOfDate,
              fundName: null,
              year: params.year || null
            },
            generatedAt: new Date()
          };
        }
        funds = [fund];
      } else {
        funds = await prisma.fund.findMany({
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
            investmentCommitments: true
          }
        });
        // If no funds found, return empty dashboard with zeros
        if (funds.length === 0) {
          const asOfDate = params.asOfDate || new Date();
          return {
            metrics: {
              totalInvested: 0,
              availableForDrawdown: 0,
              fundGrossIRR: 0,
              lpNetIRR: 0,
              tvpi: 0
            },
            performanceOverview: {
              paidIn: 0,
              totalInvestment: 0,
              managementExpenses: 0,
              otherExpenses: 0,
              realizedProceedsAndIncome: 0,
              fmvUnrealizedPortfolio: 0
            },
            jCurve: [],
            dealAllocation: [],
            irrByQuarter: [],
            portfolioSummary: [],
            totals: {
              totalInvestmentCost: 0,
              currentInvestmentCost: 0,
              realized: 0,
              fairMarketValue: 0,
              totalValue: 0,
              multiplesOfCost: 0,
              grossIRR: 0
            },
            period: {
              asOfDate,
              fundName: null,
              year: params.year || null
            },
            generatedAt: new Date()
          };
        }
      }
      
      // Get portfolio companies from funds
      let allPortfolioCompanies = funds.flatMap(f => f.portfolioCompanies || []);
      
      // If no portfolio companies found through fund relation, try querying directly by fundId
      if (allPortfolioCompanies.length === 0 && params.fundId) {
        console.log(`No portfolio companies found via fund relation, querying directly by fundId...`);
        const directCompanies = await prisma.portfolioCompany.findMany({
          where: {
            fundId: params.fundId
          },
          include: {
            investmentImplementation: {
              include: {
                fundDisbursements: true
              }
            }
          }
        });
        allPortfolioCompanies = directCompanies;
        console.log(`Found ${allPortfolioCompanies.length} portfolio companies via direct query`);
      }
      
      // Debug: Log portfolio companies found
      console.log(`Total portfolio companies: ${allPortfolioCompanies.length}`);
      
      if (filterYear) {
        allPortfolioCompanies = allPortfolioCompanies.filter(company => {
          const startYear = company.startDate ? new Date(company.startDate).getFullYear() : null;
          return startYear === filterYear || !startYear; // Include if matches year or no start date
        });
        console.log(`After year filter (${filterYear}): ${allPortfolioCompanies.length} portfolio companies`);
      }
      
      // For aggregation, we'll use the first fund as the "primary" fund for fund-specific fields
      // but aggregate data across all funds
      const primaryFund = funds[0];
      
      // Calculate high-level metrics (aggregate across all funds if multiple)
      const metrics = await this.calculateMetrics(funds, allPortfolioCompanies);
      
      // Calculate performance overview (aggregate across all funds if multiple)
      const performanceOverview = await this.calculatePerformanceOverview(funds, allPortfolioCompanies);
      
      // Calculate J Curve (aggregate across all funds if multiple)
      const jCurve = await this.calculateJCurve(funds, allPortfolioCompanies, filterYear);
      
      // Calculate deal allocation
      const dealAllocation = await this.calculateDealAllocation(allPortfolioCompanies);
      
      // Calculate IRR by quarter (aggregate across all funds if multiple)
      const irrByQuarter = await this.calculateIRRByQuarter(funds, allPortfolioCompanies, filterYear);
      
      // Calculate portfolio summary
      const portfolioSummary = await this.calculatePortfolioSummary(allPortfolioCompanies);
      
      // Calculate totals
      const totals = this.calculateTotals(portfolioSummary);
      
      // Determine fund name(s) for display
      const fundName = params.fundId 
        ? primaryFund.name 
        : funds.length === 1 
          ? primaryFund.name 
          : `All Funds (${funds.length})`;
      
      return {
        metrics,
        performanceOverview,
        jCurve,
        dealAllocation,
        irrByQuarter,
        portfolioSummary,
        totals,
        period: {
          asOfDate,
          fundName,
          year: filterYear || null
        },
        generatedAt: new Date()
      };
    } catch (error) {
      console.error("Error generating portfolio dashboard:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate portfolio dashboard. Please try again.");
    }
  }
  
  /**
   * Calculate high-level metrics (supports multiple funds aggregation)
   */
  private static async calculateMetrics(
    funds: any[],
    portfolioCompanies: any[]
  ): Promise<{
    totalInvested: number;
    availableForDrawdown: number;
    fundGrossIRR: number;
    lpNetIRR: number;
    tvpi: number;
  }> {
    // Total invested = sum of all disbursed amounts
    const totalInvested = portfolioCompanies.reduce((sum, company) => {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      const companyTotal = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((companySum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return companySum + parseFloat(amount.toString());
        }, 0);
      return sum + companyTotal;
    }, 0);
    
    // Available for drawdown = sum of remainingAmount from all funds
    const availableForDrawdown = funds.reduce((sum, fund) => {
      const remaining = fund.remainingAmount || new Decimal(0);
      return sum + parseFloat(remaining.toString());
    }, 0);
    
    // Calculate TVPI (Total Value to Paid-In)
    // TVPI = (Realized + Unrealized) / Paid-In
    const paidIn = funds.reduce((sum, fund) => {
      const total = fund.totalAmount || new Decimal(0);
      return sum + parseFloat(total.toString());
    }, 0);
    const totalValue = portfolioCompanies.reduce((sum, company) => {
      const fmv = this.getFairMarketValue(company);
      const realized = this.getRealizedValue(company);
      return sum + fmv + realized;
    }, 0);
    const tvpi = paidIn > 0 ? totalValue / paidIn : 0;
    
    // Calculate Fund Gross IRR (weighted average across all funds)
    let totalWeightedIRR = 0;
    let totalWeight = 0;
    for (const fund of funds) {
      try {
        const fundPerformance = await DataIntegrationService.calculateFundPerformance(fund.id);
        const fundPaidIn = parseFloat((fund.totalAmount || new Decimal(0)).toString());
        totalWeightedIRR += fundPerformance.irr * fundPaidIn;
        totalWeight += fundPaidIn;
      } catch (error) {
        console.error(`Error calculating IRR for fund ${fund.id}:`, error);
      }
    }
    const fundGrossIRR = totalWeight > 0 ? totalWeightedIRR / totalWeight : 0;
    
    // LP Net IRR = Fund Gross IRR - management fees (simplified, assume 2% management fee)
    const managementFeeRate = 0.02; // 2% annual management fee
    const lpNetIRR = Math.max(0, fundGrossIRR - (managementFeeRate * 100));
    
    return {
      totalInvested: Math.round(totalInvested * 100) / 100,
      availableForDrawdown: Math.round(availableForDrawdown * 100) / 100,
      fundGrossIRR: Math.round(fundGrossIRR * 100) / 100,
      lpNetIRR: Math.round(lpNetIRR * 100) / 100,
      tvpi: Math.round(tvpi * 10000) / 10000 // Round to 4 decimals for multiples
    };
  }
  
  /**
   * Calculate performance overview (bar chart data) - supports multiple funds
   */
  private static async calculatePerformanceOverview(
    funds: any[],
    portfolioCompanies: any[]
  ): Promise<{
    paidIn: number;
    totalInvestment: number;
    managementExpenses: number;
    otherExpenses: number;
    realizedProceedsAndIncome: number;
    fmvUnrealizedPortfolio: number;
  }> {
    // Aggregate paidIn across all funds
    const paidIn = funds.reduce((sum, fund) => {
      const total = fund.totalAmount || new Decimal(0);
      return sum + parseFloat(total.toString());
    }, 0);
    
    // Total investment = sum of all disbursed amounts
    const totalInvestment = portfolioCompanies.reduce((sum, company) => {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      const companyTotal = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((companySum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return companySum + parseFloat(amount.toString());
        }, 0);
      return sum + companyTotal;
    }, 0);
    
    // Get management expenses and other expenses from accounting
    // These would typically come from journal entries with specific account codes
    const managementExpenses = await this.getManagementExpenses();
    const otherExpenses = await this.getOtherExpenses();
    
    // Realized proceeds and income = sum of realized values + dividend income
    const realizedProceedsAndIncome = portfolioCompanies.reduce((sum, company) => {
      return sum + this.getRealizedValue(company);
    }, 0);
    
    // FMV of unrealized portfolio = sum of fair market values
    const fmvUnrealizedPortfolio = portfolioCompanies.reduce((sum, company) => {
      return sum + this.getFairMarketValue(company);
    }, 0);
    
    return {
      paidIn: Math.round(paidIn * 100) / 100,
      totalInvestment: Math.round(totalInvestment * 100) / 100,
      managementExpenses: Math.round(managementExpenses * 100) / 100,
      otherExpenses: Math.round(otherExpenses * 100) / 100,
      realizedProceedsAndIncome: Math.round(realizedProceedsAndIncome * 100) / 100,
      fmvUnrealizedPortfolio: Math.round(fmvUnrealizedPortfolio * 100) / 100
    };
  }
  
  /**
   * Calculate J Curve data (supports multiple funds and year filter)
   */
  private static async calculateJCurve(
    funds: any[],
    portfolioCompanies: any[],
    filterYear?: number
  ): Promise<Array<{
    year: number;
    contribution: number;
    distribution: number;
    cumulativeAmount: number;
  }>> {
    // Get all investment commitments (contributions) from all funds
    const allCommitments = funds.flatMap(fund => fund.investmentCommitments || []);
    
    // Group commitments by year
    const contributionsByYear = new Map<number, number>();
    for (const commitment of allCommitments) {
      if (!commitment.effectiveDate || !commitment.amount) continue;
      const year = new Date(commitment.effectiveDate).getFullYear();
      if (filterYear && year !== filterYear) continue; // Filter by year if specified
      const current = contributionsByYear.get(year) || 0;
      const amount = commitment.amount || new Decimal(0);
      contributionsByYear.set(year, current + parseFloat(amount.toString()));
    }
    
    // Get distributions (realized proceeds) by year
    const distributionsByYear = new Map<number, number>();
    for (const company of portfolioCompanies) {
      const realized = this.getRealizedValue(company);
      if (realized === 0) continue;
      
      // Use company startDate, endDate, or first disbursement date as proxy for distribution year
      let distributionYear: number;
      if (company.endDate) {
        distributionYear = new Date(company.endDate).getFullYear();
      } else if (company.startDate) {
        distributionYear = new Date(company.startDate).getFullYear();
      } else {
        const firstDisbursement = company.investmentImplementation?.fundDisbursements
          ?.filter((d: any) => d.status === 'DISBURSED')
          ?.sort((a: any, b: any) => new Date(a.disbursementDate).getTime() - new Date(b.disbursementDate).getTime())[0];
        distributionYear = firstDisbursement 
          ? new Date(firstDisbursement.disbursementDate).getFullYear()
          : new Date().getFullYear();
      }
      
      if (filterYear && distributionYear !== filterYear) continue; // Filter by year if specified
      const current = distributionsByYear.get(distributionYear) || 0;
      distributionsByYear.set(distributionYear, current + realized);
    }
    
    // Get all years from earliest fund creation to current
    const fundStartYears = funds.map(f => new Date(f.createdAt).getFullYear());
    const earliestYear = Math.min(...fundStartYears);
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = earliestYear; year <= currentYear; year++) {
      if (filterYear && year !== filterYear) continue; // Filter by year if specified
      years.push(year);
    }
    
    // Build J Curve data
    let cumulativeAmount = 0;
    const jCurve = years.map(year => {
      const contribution = contributionsByYear.get(year) || 0;
      const distribution = distributionsByYear.get(year) || 0;
      cumulativeAmount = cumulativeAmount + contribution - distribution;
      
      return {
        year,
        contribution: Math.round(contribution * 100) / 100,
        distribution: Math.round(distribution * 100) / 100,
        cumulativeAmount: Math.round(cumulativeAmount * 100) / 100
      };
    });
    
    return jCurve;
  }
  
  /**
   * Calculate deal allocation by sector
   */
  private static async calculateDealAllocation(
    portfolioCompanies: any[]
  ): Promise<Array<{
    sector: string;
    investmentCost: number;
    percentage: number;
  }>> {
    const sectorMap = new Map<string, number>();
    let totalInvestmentCost = 0;
    
    for (const company of portfolioCompanies) {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      const companyInvestmentCost = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((sum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return sum + parseFloat(amount.toString());
        }, 0);
      
      const sector = company.industry || 'Other';
      const current = sectorMap.get(sector) || 0;
      sectorMap.set(sector, current + companyInvestmentCost);
      totalInvestmentCost += companyInvestmentCost;
    }
    
    const allocation = Array.from(sectorMap.entries()).map(([sector, investmentCost]) => ({
      sector,
      investmentCost: Math.round(investmentCost * 100) / 100,
      percentage: totalInvestmentCost > 0 
        ? Math.round((investmentCost / totalInvestmentCost) * 1000) / 10 // Round to 1 decimal
        : 0
    }));
    
    // Sort by investment cost descending
    allocation.sort((a, b) => b.investmentCost - a.investmentCost);
    
    return allocation;
  }
  
  /**
   * Calculate IRR by quarter (supports multiple funds and year filter)
   */
  private static async calculateIRRByQuarter(
    funds: any[],
    portfolioCompanies: any[],
    filterYear?: number
  ): Promise<Array<{
    quarter: string;
    quarterNumber: number;
    year: number;
    investorNetIRR: number;
    fundNetIRR: number;
    fundGrossIRR: number;
  }>> {
    // Get earliest fund start date
    const fundStartDates = funds.map(f => new Date(f.createdAt));
    const earliestStartDate = new Date(Math.min(...fundStartDates.map(d => d.getTime())));
    const currentDate = new Date();
    
    // Generate quarters from earliest fund start to current
    const quarters: Array<{ quarter: number; year: number }> = [];
    let currentQuarter = Math.floor(earliestStartDate.getMonth() / 3) + 1;
    let currentYear = earliestStartDate.getFullYear();
    
    while (currentYear < currentDate.getFullYear() || 
           (currentYear === currentDate.getFullYear() && currentQuarter <= Math.floor(currentDate.getMonth() / 3) + 1)) {
      if (!filterYear || currentYear === filterYear) {
        quarters.push({ quarter: currentQuarter, year: currentYear });
      }
      
      currentQuarter++;
      if (currentQuarter > 4) {
        currentQuarter = 1;
        currentYear++;
      }
    }
    
    // Aggregate paidIn across all funds
    const totalPaidIn = funds.reduce((sum, fund) => {
      const total = fund.totalAmount || new Decimal(0);
      return sum + parseFloat(total.toString());
    }, 0);
    
    // Calculate IRR for each quarter (simplified - would need proper cash flow analysis)
    const irrByQuarter = quarters.map(({ quarter, year }) => {
      // For each quarter, calculate cumulative performance
      const quarterEndDate = new Date(year, quarter * 3 - 1, 0); // Last day of quarter
      
      // Get investments made up to this quarter
      const investmentsUpToQuarter = portfolioCompanies.reduce((sum, company) => {
        const disbursements = company.investmentImplementation?.fundDisbursements || [];
        const companyTotal = disbursements
          .filter((d: any) => {
            const disbursementDate = new Date(d.disbursementDate);
            return disbursementDate <= quarterEndDate && d.status === 'DISBURSED';
          })
          .reduce((companySum: number, d: any) => {
            const amount = d.amount || new Decimal(0);
            return companySum + parseFloat(amount.toString());
          }, 0);
        return sum + companyTotal;
      }, 0);
      
      // Get total value up to this quarter
      const totalValueUpToQuarter = portfolioCompanies.reduce((sum, company) => {
        const fmv = this.getFairMarketValue(company);
        const realized = this.getRealizedValue(company);
        return sum + fmv + realized;
      }, 0);
      
      // Simplified IRR calculation
      const fundGrossIRR = totalPaidIn > 0 && investmentsUpToQuarter > 0
        ? ((totalValueUpToQuarter / totalPaidIn) - 1) * 100
        : 0;
      
      // Fund Net IRR = Gross IRR - management fees
      const managementFeeRate = 0.02;
      const fundNetIRR = Math.max(0, fundGrossIRR - (managementFeeRate * 100));
      
      // Investor Net IRR = Fund Net IRR - carried interest (simplified, assume 20% carry)
      const carryRate = 0.20;
      const investorNetIRR = fundNetIRR * (1 - carryRate);
      
      return {
        quarter: `Q${quarter} ${year}`,
        quarterNumber: quarter,
        year,
        investorNetIRR: Math.round(investorNetIRR * 100) / 100,
        fundNetIRR: Math.round(fundNetIRR * 100) / 100,
        fundGrossIRR: Math.round(fundGrossIRR * 100) / 100
      };
    });
    
    return irrByQuarter;
  }
  
  /**
   * Calculate portfolio summary table
   */
  private static async calculatePortfolioSummary(
    portfolioCompanies: any[]
  ): Promise<Array<{
    companyId: string;
    name: string;
    initialInvestment: Date | null;
    mainIndustry: string;
    commitReserves: number;
    currentOwnership: number | null;
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
    totalRevenue: number | null;
    netProfit: number | null;
    cashFlowNet: number | null;
  }>> {
    const summary = portfolioCompanies.map(company => {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      
      // Total investment cost = sum of all disbursed amounts
      const totalInvestmentCost = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((sum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return sum + parseFloat(amount.toString());
        }, 0);
      
      // Current investment cost = total investment cost (assuming no partial exits)
      const currentInvestmentCost = totalInvestmentCost;
      
      // Get initial investment date (first disbursement date or startDate)
      const firstDisbursement = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .sort((a: any, b: any) => {
          const dateA = a.disbursementDate ? new Date(a.disbursementDate).getTime() : 0;
          const dateB = b.disbursementDate ? new Date(b.disbursementDate).getTime() : 0;
          return dateA - dateB;
        })[0];
      const initialInvestment = firstDisbursement?.disbursementDate 
        ? new Date(firstDisbursement.disbursementDate) 
        : (company.startDate ? new Date(company.startDate) : null);
      
      // Commit/Reserves = totalCommittedAmount - totalInvestmentCost
      const committedAmount = company.investmentImplementation?.totalCommittedAmount || new Decimal(0);
      const totalCommitted = parseFloat(committedAmount.toString());
      const commitReserves = Math.max(0, totalCommitted - totalInvestmentCost);
      
      // Current ownership from capTable or default
      const capTable = company.capTable as any;
      const currentOwnership = capTable?.currentOwnership || null;
      
      // Realized value
      const realized = this.getRealizedValue(company);
      
      // Fair market value
      const fairMarketValue = this.getFairMarketValue(company);

      // Total value = realized + fair market value
      const totalValue = realized + fairMarketValue;

      // Multiples of cost = totalValue / totalInvestmentCost
      const multiplesOfCost = totalInvestmentCost > 0 
        ? totalValue / totalInvestmentCost 
        : 0;

      // Gross IRR (simplified calculation)
      const yearsSinceInvestment = initialInvestment 
        ? (new Date().getTime() - new Date(initialInvestment).getTime()) / (1000 * 60 * 60 * 24 * 365)
        : 1;
      const grossIRR = totalInvestmentCost > 0 && yearsSinceInvestment > 0
        ? (Math.pow(totalValue / totalInvestmentCost, 1 / yearsSinceInvestment) - 1) * 100
        : 0;

      // Get KPI values from financialKpis
      const financialKpis = company.financialKpis as any;
      const latestKpiValues = financialKpis?.latestKpiValues || {};
      const totalRevenue = latestKpiValues.TOTAL_REVENUE !== undefined && latestKpiValues.TOTAL_REVENUE !== null
        ? parseFloat(latestKpiValues.TOTAL_REVENUE.toString())
        : null;
      const netProfit = latestKpiValues.NET_PROFIT !== undefined && latestKpiValues.NET_PROFIT !== null
        ? parseFloat(latestKpiValues.NET_PROFIT.toString())
        : null;
      const cashFlowNet = latestKpiValues.CASH_FLOW_NET !== undefined && latestKpiValues.CASH_FLOW_NET !== null
        ? parseFloat(latestKpiValues.CASH_FLOW_NET.toString())
        : null;

      return {
        companyId: company.id,
        name: company.name,
        initialInvestment,
        mainIndustry: company.industry || 'Other',
        commitReserves: Math.round(commitReserves * 100) / 100,
        currentOwnership: currentOwnership ? Math.round(currentOwnership * 100) / 100 : null,
        totalInvestmentCost: Math.round(totalInvestmentCost * 100) / 100,
        currentInvestmentCost: Math.round(currentInvestmentCost * 100) / 100,
        realized: Math.round(realized * 100) / 100,
        fairMarketValue: Math.round(fairMarketValue * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        multiplesOfCost: Math.round(multiplesOfCost * 10000) / 10000, // Round to 4 decimals
        grossIRR: Math.round(grossIRR * 100) / 100,
        totalRevenue: totalRevenue !== null ? Math.round(totalRevenue * 100) / 100 : null,
        netProfit: netProfit !== null ? Math.round(netProfit * 100) / 100 : null,
        cashFlowNet: cashFlowNet !== null ? Math.round(cashFlowNet * 100) / 100 : null
      };
    });
    
    // Sort by total value descending
    summary.sort((a, b) => b.totalValue - a.totalValue);
    
    return summary;
  }
  
  /**
   * Calculate totals row
   */
  private static calculateTotals(
    portfolioSummary: Array<{
      totalInvestmentCost: number;
      currentInvestmentCost: number;
      realized: number;
      fairMarketValue: number;
      totalValue: number;
      multiplesOfCost: number;
      grossIRR: number;
    }>
  ): {
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
  } {
    const totals = portfolioSummary.reduce((acc, company) => {
      acc.totalInvestmentCost += company.totalInvestmentCost;
      acc.currentInvestmentCost += company.currentInvestmentCost;
      acc.realized += company.realized;
      acc.fairMarketValue += company.fairMarketValue;
      acc.totalValue += company.totalValue;
      return acc;
    }, {
      totalInvestmentCost: 0,
      currentInvestmentCost: 0,
      realized: 0,
      fairMarketValue: 0,
      totalValue: 0,
      multiplesOfCost: 0,
      grossIRR: 0
    });
    
    // Calculate weighted averages
    totals.multiplesOfCost = totals.totalInvestmentCost > 0
      ? totals.totalValue / totals.totalInvestmentCost
      : 0;
    
    // Gross IRR as weighted average (simplified)
    const totalCost = totals.totalInvestmentCost;
    const totalValue = totals.totalValue;
    const avgYears = 3; // Simplified - would need actual calculation
    totals.grossIRR = totalCost > 0 && avgYears > 0
      ? (Math.pow(totalValue / totalCost, 1 / avgYears) - 1) * 100
      : 0;
    
    return {
      totalInvestmentCost: Math.round(totals.totalInvestmentCost * 100) / 100,
      currentInvestmentCost: Math.round(totals.currentInvestmentCost * 100) / 100,
      realized: Math.round(totals.realized * 100) / 100,
      fairMarketValue: Math.round(totals.fairMarketValue * 100) / 100,
      totalValue: Math.round(totals.totalValue * 100) / 100,
      multiplesOfCost: Math.round(totals.multiplesOfCost * 10000) / 10000,
      grossIRR: Math.round(totals.grossIRR * 100) / 100
    };
  }
  
  /**
   * Get fair market value from portfolio company financialKpis
   */
  private static getFairMarketValue(company: any): number {
    const financialKpis = company.financialKpis as any;
    if (financialKpis?.latestKpiValues?.PORTFOLIO_FAIR_VALUE) {
      const fairValue = financialKpis.latestKpiValues.PORTFOLIO_FAIR_VALUE || new Decimal(0);
      return parseFloat(fairValue.toString());
    }
    if (financialKpis?.latestValuation?.amount) {
      const valuationAmount = financialKpis.latestValuation.amount || new Decimal(0);
      return parseFloat(valuationAmount.toString());
    }
    // Fallback to annual revenue as proxy
    return parseFloat(company.annualRevenue?.toString() || '0');
  }
  
  /**
   * Get realized value from portfolio company (dividends, exits, etc.)
   */
  private static getRealizedValue(company: any): number {
    const financialKpis = company.financialKpis as any;
    // Check for realized proceeds in financialKpis
    if (financialKpis?.realizedProceeds) {
      const realized = financialKpis.realizedProceeds || new Decimal(0);
      return parseFloat(realized.toString());
    }
    // Check for dividend income
    if (financialKpis?.latestKpiValues?.DIVIDEND_INCOME) {
      const dividend = financialKpis.latestKpiValues.DIVIDEND_INCOME || new Decimal(0);
      return parseFloat(dividend.toString());
    }
    // If company has endDate, it might be exited - use FMV as realized
    if (company.endDate) {
      return this.getFairMarketValue(company);
    }
    return 0;
  }
  
  /**
   * Get management expenses from accounting
   */
  private static async getManagementExpenses(): Promise<number> {
    try {
      // First, find chart of accounts that match "Management"
      // MySQL is case-insensitive by default with standard collations
      const managementAccounts = await prisma.chartOfAccounts.findMany({
        where: {
          accountType: 'EXPENSE',
          accountName: {
            contains: 'Management'
          }
        },
        select: {
          id: true
        }
      });

      if (managementAccounts.length === 0) {
        return 0;
      }

      const accountIds = managementAccounts.map(acc => acc.id);

      // Get expenses from journal entries with management fee account codes
      const expenseEntries = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            status: 'POSTED'
          },
          chartOfAccountId: {
            in: accountIds
          }
        },
        select: {
          debitAmount: true
        }
      });
      
      return expenseEntries.reduce((sum, entry) => {
        return sum + parseFloat(entry.debitAmount?.toString() || '0');
      }, 0);
    } catch (error) {
      console.error("Error getting management expenses:", error);
      return 0;
    }
  }
  
  /**
   * Get other expenses from accounting
   */
  private static async getOtherExpenses(): Promise<number> {
    try {
      // First, find management accounts to exclude them
      // MySQL is case-insensitive by default with standard collations
      const managementAccounts = await prisma.chartOfAccounts.findMany({
        where: {
          accountType: 'EXPENSE',
          accountName: {
            contains: 'Management'
          }
        },
        select: {
          id: true
        }
      });

      const managementAccountIds = managementAccounts.map(acc => acc.id);

      // Get all expenses except management expenses
      const expenseEntries = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            status: 'POSTED'
          },
          chartOfAccount: {
            accountType: 'EXPENSE',
            ...(managementAccountIds.length > 0 && {
              id: {
                notIn: managementAccountIds
              }
            })
          }
        },
        select: {
          debitAmount: true
        }
      });
      
      return expenseEntries.reduce((sum, entry) => {
        return sum + parseFloat(entry.debitAmount?.toString() || '0');
      }, 0);
    } catch (error) {
      console.error("Error getting other expenses:", error);
      return 0;
    }
  }
}
