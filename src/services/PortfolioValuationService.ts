// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export interface CreatePortfolioValuationRequest {
  title: string;
  description?: string;
  valuationPeriod: string; // "Q1 2025", "Q2 2025", etc.
  quarter: number;
  year: number;
  targetCompletionDate: Date;
  assignedToId: string;
}

export interface UpdatePortfolioValuationRequest {
  title?: string;
  description?: string;
  totalPortfolioValue?: number;
  previousValue?: number;
  valueChange?: number;
  valueChangePercentage?: number;
  status?: string;
  currentStep?: string;
  progressPercentage?: number;
  capTablesObtained?: boolean;
  financialsReconciled?: boolean;
  portfolioCFOsContacted?: boolean;
  internalReviewDone?: boolean;
  stakeholderReportReady?: boolean;
}

export interface CreatePortfolioValuationActivityRequest {
  portfolioValuationId: string;
  activityType: string; // "cap_table_obtained", "financial_reconciled", "cfo_contacted", "review_completed"
  title: string;
  description?: string;
  companiesProcessed?: number;
  reconciliationStatus?: any;
  issuesIdentified?: any;
}

export class PortfolioValuationService {
  // Create a new portfolio valuation
  static async createPortfolioValuation(request: CreatePortfolioValuationRequest, createdById: string) {
    try {
      // Validate assigned user
      const assignedUser = await prisma.user.findUnique({
        where: { id: request.assignedToId }
      });

      if (!assignedUser) {
        throw new Error("Assigned user not found");
      }

      // Create the portfolio valuation
      const valuation = await prisma.portfolioValuation.create({
        data: {
          title: request.title,
          description: request.description,
          valuationPeriod: request.valuationPeriod,
          quarter: request.quarter,
          year: request.year,
          targetCompletionDate: request.targetCompletionDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          status: "planned",
          currentStep: "cap_tables",
          progressPercentage: 0
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          valuationActivities: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      return valuation;
    } catch (error) {
      throw error;
    }
  }

  // Get all portfolio valuations with filtering
  static async getAllPortfolioValuations(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.quarter) {
        where.quarter = parseInt(filters.quarter);
      }

      if (filters.year) {
        where.year = parseInt(filters.year);
      }

      if (filters.assignedToId) {
        where.assignedToId = filters.assignedToId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.currentStep) {
        where.currentStep = filters.currentStep;
      }

      const valuations = await prisma.portfolioValuation.findMany({
        where,
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          valuationActivities: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return valuations;
    } catch (error) {
      throw error;
    }
  }

  // Get portfolio valuation by ID
  static async getPortfolioValuationById(id: string) {
    try {
      const valuation = await prisma.portfolioValuation.findUnique({
        where: { id },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          valuationActivities: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!valuation) {
        throw new Error("Portfolio valuation not found");
      }

      return valuation;
    } catch (error) {
      throw error;
    }
  }

  // Update portfolio valuation
  static async updatePortfolioValuation(id: string, request: UpdatePortfolioValuationRequest) {
    try {
      const valuation = await prisma.portfolioValuation.findUnique({
        where: { id }
      });

      if (!valuation) {
        throw new Error("Portfolio valuation not found");
      }

      // Calculate value change if values are provided
      let valueChange = request.valueChange;
      let valueChangePercentage = request.valueChangePercentage;

      if (request.totalPortfolioValue !== undefined && request.previousValue !== undefined) {
        valueChange = request.totalPortfolioValue - request.previousValue;
        valueChangePercentage = request.previousValue > 0 ? 
          (valueChange / request.previousValue) * 100 : 0;
      }

      const updatedValuation = await prisma.portfolioValuation.update({
        where: { id },
        data: {
          title: request.title,
          description: request.description,
          totalPortfolioValue: request.totalPortfolioValue,
          previousValue: request.previousValue,
          valueChange: valueChange,
          valueChangePercentage: valueChangePercentage,
          status: request.status,
          currentStep: request.currentStep,
          progressPercentage: request.progressPercentage,
          capTablesObtained: request.capTablesObtained,
          financialsReconciled: request.financialsReconciled,
          portfolioCFOsContacted: request.portfolioCFOsContacted,
          internalReviewDone: request.internalReviewDone,
          stakeholderReportReady: request.stakeholderReportReady,
          completedAt: request.status === "completed" ? new Date() : valuation.completedAt
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          valuationActivities: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      return updatedValuation;
    } catch (error) {
      throw error;
    }
  }

  // Delete portfolio valuation
  static async deletePortfolioValuation(id: string) {
    try {
      const valuation = await prisma.portfolioValuation.findUnique({
        where: { id }
      });

      if (!valuation) {
        throw new Error("Portfolio valuation not found");
      }

      await prisma.portfolioValuation.delete({
        where: { id }
      });

      return { message: "Portfolio valuation deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create portfolio valuation activity
  static async createPortfolioValuationActivity(request: CreatePortfolioValuationActivityRequest, userId: string) {
    try {
      // Validate portfolio valuation
      const valuation = await prisma.portfolioValuation.findUnique({
        where: { id: request.portfolioValuationId }
      });

      if (!valuation) {
        throw new Error("Portfolio valuation not found");
      }

      // Create the activity
      const activity = await prisma.portfolioValuationActivity.create({
        data: {
          portfolioValuationId: request.portfolioValuationId,
          userId: userId,
          activityType: request.activityType,
          title: request.title,
          description: request.description,
          companiesProcessed: request.companiesProcessed,
          reconciliationStatus: request.reconciliationStatus,
          issuesIdentified: request.issuesIdentified
        },
        include: {
          portfolioValuation: {
            select: {
              id: true,
              title: true,
              valuationPeriod: true
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Update valuation progress based on activity type
      let updateData: any = {};
      
      if (request.activityType === "cap_table_obtained") {
        updateData.capTablesObtained = true;
        updateData.currentStep = "financials";
      } else if (request.activityType === "financial_reconciled") {
        updateData.financialsReconciled = true;
        updateData.currentStep = "communication";
      } else if (request.activityType === "cfo_contacted") {
        updateData.portfolioCFOsContacted = true;
        updateData.currentStep = "review";
      } else if (request.activityType === "review_completed") {
        updateData.internalReviewDone = true;
        updateData.stakeholderReportReady = true;
        updateData.currentStep = "completed";
      }

      // Update progress percentage based on completed steps
      const completedSteps = [
        updateData.capTablesObtained || valuation.capTablesObtained,
        updateData.financialsReconciled || valuation.financialsReconciled,
        updateData.portfolioCFOsContacted || valuation.portfolioCFOsContacted,
        updateData.internalReviewDone || valuation.internalReviewDone,
        updateData.stakeholderReportReady || valuation.stakeholderReportReady
      ].filter(Boolean).length;

      updateData.progressPercentage = (completedSteps / 5) * 100;

      if (Object.keys(updateData).length > 0) {
        await prisma.portfolioValuation.update({
          where: { id: request.portfolioValuationId },
          data: updateData
        });
      }

      return activity;
    } catch (error) {
      throw error;
    }
  }

  // Get portfolio valuation activities
  static async getPortfolioValuationActivities(portfolioValuationId: string) {
    try {
      const activities = await prisma.portfolioValuationActivity.findMany({
        where: { portfolioValuationId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return activities;
    } catch (error) {
      throw error;
    }
  }

  // Get quarterly valuation summary
  static async getQuarterlyValuationSummary(quarter: number, year: number) {
    try {
      const valuations = await prisma.portfolioValuation.findMany({
        where: {
          quarter: quarter,
          year: year
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          valuationActivities: {
            select: {
              id: true,
              activityType: true,
              companiesProcessed: true,
              createdAt: true
            }
          }
        }
      });

      // Calculate summary statistics
      const totalValuations = valuations.length;
      const completedValuations = valuations.filter(v => v.status === "completed").length;
      const totalCompaniesProcessed = valuations.reduce((sum, v) => 
        sum + v.valuationActivities.reduce((activitySum, a) => 
          activitySum + (a.companiesProcessed || 0), 0), 0);
      const totalActivities = valuations.reduce((sum, v) => sum + v.valuationActivities.length, 0);

      const statusBreakdown = valuations.reduce((acc, v) => {
        acc[v.status] = (acc[v.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const stepBreakdown = valuations.reduce((acc, v) => {
        acc[v.currentStep] = (acc[v.currentStep] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate average portfolio value
      const valuationsWithValue = valuations.filter(v => v.totalPortfolioValue !== null);
      const averagePortfolioValue = valuationsWithValue.length > 0 ?
        valuationsWithValue.reduce((sum, v) => sum + Number(v.totalPortfolioValue), 0) / valuationsWithValue.length : 0;

      return {
        quarter,
        year,
        totalValuations,
        completedValuations,
        completionRate: totalValuations > 0 ? (completedValuations / totalValuations) * 100 : 0,
        totalCompaniesProcessed,
        totalActivities,
        averagePortfolioValue,
        statusBreakdown,
        stepBreakdown,
        valuations
      };
    } catch (error) {
      throw error;
    }
  }

  // Get valuation analytics
  static async getValuationAnalytics(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.year) {
        where.year = parseInt(filters.year);
      }

      if (filters.timeRange) {
        const days = parseInt(filters.timeRange);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        where.createdAt = {
          gte: startDate
        };
      }

      const valuations = await prisma.portfolioValuation.findMany({
        where,
        select: {
          id: true,
          valuationPeriod: true,
          quarter: true,
          year: true,
          totalPortfolioValue: true,
          previousValue: true,
          valueChange: true,
          valueChangePercentage: true,
          status: true,
          currentStep: true,
          progressPercentage: true,
          createdAt: true,
          completedAt: true
        }
      });

      // Calculate analytics
      const totalValuations = valuations.length;
      const completedValuations = valuations.filter(v => v.status === "completed").length;
      const averageProgress = valuations.length > 0 ?
        valuations.reduce((sum, v) => sum + Number(v.progressPercentage), 0) / valuations.length : 0;

      const statusBreakdown = valuations.reduce((acc, v) => {
        acc[v.status] = (acc[v.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const stepBreakdown = valuations.reduce((acc, v) => {
        acc[v.currentStep] = (acc[v.currentStep] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Value change analysis
      const valuationsWithChange = valuations.filter(v => v.valueChange !== null);
      const averageValueChange = valuationsWithChange.length > 0 ?
        valuationsWithChange.reduce((sum, v) => sum + Number(v.valueChange), 0) / valuationsWithChange.length : 0;

      const averageValueChangePercentage = valuationsWithChange.length > 0 ?
        valuationsWithChange.reduce((sum, v) => sum + Number(v.valueChangePercentage), 0) / valuationsWithChange.length : 0;

      return {
        totalValuations,
        completedValuations,
        completionRate: totalValuations > 0 ? (completedValuations / totalValuations) * 100 : 0,
        averageProgress,
        averageValueChange,
        averageValueChangePercentage,
        statusBreakdown,
        stepBreakdown
      };
    } catch (error) {
      throw error;
    }
  }
}
