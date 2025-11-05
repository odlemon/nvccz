//@ts-nocheck
import { PrismaClient, Fund } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';

export interface CreateFundRequest {
  name: string;
  description: string;
  totalAmount: number;
  minInvestment: number;
  maxInvestment: number;
  focusIndustries: string[];
  applicationStart: Date;
  applicationEnd: Date;
  status?: string; // OPEN, CLOSED, COMING_SOON
  createdById: string; // Required - ID of the user creating the fund
}

export interface UpdateFundRequest {
  name?: string;
  description?: string;
  totalAmount?: number;
  minInvestment?: number;
  maxInvestment?: number;
  focusIndustries?: string[];
  applicationStart?: Date;
  applicationEnd?: Date;
  status?: string;
}

export interface FundWithRelations extends Fund {
  investmentImplementations: {
    id: string;
    portfolioCompany: {
      id: string;
      name: string;
      industry: string;
    };
    application: {
      id: string;
      businessName: string;
      applicantName: string;
    };
  }[];
  fundDisbursements: {
    id: string;
    amount: any;
    status: string;
    disbursementType: string;
    disbursementDate: Date;
  }[];
}

export class FundService {
  /**
   * Create a new fund
   */
  static async createFund(params: CreateFundRequest): Promise<Fund> {
    try {
      const fund = await prisma.fund.create({
        data: {
          name: params.name,
          description: params.description,
          totalAmount: new Decimal(params.totalAmount),
          remainingAmount: new Decimal(params.totalAmount), // Initially equals total amount
          minInvestment: new Decimal(params.minInvestment),
          maxInvestment: new Decimal(params.maxInvestment),
          focusIndustries: params.focusIndustries,
          applicationStart: params.applicationStart,
          applicationEnd: params.applicationEnd,
          status: params.status || "OPEN",
          createdById: params.createdById
        }
      });

      return fund;
    } catch (error: any) {
      throw new Error(`Failed to create fund: ${error.message}`);
    }
  }

  /**
   * Update fund details
   */
  static async updateFund(fundId: string, params: UpdateFundRequest): Promise<Fund> {
    try {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId }
      });

      if (!fund) {
        throw new Error("Fund not found");
      }

      const updateData: any = {};
      
      if (params.name) updateData.name = params.name;
      if (params.description) updateData.description = params.description;
      if (params.minInvestment) updateData.minInvestment = new Decimal(params.minInvestment);
      if (params.maxInvestment) updateData.maxInvestment = new Decimal(params.maxInvestment);
      if (params.focusIndustries) updateData.focusIndustries = params.focusIndustries;
      if (params.applicationStart) updateData.applicationStart = params.applicationStart;
      if (params.applicationEnd) updateData.applicationEnd = params.applicationEnd;
      if (params.status) updateData.status = params.status;

      // If total amount is being updated, also update remaining amount proportionally
      if (params.totalAmount) {
        const newTotalAmount = new Decimal(params.totalAmount);
        const oldTotalAmount = fund.totalAmount;
        const oldRemainingAmount = fund.remainingAmount;
        
        // Calculate new remaining amount proportionally
        const ratio = oldRemainingAmount.div(oldTotalAmount);
        const newRemainingAmount = newTotalAmount.mul(ratio);
        
        updateData.totalAmount = newTotalAmount;
        updateData.remainingAmount = newRemainingAmount;
      }

      const updatedFund = await prisma.fund.update({
        where: { id: fundId },
        data: updateData
      });

      return updatedFund;
    } catch (error: any) {
      throw new Error(`Failed to update fund: ${error.message}`);
    }
  }

  /**
   * Close a fund (change status to CLOSED)
   */
  static async closeFund(fundId: string): Promise<Fund> {
    try {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId }
      });

      if (!fund) {
        throw new Error("Fund not found");
      }

      if (fund.status === "CLOSED") {
        throw new Error("Fund is already closed");
      }

      const updatedFund = await prisma.fund.update({
        where: { id: fundId },
        data: {
          status: "CLOSED",
          updatedAt: new Date()
        }
      });

      return updatedFund;
    } catch (error: any) {
      throw new Error(`Failed to close fund: ${error.message}`);
    }
  }

  /**
   * Get fund by ID with relations
   */
  static async getFundById(fundId: string): Promise<FundWithRelations | null> {
    try {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId },
        include: {
          investmentImplementations: {
            include: {
              portfolioCompany: {
                select: {
                  id: true,
                  name: true,
                  industry: true
                }
              },
              application: {
                select: {
                  id: true,
                  businessName: true,
                  applicantName: true
                }
              }
            }
          },
          fundDisbursements: {
            select: {
              id: true,
              amount: true,
              status: true,
              disbursementType: true,
              disbursementDate: true
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return fund;
    } catch (error: any) {
      throw new Error(`Failed to get fund: ${error.message}`);
    }
  }

  /**
   * Get all funds with filtering
   */
  static async getAllFunds(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      industry?: string;
      minAvailableBalance?: number;
      maxAvailableBalance?: number;
    }
  ): Promise<{ funds: FundWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      
      if (filters?.status) where.status = filters.status;
      if (filters?.industry) where.focusIndustries = { has: filters.industry };
      if (filters?.minAvailableBalance) {
        where.remainingAmount = {
          ...where.remainingAmount,
          gte: new Decimal(filters.minAvailableBalance)
        };
      }
      if (filters?.maxAvailableBalance) {
        where.remainingAmount = {
          ...where.remainingAmount,
          lte: new Decimal(filters.maxAvailableBalance)
        };
      }

      const [funds, total] = await Promise.all([
        prisma.fund.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            fundDisbursements: {
              select: {
                id: true,
                amount: true,
                disbursementDate: true,
                disbursementType: true,
                status: true,
                notes: true,
                transactionReference: true,
                approvedAt: true,
                disbursedAt: true,
                investmentImplementation: {
                  select: {
                    id: true,
                    portfolioCompany: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                }
              },
              orderBy: { disbursementDate: 'desc' }
            }
          }
        }),
        prisma.fund.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        funds: funds as FundWithRelations[],
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get funds: ${error.message}`);
    }
  }

  /**
   * Get funds by industry focus
   */
  static async getFundsByIndustry(industry: string): Promise<Fund[]> {
    try {
      const funds = await prisma.fund.findMany({
        where: {
          focusIndustries: { has: industry },
          status: "OPEN"
        },
        orderBy: { createdAt: 'desc' }
      });

      return funds;
    } catch (error: any) {
      throw new Error(`Failed to get funds by industry: ${error.message}`);
    }
  }

  /**
   * Get funds by status
   */
  static async getFundsByStatus(status: string): Promise<Fund[]> {
    try {
      const funds = await prisma.fund.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' }
      });

      return funds;
    } catch (error: any) {
      throw new Error(`Failed to get funds by status: ${error.message}`);
    }
  }

  /**
   * Get funds by available balance range
   */
  static async getFundsByAvailableBalance(minBalance: number, maxBalance: number): Promise<Fund[]> {
    try {
      const funds = await prisma.fund.findMany({
        where: {
          remainingAmount: {
            gte: new Decimal(minBalance),
            lte: new Decimal(maxBalance)
          }
        },
        orderBy: { remainingAmount: 'desc' }
      });

      return funds;
    } catch (error: any) {
      throw new Error(`Failed to get funds by available balance: ${error.message}`);
    }
  }

  /**
   * Get fund statistics
   */
  static async getFundStatistics(): Promise<{
    totalFunds: number;
    openFunds: number;
    closedFunds: number;
    comingSoonFunds: number;
    totalAmount: any;
    totalRemainingAmount: any;
    totalDisbursedAmount: any;
  }> {
    try {
      const [
        totalFunds,
        openFunds,
        closedFunds,
        comingSoonFunds,
        totalAmountResult,
        totalRemainingAmountResult
      ] = await Promise.all([
        prisma.fund.count(),
        prisma.fund.count({ where: { status: "OPEN" } }),
        prisma.fund.count({ where: { status: "CLOSED" } }),
        prisma.fund.count({ where: { status: "COMING_SOON" } }),
        prisma.fund.aggregate({
          _sum: { totalAmount: true }
        }),
        prisma.fund.aggregate({
          _sum: { remainingAmount: true }
        })
      ]);

      const totalAmount = totalAmountResult._sum.totalAmount || new Decimal(0);
      const totalRemainingAmount = totalRemainingAmountResult._sum.remainingAmount || new Decimal(0);
      const totalDisbursedAmount = totalAmount.minus(totalRemainingAmount);

      return {
        totalFunds,
        openFunds,
        closedFunds,
        comingSoonFunds,
        totalAmount,
        totalRemainingAmount,
        totalDisbursedAmount
      };
    } catch (error: any) {
      throw new Error(`Failed to get fund statistics: ${error.message}`);
    }
  }
}
