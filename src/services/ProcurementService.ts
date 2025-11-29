// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import JournalEntryService from "./JournalEntryService";
import AuditService from "./AuditService";
import { ApprovalService } from "./ApprovalService";

// Hardcoded departments
export enum Department {
  FINANCE = "Finance",
  OPERATIONS = "Operations",
  PROCUREMENT = "Procurement",
  HUMAN_RESOURCES = "Human Resources",
  MARKETING = "Marketing",
  LEGAL = "Legal",
  IT = "IT"
}

// Department roles
export enum DepartmentRole {
  HEAD = "HEAD",
  DEPUTY = "DEPUTY",
  MEMBER = "MEMBER"
}

export interface CreatePurchaseRequisitionParams {
  title: string;
  description?: string;
  department: Department; // ⬅️ Now using hardcoded department enum
  requestedById: string;
  priority?: string;
  justification?: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    specifications?: any;
  }[];
}

export interface CreateRFQParams {
  requisitionId?: string;
  title: string;
  description?: string;
  vendorIds: string[]; // Multiple vendors selected by ID
  priority?: string;
  expectedDeliveryDate?: Date;
  deliveryAddress?: string;
  rfqDeadline?: Date;
  specialRequirements?: string;
  createdById: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    specifications?: any;
  }[];
}

export interface CreatePurchaseOrderParams {
  requisitionId?: string;
  quotationId?: string; // Link to accepted quotation
  rfqId?: string; // Link to RFQ if created from RFQ response (deprecated)
  vendorId: string;
  priority?: string;
  currencyId?: string;
  expectedDeliveryDate?: Date;
  shippingAddress?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  createdById: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    specifications?: any;
  }[];
}

export interface CreateProcurementInvoiceParams {
  purchaseOrderId?: string;
  vendorId: string;
  invoiceDate: Date;
  dueDate?: Date;
  currencyId?: string;
  documentPath?: string;
  documentType?: string;
  createdById?: string; // Optional for public vendor submissions
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
  }[];
}

export interface OCRProcessedData {
  invoiceNumber: string;
  invoiceDate: string;
  vendorName: string;
  vendorAddress?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
  }[];
}

export interface AIMatchingResult {
  matched: boolean;
  matchScore: number;
  discrepancies: {
    type: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
}

export class ProcurementService {
  /**
   * Generate unique requisition number
   */
  private static generateRequisitionNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `REQ-${timestamp}-${random}`;
  }

  /**
   * Generate unique RFQ number
   */
  private static generateRFQNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `RFQ-${timestamp}-${random}`;
  }

  /**
   * Generate unique PO number
   */
  private static generatePONumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PO-${timestamp}-${random}`;
  }

  /**
   * Generate unique GRN number
   */
  private static generateGRNNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `GRN-${timestamp}-${random}`;
  }

  /**
   * Create a new purchase requisition (no prices needed, just items)
   */
  static async createPurchaseRequisition(params: CreatePurchaseRequisitionParams) {
    try {
      const {
        title,
        description,
        department,
        requestedById,
        priority = "MEDIUM",
        justification,
        items
      } = params;

      // Validate items
      if (!items || items.length === 0) {
        throw new Error("At least one item is required");
      }

      // Validate department
      if (!Object.values(Department).includes(department)) {
        throw new Error(`Invalid department. Must be one of: ${Object.values(Department).join(', ')}`);
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📝 CREATING PURCHASE REQUISITION");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Title: ${title}`);
      console.log(`🏢 Department: ${department}`);
      console.log(`📦 Items: ${items.length}`);
      console.log("");

      // Create requisition (no prices, no total amount)
      const requisition = await prisma.purchaseRequisition.create({
        data: {
          requisitionNumber: this.generateRequisitionNumber(),
          title,
          description,
          department: department, // ⬅️ Now storing department name as string
          requestedById,
          priority,
          justification,
          totalAmount: new Decimal(0), // No prices yet, will be determined after vendor quotes
          status: "DRAFT",
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(0), // No price yet - will get from vendor quotes
              totalPrice: new Decimal(0), // No price yet
              unit: item.unit,
              specifications: item.specifications
            }))
          }
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
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: requestedById,
        action: "CREATE",
        entityType: "PurchaseRequisition",
        entityId: requisition.id,
        newValues: requisition,
      });

      console.log("✅ Purchase Requisition created successfully");
      console.log(`🆔 Requisition ID: ${requisition.id}`);
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      console.log("ℹ️ Purchase requisition created in DRAFT status. Submit via /submit endpoint to initiate approvals.");
      return requisition;
    } catch (error) {
      console.error("Error creating purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Get purchase requisitions created by the logged-in user
   */
  static async getMyPurchaseRequisitions(userId: string) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📋 FETCHING MY PURCHASE REQUISITIONS");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`👤 User ID: ${userId}`);
      console.log("");

      const requisitions = await prisma.purchaseRequisition.findMany({
        where: {
          requestedById: userId
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
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      console.log(`✅ Found ${requisitions.length} requisition(s)`);
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return requisitions;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR FETCHING MY REQUISITIONS");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Get pending requisitions for department head/deputy (their department only)
   */
  static async getPendingRequisitionsForDepartmentHead(userId: string) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📋 FETCHING PENDING REQUISITIONS FOR DEPARTMENT HEAD/DEPUTY");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`👤 User ID: ${userId}`);
      console.log("");

      // Get user's department and role
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          firstName: true, 
          lastName: true, 
          userDepartment: true,
          departmentRole: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      if (!user.userDepartment) {
        throw new Error("User is not assigned to any department");
      }

      if (!user.departmentRole || (user.departmentRole !== DepartmentRole.HEAD && user.departmentRole !== DepartmentRole.DEPUTY)) {
        throw new Error("Only department HEAD or DEPUTY can approve requisitions");
      }

      console.log(`🏢 Department: ${user.userDepartment}`);
      console.log(`👔 Role: ${user.departmentRole}`);

      // Get requisitions for this department that are pending approval
      const requisitions = await prisma.purchaseRequisition.findMany({
        where: {
          department: user.userDepartment,
          status: "PENDING_APPROVAL"
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
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      console.log(`✅ Found ${requisitions.length} pending requisition(s) for ${user.userDepartment}`);
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return requisitions;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR FETCHING PENDING REQUISITIONS FOR DEPARTMENT HEAD");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Submit a purchase requisition for approval
   */
  static async submitPurchaseRequisition(requisitionId: string, submittedById: string) {
    try {
      const requisition = await prisma.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: {
          items: true,
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userDepartment: true,
              departmentRole: true,
              roleCode: true
            }
          }
        }
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      if (requisition.status !== "DRAFT") {
        throw new Error("Requisition is not in draft status");
      }

      // Trigger approval workflow
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("🔄 SUBMITTING REQUISITION FOR APPROVAL");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Requisition ID: ${requisitionId}`);
      console.log(`👤 Submitted By: ${submittedById}`);
      console.log(`🏢 Department: ${requisition.department}`);
      console.log("");

      const { ApprovalService } = await import('./ApprovalService');
      
      console.log("🔄 Initiating approval workflow...");
      let approvalResult = null;
      try {
        approvalResult = await ApprovalService.createApprovalRequest({
          stageType: "PURCHASE_REQUISITION",
          entityId: requisition.id,
          entityData: {
            requisitionNumber: requisition.requisitionNumber,
            title: requisition.title,
            department: requisition.department,
            totalAmount: requisition.totalAmount.toString(),
            itemCount: requisition.items.length
          },
          requestedById: submittedById,
          department: requisition.department as any // Cast to Department enum for filtering
        });
        if (approvalResult) {
          console.log("✅ Approval request created successfully");
        } else {
          console.log("⚠️  No approval request created - check approval config");
        }
      } catch (error: any) {
        console.error("❌ Error creating approval request:", error.message || error);
        // Don't throw - we'll keep status as DRAFT if approval fails
        approvalResult = null;
      }

      // Update requisition status based on approval workflow
      let updatedRequisition;
      if (approvalResult) {
        // Approval workflow created - update status to PENDING_APPROVAL
        updatedRequisition = await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "PENDING_APPROVAL"
          },
          include: {
            requestedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                userDepartment: true,
                departmentRole: true,
                roleCode: true
              }
            },
            currency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true
              }
            },
            items: true
          }
        });
        console.log("✅ Requisition status updated to PENDING_APPROVAL");
        
        // Send email notification to department HEAD when requisition is submitted
        try {
          const { EmailNotificationService } = await import('./EmailNotificationService');
          
          // Find department HEAD
          const departmentHeads = await prisma.user.findMany({
            where: {
              userDepartment: requisition.department,
              departmentRole: 'HEAD'
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          });

          if (departmentHeads.length > 0) {
            for (const head of departmentHeads) {
              await EmailNotificationService.sendRequisitionSubmittedToHead({
                headName: `${head.firstName} ${head.lastName}`,
                headEmail: head.email,
                requisitionNumber: updatedRequisition.requisitionNumber,
                title: updatedRequisition.title,
                department: updatedRequisition.department,
                submittedByName: `${requisition.requestedBy.firstName} ${requisition.requestedBy.lastName}`,
                submittedByEmail: requisition.requestedBy.email,
                totalAmount: Number(updatedRequisition.totalAmount),
                itemCount: requisition.items.length,
                status: updatedRequisition.status,
                companyName: 'NVCCZ'
              });
            }
          }
        } catch (emailError: any) {
          console.error("⚠️  Error sending email notification:", emailError.message || emailError);
          // Don't throw - email failure shouldn't block requisition submission
        }
      } else {
        // No approval stages configured - keep as DRAFT
        updatedRequisition = await prisma.purchaseRequisition.findUnique({
          where: { id: requisitionId },
          include: {
            requestedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                userDepartment: true,
                departmentRole: true,
                roleCode: true
              }
            },
            currency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true
              }
            },
            items: true
          }
        });
        console.log("⚠️  No approval stages configured - Requisition remains in DRAFT status");
      }

      // Audit log
      await AuditService.log({
        userId: submittedById,
        action: "SUBMIT",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition,
      });

      return updatedRequisition;
    } catch (error) {
      console.error("Error submitting purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Approve a purchase requisition (only by department head)
   */
  static async approvePurchaseRequisition(requisitionId: string, approvedById: string) {
    try {
      const requisition = await prisma.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: {
          items: true
        }
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      if (requisition.status !== "PENDING_APPROVAL") {
        throw new Error("Requisition is not pending approval");
      }

      // Check if the approver is the department head or deputy
      const approver = await prisma.user.findUnique({
        where: { id: approvedById },
        select: { 
          userDepartment: true, 
          departmentRole: true,
          firstName: true, 
          lastName: true 
        }
      });

      if (!approver) {
        throw new Error("Approver not found");
      }

      if (!approver.userDepartment || approver.userDepartment !== requisition.department) {
        throw new Error(`You are not assigned to the ${requisition.department} department`);
      }

      if (!approver.departmentRole || (approver.departmentRole !== DepartmentRole.HEAD && approver.departmentRole !== DepartmentRole.DEPUTY)) {
        throw new Error(`Only department HEAD or DEPUTY can approve requisitions. Your role: ${approver.departmentRole || 'MEMBER'}`);
      }

      const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: "APPROVED",
          approvedById,
          approvedAt: new Date()
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
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: approvedById,
        action: "APPROVE",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition,
      });

      return updatedRequisition;
    } catch (error) {
      console.error("Error approving purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Reject a purchase requisition with a reason
   */
  static async rejectPurchaseRequisition(requisitionId: string, rejectedById: string, rejectionReason: string) {
    try {
      const requisition = await prisma.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: {
          items: true,
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userDepartment: true,
              departmentRole: true,
              roleCode: true
            }
          }
        }
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      if (requisition.status !== "PENDING_APPROVAL") {
        throw new Error("Requisition is not pending approval");
      }

      const approver = await prisma.user.findUnique({
        where: { id: rejectedById },
        select: {
          userDepartment: true,
          departmentRole: true
        }
      });

      if (!approver) {
        throw new Error("Approver not found");
      }

      if (approver.userDepartment !== requisition.department) {
        throw new Error(`You are not assigned to the ${requisition.department} department`);
      }

      if (!approver.departmentRole || (approver.departmentRole !== DepartmentRole.HEAD && approver.departmentRole !== DepartmentRole.DEPUTY)) {
        throw new Error(`Only department HEAD or DEPUTY can reject requisitions. Your role: ${approver.departmentRole || 'MEMBER'}`);
      }

      const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: "REJECTED",
          rejectionReason
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
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: true
        }
      });

      await AuditService.log({
        userId: rejectedById,
        action: "REJECT",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition
      });

      return updatedRequisition;
    } catch (error) {
      console.error("Error rejecting purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Create and send RFQ (Request for Quote) to multiple vendors
   * This replaces the old PO sending - now we send RFQs to get quotes first
   */
  static async createAndSendRFQ(params: CreateRFQParams) {
    try {
      const {
        requisitionId,
        title,
        description,
        vendorIds,
        priority = "MEDIUM",
        expectedDeliveryDate,
        deliveryAddress,
        rfqDeadline,
        specialRequirements,
        createdById,
        items
      } = params;

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📧 CREATING AND SENDING RFQ TO VENDORS");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Title: ${title}`);
      console.log(`👥 Selected Vendors: ${vendorIds.length}`);
      console.log(`📦 Items: ${items.length}`);
      console.log("");

      // Validate vendors exist and have emails
      console.log("🔍 Step 1: Fetching vendor details...");
      const vendors = await prisma.vendor.findMany({
        where: { id: { in: vendorIds } }
      });

      if (vendors.length !== vendorIds.length) {
        throw new Error("One or more vendors not found");
      }

      const vendorsWithoutEmail = vendors.filter(v => !v.email);
      if (vendorsWithoutEmail.length > 0) {
        throw new Error(`Vendors without email: ${vendorsWithoutEmail.map(v => v.name).join(', ')}`);
      }

      console.log("✅ All vendors found with valid emails:");
      vendors.forEach(v => console.log(`   - ${v.name} (${v.email})`));

      // Generate RFQ number
      const rfqNumber = this.generateRFQNumber();

      console.log(`\n📝 Step 2: Creating RFQ record: ${rfqNumber}`);

      // Create RFQ record (store as JSON since we don't have RFQ table)
      // We'll store it in the notes field of the requisition or create a simple tracking mechanism
      const rfqData = {
        rfqNumber,
        title,
        description,
        vendors: vendors.map(v => ({ id: v.id, name: v.name, email: v.email })),
        items,
        deliveryAddress,
        expectedDeliveryDate,
        rfqDeadline,
        specialRequirements,
        createdAt: new Date(),
        createdById,
        status: 'SENT'
      };

      console.log("✅ RFQ record prepared");

      // Update requisition if provided
      if (requisitionId) {
        console.log(`\n📝 Step 3: Linking RFQ to requisition ${requisitionId}...`);
        await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "RFQ_SENT"
          }
        });
        console.log("✅ Requisition status updated to RFQ_SENT");
      }

      // Send RFQ email to all vendors
      console.log("\n📧 Step 4: Sending RFQ emails to all vendors...");
      
      const { EmailNotificationService } = await import('./EmailNotificationService');
      
      for (const vendor of vendors) {
        console.log(`   📤 Sending to: ${vendor.name} (${vendor.email})`);
        
        await EmailNotificationService.sendRFQToVendor({
          vendorName: vendor.name,
          vendorEmail: vendor.email,
          rfqNumber,
          rfqDate: new Date(),
          title,
          description: description || '',
          items: items.map(item => ({
            itemName: item.itemName,
            description: item.description || '',
            quantity: item.quantity,
            unit: item.unit || 'unit',
            specifications: item.specifications
          })),
          deliveryAddress,
          expectedDeliveryDate,
          rfqDeadline,
          specialRequirements,
          companyName: 'NVCCZ'
        });
        
        console.log(`   ✅ Sent to ${vendor.name}`);
      }

      // Audit log
      console.log("\n📊 Step 5: Creating audit log...");
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "RFQ",
        entityId: rfqNumber,
        newValues: rfqData,
      });
      console.log("✅ Audit log created");

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("✅ RFQ SENT SUCCESSFULLY TO ALL VENDORS!");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 RFQ Number: ${rfqNumber}`);
      console.log(`👥 Vendors Contacted: ${vendors.length}`);
      vendors.forEach(v => console.log(`   - ${v.name} (${v.email})`));
      console.log(`📦 Items: ${items.length}`);
      if (rfqDeadline) {
        console.log(`⏰ Response Deadline: ${rfqDeadline.toLocaleDateString()}`);
      }
      console.log("");
      console.log("📌 NEXT STEPS:");
      console.log("   1. Vendors receive RFQ via email");
      console.log("   2. Vendors respond with their quotes (via email)");
      console.log("   3. Review vendor quotes");
      console.log("   4. Select winning vendor");
      console.log("   5. Create invoice manually with winning vendor's prices");
      console.log("   6. Approve invoice (creates accounting liability)");
      console.log("   7. Process payment to vendor");
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return {
        rfqNumber,
        ...rfqData,
        message: `RFQ sent to ${vendors.length} vendor(s) successfully`
      };
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR CREATING/SENDING RFQ");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Get all RFQs
   * Retrieves RFQs from audit logs where entityType is "RFQ"
   */
  static async getAllRFQs(filters?: {
    rfqNumber?: string;
    requisitionId?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      const {
        rfqNumber,
        requisitionId,
        limit = 50,
        offset = 0
      } = filters || {};

      const { default: AuditService } = await import('./AuditService');
      
      const where: any = {
        entityType: "RFQ"
      };

      if (rfqNumber) {
        where.entityId = rfqNumber;
      }

      // Get RFQs from audit logs
      const grouped = await prisma.auditLog.groupBy({
        by: ['entityId'],
        where,
        _max: {
          createdAt: true
        },
        orderBy: {
          _max: {
            createdAt: 'desc'
          }
        },
        skip: offset,
        take: limit
      });

      const entityIds = grouped.map(item => item.entityId);

      const audits = await prisma.auditLog.findMany({
        where: {
          entityId: { in: entityIds }
        },
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
        orderBy: { createdAt: 'desc' }
      });

      const auditMap = new Map<string, typeof audits[0]>();
      for (const audit of audits) {
        const existing = auditMap.get(audit.entityId);
        if (!existing || audit.createdAt > existing.createdAt) {
          auditMap.set(audit.entityId, audit);
        }
      }

      const rfqs = entityIds
        .map(id => auditMap.get(id))
        .filter(Boolean)
        .map(audit => {
          const rfqData = audit!.newValues as any;
        return {
            rfqNumber: audit!.entityId,
          ...rfqData,
            createdBy: audit!.user,
            createdAt: audit!.createdAt
        };
      });

      let filteredRFQs = rfqs;
      if (requisitionId) {
        filteredRFQs = rfqs.filter((rfq: any) => rfq.requisitionId === requisitionId);
      }

      const countGroup = await prisma.auditLog.groupBy({
        by: ['entityId'],
        where
      });

      const count = countGroup.length;

      return {
        rfqs: filteredRFQs,
        count: requisitionId ? filteredRFQs.length : count,
        limit,
        offset
      };
    } catch (error: any) {
      console.error("Error fetching RFQs:", error);
      throw error;
    }
  }

  /**
   * Create a purchase order from an approved requisition
   */
  static async createPurchaseOrder(params: CreatePurchaseOrderParams) {
    try {
      const {
        requisitionId,
        quotationId,
        vendorId,
        priority = "MEDIUM",
        currencyId,
        expectedDeliveryDate,
        shippingAddress,
        paymentTerms,
        deliveryTerms,
        createdById,
        items
      } = params;

      // Validate vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const taxAmount = subtotal * 0.15; // Assuming 15% tax rate
      const totalAmount = subtotal + taxAmount;

      // Create purchase order
      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          poNumber: this.generatePONumber(),
          requisitionId,
          quotationId,
          vendorId,
          priority,
          subtotal: new Decimal(subtotal),
          taxAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          expectedDeliveryDate,
          shippingAddress,
          paymentTerms,
          deliveryTerms,
          createdById,
          status: "DRAFT",
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.quantity * item.unitPrice),
              unit: item.unit,
              quantityReceived: new Decimal(0),
              quantityPending: new Decimal(item.quantity),
              specifications: item.specifications
            }))
          }
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true
            }
          },
          requisition: {
            select: {
              id: true,
              requisitionNumber: true,
              title: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
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
          items: true
        }
      });

      // Update requisition status if it exists
      if (requisitionId) {
        await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: { status: "CONVERTED_TO_PO" }
        });
      }

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "PurchaseOrder",
        entityId: purchaseOrder.id,
        newValues: purchaseOrder,
      });

      return purchaseOrder;
    } catch (error) {
      console.error("Error creating purchase order:", error);
      throw error;
    }
  }

  /**
   * Send/Approve Purchase Order and email to vendor
   */
  static async sendPurchaseOrder(poId: string, sentById: string) {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📧 SENDING PURCHASE ORDER TO VENDOR");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 PO ID: ${poId}`);
      console.log(`👤 Sent By: ${sentById}`);
      console.log("");

      console.log("🔍 Step 1: Retrieving purchase order details...");
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: {
          vendor: true,
          currency: true,
          items: true,
          createdBy: true
        }
      });

      if (!purchaseOrder) {
        console.error("❌ ERROR: Purchase order not found");
        throw new Error("Purchase order not found");
      }

      console.log(`✅ PO Found: ${purchaseOrder.poNumber}`);
      console.log(`   Vendor: ${purchaseOrder.vendor.name}`);
      console.log(`   Total Amount: ${purchaseOrder.currency?.symbol || '$'}${Number(purchaseOrder.totalAmount).toFixed(2)}`);
      console.log(`   Current Status: ${purchaseOrder.status}`);

      if (purchaseOrder.status !== "DRAFT" && purchaseOrder.status !== "PENDING") {
        console.error(`❌ ERROR: PO already sent (status: ${purchaseOrder.status})`);
        throw new Error("Purchase order has already been sent");
      }

      if (!purchaseOrder.vendor.email) {
        console.error("❌ ERROR: Vendor email not found");
        throw new Error("Vendor email address is required to send PO");
      }

      console.log(`   ✅ Vendor email: ${purchaseOrder.vendor.email}`);

      console.log("\n📧 Step 2: Sending PO email to vendor...");
      
      // Import email service dynamically
      const { EmailNotificationService } = await import('./EmailNotificationService');
      
      await EmailNotificationService.sendPurchaseOrderToVendor({
        vendorName: purchaseOrder.vendor.name,
        vendorEmail: purchaseOrder.vendor.email,
        poNumber: purchaseOrder.poNumber,
        poDate: purchaseOrder.createdAt,
        totalAmount: Number(purchaseOrder.totalAmount),
        currency: purchaseOrder.currency?.code || 'USD',
        items: purchaseOrder.items.map(item => ({
          itemName: item.itemName,
          description: item.description || '',
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          total: Number(item.totalPrice)
        })),
        deliveryAddress: purchaseOrder.shippingAddress || undefined,
        expectedDeliveryDate: purchaseOrder.expectedDeliveryDate || undefined,
        paymentTerms: purchaseOrder.paymentTerms || undefined,
        notes: purchaseOrder.notes || undefined,
        companyName: 'NVCCZ'
      });

      console.log("   ✅ Email sent successfully");

      console.log("\n📝 Step 3: Updating PO status to SENT...");
      const updatedPO = await prisma.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          sentById
        },
        include: {
          vendor: true,
          currency: true,
          items: true
        }
      });

      console.log("   ✅ PO status updated to SENT");

      console.log("\n📊 Step 4: Creating audit log...");
      await AuditService.log({
        userId: sentById,
        action: "SEND",
        entityType: "PurchaseOrder",
        entityId: poId,
        newValues: {
          status: "SENT",
          sentAt: new Date(),
          sentTo: purchaseOrder.vendor.email
        },
      });
      console.log("   ✅ Audit log created");

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("✅ PURCHASE ORDER SENT SUCCESSFULLY!");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 PO Number: ${purchaseOrder.poNumber}`);
      console.log(`🏢 Vendor: ${purchaseOrder.vendor.name}`);
      console.log(`📧 Email: ${purchaseOrder.vendor.email}`);
      console.log(`💰 Total Amount: ${purchaseOrder.currency?.symbol || '$'}${Number(purchaseOrder.totalAmount).toFixed(2)}`);
      console.log(`📊 Status: SENT`);
      console.log("");
      console.log("📌 NEXT STEPS:");
      console.log("   1. Vendor reviews and accepts the PO");
      console.log("   2. Vendor ships/delivers items");
      console.log("   3. Create Goods Receipt Note (GRN) when items arrive");
      console.log("   4. Receive vendor invoice");
      console.log("   5. Approve invoice (creates accounting liability)");
      console.log("   6. Process payment to vendor");
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return updatedPO;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR SENDING PURCHASE ORDER");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Process OCR data for invoice
   */
  static async processOCRData(invoiceId: string, ocrData: OCRProcessedData) {
    try {
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      // Update invoice with OCR data
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          ocrProcessed: true,
          ocrData: ocrData,
          invoiceNumber: ocrData.invoiceNumber,
          invoiceDate: new Date(ocrData.invoiceDate),
          subtotal: new Decimal(ocrData.subtotal),
          taxAmount: new Decimal(ocrData.taxAmount),
          totalAmount: new Decimal(ocrData.totalAmount),
          status: "PROCESSING",
          items: {
            deleteMany: {}, // Remove existing items
            create: ocrData.items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.totalPrice),
              unit: item.unit
            }))
          }
        },
        include: {
          vendor: true,
          purchaseOrder: {
            include: {
              items: true
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: invoice.createdById,
        action: "OCR_PROCESS",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: { ocrData },
      });

      return updatedInvoice;
    } catch (error) {
      console.error("Error processing OCR data:", error);
      throw error;
    }
  }

  /**
   * Perform AI matching between invoice and purchase order
   */
  static async performAIMatching(invoiceId: string, aiResult: AIMatchingResult) {
    try {
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          purchaseOrder: {
            include: {
              items: true
            }
          },
          items: true
        }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (!invoice.purchaseOrder) {
        throw new Error("No purchase order found for matching");
      }

      // Update invoice with AI matching results
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          aiMatched: aiResult.matched,
          aiMatchScore: new Decimal(aiResult.matchScore),
          aiDiscrepancies: aiResult.discrepancies,
          matchingStatus: aiResult.matched ? "MATCHED" : "DISCREPANCY",
          status: aiResult.matched ? "MATCHED" : "DISCREPANCY"
        },
        include: {
          vendor: true,
          purchaseOrder: {
            include: {
              items: true
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: invoice.createdById,
        action: "AI_MATCH",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: { aiResult },
      });

      return updatedInvoice;
    } catch (error) {
      console.error("Error performing AI matching:", error);
      throw error;
    }
  }

  /**
   * Approve a procurement invoice and create journal entry
   * @param invoiceId - ID of the invoice to approve
   * @param approvedById - ID of the user approving the invoice
   * @param approvalData - Optional approval data including taxable status (VAT calculated automatically)
   */
  static async approveProcurementInvoice(
    invoiceId: string, 
    approvedById: string,
    approvalData?: {
      isTaxable?: boolean;
    }
  ) {
    try {
      console.log("\n");
      console.log("════════════════════════════════════════════════════════════════");
      console.log("✅ PROCUREMENT INVOICE APPROVAL STARTED");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Invoice ID: ${invoiceId}`);
      console.log(`👤 Approved By: ${approvedById}`);
      console.log("");

      console.log("🔍 Step 1: Retrieving invoice details...");
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          vendor: true,
          currency: true,
          items: true
        }
      });

      if (!invoice) {
        console.error("❌ ERROR: Invoice not found");
        throw new Error("Invoice not found");
      }
      console.log(`✅ Invoice Found: ${invoice.invoiceNumber}`);
      console.log(`   Vendor: ${invoice.vendor.name}`);
      console.log(`   Subtotal: $${Number(invoice.subtotal).toFixed(2)}`);
      console.log(`   Tax (VAT): $${Number(invoice.taxAmount).toFixed(2)}`);
      console.log(`   Total Amount: $${Number(invoice.totalAmount).toFixed(2)}`);
      console.log(`   Current Status: ${invoice.status}`);

      console.log("\n🔒 Step 2: Validating invoice status...");
      if (invoice.status !== "MATCHED" && invoice.status !== "DISCREPANCY" && invoice.status !== "DRAFT") {
        console.error(`❌ VALIDATION FAILED: Invoice status is "${invoice.status}", must be "MATCHED", "DISCREPANCY", or "DRAFT"`);
        throw new Error("Invoice is not ready for approval");
      }
      console.log("   ✅ Invoice is ready for approval");

      // Handle taxable status and tax calculation using VATService
      console.log("\n💰 Step 3: Calculating tax and totals...");
      let finalSubtotal = Number(invoice.subtotal);
      let finalTaxAmount = Number(invoice.taxAmount);
      let finalTotalAmount = Number(invoice.totalAmount);
      
      // Import VATService
      const VATService = (await import('./VATService')).default;
      
      // If approval data provided, recalculate based on taxable status
      if (approvalData && approvalData.isTaxable !== undefined) {
        const isTaxable = approvalData.isTaxable;
        
        if (isTaxable) {
          // Calculate VAT automatically using VATService (14.5% rate)
          finalTaxAmount = VATService.isVATEligible(finalSubtotal, true)
            ? VATService.calculateVAT(finalSubtotal)
            : 0;
          finalTotalAmount = finalSubtotal + finalTaxAmount;
          console.log(`   ✅ Invoice is TAXABLE`);
          console.log(`   • Using VAT rate: ${VATService.getVATRate()}% (from VATService)`);
          console.log(`   • Subtotal: $${finalSubtotal.toFixed(2)}`);
          console.log(`   • Tax (VAT): $${finalTaxAmount.toFixed(2)}`);
          console.log(`   • Total: $${finalTotalAmount.toFixed(2)}`);
        } else {
          // Not taxable - zero out tax
          finalTaxAmount = 0;
          finalTotalAmount = finalSubtotal;
          console.log(`   ✅ Invoice is NOT TAXABLE`);
          console.log(`   • Subtotal: $${finalSubtotal.toFixed(2)}`);
          console.log(`   • Tax: $0.00`);
          console.log(`   • Total: $${finalTotalAmount.toFixed(2)}`);
        }
      } else {
        // No approval data - keep existing values
        const isTaxable = finalTaxAmount > 0;
        console.log(`   ℹ️  Using existing invoice amounts`);
        console.log(`   • Taxable: ${isTaxable ? 'YES' : 'NO'}`);
        console.log(`   • Subtotal: $${finalSubtotal.toFixed(2)}`);
        console.log(`   • Tax: $${finalTaxAmount.toFixed(2)}`);
        console.log(`   • Total: $${finalTotalAmount.toFixed(2)}`);
      }

      // ⚠️ IMPORTANT: Accounting entries will be created when invoice is PAID, not when approved
      console.log("\n📝 Step 4: Updating invoice status...");
      console.log("   New Status: APPROVED");
      console.log("   Payment Status: PENDING (awaiting payment)");
      console.log("");
      console.log("   ℹ️  Accounting entries will be created when payment is processed");
      console.log("   ℹ️  This includes:");
      if (finalTaxAmount > 0) {
        console.log(`      • DEBIT Expense Account: $${finalSubtotal.toFixed(2)}`);
        console.log(`      • DEBIT VAT Input Account: $${finalTaxAmount.toFixed(2)}`);
        console.log(`      • CREDIT Accounts Payable: $${finalTotalAmount.toFixed(2)} (on payment)`);
      } else {
        console.log(`      • DEBIT Expense Account: $${finalTotalAmount.toFixed(2)}`);
        console.log(`      • CREDIT Accounts Payable: $${finalTotalAmount.toFixed(2)} (on payment)`);
      }
      console.log(`      • Then: DEBIT Accounts Payable, CREDIT Bank/Cash (on payment)`);
      
      // Update invoice with approval and recalculated amounts (NO journal entry yet)
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "APPROVED",
          approvedById,
          approvedAt: new Date(),
          paymentStatus: "PENDING",
          subtotal: new Decimal(finalSubtotal),
          taxAmount: new Decimal(finalTaxAmount),
          totalAmount: new Decimal(finalTotalAmount)
          // NO journalEntryId here - will be created on payment
        },
        include: {
          vendor: true,
          currency: true,
          items: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });
      console.log("   ✅ Invoice updated successfully");

      // Audit log
      console.log("\n📊 Step 5: Creating audit log...");
      await AuditService.log({
        userId: approvedById,
        action: "APPROVE",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: updatedInvoice,
      });
      console.log("   ✅ Audit log created");

      // Send approval email to vendor
      console.log("\n📧 Step 6: Sending approval email to vendor...");
      try {
        const { EmailNotificationService } = await import('./EmailNotificationService');
        await EmailNotificationService.sendInvoiceApprovedEmail({
          vendorName: invoice.vendor.name,
          vendorEmail: invoice.vendor.email || '',
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: Number(invoice.totalAmount),
          currencyCode: invoice.currency?.code || 'USD',
          approvedDate: new Date(),
          dueDate: invoice.dueDate || undefined
        });
        console.log("   ✅ Approval email sent to vendor");
      } catch (emailError: any) {
        console.error("   ⚠️  Failed to send approval email:", emailError.message);
        // Don't fail the entire approval if email fails
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("✅ INVOICE APPROVED SUCCESSFULLY!");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Invoice: ${invoice.invoiceNumber}`);
      console.log(`🏢 Vendor: ${invoice.vendor.name}`);
      console.log(`💰 Total Amount: $${Number(invoice.totalAmount).toFixed(2)}`);
      console.log(`📊 Status: APPROVED`);
      console.log(`💳 Payment Status: PENDING`);
      console.log("");
      console.log("📌 ACCOUNTING STATUS:");
      console.log("   • No journal entries created yet");
      console.log("   • Accounting entries will be created when payment is processed");
      console.log("");
      console.log("⏭️  NEXT STEP: Process payment to create accounting entries");
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return updatedInvoice;
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR APPROVING INVOICE");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Process payment for an approved procurement invoice
   * This creates a journal entry to clear Accounts Payable and reduce cash/bank balance
   * 
   * @param invoiceId - ID of the invoice to pay
   * @param paymentData - Payment details
   * @param processedById - ID of user processing the payment
   * @returns Updated invoice with payment details and journal entry
   */
  static async payProcurementInvoice(
    invoiceId: string,
    paymentData: {
      paymentAmount: number;
      paymentDate: Date;
      paymentMethod: "CASH" | "BANK";
      bankAccountId?: string; // Optional: specific bank account (e.g., ZIG account)
      paymentReference?: string; // Bank transaction reference
      proofOfPaymentPath?: string; // Path to uploaded proof of payment document
      notes?: string;
    },
    processedById: string
  ) {
    try {
      console.log("\n");
      console.log("════════════════════════════════════════════════════════════════");
      console.log("🚀 PROCUREMENT PAYMENT PROCESSING STARTED");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Invoice ID: ${invoiceId}`);
      console.log(`💰 Payment Amount: $${paymentData.paymentAmount.toFixed(2)}`);
      console.log(`💳 Payment Method: ${paymentData.paymentMethod}`);
      console.log(`👤 Processed By: ${processedById}`);
      console.log("");

      // Get the invoice with vendor details
      console.log("🔍 Step 1: Retrieving invoice details...");
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          vendor: true,
          currency: true,
          items: true,
          journalEntry: true
        }
      });

      if (!invoice) {
        console.error("❌ ERROR: Invoice not found");
        throw new Error("Invoice not found");
      }
      console.log(`✅ Invoice Found: ${invoice.invoiceNumber}`);
      console.log(`   Vendor: ${invoice.vendor.name}`);
      console.log(`   Subtotal: $${Number(invoice.subtotal).toFixed(2)}`);
      console.log(`   Tax (VAT): $${Number(invoice.taxAmount).toFixed(2)}`);
      console.log(`   Total Amount: $${Number(invoice.totalAmount).toFixed(2)}`);
      console.log(`   Status: ${invoice.status}`);
      console.log(`   Payment Status: ${invoice.paymentStatus}`);
      
      // Determine if invoice is taxable
      const isTaxable = Number(invoice.taxAmount) > 0;
      console.log(`   Taxable: ${isTaxable ? 'YES (15% VAT)' : 'NO'}`);

      // Validation checks
      console.log("\n🔒 Step 2: Validating payment request...");
      
      if (invoice.status !== "APPROVED") {
        console.error(`❌ VALIDATION FAILED: Invoice status is "${invoice.status}", must be "APPROVED"`);
        throw new Error("Invoice must be approved before payment can be processed");
      }
      console.log("   ✅ Invoice is approved");

      // Check if invoice is already fully paid (but allow partial payments if partially paid)
      if (invoice.paymentStatus === "PAID") {
        console.error("❌ VALIDATION FAILED: Invoice has already been fully paid");
        throw new Error("Invoice has already been fully paid");
      }
      console.log("   ✅ Invoice can be paid (not fully paid)");

      // Validate payment amount
      const invoiceTotal = Number(invoice.totalAmount);
      // Check if there's an existing partial payment
      const existingPaidAmount = invoice.paymentStatus === "PARTIALLY_PAID" 
        ? 0 // We don't track partial amounts yet, so treat as 0 for now
        : 0;
      const remainingInvoiceBalance = invoiceTotal - existingPaidAmount;
      
      if (paymentData.paymentAmount > remainingInvoiceBalance) {
        console.error(`❌ VALIDATION FAILED: Payment amount ($${paymentData.paymentAmount}) exceeds remaining balance ($${remainingInvoiceBalance})`);
        throw new Error(`Payment amount ($${paymentData.paymentAmount}) cannot exceed remaining balance ($${remainingInvoiceBalance})`);
      }
      console.log(`   ✅ Payment amount valid ($${paymentData.paymentAmount.toFixed(2)} <= $${remainingInvoiceBalance.toFixed(2)})`);

      // Determine payment type
      const isPartialPayment = paymentData.paymentAmount < remainingInvoiceBalance;
      const remainingBalance = remainingInvoiceBalance - paymentData.paymentAmount;
      
      if (isPartialPayment) {
        console.log(`   ℹ️  PARTIAL PAYMENT: Paying $${paymentData.paymentAmount.toFixed(2)} of $${invoiceTotal.toFixed(2)}`);
        console.log(`   ℹ️  Remaining Balance: $${remainingBalance.toFixed(2)}`);
      } else {
        console.log(`   ℹ️  FULL PAYMENT: Paying entire invoice amount`);
      }

      console.log("\n💰 Step 3: Creating accounting entries...");
      console.log("   ⚠️  IMPORTANT: Accounting entries created when payment is processed");
      
      // Check if expense entry already exists (for partial payments scenario)
      const hasExistingExpenseEntry = invoice.journalEntry !== null;
      
      let expenseJournalEntry;
      
      if (!hasExistingExpenseEntry) {
        // First payment - create expense recognition entry
        console.log("   This will create TWO journal entries:");
        console.log("");
        console.log("   ENTRY 1: Expense Recognition");
        if (isTaxable) {
          console.log(`   • DEBIT Expense Account: $${Number(invoice.subtotal).toFixed(2)}`);
          console.log(`   • DEBIT VAT Input Account: $${Number(invoice.taxAmount).toFixed(2)}`);
          console.log(`   • CREDIT Accounts Payable: $${Number(invoice.totalAmount).toFixed(2)}`);
        } else {
          console.log(`   • DEBIT Expense Account: $${Number(invoice.totalAmount).toFixed(2)}`);
          console.log(`   • CREDIT Accounts Payable: $${Number(invoice.totalAmount).toFixed(2)}`);
        }
        console.log("");
        
        // First, create expense journal entry (Dr. Expense, Dr. VAT if taxable, Cr. AP)
        console.log("\n   📊 Creating Entry 1: Expense Recognition...");
        const expenseJournalEntryParams = {
          vendorId: invoice.vendorId,
          categoryName: "PROCUREMENT", // You might want to get this from invoice items/category
          amount: Number(invoice.subtotal),
          vatAmount: isTaxable ? Number(invoice.taxAmount) : 0,
          totalAmount: Number(invoice.totalAmount),
          currencyId: invoice.currencyId || "default-currency",
          transactionDate: paymentData.paymentDate,
          description: `Purchase Invoice: ${invoice.invoiceNumber} - ${invoice.vendor.name}`,
          receiptNumber: invoice.invoiceNumber, // Use invoice number as receipt number
          isTaxable: isTaxable,
          paymentMethod: "CREDIT" as const, // Creates AP liability
          createdById: processedById
        };

        expenseJournalEntry = await JournalEntryService.createExpenseJournalEntry(expenseJournalEntryParams);
        console.log(`   ✅ Expense Entry Created: ${expenseJournalEntry.journalEntry.referenceNumber}`);
        console.log(`   ℹ️  Expense recognized: ${isTaxable ? `$${Number(invoice.subtotal).toFixed(2)} + VAT $${Number(invoice.taxAmount).toFixed(2)}` : `$${Number(invoice.totalAmount).toFixed(2)}`}`);
      } else {
        // Subsequent payment (partial payment scenario) - expense already recognized
        console.log("   ℹ️  Expense already recognized in previous payment");
        console.log("   ℹ️  Only creating payment entry (Entry 2)");
        expenseJournalEntry = {
          journalEntry: invoice.journalEntry! // Use existing expense entry
        };
      }
      
      // Always create payment journal entry (Dr. AP, Cr. Bank/Cash)
      console.log("\n   💳 Creating Entry 2: Payment Processing...");
      console.log(`   • DEBIT Accounts Payable: $${paymentData.paymentAmount.toFixed(2)}`);
      console.log(`   • CREDIT ${paymentData.paymentMethod} Account: $${paymentData.paymentAmount.toFixed(2)}`);

      const paymentJournalEntryResult = await JournalEntryService.createVendorPaymentJournalEntry({
        vendorId: invoice.vendorId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentAmount: paymentData.paymentAmount,
        currencyId: invoice.currencyId || "default-currency",
        transactionDate: paymentData.paymentDate,
        description: `Payment to ${invoice.vendor.name} for Purchase Invoice ${invoice.invoiceNumber}`,
        paymentMethod: paymentData.paymentMethod,
        bankAccountId: paymentData.bankAccountId,
        paymentReference: paymentData.paymentReference,
        notes: paymentData.notes,
        createdById: processedById
      });
      console.log(`   ✅ Payment Entry Created: ${paymentJournalEntryResult.journalEntry.referenceNumber}`);

      // Use payment entry as the main journal entry reference
      const journalEntryResult = paymentJournalEntryResult;

      // Determine payment status based on amount paid
      let paymentStatus = "PAID";
      if (paymentData.paymentAmount < invoiceTotal) {
        paymentStatus = "PARTIALLY_PAID";
      }

      // Create receipt for payment
      console.log("\n🧾 Step 4: Creating payment receipt...");
      let receiptNumber = `RCP-${invoice.invoiceNumber}-${Date.now()}`;
      
      // Try to create receipt record if receipt model exists
      try {
        // Check if Receipt model exists in schema
        const receiptRecord = await prisma.$queryRaw`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_name = 'receipts'
        `.catch(() => null);
        
        if (receiptRecord && receiptRecord[0]?.count > 0) {
          // Receipt table exists - create receipt
          const receipt = await prisma.receipt.create({
            data: {
              receiptNumber,
              invoiceId: invoice.id,
              vendorId: invoice.vendorId,
              amount: new Decimal(paymentData.paymentAmount),
              paymentMethod: paymentData.paymentMethod,
              paymentDate: paymentData.paymentDate,
              paymentReference: paymentData.paymentReference,
              description: `Payment receipt for Purchase Invoice ${invoice.invoiceNumber}`,
              createdById: processedById
            }
          });
          console.log(`   ✅ Receipt Created: ${receiptNumber}`);
        } else {
          console.log(`   ℹ️  Receipt table not found - using receipt number: ${receiptNumber}`);
        }
      } catch (receiptError: any) {
        // Receipt table might not exist - that's okay, we'll just use the receipt number
        console.log(`   ℹ️  Receipt creation skipped: ${receiptError.message}`);
      }

      console.log("\n📝 Step 5: Updating invoice payment status...");
      console.log(`   New Payment Status: ${paymentStatus}`);
      console.log(`   Payment Date: ${paymentData.paymentDate.toISOString().split('T')[0]}`);
      console.log(`   Taxable: ${isTaxable ? 'YES (15% VAT)' : 'NO'}`);
      if (paymentData.paymentReference) {
        console.log(`   Payment Reference: ${paymentData.paymentReference}`);
      }
      if (paymentData.proofOfPaymentPath) {
        console.log(`   Proof of Payment: ${paymentData.proofOfPaymentPath}`);
      }
      console.log(`   Receipt Number: ${receiptNumber}`);

      // Update invoice with payment details and journal entry
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus,
          paymentDate: paymentData.paymentDate,
          paymentReference: paymentData.paymentReference || receiptNumber, // Store receipt number in payment reference if no ref provided
          journalEntryId: expenseJournalEntry.journalEntry.id, // Link to expense entry
          documentPath: paymentData.proofOfPaymentPath || invoice.documentPath, // Store proof of payment if provided
          documentType: paymentData.proofOfPaymentPath ? (paymentData.proofOfPaymentPath.endsWith('.pdf') ? 'PDF' : 'IMAGE') : invoice.documentType
          // Note: paymentJournalEntryId might not exist in schema, storing receipt number in paymentReference
        },
        include: {
          vendor: true,
          currency: true,
          items: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });
      console.log("   ✅ Invoice updated successfully");

      // Audit log
      console.log("\n📊 Step 6: Creating audit log...");
      await AuditService.log({
        userId: processedById,
        action: "PAYMENT",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: {
          ...updatedInvoice,
          expenseJournalEntry: expenseJournalEntry.journalEntry,
          paymentJournalEntry: journalEntryResult.journalEntry,
          paymentAmount: paymentData.paymentAmount,
          receiptNumber: receiptNumber
        },
      });
      console.log("   ✅ Audit log created");

      // Send email notification to vendor (simulated for testing)
      console.log("\n📧 Step 7: Sending payment confirmation email to vendor...");
      try {
        const { EmailNotificationService } = await import('./EmailNotificationService');
        await EmailNotificationService.sendInvoicePaidEmail({
          vendorName: invoice.vendor.name,
          vendorEmail: invoice.vendor.email || '',
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: paymentData.paymentAmount,
          currencyCode: invoice.currency?.code || "USD",
          paymentDate: paymentData.paymentDate,
          paymentReference: paymentData.paymentReference || receiptNumber,
          paymentMethod: paymentData.paymentMethod,
          isPartialPayment: isPartialPayment,
          remainingBalance: isPartialPayment ? remainingBalance : 0
        });
        console.log("   ✅ Payment confirmation email sent to vendor");
      } catch (emailError: any) {
        console.error("   ⚠️  Failed to send payment confirmation email:", emailError.message);
        // Don't fail the entire payment if email fails
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("✅ PAYMENT PROCESSED SUCCESSFULLY!");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Invoice: ${invoice.invoiceNumber}`);
      console.log(`🏢 Vendor: ${invoice.vendor.name}`);
      console.log(`💰 Amount Paid: $${paymentData.paymentAmount.toFixed(2)}`);
      console.log(`💳 Via: ${paymentData.paymentMethod}${paymentData.paymentReference ? ` (Ref: ${paymentData.paymentReference})` : ''}`);
      console.log(`📊 Payment Status: ${paymentStatus}`);
      console.log(`💵 Remaining Balance: $${remainingBalance.toFixed(2)}`);
      console.log(`🆔 Journal Entry: ${journalEntryResult.journalEntry.referenceNumber}`);
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return {
        invoice: updatedInvoice,
        journalEntry: journalEntryResult.journalEntry,
        paymentAmount: paymentData.paymentAmount,
        remainingBalance: invoiceTotal - paymentData.paymentAmount
      };
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR PROCESSING PAYMENT");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Generate unique invoice number
   */
  private static generateInvoiceNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `INV-${timestamp}-${random}`;
  }

  /**
   * Create a procurement invoice
   */
  static async createProcurementInvoice(params: CreateProcurementInvoiceParams) {
    try {
      const {
        purchaseOrderId,
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        documentPath,
        documentType,
        createdById,
        items
      } = params;

      // Validate vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      // If createdById is not provided (public vendor submission), find a system admin user
      let finalCreatedById = createdById;
      if (!finalCreatedById) {
        const systemUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: 'admin@nvccz.co.zw' },
              { roleCode: 'ADMIN' },
              { role: { name: 'ADMIN' } }
            ]
          },
          select: { id: true }
        });

        if (!systemUser) {
          throw new Error("System user not found. Please contact administrator.");
        }

        finalCreatedById = systemUser.id;
      }

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const taxAmount = subtotal * 0.15; // Assuming 15% tax rate
      const totalAmount = subtotal + taxAmount;

      // Create procurement invoice
      const invoice = await prisma.procurementInvoice.create({
        data: {
          invoiceNumber: this.generateInvoiceNumber(),
          purchaseOrderId,
          vendorId,
          invoiceDate,
          dueDate,
          subtotal: new Decimal(subtotal),
          taxAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          documentPath,
          documentType,
          createdById: finalCreatedById,
          status: "DRAFT", // Start as DRAFT so it can go through approval workflow
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.quantity * item.unitPrice),
              unit: item.unit
            }))
          }
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true
            }
          },
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              status: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
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
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "ProcurementInvoice",
        entityId: invoice.id,
        newValues: invoice,
      });

      return invoice;
    } catch (error) {
      console.error("Error creating procurement invoice:", error);
      throw error;
    }
  }

  /**
   * Create a goods received note
   */
  static async createGoodsReceivedNote(purchaseOrderId: string, receivedById: string, items: {
    purchaseOrderItemId: string;
    quantityReceived: number;
    quantityAccepted: number;
    quantityRejected: number;
    qualityStatus: string;
    qualityNotes?: string;
  }[]) {
    try {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          items: true
        }
      });

      if (!purchaseOrder) {
        throw new Error("Purchase order not found");
      }

      // Create GRN
      const grn = await prisma.goodsReceivedNote.create({
        data: {
          grnNumber: this.generateGRNNumber(),
          purchaseOrderId,
          receivedById,
          status: "RECEIVED",
          qualityStatus: "PENDING",
          items: {
            create: items.map(item => ({
              purchaseOrderItemId: item.purchaseOrderItemId,
              quantityOrdered: new Decimal(0), // Will be populated from PO item
              quantityReceived: new Decimal(item.quantityReceived),
              quantityAccepted: new Decimal(item.quantityAccepted),
              quantityRejected: new Decimal(item.quantityRejected),
              qualityStatus: item.qualityStatus,
              qualityNotes: item.qualityNotes
            }))
          }
        },
        include: {
          purchaseOrder: {
            include: {
              vendor: true,
              items: true
            }
          },
          receivedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: {
            include: {
              purchaseOrderItem: true
            }
          }
        }
      });

      // Update purchase order items with received quantities
      for (const item of items) {
        await prisma.purchaseOrderItem.update({
          where: { id: item.purchaseOrderItemId },
          data: {
            quantityReceived: {
              increment: item.quantityReceived
            },
            quantityPending: {
              decrement: item.quantityReceived
            }
          }
        });
      }

      // Check if all items are received
      const allItemsReceived = await prisma.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId,
          quantityPending: { gt: 0 }
        }
      });

      if (allItemsReceived.length === 0) {
        await prisma.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            status: "RECEIVED",
            actualDeliveryDate: new Date()
          }
        });
      }

      // Audit log
      await AuditService.log({
        userId: receivedById,
        action: "CREATE",
        entityType: "GoodsReceivedNote",
        entityId: grn.id,
        newValues: grn,
      });

      return grn;
    } catch (error) {
      console.error("Error creating goods received note:", error);
      throw error;
    }
  }

  /**
   * Convert a Purchase Order to a Creditor Bill (Invoice) in the Accounting module
   */
  static async convertPOToBill(poId: string, createdById: string) {
    try {
      console.log('\n===============================================================');
      console.log('CONVERTING PURCHASE ORDER TO CREDITOR BILL');
      console.log('===============================================================');
      console.log('PO ID: ' + poId);
      console.log('Created By: ' + createdById);
      console.log('');

      // Step 1: Fetch Purchase Order with all details
      console.log('Step 1: Fetching Purchase Order details...');
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: {
          vendor: true,
          currency: true,
          items: true,
          createdBy: true
        }
      });

      if (!purchaseOrder) {
        throw new Error('Purchase order not found');
      }

      console.log('[OK] Purchase Order found: ' + purchaseOrder.poNumber);
      console.log('   Vendor: ' + purchaseOrder.vendor.name);
      console.log('   Total Amount: $' + Number(purchaseOrder.totalAmount).toFixed(2));
      console.log('   Status: ' + purchaseOrder.status);

      // Step 2: Find or create a generic customer for supplier bills
      // (Invoices require customerId, but we'll mark it as a supplier bill with vendorId)
      console.log('\nStep 2: Finding or creating generic customer for supplier bills...');
      let genericCustomer = await prisma.customer.findFirst({
        where: {
          name: 'Generic Supplier - Internal Use'
        }
      });

      if (!genericCustomer) {
        // Create a generic customer for supplier bills
        genericCustomer = await prisma.customer.create({
          data: {
            name: 'Generic Supplier - Internal Use',
            email: 'suppliers@nvccz.co.zw',
            phone: '+263-XXX-XXX-XXXX',
            address: 'Internal Use Only',
            isActive: true
          }
        });
        console.log('[OK] Created generic customer: ' + genericCustomer.name);
      } else {
        console.log('[OK] Using existing generic customer: ' + genericCustomer.name);
      }

      // Step 3: Calculate invoice amounts
      console.log('\nStep 3: Calculating invoice amounts...');
      const subtotal = Number(purchaseOrder.subtotal);
      const taxAmount = Number(purchaseOrder.taxAmount);
      const totalAmount = Number(purchaseOrder.totalAmount);
      const amount = subtotal; // Base amount before VAT

      console.log('   Subtotal: $' + subtotal.toFixed(2));
      console.log('   Tax Amount: $' + taxAmount.toFixed(2));
      console.log('   Total Amount: $' + totalAmount.toFixed(2));

      // Step 4: Prepare invoice items from PO items
      console.log('\nStep 4: Preparing invoice items from PO items...');
      const invoiceItems = purchaseOrder.items.map(item => ({
        description: item.itemName + (item.description ? ' - ' + item.description : ''),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        vatRate: taxAmount > 0 ? 15 : 0 // Assuming 15% VAT if tax exists
      }));

      console.log('   Items prepared: ' + invoiceItems.length);

      // Step 5: Create Invoice (Creditor Bill) in Accounting module
      console.log('\nStep 5: Creating Creditor Bill (Invoice) in Accounting module...');
      
      // Ensure we have a currency ID
      if (!purchaseOrder.currencyId) {
        // Try to find USD currency as fallback
        const usdCurrency = await prisma.currency.findFirst({
          where: { code: 'USD' }
        });
        if (!usdCurrency) {
          throw new Error('Purchase Order has no currency and USD currency not found. Please set currency on PO.');
        }
        purchaseOrder.currencyId = usdCurrency.id;
        console.log('[OK] Using USD currency as fallback');
      }

      // Generate invoice number
      const invoiceNumber = 'BILL-' + purchaseOrder.poNumber;
      const invoiceDescription = 'Creditor Bill from PO: ' + purchaseOrder.poNumber + ' - ' + purchaseOrder.vendor.name;

      // Create invoice directly (not using InvoiceService which is for sales invoices)
      const invoice = await prisma.invoice.create({
        data: {
          customerId: genericCustomer.id,
          vendorId: purchaseOrder.vendorId, // Mark as supplier bill
          amount: new Decimal(amount),
          vatAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId: purchaseOrder.currencyId,
          transactionDate: purchaseOrder.orderDate,
          description: invoiceDescription,
          items: invoiceItems,
          invoiceNumber: invoiceNumber,
          isTaxable: taxAmount > 0,
          status: 'DRAFT', // Start as DRAFT, will be posted when approved
          outstandingAmount: new Decimal(totalAmount),
          paidAmount: new Decimal(0),
          createdById
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          customer: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          }
        }
      });

      console.log('[OK] Invoice created: ' + invoice.invoiceNumber);
      console.log('   Invoice ID: ' + invoice.id);
      console.log('   Total Amount: $' + Number(invoice.totalAmount).toFixed(2));
      console.log('   Vendor: ' + purchaseOrder.vendor.name);

      // Step 6: Update invoice status to SENT (optional, can be done later)
      console.log('\nStep 6: Updating invoice status to SENT...');
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'SENT' // Mark as SENT so it's available for payment
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          customer: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          }
        }
      });

      console.log('[OK] Invoice status updated to SENT');

      // Step 7: Create audit log
      console.log('\nStep 7: Creating audit log...');
      await AuditService.log({
        userId: createdById,
        action: 'CONVERT_PO_TO_BILL',
        entityType: 'Invoice',
        entityId: updatedInvoice.id,
        newValues: {
          source: 'PurchaseOrder',
          purchaseOrderId: poId,
          purchaseOrderNumber: purchaseOrder.poNumber,
          vendorId: purchaseOrder.vendorId,
          invoiceNumber: updatedInvoice.invoiceNumber
        }
      });
      console.log('[OK] Audit log created');

      console.log('\n===============================================================');
      console.log('SUCCESS: PURCHASE ORDER CONVERTED TO CREDITOR BILL');
      console.log('===============================================================');
      console.log('Purchase Order: ' + purchaseOrder.poNumber);
      console.log('Creditor Bill: ' + updatedInvoice.invoiceNumber);
      console.log('Vendor: ' + purchaseOrder.vendor.name);
      console.log('Total Amount: $' + Number(updatedInvoice.totalAmount).toFixed(2));
      console.log('Status: ' + updatedInvoice.status);
      console.log('===============================================================\n');

      return {
        success: true,
        invoice: updatedInvoice,
        purchaseOrder: {
          id: purchaseOrder.id,
          poNumber: purchaseOrder.poNumber,
          vendor: purchaseOrder.vendor.name
        },
        message: 'Purchase Order converted to Creditor Bill successfully'
      };
    } catch (error: any) {
      console.error('\n===============================================================');
      console.error('ERROR: FAILED TO CONVERT PO TO BILL');
      console.error('===============================================================');
      console.error('Error: ' + error.message);
      console.error('Stack: ' + error.stack);
      console.error('===============================================================\n');
      throw error;
    }
  }

  /**
   * Get procurement dashboard data with detailed information
   */
  static async getProcurementDashboard() {
    try {
      // Get summary counts
      const [
        totalRequisitions,
        pendingRequisitions,
        approvedRequisitions,
        rejectedRequisitions,
        draftRequisitions,
        totalInvoices,
        pendingInvoices,
        approvedInvoices,
        paidInvoices,
        partiallyPaidInvoices,
        totalRFQs,
        activeRFQs,
        totalQuotations,
        pendingQuotations,
        acceptedQuotations,
        rejectedQuotations
      ] = await Promise.all([
        prisma.purchaseRequisition.count(),
        prisma.purchaseRequisition.count({ where: { status: "PENDING_APPROVAL" } }),
        prisma.purchaseRequisition.count({ where: { status: "APPROVED" } }),
        prisma.purchaseRequisition.count({ where: { status: "REJECTED" } }),
        prisma.purchaseRequisition.count({ where: { status: "DRAFT" } }),
        prisma.procurementInvoice.count(),
        prisma.procurementInvoice.count({ where: { status: { in: ["PROCESSING", "MATCHED", "DISCREPANCY"] } } }),
        prisma.procurementInvoice.count({ where: { status: "APPROVED" } }),
        prisma.procurementInvoice.count({ where: { paymentStatus: "PAID" } }),
        prisma.procurementInvoice.count({ where: { paymentStatus: "PARTIALLY_PAID" } }),
        prisma.auditLog.count({ 
          where: { 
            entityType: "RequestForQuotation",
            action: "CREATE"
          }
        }),
        prisma.auditLog.count({
          where: {
            entityType: "RequestForQuotation",
            action: "CREATE",
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          }
        }),
        prisma.vendorQuotation.count(),
        prisma.vendorQuotation.count({ where: { status: "PENDING" } }),
        prisma.vendorQuotation.count({ where: { status: "ACCEPTED" } }),
        prisma.vendorQuotation.count({ where: { status: "REJECTED" } })
      ]);

      // Get recent requisitions with details
      const recentRequisitions = await prisma.purchaseRequisition.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          requisitionNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          department: true, // Scalar field (String), not a relation
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdAt: true,
          updatedAt: true
        }
      });

      // Get requisitions by status
      const requisitionsByStatus = await prisma.purchaseRequisition.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true }
      });

      // Get recent invoices with details
      const recentInvoices = await prisma.procurementInvoice.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          paymentStatus: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          invoiceDate: true,
          paymentDate: true,
          createdAt: true,
          vendor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Get invoices by status
      const invoicesByStatus = await prisma.procurementInvoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true }
      });

      // Get invoices by payment status
      const invoicesByPaymentStatus = await prisma.procurementInvoice.groupBy({
        by: ['paymentStatus'],
        _count: { id: true },
        _sum: { totalAmount: true }
      });

      // Calculate invoice amounts
      const invoiceAmounts = await prisma.procurementInvoice.aggregate({
        _sum: {
          subtotal: true,
          taxAmount: true,
          totalAmount: true
        },
        _avg: {
          totalAmount: true
        }
      });

      // Get paid invoices total
      const paidInvoicesAmount = await prisma.procurementInvoice.aggregate({
        where: {
          paymentStatus: { in: ['PAID', 'PARTIALLY_PAID'] }
        },
        _sum: {
          totalAmount: true
        }
      });

      // Get pending invoices total
      const pendingInvoicesAmount = await prisma.procurementInvoice.aggregate({
        where: {
          paymentStatus: 'PENDING',
          status: 'APPROVED'
        },
        _sum: {
          totalAmount: true
        }
      });

      // Get recent RFQs from audit logs
      const recentRFQsLogs = await prisma.auditLog.findMany({
        where: {
          entityType: "RequestForQuotation",
          action: "CREATE"
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          entityId: true,
          newValues: true,
          createdAt: true,
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

      // Get recent quotations
      const recentQuotations = await prisma.vendorQuotation.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          quotationNumber: true,
          rfqNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          updatedAt: true,
          vendor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Get quotations by status
      const quotationsByStatus = await prisma.vendorQuotation.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true }
      });

      // Get recent payments (invoices with payment status)
      const recentPayments = await prisma.procurementInvoice.findMany({
        where: {
          paymentStatus: { in: ['PAID', 'PARTIALLY_PAID'] }
        },
        take: 10,
        orderBy: { paymentDate: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paymentStatus: true,
          paymentDate: true,
          paymentReference: true,
          vendor: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              code: true,
              symbol: true
            }
          }
        }
      });

      // Get top vendors by invoice count
      const topVendors = await prisma.procurementInvoice.groupBy({
        by: ['vendorId'],
        _count: { id: true },
        _sum: { totalAmount: true },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 5
      });

      // Get vendor details for top vendors
      const vendorIds = topVendors.map(v => v.vendorId);
      const vendors = await prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      const topVendorsWithDetails = topVendors.map(tv => {
        const vendor = vendors.find(v => v.id === tv.vendorId);
        return {
          vendor: vendor || { id: tv.vendorId, name: 'Unknown', email: null },
          invoiceCount: tv._count.id,
          totalAmount: Number(tv._sum.totalAmount || 0)
        };
      });

      return {
        requisitions: {
          summary: {
            total: totalRequisitions,
            pending: pendingRequisitions,
            approved: approvedRequisitions,
            rejected: rejectedRequisitions,
            draft: draftRequisitions
          },
          byStatus: requisitionsByStatus.map(rs => ({
            status: rs.status,
            count: rs._count.id,
            totalAmount: Number(rs._sum.totalAmount || 0)
          })),
          recent: recentRequisitions.map(r => ({
            id: r.id,
            requisitionNumber: r.requisitionNumber,
            title: r.title,
            status: r.status,
            totalAmount: Number(r.totalAmount),
            department: r.department, // String field (department name)
            requestedBy: r.requestedBy,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          }))
        },
        invoices: {
          summary: {
            total: totalInvoices,
            pending: pendingInvoices,
            approved: approvedInvoices,
            paid: paidInvoices,
            partiallyPaid: partiallyPaidInvoices
          },
          amounts: {
            totalSubtotal: Number(invoiceAmounts._sum.subtotal || 0),
            totalTax: Number(invoiceAmounts._sum.taxAmount || 0),
            totalAmount: Number(invoiceAmounts._sum.totalAmount || 0),
            averageAmount: Number(invoiceAmounts._avg.totalAmount || 0),
            paidAmount: Number(paidInvoicesAmount._sum.totalAmount || 0),
            pendingPaymentAmount: Number(pendingInvoicesAmount._sum.totalAmount || 0)
          },
          byStatus: invoicesByStatus.map(is => ({
            status: is.status,
            count: is._count.id,
            totalAmount: Number(is._sum.totalAmount || 0)
          })),
          byPaymentStatus: invoicesByPaymentStatus.map(ps => ({
            paymentStatus: ps.paymentStatus,
            count: ps._count.id,
            totalAmount: Number(ps._sum.totalAmount || 0)
          })),
          recent: recentInvoices.map(inv => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            paymentStatus: inv.paymentStatus,
            subtotal: Number(inv.subtotal),
            taxAmount: Number(inv.taxAmount),
            totalAmount: Number(inv.totalAmount),
            vendor: inv.vendor,
            currency: inv.currency,
            approvedBy: inv.approvedBy,
            invoiceDate: inv.invoiceDate,
            paymentDate: inv.paymentDate,
            createdAt: inv.createdAt
          }))
        },
        rfqs: {
          summary: {
            total: totalRFQs,
            active: activeRFQs
          },
          recent: recentRFQsLogs.map(log => {
            const newValues = log.newValues as any;
            return {
              id: log.entityId,
              rfqNumber: newValues?.rfqNumber || 'N/A',
              createdBy: log.user,
              createdAt: log.createdAt
            };
          })
        },
        quotations: {
          summary: {
            total: totalQuotations,
            pending: pendingQuotations,
            accepted: acceptedQuotations,
            rejected: rejectedQuotations
          },
          byStatus: quotationsByStatus.map(qs => ({
            status: qs.status,
            count: qs._count.id,
            totalAmount: Number(qs._sum.totalAmount || 0)
          })),
          recent: recentQuotations.map(q => ({
            id: q.id,
            quotationNumber: q.quotationNumber,
            rfqNumber: q.rfqNumber,
            status: q.status,
            totalAmount: Number(q.totalAmount),
            vendor: q.vendor,
            createdAt: q.createdAt,
            updatedAt: q.updatedAt
          }))
        },
        payments: {
          recent: recentPayments.map(p => ({
            id: p.id,
            invoiceNumber: p.invoiceNumber,
            totalAmount: Number(p.totalAmount),
            vendor: p.vendor,
            currency: p.currency,
            paymentStatus: p.paymentStatus,
            paymentDate: p.paymentDate,
            paymentReference: p.paymentReference
          }))
        },
        vendors: {
          topVendors: topVendorsWithDetails
        },
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error("Error getting procurement dashboard:", error);
      throw error;
    }
  }
}
