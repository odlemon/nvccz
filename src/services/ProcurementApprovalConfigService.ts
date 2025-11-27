// @ts-nocheck
import { PrismaClient, Decimal } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateProcurementApprovalConfigParams {
  name: string;
  description?: string;
  department?: string;  // NEW! Finance, Operations, Procurement, etc. (null = general/default)
  createdById: string;
  stages: {
    stageType: string; // PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, GRN
    steps: {
      stepNumber: number;
      stepName: string;
      stepType: string; // USER, ROLE, DEPARTMENT, AMOUNT_THRESHOLD
      userId?: string;
      roleId?: string;          // DEPRECATED
      roleCode?: string;        // NEW! Hardcoded role: FIN_MGR, PROC_OFF, etc.
      departmentId?: string;
      amountThreshold?: number;
      isRequired?: boolean;
      canDelegate?: boolean;
      autoApprove?: boolean;
      approvalOrder?: string; // SEQUENTIAL, PARALLEL
    }[];
  }[];
}

export interface CreateApprovalRequestParams {
  configId: string;
  stageType: string; // PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, GRN
  entityId: string;
  entityData?: any;
  requestedById: string;
}

export interface ProcessApprovalParams {
  requestId: string;
  stageId: string;
  approverId: string;
  status: 'APPROVED' | 'REJECTED';
  comments?: string;
  delegatedToId?: string;
  signatureData?: string; // Base64 signature image
}

export class ProcurementApprovalConfigService {
  /**
   * Create a new procurement approval configuration
   */
  static async createProcurementApprovalConfig(params: CreateProcurementApprovalConfigParams) {
    try {
      const { name, description, department, createdById, stages } = params;

      // Validate stages
      if (!stages || stages.length === 0) {
        throw new Error("At least one stage is required");
      }

      // Validate each stage has steps
      for (const stage of stages) {
        if (!stage.steps || stage.steps.length === 0) {
          throw new Error(`Stage ${stage.stageType} must have at least one step`);
        }

        // Validate step numbers are sequential
        const stepNumbers = stage.steps.map(s => s.stepNumber).sort((a, b) => a - b);
        for (let i = 0; i < stepNumbers.length; i++) {
          if (stepNumbers[i] !== i + 1) {
            throw new Error(`Step numbers for ${stage.stageType} must be sequential starting from 1`);
          }
        }
      }

      // Flatten stages - each step becomes a stage record
      const allStages: any[] = [];
      for (const stage of stages) {
        for (const step of stage.steps) {
          allStages.push({
            stageType: stage.stageType,
            stepNumber: step.stepNumber,
            stepName: step.stepName,
            stepType: step.stepType,
            userId: step.userId,
            roleId: step.roleId,           // DEPRECATED - keeping for backwards compatibility
            roleCode: step.roleCode,       // NEW! Hardcoded role
            departmentId: step.departmentId,
            amountThreshold: step.amountThreshold ? new Decimal(step.amountThreshold) : null,
            isRequired: step.isRequired ?? true,
            canDelegate: step.canDelegate ?? false,
            autoApprove: step.autoApprove ?? false,
            approvalOrder: step.approvalOrder ?? 'SEQUENTIAL'
          });
        }
      }

      // Create configuration with stages
      const config = await prisma.procurementApprovalConfig.create({
        data: {
          name,
          description,
          department,  // NEW! Department-specific config
          createdById,
          stages: {
            create: allStages
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
          stages: {
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
            orderBy: [
              { stageType: 'asc' },
              { stepNumber: 'asc' }
            ]
          }
        }
      });

      return config;
    } catch (error: any) {
      throw new Error(`Failed to create procurement approval configuration: ${error.message}`);
    }
  }

  /**
   * Update an existing procurement approval configuration
   * ⚠️ IMPORTANT: System only allows ONE config - this updates that single config
   */
  static async updateProcurementApprovalConfig(id: string, params: CreateProcurementApprovalConfigParams) {
    try {
      // Check if config exists
      const existingConfig = await prisma.procurementApprovalConfig.findUnique({
        where: { id }
      });

      if (!existingConfig) {
        throw new Error("Procurement approval configuration not found");
      }

      const { name, description, department, createdById, stages } = params;

      // Validate stages
      if (!stages || stages.length === 0) {
        throw new Error("At least one stage is required");
      }

      // Validate each stage has steps
      for (const stage of stages) {
        if (!stage.steps || stage.steps.length === 0) {
          throw new Error(`Stage ${stage.stageType} must have at least one step`);
        }

        // Validate step numbers are sequential
        const stepNumbers = stage.steps.map(s => s.stepNumber).sort((a, b) => a - b);
        for (let i = 0; i < stepNumbers.length; i++) {
          if (stepNumbers[i] !== i + 1) {
            throw new Error(`Step numbers for ${stage.stageType} must be sequential starting from 1`);
          }
        }
      }

      const config = await prisma.$transaction(async (tx) => {
        const existingStages = await tx.procurementApprovalStage.findMany({
          where: { configId: id },
          include: {
            _count: {
              select: {
                approvals: true
              }
            }
          }
        });

        const stageMap = new Map<string, typeof existingStages[0]>();
        for (const stage of existingStages) {
          stageMap.set(`${stage.stageType}-${stage.stepNumber}`, stage);
        }

        const processedKeys = new Set<string>();

      for (const stage of stages) {
        for (const step of stage.steps) {
            const key = `${stage.stageType}-${step.stepNumber}`;

            const stageData = {
            stageType: stage.stageType,
            stepNumber: step.stepNumber,
            stepName: step.stepName,
            stepType: step.stepType,
            userId: step.userId,
              roleId: step.roleId,
              roleCode: step.roleCode,
            departmentId: step.departmentId,
            amountThreshold: step.amountThreshold ? new Decimal(step.amountThreshold) : null,
            isRequired: step.isRequired ?? true,
            canDelegate: step.canDelegate ?? false,
            autoApprove: step.autoApprove ?? false,
            approvalOrder: step.approvalOrder ?? 'SEQUENTIAL'
            };

            const existingStage = stageMap.get(key);

            if (existingStage) {
              await tx.procurementApprovalStage.update({
                where: { id: existingStage.id },
                data: stageData
              });
              processedKeys.add(key);
            } else {
              await tx.procurementApprovalStage.create({
                data: {
                  configId: id,
                  ...stageData
                }
              });
              processedKeys.add(key);
            }
          }
        }

        for (const [key, stage] of stageMap.entries()) {
          if (processedKeys.has(key)) continue;

          if (stage._count.approvals > 0) {
            throw new Error(
              `Cannot remove step ${stage.stepNumber} (${stage.stepName}) for stage ${stage.stageType} because approvals already exist.`
            );
          }

          await tx.procurementApprovalStage.delete({
            where: { id: stage.id }
          });
        }

        await tx.procurementApprovalConfig.update({
        where: { id },
        data: {
          name,
          description,
            department
          }
        });

        return tx.procurementApprovalConfig.findUnique({
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
          stages: {
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
            orderBy: [
              { stageType: 'asc' },
              { stepNumber: 'asc' }
            ]
          }
        }
        });
      });

      return config;
    } catch (error: any) {
      throw new Error(`Failed to update procurement approval configuration: ${error.message}`);
    }
  }

  /**
   * Get all procurement approval configurations
   */
  static async getAllProcurementApprovalConfigs() {
    try {
      const configs = await prisma.procurementApprovalConfig.findMany({
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          stages: {
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
            orderBy: [
              { stageType: 'asc' },
              { stepNumber: 'asc' }
            ]
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

      return configs;
    } catch (error: any) {
      throw new Error(`Failed to get procurement approval configurations: ${error.message}`);
    }
  }

  /**
   * Get procurement approval configuration by ID
   */
  static async getProcurementApprovalConfigById(id: string) {
    try {
      const config = await prisma.procurementApprovalConfig.findUnique({
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
          stages: {
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
            orderBy: [
              { stageType: 'asc' },
              { stepNumber: 'asc' }
            ]
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
                  stage: {
                    select: {
                      stepNumber: true,
                      stepName: true,
                      stepType: true,
                      stageType: true
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

      if (!config) {
        throw new Error("Procurement approval configuration not found");
      }

      return config;
    } catch (error: any) {
      throw new Error(`Failed to get procurement approval configuration: ${error.message}`);
    }
  }

  /**
   * Get config by department
   */
  static async getConfigByDepartment(department: string) {
    try {
      const config = await prisma.procurementApprovalConfig.findFirst({
        where: { 
          department,
          isActive: true 
        }
      });
      return config;
    } catch (error: any) {
      throw new Error(`Failed to get config by department: ${error.message}`);
    }
  }

  /**
   * Get active procurement approval configuration
   */
  static async getActiveProcurementApprovalConfig() {
    try {
      const config = await prisma.procurementApprovalConfig.findFirst({
        where: { isActive: true },
        include: {
          stages: {
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
            orderBy: [
              { stageType: 'asc' },
              { stepNumber: 'asc' }
            ]
          }
        }
      });

      return config;
    } catch (error: any) {
      throw new Error(`Failed to get active procurement approval configuration: ${error.message}`);
    }
  }

  /**
   * Create an approval request for a specific stage
   */
  static async createApprovalRequest(params: CreateApprovalRequestParams) {
    try {
      const { configId, stageType, entityId, entityData, requestedById } = params;

      // Get configuration with stages
      const config = await prisma.procurementApprovalConfig.findUnique({
        where: { id: configId },
        include: {
          stages: {
            where: { stageType },
            orderBy: { stepNumber: 'asc' }
          }
        }
      });

      if (!config) {
        throw new Error("Procurement approval configuration not found");
      }

      if (!config.isActive) {
        throw new Error("Procurement approval configuration is not active");
      }

      const stageSteps = config.stages;
      if (stageSteps.length === 0) {
        throw new Error(`No approval steps configured for stage: ${stageType}`);
      }

      // Create approval request
      const request = await prisma.approvalRequest.create({
        data: {
          configId,
          stageType,
          entityId,
          entityData,
          requestedById,
          totalSteps: stageSteps.length,
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
          config: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // Create initial approval records for the first step
      await this.createApprovalRecords(request.id, stageSteps[0]);

      return request;
    } catch (error: any) {
      throw new Error(`Failed to create approval request: ${error.message}`);
    }
  }

  /**
   * Create approval records for a stage step
   */
  private static async createApprovalRecords(requestId: string, stage: any) {
    try {
      const approvers = await this.getApproversForStage(stage);
      
      if (approvers.length === 0) {
        throw new Error(`No approvers found for step: ${stage.stepName}`);
      }

      // Check which approval records already exist
      const existingApprovals = await prisma.approval.findMany({
        where: {
          requestId,
          stageId: stage.id
        },
        select: {
          approverId: true
        }
      });

      const existingApproverIds = new Set(existingApprovals.map(a => a.approverId));
      
      // Filter out approvers that already have approval records
      const newApprovers = approvers.filter(approverId => !existingApproverIds.has(approverId));

      if (newApprovers.length === 0) {
        console.log(`   ℹ️  All approval records already exist for step ${stage.stepNumber}`);
        return existingApprovals.map(a => ({
          requestId,
          stageId: stage.id,
          approverId: a.approverId,
          status: 'PENDING'
        }));
      }

      // Create approval records only for new approvers
      const approvalRecords = newApprovers.map(approverId => ({
        requestId,
        stageId: stage.id,
        approverId,
        status: 'PENDING'
      }));

      await prisma.approval.createMany({
        data: approvalRecords,
        skipDuplicates: true // Skip duplicates if they somehow exist
      });

      console.log(`   ✅ Created ${approvalRecords.length} new approval record(s) for step ${stage.stepNumber}`);

      return approvalRecords;
    } catch (error: any) {
      throw new Error(`Failed to create approval records: ${error.message}`);
    }
  }

  /**
   * Get approvers for a stage based on step type
   */
  private static async getApproversForStage(stage: any): Promise<string[]> {
    const approvers: string[] = [];

    switch (stage.stepType) {
      case 'USER':
        if (stage.userId) {
          approvers.push(stage.userId);
        }
        break;

      case 'ROLE':
        // Use hardcoded roleCode (NEW!) or fallback to roleId (DEPRECATED)
        if (stage.roleCode) {
          const users = await prisma.user.findMany({
            where: { roleCode: stage.roleCode },
            select: { id: true }
          });
          approvers.push(...users.map(u => u.id));
        } else if (stage.roleId) {
          // DEPRECATED: Fallback for backwards compatibility
          const users = await prisma.user.findMany({
            where: { roleId: stage.roleId },
            select: { id: true }
          });
          approvers.push(...users.map(u => u.id));
        }
        break;

      case 'DEPARTMENT':
        if (stage.departmentId) {
          const users = await prisma.user.findMany({
            where: { departmentId: stage.departmentId },
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
        throw new Error(`Unknown step type: ${stage.stepType}`);
    }

    return approvers;
  }

  /**
   * Process an approval (approve/reject)
   */
  static async processApproval(params: ProcessApprovalParams) {
    try {
      const { requestId, stageId, approverId, status, comments, delegatedToId, signatureData } = params;

      // First get the request to get stageType
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        select: { stageType: true }
      });

      if (!request) {
        throw new Error("Approval request not found");
      }

      // Get the approval record
      const approval = await prisma.approval.findUnique({
        where: {
          requestId_stageId_approverId: {
            requestId,
            stageId,
            approverId
          }
        },
        include: {
          request: {
            include: {
              config: {
                include: {
                  stages: {
                    where: { stageType: request.stageType },
                    orderBy: { stepNumber: 'asc' }
                  }
                }
              }
            }
          },
          stage: true,
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              roleCode: true
            }
          }
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
        // Add signature if provided
        if (signatureData) {
          updateData.signatureData = signatureData;
        }
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
          requestId_stageId_approverId: {
            requestId,
            stageId,
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
            stageId,
            approverId: delegatedToId,
            status: 'PENDING'
          }
        });
      }

      // Check if step is complete
      if (status === 'APPROVED') {
        await this.checkStepCompletion(requestId, stageId);
      } else if (status === 'REJECTED') {
        await this.rejectApprovalRequest(requestId, comments);
        // Send rejection email to submitter
        await this.sendRejectionEmailToSubmitter(requestId, comments);
      }

      return approval;
    } catch (error: any) {
      throw new Error(`Failed to process approval: ${error.message}`);
    }
  }

  /**
   * Check if a step is complete and move to next step
   */
  private static async checkStepCompletion(requestId: string, stageId: string) {
    try {
      // Get all approvals for this step
      const approvals = await prisma.approval.findMany({
        where: {
          requestId,
          stageId
        }
      });

      const stage = await prisma.procurementApprovalStage.findUnique({
        where: { id: stageId }
      });

      if (!stage) return;

      // Check if all required approvals are received
      const requiredApprovals = approvals.filter(a => a.status === 'APPROVED');
      const totalRequired = stage.isRequired ? approvals.length : 1;

      if (requiredApprovals.length >= totalRequired) {
        // Step is complete, move to next step
        await this.moveToNextStep(requestId, stage.stageType);
      }
    } catch (error: any) {
      throw new Error(`Failed to check step completion: ${error.message}`);
    }
  }

  /**
   * Move to next step in the workflow
   */
  private static async moveToNextStep(requestId: string, stageType: string) {
    try {
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          config: {
            include: {
              stages: {
                where: { stageType },
                orderBy: { stepNumber: 'asc' }
              }
            }
          }
        }
      });

      if (!request) return;

      const nextStepNumber = request.currentStep + 1;
      const nextStep = request.config.stages.find(s => s.stepNumber === nextStepNumber);

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
        
        // Send email notification to next approvers
        await this.sendApprovalStepNotifications(requestId, nextStep, stageType);
      } else {
        // Workflow is complete
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            completedAt: new Date()
          }
        });

        console.log(`✅ Approval workflow completed for ${stageType}`);
        
        // Update entity status based on stage type
        await this.updateEntityStatusAfterApproval(requestId, stageType);
        
        // Send approval completion email to submitter
        await this.sendApprovalCompletionEmailToSubmitter(requestId, stageType);
      }
    } catch (error: any) {
      throw new Error(`Failed to move to next step: ${error.message}`);
    }
  }

  /**
   * Update entity status after approval workflow is complete
   */
  private static async updateEntityStatusAfterApproval(requestId: string, stageType: string) {
    try {
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        select: { entityId: true, stageType: true }
      });

      if (!request) {
        console.log(`⚠️  Approval request not found: ${requestId}`);
        return;
      }

      console.log(`🔄 Updating entity status after approval...`);
      console.log(`   Stage Type: ${stageType}`);
      console.log(`   Entity ID: ${request.entityId}`);

      switch (stageType) {
        case "PURCHASE_REQUISITION":
          await prisma.purchaseRequisition.update({
            where: { id: request.entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Purchase Requisition ${request.entityId} marked as APPROVED`);
          break;

        case "PURCHASE_ORDER":
          await prisma.purchaseOrder.update({
            where: { id: request.entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Purchase Order ${request.entityId} marked as APPROVED`);
          break;

        case "INVOICE":
          await prisma.procurementInvoice.update({
            where: { id: request.entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Procurement Invoice ${request.entityId} marked as APPROVED`);
          break;

        case "GRN":
          await prisma.goodsReceivedNote.update({
            where: { id: request.entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Goods Received Note ${request.entityId} marked as APPROVED`);
          break;

        default:
          console.log(`   ⚠️  Unknown stage type: ${stageType}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Error updating entity status: ${error.message}`);
      // Don't throw - approval is already complete, this is just a side effect
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
          config: {
            select: {
              id: true,
              name: true
            }
          },
          approvals: {
            where: {
              approverId: userId
            },
            include: {
              stage: {
                select: {
                  stepNumber: true,
                  stepName: true,
                  stepType: true,
                  stageType: true
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
   * Get approval steps for a specific stage type
   */
  static async getApprovalStepsForStage(stageType: string) {
    try {
      const config = await this.getActiveProcurementApprovalConfig();
      
      if (!config) {
        throw new Error("No active procurement approval configuration found");
      }

      const stages = config.stages.filter(s => s.stageType === stageType);
      
      if (stages.length === 0) {
        throw new Error(`No approval steps configured for stage: ${stageType}`);
      }

      return stages;
    } catch (error: any) {
      throw new Error(`Failed to get approval steps: ${error.message}`);
    }
  }

  /**
   * Send approval step notifications to next approvers
   */
  static async sendApprovalStepNotifications(requestId: string, stage: any, stageType: string) {
    try {
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          config: {
            include: {
              stages: {
                where: { stageType },
                orderBy: { stepNumber: 'asc' }
              }
            }
          }
        }
      });

      if (!request) return;

      // Get approvers for this stage
      const approvers = await this.getApproversForStage(stage);
      const approverUsers = await prisma.user.findMany({
        where: { id: { in: approvers } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      });

      // Get entity details based on stageType
      let entityNumber = '';
      let entityTitle = '';
      let department = '';

      switch (stageType) {
        case 'PURCHASE_REQUISITION':
          const requisition = await prisma.purchaseRequisition.findUnique({
            where: { id: request.entityId },
            select: {
              requisitionNumber: true,
              title: true,
              department: true
            }
          });
          if (requisition) {
            entityNumber = requisition.requisitionNumber;
            entityTitle = requisition.title;
            department = requisition.department;
          }
          break;
        case 'PURCHASE_ORDER':
          const po = await prisma.purchaseOrder.findUnique({
            where: { id: request.entityId },
            select: {
              poNumber: true,
              shippingAddress: true
            }
          });
          if (po) {
            entityNumber = po.poNumber;
            entityTitle = po.shippingAddress || 'Purchase Order';
          }
          break;
        case 'INVOICE':
          const invoice = await prisma.procurementInvoice.findUnique({
            where: { id: request.entityId },
            select: {
              invoiceNumber: true,
              vendor: {
                select: {
                  name: true
                }
              }
            }
          });
          if (invoice) {
            entityNumber = invoice.invoiceNumber;
            entityTitle = `Invoice from ${invoice.vendor.name}`;
          }
          break;
        case 'GRN':
          const grn = await prisma.goodsReceivedNote.findUnique({
            where: { id: request.entityId },
            select: {
              grnNumber: true,
              purchaseOrder: {
                select: {
                  poNumber: true
                }
              }
            }
          });
          if (grn) {
            entityNumber = grn.grnNumber;
            entityTitle = `GRN for PO ${grn.purchaseOrder?.poNumber || ''}`;
          }
          break;
      }

      // Send notification to each approver
      const { EmailNotificationService } = await import('./EmailNotificationService');
      for (const approver of approverUsers) {
        try {
          await EmailNotificationService.sendApprovalStepNotification({
            approverName: `${approver.firstName} ${approver.lastName}`,
            approverEmail: approver.email,
            entityType: stageType.replace('_', ' '),
            entityNumber,
            entityTitle,
            stepNumber: stage.stepNumber,
            stepName: stage.stepName,
            totalSteps: request.totalSteps,
            submittedByName: `${request.requestedBy.firstName} ${request.requestedBy.lastName}`,
            submittedByEmail: request.requestedBy.email,
            department: department || 'N/A',
            companyName: 'NVCCZ'
          });
        } catch (emailError: any) {
          console.error(`⚠️  Error sending notification to ${approver.email}:`, emailError.message || emailError);
          // Don't throw - continue with other approvers
        }
      }
    } catch (error: any) {
      console.error("⚠️  Error sending approval step notifications:", error.message || error);
      // Don't throw - email failure shouldn't block approval workflow
    }
  }

  /**
   * Send approval completion email to submitter
   */
  private static async sendApprovalCompletionEmailToSubmitter(requestId: string, stageType: string) {
    try {
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
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
            where: { status: 'APPROVED' },
            orderBy: { approvedAt: 'desc' },
            take: 1,
            include: {
              approver: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!request || request.approvals.length === 0) return;

      const lastApprover = request.approvals[0].approver;

      // Get entity details based on stageType
      let entityNumber = '';
      let entityTitle = '';
      let department = '';

      switch (stageType) {
        case 'PURCHASE_REQUISITION':
          const requisition = await prisma.purchaseRequisition.findUnique({
            where: { id: request.entityId },
            select: {
              requisitionNumber: true,
              title: true,
              department: true
            }
          });
          if (requisition) {
            entityNumber = requisition.requisitionNumber;
            entityTitle = requisition.title;
            department = requisition.department;
          }
          break;
        case 'PURCHASE_ORDER':
          const po = await prisma.purchaseOrder.findUnique({
            where: { id: request.entityId },
            select: {
              poNumber: true,
              shippingAddress: true
            }
          });
          if (po) {
            entityNumber = po.poNumber;
            entityTitle = po.shippingAddress || 'Purchase Order';
          }
          break;
        case 'INVOICE':
          const invoice = await prisma.procurementInvoice.findUnique({
            where: { id: request.entityId },
            select: {
              invoiceNumber: true,
              vendor: {
                select: {
                  name: true
                }
              }
            }
          });
          if (invoice) {
            entityNumber = invoice.invoiceNumber;
            entityTitle = `Invoice from ${invoice.vendor.name}`;
          }
          break;
        case 'GRN':
          const grn = await prisma.goodsReceivedNote.findUnique({
            where: { id: request.entityId },
            select: {
              grnNumber: true,
              purchaseOrder: {
                select: {
                  poNumber: true
                }
              }
            }
          });
          if (grn) {
            entityNumber = grn.grnNumber;
            entityTitle = `GRN for PO ${grn.purchaseOrder?.poNumber || ''}`;
          }
          break;
      }

      const { EmailNotificationService } = await import('./EmailNotificationService');
      await EmailNotificationService.sendRequisitionApprovedToSubmitter({
        submitterName: `${request.requestedBy.firstName} ${request.requestedBy.lastName}`,
        submitterEmail: request.requestedBy.email,
        requisitionNumber: entityNumber,
        title: entityTitle,
        department: department || 'N/A',
        approvedByName: `${lastApprover.firstName} ${lastApprover.lastName}`,
        approvedByEmail: lastApprover.email,
        companyName: 'NVCCZ'
      });
    } catch (error: any) {
      console.error("⚠️  Error sending approval completion email:", error.message || error);
      // Don't throw - email failure shouldn't block approval workflow
    }
  }

  /**
   * Send rejection email to submitter
   */
  private static async sendRejectionEmailToSubmitter(requestId: string, rejectionReason?: string) {
    try {
      const request = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
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
            where: { status: 'REJECTED' },
            orderBy: { rejectedAt: 'desc' },
            take: 1,
            include: {
              approver: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!request || request.approvals.length === 0) return;

      const rejector = request.approvals[0].approver;
      const stageType = request.stageType;

      // Get entity details based on stageType
      let entityNumber = '';
      let entityTitle = '';
      let department = '';

      switch (stageType) {
        case 'PURCHASE_REQUISITION':
          const requisition = await prisma.purchaseRequisition.findUnique({
            where: { id: request.entityId },
            select: {
              requisitionNumber: true,
              title: true,
              department: true
            }
          });
          if (requisition) {
            entityNumber = requisition.requisitionNumber;
            entityTitle = requisition.title;
            department = requisition.department;
          }
          break;
        case 'PURCHASE_ORDER':
          const po = await prisma.purchaseOrder.findUnique({
            where: { id: request.entityId },
            select: {
              poNumber: true,
              shippingAddress: true
            }
          });
          if (po) {
            entityNumber = po.poNumber;
            entityTitle = po.shippingAddress || 'Purchase Order';
          }
          break;
        case 'INVOICE':
          const invoice = await prisma.procurementInvoice.findUnique({
            where: { id: request.entityId },
            select: {
              invoiceNumber: true,
              vendor: {
                select: {
                  name: true
                }
              }
            }
          });
          if (invoice) {
            entityNumber = invoice.invoiceNumber;
            entityTitle = `Invoice from ${invoice.vendor.name}`;
          }
          break;
        case 'GRN':
          const grn = await prisma.goodsReceivedNote.findUnique({
            where: { id: request.entityId },
            select: {
              grnNumber: true,
              purchaseOrder: {
                select: {
                  poNumber: true
                }
              }
            }
          });
          if (grn) {
            entityNumber = grn.grnNumber;
            entityTitle = `GRN for PO ${grn.purchaseOrder?.poNumber || ''}`;
          }
          break;
      }

      const { EmailNotificationService } = await import('./EmailNotificationService');
      await EmailNotificationService.sendRequisitionRejectedToSubmitter({
        submitterName: `${request.requestedBy.firstName} ${request.requestedBy.lastName}`,
        submitterEmail: request.requestedBy.email,
        requisitionNumber: entityNumber,
        title: entityTitle,
        department: department || 'N/A',
        rejectedByName: `${rejector.firstName} ${rejector.lastName}`,
        rejectedByEmail: rejector.email,
        rejectionReason,
        companyName: 'NVCCZ'
      });
    } catch (error: any) {
      console.error("⚠️  Error sending rejection email:", error.message || error);
      // Don't throw - email failure shouldn't block rejection workflow
    }
  }

  /**
   * Delete all procurement approval configurations
   */
  static async deleteAllProcurementApprovalConfigs() {
    try {
      // Delete all configs (stages will be cascade deleted)
      const result = await prisma.procurementApprovalConfig.deleteMany({});
      return result;
    } catch (error: any) {
      throw new Error(`Failed to delete all procurement approval configurations: ${error.message}`);
    }
  }
}
