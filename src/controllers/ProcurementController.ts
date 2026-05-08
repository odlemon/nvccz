// @ts-nocheck
import { Request, Response } from "express";
import { ProcurementService } from "../services/ProcurementService";
import {
  PurchaseInvoiceService,
  DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE,
} from "../services/PurchaseInvoiceService";
import { prisma } from "../utils/database";
import { parseDate } from "../utils/dateHelper";
import { isAdminViewer } from "../services/performanceScorecardSupport";

export class ProcurementController {
  /**
   * Create a new purchase requisition
   */
  static async createPurchaseRequisition(req: Request, res: Response) {
    try {
      const {
        title,
        description,
        department,
        priority,
        justification,
        sourcingCategory,
        items,
        portfolioCompanyId,
        fundId,
        useOfFundsDocumentUrl,
        drawdownRequestAmount,
      } = req.body;

      const requestedById = req.user?.id;

      if (!requestedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!title || !items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Title and items are required"
        });
      }

      if (!department) {
        return res.status(400).json({
          success: false,
          message: "Department is required"
        });
      }

      const requisition = await ProcurementService.createPurchaseRequisition({
        title,
        description,
        department,
        requestedById,
        priority,
        justification,
        sourcingCategory,
        portfolioCompanyId,
        fundId,
        useOfFundsDocumentUrl,
        drawdownRequestAmount,
        items
      });

      res.status(201).json({
        success: true,
        message: "Purchase requisition created successfully",
        data: requisition
      });
    } catch (error: any) {
      console.error("Error creating purchase requisition:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create purchase requisition"
      });
    }
  }

  /**
   * Get my purchase requisitions (created by logged-in user)
   */
  static async getMyPurchaseRequisitions(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const requisitions = await ProcurementService.getMyPurchaseRequisitions(userId);

      res.status(200).json({
        success: true,
        message: "My purchase requisitions retrieved successfully",
        data: requisitions,
        count: requisitions.length
      });
    } catch (error: any) {
      console.error("Error fetching my purchase requisitions:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch my purchase requisitions"
      });
    }
  }

  /**
   * Get pending requisitions for department head (their department only)
   */
  static async getPendingRequisitionsForDepartmentHead(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, roleCode: true, userDepartment: true, departmentRole: true, role: { select: { name: true } } },
      });
      const isAdmin = user ? isAdminViewer(user) || user.roleCode === "ADMIN" : false;

      const requisitions = isAdmin
        ? await prisma.purchaseRequisition.findMany({
            where: { status: "PENDING_APPROVAL" },
            include: {
              requestedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  userDepartment: true,
                  departmentRole: true,
                  roleCode: true,
                },
              },
              approvedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  userDepartment: true,
                  departmentRole: true,
                  roleCode: true,
                },
              },
              currency: { select: { id: true, code: true, name: true, symbol: true } },
              items: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : await ProcurementService.getPendingRequisitionsForDepartmentHead(userId);

      res.status(200).json({
        success: true,
        message: isAdmin
          ? "Pending requisitions retrieved successfully"
          : "Pending requisitions for your department retrieved successfully",
        data: requisitions,
        count: requisitions.length
      });
    } catch (error: any) {
      console.error("Error fetching pending requisitions for department head:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch pending requisitions"
      });
    }
  }

  /**
   * Get all purchase requisitions (filtered by user's department)
   * Only HEAD, DEPUTY, or PROC_MGR can see requisitions
   */
  static async getAllPurchaseRequisitions(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      // Get user's department and role
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          role: { select: { name: true } },
        }
      });

      const isAdmin = user ? isAdminViewer(user) || user.roleCode === "ADMIN" : false;

      if (!user || (!isAdmin && !user.userDepartment)) {
        return res.status(403).json({
          success: false,
          message: "User is not assigned to any department"
        });
      }

      // Check if user can view requisitions (HEAD, DEPUTY, or PROC_MGR)
      const canView = 
        isAdmin ||
        user.departmentRole === 'HEAD' || 
        user.departmentRole === 'DEPUTY' || 
        user.roleCode === 'PROC_MGR';

      if (!canView) {
        return res.status(403).json({
          success: false,
          message: "Only department HEAD, DEPUTY, or PROC_MGR can view requisitions"
        });
      }

      const {
        status,
        requestedById,
        priority,
        limit = 50,
        offset = 0
      } = req.query;

      // Filter by user's department - requisitions target the department
      const where: any = isAdmin
        ? {}
        : { department: user.userDepartment }; // Non-admins are filtered by department name

      if (status) where.status = status;
      if (requestedById) where.requestedById = requestedById;
      if (priority) where.priority = priority;

      if (!isAdmin) {
        await ProcurementService.applyInvesteeFundScopeToDepartmentRequisitionWhere(userId, where);
      }

      const requisitions = await prisma.purchaseRequisition.findMany({
        where,
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
          approvedBy: {
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
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      res.status(200).json({
        success: true,
        message: isAdmin
          ? "Requisitions retrieved successfully"
          : `Requisitions for ${user.userDepartment} department retrieved successfully`,
        data: requisitions,
        count: requisitions.length,
        ...(isAdmin ? {} : { department: user.userDepartment })
      });
    } catch (error: any) {
      console.error("Error getting purchase requisitions:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get purchase requisitions"
      });
    }
  }

  /**
   * Get purchase requisition by ID
   */
  static async getPurchaseRequisitionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const requisition = await prisma.purchaseRequisition.findUnique({
        where: { id },
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
          approvedBy: {
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
          items: true,
          purchaseOrders: {
            include: {
              vendor: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!requisition) {
        return res.status(404).json({
          success: false,
          message: "Purchase requisition not found"
        });
      }

      try {
        await ProcurementService.assertUserCanViewInvesteePurchaseRequisition(userId, {
          portfolioCompanyId: requisition.portfolioCompanyId,
          fundId: requisition.fundId,
          requestedById: requisition.requestedById,
        });
      } catch (accessErr: any) {
        return res.status(403).json({
          success: false,
          message: accessErr?.message || "Not authorized",
        });
      }

      res.status(200).json({
        success: true,
        data: requisition
      });
    } catch (error: any) {
      console.error("Error getting purchase requisition:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get purchase requisition"
      });
    }
  }

  /** Suite 02: investee-linked PRs for VC desk (fund-scoped for FundManagers). */
  static async listInvesteePurchaseRequisitionsForVc(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }
      const rows = await ProcurementService.listInvesteePurchaseRequisitionsForVc(userId);
      return res.status(200).json({
        success: true,
        message: "Investee purchase requisitions retrieved successfully",
        data: rows,
        count: rows.length,
      });
    } catch (error: any) {
      console.error("Error listing investee purchase requisitions:", error);
      const code = error?.message?.includes("Not authorized") ? 403 : 400;
      return res.status(code).json({
        success: false,
        message: error.message || "Failed to list investee requisitions",
      });
    }
  }

  /** Suite 02: SLA — pending VC executive review longer than 48 hours. */
  static async listInvesteePrsPendingVcSlaBreached(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }
      const rows = await ProcurementService.listInvesteePrsPendingVcOver48Hours(userId);
      return res.status(200).json({
        success: true,
        message: "Investee PRs pending VC approval over 48h retrieved successfully",
        data: rows,
        count: rows.length,
      });
    } catch (error: any) {
      console.error("Error listing investee PR SLA breaches:", error);
      const code = error?.message?.includes("Not authorized") ? 403 : 400;
      return res.status(code).json({
        success: false,
        message: error.message || "Failed to list SLA breaches",
      });
    }
  }

  /**
   * Submit a purchase requisition for approval
   */
  static async submitPurchaseRequisition(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const submittedById = req.user?.id;

      if (!submittedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const requisition = await ProcurementService.submitPurchaseRequisition(id, submittedById);

      res.status(200).json({
        success: true,
        message: "Purchase requisition submitted for approval",
        data: requisition
      });
    } catch (error: any) {
      console.error("Error submitting purchase requisition:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to submit purchase requisition"
      });
    }
  }

  /**
   * Approve a purchase requisition
   */
  static async approvePurchaseRequisition(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const approvedById = req.user?.id;

      if (!approvedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const requisition = await ProcurementService.approvePurchaseRequisition(id, approvedById);

      res.status(200).json({
        success: true,
        message: "Purchase requisition approved successfully",
        data: requisition
      });
    } catch (error: any) {
      console.error("Error approving purchase requisition:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to approve purchase requisition"
      });
    }
  }

  /**
   * Reject a purchase requisition
   */
  static async rejectPurchaseRequisition(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { rejectionReason } = req.body;
      const rejectedById = req.user?.id;

      if (!rejectedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required"
        });
      }

      const requisition = await ProcurementService.rejectPurchaseRequisition(id, rejectedById, rejectionReason);

      res.status(200).json({
        success: true,
        message: "Purchase requisition rejected successfully",
        data: requisition
      });
    } catch (error: any) {
      console.error("Error rejecting purchase requisition:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to reject purchase requisition"
      });
    }
  }

  /**
   * Create a purchase order
   */
  static async createPurchaseOrder(req: Request, res: Response) {
    try {
      const {
        requisitionId,
        vendorId,
        priority,
        currencyId,
        expectedDeliveryDate,
        shippingAddress,
        paymentTerms,
        deliveryTerms,
        items
      } = req.body;

      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!vendorId || !items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID and items are required"
        });
      }

      const purchaseOrder = await ProcurementService.createPurchaseOrder({
        requisitionId,
        vendorId,
        priority,
        currencyId,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
        shippingAddress,
        paymentTerms,
        deliveryTerms,
        createdById,
        items
      });

      res.status(201).json({
        success: true,
        message: "Purchase order created successfully",
        data: purchaseOrder
      });
    } catch (error: any) {
      console.error("Error creating purchase order:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create purchase order"
      });
    }
  }

  /**
   * Create and send RFQ to multiple vendors
   */
  static async createAndSendRFQ(req: Request, res: Response) {
    try {
      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const {
        requisitionId,
        title,
        description,
        vendorIds,
        priority,
        expectedDeliveryDate,
        deliveryAddress,
        rfqDeadline,
        specialRequirements,
        items,
        visibility,
        reportingCurrencyId,
        priceWeight,
        technicalWeight,
      } = req.body;

      // Validation
      if (!title || !items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Title and items are required"
        });
      }

      if (!vendorIds || vendorIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one vendor must be selected"
        });
      }

      const rfqResult = await ProcurementService.createAndSendRFQ({
        requisitionId,
        title,
        description,
        vendorIds,
        priority,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
        deliveryAddress,
        rfqDeadline: rfqDeadline ? new Date(rfqDeadline) : undefined,
        specialRequirements,
        createdById,
        items,
        visibility,
        reportingCurrencyId,
        priceWeight,
        technicalWeight,
      });

      res.status(201).json({
        success: true,
        message: `RFQ sent to ${vendorIds.length} vendor(s) successfully`,
        data: rfqResult
      });
    } catch (error: any) {
      console.error("Error creating/sending RFQ:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create/send RFQ"
      });
    }
  }

  /**
   * Get all RFQs
   */
  static async getAllRFQs(req: Request, res: Response) {
    try {
      const { rfqNumber, requisitionId, limit, offset } = req.query;

      const result = await ProcurementService.getAllRFQs({
        rfqNumber: rfqNumber as string,
        requisitionId: requisitionId as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.status(200).json({
        success: true,
        message: "RFQs retrieved successfully",
        data: result.rfqs,
        count: result.count,
        limit: result.limit,
        offset: result.offset
      });
    } catch (error: any) {
      console.error("Error getting RFQs:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get RFQs"
      });
    }
  }

  /**
   * Send purchase order to vendor via email
   */
  static async sendPurchaseOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sentById = req.user?.id;

      if (!sentById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const purchaseOrder = await ProcurementService.sendPurchaseOrder(id, sentById);

      res.status(200).json({
        success: true,
        message: "Purchase order sent to vendor successfully",
        data: purchaseOrder
      });
    } catch (error: any) {
      console.error("Error sending purchase order:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to send purchase order"
      });
    }
  }

  /**
   * Get all purchase orders
   */
  static async getAllPurchaseOrders(req: Request, res: Response) {
    try {
      const {
        status,
        vendorId,
        priority,
        limit = 50,
        offset = 0
      } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (vendorId) where.vendorId = vendorId;
      if (priority) where.priority = priority;

      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
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
          items: true, // Include PO items for GRN creation
          createdBy: {
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
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      res.status(200).json({
        success: true,
        data: purchaseOrders
      });
    } catch (error: any) {
      console.error("Error getting purchase orders:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get purchase orders"
      });
    }
  }

  /**
   * Get a single purchase order by ID (vendor, items, currency, etc.)
   */
  static async getPurchaseOrderById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
            },
          },
          requisition: {
            select: {
              id: true,
              requisitionNumber: true,
              title: true,
            },
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true,
            },
          },
          items: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          sentBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!purchaseOrder) {
        return res.status(404).json({
          success: false,
          message: "Purchase order not found",
        });
      }

      res.status(200).json({
        success: true,
        data: purchaseOrder,
      });
    } catch (error: any) {
      console.error("Error getting purchase order:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get purchase order",
      });
    }
  }

  /**
   * PUBLIC — upload invoice PDF; returns a URL to pass as documentPath on `POST /procurement/invoices`.
   * Multipart field name: `document`. Optional `vendorId` form field for storage path grouping.
   */
  static async uploadVendorInvoiceDocument(req: Request, res: Response) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({
          success: false,
          message: "PDF file required (multipart field name: document)",
        });
      }
      const vendorKey = String(req.body?.vendorId || "public-vendor")
        .trim()
        .replace(/[^a-zA-Z0-9.\-_]/g, "_")
        .slice(0, 64);
      const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
      const { filePath, downloadURL } = await FirebaseStorageService.uploadProcurementVendorInvoice(
        file.buffer,
        file.originalname || "invoice.pdf",
        vendorKey
      );
      res.status(201).json({
        success: true,
        message: "Document uploaded. Use documentUrl as documentPath when creating the invoice.",
        data: {
          documentUrl: downloadURL,
          documentPath: downloadURL,
          filePath,
          documentType: "PDF",
        },
      });
    } catch (error: any) {
      console.error("Error uploading vendor invoice document:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to upload document",
      });
    }
  }

  /**
   * Create a procurement invoice (PUBLIC - vendors submit invoices)
   * Vendors are not logged in, so no authentication required
   */
  static async createProcurementInvoice(req: Request, res: Response) {
    try {
      const {
        purchaseOrderId,
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        documentPath,
        documentType,
        items
      } = req.body;

      // Public endpoint - vendors don't need to be authenticated
      // createdById can be null or we can use a system user ID
      const createdById = req.user?.id || null; // null for vendor submissions

      if (!vendorId || !invoiceDate || !items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID, invoice date, and items are required"
        });
      }

      const invoice = await ProcurementService.createProcurementInvoice({
        purchaseOrderId,
        vendorId,
        invoiceDate: parseDate(invoiceDate),
        dueDate: dueDate ? parseDate(dueDate) : undefined,
        currencyId,
        documentPath,
        documentType,
        createdById: createdById || undefined, // Pass undefined if null
        items
      });

      res.status(201).json({
        success: true,
        message: "Procurement invoice created successfully",
        data: invoice
      });
    } catch (error: any) {
      console.error("Error creating procurement invoice:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create procurement invoice"
      });
    }
  }

  /**
   * Process OCR data for invoice
   */
  static async processOCRData(req: Request, res: Response) {
    try {
      const { invoiceId } = req.params;
      const ocrData = req.body;

      const invoice = await ProcurementService.processOCRData(invoiceId, ocrData);

      res.status(200).json({
        success: true,
        message: "OCR data processed successfully",
        data: invoice
      });
    } catch (error: any) {
      console.error("Error processing OCR data:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to process OCR data"
      });
    }
  }

  /**
   * Perform AI matching for invoice
   */
  static async performAIMatching(req: Request, res: Response) {
    try {
      const { invoiceId } = req.params;
      const aiResult = req.body;

      const invoice = await ProcurementService.performAIMatching(invoiceId, aiResult);

      res.status(200).json({
        success: true,
        message: "AI matching completed successfully",
        data: invoice
      });
    } catch (error: any) {
      console.error("Error performing AI matching:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to perform AI matching"
      });
    }
  }

  /**
   * Approve a procurement invoice
   */
  static async approveProcurementInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const approvedById = req.user?.id;

      if (!approvedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const {
        isTaxable
      } = req.body;

      const invoice = await ProcurementService.approveProcurementInvoice(id, approvedById, {
        isTaxable: isTaxable !== undefined ? Boolean(isTaxable) : undefined
      });

      res.status(200).json({
        success: true,
        message: "Procurement invoice approved successfully",
        data: invoice
      });
    } catch (error: any) {
      console.error("Error approving procurement invoice:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to approve procurement invoice"
      });
    }
  }

  /**
   * PO → Vendor Bill (Accounts Payable): creates a Purchase Invoice from an approved/sent PO.
   * Body: { supplierInvoiceNumber, dueDate? } — line items, qty, and unit prices copy from the PO.
   * POST /api/procurement/purchase-orders/:id/convert-to-bill
   */
  static async convertPOToBill(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { supplierInvoiceNumber, dueDate } = req.body;
      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!supplierInvoiceNumber || !String(supplierInvoiceNumber).trim()) {
        return res.status(400).json({
          success: false,
          message: "supplierInvoiceNumber is required (vendor's invoice reference)"
        });
      }

      const invoice = await PurchaseInvoiceService.createVendorBillFromPurchaseOrder({
        purchaseOrderId: id,
        supplierInvoiceNumber: String(supplierInvoiceNumber).trim(),
        createdById,
        dueDate: dueDate ? parseDate(dueDate) : undefined
      });

      res.status(201).json({
        success: true,
        message: "Vendor bill created from purchase order",
        data: invoice
      });
    } catch (error: any) {
      if (error?.message === DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE) {
        return res.status(400).json({
          success: false,
          message: DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE
        });
      }
      console.error("Error converting PO to bill:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to convert purchase order to vendor bill"
      });
    }
  }

  /**
   * Process payment for an approved procurement invoice
   * POST /api/procurement/invoices/:id/payment
   */
  static async payProcurementInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const processedById = req.user?.id;

      if (!processedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      // Handle file upload
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({
          success: false,
          message: "Proof of payment file is required (PDF or image)"
        });
      }

      // Upload file to Firebase Storage
      let proofOfPaymentPath: string | undefined;
      try {
        const { FirebaseStorageService } = await import('../services/FirebaseStorageService');
        // Create shorter filename to avoid column length issues
        const fileExtension = file.originalname.split('.').pop() || 'pdf';
        const shortInvoiceId = id.substring(0, 12); // Use first 12 chars of invoice ID
        const fileName = `pop-${shortInvoiceId}-${Date.now()}.${fileExtension}`;
        const { filePath, downloadURL } = await FirebaseStorageService.uploadImportFile(
          file.buffer,
          fileName,
          `inv-${shortInvoiceId}`, // Shorter batchId
          processedById.substring(0, 12) // Shorter userId
        );
        // Store the filePath (storage path) instead of downloadURL to avoid column length issues
        // The downloadURL can be retrieved from filePath if needed
        proofOfPaymentPath = filePath; // Store Firebase storage path (shorter than full URL)
      } catch (uploadError: any) {
        console.error("Error uploading proof of payment:", uploadError);
        return res.status(400).json({
          success: false,
          message: `Failed to upload proof of payment: ${uploadError.message}`
        });
      }

      const {
        paymentAmount,
        paymentDate,
        paymentMethod,
        bankAccountId,
        paymentReference,
        notes
      } = req.body;

      // Validation
      if (!paymentAmount || paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid payment amount is required"
        });
      }

      if (!paymentMethod || !["CASH", "BANK"].includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: "Payment method must be either CASH or BANK"
        });
      }

      // Process the payment
      const result = await ProcurementService.payProcurementInvoice(
        id,
        {
          paymentAmount: Number(paymentAmount),
          paymentDate: paymentDate ? parseDate(paymentDate) : new Date(),
          paymentMethod,
          bankAccountId,
          paymentReference,
          proofOfPaymentPath,
          notes
        },
        processedById
      );

      res.status(200).json({
        success: true,
        message: "Payment processed successfully",
        data: {
          invoice: result.invoice,
          journalEntry: {
            id: result.journalEntry.id,
            referenceNumber: result.journalEntry.referenceNumber,
            totalAmount: result.journalEntry.totalAmount
          },
          payment: {
            amount: result.paymentAmount,
            remainingBalance: result.remainingBalance,
            status: result.invoice.paymentStatus
          }
        }
      });
    } catch (error: any) {
      console.error("Error processing procurement invoice payment:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to process payment"
      });
    }
  }

  /**
   * Get all procurement invoices
   */
  static async getAllProcurementInvoices(req: Request, res: Response) {
    try {
      const {
        status,
        vendorId,
        matchingStatus,
        limit = 50,
        offset = 0
      } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (vendorId) where.vendorId = vendorId;
      if (matchingStatus) where.matchingStatus = matchingStatus;

      const invoices = await prisma.procurementInvoice.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
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
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          },
          items: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      // Ensure each invoice in response includes auto-generated invoiceNumber
      const data = (invoices as any[]).map((inv: any) => ({ ...inv, invoiceNumber: inv.invoiceNumber ?? null }));
      res.status(200).json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error("Error getting procurement invoices:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get procurement invoices"
      });
    }
  }

  /**
   * Create a goods received note
   */
  static async createGoodsReceivedNote(req: Request, res: Response) {
    try {
      const {
        purchaseOrderId,
        items,
        receivedDate,
        attachmentUrls,
        latitude,
        longitude,
        geoCapturedAt,
      } = req.body;
      const receivedById = req.user?.id;

      if (!receivedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!purchaseOrderId || !items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Purchase order ID and items are required"
        });
      }

      const grn = await ProcurementService.createGoodsReceivedNote(
        purchaseOrderId,
        receivedById,
        items,
        {
          receivedDate: receivedDate ? new Date(receivedDate) : undefined,
          attachmentUrls,
          latitude: latitude != null ? Number(latitude) : undefined,
          longitude: longitude != null ? Number(longitude) : undefined,
          geoCapturedAt: geoCapturedAt ? new Date(geoCapturedAt) : undefined,
        }
      );

      res.status(201).json({
        success: true,
        message: "Goods received note created successfully",
        data: grn
      });
    } catch (error: any) {
      console.error("Error creating goods received note:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create goods received note"
      });
    }
  }

  /** Shared include shape for GRN API responses (matches create payload). */
  private static readonly grnDetailInclude = {
    purchaseOrder: {
      include: {
        vendor: true,
        items: true,
      },
    },
    receivedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    approvedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    items: {
      include: {
        purchaseOrderItem: true,
      },
    },
    returnToVendors: {
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    },
  } as const;

  /**
   * List goods received notes (procurement staff).
   */
  static async getGoodsReceivedNotes(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      const {
        purchaseOrderId,
        status,
        qualityStatus,
        vendorId,
        submittedByInvestee,
        grnNumber,
        limit = 50,
        offset = 0,
      } = req.query;

      const where: any = {};
      if (purchaseOrderId) where.purchaseOrderId = String(purchaseOrderId);
      if (status) where.status = String(status);
      if (qualityStatus) where.qualityStatus = String(qualityStatus);
      if (grnNumber != null && String(grnNumber).trim() !== "") {
        where.grnNumber = { contains: String(grnNumber).trim() };
      }
      if (vendorId) {
        where.purchaseOrder = { ...(where.purchaseOrder || {}), vendorId: String(vendorId) };
      }
      if (submittedByInvestee !== undefined && submittedByInvestee !== "") {
        const v = String(submittedByInvestee).toLowerCase();
        if (v === "true" || v === "1") where.submittedByInvestee = true;
        else if (v === "false" || v === "0") where.submittedByInvestee = false;
      }

      const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
      const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

      const [rows, total] = await Promise.all([
        prisma.goodsReceivedNote.findMany({
          where,
          include: ProcurementController.grnDetailInclude as any,
          orderBy: { createdAt: "desc" },
          take,
          skip,
        }),
        prisma.goodsReceivedNote.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: rows,
        total,
        limit: take,
        offset: skip,
      });
    } catch (error: any) {
      console.error("Error listing goods received notes:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to list goods received notes",
      });
    }
  }

  /**
   * Get one goods received note by id.
   */
  static async getGoodsReceivedNoteById(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      const { id } = req.params;
      const grn = await prisma.goodsReceivedNote.findUnique({
        where: { id },
        include: ProcurementController.grnDetailInclude as any,
      });

      if (!grn) {
        return res.status(404).json({ success: false, message: "Goods received note not found" });
      }

      res.status(200).json({ success: true, data: grn });
    } catch (error: any) {
      console.error("Error getting goods received note:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get goods received note",
      });
    }
  }

  /**
   * Get procurement dashboard data
   */
  static async getProcurementDashboard(req: Request, res: Response) {
    try {
      const viewerUserId = req.user?.id;
      if (!viewerUserId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }
      const dashboard = await ProcurementService.getProcurementDashboard(viewerUserId);

      res.status(200).json({
        success: true,
        data: dashboard
      });
    } catch (error: any) {
      console.error("Error getting procurement dashboard:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get procurement dashboard"
      });
    }
  }

  /**
   * Get all procurement invoice payments
   */
  static async getAllPayments(req: Request, res: Response) {
    try {
      const {
        paymentStatus,
        vendorId,
        paymentMethod,
        startDate,
        endDate,
        limit = 50,
        offset = 0
      } = req.query;

      const where: any = {
        paymentStatus: {
          in: ['PAID', 'PARTIALLY_PAID']
        }
      };

      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (vendorId) where.vendorId = vendorId;
      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = new Date(startDate as string);
        if (endDate) where.paymentDate.lte = new Date(endDate as string);
      }

      const [invoices, total] = await Promise.all([
        prisma.procurementInvoice.findMany({
          where,
          take: Number(limit),
          skip: Number(offset),
          orderBy: { paymentDate: 'desc' },
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
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
            journalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true,
                transactionDate: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.procurementInvoice.count({ where })
      ]);

      // Filter by payment method if provided (this is stored in journal entries)
      let filteredInvoices = invoices;
      if (paymentMethod) {
        const journalEntryIds = invoices
          .filter(inv => inv.journalEntry)
          .map(inv => inv.journalEntry!.id);

        if (journalEntryIds.length > 0) {
          const journalEntries = await prisma.journalEntry.findMany({
            where: {
              id: { in: journalEntryIds }
            },
            include: {
              journalEntryLines: {
                include: {
                  chartOfAccount: true
                }
              }
            }
          });

          // Check if journal entry has payment method account (Bank/Cash)
          const matchingEntryIds = journalEntries
            .filter(entry => {
              const hasPaymentAccount = entry.journalEntryLines.some(line => {
                const accountName = line.chartOfAccount.accountName.toLowerCase();
                if (paymentMethod === 'BANK') {
                  return accountName.includes('bank') && !accountName.includes('cash');
                } else if (paymentMethod === 'CASH') {
                  return accountName.includes('cash') || accountName.includes('petty');
                }
                return false;
              });
              return hasPaymentAccount;
            })
            .map(entry => entry.id);

          filteredInvoices = invoices.filter(inv => 
            inv.journalEntry && matchingEntryIds.includes(inv.journalEntry.id)
          );
        } else {
          filteredInvoices = [];
        }
      }

      res.status(200).json({
        success: true,
        message: "Payments retrieved successfully",
        data: {
          payments: filteredInvoices.map(inv => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            vendor: inv.vendor,
            subtotal: Number(inv.subtotal),
            taxAmount: Number(inv.taxAmount),
            totalAmount: Number(inv.totalAmount),
            currency: inv.currency,
            paymentStatus: inv.paymentStatus,
            paymentDate: inv.paymentDate,
            paymentReference: inv.paymentReference,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            documentPath: inv.documentPath,
            documentType: inv.documentType,
            journalEntry: inv.journalEntry,
            createdBy: inv.createdBy,
            createdAt: inv.createdAt
          })),
          total: filteredInvoices.length,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error: any) {
      console.error("Error getting payments:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get payments"
      });
    }
  }

  /** Suite 03 — comparison matrix */
  static async getRfqComparisonMatrix(req: Request, res: Response) {
    try {
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const data = await ProcurementRfqService.getComparisonMatrix(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async awardRfq(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const { winningQuotationId, awardRationale } = req.body;
      if (!winningQuotationId || !awardRationale) {
        return res.status(400).json({ success: false, message: "winningQuotationId and awardRationale required" });
      }
      const data = await ProcurementRfqService.awardRfq({
        procurementRfqId: req.params.id,
        winningQuotationId,
        awardRationale,
        awardedById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async patchRfqExtend(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const { newClosingAt } = req.body;
      if (!newClosingAt) return res.status(400).json({ success: false, message: "newClosingAt required" });
      const data = await ProcurementRfqService.extendClosing({
        procurementRfqId: req.params.id,
        newClosingAt: new Date(newClosingAt),
        extendedById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async postRfqClarification(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const { body, attachmentUrl } = req.body;
      if (!body) return res.status(400).json({ success: false, message: "body required" });
      const row = await ProcurementRfqService.addClarification({
        procurementRfqId: req.params.id,
        authorType: "STAFF",
        body,
        attachmentUrl,
        userId,
      });
      res.status(201).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getRfqClarifications(req: Request, res: Response) {
    try {
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const data = await ProcurementRfqService.listClarifications(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /** Suite 04 — PO PDF */
  static async getPurchaseOrderPdf(req: Request, res: Response) {
    try {
      const { ProcurementPoPdfService } = await import("../services/ProcurementPoPdfService");
      const buf = await ProcurementPoPdfService.renderPurchaseOrderPdf(req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="po-${req.params.id}.pdf"`);
      res.send(buf);
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async verifyPurchaseOrderToken(req: Request, res: Response) {
    try {
      const { token } = req.query;
      const { prisma } = await import("../utils/database");
      const po = await prisma.purchaseOrder.findFirst({
        where: { poPdfVerificationToken: String(token) },
        select: { id: true, poNumber: true, status: true },
      });
      if (!po) return res.status(404).json({ success: false, message: "Invalid token" });
      res.json({ success: true, data: po });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async cancelPurchaseOrderLine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementService } = await import("../services/ProcurementService");
      const data = await ProcurementService.cancelPurchaseOrderLine(
        req.params.poId,
        req.params.lineId,
        userId
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createGrnReturnToVendor(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementService } = await import("../services/ProcurementService");
      const { goodsReceivedNoteId, purchaseOrderItemId, quantity, reason } = req.body;
      if (!goodsReceivedNoteId || !purchaseOrderItemId) {
        return res.status(400).json({
          success: false,
          message: "goodsReceivedNoteId and purchaseOrderItemId are required",
        });
      }
      const data = await ProcurementService.createGrnReturnToVendor({
        goodsReceivedNoteId,
        purchaseOrderItemId,
        quantity,
        reason,
        createdById: userId,
      });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
