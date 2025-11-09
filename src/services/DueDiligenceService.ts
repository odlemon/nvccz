//@ts-nocheck
import { PrismaClient, DueDiligenceReview, Application } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { TaskService } from './TaskService';
import { EmailNotificationService } from './EmailNotificationService';
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
      // Check if application exists and is in SHORTLISTED stage
      const application = await prisma.application.findUnique({
        where: { id: params.applicationId }
      });

      if (!application) {
        throw new Error('Application not found');
      }

      if (application.currentStage !== 'SHORTLISTED') {
        throw new Error('Due diligence can only be initiated for applications in SHORTLISTED stage. Current stage: ' + application.currentStage);
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

      // Update application stage to UNDER_DUE_DILIGENCE
      await prisma.application.update({
        where: { id: params.applicationId },
        data: { currentStage: 'UNDER_DUE_DILIGENCE' }
      });

      // Create notification for applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId: params.applicationId,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: 'DUE_DILIGENCE_STARTED',
          title: 'Due Diligence Started',
          message: `Your application for ${application.businessName} has entered the due diligence phase. We will conduct a thorough review of your business and will keep you updated on the progress.`
        }
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

      // Extract document URLs from activity descriptions and add to activities
      const tasksWithDocuments = relatedTasks.map(task => {
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
        });

        return {
          ...task,
          activityLogs: activitiesWithDocuments
        };
      });

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
          
          if (activities.length > 0) {
            // Check if all activities are approved
            const unapprovedActivities = activities.filter((activity: any) => {
              const approvalMatch = activity.description?.match(/\[APPROVAL:(.+?)\]/);
              if (!approvalMatch) return true; // No approval found
              const approvalParts = approvalMatch[1].split(':');
              return approvalParts[0] !== 'APPROVED';
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

      // Update application stage to UNDER_BOARD_REVIEW
      await prisma.application.update({
        where: { id: applicationId },
        data: { 
          currentStage: 'UNDER_BOARD_REVIEW',
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
      await prisma.applicationNotification.create({
        data: {
          applicationId,
          recipientEmail: existingDueDiligence.application.applicantEmail,
          recipientPhone: existingDueDiligence.application.applicantPhone,
          notificationType: 'DUE_DILIGENCE_COMPLETED',
          title: 'Due Diligence Completed',
          message: `The due diligence review for your application (${existingDueDiligence.application.businessName}) has been completed. Your application is now under board review.`
        }
      });

      return completedDueDiligence;
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
          performanceCategory: 'business'
        },
        assignedById
      );

      // Append marker for legacy references
      await prisma.task.update({
        where: { id: task.id },
        data: {
          description: `${task.description || ''}\n\n[DueDiligenceApplication:${applicationId}]`
        }
      });

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

