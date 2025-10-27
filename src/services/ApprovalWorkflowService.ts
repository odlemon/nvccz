// @ts-nocheck
import { PrismaClient, Decimal } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateApprovalWorkflowParams {
  name: string;
  description?: string;
  module: string;
  entityType: string;
  createdById: string;
  steps: {
    stepNumber: number;
    stepName: string;
    stepType: string; // USER, ROLE, DEPARTMENT, AMOUNT_THRESHOLD
    userId?: string;
    roleId?: string;
    departmentId?: string;
    amountThreshold?: number;
    isRequired?: boolean;
    canDelegate?: boolean;
    autoApprove?: boolean;
    approvalOrder?: string; // SEQUENTIAL, PARALLEL
  }[];
}

export interface CreateApprovalRequestParams {
  workflowId: string;
  entityType: string;
  entityId: string;
  entityData?: any;
  requestedById: string;
}

export interface ProcessApprovalParams {
  requestId: string;
  stepId: string;
  approverId: string;
  status: 'APPROVED' | 'REJECTED';
  comments?: string;
  delegatedToId?: string;
}

export class ApprovalWorkflowService {
  /**
   * Create a new approval workflow
   */
  static async createApprovalWorkflow(params: CreateApprovalWorkflowParams) {
    try {
      const { name, description, module, entityType, createdById, steps } = params;

      // Validate steps
      if (!steps || steps.length === 0) {
        throw new Error("At least one approval step is required");
      }

      // Validate step numbers are sequential
      const stepNumbers = steps.map(s => s.stepNumber).sort((a, b) => a - b);
      for (let i = 0; i < stepNumbers.length; i++) {
        if (stepNumbers[i] !== i + 1) {
          throw new Error("Step numbers must be sequential starting from 1");
        }
      }

      // Create workflow with steps
      const workflow = await prisma.approvalWorkflow.create({
        data: {
          name,
          description,
          module,
          entityType,
          createdById,
          steps: {
            create: steps.map(step => ({
              stepNumber: step.stepNumber,
              stepName: step.stepName,
              stepType: step.stepType,
              userId: step.userId,
              roleId: step.roleId,
              departmentId: step.departmentId,
              amountThreshold: step.amountThreshold ? new Decimal(step.amountThreshold) : null,
              isRequired: step.isRequired ?? true,
              canDelegate: step.canDelegate ?? false,
              autoApprove: step.autoApprove ?? false,
              approvalOrder: step.approvalOrder ?? 'SEQUENTIAL'
            }))
          }
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          steps: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              },
              department: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            },
            orderBy: {
              stepNumber: 'asc'
            }
          }
        }
      });

      return workflow;
    } catch (error: any) {
      throw new Error(`Failed to create approval workflow: ${error.message}`);
    }
  }

  /**
   * Get all approval workflows
   */
  static async getAllApprovalWorkflows(module?: string, entityType?: string) {
    try {
      const where: any = {};
      if (module) where.module = module;
      if (entityType) where.entityType = entityType;

      const workflows = await prisma.approvalWorkflow.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          steps: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              },
              department: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            },
            orderBy: {
              stepNumber: 'asc'
            }
          },
          _count: {
            select: {
              requests: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return workflows;
    } catch (error: any) {
      throw new Error(`Failed to get approval workflows: ${error.message}`);
    }
  }

  /**
   * Get approval workflow by ID
   */
  static async getApprovalWorkflowById(id: string) {
    try {
      const workflow = await prisma.approvalWorkflow.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          steps: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              },
              department: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            },
            orderBy: {
              stepNumber: 'asc'
            }
          },
          requests: {
            include: {
              requestedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              approvals: {
                include: {
                  approver: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true
                    }
                  },
                  step: {
                    select: {
                      stepNumber: true,
                      stepName: true,
                      stepType: true
                    }
                  }
                },
                orderBy: {
                  createdAt: 'asc'
                }
              }
            },
            orderBy: {
              requestDate: 'desc'
            }
          }
        }
      });

      if (!workflow) {
        throw new Error("Approval workflow not found");
      }

      return workflow;
    } catch (error: any) {
      throw new Error(`Failed to get approval workflow: ${error.message}`);
    }
  }

  /**
   * Create an approval request
   */
  static async createApprovalRequest(params: CreateApprovalRequestParams) {
    try {
      const { workflowId, entityType, entityId, entityData, requestedById } = params;

      // Get workflow with steps
      const workflow = await prisma.approvalWorkflow.findUnique({
        where: { id: workflowId },
        include: {
          steps: {
            orderBy: {
              stepNumber: 'asc'
            }
          }
        }
      });

      if (!workflow) {
        throw new Error("Approval workflow not found");
      }

      if (!workflow.isActive) {
        throw new Error("Approval workflow is not active");
      }

      // Create approval request
      const request = await prisma.approvalRequest.create({
        data: {
          workflowId,
          entityType,
          entityId,
          entityData,
          requestedById,
          totalSteps: workflow.steps.length,
          currentStep: 1
        },
        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          workflow: {
            select: {
              id: true,
              name: true,
              module: true,
              entityType: true
            }
          }
        }
      });

      // Create initial approval records for the first step
      await this.createApprovalRecords(request.id, workflow.steps[0]);

      return request;
    } catch (error: any) {
      throw new Error(`Failed to create approval request: ${error.message}`);
    }
  }

  /**
   * Create approval records for a step
   */
  private static async createApprovalRecords(requestId: string, step: any) {
    try {
      const approvers = await this.getApproversForStep(step);
      
      if (approvers.length === 0) {
        throw new Error(`No approvers found for step: ${step.stepName}`);
      }

      // Create approval records for each approver
      const approvalRecords = approvers.map(approverId => ({
        requestId,
        stepId: step.id,
        approverId,
        status: 'PENDING'
      }));

      await prisma.approval.createMany({
        data: approvalRecords
      });

      return approvalRecords;
    } catch (error: any) {
      throw new Error(`Failed to create approval records: ${error.message}`);
    }
  }

  /**
   * Get approvers for a step based on step type
   */
  private static async getApproversForStep(step: any): Promise<string[]> {
    const approvers: string[] = [];

    switch (step.stepType) {
      case 'USER':
        if (step.userId) {
          approvers.push(step.userId);
        }
        break;

      case 'ROLE':
        if (step.roleId) {
          const users = await prisma.user.findMany({
            where: { roleId: step.roleId },
            select: { id: true }
          });
          approvers.push(...users.map(u => u.id));
        }
        break;

      case 'DEPARTMENT':
        if (step.departmentId) {
          const users = await prisma.user.findMany({
            where: { departmentId: step.departmentId },
            select: { id: true }
          });
          approvers.push(...users.map(u => u.id));
        }
        break;

      case 'AMOUNT_THRESHOLD':
        // For amount threshold, we need to determine approvers based on the amount
        // This would typically involve checking the entity data for the amount
        // and finding users with appropriate approval limits
        // For now, we'll return an empty array - this would need to be implemented
        // based on your specific business rules
        break;

      default:
        throw new Error(`Unknown step type: ${step.stepType}`);
    }

    return approvers;
  }

  /**
   * Process an approval (approve/reject)
   */
  static async processApproval(params: ProcessApprovalParams) {
    try {
      const { requestId, stepId, approverId, status, comments, delegatedToId } = params;

      // Get the approval record
      const approval = await prisma.approval.findUnique({
        where: {
          requestId_stepId_approverId: {
            requestId,
            stepId,
            approverId
          }
        },
        include: {
          request: {
            include: {
              workflow: {
                include: {
                  steps: {
                    orderBy: {
                      stepNumber: 'asc'
                    }
                  }
                }
              }
            }
          },
          step: true
        }
      });

      if (!approval) {
        throw new Error("Approval record not found");
      }

      if (approval.status !== 'PENDING') {
        throw new Error("Approval has already been processed");
      }

      // Update approval record
      const updateData: any = {
        status,
        comments,
        updatedAt: new Date()
      };

      if (status === 'APPROVED') {
        updateData.approvedAt = new Date();
      } else if (status === 'REJECTED') {
        updateData.rejectedAt = new Date();
      }

      if (delegatedToId) {
        updateData.delegatedToId = delegatedToId;
        updateData.delegatedAt = new Date();
        updateData.status = 'DELEGATED';
      }

      await prisma.approval.update({
        where: {
          requestId_stepId_approverId: {
            requestId,
            stepId,
            approverId
          }
        },
        data: updateData
      });

      // Handle delegation
      if (delegatedToId) {
        await prisma.approval.create({
          data: {
            requestId,
            stepId,
            approverId: delegatedToId,
            status: 'PENDING'
          }
        });
      }

      // Check if step is complete
      if (status === 'APPROVED') {
        await this.checkStepCompletion(requestId, stepId);
      } else if (status === 'REJECTED') {
        await this.rejectApprovalRequest(requestId, comments);
      }

      return approval;
    } catch (error: any) {
      throw new Error(`Failed to process approval: ${error.message}`);
    }
  }

  /**
   * Check if a step is complete and move to next step
   */
  private static async checkStepCompletion(requestId: string, stepId: string) {
    try {
      // Get all approvals for this step
      const approvals = await prisma.approval.findMany({
        where: {
          requestId,
          stepId
        }
      });

      const step = await prisma.approvalStep.findUnique({
        where: { id: stepId }
      });

      if (!step) return;

      // Check if all required approvals are received
      const requiredApprovals = approvals.filter(a => a.status === 'APPROVED');
      const totalRequired = step.isRequired ? approvals.length : 1;

      if (requiredApprovals.length >= totalRequired) {
        // Step is complete, move to next step
        await this.moveToNextStep(requestId);
      }
    } catch (error: any) {
      throw new Error(`Failed to check step completion: ${error.message}`);
    }
  }

  /**
   * Move to next step in the workflow
   */
  private static async moveToNextStep(requestId: string) {
    try {
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          workflow: {
            include: {
              steps: {
                orderBy: {
                  stepNumber: 'asc'
                }
              }
            }
          }
        }
      });

      if (!request) return;

      const nextStepNumber = request.currentStep + 1;
      const nextStep = request.workflow.steps.find(s => s.stepNumber === nextStepNumber);

      if (nextStep) {
        // Move to next step
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            currentStep: nextStepNumber
          }
        });

        // Create approval records for next step
        await this.createApprovalRecords(requestId, nextStep);
      } else {
        // Workflow is complete
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            completedAt: new Date()
          }
        });
      }
    } catch (error: any) {
      throw new Error(`Failed to move to next step: ${error.message}`);
    }
  }

  /**
   * Reject approval request
   */
  private static async rejectApprovalRequest(requestId: string, reason?: string) {
    try {
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectionReason: reason
        }
      });
    } catch (error: any) {
      throw new Error(`Failed to reject approval request: ${error.message}`);
    }
  }

  /**
   * Get approval requests for a user
   */
  static async getApprovalRequestsForUser(userId: string, status?: string) {
    try {
      const where: any = {
        approvals: {
          some: {
            approverId: userId
          }
        }
      };

      if (status) {
        where.status = status;
      }

      const requests = await prisma.approvalRequest.findMany({
        where,
        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          workflow: {
            select: {
              id: true,
              name: true,
              module: true,
              entityType: true
            }
          },
          approvals: {
            where: {
              approverId: userId
            },
            include: {
              step: {
                select: {
                  stepNumber: true,
                  stepName: true,
                  stepType: true
                }
              }
            }
          }
        },
        orderBy: {
          requestDate: 'desc'
        }
      });

      return requests;
    } catch (error: any) {
      throw new Error(`Failed to get approval requests: ${error.message}`);
    }
  }

  /**
   * Get approval workflow by module and entity type
   */
  static async getWorkflowByModuleAndEntity(module: string, entityType: string) {
    try {
      const workflow = await prisma.approvalWorkflow.findFirst({
        where: {
          module,
          entityType,
          isActive: true
        },
        include: {
          steps: {
            orderBy: {
              stepNumber: 'asc'
            }
          }
        }
      });

      return workflow;
    } catch (error: any) {
      throw new Error(`Failed to get workflow: ${error.message}`);
    }
  }
}
