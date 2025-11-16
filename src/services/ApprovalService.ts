// @ts-nocheck
import { prisma } from "../utils/database";
import { Department, DepartmentRole } from "./ProcurementService";

export class ApprovalService {
  /**
   * Create approval request and approval records when an entity (requisition, PO, etc.) is submitted
   */
  static async createApprovalRequest(params: {
    stageType: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN";
    entityId: string;
    entityData?: any;
    requestedById: string;
    department?: Department; // For department-based filtering
  }) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📝 CREATING APPROVAL REQUEST");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`🔖 Stage Type: ${params.stageType}`);
      console.log(`🆔 Entity ID: ${params.entityId}`);
      console.log(`👤 Requested By: ${params.requestedById}`);
      console.log(`🏢 Department: ${params.department || 'N/A'}`);
      console.log("");

      // Get active approval configuration for the specific department
      // Try department-specific config first, then fall back to general config (department = null)
      const config = await prisma.procurementApprovalConfig.findFirst({
        where: { 
          isActive: true,
          OR: [
            { department: params.department as any },  // Department-specific config
            { department: null }                       // General/default config
          ]
        },
        orderBy: [
          { department: params.department ? 'desc' : 'asc' },  // Prioritize department-specific
        ],
        include: {
          stages: {
            where: { 
              stageType: params.stageType
              // Don't filter by requiredUserDepartment here - stages can belong to any department
              // The config itself is already filtered by department
            },
            orderBy: { stepNumber: 'asc' },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  userDepartment: true,
                  departmentRole: true
                }
              },
              role: {
                select: {
                  id: true,
                  name: true
                }
              },
              department: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!config) {
        throw new Error(`No active approval configuration found for ${params.department || 'any'} department`);
      }

      // Log which config is being used
      console.log(`✅ Using approval config: "${config.name}"`);
      console.log(`   Config Department: ${config.department || 'General (All Departments)'}`);
      console.log("");

      const stages = config.stages;

      if (stages.length === 0) {
        console.log(`⚠️  No approval stages configured for ${params.stageType}${params.department ? ` in ${params.department} department` : ''}`);
        console.log("   Entity will be auto-approved.");
        console.log("════════════════════════════════════════════════════════════════");
        console.log("");
        return null;
      }

      console.log(`📋 Found ${stages.length} approval stage(s) configured`);
      console.log("");

      // Create approval request and approval records in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create approval request
        const approvalRequest = await tx.approvalRequest.create({
          data: {
            configId: config.id,
            stageType: params.stageType,
            entityId: params.entityId,
            entityData: params.entityData || {},
            requestedById: params.requestedById,
            status: "PENDING",
            currentStep: 1,
            totalSteps: stages.length
          }
        });

        console.log(`✅ Approval request created: ${approvalRequest.id}`);
        console.log("");

        // Create approval records for each stage
        const approvals = [];
        for (const stage of stages) {
          // Determine approver(s) based on stepType
          let approverIds: string[] = [];

          if (stage.stepType === "USER" && stage.userId) {
            // Validate user meets department and role requirements
            if (stage.requiredUserDepartment || stage.requiredDepartmentRole) {
              const user = stage.user;
              
              if (stage.requiredUserDepartment && user?.userDepartment !== stage.requiredUserDepartment) {
                console.log(`⚠️  Stage ${stage.stepNumber} user ${user?.email} not in required department ${stage.requiredUserDepartment}`);
                continue;
              }
              
              if (stage.requiredDepartmentRole && user?.departmentRole !== stage.requiredDepartmentRole) {
                console.log(`⚠️  Stage ${stage.stepNumber} user ${user?.email} does not have required role ${stage.requiredDepartmentRole}`);
                continue;
              }
            }
            
            approverIds.push(stage.userId);
          } else if (stage.stepType === "ROLE" && (stage.roleCode || stage.roleId)) {
            // Get all users with this roleCode (preferred) or roleId (deprecated)
            const usersWithRole = await tx.user.findMany({
              where: { 
                ...(stage.roleCode ? { roleCode: stage.roleCode } : { roleId: stage.roleId }),
                // Filter by department if required
                ...(stage.requiredUserDepartment ? { userDepartment: stage.requiredUserDepartment } : {}),
                ...(stage.requiredDepartmentRole ? { departmentRole: stage.requiredDepartmentRole } : {})
              },
              select: { 
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                roleCode: true
              }
            });
            approverIds = usersWithRole.map(u => u.id);
            console.log(`   📋 Found ${usersWithRole.length} user(s) with ${stage.roleCode ? `roleCode="${stage.roleCode}"` : `roleId="${stage.roleId}"`}`);
            if (usersWithRole.length > 0) {
              usersWithRole.forEach(u => {
                console.log(`      - ${u.firstName} ${u.lastName} (${u.email}) [${u.roleCode || 'no roleCode'}]`);
              });
            }
          } else if (stage.stepType === "DEPARTMENT" && stage.departmentId) {
            // Get department head/deputy
            const deptUsers = await tx.user.findMany({
              where: {
                departmentId: stage.departmentId,
                ...(stage.requiredDepartmentRole ? { departmentRole: stage.requiredDepartmentRole } : {})
              },
              select: { id: true }
            });
            approverIds = deptUsers.map(u => u.id);
          } else if (stage.stepType === "AMOUNT_THRESHOLD") {
            // For amount-based approval, we'll need to dynamically assign based on entity amount
            // For now, skip this - implement later if needed
            console.log(`⚠️  AMOUNT_THRESHOLD stage type not yet implemented for stage ${stage.stepNumber}`);
            continue;
          }

          // Create approval records for each approver
          for (const approverId of approverIds) {
            const approval = await tx.approval.create({
              data: {
                requestId: approvalRequest.id,
                stageId: stage.id,
                approverId: approverId,
                status: stage.stepNumber === 1 ? "PENDING" : "PENDING" // First step is immediately pending
              }
            });
            approvals.push(approval);
            console.log(`   ✅ Approval created for user ${approverId} at step ${stage.stepNumber}`);
          }
        }

        console.log("");
        console.log(`✅ Created ${approvals.length} approval record(s)`);
        console.log("════════════════════════════════════════════════════════════════");
        console.log("");

        return { approvalRequest, approvals };
      });

      return result;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR CREATING APPROVAL REQUEST");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Get pending approvals for a specific user
   */
  static async getMyPendingApprovals(userId: string) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📋 FETCHING MY PENDING APPROVALS");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`👤 User ID: ${userId}`);
      console.log("");

      const approvals = await prisma.approval.findMany({
        where: {
          approverId: userId,
          status: "PENDING",
          request: {
            status: "PENDING"
          }
        },
        include: {
          request: {
            include: {
              requestedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          stage: {
            select: {
              stepNumber: true,
              stepName: true,
              stageType: true,
              requiredUserDepartment: true,
              requiredDepartmentRole: true
            }
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: [
          { request: { requestDate: 'desc' } },
          { stage: { stepNumber: 'asc' } }
        ]
      });

      console.log(`✅ Found ${approvals.length} pending approval(s)`);
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return approvals;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR FETCHING MY PENDING APPROVALS");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Approve an approval
   */
  static async approveApproval(params: {
    approvalId: string;
    approverId: string;
    comments?: string;
    signatureData?: string;
  }) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("✅ APPROVING APPROVAL");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`🆔 Approval ID: ${params.approvalId}`);
      console.log(`👤 Approver ID: ${params.approverId}`);
      console.log(`💬 Comments: ${params.comments || 'None'}`);
      console.log("");

      const result = await prisma.$transaction(async (tx) => {
        // Get the approval with request and stage info
        const approval = await tx.approval.findUnique({
          where: { id: params.approvalId },
          include: {
            request: {
              include: {
                approvals: {
                  include: {
                    stage: true
                  },
                  orderBy: {
                    stage: { stepNumber: 'asc' }
                  }
                }
              }
            },
            stage: true
          }
        });

        if (!approval) {
          throw new Error("Approval not found");
        }

        if (approval.approverId !== params.approverId) {
          throw new Error("You are not authorized to approve this request");
        }

        if (approval.status !== "PENDING") {
          throw new Error(`Approval already ${approval.status.toLowerCase()}`);
        }

        if (approval.request.status !== "PENDING") {
          throw new Error(`Approval request already ${approval.request.status.toLowerCase()}`);
        }

        // Update approval status
        const updatedApproval = await tx.approval.update({
          where: { id: params.approvalId },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            comments: params.comments,
            signatureData: params.signatureData
          }
        });

        console.log(`✅ Approval ${params.approvalId} marked as APPROVED`);

        // Check if this was the last step
        const currentStepNumber = approval.stage.stepNumber;
        const allApprovalsForRequest = approval.request.approvals;
        
        // Get all approvals up to and including current step
        const approvalsUpToCurrentStep = allApprovalsForRequest.filter(
          a => a.stage.stepNumber <= currentStepNumber
        );

        // Check if all approvals up to current step are approved
        const allCurrentStepApproved = approvalsUpToCurrentStep.every(
          a => a.status === "APPROVED" || a.id === params.approvalId
        );

        console.log(`📊 Current step: ${currentStepNumber} / ${approval.request.totalSteps}`);
        console.log(`📊 Approvals up to current step: ${approvalsUpToCurrentStep.length}`);
        console.log(`📊 All current step approved: ${allCurrentStepApproved}`);

        let updatedRequest;

        if (allCurrentStepApproved && currentStepNumber === approval.request.totalSteps) {
          // This was the last step - mark request as approved
          updatedRequest = await tx.approvalRequest.update({
            where: { id: approval.requestId },
            data: {
              status: "APPROVED",
              completedAt: new Date()
            }
          });

          console.log(`✅ All approvals complete - Request ${approval.requestId} marked as APPROVED`);

          // Update the entity status based on stageType
          await this.updateEntityStatusAfterApproval(tx, approval.request.stageType, approval.request.entityId);
        } else if (allCurrentStepApproved && currentStepNumber < approval.request.totalSteps) {
          // Move to next step
          updatedRequest = await tx.approvalRequest.update({
            where: { id: approval.requestId },
            data: {
              currentStep: currentStepNumber + 1
            }
          });

          console.log(`➡️  Moving to next step: ${currentStepNumber + 1}`);
        } else {
          updatedRequest = approval.request;
        }

        console.log("════════════════════════════════════════════════════════════════");
        console.log("");

        return { approval: updatedApproval, request: updatedRequest };
      });

      return result;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR APPROVING APPROVAL");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Reject an approval
   */
  static async rejectApproval(params: {
    approvalId: string;
    approverId: string;
    comments: string;
  }) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("❌ REJECTING APPROVAL");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`🆔 Approval ID: ${params.approvalId}`);
      console.log(`👤 Approver ID: ${params.approverId}`);
      console.log(`💬 Comments: ${params.comments}`);
      console.log("");

      if (!params.comments) {
        throw new Error("Comments are required when rejecting an approval");
      }

      const result = await prisma.$transaction(async (tx) => {
        // Get the approval with request info
        const approval = await tx.approval.findUnique({
          where: { id: params.approvalId },
          include: {
            request: true,
            stage: true
          }
        });

        if (!approval) {
          throw new Error("Approval not found");
        }

        if (approval.approverId !== params.approverId) {
          throw new Error("You are not authorized to reject this request");
        }

        if (approval.status !== "PENDING") {
          throw new Error(`Approval already ${approval.status.toLowerCase()}`);
        }

        if (approval.request.status !== "PENDING") {
          throw new Error(`Approval request already ${approval.request.status.toLowerCase()}`);
        }

        // Update approval status
        const updatedApproval = await tx.approval.update({
          where: { id: params.approvalId },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            comments: params.comments
          }
        });

        console.log(`❌ Approval ${params.approvalId} marked as REJECTED`);

        // Update approval request status
        const updatedRequest = await tx.approvalRequest.update({
          where: { id: approval.requestId },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            rejectionReason: params.comments
          }
        });

        console.log(`❌ Request ${approval.requestId} marked as REJECTED`);

        // Update the entity status based on stageType
        await this.updateEntityStatusAfterRejection(tx, approval.request.stageType, approval.request.entityId, params.comments);

        console.log("════════════════════════════════════════════════════════════════");
        console.log("");

        return { approval: updatedApproval, request: updatedRequest };
      });

      return result;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR REJECTING APPROVAL");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Update entity status after approval is complete
   */
  private static async updateEntityStatusAfterApproval(tx: any, stageType: string, entityId: string) {
    try {
      console.log(`🔄 Updating entity status after approval...`);
      console.log(`   Stage Type: ${stageType}`);
      console.log(`   Entity ID: ${entityId}`);

      switch (stageType) {
        case "PURCHASE_REQUISITION":
          await tx.purchaseRequisition.update({
            where: { id: entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Purchase Requisition ${entityId} marked as APPROVED`);
          break;

        case "PURCHASE_ORDER":
          await tx.purchaseOrder.update({
            where: { id: entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Purchase Order ${entityId} marked as APPROVED`);
          break;

        case "INVOICE":
          await tx.procurementInvoice.update({
            where: { id: entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Procurement Invoice ${entityId} marked as APPROVED`);
          break;

        case "GRN":
          await tx.goodsReceivedNote.update({
            where: { id: entityId },
            data: { status: "APPROVED" }
          });
          console.log(`   ✅ Goods Received Note ${entityId} marked as APPROVED`);
          break;

        default:
          console.log(`   ⚠️  Unknown stage type: ${stageType}`);
      }
    } catch (error) {
      console.error(`   ❌ Error updating entity status:`, error);
      throw error;
    }
  }

  /**
   * Update entity status after rejection
   */
  private static async updateEntityStatusAfterRejection(tx: any, stageType: string, entityId: string, reason: string) {
    try {
      console.log(`🔄 Updating entity status after rejection...`);
      console.log(`   Stage Type: ${stageType}`);
      console.log(`   Entity ID: ${entityId}`);

      switch (stageType) {
        case "PURCHASE_REQUISITION":
          await tx.purchaseRequisition.update({
            where: { id: entityId },
            data: { 
              status: "REJECTED",
              rejectionReason: reason
            }
          });
          console.log(`   ❌ Purchase Requisition ${entityId} marked as REJECTED`);
          break;

        case "PURCHASE_ORDER":
          await tx.purchaseOrder.update({
            where: { id: entityId },
            data: { status: "REJECTED" }
          });
          console.log(`   ❌ Purchase Order ${entityId} marked as REJECTED`);
          break;

        case "INVOICE":
          await tx.procurementInvoice.update({
            where: { id: entityId },
            data: { status: "REJECTED" }
          });
          console.log(`   ❌ Procurement Invoice ${entityId} marked as REJECTED`);
          break;

        case "GRN":
          await tx.goodsReceivedNote.update({
            where: { id: entityId },
            data: { status: "REJECTED" }
          });
          console.log(`   ❌ Goods Received Note ${entityId} marked as REJECTED`);
          break;

        default:
          console.log(`   ⚠️  Unknown stage type: ${stageType}`);
      }
    } catch (error) {
      console.error(`   ❌ Error updating entity status:`, error);
      throw error;
    }
  }
}


