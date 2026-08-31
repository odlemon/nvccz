//@ts-nocheck
import { PrismaClient, DueDiligenceReview, Application } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { ActiveDdPmsTaskPackService } from './ActiveDdPmsTaskPackService';
import { TaskService } from './TaskService';
import { EmailNotificationService } from './EmailNotificationService';
import { BoardReviewService } from './BoardReviewService';
import { logger } from '../utils/logger';
import { HARDCODED_ROLES } from '../config/hardcodedRoles';

export interface IDueDiligenceCreateParams {
  applicationId: string;
  reviewerId: string;
}

export interface IDueDiligenceUpdateParams {
  // Assessment Areas
  marketResearchViable?: boolean;
  marketResearchComments?: string;
  
  financialViable?: boolean;
  financialComments?: string;
  
  competitiveOpportunities?: boolean;
  competitiveComments?: string;
  
  managementTeamQualified?: boolean;
  managementComments?: string;
  
  legalCompliant?: boolean;
  legalComments?: string;
  
  riskTolerable?: boolean;
  riskComments?: string;
  
  // Overall assessment
  overallScore?: number;
  recommendation?: string;
  finalComments?: string;
}

export interface IDueDiligenceWithRelations extends DueDiligenceReview {
  application: Application;
  reviewer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class DueDiligenceService {
  /**
   * Initiate due diligence for an application
   */
  static async initiateDueDiligence(params: IDueDiligenceCreateParams): Promise<IDueDiligenceWithRelations> {
    try {
      // Check if application exists and is in SCREENING (qualified) stage
      const application = await prisma.application.findUnique({
        where: { id: params.applicationId }
      });

      if (!application) {
        throw new Error('Application not found');
      }

      if (application.currentStage !== 'SCREENING') {
        throw new Error('Due diligence can only be initiated for applications in SCREENING stage. Current stage: ' + application.currentStage);
      }

      // Check if due diligence already exists - prevent multiple due diligence reviews
      const existingDueDiligence = await prisma.dueDiligenceReview.findUnique({
        where: { applicationId: params.applicationId }
      });

      if (existingDueDiligence) {
        throw new Error('A due diligence review already exists for this application. Only one due diligence review is allowed per application.');
      }

      // Create due diligence record
      const dueDiligence = await prisma.dueDiligenceReview.create({
        data: {
          applicationId: params.applicationId,
          reviewerId: params.reviewerId,
          status: 'IN_PROGRESS'
        },
        include: {
          application: true,
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Update application stage to ACTIVE_DD (UAT "Active DD" / active due diligence)
      await prisma.application.update({
        where: { id: params.applicationId },
        data: {
          currentStage: 'ACTIVE_DD',
          screeningOutcome: 'ACTIVE_DD'
        }
      });

      const appRow = await prisma.application.findUnique({
        where: { id: params.applicationId },
        select: { dealReference: true, assignedAnalystId: true }
      });

      await ActiveDdPmsTaskPackService.ensureSeededForActiveDueDiligence({
        applicationId: params.applicationId,
        assigneeUserId: appRow?.assignedAnalystId || params.reviewerId,
        createdByUserId: params.reviewerId,
        dealReference: appRow?.dealReference ?? null
      });

      // Create notification for applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId: params.applicationId,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: 'DUE_DILIGENCE_STARTED',
          title: 'Due Diligence Started',
          message: `Your application for ${application.businessName} has passed screening and entered active due diligence. We will conduct a thorough review and keep you updated.`
        }
      });

      void EmailNotificationService.sendDueDiligenceStartedEmail({
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        businessName: application.businessName,
        applicationId: application.id,
        currentStage: 'ACTIVE_DD'
      }).catch((err: any) => {
        logger.error('Due diligence started applicant email failed', {
          applicationId: params.applicationId,
          error: err?.message
        });
      });

      return dueDiligence;
    } catch (error: any) {
      throw new Error(`Failed to initiate due diligence: ${error.message}`);
    }
  }

  /**
   * Update due diligence data
   */
  static async updateDueDiligence(applicationId: string, params: IDueDiligenceUpdateParams): Promise<IDueDiligenceWithRelations> {
    try {
      // Check if due diligence exists
      const existingDueDiligence = await prisma.dueDiligenceReview.findUnique({
        where: { applicationId }
      });

      if (!existingDueDiligence) {
        throw new Error('Due diligence not found for this application');
      }

      if (existingDueDiligence.status === 'COMPLETED') {
        throw new Error('Cannot update completed due diligence');
      }

      // Calculate overall score if all assessment areas are provided
      let overallScore = params.overallScore;
      if (params.marketResearchViable !== undefined &&
          params.financialViable !== undefined &&
          params.competitiveOpportunities !== undefined &&
          params.managementTeamQualified !== undefined &&
          params.legalCompliant !== undefined &&
          params.riskTolerable !== undefined) {
        
        const scores = [
          params.marketResearchViable ? 16.67 : 0,
          params.financialViable ? 16.67 : 0,
          params.competitiveOpportunities ? 16.67 : 0,
          params.managementTeamQualified ? 16.67 : 0,
          params.legalCompliant ? 16.67 : 0,
          params.riskTolerable ? 16.65 : 0 // Slightly less to make total 100
        ];
        
        overallScore = scores.reduce((sum, score) => sum + score, 0);
      }

      // Update due diligence
      const updatedDueDiligence = await prisma.dueDiligenceReview.update({
        where: { applicationId },
        data: {
          ...params,
          overallScore: overallScore ? new Decimal(overallScore) : undefined,
          updatedAt: new Date()
        },
        include: {
          application: true,
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return updatedDueDiligence;
    } catch (error: any) {
      throw new Error(`Failed to update due diligence: ${error.message}`);
    }
  }

  /**
   * Get due diligence report
   * Includes tasks, activities, and documents
   */
  static async getDueDiligenceReport(applicationId: string): Promise<any> {
    try {
      const dueDiligence = await prisma.dueDiligenceReview.findUnique({
        where: { applicationId },
        include: {
          application: true,
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!dueDiligence) {
        return null;
      }

      // Find all tasks related to this application (via description containing applicationId)
      const relatedTasks = await prisma.task.findMany({
        where: {
          applicationId,
          fromDueDiligence: true
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          activityLogs: {
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

      const tasksWithDocuments = await Promise.all(relatedTasks.map(async task => {
        const activitiesWithDocuments = task.activityLogs.map((activity: any) => {
          let documents: Array<{ fileName: string; fileUrl: string; fileSize: number }> = [];
          let sanitizedDescription = activity.description || '';

          // Extract documents from description if they exist
          if (sanitizedDescription) {
            const documentsMatch = sanitizedDescription.match(/\[DOCUMENTS:(\[[\s\S]*?\])\]/);
            if (documentsMatch) {
              const rawDocuments = documentsMatch[1];
              try {
                // Try parsing raw string directly
                documents = JSON.parse(rawDocuments);
              } catch (directParseError) {
                try {
                  // Attempt to unescape escaped quotes and backslashes
                  const normalized = rawDocuments
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                  documents = JSON.parse(normalized);
                } catch (normalizedParseError) {
                  console.error('Failed to parse documents from activity description:', {
                    directParseError,
                    normalizedParseError
                  });
                }
              }

              // Remove the documents marker from the description shown to users
              sanitizedDescription = sanitizedDescription.replace(documentsMatch[0], '').trim();
            }

            // Remove approval tags from description
            sanitizedDescription = sanitizedDescription
              .replace(/\[APPROVAL:[^\]]*\]/g, '')
              .replace(/\n{2,}/g, '\n')
              .trim();
          }

          return {
            ...activity,
            description: sanitizedDescription || null,
            documents
          };
        }).map((activity: any) => {
          const user = activity.user || null;
          const byUser = user
            ? {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email
              }
            : null;

          return {
            ...activity,
            byUser,
            by: byUser ? `${byUser.firstName} ${byUser.lastName}`.trim() : activity.by || activity.userId || null,
            status: activity.status || 'pending_approval' // Ensure status field is included
          };
        });

        let teamMemberIds: string[] = [];
        if (Array.isArray(task.team)) {
          teamMemberIds = task.team.filter((member: any) => typeof member === 'string');
        } else if (typeof task.team === 'string') {
          try {
            const parsed = JSON.parse(task.team);
            if (Array.isArray(parsed)) {
              teamMemberIds = parsed.filter((member: any) => typeof member === 'string');
            }
          } catch {
            // ignore parse errors
          }
        }

        const teamMembers = teamMemberIds.length
          ? await prisma.user.findMany({
              where: { id: { in: teamMemberIds } },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            })
          : [];

        return {
          ...task,
          activityLogs: activitiesWithDocuments,
          teamMemberIds,
          team: teamMembers
        };
      }));

      return {
        ...dueDiligence,
        tasks: tasksWithDocuments
      };
    } catch (error: any) {
      throw new Error(`Failed to get due diligence report: ${error.message}`);
    }
  }

  /**
   * Complete due diligence
   * Checks if all assigned tasks are approved before completing
   */
  static async completeDueDiligence(applicationId: string): Promise<IDueDiligenceWithRelations> {
    try {
      // Check if due diligence exists
      const existingDueDiligence = await prisma.dueDiligenceReview.findUnique({
        where: { applicationId },
        include: {
          application: true
        }
      });

      if (!existingDueDiligence) {
        throw new Error('Due diligence not found for this application');
      }

      if (existingDueDiligence.status === 'COMPLETED') {
        throw new Error('Due diligence is already completed');
      }

      const requiredSections = [
        { field: 'marketResearchViable', label: 'Market Research' },
        { field: 'financialViable', label: 'Financial Assessment' },
        { field: 'legalCompliant', label: 'Legal Compliance' },
        { field: 'managementTeamQualified', label: 'Management Assessment' }
      ];

      const incompleteSections = requiredSections
        .filter(section => !existingDueDiligence[section.field]);

      if (incompleteSections.length > 0) {
        throw new Error(`Cannot complete due diligence: Please complete ${incompleteSections.map(section => section.label).join(', ')} first.`);
      }

      // Validate that all required fields are filled
      if (existingDueDiligence.overallScore === null || 
          existingDueDiligence.recommendation === null ||
          existingDueDiligence.finalComments === null) {
        throw new Error('Cannot complete due diligence: missing required fields (overall score, recommendation, or final comments)');
      }

      // Check if all tasks assigned for this due diligence are approved
      // Find ALL tasks related to this application (via description containing applicationId)
      // Multiple tasks can be assigned to the same due diligence
      const relatedTasks = await prisma.task.findMany({
        where: {
          applicationId,
          fromDueDiligence: true
        },
        include: {
          activityLogs: true
        }
      });

      if (relatedTasks.length > 0) {
        logger.info(`Checking ${relatedTasks.length} task(s) for due diligence completion`, {
          applicationId,
          taskCount: relatedTasks.length,
          taskTitles: relatedTasks.map(t => t.title)
        });

        // Check each task's activities for approval status
        for (const task of relatedTasks) {
          const activities = task.activityLogs || [];

          if (task.stage === 'completed') {
            logger.info(`Task "${task.title}" is marked completed — skipping activity approval check`, {
              taskId: task.id,
              activitiesCount: activities.length,
            });
            continue;
          }
          
          if (activities.length > 0) {
            // Check if all activities are approved using status field
            const unapprovedActivities = activities.filter((activity: any) => {
              return activity.status !== 'approved';
            });

            if (unapprovedActivities.length > 0) {
              throw new Error(`Cannot complete due diligence: Task "${task.title}" has ${unapprovedActivities.length} unapproved activity/activities. All activities must be approved before completing due diligence.`);
            }
            
            logger.info(`Task "${task.title}" has all activities approved`, {
              taskId: task.id,
              activitiesCount: activities.length
            });
          } else {
            // Task has no activities yet - allow completion if task is marked as completed
            // OR if task stage is 'completed'
            if (task.stage !== 'completed') {
              throw new Error(`Cannot complete due diligence: Task "${task.title}" has no activities and is not completed. Please ensure all tasks have activities and are approved, or mark the task as completed.`);
            }
            
            logger.info(`Task "${task.title}" has no activities but is marked as completed`, {
              taskId: task.id,
              stage: task.stage
            });
          }
        }
        
        logger.info('All tasks validated - due diligence can be completed', {
          applicationId,
          tasksCount: relatedTasks.length
        });
      } else {
        logger.info('No tasks assigned for this due diligence - proceeding with completion', {
          applicationId
        });
      }

      // Update due diligence status
      const completedDueDiligence = await prisma.dueDiligenceReview.update({
        where: { applicationId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          application: true,
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Determine next stage based on recommendation
      let nextStage: string;
      if (existingDueDiligence.recommendation === 'REJECT') {
        nextStage = 'REJECTED';
      } else if (existingDueDiligence.recommendation === 'APPROVE' || existingDueDiligence.recommendation === 'CONDITIONAL') {
        // Move to TERM_SHEET stage (new workflow: due diligence → term sheet → board review)
        nextStage = 'TERM_SHEET';
        
        // Create user and portfolio company when due diligence approves/conditionally approves
        // This allows users to access and sign term sheets before board review
        try {
          const fullApplication = await prisma.application.findUnique({
            where: { id: applicationId },
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              applicantPhone: true,
              applicantAddress: true,
              currentStage: true,
              requestedAmount: true,
              industry: true,
              foundingDate: true,
              businessDescription: true,
              businessStage: true
            }
          });

          if (fullApplication) {
            await BoardReviewService.createUserAndPortfolioCompany(fullApplication);
            logger.info("User and portfolio company created after due diligence completion", {
              applicationId,
              applicantEmail: fullApplication.applicantEmail
            });
          }
        } catch (userCreationError: any) {
          logger.error("Failed to create user and portfolio company after due diligence", {
            applicationId,
            error: userCreationError.message
          });
          // Don't fail due diligence completion if user creation fails - log and continue
        }
      } else {
        // Default to TERM_SHEET for any other recommendation
        nextStage = 'TERM_SHEET';
      }

      // Update application stage
      await prisma.application.update({
        where: { id: applicationId },
        data: { 
          currentStage: nextStage,
          dueDiligenceScore: existingDueDiligence.overallScore
        }
      });

      // Mark all related tasks as completed (only if they aren't already)
      const relatedTasksForCompletion = await prisma.task.findMany({
        where: {
          applicationId,
          fromDueDiligence: true
        },
        select: {
          id: true,
          stage: true
        }
      });

      for (const task of relatedTasksForCompletion) {
        if (task.stage !== 'completed') {
          await prisma.task.update({
            where: { id: task.id },
            data: {
              stage: 'completed',
              isOverdue: false,
              overdueStatus: null,
              originalStage: null,
              updatedAt: new Date()
            }
          });
        }
      }

      // Create notification for applicant
      const notificationMessage = nextStage === 'REJECTED' 
        ? `The due diligence review for your application (${existingDueDiligence.application.businessName}) has been completed. Unfortunately, your application has been rejected.`
        : nextStage === 'TERM_SHEET'
        ? `The due diligence review for your application (${existingDueDiligence.application.businessName}) has been completed. Your account has been created and you can now log in to review and sign the term sheet.`
        : `The due diligence review for your application (${existingDueDiligence.application.businessName}) has been completed. Your application is now moving to the next stage.`;

      await prisma.applicationNotification.create({
        data: {
          applicationId,
          recipientEmail: existingDueDiligence.application.applicantEmail,
          recipientPhone: existingDueDiligence.application.applicantPhone,
          notificationType: 'DUE_DILIGENCE_COMPLETED',
          title: 'Due Diligence Completed',
          message: notificationMessage
        }
      });

      // `completedDueDiligence` was loaded before `application.update` — nested `application` would stay stale (e.g. ACTIVE_DD).
      const refreshed = await prisma.dueDiligenceReview.findUnique({
        where: { applicationId },
        include: {
          application: true,
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!refreshed) {
        throw new Error('Due diligence record missing after completion');
      }

      return refreshed;
    } catch (error: any) {
      throw new Error(`Failed to complete due diligence: ${error.message}`);
    }
  }

  /**
   * Get all due diligence reviews (for admin/fund manager)
   */
  static async getAllDueDiligenceReviews(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{ reviews: IDueDiligenceWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      if (status) where.status = status;

      const [reviews, total] = await Promise.all([
        prisma.dueDiligenceReview.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            application: true,
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.dueDiligenceReview.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        reviews,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get due diligence reviews: ${error.message}`);
    }
  }

  /**
   * Get users from Investments department only
   * Uses same structure as /api/users but filtered for Investments department
   */
  static async getInvestmentsDepartmentUsers(): Promise<any[]> {
    try {
      // Get users with userDepartment = "Investments" (hardcoded string, not departmentId)
      const users = await prisma.user.findMany({
        where: {
          userDepartment: 'Investments', // Hardcoded department name
          role: {
            name: {
              not: 'applicant' // Exclude applicants
            }
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          createdAt: true,
          updatedAt: true
        },
        orderBy: [
          { firstName: 'asc' },
          { lastName: 'asc' }
        ]
      });

      // Get all hardcoded roles for the Investments department
      const investmentsHardcodedRoles = HARDCODED_ROLES.filter(
        role => role.department === 'Investments'
      );

      return users;
    } catch (error: any) {
      throw new Error(`Failed to get Investments department users: ${error.message}`);
    }
  }

  /**
   * Assign task from due diligence (creates task in background, syncs with performance module)
   * Multiple tasks can be assigned to the same due diligence - each call creates a new task
   */
  static async assignDueDiligenceTask(
    applicationId: string,
    assigneeId: string,
    taskData: {
      title: string;
      description?: string;
      priority?: string;
      dueDate?: Date;
      category?: string;
    },
    assignedById: string
  ): Promise<any> {
    try {
      // Get due diligence
      const dueDiligence = await prisma.dueDiligenceReview.findUnique({
        where: { applicationId },
        include: {
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true
            }
          }
        }
      });

      if (!dueDiligence) {
        throw new Error('Due diligence not found for this application');
      }

      if (dueDiligence.status === 'COMPLETED') {
        throw new Error('Cannot assign workstreams after due diligence is completed');
      }

      // Get assignee user
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        include: {
          department: true,
          role: true
        }
      });

      if (!assignee) {
        throw new Error('Assignee user not found');
      }

      // Create task in performance module (syncs automatically)
      const task = await TaskService.createTask(
        {
          title: taskData.title,
          description: taskData.description || `Due diligence task for ${dueDiligence.application.businessName}`,
          team: [assigneeId],
          stage: 'todo',
          date: taskData.dueDate || new Date(),
          priority: taskData.priority || 'high',
          department: assignee.department?.name || 'Investments',
          applicationId: applicationId,
          fromDueDiligence: true,
          isPerformanceTask: true,
          performanceCategory: 'business',
          category: taskData.category
        },
        assignedById
      );

      // applicationId + fromDueDiligence link the task; no legacy description marker needed.

      // Send email notification to assignee
      try {
        await EmailNotificationService.sendDueDiligenceTaskAssignedEmail({
          assigneeName: `${assignee.firstName} ${assignee.lastName}`,
          assigneeEmail: assignee.email,
          taskTitle: taskData.title,
          businessName: dueDiligence.application.businessName,
          applicationId: applicationId,
          taskId: task.id
        });
        logger.info('Due diligence task assignment email sent', {
          assigneeId,
          taskId: task.id,
          applicationId
        });
      } catch (emailError: any) {
        logger.error('Failed to send task assignment email', {
          error: emailError.message,
          assigneeId,
          taskId: task.id
        });
        // Don't fail task creation if email fails
      }

      logger.info('Due diligence task assigned', {
        applicationId,
        taskId: task.id,
        assigneeId,
        assignedById
      });

      return {
        task,
        dueDiligence: {
          id: dueDiligence.id,
          applicationId: dueDiligence.applicationId
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to assign due diligence task: ${error.message}`);
    }
  }
}

