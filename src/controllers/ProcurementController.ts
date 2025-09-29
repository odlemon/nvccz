// @ts-nocheck
import { Request, Response } from "express";
import { ProcurementService } from "../services/ProcurementService";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export class ProcurementController {
  /**
   * Create a new purchase requisition
   */
  static async createPurchaseRequisition(req: Request, res: Response) {
    try {
      const {
        title,
        description,
        departmentId,
        priority,
        justification,
        currencyId,
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

      const requisition = await ProcurementService.createPurchaseRequisition({
        title,
        description,
        departmentId,
        requestedById,
        priority,
        justification,
        currencyId,
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
   * Get all purchase requisitions
   */
  static async getAllPurchaseRequisitions(req: Request, res: Response) {
    try {
      const {
        status,
        departmentId,
        requestedById,
        priority,
        limit = 50,
        offset = 0
      } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (departmentId) where.departmentId = departmentId;
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
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          items: {
            include: {
              preferredVendor: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      res.status(200).json({
        success: true,
        data: requisitions
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
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          items: {
            include: {
              preferredVendor: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
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
   * Create a procurement invoice
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

      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

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
        createdById,
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

      const invoice = await ProcurementService.approveProcurementInvoice(id, approvedById);

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
}
