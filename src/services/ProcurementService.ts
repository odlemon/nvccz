// @ts-nocheck
import { PrismaClient, Decimal } from "@prisma/client";
import { dbConnection } from "../utils/database";
import JournalEntryService from "./JournalEntryService";
import AuditService from "./AuditService";
import { ApprovalService } from "./ApprovalService";

const prisma = dbConnection.getPrismaClient();

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
  rfqId?: string; // Link to RFQ if created from RFQ response
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
  createdById: string;
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

      // Trigger approval workflow
      console.log("🔄 Initiating approval workflow...");
      const approvalResult = await ApprovalService.createApprovalRequest({
        stageType: "PURCHASE_REQUISITION",
        entityId: requisition.id,
        entityData: {
          requisitionNumber: requisition.requisitionNumber,
          title: requisition.title,
          department: requisition.department,
          totalAmount: requisition.totalAmount.toString(),
          itemCount: items.length
        },
        requestedById: requestedById,
        department: department as any // Cast to Department enum for filtering
      });

      // Update requisition status based on approval workflow
      let updatedRequisition;
      if (approvalResult) {
        // Approval workflow created - update status to PENDING_APPROVAL
        updatedRequisition = await prisma.purchaseRequisition.update({
          where: { id: requisition.id },
          data: { status: "PENDING_APPROVAL" },
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
            items: true
          }
        });
        console.log("✅ Requisition status updated to PENDING_APPROVAL");
      } else {
        // No approval stages configured - keep as DRAFT
        updatedRequisition = requisition;
        console.log("⚠️  No approval stages configured - Requisition remains in DRAFT status");
        console.log("    Submit the requisition using /submit endpoint to initiate approval");
      }

      return updatedRequisition;
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
          department: {
            select: {
              id: true,
              name: true
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
        where: { id: requisitionId }
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      if (requisition.status !== "DRAFT") {
        throw new Error("Requisition is not in draft status");
      }

      const updatedRequisition = await prisma.purchaseRequisition.update({
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
   * Create a purchase order from an approved requisition
   */
  static async createPurchaseOrder(params: CreatePurchaseOrderParams) {
    try {
      const {
        requisitionId,
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
   */
  static async approveProcurementInvoice(invoiceId: string, approvedById: string) {
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
      if (invoice.status !== "MATCHED" && invoice.status !== "DISCREPANCY") {
        console.error(`❌ VALIDATION FAILED: Invoice status is "${invoice.status}", must be "MATCHED" or "DISCREPANCY"`);
        throw new Error("Invoice is not ready for approval");
      }
      console.log("   ✅ Invoice is ready for approval");

      // Create journal entry for the invoice
      // Use "CREDIT" payment method to create liability in Accounts Payable
      // (Not "BANK" which would immediately reduce cash - that happens at payment time)
      console.log("\n💰 Step 3: Creating journal entry (EXPENSE + LIABILITY)...");
      console.log("   This will:");
      console.log(`   • DEBIT Expense Account: $${Number(invoice.subtotal).toFixed(2)}`);
      console.log(`   • DEBIT VAT Input Account: $${Number(invoice.taxAmount).toFixed(2)}`);
      console.log(`   • CREDIT Accounts Payable: $${Number(invoice.totalAmount).toFixed(2)} (Creates liability)`);
      console.log("");
      console.log("   📝 Using CREDIT payment method (not BANK)");
      console.log("   ℹ️  This creates a liability without immediately reducing cash");
      console.log("   ℹ️  Cash will be reduced later when payment is processed");
      console.log("");

      const journalEntryParams = {
        vendorId: invoice.vendorId,
        categoryId: "PROCUREMENT", // You might want to create a specific category
        amount: Number(invoice.subtotal),
        vatAmount: Number(invoice.taxAmount),
        totalAmount: Number(invoice.totalAmount),
        currencyId: invoice.currencyId || "default-currency",
        transactionDate: invoice.invoiceDate,
        description: `Procurement Invoice: ${invoice.invoiceNumber}`,
        receiptNumber: invoice.invoiceNumber,
        isTaxable: Number(invoice.taxAmount) > 0,
        paymentMethod: "CREDIT" as const, // ✅ FIXED: Creates Accounts Payable liability
        createdById: approvedById
      };

      const journalEntryResult = await JournalEntryService.createExpenseJournalEntry(journalEntryParams);
      console.log(`   ✅ Journal Entry Created: ${journalEntryResult.journalEntry.referenceNumber}`);

      console.log("\n📝 Step 4: Updating invoice status...");
      console.log("   New Status: APPROVED");
      console.log("   Payment Status: PENDING (awaiting payment)");
      
      // Update invoice with approval and journal entry
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "APPROVED",
          approvedById,
          approvedAt: new Date(),
          journalEntryId: journalEntryResult.journalEntry.id,
          paymentStatus: "PENDING"
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

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("✅ INVOICE APPROVED SUCCESSFULLY!");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Invoice: ${invoice.invoiceNumber}`);
      console.log(`🏢 Vendor: ${invoice.vendor.name}`);
      console.log(`💰 Total Amount: $${Number(invoice.totalAmount).toFixed(2)}`);
      console.log(`📊 Status: APPROVED`);
      console.log(`💳 Payment Status: PENDING`);
      console.log(`🆔 Journal Entry: ${journalEntryResult.journalEntry.referenceNumber}`);
      console.log("");
      console.log("📌 ACCOUNTING IMPACT:");
      console.log(`   • Expense Recognized: $${Number(invoice.subtotal).toFixed(2)}`);
      console.log(`   • VAT Input (Recoverable): $${Number(invoice.taxAmount).toFixed(2)}`);
      console.log(`   • Accounts Payable (Liability): $${Number(invoice.totalAmount).toFixed(2)}`);
      console.log("");
      console.log("⏭️  NEXT STEP: Process payment to clear the liability");
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
      console.log(`   Total Amount: $${Number(invoice.totalAmount).toFixed(2)}`);
      console.log(`   Status: ${invoice.status}`);
      console.log(`   Payment Status: ${invoice.paymentStatus}`);

      // Validation checks
      console.log("\n🔒 Step 2: Validating payment request...");
      
      if (invoice.status !== "APPROVED") {
        console.error(`❌ VALIDATION FAILED: Invoice status is "${invoice.status}", must be "APPROVED"`);
        throw new Error("Invoice must be approved before payment can be processed");
      }
      console.log("   ✅ Invoice is approved");

      if (invoice.paymentStatus === "PAID") {
        console.error("❌ VALIDATION FAILED: Invoice has already been paid");
        throw new Error("Invoice has already been paid");
      }
      console.log("   ✅ Invoice is not already paid");

      // Validate payment amount
      const invoiceTotal = Number(invoice.totalAmount);
      if (paymentData.paymentAmount > invoiceTotal) {
        console.error(`❌ VALIDATION FAILED: Payment amount ($${paymentData.paymentAmount}) exceeds invoice total ($${invoiceTotal})`);
        throw new Error(`Payment amount ($${paymentData.paymentAmount}) cannot exceed invoice total ($${invoiceTotal})`);
      }
      console.log(`   ✅ Payment amount valid ($${paymentData.paymentAmount.toFixed(2)} <= $${invoiceTotal.toFixed(2)})`);

      // Determine payment type
      const isPartialPayment = paymentData.paymentAmount < invoiceTotal;
      const remainingBalance = invoiceTotal - paymentData.paymentAmount;
      
      if (isPartialPayment) {
        console.log(`   ℹ️  PARTIAL PAYMENT: Paying $${paymentData.paymentAmount.toFixed(2)} of $${invoiceTotal.toFixed(2)}`);
        console.log(`   ℹ️  Remaining Balance: $${remainingBalance.toFixed(2)}`);
      } else {
        console.log(`   ℹ️  FULL PAYMENT: Paying entire invoice amount`);
      }

      console.log("\n💰 Step 3: Creating payment journal entry...");
      console.log("   This will:");
      console.log(`   • DEBIT Accounts Payable (reduce liability): $${paymentData.paymentAmount.toFixed(2)}`);
      console.log(`   • CREDIT ${paymentData.paymentMethod} Account (reduce cash): $${paymentData.paymentAmount.toFixed(2)}`);
      
      // Create vendor payment journal entry
      const journalEntryResult = await JournalEntryService.createVendorPaymentJournalEntry({
        vendorId: invoice.vendorId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentAmount: paymentData.paymentAmount,
        currencyId: invoice.currencyId || "default-currency",
        transactionDate: paymentData.paymentDate,
        description: `Payment to ${invoice.vendor.name} for invoice ${invoice.invoiceNumber}`,
        paymentMethod: paymentData.paymentMethod,
        bankAccountId: paymentData.bankAccountId,
        paymentReference: paymentData.paymentReference,
        notes: paymentData.notes,
        createdById: processedById
      });

      // Determine payment status based on amount paid
      let paymentStatus = "PAID";
      if (paymentData.paymentAmount < invoiceTotal) {
        paymentStatus = "PARTIALLY_PAID";
      }

      console.log("\n📝 Step 4: Updating invoice payment status...");
      console.log(`   New Payment Status: ${paymentStatus}`);
      console.log(`   Payment Date: ${paymentData.paymentDate.toISOString().split('T')[0]}`);
      if (paymentData.paymentReference) {
        console.log(`   Payment Reference: ${paymentData.paymentReference}`);
      }

      // Update invoice with payment details
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus,
          paymentDate: paymentData.paymentDate,
          paymentReference: paymentData.paymentReference
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
        userId: processedById,
        action: "PAYMENT",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: {
          ...updatedInvoice,
          paymentJournalEntry: journalEntryResult.journalEntry,
          paymentAmount: paymentData.paymentAmount
        },
      });
      console.log("   ✅ Audit log created");

      // Send email notification to vendor
      console.log("\n📧 Step 6: Sending payment confirmation email to vendor...");
      try {
        const { EmailNotificationService } = await import('./EmailNotificationService');
        await EmailNotificationService.sendInvoicePaidEmail({
          vendorName: invoice.vendor.name,
          vendorEmail: invoice.vendor.email,
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: paymentData.paymentAmount,
          currencyCode: invoice.currency?.code || "USD",
          paymentDate: paymentData.paymentDate,
          paymentReference: paymentData.paymentReference,
          paymentMethod: paymentData.paymentMethod
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
          createdById,
          status: "RECEIVED",
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
   * Get procurement dashboard data
   */
  static async getProcurementDashboard() {
    try {
      const [
        totalRequisitions,
        pendingRequisitions,
        approvedRequisitions,
        totalPurchaseOrders,
        pendingPOs,
        receivedPOs,
        totalInvoices,
        pendingInvoices,
        approvedInvoices,
        totalGRNs,
        pendingGRNs
      ] = await Promise.all([
        prisma.purchaseRequisition.count(),
        prisma.purchaseRequisition.count({ where: { status: "PENDING_APPROVAL" } }),
        prisma.purchaseRequisition.count({ where: { status: "APPROVED" } }),
        prisma.purchaseOrder.count(),
        prisma.purchaseOrder.count({ where: { status: "SENT" } }),
        prisma.purchaseOrder.count({ where: { status: "RECEIVED" } }),
        prisma.procurementInvoice.count(),
        prisma.procurementInvoice.count({ where: { status: "PROCESSING" } }),
        prisma.procurementInvoice.count({ where: { status: "APPROVED" } }),
        prisma.goodsReceivedNote.count(),
        prisma.goodsReceivedNote.count({ where: { status: "RECEIVED" } })
      ]);

      return {
        requisitions: {
          total: totalRequisitions,
          pending: pendingRequisitions,
          approved: approvedRequisitions
        },
        purchaseOrders: {
          total: totalPurchaseOrders,
          pending: pendingPOs,
          received: receivedPOs
        },
        invoices: {
          total: totalInvoices,
          pending: pendingInvoices,
          approved: approvedInvoices
        },
        grns: {
          total: totalGRNs,
          pending: pendingGRNs
        }
      };
    } catch (error) {
      console.error("Error getting procurement dashboard:", error);
      throw error;
    }
  }
}
