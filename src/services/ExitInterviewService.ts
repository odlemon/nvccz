// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateExitInterviewRequest {
  employeeName: string;
  employeeId?: string;
  department: string;
  position: string;
  tenure: string; // "0-1 years", "1-3 years", "3-5 years", "5+ years"
  interviewDate: Date;
  interviewType: string; // "voluntary", "involuntary", "retirement"
  primaryReason: string;
  secondaryReasons?: any;
  pushFactors?: any;
  pullFactors?: any;
  workEnvironmentRating?: number;
  managementRating?: number;
  compensationRating?: number;
  growthOpportunityRating?: number;
  wouldRecommendCompany?: boolean;
  suggestionsForImprovement?: string;
}

export interface UpdateExitInterviewRequest {
  employeeName?: string;
  employeeId?: string;
  department?: string;
  position?: string;
  tenure?: string;
  interviewDate?: Date;
  interviewType?: string;
  primaryReason?: string;
  secondaryReasons?: any;
  pushFactors?: any;
  pullFactors?: any;
  workEnvironmentRating?: number;
  managementRating?: number;
  compensationRating?: number;
  growthOpportunityRating?: number;
  wouldRecommendCompany?: boolean;
  suggestionsForImprovement?: string;
  status?: string;
}

export class ExitInterviewService {
  // Create a new exit interview
  static async createExitInterview(request: CreateExitInterviewRequest, conductedById: string) {
    try {
      // Create the exit interview
      const exitInterview = await prisma.exitInterview.create({
        data: {
          employeeName: request.employeeName,
          employeeId: request.employeeId,
          department: request.department,
          position: request.position,
          tenure: request.tenure,
          interviewDate: request.interviewDate,
          conductedById: conductedById,
          interviewType: request.interviewType,
          primaryReason: request.primaryReason,
          secondaryReasons: request.secondaryReasons,
          pushFactors: request.pushFactors,
          pullFactors: request.pullFactors,
          workEnvironmentRating: request.workEnvironmentRating,
          managementRating: request.managementRating,
          compensationRating: request.compensationRating,
          growthOpportunityRating: request.growthOpportunityRating,
          wouldRecommendCompany: request.wouldRecommendCompany,
          suggestionsForImprovement: request.suggestionsForImprovement,
          status: "completed"
        },
        include: {
          conductedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return exitInterview;
    } catch (error) {
      throw error;
    }
  }

  // Get all exit interviews with filtering
  static async getAllExitInterviews(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.department) {
        where.department = filters.department;
      }

      if (filters.position) {
        where.position = filters.position;
      }

      if (filters.tenure) {
        where.tenure = filters.tenure;
      }

      if (filters.interviewType) {
        where.interviewType = filters.interviewType;
      }

      if (filters.primaryReason) {
        where.primaryReason = filters.primaryReason;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.dateFrom && filters.dateTo) {
        where.interviewDate = {
          gte: new Date(filters.dateFrom),
          lte: new Date(filters.dateTo)
        };
      }

      const exitInterviews = await prisma.exitInterview.findMany({
        where,
        include: {
          conductedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          interviewDate: 'desc'
        }
      });

      return exitInterviews;
    } catch (error) {
      throw error;
    }
  }

  // Get exit interview by ID
  static async getExitInterviewById(id: string) {
    try {
      const exitInterview = await prisma.exitInterview.findUnique({
        where: { id },
        include: {
          conductedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!exitInterview) {
        throw new Error("Exit interview not found");
      }

      return exitInterview;
    } catch (error) {
      throw error;
    }
  }

  // Update exit interview
  static async updateExitInterview(id: string, request: UpdateExitInterviewRequest) {
    try {
      const exitInterview = await prisma.exitInterview.findUnique({
        where: { id }
      });

      if (!exitInterview) {
        throw new Error("Exit interview not found");
      }

      const updatedExitInterview = await prisma.exitInterview.update({
        where: { id },
        data: {
          employeeName: request.employeeName,
          employeeId: request.employeeId,
          department: request.department,
          position: request.position,
          tenure: request.tenure,
          interviewDate: request.interviewDate,
          interviewType: request.interviewType,
          primaryReason: request.primaryReason,
          secondaryReasons: request.secondaryReasons,
          pushFactors: request.pushFactors,
          pullFactors: request.pullFactors,
          workEnvironmentRating: request.workEnvironmentRating,
          managementRating: request.managementRating,
          compensationRating: request.compensationRating,
          growthOpportunityRating: request.growthOpportunityRating,
          wouldRecommendCompany: request.wouldRecommendCompany,
          suggestionsForImprovement: request.suggestionsForImprovement,
          status: request.status
        },
        include: {
          conductedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return updatedExitInterview;
    } catch (error) {
      throw error;
    }
  }

  // Delete exit interview
  static async deleteExitInterview(id: string) {
    try {
      const exitInterview = await prisma.exitInterview.findUnique({
        where: { id }
      });

      if (!exitInterview) {
        throw new Error("Exit interview not found");
      }

      await prisma.exitInterview.delete({
        where: { id }
      });

      return { message: "Exit interview deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get turnover analysis
  static async getTurnoverAnalysis(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.department) {
        where.department = filters.department;
      }

      if (filters.dateFrom && filters.dateTo) {
        where.interviewDate = {
          gte: new Date(filters.dateFrom),
          lte: new Date(filters.dateTo)
        };
      }

      const exitInterviews = await prisma.exitInterview.findMany({
        where,
        select: {
          id: true,
          department: true,
          position: true,
          tenure: true,
          interviewType: true,
          primaryReason: true,
          secondaryReasons: true,
          pushFactors: true,
          pullFactors: true,
          workEnvironmentRating: true,
          managementRating: true,
          compensationRating: true,
          growthOpportunityRating: true,
          wouldRecommendCompany: true,
          interviewDate: true
        }
      });

      // Calculate turnover metrics
      const totalInterviews = exitInterviews.length;
      const voluntaryTurnover = exitInterviews.filter(ei => ei.interviewType === "voluntary").length;
      const involuntaryTurnover = exitInterviews.filter(ei => ei.interviewType === "involuntary").length;
      const retirementTurnover = exitInterviews.filter(ei => ei.interviewType === "retirement").length;

      // Department breakdown
      const departmentBreakdown = exitInterviews.reduce((acc, ei) => {
        acc[ei.department] = (acc[ei.department] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Position breakdown
      const positionBreakdown = exitInterviews.reduce((acc, ei) => {
        acc[ei.position] = (acc[ei.position] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Tenure breakdown
      const tenureBreakdown = exitInterviews.reduce((acc, ei) => {
        acc[ei.tenure] = (acc[ei.tenure] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Primary reasons breakdown
      const primaryReasonsBreakdown = exitInterviews.reduce((acc, ei) => {
        acc[ei.primaryReason] = (acc[ei.primaryReason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Average ratings
      const ratingsWithValues = exitInterviews.filter(ei => 
        ei.workEnvironmentRating !== null || 
        ei.managementRating !== null || 
        ei.compensationRating !== null || 
        ei.growthOpportunityRating !== null
      );

      const averageWorkEnvironmentRating = ratingsWithValues.length > 0 ?
        ratingsWithValues.reduce((sum, ei) => sum + (ei.workEnvironmentRating || 0), 0) / ratingsWithValues.length : 0;

      const averageManagementRating = ratingsWithValues.length > 0 ?
        ratingsWithValues.reduce((sum, ei) => sum + (ei.managementRating || 0), 0) / ratingsWithValues.length : 0;

      const averageCompensationRating = ratingsWithValues.length > 0 ?
        ratingsWithValues.reduce((sum, ei) => sum + (ei.compensationRating || 0), 0) / ratingsWithValues.length : 0;

      const averageGrowthOpportunityRating = ratingsWithValues.length > 0 ?
        ratingsWithValues.reduce((sum, ei) => sum + (ei.growthOpportunityRating || 0), 0) / ratingsWithValues.length : 0;

      // Recommendation rate
      const wouldRecommendCount = exitInterviews.filter(ei => ei.wouldRecommendCompany === true).length;
      const recommendationRate = totalInterviews > 0 ? (wouldRecommendCount / totalInterviews) * 100 : 0;

      // Common push and pull factors
      const allPushFactors = exitInterviews
        .filter(ei => ei.pushFactors)
        .flatMap(ei => Array.isArray(ei.pushFactors) ? ei.pushFactors : [ei.pushFactors]);
      
      const allPullFactors = exitInterviews
        .filter(ei => ei.pullFactors)
        .flatMap(ei => Array.isArray(ei.pullFactors) ? ei.pullFactors : [ei.pullFactors]);

      const commonPushFactors = allPushFactors.reduce((acc, factor) => {
        acc[factor] = (acc[factor] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const commonPullFactors = allPullFactors.reduce((acc, factor) => {
        acc[factor] = (acc[factor] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalInterviews,
        voluntaryTurnover,
        involuntaryTurnover,
        retirementTurnover,
        departmentBreakdown,
        positionBreakdown,
        tenureBreakdown,
        primaryReasonsBreakdown,
        averageWorkEnvironmentRating,
        averageManagementRating,
        averageCompensationRating,
        averageGrowthOpportunityRating,
        recommendationRate,
        commonPushFactors,
        commonPullFactors,
        exitInterviews
      };
    } catch (error) {
      throw error;
    }
  }

  // Get turnover analytics
  static async getTurnoverAnalytics(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.timeRange) {
        const days = parseInt(filters.timeRange);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        where.interviewDate = {
          gte: startDate
        };
      }

      const exitInterviews = await prisma.exitInterview.findMany({
        where,
        select: {
          id: true,
          department: true,
          position: true,
          tenure: true,
          interviewType: true,
          primaryReason: true,
          workEnvironmentRating: true,
          managementRating: true,
          compensationRating: true,
          growthOpportunityRating: true,
          wouldRecommendCompany: true,
          interviewDate: true
        }
      });

      // Calculate analytics
      const totalInterviews = exitInterviews.length;
      const voluntaryTurnover = exitInterviews.filter(ei => ei.interviewType === "voluntary").length;
      const involuntaryTurnover = exitInterviews.filter(ei => ei.interviewType === "involuntary").length;

      // Monthly turnover trend
      const monthlyTurnover = exitInterviews.reduce((acc, ei) => {
        const month = ei.interviewDate.toISOString().substring(0, 7); // YYYY-MM
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Department turnover rates
      const departmentTurnover = exitInterviews.reduce((acc, ei) => {
        if (!acc[ei.department]) {
          acc[ei.department] = { total: 0, voluntary: 0, involuntary: 0 };
        }
        acc[ei.department].total++;
        if (ei.interviewType === "voluntary") {
          acc[ei.department].voluntary++;
        } else if (ei.interviewType === "involuntary") {
          acc[ei.department].involuntary++;
        }
        return acc;
      }, {} as Record<string, { total: number; voluntary: number; involuntary: number }>);

      // Top reasons for leaving
      const topReasons = exitInterviews.reduce((acc, ei) => {
        acc[ei.primaryReason] = (acc[ei.primaryReason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Average ratings by department
      const departmentRatings = exitInterviews.reduce((acc, ei) => {
        if (!acc[ei.department]) {
          acc[ei.department] = {
            workEnvironment: [],
            management: [],
            compensation: [],
            growthOpportunity: []
          };
        }
        
        if (ei.workEnvironmentRating !== null) {
          acc[ei.department].workEnvironment.push(ei.workEnvironmentRating);
        }
        if (ei.managementRating !== null) {
          acc[ei.department].management.push(ei.managementRating);
        }
        if (ei.compensationRating !== null) {
          acc[ei.department].compensation.push(ei.compensationRating);
        }
        if (ei.growthOpportunityRating !== null) {
          acc[ei.department].growthOpportunity.push(ei.growthOpportunityRating);
        }
        
        return acc;
      }, {} as Record<string, any>);

      // Calculate averages for each department
      Object.keys(departmentRatings).forEach(dept => {
        const ratings = departmentRatings[dept];
        ratings.avgWorkEnvironment = ratings.workEnvironment.length > 0 ?
          ratings.workEnvironment.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.workEnvironment.length : 0;
        ratings.avgManagement = ratings.management.length > 0 ?
          ratings.management.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.management.length : 0;
        ratings.avgCompensation = ratings.compensation.length > 0 ?
          ratings.compensation.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.compensation.length : 0;
        ratings.avgGrowthOpportunity = ratings.growthOpportunity.length > 0 ?
          ratings.growthOpportunity.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.growthOpportunity.length : 0;
      });

      return {
        totalInterviews,
        voluntaryTurnover,
        involuntaryTurnover,
        voluntaryTurnoverRate: totalInterviews > 0 ? (voluntaryTurnover / totalInterviews) * 100 : 0,
        involuntaryTurnoverRate: totalInterviews > 0 ? (involuntaryTurnover / totalInterviews) * 100 : 0,
        monthlyTurnover,
        departmentTurnover,
        topReasons,
        departmentRatings
      };
    } catch (error) {
      throw error;
    }
  }
}
