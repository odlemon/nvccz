// @ts-nocheck
import { Request, Response } from "express";
import { ProcurementService } from "../services/ProcurementService";
import { prisma } from "../utils/database";

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
        items
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

      const requisitions = await ProcurementService.getPendingRequisitionsForDepartmentHead(userId);

      res.status(200).json({
        success: true,
        message: "Pending requisitions for your department retrieved successfully",
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
          roleCode: true
        }
      });

      if (!user || !user.userDepartment) {
        return res.status(403).json({
          success: false,
          message: "User is not assigned to any department"
        });
      }

      // Check if user can view requisitions (HEAD, DEPUTY, or PROC_MGR)
      const canView = 
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
      const where: any = {
        department: user.userDepartment // Requisitions are filtered by department name
      };

      if (status) where.status = status;
      if (requestedById) where.requestedById = requestedById;
      if (priority) where.priority = priority;

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
        message: `Requisitions for ${user.userDepartment} department retrieved successfully`,
        data: requisitions,
        count: requisitions.length,
        department: user.userDepartment
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
        items
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
        items
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
        invoiceDate: new Date(invoiceDate),
        dueDate: dueDate ? new Date(dueDate) : undefined,
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
   * Convert a Purchase Order to a Creditor Bill (Invoice)
   * POST /api/procurement/purchase-orders/:id/convert-to-bill
   */
  static async convertPOToBill(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await ProcurementService.convertPOToBill(id, createdById);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error: any) {
      console.error("Error converting PO to bill:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to convert purchase order to creditor bill"
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
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
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

      res.status(200).json({
        success: true,
        data: invoices
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
      const { purchaseOrderId, items } = req.body;
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

      const grn = await ProcurementService.createGoodsReceivedNote(purchaseOrderId, receivedById, items);

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

  /**
   * Get procurement dashboard data
   */
  static async getProcurementDashboard(req: Request, res: Response) {
    try {
      const dashboard = await ProcurementService.getProcurementDashboard();

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
}
