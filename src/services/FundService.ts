//@ts-nocheck
import { PrismaClient, Fund } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { AumRealtimeSyncService } from './AumRealtimeSyncService';

/**
 * XIRR via Newton-Raphson with a bisection fallback. `flows` is [{date, amount}] — amount is
 * negative for money paid in (capital calls), positive for money received/held (NAV, distributions).
 * Returns null when there are fewer than two flows or the amounts never change sign (no real return
 * to compute), rather than guessing.
 */
function calculateXirr(flows: Array<{ date: Date; amount: number }>): number | null {
  const valid = flows.filter((f) => f.amount !== 0);
  if (valid.length < 2) return null;
  const hasNegative = valid.some((f) => f.amount < 0);
  const hasPositive = valid.some((f) => f.amount > 0);
  if (!hasNegative || !hasPositive) return null;
  const t0 = valid[0].date.getTime();
  const years = valid.map((f) => (f.date.getTime() - t0) / (365.25 * 86400000));
  const npv = (rate: number) => valid.reduce((sum, f, i) => sum + f.amount / Math.pow(1 + rate, years[i]), 0);
  const dnpv = (rate: number) =>
    valid.reduce((sum, f, i) => sum - (years[i] * f.amount) / Math.pow(1 + rate, years[i] + 1), 0);
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.999) break;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
  }
  // Bisection fallback over a wide, sane range if Newton didn't converge.
  let lo = -0.99, hi = 10;
  let fLo = npv(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if ((fLo < 0) === (fMid < 0)) { lo = mid; fLo = fMid; } else { hi = mid; }
  }
  return null;
}

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
  managementFeeRate?: number; // decimal fraction, e.g. 0.02 for 2%
  carryRate?: number; // decimal fraction, e.g. 0.20 for 20%
  hurdleRate?: number; // decimal fraction, e.g. 0.08 for 8%
  vintageYear?: number;
  currencyCode?: string;
  geography?: string;
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
  managementFeeRate?: number;
  carryRate?: number;
  hurdleRate?: number;
  vintageYear?: number;
  currencyCode?: string;
  geography?: string;
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
          fundPurpose: "PRIVATE_EQUITY",
          createdById: params.createdById,
          managementFeeRate: params.managementFeeRate != null ? new Decimal(params.managementFeeRate) : undefined,
          carryRate: params.carryRate != null ? new Decimal(params.carryRate) : undefined,
          hurdleRate: params.hurdleRate != null ? new Decimal(params.hurdleRate) : undefined,
          vintageYear: params.vintageYear ?? undefined,
          currencyCode: params.currencyCode ?? undefined,
          geography: params.geography ?? undefined,
        }
      });

      await AumRealtimeSyncService.recomputeAndPersist({ source: "funds" });
      await FundService.recordPerformanceSnapshot(fund.id, params.createdById);

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
      if (params.managementFeeRate != null) updateData.managementFeeRate = new Decimal(params.managementFeeRate);
      if (params.carryRate != null) updateData.carryRate = new Decimal(params.carryRate);
      if (params.hurdleRate != null) updateData.hurdleRate = new Decimal(params.hurdleRate);
      if (params.vintageYear != null) updateData.vintageYear = params.vintageYear;
      if (params.currencyCode) updateData.currencyCode = params.currencyCode;
      if (params.geography) updateData.geography = params.geography;

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

      await AumRealtimeSyncService.recomputeAndPersist({ source: "funds" });
      await FundService.recordPerformanceSnapshot(fundId);

      return updatedFund;
    } catch (error: any) {
      throw new Error(`Failed to update fund: ${error.message}`);
    }
  }

  /**
   * List a fund's recorded performance snapshots, oldest first.
   */
  static async listPerformanceSnapshots(fundId: string) {
    return prisma.fundPerformanceSnapshot.findMany({
      where: { fundId },
      orderBy: { asOfDate: "asc" },
    });
  }

  /**
   * List a fund's documents, most recent first.
   */
  static async listFundDocuments(fundId: string) {
    return prisma.fundDocument.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  /**
   * Record a fund document after it has been uploaded to storage.
   */
  static async createFundDocument(params: {
    fundId: string;
    name: string;
    category: string;
    fileUrl: string;
    storagePath?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    uploadedById?: string;
  }) {
    return prisma.fundDocument.create({
      data: {
        fundId: params.fundId,
        name: params.name,
        category: params.category,
        fileUrl: params.fileUrl,
        storagePath: params.storagePath,
        mimeType: params.mimeType,
        fileSizeBytes: params.fileSizeBytes,
        uploadedById: params.uploadedById,
      },
    });
  }

  /**
   * Record (or update) today's performance snapshot for a fund from its current real state.
   * Called after fund-affecting actions (create/update, capital call activity) so the Portfolio
   * Funds detail page's NAV/IRR trend charts accumulate real history going forward — there is no
   * historical data to backfill, so the series starts from whenever this first runs.
   */
  static async recordPerformanceSnapshot(fundId: string, createdById?: string): Promise<void> {
    const fund = await prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund) return;
    const calledCapital = fund.totalAmount.sub(fund.remainingAmount);
    const asOfDate = new Date();
    asOfDate.setUTCHours(0, 0, 0, 0);

    // Real Gross IRR from LP perspective: capital actually collected (negative — paid in by LPs,
    // dated at each call's real transactionDate) versus current NAV (positive, dated today).
    // No fabricated cash flows and no distributions assumed — there is no real distribution
    // record type yet, so this honestly reflects "called capital vs current value" only.
    const calls = await prisma.capitalCall.findMany({
      where: { fundId },
      include: { allocations: { select: { amountPaid: true } } },
    });
    const flows: Array<{ date: Date; amount: number }> = [];
    for (const call of calls) {
      const collected = call.allocations.reduce((sum, a) => sum + Number(a.amountPaid), 0);
      if (collected > 0) flows.push({ date: call.transactionDate, amount: -collected });
    }
    flows.push({ date: asOfDate, amount: Number(fund.remainingAmount) });
    flows.sort((a, b) => a.date.getTime() - b.date.getTime());
    const grossIrr = calculateXirr(flows);

    await prisma.fundPerformanceSnapshot.upsert({
      where: { fundId_asOfDate: { fundId, asOfDate } },
      create: {
        fundId,
        asOfDate,
        totalCommitment: fund.totalAmount,
        calledCapital,
        distributedCapital: new Decimal(0),
        nav: fund.remainingAmount,
        grossIrr: grossIrr != null ? new Decimal(grossIrr) : undefined,
        createdById,
      },
      update: {
        totalCommitment: fund.totalAmount,
        calledCapital,
        nav: fund.remainingAmount,
        grossIrr: grossIrr != null ? new Decimal(grossIrr) : undefined,
      },
    });
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

      await AumRealtimeSyncService.recomputeAndPersist({ source: "funds" });

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
