// @ts-nocheck
import { Request, Response } from "express";
import { supplierVisibleStatus } from "../utils/supplierVisibility";
import { VendorGateService } from "../services/VendorGateService";
import { VendorPaymentFileService } from "../services/VendorPaymentFileService";
import { ProcurementService } from "../services/ProcurementService";
import {
  PurchaseInvoiceService,
  DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE,
} from "../services/PurchaseInvoiceService";
import { prisma } from "../utils/database";
import { parseDate } from "../utils/dateHelper";
import { hasUsableRfqItemLines } from "../utils/rfqItemInput";
import { isModulePrivilegedUser, userHasEffectivePermission } from "../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS } from "../config/procurementPermissions";
import { publicErrorMessage } from "../utils/publicErrorMessage";

import { PurchaseOrderControlService } from "../services/p2p/PurchaseOrderControlService";

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
        projectId,
        items,
        portfolioCompanyId,
        fundId,
        useOfFundsDocumentUrl,
        drawdownRequestAmount,
        branch,
        businessUnit,
        costCentre,
        budgetCode,
        deliveryLocation,
        planItemId,
        currencyId,
        requiredDate,
        procurementMethod,
        riskLevel,
        exceptionType,
        suggestedVendorId,
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
        projectId,
        portfolioCompanyId,
        fundId,
        useOfFundsDocumentUrl,
        drawdownRequestAmount,
        branch,
        businessUnit,
        costCentre,
        budgetCode,
        deliveryLocation,
        planItemId,
        currencyId,
        requiredDate,
        procurementMethod,
        riskLevel,
        exceptionType,
        suggestedVendorId,
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
        message: publicErrorMessage(error, "Failed to create purchase requisition")
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
        message: publicErrorMessage(error, "Failed to fetch my purchase requisitions")
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
      const isAdmin = user ? isModulePrivilegedUser(user) : false;

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

      if (isAdmin) {
        const { ProcurementRequisitionApprovalService } = await import("../services/ProcurementRequisitionApprovalService");
        await ProcurementRequisitionApprovalService.attachRoutes(requisitions);
      }

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
        message: publicErrorMessage(error, "Failed to fetch pending requisitions")
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

      const isAdmin = user ? isModulePrivilegedUser(user) : false;
      // The procurement desk works from every department's requisitions, not only its own.
      const canViewAll = userHasEffectivePermission(
        (req as any).user,
        PROCUREMENT_PERMISSIONS.requisitionsViewAll,
      );

      if (!user || (!isAdmin && !canViewAll && !user.userDepartment)) {
        return res.status(403).json({
          success: false,
          message: "User is not assigned to any department"
        });
      }

      // Check if user can view requisitions (HEAD, DEPUTY, or PROC_MGR)
      const canView =
        isAdmin ||
        canViewAll ||
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
      const where: any = isAdmin || canViewAll
        ? {}
        : { department: user.userDepartment }; // Non-admins are filtered by department name

      // Unsubmitted drafts are not listed here (approvers / dept view). Use GET /requisitions/my for own drafts.
      if (status) {
        if (String(status).toUpperCase() === "DRAFT") {
          return res.status(400).json({
            success: false,
            message:
              "Draft purchase requisitions are not returned on this endpoint. Use GET /api/procurement/requisitions/my for requisitions you created (including drafts).",
          });
        }
        where.status = status;
      } else {
        where.status = { not: "DRAFT" };
      }
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

      const { ProcurementRequisitionApprovalService } = await import("../services/ProcurementRequisitionApprovalService");
      await ProcurementRequisitionApprovalService.attachRoutes(requisitions);

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
        message: publicErrorMessage(error, "Failed to get purchase requisitions")
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
        message: publicErrorMessage(error, "Failed to get purchase requisition")
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
        message: publicErrorMessage(error, "Failed to list investee requisitions"),
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
        message: publicErrorMessage(error, "Failed to list SLA breaches"),
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
        message: publicErrorMessage(error, "Failed to submit purchase requisition")
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
        message:
          requisition?.status === "PENDING_APPROVAL"
            ? `Approved at this step; it now waits for ${requisition?.approvalRoute?.waitingOn?.who ?? "the next step"}`
            : "Purchase requisition approved successfully",
        data: requisition
      });
    } catch (error: any) {
      console.error("Error approving purchase requisition:", error);
      res.status((error as any)?.statusCode || 400).json({
        code: (error as any)?.code,
        success: false,
        message: publicErrorMessage(error, "Failed to approve purchase requisition")
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
        message: publicErrorMessage(error, "Failed to reject purchase requisition")
      });
    }
  }

  /**
   * Update own purchase requisition while DRAFT or REJECTED (required before resubmit if rejected).
   */
  static async updatePurchaseRequisition(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const requisition = await ProcurementService.updatePurchaseRequisitionByOwner(id, userId, req.body || {});

      res.status(200).json({
        success: true,
        message: "Purchase requisition updated successfully",
        data: requisition
      });
    } catch (error: any) {
      console.error("Error updating purchase requisition:", error);
      res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Failed to update purchase requisition")
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
        quotationId,
        vendorId,
        priority,
        currencyId,
        expectedDeliveryDate,
        shippingAddress,
        paymentTerms,
        deliveryTerms,
        costCentre,
        budgetCode,
        glCode,
        purchaseConditions,
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

      // A direct order (no accepted quotation) is raised from an approved requisition, and only once:
      // the requisition is marked converted below so it cannot be ordered, or sent to RFQ, again.
      const directFromRequisition = Boolean(requisitionId) && !quotationId;
      if (directFromRequisition) {
        const reqRow = await prisma.purchaseRequisition.findUnique({
          where: { id: String(requisitionId) },
          select: { status: true, requisitionNumber: true },
        });
        if (!reqRow) {
          return res.status(404).json({ success: false, message: "Purchase requisition not found" });
        }
        if (String(reqRow.status).toUpperCase() !== "APPROVED") {
          return res.status(400).json({
            success: false,
            message: `Only an approved requisition can be ordered directly (${reqRow.requisitionNumber} is ${reqRow.status}).`,
          });
        }
      }

      const purchaseOrder = await ProcurementService.createPurchaseOrder({
        requisitionId,
        quotationId: quotationId ? String(quotationId).trim() : undefined,
        vendorId,
        priority,
        currencyId,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
        shippingAddress,
        paymentTerms,
        deliveryTerms,
        costCentre,
        budgetCode,
        glCode,
        purchaseConditions,
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
        message: publicErrorMessage(error, "Failed to create purchase order")
      });
    }
  }

  /**
   * Create and send RFQ to multiple vendors
   */
  /** The currencies an RFQ can be quoted in: the active ones set up in Accounting (code and name). */
  static async listRfqCurrencies(_req: Request, res: Response) {
    try {
      const rows = await prisma.currency.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } });
      res.json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Could not list currencies" });
    }
  }

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
        requisitionId: requisitionIdRaw,
        purchaseRequisitionId,
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
        procurementMethod,
      } = req.body;

      const requisitionId = requisitionIdRaw || purchaseRequisitionId;

      // The RFQ builder names the quoting currency by code (USD, ZiG, ZAR); the RFQ keeps the currency's id.
      let rfqCurrencyId = reportingCurrencyId;
      const rfqCurrencyCode = String(req.body?.reportingCurrencyCode ?? "").trim();
      if (!rfqCurrencyId && rfqCurrencyCode) {
        const currency = await prisma.currency.findFirst({ where: { code: rfqCurrencyCode } });
        if (!currency) {
          return res.status(400).json({ success: false, message: `Currency ${rfqCurrencyCode} is not set up.` });
        }
        rfqCurrencyId = currency.id;
      }

      // Validation: title + vendors always; items optional when requisitionId (PR lines used)
      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Title is required"
        });
      }

      if (!vendorIds || vendorIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one vendor must be selected"
        });
      }

      const hasItems = hasUsableRfqItemLines(items);
      if (!hasItems && !requisitionId) {
        return res.status(400).json({
          success: false,
          message:
            "Items are required unless requisitionId is provided (approved PR line items will be used).",
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
        reportingCurrencyId: rfqCurrencyId,
        priceWeight,
        technicalWeight,
        saveAsDraft: req.body?.saveAsDraft === true || String(req.body?.saveAsDraft) === "true",
        procurementMethod:
          procurementMethod != null && String(procurementMethod).trim() !== ""
            ? String(procurementMethod).trim()
            : String(req.body?.method || "").trim() || undefined,
      });

      res.status(201).json({
        success: true,
        message: req.body?.saveAsDraft === true ? "RFQ saved as a draft" : `RFQ sent to ${vendorIds.length} vendor(s) successfully`,
        data: rfqResult
      });
    } catch (error: any) {
      console.error("Error creating/sending RFQ:", error);
      res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Failed to create/send RFQ")
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

      // §16: each event says what phase it is in and how many submissions it holds (a count, never their content), and what the
      // signed-in person may do with it, so the screens never need to read sealed data to draw a register.
      const { phaseOf, SourcingAccessService } = await import("../services/sourcing/SourcingAccessService");
      // A committee member without the view grant sees only the events they sit on.
      const { userHasEffectivePermission: canViewRfqs, isModulePrivilegedUser: isPrivileged } = await import("../config/cfoModulePermissions");
      if (!isPrivileged((req as any).user) && !canViewRfqs((req as any).user, "procurement.rfq.view")) {
        const mine = new Set((await prisma.rfqEvaluationMember.findMany({ where: { userId: (req as any).user?.id }, select: { rfqId: true } })).map((m) => m.rfqId));
        result.rfqs = (result.rfqs as any[]).filter((r) => mine.has(r.id)) as any;
      }
      const ids = (result.rfqs as any[]).map((r) => r.id);
      const counts = ids.length
        ? await prisma.vendorQuotation.groupBy({ by: ["procurementRfqId"], where: { procurementRfqId: { in: ids }, status: { in: ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"] } }, _count: { id: true } })
        : [];
      const memberOf = new Set((await prisma.rfqEvaluationMember.findMany({ where: { userId: (req as any).user?.id, rfqId: { in: ids } }, select: { rfqId: true } })).map((m) => m.rfqId));
      // The list rows do not carry the sealing fields the access rules read, so take them from the events themselves.
      const full = ids.length ? await prisma.procurementRfq.findMany({ where: { id: { in: ids } } }) : [];
      const decorated = [];
      for (const listed of result.rfqs as any[]) {
        const r = { ...listed, ...(full.find((f) => f.id === listed.id) ?? {}), id: listed.id };
        const ctx = await SourcingAccessService.resolve((req as any).user, r);
        decorated.push({
          ...listed,
          sourcing: {
            phase: phaseOf(r),
            sealed: phaseOf(r) !== "OPENED",
            submissions: counts.find((c) => c.procurementRfqId === r.id)?._count.id ?? 0,
            level: ctx.level,
            member: memberOf.has(r.id),
            recommendationStatus: r.recommendationStatus ?? null,
          },
        });
      }
      res.status(200).json({
        success: true,
        message: "RFQs retrieved successfully",
        data: decorated,
        count: result.count,
        limit: result.limit,
        offset: result.offset
      });
    } catch (error: any) {
      console.error("Error getting RFQs:", error);
      res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Failed to get RFQs")
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
        message: publicErrorMessage(error, "Failed to send purchase order")
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
              title: true,
              rejectionReason: true,
              rejectionContentFingerprint: true,
            }
          },
          quotation: {
            select: {
              id: true,
              quotationNumber: true,
              status: true,
              rfqNumber: true,
              rejectionReason: true,
              rejectionContentFingerprint: true,
            },
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
        data: await PurchaseOrderControlService.withEffectiveApproval(purchaseOrders)
      });
    } catch (error: any) {
      console.error("Error getting purchase orders:", error);
      res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Failed to get purchase orders")
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
              rejectionReason: true,
              rejectionContentFingerprint: true,
            },
          },
          quotation: {
            select: {
              id: true,
              quotationNumber: true,
              status: true,
              rfqNumber: true,
              rejectionReason: true,
              rejectionContentFingerprint: true,
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
        message: publicErrorMessage(error, "Failed to get purchase order"),
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
      // No anonymous storage: the upload must carry the supplier's signed purchase-order link.
      const portalRaw = String(req.body?.vendorPortalToken || req.body?.token || req.headers["x-vendor-portal-token"] || "").trim();
      if (!portalRaw) {
        return res.status(401).json({ success: false, message: "A vendor portal link (token) is required to upload an invoice document" });
      }
      const { verifyVendorPortalToken, VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE } = await import("../utils/vendorPortalToken");
      let portalPayload: any;
      try {
        portalPayload = verifyVendorPortalToken(portalRaw);
      } catch (e: any) {
        return res.status(401).json({ success: false, message: e?.message || "Invalid vendor portal link" });
      }
      if (portalPayload.k !== VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE) {
        return res.status(403).json({ success: false, message: "This link cannot be used to upload an invoice document" });
      }
      await VendorGateService.assertTransactable(portalPayload.v, "INVOICE");
      // The storage folder comes from the verified token, never from a form field.
      const vendorKey = String(portalPayload.v).replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 64);
      const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
      const { filePath, downloadURL } = await FirebaseStorageService.uploadProcurementVendorInvoice(
        file.buffer,
        file.originalname || "invoice.pdf",
        vendorKey
      );
      res.status(201).json({
        success: true,
        message:
          "Document uploaded (legacy). Prefer POST /api/procurement/document-attachments/portal/upload with vendorPortalToken. Use documentUrl as documentPath when creating the invoice.",
        data: {
          documentUrl: downloadURL,
          documentPath: downloadURL,
          filePath,
          documentType: "PDF",
          deprecated: true
        },
      });
    } catch (error: any) {
      console.error("Error uploading vendor invoice document:", error);
      res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Failed to upload document"),
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
        vendorPortalToken,
        token: tokenAlias,
        invoiceDate,
        dueDate,
        currencyId,
        documentPath,
        documentType,
        attachmentIds,
        readingIntakeId,
        reviewNote,
        supplierInvoiceNumber,
        grnId,
        paymentTerms,
        subtotal: statedSubtotal,
        taxAmount: statedTax,
        totalAmount: statedTotal,
        items
      } = req.body;

      const resolvedPortalToken =
        typeof vendorPortalToken === "string" && vendorPortalToken.trim()
          ? vendorPortalToken.trim()
          : typeof tokenAlias === "string" && tokenAlias.trim()
            ? tokenAlias.trim()
            : undefined;

      // Public endpoint - vendors don't need to be authenticated
      // createdById can be null or we can use a system user ID
      const createdById = req.user?.id || null; // null for vendor submissions

      const isStaff = Boolean(req.user?.id);
      if (!items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invoice items are required"
        });
      }
      if (isStaff && !invoiceDate) {
        return res.status(400).json({
          success: false,
          message: "Invoice date is required for staff-submitted invoices"
        });
      }
      if (isStaff && !vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required for staff-submitted invoices"
        });
      }
      if (!isStaff && !resolvedPortalToken) {
        return res.status(400).json({
          success: false,
          message: "vendorPortalToken is required for vendor-submitted invoices"
        });
      }

      const invoiceDateParsed = isStaff ? parseDate(invoiceDate) : undefined;
      const dueDateParsed = dueDate ? parseDate(dueDate) : undefined;
      const effectiveInvoiceDate = invoiceDateParsed ?? new Date();
      if (dueDateParsed && dueDateParsed.getTime() < effectiveInvoiceDate.getTime()) {
        return res.status(400).json({
          success: false,
          message: "Due date cannot be earlier than the invoice date",
        });
      }

      const invoice = await ProcurementService.createProcurementInvoice({
        purchaseOrderId,
        vendorId,
        vendorPortalToken: resolvedPortalToken,
        invoiceDate: isStaff ? invoiceDateParsed : undefined,
        dueDate: dueDateParsed,
        currencyId,
        documentPath,
        documentType,
        attachmentIds: Array.isArray(attachmentIds) ? attachmentIds : undefined,
        createdById: createdById || undefined, // Pass undefined if null
        // A staff capture made from AI Invoice Capture names the reading it came from, so the document is not read twice.
        readingIntakeId: isStaff && typeof readingIntakeId === "string" && readingIntakeId.trim() ? readingIntakeId.trim() : undefined,
        supplierInvoiceNumber,
        grnId: isStaff && typeof grnId === "string" && grnId.trim() ? grnId.trim() : undefined,
        paymentTerms: isStaff && typeof paymentTerms === "string" ? paymentTerms : undefined,
        statedSubtotal: statedSubtotal == null || statedSubtotal === "" ? undefined : Number(statedSubtotal),
        statedTax: statedTax == null || statedTax === "" ? undefined : Number(statedTax),
        statedTotal: statedTotal == null || statedTotal === "" ? undefined : Number(statedTotal),
        items
      });

      // Captured and flagged for review in one step from the invoice processing screen (SRD §7).
      if (isStaff && typeof reviewNote === "string" && reviewNote.trim() && invoice?.id) {
        const { ProcurementInvoiceAlertService } = await import("../services/ProcurementInvoiceAlertService");
        await ProcurementInvoiceAlertService.flagForReview(invoice.id, createdById, reviewNote);
      }

      // A supplier (portal token, no staff session) gets a receipt, never the internal record: the full row carries the
      // internal user the capture is attributed to, the purchase order's internal status and more.
      const staffSession = Boolean((req as any).user?.id);
      res.status(201).json({
        success: true,
        message: "Procurement invoice created successfully",
        data: staffSession
          ? invoice
          : {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              supplierInvoiceNumber: invoice.supplierInvoiceNumber,
              status: "RECEIVED",
              invoiceDate: invoice.invoiceDate,
              dueDate: invoice.dueDate,
              subtotal: invoice.subtotal,
              taxAmount: invoice.taxAmount,
              totalAmount: invoice.totalAmount,
              currency: invoice.currency ? { code: invoice.currency.code } : null,
              receivedDate: invoice.receivedDate,
            },
      });
    } catch (error: any) {
      console.error("Error creating procurement invoice:", error);
      res.status((error as any)?.statusCode || 400).json({
        success: false,
        code: (error as any)?.code,
        message: publicErrorMessage(error, "Failed to create procurement invoice")
      });
    }
  }

  /**
   * POST /procurement/invoices/:id/read — read the invoice's supplier document with the LLM now and compare it with the
   * captured invoice. Invoices that arrive with a document are read on their own; this is for one that was not (created
   * before reading existed, or its reading failed) and for an approver who wants it read again.
   */
  static async readProcurementInvoice(req: Request, res: Response) {
    try {
      const { ProcurementInvoiceReadingService } = await import("../services/ProcurementInvoiceReadingService");
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: req.params.id },
        select: { id: true, documentPath: true },
      });
      if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
      if (!invoice.documentPath) {
        return res.status(400).json({ success: false, message: "This invoice has no supplier document to read" });
      }
      const reading = await ProcurementInvoiceReadingService.readInvoice(invoice.id, { actorUserId: req.user?.id ?? null });
      if (!reading) {
        return res.status(409).json({ success: false, message: "This invoice is already being read; try again in a moment" });
      }
      const differences = reading.comparison?.differences?.length ?? 0;
      return res.json({
        success: true,
        message:
          reading.status !== "READ"
            ? reading.message || "The document could not be read"
            : differences
              ? `The document differs from the captured invoice in ${differences} place${differences === 1 ? "" : "s"}`
              : "The document agrees with the captured invoice",
        data: reading,
      });
    } catch (error: any) {
      console.error("Error reading procurement invoice:", error);
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Could not read the invoice document") });
    }
  }

  /** POST /procurement/invoices/:id/flag {note}: SRD §7 "Flag for Review", with why. */
  static async flagProcurementInvoice(req: Request, res: Response) {
    try {
      const { ProcurementInvoiceAlertService } = await import("../services/ProcurementInvoiceAlertService");
      const invoice = await ProcurementInvoiceAlertService.flagForReview(req.params.id, req.user?.id, req.body?.note);
      return res.json({ success: true, message: `${invoice.invoiceNumber} flagged for review`, data: invoice });
    } catch (error: any) {
      return res.status(error?.status || 400).json({ success: false, message: publicErrorMessage(error, "Could not flag the invoice") });
    }
  }

  /** GET /procurement/requisition-projects: the projects a requisition can be charged to (SRD §7 "Project/Cost Center"). */
  static async listRequisitionProjects(req: Request, res: Response) {
    try {
      const { ProcurementRequisitionAssistService } = await import("../services/ProcurementRequisitionAssistService");
      return res.json({ success: true, data: await ProcurementRequisitionAssistService.projects() });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Could not load the projects") });
    }
  }

  /** GET /procurement/requisitions/line-suggestions?q=: items bought before, with their last price and vendors (SRD §3). */
  static async requisitionLineSuggestions(req: Request, res: Response) {
    try {
      const { ProcurementRequisitionAssistService } = await import("../services/ProcurementRequisitionAssistService");
      return res.json({ success: true, data: await ProcurementRequisitionAssistService.lineSuggestions(String(req.query?.q ?? "")) });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Could not load suggestions") });
    }
  }

  /**
   * PUBLIC, token-scoped. The purchase order behind a vendor's emailed invoice link
   * (`PO_VENDOR_INVOICE` token), so the vendor invoice form can show the order, prefill its lines and
   * say whether it still takes invoices. Only the PO named in the token, for the vendor in the token.
   */
  static async getVendorPortalPurchaseOrder(req: Request, res: Response) {
    const raw = String(req.query.token || req.query.vendorPortalToken || "").trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: "This invoice link is missing its token" });
    }
    try {
      const { verifyVendorPortalToken, VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE } = await import(
        "../utils/vendorPortalToken"
      );
      let payload;
      try {
        payload = verifyVendorPortalToken(raw);
      } catch (err: any) {
        return res.status(400).json({ success: false, message: err?.message || "Invalid invoice link" });
      }
      if (payload.k !== VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE) {
        return res.status(400).json({ success: false, message: "This link is not a purchase order invoice link" });
      }

      const po = await prisma.purchaseOrder.findUnique({
        where: { id: payload.p },
        select: {
          id: true,
          poNumber: true,
          vendorId: true,
          status: true,
          orderDate: true,
          expectedDeliveryDate: true,
          paymentTerms: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          vendor: { select: { name: true, email: true } },
          currency: { select: { id: true, code: true, symbol: true } },
          items: {
            where: { lineStatus: { not: "CANCELLED" } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              itemName: true,
              description: true,
              unit: true,
              quantity: true,
              quantityReceived: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
      });
      if (!po || po.vendorId !== payload.v) {
        return res.status(404).json({ success: false, message: "No purchase order matches this invoice link" });
      }

      const invoices = await prisma.procurementInvoice.findMany({
        where: { purchaseOrderId: po.id, vendorId: payload.v },
        orderBy: { createdAt: "desc" },
        select: { invoiceNumber: true, status: true, totalAmount: true, invoiceDate: true, createdAt: true },
      });
      const { canVendorSubmitProcurementInvoice } = await import("../constants/purchaseOrderStatus");
      const { default: VATService } = await import("../services/VATService");
      const num = (v) => (v == null ? null : Number(v));

      return res.json({
        success: true,
        data: {
          poNumber: po.poNumber,
          status: po.status,
          openForInvoice: canVendorSubmitProcurementInvoice(po.status),
          orderDate: po.orderDate,
          expectedDeliveryDate: po.expectedDeliveryDate,
          paymentTerms: po.paymentTerms,
          subtotal: num(po.subtotal),
          taxAmount: num(po.taxAmount),
          totalAmount: num(po.totalAmount),
          vendor: po.vendor,
          currency: po.currency,
          // createProcurementInvoice computes VAT itself with VATService; show the vendor that rate.
          vatPercent: VATService.calculateVAT(100),
          items: po.items.map((it) => ({
            ...it,
            quantity: num(it.quantity),
            quantityReceived: num(it.quantityReceived),
            unitPrice: num(it.unitPrice),
            totalPrice: num(it.totalPrice),
          })),
          invoices: invoices.map((inv) => ({ ...inv, totalAmount: num(inv.totalAmount) })),
          tokenExpiresAt: new Date(payload.exp * 1000).toISOString(),
        },
      });
    } catch (error: any) {
      console.error("Error loading vendor portal purchase order:", error);
      return res.status(500).json({ success: false, message: "Could not load this purchase order" });
    }
  }

  /**
   * PUBLIC, token-scoped: what an invited vendor is quoting for.
   *
   * The quotation form opened blank apart from the RFQ number, so a vendor retyped the lines from the email and
   * could not see the closing date or delivery terms. This returns the RFQ and its lines, the vendor's own master
   * details to prefill, the buying organisation's name, and the quotation this vendor already sent, if any.
   * `?token=` is the signed RFQ_SUBMIT token from the invitation email (payload v = vendor, r = RFQ id).
   */
  static async getVendorPortalRfq(req: Request, res: Response) {
    const raw = String(req.query.token || req.query.vendorPortalToken || "").trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: "This quotation link is missing its token" });
    }
    try {
      const { verifyVendorPortalToken, VENDOR_PORTAL_KIND_RFQ_SUBMIT } = await import("../utils/vendorPortalToken");
      let payload;
      try {
        payload = verifyVendorPortalToken(raw);
      } catch (err: any) {
        return res.status(400).json({ success: false, message: err?.message || "Invalid quotation link" });
      }
      if (payload.k !== VENDOR_PORTAL_KIND_RFQ_SUBMIT) {
        return res.status(400).json({ success: false, message: "This link is not a request for quotation link" });
      }

      const rfq = await prisma.procurementRfq.findUnique({
        where: { id: payload.r },
        select: {
          id: true,
          rfqNumber: true,
          title: true,
          description: true,
          status: true,
          visibility: true,
          closingAt: true,
          deliveryAddress: true,
          expectedDeliveryDate: true,
          specialRequirements: true,
          itemsSnapshot: true,
          reportingCurrency: { select: { code: true } },
          requisition: { select: { items: true } },
          invitations: { where: { vendorId: payload.v }, select: { id: true } },
        },
      });
      // The link names a vendor; only an invited vendor (or anyone, on a publicly listed RFQ) may read it.
      if (!rfq || (!rfq.invitations.length && rfq.visibility !== "PUBLIC_LISTING")) {
        return res.status(404).json({ success: false, message: "No request for quotation matches this link" });
      }
      const [vendor, profile, submission] = await Promise.all([
        prisma.vendor.findUnique({
          where: { id: payload.v },
          select: { name: true, email: true, contactPerson: true, phone: true, taxNumber: true, address: true, paymentTerms: true, settlementCurrency: { select: { code: true } } },
        }),
        prisma.companyProfile.findFirst({ select: { legalName: true } }),
        // The current submission: the newest one that has not been replaced (a replaced one is history, not the entry).
        prisma.vendorQuotation
          .findFirst({
            where: { procurementRfqId: rfq.id, vendorId: payload.v, status: { notIn: ["DRAFT", "SUPERSEDED"] } },
            orderBy: { submittedAt: "desc" },
            select: { quotationNumber: true, status: true, submittedAt: true },
          })
          .then(
            (live) =>
              live ??
              prisma.vendorQuotation.findFirst({
                where: { procurementRfqId: rfq.id, vendorId: payload.v, status: "SUPERSEDED" },
                orderBy: { submittedAt: "desc" },
                select: { quotationNumber: true, status: true, submittedAt: true },
              })
          ),
      ]);
      if (!vendor) {
        return res.status(404).json({ success: false, message: "No vendor matches this link" });
      }
      // A vendor that is no longer Approved and compliant sees nothing of the event, and is told only to contact procurement
      // (never why: the reasons are internal).
      const eligibility = await VendorGateService.evaluate(payload.v, "QUOTE");
      if (!eligibility.ok) {
        return res.status(403).json({
          success: false,
          code: "VENDOR_NOT_ELIGIBLE",
          message: "This supplier account is not currently eligible to take part in this event. Please contact the procurement office.",
        });
      }

      // The lines as the RFQ was issued (its snapshot), else the requisition's. Prices are never sent: the vendor quotes them.
      const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
      // The snapshot is stored as { items: [...] } (older rows as a bare array); an RFQ raised without a requisition has nothing else.
      const snap: any = rfq.itemsSnapshot;
      const snapshot: any[] = Array.isArray(snap) ? snap : Array.isArray(snap?.items) ? snap.items : [];
      const lines = (snapshot.length ? snapshot : ((rfq.requisition?.items as any[]) ?? [])).map((it: any) => ({
        itemName: String(it?.itemName ?? it?.name ?? "").trim(),
        description: it?.description ?? null,
        quantity: num(it?.quantity),
        unit: it?.unit ?? null,
      }));
      const closed = rfq.closingAt ? rfq.closingAt.getTime() < Date.now() : false;
      const vendorSettlementCode = (vendor as any).settlementCurrency?.code ?? null;
      const vendorPaymentTerms = (vendor as any).paymentTerms ?? null;
      // Never send the vendor's own settlement/terms fields inside the vendor block twice.
      delete (vendor as any).settlementCurrency;
      delete (vendor as any).paymentTerms;

      return res.json({
        success: true,
        data: {
          organisation: profile?.legalName?.trim() || null,
          rfqNumber: rfq.rfqNumber,
          title: rfq.title,
          description: rfq.description,
          status: rfq.status,
          open: String(rfq.status).toUpperCase() === "OPEN" && !closed,
          closingAt: rfq.closingAt,
          // Two-envelope events ask the supplier to mark its technical documents.
          envelopes: (rfq as any).evaluationMode === "TWO_ENVELOPE" ? "TWO" : "ONE",
          deliveryAddress: rfq.deliveryAddress,
          expectedDeliveryDate: rfq.expectedDeliveryDate,
          specialRequirements: rfq.specialRequirements,
          currencyCode: rfq.reportingCurrency?.code ?? null,
          // The supplier's own defaults, from their vendor record (never another supplier's).
          vendorDefaults: {
            currencyCode: vendorSettlementCode,
            paymentTerms: vendorPaymentTerms,
          },
          items: lines.filter((l) => l.itemName),
          vendor,
          submission: submission
            ? {
                quotationNumber: submission.quotationNumber,
                // Supplier-visible wording only: internal review states are not disclosed.
                status: supplierVisibleStatus(submission.status).code,
                statusLabel: supplierVisibleStatus(submission.status).label,
                submittedAt: submission.submittedAt,
              }
            : null,
          tokenExpiresAt: new Date(payload.exp * 1000).toISOString(),
        },
      });
    } catch (error: any) {
      console.error("Error loading vendor portal RFQ:", error);
      return res.status(500).json({ success: false, message: "Could not load this request for quotation" });
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
        message: publicErrorMessage(error, "Failed to process OCR data")
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
        message: publicErrorMessage(error, "Failed to perform AI matching")
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
        isTaxable,
        matchOverrideReason
      } = req.body;

      const invoice = await ProcurementService.approveProcurementInvoice(id, approvedById, {
        isTaxable: isTaxable !== undefined ? Boolean(isTaxable) : undefined
      }, {
        matchOverrideReason: typeof matchOverrideReason === "string" ? matchOverrideReason : undefined,
        actor: (req as any).user,
      });

      res.status(200).json({
        success: true,
        message: "Procurement invoice approved successfully",
        data: invoice
      });
    } catch (error: any) {
      console.error("Error approving procurement invoice:", error);
      res.status((error as any)?.statusCode || 400).json({
        code: (error as any)?.code,
        success: false,
        message: publicErrorMessage(error, "Failed to approve procurement invoice")
      });
    }
  }

  /**
   * Reject a procurement invoice awaiting approval.
   * PUT /api/procurement/invoices/:id/reject  { rejectionReason }
   */
  static async rejectProcurementInvoice(req: Request, res: Response) {
    try {
      const rejectedById = req.user?.id;
      if (!rejectedById) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      const { id } = req.params;
      const { rejectionReason } = req.body ?? {};
      const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
      if (!reason) {
        return res.status(400).json({ success: false, message: "rejectionReason is required" });
      }

      const invoice = await ProcurementService.rejectProcurementInvoice(id, rejectedById, reason);

      const { serializeDecimalsDeep } = await import("../utils/prismaDecimalJson");
      res.status(200).json({
        success: true,
        message: "Procurement invoice rejected",
        data: serializeDecimalsDeep(invoice),
      });
    } catch (error: any) {
      console.error("Error rejecting procurement invoice:", error);
      const message = error?.message || "Failed to reject procurement invoice";
      res.status(/not found/i.test(message) ? 404 : 400).json({ success: false, message });
    }
  }

  /**
   * Re-run the three-way match (invoice vs PO vs accepted receipts) for one invoice.
   * POST /api/procurement/invoices/:id/match
   */
  static async matchProcurementInvoice(req: Request, res: Response) {
    try {
      const { ProcurementInvoiceMatchService } = await import("../services/ProcurementInvoiceMatchService");
      const result = await ProcurementInvoiceMatchService.evaluate(req.params.id);
      if (!result) {
        return res.status(404).json({ success: false, message: "Invoice not found" });
      }
      res.status(200).json({ success: true, message: `Match result: ${result.status}`, data: result });
    } catch (error: any) {
      console.error("Error matching procurement invoice:", error);
      res.status(400).json({ success: false, message: error?.message || "Failed to run the three-way match" });
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
        message: publicErrorMessage(error, "Failed to convert purchase order to vendor bill")
      });
    }
  }

  /**
   * Process payment for an approved procurement invoice
   * POST /api/procurement/invoices/:id/payment
   */
  /**
   * GET /procurement/invoices/payment-file[?ids=a,b][&format=json]: bank payment file for approved, unpaid invoices,
   * built from each vendor's own banking details. Vendors the system would refuse to pay are left out and reported.
   */
  static async exportPaymentBankFile(req: Request, res: Response) {
    try {
      const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
      const built = await VendorPaymentFileService.build({ invoiceIds: ids.length ? ids : undefined });
      if (String(req.query.format || "").toLowerCase() === "json") {
        return res.status(200).json({ success: true, data: { included: built.included, excluded: built.excluded } });
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="vendor-payment-file-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader("X-Excluded-Count", String(built.excluded.length));
      res.status(200).send(built.csv);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

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
        return res.status((uploadError as any)?.statusCode || 400).json({
        code: (uploadError as any)?.code,
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
      res.status((error as any)?.statusCode || 400).json({
        code: (error as any)?.code,
        success: false,
        message: publicErrorMessage(error, "Failed to process payment")
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
              status: true,
              rejectionReason: true,
              rejectionContentFingerprint: true,
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
        message: publicErrorMessage(error, "Failed to get procurement invoices")
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
        deliveryNoteNumber,
        locationName,
        comments,
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
          deliveryNoteNumber,
          locationName,
          comments,
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
      res.status((error as any)?.statusCode || 400).json({
        code: (error as any)?.code,
        success: false,
        message: publicErrorMessage(error, "Failed to create goods received note")
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
        message: publicErrorMessage(error, "Failed to list goods received notes"),
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
        message: publicErrorMessage(error, "Failed to get goods received note"),
      });
    }
  }

  /**
   * QC-approve a goods received note (sets header + line qualityStatus to PASSED).
   */
  static async approveGoodsReceivedNote(req: Request, res: Response) {
    try {
      const approvedById = req.user?.id;
      if (!approvedById) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      const { id } = req.params;
      const { qualityNotes } = req.body ?? {};

      const grn = await ProcurementService.approveGoodsReceivedNote(id, approvedById, {
        qualityNotes: typeof qualityNotes === "string" ? qualityNotes : undefined,
      });

      const { serializeDecimalsDeep } = await import("../utils/prismaDecimalJson");
      res.status(200).json({
        success: true,
        message: "Goods received note approved; quality status set to PASSED",
        data: serializeDecimalsDeep(grn),
      });
    } catch (error: any) {
      console.error("Error approving goods received note:", error);
      res.status((error as any)?.statusCode || 400).json({
        code: (error as any)?.code,
        success: false,
        message: publicErrorMessage(error, "Failed to approve goods received note"),
      });
    }
  }

  /**
   * QC-reject a goods received note (sets header + line qualityStatus to FAILED).
   */
  static async rejectGoodsReceivedNote(req: Request, res: Response) {
    try {
      const rejectedById = req.user?.id;
      if (!rejectedById) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }

      const { id } = req.params;
      const { rejectionReason, qualityNotes } = req.body ?? {};
      const reason =
        typeof rejectionReason === "string" && rejectionReason.trim()
          ? rejectionReason.trim()
          : typeof qualityNotes === "string" && qualityNotes.trim()
            ? qualityNotes.trim()
            : "";

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: "rejectionReason is required",
        });
      }

      const grn = await ProcurementService.rejectGoodsReceivedNote(id, rejectedById, reason);

      const { serializeDecimalsDeep } = await import("../utils/prismaDecimalJson");
      res.status(200).json({
        success: true,
        message: "Goods received note rejected; quality status set to FAILED",
        data: serializeDecimalsDeep(grn),
      });
    } catch (error: any) {
      console.error("Error rejecting goods received note:", error);
      res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Failed to reject goods received note"),
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
        message: publicErrorMessage(error, "Failed to get procurement dashboard")
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
        message: publicErrorMessage(error, "Failed to get payments")
      });
    }
  }

  /** Suite 03 — comparison matrix */
  static async getRfqComparisonMatrix(req: Request, res: Response) {
    try {
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const { serializeDecimalsDeep } = await import("../utils/prismaDecimalJson");
      const data = await ProcurementRfqService.getComparisonMatrix(req.params.id);
      res.json({ success: true, data: serializeDecimalsDeep(data) });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async awardRfq(_req: Request, res: Response) {
    return res.status(410).json({
      success: false,
      message:
        "Deprecated. Use POST /api/vendor-quotations/:quotationId/accept for the winning bid (creates PO) and POST /api/vendor-quotations/:id/reject for other bids.",
    });
  }

  /** §16 formal bid opening */
  static async openRfqBids(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const data = await ProcurementRfqService.openBids({
        procurementRfqId: req.params.id,
        openedById: userId,
        attendees: Array.isArray(req.body?.attendees) ? req.body.attendees : undefined,
        notes: typeof req.body?.notes === "string" ? req.body.notes : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /** §17–18 evaluation criteria */
  static async putRfqScoringConfig(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const data = await ProcurementRfqService.setScoringConfig({
        procurementRfqId: req.params.id,
        criteria: Array.isArray(req.body?.criteria) ? req.body.criteria : [],
        updatedById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /** §20 submit award recommendation */
  static async submitRfqRecommendation(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { winningQuotationId, rationale, packageNotes, attachments } = req.body || {};
      if (!winningQuotationId || !rationale) {
        return res.status(400).json({ success: false, message: "winningQuotationId and rationale are required" });
      }
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const data = await ProcurementRfqService.submitAwardRecommendation({
        procurementRfqId: req.params.id,
        winningQuotationId,
        rationale,
        submittedById: userId,
        packageNotes,
        attachments,
      });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /** §20 approve/reject award recommendation */
  static async decideRfqRecommendation(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const decision = String(req.body?.decision || "").toUpperCase();
      if (decision !== "APPROVED" && decision !== "REJECTED") {
        return res.status(400).json({ success: false, message: "decision must be APPROVED or REJECTED" });
      }
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const data = await ProcurementRfqService.decideAwardRecommendation({
        procurementRfqId: req.params.id,
        decision: decision as "APPROVED" | "REJECTED",
        decidedById: userId,
        comments: typeof req.body?.comments === "string" ? req.body.comments : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /**
   * §25 finance handoff transition. The state moves only along the permitted order (READY_FOR_FINANCE, SUBMITTED, ACCEPTED, PAID,
   * CLOSED; SUBMITTED may be returned as REJECTED); each move records who and when.
   */
  static async patchInvoiceFinanceHandoff(req: Request, res: Response) {
    try {
      const actor = (req as any).user;
      if (!actor?.id) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { InvoiceControlService } = await import("../services/p2p/InvoiceControlService");
      const to = req.body?.to ?? req.body?.status;
      const data = await InvoiceControlService.transition(actor, req.params.id, String(to || ""), req.body?.comment ?? req.body?.reason);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(e?.statusCode || e?.status || 400).json({ success: false, code: e?.code, message: publicErrorMessage(e, "Could not move the invoice to that state") });
    }
  }

  static async getInvoiceFinanceHandoff(req: Request, res: Response) {
    try {
      const { InvoiceControlService } = await import("../services/p2p/InvoiceControlService");
      res.json({ success: true, data: await InvoiceControlService.describe(req.params.id, (req as any).user) });
    } catch (e: any) {
      res.status(e?.statusCode || e?.status || 400).json({ success: false, message: publicErrorMessage(e, "Could not load the handoff") });
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
      res.status((e as any).statusCode || 400).json({ success: false, code: (e as any).code, message: e.message });
    }
  }

  /** POST /procurement/rfqs/:id/reopen { newClosingAt, reason }: the only way to let suppliers change submissions after the deadline. */
  /** Shared by the supplier clarification endpoints: verify the signed RFQ link, that this supplier is invited, and still eligible. */
  private static async supplierRfqContext(raw: string) {
    const { verifyVendorPortalToken, VENDOR_PORTAL_KIND_RFQ_SUBMIT } = await import("../utils/vendorPortalToken");
    const payload: any = verifyVendorPortalToken(raw);
    if (payload.k !== VENDOR_PORTAL_KIND_RFQ_SUBMIT) throw Object.assign(new Error("This link is not a request for quotation link"), { statusCode: 400 });
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: payload.r },
      select: { id: true, rfqNumber: true, status: true, closingAt: true, createdById: true, invitations: { where: { vendorId: payload.v }, select: { id: true } } },
    });
    if (!rfq || !rfq.invitations.length) throw Object.assign(new Error("No request for quotation matches this link"), { statusCode: 404 });
    const gate = await VendorGateService.evaluate(payload.v, "QUOTE");
    if (!gate.ok) throw Object.assign(new Error("This supplier account is not currently eligible to take part in this event. Please contact the procurement office."), { statusCode: 403, code: "VENDOR_NOT_ELIGIBLE" });
    return { payload, rfq };
  }

  static async getVendorPortalClarifications(req: Request, res: Response) {
    try {
      const { payload, rfq } = await ProcurementController.supplierRfqContext(String(req.query.token || req.query.vendorPortalToken || "").trim());
      const rows = await prisma.rfqClarification.findMany({
        where: {
          procurementRfqId: rfq.id,
          OR: [
            { authorType: "STAFF", vendorId: null },
            { authorType: "STAFF", vendorId: payload.v },
            { authorType: "VENDOR", vendorId: payload.v },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, authorType: true, body: true, attachmentUrl: true, createdAt: true },
      });
      // No author identities: procurement staff appear as "Procurement", and the supplier's own posts as "You".
      res.json({
        success: true,
        data: rows.map((r) => ({ id: r.id, from: r.authorType === "VENDOR" ? "You" : "Procurement", body: r.body, attachmentUrl: r.attachmentUrl, createdAt: r.createdAt })),
      });
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ success: false, code: e.code, message: e.message });
    }
  }

  static async postVendorPortalClarification(req: Request, res: Response) {
    try {
      const { payload, rfq } = await ProcurementController.supplierRfqContext(String(req.body?.token || req.body?.vendorPortalToken || "").trim());
      const closed = String(rfq.status).toUpperCase() !== "OPEN" || (rfq.closingAt != null && new Date(rfq.closingAt).getTime() <= Date.now());
      if (closed) return res.status(409).json({ success: false, code: "RFQ_LOCKED", message: "This event is closed to questions." });
      const body = String(req.body?.body || req.body?.question || "").trim();
      if (!body) return res.status(400).json({ success: false, message: "Write your question" });
      if (body.length > 4000) return res.status(400).json({ success: false, message: "Your question is too long (max 4000 characters)" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const row = await ProcurementRfqService.addClarification({ procurementRfqId: rfq.id, authorType: "VENDOR", body, vendorId: payload.v });
      await prisma.notification.create({
        data: {
          userId: rfq.createdById,
          title: "Supplier clarification request",
          message: `A supplier asked a question on ${rfq.rfqNumber}. Answer it from the RFQ's clarifications.`,
          type: "RFQ_CLARIFICATION_QUESTION",
          relatedEntity: "ProcurementRfq",
          relatedEntityId: rfq.id,
          data: { rfqId: rfq.id, clarificationId: row.id },
        },
      }).catch(() => undefined);
      res.status(201).json({ success: true, data: { id: row.id, from: "You", body: row.body, createdAt: row.createdAt } });
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ success: false, code: e.code, message: e.message });
    }
  }

  static async postRfqReopen(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const { newClosingAt, reason } = req.body || {};
      if (!newClosingAt) return res.status(400).json({ success: false, message: "newClosingAt required" });
      const data = await ProcurementRfqService.reopen({
        procurementRfqId: req.params.id,
        newClosingAt: new Date(newClosingAt),
        reason,
        reopenedById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status((e as any).statusCode || 400).json({ success: false, code: (e as any).code, message: e.message });
    }
  }

  static async getRfqReopenEvents(req: Request, res: Response) {
    try {
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      res.json({ success: true, data: await ProcurementRfqService.listReopenEvents(req.params.id) });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async postRfqClarification(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementRfqService } = await import("../services/ProcurementRfqService");
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const clarificationBody = ProcurementController.resolveRfqClarificationBody(payload);
      if (!clarificationBody) {
        return res.status(400).json({
          success: false,
          message:
            "Clarification text required: send `body`, or `answer`, or both `question` and `answer`.",
        });
      }
      const attachmentUrl =
        typeof payload.attachmentUrl === "string" ? payload.attachmentUrl.trim() || undefined : undefined;
      const result = await ProcurementRfqService.postStaffClarification({
        procurementRfqId: req.params.id,
        body: clarificationBody,
        attachmentUrl,
        userId,
        vendorId: typeof payload.vendorId === "string" && payload.vendorId.trim() ? payload.vendorId.trim() : undefined,
      });
      const msg =
        result.emailsSent > 0
          ? `Clarification posted and emailed to ${result.emailsSent} invited vendor(s).`
          : "Clarification posted (no invited vendors with email on this RFQ).";
      res.status(201).json({
        success: true,
        message: msg,
        data: {
          ...result.clarification,
          emailsSent: result.emailsSent,
          emailFailures: result.emailFailures.length ? result.emailFailures : undefined,
        },
      });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /** Maps API payloads to the single `body` column on rfq_clarifications. */
  private static resolveRfqClarificationBody(payload: Record<string, unknown>): string | null {
    const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const directBody = trim(payload.body);
    if (directBody) return directBody;

    const answer = trim(payload.answer);
    const question = trim(payload.question);
    if (question && answer) return `Q: ${question}\n\nA: ${answer}`;
    if (answer) return answer;
    if (question) return question;

    const text = trim(payload.text);
    if (text) return text;

    return null;
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
      try {
        const { default: AuditService } = await import("../services/AuditService");
        await AuditService.log({ userId: (req as any).user?.id, action: "PO_PDF_DOWNLOAD", entityType: "PurchaseOrder", entityId: req.params.id, newValues: { format: "pdf", sizeBytes: buf.length }, eventType: "FILE_DOWNLOAD" });
      } catch (_e) { /* never block the document on its audit row */ }
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

  /** Suite 04.6 — create an amendment PO linked via amendmentOfPoId. */
  static async amendPurchaseOrder(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { ProcurementService } = await import("../services/ProcurementService");
      const data = await ProcurementService.amendPurchaseOrder(req.params.id, userId, req.body);
      res.status(201).json({ success: true, data });
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
