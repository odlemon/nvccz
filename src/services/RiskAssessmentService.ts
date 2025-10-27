// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateRiskAssessmentRequest {
  title: string;
  description?: string;
  assessmentType: string; // "startup_investment", "portfolio_company", "market_risk"
  companyName?: string;
  dealValue?: number;
  sector?: string;
  stage?: string;
  targetCompletionDate: Date;
  assignedToId: string;
}

export interface UpdateRiskAssessmentRequest {
  title?: string;
  description?: string;
  assessmentType?: string;
  companyName?: string;
  dealValue?: number;
  sector?: string;
  stage?: string;
  burnRateRisk?: number;
  marketViabilityRisk?: number;
  ipLegalRisk?: number;
  founderRisk?: number;
  financialRisk?: number;
  operationalRisk?: number;
  overallRiskScore?: number;
  riskLevel?: string;
  recommendation?: string;
  status?: string;
}

export interface CreateRiskAssessmentSubTaskRequest {
  riskAssessmentId: string;
  category: string; // "burn_rate", "market_viability", "ip_legal", "founder", "financial", "operational"
  title: string;
  description?: string;
  targetCompletionDate: Date;
}

export interface UpdateRiskAssessmentSubTaskRequest {
  title?: string;
  description?: string;
  status?: string;
  progressPercentage?: number;
  riskScore?: number;
  findings?: string;
  recommendations?: string;
}

export class RiskAssessmentService {
  // Create a new risk assessment
  static async createRiskAssessment(request: CreateRiskAssessmentRequest, createdById: string) {
    try {
      // Validate assigned user
      const assignedUser = await prisma.user.findUnique({
        where: { id: request.assignedToId }
      });

      if (!assignedUser) {
        throw new Error("Assigned user not found");
      }

      // Create the risk assessment
      const assessment = await prisma.riskAssessment.create({
        data: {
          title: request.title,
          description: request.description,
          assessmentType: request.assessmentType,
          companyName: request.companyName,
          dealValue: request.dealValue,
          sector: request.sector,
          stage: request.stage,
          targetCompletionDate: request.targetCompletionDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          status: "in_progress"
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
          riskSubTasks: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      // Auto-create sub-tasks for each risk category
      await this.createDefaultSubTasks(assessment.id);

      return assessment;
    } catch (error) {
      throw error;
    }
  }

  // Create default sub-tasks for risk categories
  static async createDefaultSubTasks(riskAssessmentId: string) {
    try {
      const defaultSubTasks = [
        {
          category: "burn_rate",
          title: "Burn Rate Analysis",
          description: "Analyze company's monthly burn rate and runway"
        },
        {
          category: "market_viability",
          title: "Market Viability Assessment",
          description: "Evaluate market size, competition, and growth potential"
        },
        {
          category: "ip_legal",
          title: "IP and Legal Risk Review",
          description: "Review intellectual property, legal structure, and compliance"
        },
        {
          category: "founder",
          title: "Founder Risk Assessment",
          description: "Evaluate founder experience, commitment, and team dynamics"
        },
        {
          category: "financial",
          title: "Financial Risk Analysis",
          description: "Review financial statements, projections, and funding history"
        },
        {
          category: "operational",
          title: "Operational Risk Review",
          description: "Assess operational processes, scalability, and execution risk"
        }
      ];

      for (const subTask of defaultSubTasks) {
        await prisma.riskAssessmentSubTask.create({
          data: {
            riskAssessmentId: riskAssessmentId,
            category: subTask.category,
            title: subTask.title,
            description: subTask.description,
            targetCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
          }
        });
      }
    } catch (error) {
      throw error;
    }
  }

  // Get all risk assessments with filtering
  static async getAllRiskAssessments(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.assessmentType) {
        where.assessmentType = filters.assessmentType;
      }

      if (filters.sector) {
        where.sector = filters.sector;
      }

      if (filters.stage) {
        where.stage = filters.stage;
      }

      if (filters.assignedToId) {
        where.assignedToId = filters.assignedToId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.riskLevel) {
        where.riskLevel = filters.riskLevel;
      }

      const assessments = await prisma.riskAssessment.findMany({
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
          riskSubTasks: {
            orderBy: {
              createdAt: 'asc'
            }
          },
          riskHistory: {
            orderBy: {
              recordedAt: 'desc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return assessments;
    } catch (error) {
      throw error;
    }
  }

  // Get risk assessment by ID
  static async getRiskAssessmentById(id: string) {
    try {
      const assessment = await prisma.riskAssessment.findUnique({
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
          riskSubTasks: {
            orderBy: {
              createdAt: 'asc'
            }
          },
          riskHistory: {
            orderBy: {
              recordedAt: 'desc'
            }
          }
        }
      });

      if (!assessment) {
        throw new Error("Risk assessment not found");
      }

      return assessment;
    } catch (error) {
      throw error;
    }
  }

  // Update risk assessment
  static async updateRiskAssessment(id: string, request: UpdateRiskAssessmentRequest) {
    try {
      const assessment = await prisma.riskAssessment.findUnique({
        where: { id }
      });

      if (!assessment) {
        throw new Error("Risk assessment not found");
      }

      // Calculate overall risk score if individual scores are provided
      let overallRiskScore = request.overallRiskScore;
      if (!overallRiskScore && (
        request.burnRateRisk !== undefined ||
        request.marketViabilityRisk !== undefined ||
        request.ipLegalRisk !== undefined ||
        request.founderRisk !== undefined ||
        request.financialRisk !== undefined ||
        request.operationalRisk !== undefined
      )) {
        const scores = [
          request.burnRateRisk || assessment.burnRateRisk,
          request.marketViabilityRisk || assessment.marketViabilityRisk,
          request.ipLegalRisk || assessment.ipLegalRisk,
          request.founderRisk || assessment.founderRisk,
          request.financialRisk || assessment.financialRisk,
          request.operationalRisk || assessment.operationalRisk
        ].filter(score => score !== null && score !== undefined);
        
        if (scores.length > 0) {
          overallRiskScore = scores.reduce((sum, score) => sum + Number(score), 0) / scores.length;
        }
      }

      // Determine risk level based on overall score
      let riskLevel = request.riskLevel;
      if (!riskLevel && overallRiskScore !== undefined) {
        if (overallRiskScore <= 3) {
          riskLevel = "low";
        } else if (overallRiskScore <= 6) {
          riskLevel = "medium";
        } else if (overallRiskScore <= 8) {
          riskLevel = "high";
        } else {
          riskLevel = "critical";
        }
      }

      const updatedAssessment = await prisma.riskAssessment.update({
        where: { id },
        data: {
          title: request.title,
          description: request.description,
          assessmentType: request.assessmentType,
          companyName: request.companyName,
          dealValue: request.dealValue,
          sector: request.sector,
          stage: request.stage,
          burnRateRisk: request.burnRateRisk,
          marketViabilityRisk: request.marketViabilityRisk,
          ipLegalRisk: request.ipLegalRisk,
          founderRisk: request.founderRisk,
          financialRisk: request.financialRisk,
          operationalRisk: request.operationalRisk,
          overallRiskScore: overallRiskScore,
          riskLevel: riskLevel,
          recommendation: request.recommendation,
          status: request.status,
          completedAt: request.status === "completed" ? new Date() : assessment.completedAt
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
          riskSubTasks: {
            orderBy: {
              createdAt: 'asc'
            }
          },
          riskHistory: {
            orderBy: {
              recordedAt: 'desc'
            }
          }
        }
      });

      return updatedAssessment;
    } catch (error) {
      throw error;
    }
  }

  // Delete risk assessment
  static async deleteRiskAssessment(id: string) {
    try {
      const assessment = await prisma.riskAssessment.findUnique({
        where: { id }
      });

      if (!assessment) {
        throw new Error("Risk assessment not found");
      }

      await prisma.riskAssessment.delete({
        where: { id }
      });

      return { message: "Risk assessment deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create risk assessment sub-task
  static async createRiskAssessmentSubTask(request: CreateRiskAssessmentSubTaskRequest) {
    try {
      // Validate risk assessment
      const assessment = await prisma.riskAssessment.findUnique({
        where: { id: request.riskAssessmentId }
      });

      if (!assessment) {
        throw new Error("Risk assessment not found");
      }

      const subTask = await prisma.riskAssessmentSubTask.create({
        data: {
          riskAssessmentId: request.riskAssessmentId,
          category: request.category,
          title: request.title,
          description: request.description,
          targetCompletionDate: request.targetCompletionDate
        }
      });

      return subTask;
    } catch (error) {
      throw error;
    }
  }

  // Update risk assessment sub-task
  static async updateRiskAssessmentSubTask(id: string, request: UpdateRiskAssessmentSubTaskRequest) {
    try {
      const subTask = await prisma.riskAssessmentSubTask.findUnique({
        where: { id }
      });

      if (!subTask) {
        throw new Error("Risk assessment sub-task not found");
      }

      const updatedSubTask = await prisma.riskAssessmentSubTask.update({
        where: { id },
        data: {
          title: request.title,
          description: request.description,
          status: request.status,
          progressPercentage: request.progressPercentage,
          riskScore: request.riskScore,
          findings: request.findings,
          recommendations: request.recommendations,
          completedAt: request.status === "completed" ? new Date() : subTask.completedAt
        }
      });

      return updatedSubTask;
    } catch (error) {
      throw error;
    }
  }

  // Get risk assessment sub-tasks
  static async getRiskAssessmentSubTasks(riskAssessmentId: string) {
    try {
      const subTasks = await prisma.riskAssessmentSubTask.findMany({
        where: { riskAssessmentId },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return subTasks;
    } catch (error) {
      throw error;
    }
  }

  // Add risk assessment history entry
  static async addRiskAssessmentHistory(riskAssessmentId: string, historyData: any) {
    try {
      const assessment = await prisma.riskAssessment.findUnique({
        where: { id: riskAssessmentId }
      });

      if (!assessment) {
        throw new Error("Risk assessment not found");
      }

      const history = await prisma.riskAssessmentHistory.create({
        data: {
          riskAssessmentId: riskAssessmentId,
          initialRiskScore: historyData.initialRiskScore,
          actualOutcome: historyData.actualOutcome,
          actualImpact: historyData.actualImpact,
          accuracyRating: historyData.accuracyRating,
          lessonsLearned: historyData.lessonsLearned,
          modelImprovements: historyData.modelImprovements
        }
      });

      return history;
    } catch (error) {
      throw error;
    }
  }

  // Get risk assessment history
  static async getRiskAssessmentHistory(riskAssessmentId: string) {
    try {
      const history = await prisma.riskAssessmentHistory.findMany({
        where: { riskAssessmentId },
        orderBy: {
          recordedAt: 'desc'
        }
      });

      return history;
    } catch (error) {
      throw error;
    }
  }

  // Get risk assessment analytics
  static async getRiskAssessmentAnalytics(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.assessmentType) {
        where.assessmentType = filters.assessmentType;
      }

      if (filters.sector) {
        where.sector = filters.sector;
      }

      if (filters.timeRange) {
        const days = parseInt(filters.timeRange);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        where.createdAt = {
          gte: startDate
        };
      }

      const assessments = await prisma.riskAssessment.findMany({
        where,
        select: {
          id: true,
          assessmentType: true,
          sector: true,
          overallRiskScore: true,
          riskLevel: true,
          recommendation: true,
          status: true,
          createdAt: true,
          completedAt: true
        }
      });

      // Calculate analytics
      const totalAssessments = assessments.length;
      const completedAssessments = assessments.filter(a => a.status === "completed").length;
      
      const riskLevelBreakdown = assessments.reduce((acc, a) => {
        if (a.riskLevel) {
          acc[a.riskLevel] = (acc[a.riskLevel] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const recommendationBreakdown = assessments.reduce((acc, a) => {
        if (a.recommendation) {
          acc[a.recommendation] = (acc[a.recommendation] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const averageRiskScore = assessments
        .filter(a => a.overallRiskScore !== null)
        .reduce((sum, a) => sum + Number(a.overallRiskScore), 0) / 
        assessments.filter(a => a.overallRiskScore !== null).length || 0;

      const sectorBreakdown = assessments.reduce((acc, a) => {
        if (a.sector) {
          acc[a.sector] = (acc[a.sector] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      return {
        totalAssessments,
        completedAssessments,
        completionRate: totalAssessments > 0 ? (completedAssessments / totalAssessments) * 100 : 0,
        averageRiskScore,
        riskLevelBreakdown,
        recommendationBreakdown,
        sectorBreakdown
      };
    } catch (error) {
      throw error;
    }
  }
}
