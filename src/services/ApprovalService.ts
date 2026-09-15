// @ts-nocheck
import { prisma } from "../utils/database";
import { isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { persistProcurementEntityRejection } from "../utils/procurementRejectionPersistence";
import { Department, DepartmentRole } from "./ProcurementService";

const PROCUREMENT_APPROVAL_STAGES = new Set([
  "PURCHASE_REQUISITION",
  "PURCHASE_ORDER",
  "INVOICE",
  "GRN",
]);

async function approverCanActOnApproval(
  tx: any,
  approval: { approverId: string; request?: { stageType?: string } | null },
  approverId: string
): Promise<boolean> {
  if (approval.approverId === approverId) return true;
  const approver = await tx.user.findUnique({
    where: { id: approverId },
    include: { role: true },
  });
  if (!isModulePrivilegedUser(approver)) return false;
  return PROCUREMENT_APPROVAL_STAGES.has(String(approval.request?.stageType || ""));
}

export class ApprovalService {
  /**
   * Create approval request and approval records when an entity (requisition, PO, etc.) is submitted
   */
  static async createApprovalRequest(params: {
    stageType:
      | "PURCHASE_REQUISITION"
      | "PURCHASE_ORDER"
      | "INVOICE"
      | "GRN"
      | "MASTER_DATA_COA"
      | "PAYMENT_EXECUTION"
      | "INVESTMENT_BOOKING";
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
          // Only consider configs that actually have a stage for this stageType — otherwise findFirst
          // can return an unrelated active config (e.g. one scoped to a different stageType entirely),
          // whose stages sub-filter below would then come back empty and silently fall through to the
          // "no stages configured, auto-approve" branch instead of finding the real config.
          stages: { some: { stageType: params.stageType } },
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
        const isProcurementStage = PROCUREMENT_APPROVAL_STAGES.has(params.stageType);
        // What an amount condition is measured against: the requisition's or the purchase order's total.
        let entityAmount = 0;
        if (params.stageType === "PURCHASE_ORDER") {
          const po = await tx.purchaseOrder.findUnique({
            where: { id: params.entityId },
            select: { totalAmount: true },
          });
          entityAmount = po ? Number(po.totalAmount) : 0;
        } else if (params.stageType === "PURCHASE_REQUISITION") {
          const pr = await tx.purchaseRequisition.findUnique({
            where: { id: params.entityId },
            select: { totalAmount: true },
          });
          entityAmount = pr ? Number(pr.totalAmount) : 0;
        }
        for (const stage of stages) {
          // Determine approver(s) based on stepType
          let approverIds: string[] = [];

          // A procurement step carrying an amount applies only above it: a larger requisition needs a further level
          // (SRD §3). AMOUNT_THRESHOLD steps always meant this; a department, role or named-person step may carry it too.
          if (
            isProcurementStage &&
            stage.stepType !== "AMOUNT_THRESHOLD" &&
            stage.amountThreshold != null &&
            entityAmount <= Number(stage.amountThreshold)
          ) {
            console.log(`   ⏭️  Step ${stage.stepNumber} applies above ${Number(stage.amountThreshold)}; amount ${entityAmount}, not needed`);
            continue;
          }

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
          } else if (stage.stepType === "DEPARTMENT") {
            const departmentUsers = async (where: any) => {
              const found = await tx.user.findMany({
                where: {
                  ...where,
                  ...(stage.requiredDepartmentRole ? { departmentRole: stage.requiredDepartmentRole } : {}),
                },
                select: { id: true },
              });
              // A procurement department with no head is decided by its deputy, as the default route always has been.
              if (!found.length && isProcurementStage && stage.requiredDepartmentRole === "HEAD") {
                return tx.user.findMany({ where: { ...where, departmentRole: "DEPUTY" }, select: { id: true } });
              }
              return found;
            };
            if (stage.departmentId) {
              approverIds = (await departmentUsers({ departmentId: stage.departmentId })).map((u) => u.id);
            } else if (stage.requiredUserDepartment) {
              approverIds = (await departmentUsers({ userDepartment: stage.requiredUserDepartment })).map((u) => u.id);
            } else if (isProcurementStage && params.department) {
              // No fixed department: the head of the department the request is raised for.
              approverIds = (await departmentUsers({ userDepartment: params.department })).map((u) => u.id);
            }
          } else if (stage.stepType === "AMOUNT_THRESHOLD") {
            const threshold =
              stage.amountThreshold != null ? Number(stage.amountThreshold) : Number.POSITIVE_INFINITY;
            if (entityAmount <= threshold) {
              console.log(
                `   ⏭️  AMOUNT_THRESHOLD: amount ${entityAmount} ≤ ${threshold} — skipping CFO step ${stage.stepNumber}`
              );
              continue;
            }
            const roleToUse = stage.roleCode || "CFO";
            const cfoUsers = await tx.user.findMany({
              where: { roleCode: roleToUse },
              select: { id: true },
            });
            approverIds = cfoUsers.map((u) => u.id);
            console.log(
              `   📋 AMOUNT_THRESHOLD: amount ${entityAmount} > ${threshold} — routing to role ${roleToUse} (${approverIds.length} user(s))`
            );
          }

          // A requisition step nobody can decide would leave the requisition waiting for ever. Refuse the submission
          // and name the step, so the requester can say what is missing and an administrator can put it right.
          if (params.stageType === "PURCHASE_REQUISITION" && approverIds.length === 0) {
            throw new Error(
              `Nobody can approve step ${stage.stepNumber} of the requisition approval route ("${stage.stepName}")` +
                `${params.department ? ` for the ${params.department} department` : ""}. ` +
                `An administrator can assign someone or change the approval matrix in Procurement, Configuration.`
            );
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

        if (params.stageType === "PURCHASE_REQUISITION" && approvals.length === 0) {
          throw new Error(
            "No step of the requisition approval route applies to this requisition. An administrator must give the route a first step that applies to every requisition."
          );
        }
        if (isProcurementStage && approvals.length > 0) {
          // The steps this request actually has. A step whose amount condition did not apply is not a step of this
          // request, so "step 2 of 2" never counts a level that will not come, and the request cannot wait on it.
          const steps = [...new Set(approvals.map((a) => stages.find((s) => s.id === a.stageId)?.stepNumber))]
            .filter((n) => n != null)
            .sort((a, b) => a - b);
          await tx.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: { totalSteps: steps.length, currentStep: steps[0] },
          });
          approvalRequest.totalSteps = steps.length;
          approvalRequest.currentStep = steps[0];
        }

        console.log("");
        console.log(`✅ Created ${approvals.length} approval record(s)`);
        console.log("════════════════════════════════════════════════════════════════");
        console.log("");

        return { approvalRequest, approvals };
      });

      // After commit: notify first-step approvers (pending rows visible; sendApprovalStepNotifications reads DB)
      if (params.stageType === "PURCHASE_REQUISITION") {
        // The requisition route tells the approvers of its first step, in the app and by email, which step they decide.
        const { ProcurementRequisitionApprovalService } = await import("./ProcurementRequisitionApprovalService");
        await ProcurementRequisitionApprovalService.notifyCurrentStepQuietly(result.approvalRequest.id);
        return result;
      }
      try {
        const firstStage = stages.find((s) => s.stepNumber === 1);
        if (firstStage && result.approvals.length > 0) {
          const firstStepApprovals = result.approvals.filter((a) => {
            const approvalStage = stages.find((s) => s.id === a.stageId);
            return approvalStage && approvalStage.stepNumber === 1;
          });

          if (firstStepApprovals.length > 0) {
            const { ProcurementApprovalConfigService } = await import("./ProcurementApprovalConfigService");
            await ProcurementApprovalConfigService.sendApprovalStepNotifications(
              result.approvalRequest.id,
              firstStage,
              params.stageType
            );
          }
        }
      } catch (emailError: any) {
        console.error("⚠️  Error sending initial approval notifications:", emailError.message || emailError);
      }

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

      // A procurement request is decided one step at a time: an approver on a later step sees it once the earlier
      // steps are decided, not the moment it is submitted.
      const procurementRequestIds = [
        ...new Set(approvals.filter((a) => PROCUREMENT_APPROVAL_STAGES.has(String(a.request.stageType))).map((a) => a.requestId)),
      ];
      if (procurementRequestIds.length) {
        const waitingStep = new Map();
        const pendingRows = await prisma.approval.findMany({
          where: { requestId: { in: procurementRequestIds }, status: "PENDING" },
          select: { requestId: true, stage: { select: { stepNumber: true } } },
        });
        for (const r of pendingRows) {
          waitingStep.set(r.requestId, Math.min(waitingStep.get(r.requestId) ?? Infinity, r.stage.stepNumber));
        }
        const due = approvals.filter(
          (a) => !PROCUREMENT_APPROVAL_STAGES.has(String(a.request.stageType)) || a.stage.stepNumber === waitingStep.get(a.requestId)
        );
        approvals.splice(0, approvals.length, ...due);
      }

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

        if (!(await approverCanActOnApproval(tx, approval, params.approverId))) {
          throw new Error("You are not authorized to approve this request");
        }

        if (approval.status !== "PENDING") {
          throw new Error(`Approval already ${approval.status.toLowerCase()}`);
        }

        if (approval.request.status !== "PENDING") {
          throw new Error(`Approval request already ${approval.request.status.toLowerCase()}`);
        }

        const procurementRoute = PROCUREMENT_APPROVAL_STAGES.has(String(approval.request.stageType));
        if (procurementRoute) {
          // Steps are decided in order: an approver on a later step cannot decide before the earlier step has.
          const waiting = approval.request.approvals.filter((a) => a.status === "PENDING").map((a) => a.stage.stepNumber);
          if (waiting.length && approval.stage.stepNumber > Math.min(...waiting)) {
            throw new Error("This approval is not due yet: an earlier step of the approval route has not been decided.");
          }
        }

        // Update approval status
        const updatedApproval = await tx.approval.update({
          where: { id: params.approvalId },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            comments: params.comments,
            signatureData: params.signatureData,
            // An administrator deciding a step assigned to someone else is recorded as the person who acted.
            ...(approval.approverId !== params.approverId ? { delegatedToId: params.approverId, delegatedAt: new Date() } : {}),
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

        if (procurementRoute) {
          // One decision settles a step: whichever of the step's approvers acts first decides it, and the step's other
          // rows close. The request then waits on the next step that has approvers, or is approved when none is left.
          await tx.approval.updateMany({
            where: { requestId: approval.requestId, stageId: approval.stageId, status: "PENDING", id: { not: params.approvalId } },
            data: { status: "SKIPPED", comments: "Decided by another approver on this step" },
          });
          const later = approval.request.approvals
            .filter((a) => a.status === "PENDING" && a.stage.stepNumber > currentStepNumber)
            .map((a) => a.stage.stepNumber);
          if (later.length) {
            updatedRequest = await tx.approvalRequest.update({
              where: { id: approval.requestId },
              data: { currentStep: Math.min(...later) },
            });
          } else {
            updatedRequest = await tx.approvalRequest.update({
              where: { id: approval.requestId },
              data: { status: "APPROVED", completedAt: new Date() },
            });
            await this.updateEntityStatusAfterApproval(
              tx,
              approval.request.stageType,
              approval.request.entityId,
              approval.request.entityData,
              approval.request.requestedById
            );
          }
        } else if (allCurrentStepApproved && currentStepNumber === approval.request.totalSteps) {
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
          await this.updateEntityStatusAfterApproval(
            tx,
            approval.request.stageType,
            approval.request.entityId,
            approval.request.entityData,
            approval.request.requestedById
          );
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

        return {
          approval: updatedApproval,
          request: updatedRequest,
          _stageType: approval.request.stageType,
          _entityId: approval.request.entityId,
        };
      });

      if (result._stageType === "PURCHASE_REQUISITION" && result.request?.id) {
        const { ProcurementRequisitionApprovalService } = await import("./ProcurementRequisitionApprovalService");
        await ProcurementRequisitionApprovalService.afterDecisionQuietly(result.request.id, {
          actorId: params.approverId,
          outcome: result.request.status === "APPROVED" ? "APPROVED" : "STEP_APPROVED",
        });
      }

      if (result.request?.status === "APPROVED" && result._stageType === "GRN" && result._entityId) {
        const { VendorRatingService } = await import("./VendorRatingService");
        try {
          await VendorRatingService.recalculateForGrnEntity(result._entityId);
        } catch (e) {
          console.error("VendorRatingService.recalculateForGrnEntity:", e);
        }
      }

      return { approval: result.approval, request: result.request };
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

        if (!(await approverCanActOnApproval(tx, approval, params.approverId))) {
          throw new Error("You are not authorized to reject this request");
        }

        if (approval.status !== "PENDING") {
          throw new Error(`Approval already ${approval.status.toLowerCase()}`);
        }

        if (approval.request.status !== "PENDING") {
          throw new Error(`Approval request already ${approval.request.status.toLowerCase()}`);
        }

        const procurementRoute = PROCUREMENT_APPROVAL_STAGES.has(String(approval.request.stageType));
        if (procurementRoute) {
          const waiting = await tx.approval.findMany({
            where: { requestId: approval.requestId, status: "PENDING" },
            select: { stage: { select: { stepNumber: true } } },
          });
          const current = waiting.length ? Math.min(...waiting.map((a) => a.stage.stepNumber)) : approval.stage.stepNumber;
          if (approval.stage.stepNumber > current) {
            throw new Error("This approval is not due yet: an earlier step of the approval route has not been decided.");
          }
        }

        // Update approval status
        const updatedApproval = await tx.approval.update({
          where: { id: params.approvalId },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            comments: params.comments,
            ...(approval.approverId !== params.approverId ? { delegatedToId: params.approverId, delegatedAt: new Date() } : {}),
          }
        });
        if (procurementRoute) {
          // A rejection ends the route; nobody else is left waiting to decide it.
          await tx.approval.updateMany({
            where: { requestId: approval.requestId, status: "PENDING" },
            data: { status: "CANCELLED", comments: "Closed: the request was rejected" },
          });
        }

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

      if (result.request?.stageType === "PURCHASE_REQUISITION") {
        const { ProcurementRequisitionApprovalService } = await import("./ProcurementRequisitionApprovalService");
        await ProcurementRequisitionApprovalService.afterDecisionQuietly(result.request.id, {
          actorId: params.approverId,
          outcome: "REJECTED",
          reason: params.comments,
        });
      }

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
  private static async updateEntityStatusAfterApproval(tx: any, stageType: string, entityId: string, entityData?: any, requestedById?: string) {
    try {
      console.log(`🔄 Updating entity status after approval...`);
      console.log(`   Stage Type: ${stageType}`);
      console.log(`   Entity ID: ${entityId}`);

      switch (stageType) {
        case "PAYMENT_EXECUTION": {
          // Payables "pay bill" / batch payment execution, gated for non-privileged users at/above
          // PAYMENT_APPROVAL_THRESHOLD_USD (see PurchaseInvoiceController.payInvoice/payBatch and
          // PaymentInvestmentApprovalService). Unlike MASTER_DATA_COA, the real executor
          // (PurchaseInvoiceService.payInvoice/payInvoicesBatch) runs its own cashbook/journal
          // transaction rather than participating in this `tx` — see PaymentInvestmentApprovalService's
          // header comment for why. Throwing on failure still rolls back THIS approval transaction, so
          // a failed payment is never left recorded as an approved request.
          const { applyApprovedPayment } = await import("./PaymentInvestmentApprovalService");
          const result = await applyApprovedPayment(entityId, entityData, requestedById);
          if (!result.ok) {
            throw new Error(`Failed to execute approved payment for ${entityId}: ${result.message}`);
          }
          console.log(`   ✅ Payment for ${entityId} executed per approved request`);
          break;
        }

        case "INVESTMENT_BOOKING": {
          // Short-Term Investment placement, gated for non-privileged users at/above
          // INVESTMENT_APPROVAL_THRESHOLD_USD. No ShortTermInvestmentInstrument row exists yet at
          // request time (this gates a CREATE, not an edit of an existing row like
          // MASTER_DATA_COA/PAYMENT_EXECUTION) — entityId is a synthetic placeholder assigned at
          // submission time; the real instrument id is only minted here, on approval.
          const { applyApprovedInvestmentBooking } = await import("./PaymentInvestmentApprovalService");
          const result = await applyApprovedInvestmentBooking(entityData, requestedById);
          if (!result.ok) {
            throw new Error(`Failed to book approved investment for ${entityId}: ${result.message}`);
          }
          console.log(`   ✅ Investment booking for ${entityId} completed per approved request (real id: ${result.data?.id})`);
          break;
        }

        case "MASTER_DATA_COA": {
          // Chart of Accounts master-data edit, gated for non-privileged users (see
          // ChartOfAccountsController.updateChartOfAccounts). The proposed change was stored as JSON
          // on the ApprovalRequest at submission time — apply it now via the same shared update
          // function the direct-apply (admin/CFO) path uses, inside this same transaction so the
          // Approval/ApprovalRequest status change and the actual CoA mutation commit atomically.
          const { applyChartOfAccountsUpdate } = await import("./ChartOfAccountsUpdateService");
          const result = await applyChartOfAccountsUpdate(entityId, entityData, tx);
          if (!result.ok) {
            throw new Error(
              `Failed to apply approved Chart of Accounts change for ${entityId}: [${result.status}] ${result.message}`
            );
          }
          console.log(`   ✅ Chart of Accounts ${entityId} updated per approved change`);
          break;
        }

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
        case "PAYMENT_EXECUTION":
          // Nothing was ever executed for a pending PAYMENT_EXECUTION request (see
          // updateEntityStatusAfterApproval) — the bill remains unpaid. Only the
          // Approval/ApprovalRequest status (already set to REJECTED by the caller) records the outcome.
          console.log(`   ❌ Payment for ${entityId} rejected — nothing was executed, bill(s) remain unpaid`);
          break;

        case "INVESTMENT_BOOKING":
          // Nothing was ever booked for a pending INVESTMENT_BOOKING request — no
          // ShortTermInvestmentInstrument row was created, nothing to revert.
          console.log(`   ❌ Investment booking for ${entityId} rejected — nothing was booked`);
          break;

        case "MASTER_DATA_COA":
          // Nothing was ever applied to the ChartOfAccounts row for a pending request (see
          // updateEntityStatusAfterApproval) — the row is left exactly as it was. Only the
          // Approval/ApprovalRequest status (already set to REJECTED by the caller) records the outcome.
          console.log(`   ❌ Chart of Accounts change for ${entityId} rejected — no changes were applied, nothing to revert`);
          break;

        case "PURCHASE_REQUISITION":
        case "PURCHASE_ORDER":
        case "INVOICE":
        case "GRN":
          await persistProcurementEntityRejection(tx, stageType, entityId, reason);
          if (stageType === "PURCHASE_REQUISITION") {
            console.log(`   ❌ Purchase Requisition ${entityId} marked as REJECTED`);
          } else if (stageType === "PURCHASE_ORDER") {
            console.log(`   ❌ Purchase Order ${entityId} marked as REJECTED`);
          } else if (stageType === "INVOICE") {
            console.log(`   ❌ Procurement Invoice ${entityId} marked as REJECTED`);
          } else {
            console.log(`   ❌ Goods Received Note ${entityId} marked as REJECTED`);
          }
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


