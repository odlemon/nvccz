// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateResearchReportRequest {
  title: string;
  description?: string;
  reportType: string; // "sector_analysis", "market_trends", "company_analysis", "technology_review"
  sector: string; // "fintech", "healthtech", "edtech", etc.
  quarter: string; // "Q1 2025", "Q2 2025", etc.
  year: number;
  targetCompletionDate: Date;
  assignedToId: string;
}

export interface UpdateResearchReportRequest {
  title?: string;
  description?: string;
  reportType?: string;
  sector?: string;
  status?: string;
  progressPercentage?: number;
  currentPhase?: string;
  pitchDecksReviewed?: number;
  dueDiligenceQuestions?: any;
  keyFindings?: any;
  recommendations?: any;
}

export interface CreateResearchReportActivityRequest {
  researchReportId: string;
  activityType: string; // "pitch_deck_review", "question_generation", "research_note", "analysis_update"
  title: string;
  description?: string;
  pitchDeckCount?: number;
  questionsGenerated?: any;
  researchNotes?: string;
}

export class ResearchReportService {
  // Create a new research report
  static async createResearchReport(request: CreateResearchReportRequest, createdById: string) {
    try {
      // Validate assigned user
      const assignedUser = await prisma.user.findUnique({
        where: { id: request.assignedToId }
      });

      if (!assignedUser) {
        throw new Error("Assigned user not found");
      }

      // Create the research report
      const report = await prisma.researchReport.create({
        data: {
          title: request.title,
          description: request.description,
          reportType: request.reportType,
          sector: request.sector,
          quarter: request.quarter,
          year: request.year,
          targetCompletionDate: request.targetCompletionDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          status: "planned",
          progressPercentage: 0,
          currentPhase: "research"
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
          reportActivities: {
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

      return report;
    } catch (error) {
      throw error;
    }
  }

  // Get all research reports with filtering
  static async getAllResearchReports(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.reportType) {
        where.reportType = filters.reportType;
      }

      if (filters.sector) {
        where.sector = filters.sector;
      }

      if (filters.quarter) {
        where.quarter = filters.quarter;
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

      if (filters.currentPhase) {
        where.currentPhase = filters.currentPhase;
      }

      const reports = await prisma.researchReport.findMany({
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
          reportActivities: {
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

      return reports;
    } catch (error) {
      throw error;
    }
  }

  // Get research report by ID
  static async getResearchReportById(id: string) {
    try {
      const report = await prisma.researchReport.findUnique({
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
          reportActivities: {
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

      if (!report) {
        throw new Error("Research report not found");
      }

      return report;
    } catch (error) {
      throw error;
    }
  }

  // Update research report
  static async updateResearchReport(id: string, request: UpdateResearchReportRequest) {
    try {
      const report = await prisma.researchReport.findUnique({
        where: { id }
      });

      if (!report) {
        throw new Error("Research report not found");
      }

      const updatedReport = await prisma.researchReport.update({
        where: { id },
        data: {
          title: request.title,
          description: request.description,
          reportType: request.reportType,
          sector: request.sector,
          status: request.status,
          progressPercentage: request.progressPercentage,
          currentPhase: request.currentPhase,
          pitchDecksReviewed: request.pitchDecksReviewed,
          dueDiligenceQuestions: request.dueDiligenceQuestions,
          keyFindings: request.keyFindings,
          recommendations: request.recommendations,
          publishedAt: request.status === "published" ? new Date() : report.publishedAt
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
          reportActivities: {
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

      return updatedReport;
    } catch (error) {
      throw error;
    }
  }

  // Delete research report
  static async deleteResearchReport(id: string) {
    try {
      const report = await prisma.researchReport.findUnique({
        where: { id }
      });

      if (!report) {
        throw new Error("Research report not found");
      }

      await prisma.researchReport.delete({
        where: { id }
      });

      return { message: "Research report deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create research report activity
  static async createResearchReportActivity(request: CreateResearchReportActivityRequest, userId: string) {
    try {
      // Validate research report
      const report = await prisma.researchReport.findUnique({
        where: { id: request.researchReportId }
      });

      if (!report) {
        throw new Error("Research report not found");
      }

      // Create the activity
      const activity = await prisma.researchReportActivity.create({
        data: {
          researchReportId: request.researchReportId,
          userId: userId,
          activityType: request.activityType,
          title: request.title,
          description: request.description,
          pitchDeckCount: request.pitchDeckCount,
          questionsGenerated: request.questionsGenerated,
          researchNotes: request.researchNotes
        },
        include: {
          researchReport: {
            select: {
              id: true,
              title: true,
              reportType: true,
              sector: true
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

      // Update report progress based on activity type
      let updateData: any = {};
      
      if (request.activityType === "pitch_deck_review" && request.pitchDeckCount) {
        updateData.pitchDecksReviewed = report.pitchDecksReviewed + request.pitchDeckCount;
      }
      
      if (request.activityType === "question_generation" && request.questionsGenerated) {
        updateData.dueDiligenceQuestions = request.questionsGenerated;
      }
      
      if (request.activityType === "research_note" && request.researchNotes) {
        updateData.keyFindings = request.researchNotes;
      }

      // Update progress percentage based on activities
      const totalActivities = await prisma.researchReportActivity.count({
        where: { researchReportId: request.researchReportId }
      });
      
      // Simple progress calculation - can be made more sophisticated
      const progressPercentage = Math.min((totalActivities / 10) * 100, 100);
      updateData.progressPercentage = progressPercentage;

      if (Object.keys(updateData).length > 0) {
        await prisma.researchReport.update({
          where: { id: request.researchReportId },
          data: updateData
        });
      }

      return activity;
    } catch (error) {
      throw error;
    }
  }

  // Get research report activities
  static async getResearchReportActivities(researchReportId: string) {
    try {
      const activities = await prisma.researchReportActivity.findMany({
        where: { researchReportId },
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

  // Get quarterly report summary
  static async getQuarterlyReportSummary(quarter: string, year: number) {
    try {
      const reports = await prisma.researchReport.findMany({
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
          reportActivities: {
            select: {
              id: true,
              activityType: true,
              pitchDeckCount: true,
              createdAt: true
            }
          }
        }
      });

      // Calculate summary statistics
      const totalReports = reports.length;
      const completedReports = reports.filter(r => r.status === "published").length;
      const totalPitchDecksReviewed = reports.reduce((sum, r) => sum + r.pitchDecksReviewed, 0);
      const totalActivities = reports.reduce((sum, r) => sum + r.reportActivities.length, 0);

      const sectorBreakdown = reports.reduce((acc, r) => {
        acc[r.sector] = (acc[r.sector] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statusBreakdown = reports.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        quarter,
        year,
        totalReports,
        completedReports,
        totalPitchDecksReviewed,
        totalActivities,
        sectorBreakdown,
        statusBreakdown,
        reports
      };
    } catch (error) {
      throw error;
    }
  }
}
