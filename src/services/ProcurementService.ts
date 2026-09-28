// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { isPlatformMediaReference } from "../utils/safeFetchUrl";
import { VendorBankService } from "./VendorBankService";
import { VendorGateService } from "./VendorGateService";
import { UserMasterPolicyService } from "./UserMasterPolicyService";
import { randomBytes } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { NumberingService } from "./numbering/NumberingService";
import JournalEntryService from "./JournalEntryService";
import AuditService from "./AuditService";
import { ProcurementRequisitionApprovalService } from "./ProcurementRequisitionApprovalService";
import { ApprovalService } from "./ApprovalService";
import { DocumentNumberingService } from "./DocumentNumberingService";
import { ProcurementRequisitionRulesService } from "./ProcurementRequisitionRulesService";
import { ProcurementDecisionLogService } from "./ProcurementDecisionLogService";
import { CashbookService } from "./CashbookService";
import VATService from "./VATService";
import { nextUnifiedInvoiceNumber } from "../utils/accountingDocumentNumbers";
import {
  nextProcurementGrnNumber,
  nextProcurementPoNumber,
  nextProcurementRequisitionNumber,
  nextProcurementRfqNumber,
} from "../utils/procurementDocumentNumbers";
import { computePurchaseRequisitionContentFingerprint } from "../utils/purchaseRequisitionContentFingerprint";
import { normalizeRfqItemLinesFromBody, prItemsToNormalizedRfqLines } from "../utils/rfqItemInput";
import { isModulePrivilegedUser, isCfoUser } from "../config/cfoModulePermissions";
import { assertValidProcurementLineItems } from "../utils/procurementLineItemValidation";

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
  /** Aligns with vendor.category for RFQ vendor filtering (e.g. AGROTECH, SOLAR, IT_SERVICES). */
  sourcingCategory?: string;
  /** SRD §7 "Project/Cost Center": a row of the projects register, or none. */
  projectId?: string | null;
  /** SRD §11 "Required Date": when the requester needs the goods/services by. */
  requiredDate?: Date | string | null;
  /** SRD §11 "Delivery Location". */
  deliveryLocation?: string | null;
  /** SRD §11 "Budget Code" (free text; no budget-code register exists yet). */
  budgetCode?: string | null;
  /** Investee portal (Suite 02): portfolio company for drawdown cap. */
  portfolioCompanyId?: string;
  fundId?: string;
  useOfFundsDocumentUrl?: string;
  /** Required with portfolioCompanyId — vs tranche − pending PRs. */
  drawdownRequestAmount?: number;
  /** §11 Branch / BU / Budget Code / delivery; §10 plan line */
  branch?: string | null;
  businessUnit?: string | null;
  costCentre?: string | null;
  budgetCode?: string | null;
  deliveryLocation?: string | null;
  planItemId?: string | null;
  /** §11: currency the requisition is estimated and ordered in (defaults to the system default currency). */
  currencyId?: string | null;
  requiredDate?: string | Date | null;
  procurementMethod?: string | null;
  /** Keep the event as a draft: nothing is sent until it is approved and published. */
  saveAsDraft?: boolean;
  riskLevel?: string | null;
  exceptionType?: string | null;
  suggestedVendorId?: string | null;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    specifications?: any;
    unitPrice?: number;
    estimatedUnitPrice?: number;
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
  /** Suite 03.10 */
  visibility?: "INVITED_ONLY" | "PUBLIC_LISTING";
  reportingCurrencyId?: string;
  priceWeight?: number;
  technicalWeight?: number;
  /** §13 RFQ | RFP | TENDER | DIRECT */
  procurementMethod?: string;
  /** When omitted or empty and `requisitionId` is set, PR line items are copied. */
  items?: {
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    specifications?: any;
    /** Reference pricing on RFQ snapshot (optional; null = vendor quotes). */
    unitPrice?: number | null;
    lineTotal?: number | null;
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
  /** Suite 04 */
  validityEndDate?: Date;
  drawdownTrancheId?: string;
  /** §21: taken from the requisition, the budget line and the award when not stated. */
  costCentre?: string;
  budgetCode?: string;
  glCode?: string;
  purchaseConditions?: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    specifications?: any;
    expectedDeliveryDate?: Date;
  }[];
}

export interface CreateProcurementInvoiceParams {
  purchaseOrderId?: string;
  /** Required for staff-created invoices. For public vendor submits, derived from `vendorPortalToken` when set. */
  vendorId?: string;
  /**
   * Signed portal token (`PO_VENDOR_INVOICE`) embedding vendor id + purchase order id.
   * Required when `createdById` is absent (vendor self-serve).
   */
  vendorPortalToken?: string;
  /** Required for staff creates; ignored when `vendorPortalToken` is set (uses current date). */
  invoiceDate?: Date;
  dueDate?: Date;
  currencyId?: string;
  documentPath?: string;
  documentType?: string;
  /** Phase 2 — staged upload ids from document-attachments portal upload */
  attachmentIds?: string[];
  /** Staff capture from AI Invoice Capture: the intake whose reading of this document is reused. */
  readingIntakeId?: string;
  /** §23: the supplier's own invoice number (required), the receipt it bills, its stated figures and payment terms. */
  supplierInvoiceNumber?: string;
  grnId?: string;
  paymentTerms?: string;
  statedSubtotal?: number;
  statedTax?: number;
  statedTotal?: number;
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
  // Document numbering:
  // Use the same shape as accounting docs: PREFIX_YYYYMMDD_0001 (UTC day, per-document sequence).
  // Prefixes are distinct from accounting (`INV_`, `QUO_`) so numbers do not clash across modules.

  /** Safe segment for building `PO-…` numbers from vendor quotation numbers. */
  private static sanitizeQuotationNumberForPoSegment(raw: string): string {
    const t = String(raw || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    const seg = t.slice(0, 80);
    return seg.length > 0 ? seg : "Q";
  }

  /**
   * When a PO is created from an accepted vendor quotation, align the PO number with that quotation
   * (e.g. `PO-VQ-2026-0042` instead of an unrelated `PO-{timestamp}-{rand}`), so procurement and finance
   * see the same logical reference. Falls back to timestamp PO if quotation is missing or collision.
   */
  private static async resolvePoNumberForCreate(quotationId?: string | null): Promise<string> {
    // Always use PO_YYYYMMDD_#### to match agreed numbering format.
    // Quotation reference is carried via `quotationId` + API includes `quotation.quotationNumber` for display.
    return nextProcurementPoNumber(prisma as any, new Date());
  }

  /** Every line needs a name and a positive quantity; an estimate, when given, cannot be negative. */
  private static assertLineValues(items: Array<any>) {
    items.forEach((item, i) => {
      const n = i + 1;
      if (!String(item?.itemName ?? "").trim()) throw new Error(`Line ${n}: an item name is required.`);
      const q = Number(item?.quantity);
      if (!Number.isFinite(q) || q <= 0) throw new Error(`Line ${n}: quantity must be greater than zero.`);
      const raw = item?.unitPrice ?? item?.estimatedUnitPrice;
      if (raw != null && raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
        throw new Error(`Line ${n}: the estimated unit price cannot be negative.`);
      }
    });
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
        sourcingCategory,
        projectId,
        requiredDate,
        deliveryLocation,
        budgetCode,
        portfolioCompanyId,
        fundId: fundIdParam,
        useOfFundsDocumentUrl,
        drawdownRequestAmount,
        branch,
        businessUnit,
        costCentre,
        planItemId,
        items
      } = params;

      // Validate items
      if (!items || items.length === 0) {
        throw new Error("At least one item is required");
      }
      ProcurementService.assertLineValues(items);
      // SRD §41 "Data Validation": quantity must be positive, unit price (when given — it's only the
      // requester's optional estimate on a requisition) may not be negative.
      assertValidProcurementLineItems(items);

      let resolvedRequiredDate: Date | undefined;
      if (requiredDate != null && String(requiredDate).trim() !== "") {
        const d = new Date(requiredDate);
        if (Number.isNaN(d.getTime())) {
          throw new Error("requiredDate must be a valid date");
        }
        resolvedRequiredDate = d;
      }
      const resolvedDeliveryLocation =
        deliveryLocation != null && String(deliveryLocation).trim() !== ""
          ? String(deliveryLocation).trim().slice(0, 255)
          : undefined;
      const resolvedBudgetCode =
        budgetCode != null && String(budgetCode).trim() !== ""
          ? String(budgetCode).trim().slice(0, 100)
          : undefined;

      const { ProcurementRequisitionAssistService } = await import("./ProcurementRequisitionAssistService");
      const resolvedProjectId = await ProcurementRequisitionAssistService.assertProject(projectId);

      // Validate department
      if (!Object.values(Department).includes(department)) {
        throw new Error(`Invalid department. Must be one of: ${Object.values(Department).join(', ')}`);
      }

      let resolvedPortfolioId: string | undefined;
      let resolvedFundId: string | undefined;
      let drawdownDec: Decimal | undefined;
      if (portfolioCompanyId != null && String(portfolioCompanyId).trim() !== "") {
        resolvedPortfolioId = String(portfolioCompanyId).trim();
        const pc = await prisma.portfolioCompany.findUnique({
          where: { id: resolvedPortfolioId },
          select: { id: true, fundId: true },
        });
        if (!pc) {
          throw new Error("Portfolio company not found");
        }
        if (drawdownRequestAmount == null || Number(drawdownRequestAmount) <= 0) {
          throw new Error("drawdownRequestAmount is required and must be positive for investee drawdown requisitions.");
        }
        drawdownDec = new Decimal(Number(drawdownRequestAmount));
        const { InvesteeDrawdownProcurementService } = await import(
          "./InvesteeDrawdownProcurementService"
        );
        await InvesteeDrawdownProcurementService.assertDrawdownWithinTranche({
          portfolioCompanyId: resolvedPortfolioId,
          additionalAmount: drawdownDec,
        });
        resolvedFundId = fundIdParam != null && String(fundIdParam).trim() !== ""
          ? String(fundIdParam).trim()
          : pc.fundId ?? undefined;
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📝 CREATING PURCHASE REQUISITION");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Title: ${title}`);
      console.log(`🏢 Department: ${department}`);
      console.log(`📦 Items: ${items.length}`);
      console.log("");

      // Create requisition (no prices, no total amount)
      const { normalizeVendorCategory } = await import("../utils/vendorCategoryNormalize");
      const normalizedSourcing =
        sourcingCategory != null && String(sourcingCategory).trim() !== ""
          ? normalizeVendorCategory(sourcingCategory)
          : undefined;

      // Line estimates are the requester's internal figure: they give the department head a value to
      // approve against and are never copied onto an RFQ (see prItemsToNormalizedRfqLines).
      const estimateOf = (item: any) => {
        const n = Number(item?.unitPrice ?? item?.estimatedUnitPrice ?? 0);
        return Number.isFinite(n) && n > 0 ? n : 0;
      };
      const requisitionEstimateTotal = items.reduce(
        (sum, item) => sum + estimateOf(item) * Number(item.quantity || 0),
        0
      );

      // User Master: cost centre / branch / business unit default to the requester's own when not stated, so budget
      // attribution and the approval matrix's matchRules never depend on the form being filled in by hand.
      const requesterMaster = await prisma.user.findUnique({
        where: { id: requestedById },
        select: { costCentre: true, branch: true, businessUnit: true },
      });
      const pick = (v: unknown, fallback?: string | null) =>
        v != null && String(v).trim() !== "" ? String(v).trim() : fallback ? String(fallback).trim() : "";
      const effCostCentre = pick(costCentre, requesterMaster?.costCentre);
      const effBranch = pick(branch, requesterMaster?.branch);
      const effBusinessUnit = pick(businessUnit, requesterMaster?.businessUnit);

      // §11 header fields: vocabulary, dates, currency (default currency when none is chosen), suggested vendor rule, plan link.
      const header = await ProcurementRequisitionRulesService.normalizeHeader(
        {
          currencyId: params.currencyId,
          requiredDate: params.requiredDate,
          procurementMethod: params.procurementMethod,
          riskLevel: params.riskLevel,
          exceptionType: params.exceptionType,
          suggestedVendorId: params.suggestedVendorId,
        },
        { creating: true }
      );
      if (!header.currencyId) {
        const def = await prisma.currency.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
        if (def) header.currencyId = def.id;
      }
      await ProcurementRequisitionRulesService.assertSuggestedVendor(header);
      if (planItemId != null && String(planItemId).trim() !== "") {
        await ProcurementRequisitionRulesService.assertPlanLink(
          { planItemId: String(planItemId).trim(), exceptionType: header.exceptionType, totalAmount: requisitionEstimateTotal },
          "edit"
        );
      }

      // The number is drawn inside the same transaction as the requisition: a failed create rolls the counter back with it,
      // so numbers are gap-free, and concurrent creates queue on the counter row and never share a number.
      const requisition = await prisma.$transaction(async (tx) => tx.purchaseRequisition.create({
        data: {
          requisitionNumber: await DocumentNumberingService.nextRequisitionNumber(tx),
          ...header,
          title,
          description,
          department: department, // ⬅️ Now storing department name as string
          requestedById,
          priority,
          justification,
          ...(normalizedSourcing ? { sourcingCategory: normalizedSourcing } : {}),
          ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
          ...(resolvedRequiredDate ? { requiredDate: resolvedRequiredDate } : {}),
          ...(resolvedDeliveryLocation ? { deliveryLocation: resolvedDeliveryLocation } : {}),
          ...(resolvedBudgetCode ? { budgetCode: resolvedBudgetCode } : {}),
          ...(resolvedPortfolioId ? { portfolioCompanyId: resolvedPortfolioId } : {}),
          ...(resolvedFundId ? { fundId: resolvedFundId } : {}),
          ...(useOfFundsDocumentUrl != null && String(useOfFundsDocumentUrl).trim() !== ""
            ? { useOfFundsDocumentUrl: String(useOfFundsDocumentUrl).trim() }
            : {}),
          ...(drawdownDec ? { drawdownRequestAmount: drawdownDec } : {}),
          ...(effBranch ? { branch: effBranch } : {}),
          ...(effBusinessUnit ? { businessUnit: effBusinessUnit } : {}),
          ...(effCostCentre ? { costCentre: effCostCentre } : {}),
          ...(planItemId != null && String(planItemId).trim() !== ""
            ? { planItemId: String(planItemId).trim() }
            : {}),
          totalAmount: new Decimal(requisitionEstimateTotal),
          status: "DRAFT",
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(estimateOf(item)),
              totalPrice: new Decimal(estimateOf(item) * Number(item.quantity || 0)),
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
      }));

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

      await ProcurementRequisitionApprovalService.attachRoutes(requisitions);
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

      // Waiting on this person: requisitions at a step of their approval route that this person decides, and, for a
      // department head or deputy, their department's pending requisitions that have no route (submitted before
      // routes were enforced). Anyone can be an approver on a route step, so nobody is refused the queue.
      const routedIds = await ProcurementRequisitionApprovalService.awaitingIds(userId);
      const isDepartmentApprover =
        !!user.userDepartment &&
        (user.departmentRole === DepartmentRole.HEAD || user.departmentRole === DepartmentRole.DEPUTY);
      const unroutedIds = isDepartmentApprover
        ? await ProcurementRequisitionApprovalService.unroutedPendingIds(user.userDepartment)
        : [];

      const requisitions = await prisma.purchaseRequisition.findMany({
        where: {
          id: { in: [...new Set([...routedIds, ...unroutedIds])] },
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

      await ProcurementRequisitionApprovalService.attachRoutes(requisitions);
      console.log(`✅ Found ${requisitions.length} requisition(s) awaiting ${user.firstName} ${user.lastName}`);
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
   * Create default approval request when no config exists
   * Default: Department HEAD approval (1 step)
   */
  private static async createDefaultApprovalRequest(params: {
    stageType: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN";
    entityId: string;
    entityData?: any;
    requestedById: string;
    department: Department;
  }) {
    console.log("\n════════════════════════════════════════════════════════════════");
    console.log("📝 CREATING DEFAULT APPROVAL REQUEST");
    console.log("════════════════════════════════════════════════════════════════");
    console.log(`🔖 Stage Type: ${params.stageType}`);
    console.log(`🆔 Entity ID: ${params.entityId}`);
    console.log(`👤 Requested By: ${params.requestedById}`);
    console.log(`🏢 Department: ${params.department}`);
    console.log("");

    // Find or create default approval config
    let defaultConfig = await prisma.procurementApprovalConfig.findFirst({
      where: {
        name: "Default Approval Config",
        isActive: true
      }
    });

    if (!defaultConfig) {
      // Create default config
      defaultConfig = await prisma.procurementApprovalConfig.create({
        data: {
          name: "Default Approval Config",
          description: "Default approval configuration for department HEAD approval",
          isActive: true,
          createdById: params.requestedById,
          department: null // General config
        }
      });
      console.log(`✅ Created default approval config: ${defaultConfig.id}`);
    } else {
      console.log(`✅ Using existing default approval config: ${defaultConfig.id}`);
    }

    // Find or create default approval stage for department HEAD
    let defaultStage = await prisma.procurementApprovalStage.findFirst({
      where: {
        configId: defaultConfig.id,
        stageType: params.stageType,
        stepNumber: 1
      }
    });

    if (!defaultStage) {
      // Create default stage for department HEAD approval
      defaultStage = await prisma.procurementApprovalStage.create({
        data: {
          configId: defaultConfig.id,
          stageType: params.stageType,
          stepNumber: 1,
          stepName: "Department Head Approval",
          stepType: "DEPARTMENT",
          requiredDepartmentRole: "HEAD",
          requiredUserDepartment: params.department,
          isRequired: true,
          canDelegate: false,
          autoApprove: false,
          approvalOrder: "SEQUENTIAL"
        }
      });
      console.log(`✅ Created default approval stage: ${defaultStage.id}`);
    } else {
      console.log(`✅ Using existing default approval stage: ${defaultStage.id}`);
    }

    // Find department HEAD users
    const departmentHeads = await prisma.user.findMany({
      where: {
        userDepartment: params.department,
        departmentRole: "HEAD"
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (departmentHeads.length === 0) {
      // If no HEAD, try DEPUTY
      const departmentDeputies = await prisma.user.findMany({
        where: {
          userDepartment: params.department,
          departmentRole: "DEPUTY"
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      });

      if (departmentDeputies.length === 0) {
        throw new Error(`No department HEAD or DEPUTY found for ${params.department} department. Cannot create default approval workflow.`);
      }

      console.log(`⚠️  No HEAD found, using DEPUTY users (${departmentDeputies.length})`);
      departmentHeads.push(...departmentDeputies);
    }

    console.log(`📋 Found ${departmentHeads.length} approver(s) for ${params.department} department`);
    departmentHeads.forEach(head => {
      console.log(`   - ${head.firstName} ${head.lastName} (${head.email})`);
    });
    console.log("");

    // Create approval request and approval records in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create approval request
      const approvalRequest = await tx.approvalRequest.create({
        data: {
          configId: defaultConfig.id,
          stageType: params.stageType,
          entityId: params.entityId,
          entityData: params.entityData || {},
          requestedById: params.requestedById,
          status: "PENDING",
          currentStep: 1,
          totalSteps: 1
        }
      });

      console.log(`✅ Approval request created: ${approvalRequest.id}`);

      // Create approval records for each department HEAD
      const approvals = [];
      for (const head of departmentHeads) {
        const approval = await tx.approval.create({
          data: {
            requestId: approvalRequest.id,
            stageId: defaultStage.id,
            approverId: head.id,
            status: "PENDING"
          }
        });
        approvals.push(approval);
        console.log(`   ✅ Approval created for ${head.firstName} ${head.lastName} (${head.id})`);
      }

      console.log("");
      console.log(`✅ Created ${approvals.length} approval record(s)`);
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return { approvalRequest, approvals };
    });

    // After the commit, so the approver rows are visible: the step's approvers are told in the app and by email.
    // Sent from inside the transaction, the email found no pending rows and fell back to a guess at the approvers.
    await ProcurementRequisitionApprovalService.notifyCurrentStepQuietly(result.approvalRequest.id);

    return result;
  }

  private static async cancelStalePendingApprovalRequestsForPurchaseRequisitionEntity(
    requisitionId: string
  ) {
    const now = new Date();
    await prisma.approvalRequest.updateMany({
      where: {
        entityId: requisitionId,
        stageType: "PURCHASE_REQUISITION",
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        rejectionReason: "Superseded: requisition resubmitted after rejection",
        rejectedAt: now,
      },
    });
  }

  /**
   * Update a purchase requisition while it is DRAFT or REJECTED (requester only).
   * Rejected rows must be edited here (or via equivalent investee route) before resubmit is allowed.
   */
  static async updatePurchaseRequisitionByOwner(
    requisitionId: string,
    userId: string,
    body: {
      title?: string;
      description?: string | null;
      department?: string;
      priority?: string;
      justification?: string | null;
      sourcingCategory?: string | null;
      items?: Array<{
        itemName: string;
        description?: string | null;
        quantity: number | string;
        unit?: string | null;
        specifications?: unknown;
      }>;
      portfolioCompanyId?: string | null;
      fundId?: string | null;
      useOfFundsDocumentUrl?: string | null;
      drawdownRequestAmount?: number | string | null;
      projectId?: string | null;
      branch?: string | null;
      businessUnit?: string | null;
      costCentre?: string | null;
      budgetCode?: string | null;
      deliveryLocation?: string | null;
      planItemId?: string | null;
      currencyId?: string | null;
      requiredDate?: string | Date | null;
      procurementMethod?: string | null;
      riskLevel?: string | null;
      exceptionType?: string | null;
      suggestedVendorId?: string | null;
    },
    opts?: { restrictToPortfolioCompanyId?: string }
  ) {
    const existing = await prisma.purchaseRequisition.findUnique({
      where: { id: requisitionId },
      include: { items: true },
    });
    if (!existing) {
      throw new Error("Purchase requisition not found");
    }
    if (existing.requestedById !== userId) {
      throw new Error("Only the requisition requester can update this requisition.");
    }
    if (
      opts?.restrictToPortfolioCompanyId &&
      existing.portfolioCompanyId !== opts.restrictToPortfolioCompanyId
    ) {
      throw new Error("This requisition is not linked to your portfolio company.");
    }
    if (existing.status !== "DRAFT" && existing.status !== "REJECTED" && existing.status !== "RETURNED") {
      throw new Error("Only draft, rejected or returned requisitions can be updated.");
    }
    if (existing.portfolioCompanyId && body.portfolioCompanyId != null) {
      throw new Error("portfolioCompanyId cannot be changed on an investee-linked requisition.");
    }
    if (body.items != null) {
      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new Error("When provided, items must be a non-empty array.");
      }
      ProcurementService.assertLineValues(body.items);
      // SRD §41: an edit must not introduce a negative/zero quantity or a negative unit price.
      assertValidProcurementLineItems(body.items);
    }
    const header = await ProcurementRequisitionRulesService.normalizeHeader(
      {
        currencyId: body.currencyId,
        requiredDate: body.requiredDate,
        procurementMethod: body.procurementMethod,
        riskLevel: body.riskLevel,
        exceptionType: body.exceptionType,
        suggestedVendorId: body.suggestedVendorId,
      },
      { creating: false }
    );
    await ProcurementRequisitionRulesService.assertSuggestedVendor({
      suggestedVendorId: header.suggestedVendorId !== undefined ? header.suggestedVendorId : existing.suggestedVendorId,
      exceptionType: header.exceptionType !== undefined ? header.exceptionType : existing.exceptionType,
      procurementMethod: header.procurementMethod !== undefined ? header.procurementMethod : existing.procurementMethod,
    });
    if (body.planItemId) {
      await ProcurementRequisitionRulesService.assertPlanLink(
        { id: requisitionId, planItemId: String(body.planItemId), exceptionType: null, totalAmount: 0 },
        "edit"
      );
    }

    let drawdownDec: Decimal | undefined;
    if (existing.portfolioCompanyId) {
      const url =
        body.useOfFundsDocumentUrl !== undefined
          ? body.useOfFundsDocumentUrl
          : existing.useOfFundsDocumentUrl;
      if (!url || String(url).trim() === "") {
        throw new Error(
          "useOfFundsDocumentUrl is required for investee drawdown requisitions (Suite 02)."
        );
      }
      const rawAmt =
        body.drawdownRequestAmount !== undefined && body.drawdownRequestAmount !== null
          ? body.drawdownRequestAmount
          : existing.drawdownRequestAmount;
      if (rawAmt == null || Number(rawAmt) <= 0) {
        throw new Error("drawdownRequestAmount is required and must be positive for investee requisitions.");
      }
      drawdownDec = new Decimal(Number(rawAmt));
      const { InvesteeDrawdownProcurementService } = await import("./InvesteeDrawdownProcurementService");
      await InvesteeDrawdownProcurementService.assertDrawdownWithinTranche({
        portfolioCompanyId: existing.portfolioCompanyId,
        additionalAmount: drawdownDec,
        excludeRequisitionId: requisitionId,
      });
    }

    const { normalizeVendorCategory } = await import("../utils/vendorCategoryNormalize");
    const normalizedSourcing =
      body.sourcingCategory !== undefined
        ? body.sourcingCategory != null && String(body.sourcingCategory).trim() !== ""
          ? normalizeVendorCategory(body.sourcingCategory)
          : null
        : undefined;

    // null or "" clears the project; undefined leaves it as it was.
    let projectUpdate: string | null | undefined;
    if (body.projectId !== undefined) {
      const { ProcurementRequisitionAssistService } = await import("./ProcurementRequisitionAssistService");
      projectUpdate = await ProcurementRequisitionAssistService.assertProject(body.projectId);
    }

    // Same null/"" clears, undefined leaves as-is convention for the SRD §11 fields.
    let requiredDateUpdate: Date | null | undefined;
    if (body.requiredDate !== undefined) {
      if (body.requiredDate == null || String(body.requiredDate).trim() === "") {
        requiredDateUpdate = null;
      } else {
        const d = new Date(body.requiredDate);
        if (Number.isNaN(d.getTime())) throw new Error("requiredDate must be a valid date");
        requiredDateUpdate = d;
      }
    }
    const deliveryLocationUpdate =
      body.deliveryLocation !== undefined
        ? body.deliveryLocation != null && String(body.deliveryLocation).trim() !== ""
          ? String(body.deliveryLocation).trim().slice(0, 255)
          : null
        : undefined;
    const budgetCodeUpdate =
      body.budgetCode !== undefined
        ? body.budgetCode != null && String(body.budgetCode).trim() !== ""
          ? String(body.budgetCode).trim().slice(0, 100)
          : null
        : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.purchaseRequisitionItem.deleteMany({ where: { requisitionId } });
        const lineEstimate = (item: any) => {
          const n = Number(item?.unitPrice ?? item?.estimatedUnitPrice ?? 0);
          return Number.isFinite(n) && n > 0 ? n : 0;
        };
        await tx.purchaseRequisitionItem.createMany({
          data: body.items.map((item) => ({
            requisitionId,
            itemName: item.itemName,
            description: item.description ?? null,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(lineEstimate(item)),
            totalPrice: new Decimal(lineEstimate(item) * Number(item.quantity || 0)),
            unit: item.unit ?? null,
            specifications: item.specifications as object | undefined,
          })),
        });
      }

      const agg = await tx.purchaseRequisitionItem.aggregate({
        where: { requisitionId },
        _sum: { totalPrice: true },
      });
      const totalAmount = new Decimal(agg._sum.totalPrice?.toString() ?? "0");

      return tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.department !== undefined ? { department: body.department } : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.justification !== undefined ? { justification: body.justification } : {}),
          ...(normalizedSourcing !== undefined
            ? { sourcingCategory: normalizedSourcing }
            : {}),
          ...(body.useOfFundsDocumentUrl !== undefined
            ? { useOfFundsDocumentUrl: body.useOfFundsDocumentUrl }
            : {}),
          ...(body.fundId !== undefined ? { fundId: body.fundId } : {}),
          ...(projectUpdate !== undefined ? { projectId: projectUpdate } : {}),
          ...(body.branch !== undefined ? { branch: body.branch || null } : {}),
          ...(body.businessUnit !== undefined ? { businessUnit: body.businessUnit || null } : {}),
          ...(body.costCentre !== undefined ? { costCentre: body.costCentre || null } : {}),
          ...(body.budgetCode !== undefined ? { budgetCode: body.budgetCode || null } : {}),
          ...(body.deliveryLocation !== undefined
            ? { deliveryLocation: body.deliveryLocation || null }
            : {}),
          ...(body.planItemId !== undefined ? { planItemId: body.planItemId || null } : {}),
          ...header,
          ...(requiredDateUpdate !== undefined ? { requiredDate: requiredDateUpdate } : {}),
          ...(deliveryLocationUpdate !== undefined ? { deliveryLocation: deliveryLocationUpdate } : {}),
          ...(budgetCodeUpdate !== undefined ? { budgetCode: budgetCodeUpdate } : {}),
          ...(drawdownDec ? { drawdownRequestAmount: drawdownDec } : {}),
          totalAmount,
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
              roleCode: true,
            },
          },
          currency: {
            select: { id: true, code: true, name: true, symbol: true },
          },
          items: true,
        },
      });
    });

    await AuditService.log({
      userId,
      action: "UPDATE",
      entityType: "PurchaseRequisition",
      entityId: requisitionId,
      // What the edit replaced and what it set, field by field: not just "record edited".
      ...(() => {
        const diff = AuditService.computeUpdateDiff(existing, updated) || {};
        return {
          oldValues: Object.fromEntries(Object.entries(diff).map(([k, v]: any) => [k, v.old ?? null])),
          newValues: { ...Object.fromEntries(Object.entries(diff).map(([k, v]: any) => [k, v.new ?? null])), note: "Owner update (draft or rejected)" },
        };
      })(),
    });

    return updated;
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

      const resubmitFromRejection = requisition.status === "REJECTED" || requisition.status === "RETURNED";
      const wasReturned = requisition.status === "RETURNED";
      const isDraft = requisition.status === "DRAFT";
      if (!isDraft && !resubmitFromRejection) {
        throw new Error("Requisition is not in draft, rejected or returned status");
      }

      if (resubmitFromRejection) {
        if (requisition.requestedById !== submittedById) {
          throw new Error(`Only the requisition requester can resubmit after ${wasReturned ? "it was returned" : "rejection"}.`);
        }
        const fp = requisition.rejectionContentFingerprint;
        if (fp) {
          const nowFp = computePurchaseRequisitionContentFingerprint(requisition);
          if (nowFp === fp) {
            throw new Error(
              `Update the requisition details before resubmitting. No changes were detected since ${wasReturned ? "it was returned" : "rejection"}.`
            );
          }
        }
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("🔄 SUBMITTING REQUISITION FOR APPROVAL");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Requisition ID: ${requisitionId}`);
      console.log(`👤 Submitted By: ${submittedById}`);
      console.log(`🏢 Department: ${requisition.department}`);
      console.log("");

      // Investee drawdown PR (Suite 02): VC CFO gate, no department-head approval chain
      if (requisition.portfolioCompanyId) {
        if (!requisition.drawdownRequestAmount) {
          throw new Error("drawdownRequestAmount is required before submit.");
        }
        if (
          !requisition.useOfFundsDocumentUrl ||
          String(requisition.useOfFundsDocumentUrl).trim() === ""
        ) {
          throw new Error(
            "Use of funds / business case attachment is required before submit (Suite 02)."
          );
        }
        const portfolioOwner = await prisma.portfolioCompany.findUnique({
          where: { id: requisition.portfolioCompanyId },
          select: { userId: true },
        });
        if (!portfolioOwner || portfolioOwner.userId !== submittedById) {
          throw new Error("Only the investee portal user for this portfolio company can submit this requisition.");
        }
        const { InvesteeDrawdownProcurementService } = await import(
          "./InvesteeDrawdownProcurementService"
        );
        await InvesteeDrawdownProcurementService.assertDrawdownWithinTranche({
          portfolioCompanyId: requisition.portfolioCompanyId,
          additionalAmount: new Decimal(requisition.drawdownRequestAmount.toString()),
        });
        const updatedRequisition = await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "PENDING_VC_EXECUTIVE_REVIEW",
            investeeSubmittedAt: new Date(),
            rejectionContentFingerprint: null,
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
                roleCode: true,
              },
            },
            currency: {
              select: { id: true, code: true, name: true, symbol: true },
            },
            items: true,
          },
        });
        await AuditService.log({
          userId: submittedById,
          action: "SUBMIT",
          entityType: "PurchaseRequisition",
          entityId: requisitionId,
          newValues: {
            ...updatedRequisition,
            note: "Investee PR pending VC executive review (Suite 02)",
          },
        });
        try {
          const pcName = await prisma.portfolioCompany.findUnique({
            where: { id: requisition.portfolioCompanyId },
            select: { name: true },
          });
          const recipients = await ProcurementService.resolveProcurementDeskNotifyRecipients();
          const { EmailNotificationService } = await import("./EmailNotificationService");
          await EmailNotificationService.sendInvesteeDrawdownSubmittedToProcurementDesk({
            recipients,
            portfolioCompanyName: pcName?.name ?? "Portfolio company",
            requisitionNumber: updatedRequisition.requisitionNumber,
            title: updatedRequisition.title,
            drawdownAmount: String(requisition.drawdownRequestAmount),
            submittedByName: `${requisition.requestedBy.firstName} ${requisition.requestedBy.lastName}`,
            useOfFundsDocumentUrl: requisition.useOfFundsDocumentUrl,
          });
        } catch (notifyErr) {
          console.error(
            "⚠️  Suite 02: failed to notify procurement desk:",
            (notifyErr as Error)?.message || notifyErr
          );
        }
        return updatedRequisition;
      }

      // §10/§11 gates, in one place: required fields, suggested-vendor rule, plan link and consumption, budget availability.
      if (!requisition.requiredDate) throw new Error("A required date is needed before the requisition can be submitted.");
      if (!requisition.currencyId) throw new Error("A currency is needed before the requisition can be submitted.");
      await ProcurementRequisitionRulesService.assertSuggestedVendor(requisition as any);
      const requisitionCurrency = requisition.currencyId
        ? (await prisma.currency.findUnique({ where: { id: requisition.currencyId }, select: { code: true } }))?.code ?? null
        : null;
      const planGate = await ProcurementRequisitionRulesService.assertPlanLink(
        {
          id: requisition.id,
          planItemId: requisition.planItemId,
          exceptionType: requisition.exceptionType,
          totalAmount: requisition.totalAmount,
          currencyCode: requisitionCurrency,
        },
        "submit"
      );
      const budgetGate = await ProcurementRequisitionRulesService.assertBudget({
        id: requisition.id,
        budgetCode: requisition.budgetCode,
        costCentre: requisition.costCentre,
        totalAmount: requisition.totalAmount,
        currencyCode: requisitionCurrency,
      });

      if (resubmitFromRejection) {
        await this.cancelStalePendingApprovalRequestsForPurchaseRequisitionEntity(requisitionId);
      }

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
            costCentre: (requisition as any).costCentre ?? null,
            branch: requisition.branch ?? null,
            businessUnit: requisition.businessUnit ?? null,
            // §12 routing criteria: everything the approval matrix can match a step on.
            category: requisition.sourcingCategory ?? null,
            procurementMethod: requisition.procurementMethod ?? null,
            riskLevel: requisition.riskLevel ?? null,
            exceptionType: requisition.exceptionType ?? null,
            budgetCode: requisition.budgetCode ?? null,
            totalAmount: requisition.totalAmount.toString(),
            itemCount: requisition.items.length
          },
          requestedById: submittedById,
          department: requisition.department as any // Cast to Department enum for filtering
        });
        if (approvalResult) {
          console.log("✅ Approval request created successfully");
        }
      } catch (error: any) {
        // Only a missing configuration falls back to the department-head route. A route that exists but cannot be
        // followed (a step nobody can decide) is the requester's to hear about, not to be quietly replaced.
        if (!/No active approval configuration/i.test(String(error?.message || ""))) {
          throw error;
        }
        console.log("⚠️  No active approval configuration found - using default workflow (Department HEAD approval)");
        console.log(`   Error: ${error.message || error}`);
        
        // Create default approval workflow with department HEAD approval
        approvalResult = await this.createDefaultApprovalRequest({
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
          department: requisition.department
        });
      }

      // Update requisition status based on approval workflow
      let updatedRequisition;
      if (approvalResult) {
        // Approval workflow created - update status to PENDING_APPROVAL
        updatedRequisition = await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "PENDING_APPROVAL",
            rejectionContentFingerprint: null,
            ...(resubmitFromRejection ? { resubmissionCount: { increment: 1 } } : {}),
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
      } else {
        // This should not happen if default workflow is created, but handle it just in case
        console.log("⚠️  No approval workflow could be created - Requisition remains in DRAFT status");
        throw new Error("Failed to create approval workflow. Please contact administrator.");
      }

      // Audit log
      await AuditService.log({
        userId: submittedById,
        action: "SUBMIT",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition,
      });

      await ProcurementDecisionLogService.record({
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        requestId: (approvalResult as any)?.approvalRequest?.id ?? null,
        actorId: submittedById,
        action: resubmitFromRejection ? "RESUBMITTED" : "SUBMITTED",
        comments: null,
        previousStatus: requisition.status,
        resultingStatus: "PENDING_APPROVAL",
        detail: { warnings: [...planGate.warnings, ...budgetGate.warnings], totalAmount: String(requisition.totalAmount), resubmission: (requisition.resubmissionCount ?? 0) + (resubmitFromRejection ? 1 : 0) },
      }).catch(() => undefined);

      await ProcurementRequisitionApprovalService.attachRoutes(updatedRequisition);
      (updatedRequisition as any).gateWarnings = [...planGate.warnings, ...budgetGate.warnings];
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
    await UserMasterPolicyService.assertCanAct(prisma, approvedById);
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
            },
          },
        },
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      const requisitionInclude = {
        requestedBy: {
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
            email: true
          }
        },
        items: true
      };

      // Suite 02: investee drawdown — VC CFO (or SYSADMIN) final gate → auto RFQ to top eligible vendors
      if (
        requisition.status === "PENDING_VC_EXECUTIVE_REVIEW" &&
        requisition.portfolioCompanyId
      ) {
        const execApprover = await prisma.user.findUnique({
          where: { id: approvedById },
          select: { roleCode: true, firstName: true, lastName: true, email: true, role: true },
        });
        if (!execApprover) {
          throw new Error("Approver not found");
        }
        if (!isCfoUser(execApprover) && execApprover.roleCode !== "SYSADMIN") {
          throw new Error("Only VC CFO (or SYSADMIN) can approve investee drawdown requisitions at this stage.");
        }

        await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "APPROVED",
            approvedById,
            approvedAt: new Date()
          }
        });

        await AuditService.log({
          userId: approvedById,
          action: "APPROVE",
          entityType: "PurchaseRequisition",
          entityId: requisitionId,
          newValues: {
            ...requisition,
            status: "APPROVED",
            note: "Investee PR — VC executive approval (Suite 02)",
          },
        });

        try {
          const { listVendorsEligibleForRfqQuery } = await import(
            "./VendorProcurementListService"
          );
          let eligible = await listVendorsEligibleForRfqQuery({ requisitionId });
          eligible = [...eligible].sort(
            (a, b) => Number(b.vendorRating ?? 0) - Number(a.vendorRating ?? 0)
          );
          const vendorIds = eligible.slice(0, 5).map((v) => v.id);
          if (vendorIds.length > 0) {
            await this.createAndSendRFQ({
              requisitionId: requisition.id,
              vendorIds,
              title: `RFQ — ${requisition.title}`,
              description: requisition.description || undefined,
              items: requisition.items.map((i) => ({
                itemName: i.itemName,
                description: i.description || undefined,
                quantity: Number(i.quantity),
                unit: i.unit || undefined,
                specifications: i.specifications,
              })),
              createdById: approvedById,
            });
          } else {
            console.warn(
              `[Suite 02] No eligible vendors for auto-RFQ on requisition ${requisitionId}; status remains APPROVED until RFQ is sent manually.`
            );
          }
        } catch (rfqErr) {
          console.error("[Suite 02] Auto-RFQ after VC approval failed:", rfqErr);
        }

        const after = await prisma.purchaseRequisition.findUnique({
          where: { id: requisitionId },
          include: requisitionInclude,
        });
        if (!after) {
          throw new Error("Purchase requisition not found after approval");
        }
        try {
          const rb = requisition.requestedBy;
          if (rb?.email) {
            const { EmailNotificationService } = await import("./EmailNotificationService");
            await EmailNotificationService.sendRequisitionApprovedToSubmitter({
              submitterName: `${rb.firstName} ${rb.lastName}`.trim(),
              submitterEmail: rb.email,
              requisitionNumber: requisition.requisitionNumber,
              title: requisition.title,
              department: String(requisition.department ?? ""),
              approvedByName: `${execApprover.firstName} ${execApprover.lastName}`.trim(),
              approvedByEmail: execApprover.email ?? "",
            });
          }
        } catch (notifyErr) {
          console.error(
            "⚠️  Failed to email submitter after investee PR approval:",
            (notifyErr as Error)?.message || notifyErr
          );
        }
        return after;
      }

      if (requisition.status !== "PENDING_APPROVAL") {
        throw new Error("Requisition is not pending approval");
      }

      // A requisition submitted through its approval route is decided step by step, by each step's own approvers.
      const routed = await ProcurementRequisitionApprovalService.decide({
        requisitionId,
        actorId: approvedById,
        decision: "APPROVE",
      });
      if (routed) return routed;

      // No open route (submitted before routes were enforced): the requisition's department head or deputy decides.
      const approver = await prisma.user.findUnique({
        where: { id: approvedById },
        select: {
          userDepartment: true,
          departmentRole: true,
          firstName: true,
          lastName: true,
          email: true,
          roleCode: true,
          role: true,
          approvalLimit: true,
        },
      });

      if (!approver) {
        throw new Error("Approver not found");
      }

      const privilegedApprover = isModulePrivilegedUser(approver);

      if (!privilegedApprover) {
        if (!approver.userDepartment || approver.userDepartment !== requisition.department) {
          throw new Error(`You are not assigned to the ${requisition.department} department`);
        }

        if (!approver.departmentRole || (approver.departmentRole !== DepartmentRole.HEAD && approver.departmentRole !== DepartmentRole.DEPUTY)) {
          throw new Error(`Only department HEAD or DEPUTY can approve requisitions. Your role: ${approver.departmentRole || 'MEMBER'}`);
        }
      }

      // Same self-approval rule as ProcurementRequisitionApprovalService.decide() (SRD §70 test 4), applied here
      // too because this branch is a separate legacy path for requisitions with no open approval route — it does
      // not call decide() and so does not inherit that check. Not waived for a privileged approver.
      if (requisition.requestedById === approvedById) {
        throw new Error("You cannot approve your own purchase requisition.");
      }

      // Same personal approval-ceiling rule as ProcurementRequisitionApprovalService.decide() (SRD §7 User
      // Master "Approval Limit" / §70 "approval limits are enforced server-side"), applied here too since this
      // legacy no-open-route branch doesn't call decide() and wouldn't otherwise inherit it. Null limit or a
      // privileged approver behaves exactly as before this field existed.
      if (!privilegedApprover && approver.approvalLimit != null) {
        const limit = Number(approver.approvalLimit);
        const amount = Number(requisition.totalAmount || 0);
        if (amount > limit) {
          throw new Error(
            `Your approval limit is $${limit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; this transaction is $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Escalate to an approver with sufficient authority.`
          );
        }
      }

      const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: "APPROVED",
          approvedById,
          approvedAt: new Date()
        },
        include: requisitionInclude
      });

      // Audit log
      await AuditService.log({
        userId: approvedById,
        action: "APPROVE",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition,
      });

      try {
        const rb = updatedRequisition.requestedBy;
        if (rb?.email) {
          const { EmailNotificationService } = await import("./EmailNotificationService");
          await EmailNotificationService.sendRequisitionApprovedToSubmitter({
            submitterName: `${rb.firstName} ${rb.lastName}`.trim(),
            submitterEmail: rb.email,
            requisitionNumber: updatedRequisition.requisitionNumber,
            title: updatedRequisition.title,
            department: String(updatedRequisition.department ?? ""),
            approvedByName: `${approver.firstName} ${approver.lastName}`.trim(),
            approvedByEmail: approver.email ?? "",
          });
        }
      } catch (notifyErr) {
        console.error(
          "⚠️  Failed to email submitter after PR approval:",
          (notifyErr as Error)?.message || notifyErr
        );
      }

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

      if (
        requisition.status === "PENDING_VC_EXECUTIVE_REVIEW" &&
        requisition.portfolioCompanyId
      ) {
        const execRejector = await prisma.user.findUnique({
          where: { id: rejectedById },
          select: { roleCode: true, firstName: true, lastName: true, email: true, role: true },
        });
        if (!execRejector) {
          throw new Error("Approver not found");
        }
        if (!isCfoUser(execRejector) && execRejector.roleCode !== "SYSADMIN") {
          throw new Error("Only VC CFO (or SYSADMIN) can reject investee drawdown requisitions at this stage.");
        }
        const rejectionFingerprint = computePurchaseRequisitionContentFingerprint(requisition);
        const updatedRequisition = await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "REJECTED",
            rejectionReason,
            investeeSubmittedAt: null,
            rejectionContentFingerprint: rejectionFingerprint,
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
          newValues: { ...updatedRequisition, note: "Investee PR — VC executive rejection (Suite 02)" },
        });
        try {
          const rb = updatedRequisition.requestedBy;
          if (rb?.email) {
            const { EmailNotificationService } = await import("./EmailNotificationService");
            await EmailNotificationService.sendRequisitionRejectedToSubmitter({
              submitterName: `${rb.firstName} ${rb.lastName}`.trim(),
              submitterEmail: rb.email,
              requisitionNumber: updatedRequisition.requisitionNumber,
              title: updatedRequisition.title,
              department: String(updatedRequisition.department ?? ""),
              rejectedByName: `${execRejector.firstName} ${execRejector.lastName}`.trim(),
              rejectedByEmail: execRejector.email ?? "",
              rejectionReason,
            });
          }
        } catch (notifyErr) {
          console.error(
            "⚠️  Failed to email submitter after investee PR rejection:",
            (notifyErr as Error)?.message || notifyErr
          );
        }
        return updatedRequisition;
      }

      if (requisition.status !== "PENDING_APPROVAL") {
        throw new Error("Requisition is not pending approval");
      }

      const routed = await ProcurementRequisitionApprovalService.decide({
        requisitionId,
        actorId: rejectedById,
        decision: "REJECT",
        reason: rejectionReason,
      });
      if (routed) return routed;

      const approver = await prisma.user.findUnique({
        where: { id: rejectedById },
        select: {
          userDepartment: true,
          departmentRole: true,
          firstName: true,
          lastName: true,
          email: true,
          roleCode: true,
          role: true,
        },
      });

      if (!approver) {
        throw new Error("Approver not found");
      }

      const privilegedRejector = isModulePrivilegedUser(approver);

      if (!privilegedRejector) {
        if (approver.userDepartment !== requisition.department) {
          throw new Error(`You are not assigned to the ${requisition.department} department`);
        }

        if (!approver.departmentRole || (approver.departmentRole !== DepartmentRole.HEAD && approver.departmentRole !== DepartmentRole.DEPUTY)) {
          throw new Error(`Only department HEAD or DEPUTY can reject requisitions. Your role: ${approver.departmentRole || 'MEMBER'}`);
        }
      }

      // Same self-decision rule as ProcurementRequisitionApprovalService.decide() (SRD §70 test 4) and the
      // approve fallback above — this legacy no-open-route path doesn't call decide() either.
      if (requisition.requestedById === rejectedById) {
        throw new Error("You cannot approve or reject your own purchase requisition.");
      }

      const rejectionFingerprint = computePurchaseRequisitionContentFingerprint(requisition);
      const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: "REJECTED",
          rejectionReason,
          rejectionContentFingerprint: rejectionFingerprint,
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

      try {
        const rb = updatedRequisition.requestedBy;
        if (rb?.email) {
          const { EmailNotificationService } = await import("./EmailNotificationService");
          await EmailNotificationService.sendRequisitionRejectedToSubmitter({
            submitterName: `${rb.firstName} ${rb.lastName}`.trim(),
            submitterEmail: rb.email,
            requisitionNumber: updatedRequisition.requisitionNumber,
            title: updatedRequisition.title,
            department: String(updatedRequisition.department ?? ""),
            rejectedByName: `${approver.firstName} ${approver.lastName}`.trim(),
            rejectedByEmail: approver.email ?? "",
            rejectionReason,
          });
        }
      } catch (notifyErr) {
        console.error(
          "⚠️  Failed to email submitter after PR rejection:",
          (notifyErr as Error)?.message || notifyErr
        );
      }

      return updatedRequisition;
    } catch (error) {
      console.error("Error rejecting purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Investee drawdown PR lists (Suite 02): who may see **all** funds without a FundManager row.
   * Uses `isModulePrivilegedUser` plus senior finance/procurement/exec role codes.
   */
  static async userHasUnrestrictedInvesteePrViewScope(viewerUserId: string): Promise<boolean> {
    const u = await prisma.user.findUnique({
      where: { id: viewerUserId },
      select: {
        roleCode: true,
        departmentRole: true,
        userDepartment: true,
        role: { select: { name: true } },
      },
    });
    if (!u) return false;
    if (isModulePrivilegedUser(u)) return true;
    const code = String(u.roleCode || "").trim().toUpperCase();
    const unrestrictedCodes = new Set([
      "SYSADMIN",
      "PROC_MGR",
      "ADMIN",
      "CEO",
      "FIN_MGR",
      "CIO",
      "COO",
      "SUPER_ADMIN",
    ]);
    return code.length > 0 && unrestrictedCodes.has(code);
  }

  /**
   * CFO / module-privileged users / SYSADMIN / PROC_MGR / ADMIN / CEO / FIN_MGR / CIO / COO: all funds.
   * Otherwise must have at least one active FundManager row (Suite 02 fund isolation).
   */
  static async getInvesteePrViewerFundScopeOrThrow(viewerUserId: string): Promise<string[] | null> {
    if (await this.userHasUnrestrictedInvesteePrViewScope(viewerUserId)) {
      return null;
    }
    const rows = await prisma.fundManager.findMany({
      where: { userId: viewerUserId, isActive: true },
      select: { fundId: true },
    });
    if (rows.length === 0) {
      throw new Error("Not authorized to view investee drawdown requisitions.");
    }
    return rows.map((r) => r.fundId);
  }

  /**
   * Fund isolation (Suite 02): investee-linked PRs only visible to requester, unrestricted roles, or a FundManager for that fund.
   */
  static async assertUserCanViewInvesteePurchaseRequisition(
    viewerUserId: string,
    r: {
      portfolioCompanyId: string | null;
      fundId: string | null;
      requestedById: string;
    }
  ): Promise<void> {
    if (!r.portfolioCompanyId) {
      return;
    }
    const owner = await prisma.portfolioCompany.findUnique({
      where: { id: r.portfolioCompanyId },
      select: { userId: true },
    });
    if (owner?.userId === viewerUserId) {
      return;
    }
    if (r.requestedById === viewerUserId) {
      return;
    }
    if (await this.userHasUnrestrictedInvesteePrViewScope(viewerUserId)) {
      return;
    }
    const rows = await prisma.fundManager.findMany({
      where: { userId: viewerUserId, isActive: true },
      select: { fundId: true },
    });
    if (rows.length === 0) {
      throw new Error("Not authorized to view this investee requisition.");
    }
    const allowed = rows.map((x) => x.fundId);
    let fund = r.fundId;
    if (!fund) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: r.portfolioCompanyId },
        select: { fundId: true },
      });
      fund = pc?.fundId ?? null;
    }
    if (!fund || !allowed.includes(fund)) {
      throw new Error("Not authorized to view this investee requisition.");
    }
  }

  static async listInvesteePurchaseRequisitionsForVc(viewerUserId: string) {
    const fundIds = await this.getInvesteePrViewerFundScopeOrThrow(viewerUserId);
    const where: any = { portfolioCompanyId: { not: null } };
    if (fundIds !== null) {
      where.OR = [
        { fundId: { in: fundIds } },
        { portfolioCompany: { fundId: { in: fundIds } } },
      ];
    }
    return prisma.purchaseRequisition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        portfolioCompany: { select: { id: true, name: true, fundId: true } },
        fund: { select: { id: true, name: true } },
        items: true,
      },
    });
  }

  /** PRs stuck in PENDING_VC_EXECUTIVE_REVIEW for more than 48 hours (Suite 02 SLA). */
  static async listInvesteePrsPendingVcOver48Hours(viewerUserId: string) {
    const fundIds = await this.getInvesteePrViewerFundScopeOrThrow(viewerUserId);
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const where: any = {
      portfolioCompanyId: { not: null },
      status: "PENDING_VC_EXECUTIVE_REVIEW",
      investeeSubmittedAt: { lt: cutoff },
    };
    if (fundIds !== null) {
      where.OR = [
        { fundId: { in: fundIds } },
        { portfolioCompany: { fundId: { in: fundIds } } },
      ];
    }
    return prisma.purchaseRequisition.findMany({
      where,
      orderBy: { investeeSubmittedAt: "asc" },
      include: {
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        portfolioCompany: { select: { id: true, name: true, fundId: true } },
        fund: { select: { id: true, name: true } },
        items: true,
      },
    });
  }

  /**
   * Investee cancels before RFQ — releases drawdown reservation (Suite 02).
   */
  static async cancelInvesteePurchaseRequisition(requisitionId: string, userId: string) {
    const r = await prisma.purchaseRequisition.findUnique({
      where: { id: requisitionId },
      select: {
        id: true,
        status: true,
        portfolioCompanyId: true,
      },
    });
    if (!r) {
      throw new Error("Purchase requisition not found");
    }
    if (!r.portfolioCompanyId) {
      throw new Error("Not an investee drawdown requisition.");
    }
    const pc = await prisma.portfolioCompany.findUnique({
      where: { id: r.portfolioCompanyId },
      select: { userId: true },
    });
    if (!pc || pc.userId !== userId) {
      throw new Error("Only the investee portal user for this portfolio company can cancel this requisition.");
    }
    if (!["DRAFT", "PENDING_VC_EXECUTIVE_REVIEW"].includes(r.status)) {
      throw new Error("Only draft or pending VC executive review requisitions can be cancelled.");
    }
    const updated = await prisma.purchaseRequisition.update({
      where: { id: requisitionId },
      data: {
        status: "DRAFT",
        investeeSubmittedAt: null,
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
            roleCode: true,
          },
        },
        currency: {
          select: { id: true, code: true, name: true, symbol: true },
        },
        items: true,
      },
    });
    await AuditService.log({
      userId,
      action: "CANCEL",
      entityType: "PurchaseRequisition",
      entityId: requisitionId,
      newValues: { ...updated, note: "Investee cancelled before RFQ — returned to Draft (Suite 02)" },
    });
    return updated;
  }

  /**
   * Optional env `PROCUREMENT_INVESTEE_NOTIFY_EMAILS` (comma-separated); else Procurement dept + procurement role codes.
   */
  static async resolveProcurementDeskNotifyRecipients(): Promise<
    { email: string; name: string }[]
  > {
    const envCsv = process.env.PROCUREMENT_INVESTEE_NOTIFY_EMAILS;
    if (envCsv && String(envCsv).trim() !== "") {
      const seen = new Set<string>();
      const out: { email: string; name: string }[] = [];
      for (const part of String(envCsv).split(",")) {
        const email = part.trim();
        if (!email || seen.has(email)) {
          continue;
        }
        seen.add(email);
        out.push({ email, name: "Procurement desk" });
      }
      if (out.length > 0) {
        return out;
      }
    }
    const rows = await prisma.user.findMany({
      where: {
        OR: [
          { userDepartment: Department.PROCUREMENT },
          { roleCode: { in: ["PROC_MGR", "PROC_OFF", "BUYER", "PROC_COORD"] } },
        ],
      },
      select: { email: true, firstName: true, lastName: true },
    });
    const seen = new Set<string>();
    const out: { email: string; name: string }[] = [];
    for (const r of rows) {
      if (!r.email || seen.has(r.email)) {
        continue;
      }
      seen.add(r.email);
      out.push({
        email: r.email,
        name: `${r.firstName} ${r.lastName}`.trim(),
      });
    }
    return out;
  }

  /**
   * Suite 02 / 2.7: single source of truth for "which requisitions may this viewer see" when rows may be investee-linked.
   * `null` = unrestricted (admin viewer, CFO, SYSADMIN, PROC_MGR, CEO, FIN_MGR, CIO, COO, ADMIN) — no extra filter.
   */
  static async buildInvesteeFundVisibilityWhereForViewer(
    viewerUserId: string
  ): Promise<Record<string, unknown> | null> {
    if (await this.userHasUnrestrictedInvesteePrViewScope(viewerUserId)) {
      return null;
    }
    const fm = await prisma.fundManager.findMany({
      where: { userId: viewerUserId, isActive: true },
      select: { fundId: true },
    });
    const fundIds = fm.map((x) => x.fundId);
    if (fundIds.length === 0) {
      return { portfolioCompanyId: null };
    }
    return {
      OR: [
        { portfolioCompanyId: null },
        {
          AND: [
            { portfolioCompanyId: { not: null } },
            {
              OR: [
                { fundId: { in: fundIds } },
                { portfolioCompany: { fundId: { in: fundIds } } },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * Department requisition list (Suite 02 / 2.7): FundManagers only see investee PRs for funds they manage; unrestricted roles (admin viewer, CFO, SYSADMIN, PROC_MGR, CEO, FIN_MGR, etc.) see all.
   */
  static async applyInvesteeFundScopeToDepartmentRequisitionWhere(
    viewerUserId: string,
    where: Record<string, any>
  ): Promise<void> {
    const scope = await this.buildInvesteeFundVisibilityWhereForViewer(viewerUserId);
    if (!scope) {
      return;
    }
    const existingAnd = where.AND;
    where.AND = existingAnd
      ? Array.isArray(existingAnd)
        ? [...existingAnd, scope]
        : [existingAnd, scope]
      : [scope];
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
        items,
        visibility = "INVITED_ONLY",
        reportingCurrencyId,
        priceWeight,
        technicalWeight,
        procurementMethod,
        saveAsDraft,
      } = params;

      // SRD §41 "Data Validation": closing date restrictions must be enforced server-side even
      // though the RFQ builder also validates this client-side. A closing date at/before "now"
      // would create an RFQ that is already expired the instant it's sent to vendors — see
      // PROC-FINDING (RFQ_20260919_0001) for the incident this caught.
      if (rfqDeadline) {
        const closingAt = rfqDeadline instanceof Date ? rfqDeadline : new Date(rfqDeadline as any);
        if (Number.isNaN(closingAt.getTime())) {
          throw new Error("Closing date is invalid.");
        }
        if (closingAt.getTime() <= Date.now()) {
          throw new Error("Closing date must be in the future.");
        }
      }

      const sanitizedBodyItems = normalizeRfqItemLinesFromBody(items ?? []);

      let requisitionSourcingCategory: string | null | undefined;
      let resolvedItems: NonNullable<CreateRFQParams["items"]>;
      let prEmailMeta: { requisitionNumber: string; requisitionTitle: string } | undefined;
      // SRD §11: the requisition's Required Date / Delivery Location flow onto the RFQ (and from
      // there to the vendor portal's quotation form) when the tender builder does not override them.
      let prRequiredDate: Date | null | undefined;
      let prDeliveryLocation: string | null | undefined;

      if (requisitionId) {
        const pr = await prisma.purchaseRequisition.findUnique({
          where: { id: requisitionId },
          include: { items: true },
        });
        if (!pr) {
          throw new Error(`Purchase requisition not found: ${requisitionId}`);
        }
        if (pr.status !== "APPROVED") {
          throw new Error(
            `RFQ can only be linked to an approved purchase requisition. Requisition ${pr.requisitionNumber} is "${pr.status}" (expected APPROVED).`
          );
        }
        requisitionSourcingCategory = pr.sourcingCategory;
        prEmailMeta = { requisitionNumber: pr.requisitionNumber, requisitionTitle: pr.title };
        prRequiredDate = pr.requiredDate ?? undefined;
        prDeliveryLocation = pr.deliveryLocation ?? undefined;
        if (sanitizedBodyItems.length > 0) {
          resolvedItems = sanitizedBodyItems;
        } else {
          if (!pr.items.length) {
            throw new Error(
              "No RFQ items were supplied and the purchase requisition has no line items to copy."
            );
          }
          resolvedItems = prItemsToNormalizedRfqLines(pr.items);
        }
      } else {
        if (sanitizedBodyItems.length === 0) {
          throw new Error(
            "Items are required when requisitionId is not provided, or pass requisitionId to use PR line items."
          );
        }
        resolvedItems = sanitizedBodyItems;
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📧 CREATING AND SENDING RFQ TO VENDORS");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📋 Title: ${title}`);
      console.log(`👥 Selected Vendors: ${vendorIds.length}`);
      console.log(`📦 Items: ${resolvedItems.length}`);
      console.log("");

      // Validate vendors exist and have emails
      console.log("🔍 Step 1: Fetching vendor details...");
      const vendors = await prisma.vendor.findMany({
        where: { id: { in: vendorIds } }
      });

      if (vendors.length !== vendorIds.length) {
        throw new Error("One or more vendors not found");
      }

      const { categoriesMatch } = await import("../utils/vendorCategoryNormalize");

      for (const v of vendors) {
        // Status, approval, blacklist, tax clearance and document expiry are all decided in one place.
        await VendorGateService.assertTransactable(v, "INVITE");
        const commodityMatch =
          requisitionSourcingCategory &&
          Array.isArray((v as any).commodityCategories) &&
          (v as any).commodityCategories.some((c: any) => categoriesMatch(String(c), requisitionSourcingCategory));
        if (requisitionSourcingCategory && !categoriesMatch(v.category, requisitionSourcingCategory) && !commodityMatch) {
          throw new Error(
            `Vendor "${v.name}" category does not match this requisition sourcing category (${requisitionSourcingCategory}).`
          );
        }
      }

      const vendorsWithoutEmail = vendors.filter(v => !v.email);
      if (vendorsWithoutEmail.length > 0) {
        throw new Error(`Vendors without email: ${vendorsWithoutEmail.map(v => v.name).join(', ')}`);
      }

      console.log("✅ All vendors found with valid emails:");
      vendors.forEach(v => console.log(`   - ${v.name} (${v.email})`));

      // Generate RFQ number (RFQ_YYYYMMDD_####)
      const rfqNumber = await nextProcurementRfqNumber(prisma as any, new Date(), procurementMethod as any);

      console.log(`\n📝 Step 2: Creating RFQ record: ${rfqNumber}`);

      const rfqRow = await NumberingService.guard(procurementMethod && String(procurementMethod).toUpperCase() === "TENDER" ? "TENDER" : "RFQ", rfqNumber, async () => prisma.procurementRfq.create({
        data: {
          rfqNumber,
          requisitionId: requisitionId || null,
          planItemId: requisitionId
            ? (await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId }, select: { planItemId: true } }))?.planItemId ?? null
            : null,
          title,
          description: description || null,
          status: saveAsDraft ? "DRAFT" : "OPEN",
          visibility,
          sealedBidding:
            String(visibility).toUpperCase() === "PUBLIC_LISTING" ||
            (params as any).sealedBidding === true ||
            ((params as any).sealedBidding == null && ((await prisma.procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null)) as any)?.sealedBiddingDefault !== false),
          closingAt: rfqDeadline || null,
          reportingCurrencyId: reportingCurrencyId || null,
          priceWeight:
            priceWeight != null ? new Decimal(priceWeight) : new Decimal(0.5),
          technicalWeight:
            technicalWeight != null ? new Decimal(technicalWeight) : new Decimal(0.5),
          itemsSnapshot: { items: resolvedItems } as object,
          // An explicit value on the RFQ itself wins; otherwise fall back to the source requisition's
          // Required Date / Delivery Location so the vendor portal never shows "Not set" / "To be
          // confirmed" for a tender raised from a requisition that captured them.
          deliveryAddress: deliveryAddress || prDeliveryLocation || null,
          expectedDeliveryDate: expectedDeliveryDate || prRequiredDate || null,
          specialRequirements: specialRequirements || null,
          createdById,
          ...(procurementMethod
            ? { procurementMethod: String(procurementMethod).toUpperCase() }
            : {}),
        },
      }));

      const {
        signVendorPortalToken,
        rfqPortalTokenExpiryUnixSeconds,
        VENDOR_PORTAL_KIND_RFQ_SUBMIT,
      } = await import("../utils/vendorPortalToken");
      const rfqExp = rfqPortalTokenExpiryUnixSeconds(rfqRow.closingAt);

      for (const v of vendors) {
        await prisma.rfqVendorInvitation.create({
          data: {
            procurementRfqId: rfqRow.id,
            vendorId: v.id,
            emailSentAt: null,
            deliveryStatus: "PENDING",
            lastDeliveryAttemptAt: null,
          },
        });
      }

      const rfqData = {
        rfqNumber,
        procurementRfqId: rfqRow.id,
        title,
        description,
        vendors: vendors.map((v) => ({ id: v.id, name: v.name, email: v.email })),
        items: resolvedItems,
        deliveryAddress,
        expectedDeliveryDate,
        rfqDeadline,
        specialRequirements,
        createdAt: new Date(),
        createdById,
        status: saveAsDraft ? "DRAFT" : "SENT",
      };

      console.log("✅ RFQ record persisted (procurement_rfqs + invitations)");

      // Update requisition if provided
      if (requisitionId && !saveAsDraft) {
        console.log(`\n📝 Step 3: Linking RFQ to requisition ${requisitionId}...`);
        await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: {
            status: "RFQ_SENT"
          }
        });
        console.log("✅ Requisition status updated to RFQ_SENT");
      }

      // Send the invitations now, unless the event is being saved as a draft (it is sent when it is published)
      if (!saveAsDraft) await ProcurementService.dispatchRfqInvitations(rfqRow.id);

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
      console.log(`📦 Items: ${resolvedItems.length}`);
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
   * Sends the RFQ invitation to every invited vendor that has not been sent one, through the one shared notification path.
   * Used when an event is created and sent at once, and when a draft or approved event is published.
   */
  static async dispatchRfqInvitations(rfqId: string) {
    const rfqRow = await prisma.procurementRfq.findUnique({ where: { id: rfqId }, include: { invitations: { include: { vendor: true } } } });
    if (!rfqRow) throw new Error("Sourcing event not found");
    const { signVendorPortalToken, rfqPortalTokenExpiryUnixSeconds, VENDOR_PORTAL_KIND_RFQ_SUBMIT } = await import("../utils/vendorPortalToken");
    const rfqExp = rfqPortalTokenExpiryUnixSeconds(rfqRow.closingAt);
    const rfqNumber = rfqRow.rfqNumber;
    const title = rfqRow.title;
    const rfqDeadline = rfqRow.closingAt;
    const deliveryAddress = rfqRow.deliveryAddress;
    const specialRequirements = rfqRow.specialRequirements;
    const resolvedItems: any[] = ((rfqRow.itemsSnapshot as any)?.items ?? []) as any[];
    const vendors = rfqRow.invitations.filter((inv) => inv.deliveryStatus !== "SENT").map((inv) => inv.vendor);
      for (const vendor of vendors) {
        console.log(`   📤 Sending to: ${vendor.name} (${vendor.email})`);
        
        const portalToken = signVendorPortalToken({
          k: VENDOR_PORTAL_KIND_RFQ_SUBMIT,
          v: vendor.id,
          r: rfqRow.id,
          exp: rfqExp,
        });

        try {
          const { notify } = await import("./notifications/ProcurementNotifier");
          const { buildVendorRfqResponsePageUrl } = await import("../utils/vendorRfqEmailLinks");
          const { getEmailBrandingCached } = await import("../utils/emailBranding");
          const outcome = await notify("RFQ_INVITATION", {
            emails: [vendor.email], entityType: "ProcurementRfq", entityId: rfqRow.id, linkLabel: "Respond to this request",
            link: buildVendorRfqResponsePageUrl({ invitationToken: portalToken, rfqNumber, fallbackBaseUrl: (await getEmailBrandingCached()).website }) || undefined,
            vars: {
              ref: rfqNumber, title, closing: rfqDeadline ? new Date(rfqDeadline).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "", delivery: deliveryAddress || "",
              items: resolvedItems.map((i: any) => `${i.quantity} ${i.unit || "unit"} ${i.itemName}`).join("; ").slice(0, 600), special: specialRequirements || "", contact: (await getEmailBrandingCached()).companyName,
            },
          });
          if (outcome.enabled && outcome.emailFailed) throw new Error("The invitation email could not be sent.");
          if (!outcome.enabled || !(outcome.emailSent || outcome.emailBlocked)) {
            await prisma.rfqVendorInvitation.update({
              where: { procurementRfqId_vendorId: { procurementRfqId: rfqRow.id, vendorId: vendor.id } },
              data: { deliveryStatus: "PENDING", deliveryError: "Invitation emails are switched off in the notification rules", lastDeliveryAttemptAt: new Date() },
            });
            continue;
          }
          await prisma.rfqVendorInvitation.update({
            where: {
              procurementRfqId_vendorId: {
                procurementRfqId: rfqRow.id,
                vendorId: vendor.id,
              },
            },
            data: {
              emailSentAt: new Date(),
              deliveryStatus: "SENT",
              deliveryError: null,
              lastDeliveryAttemptAt: new Date(),
            },
          });
          console.log(`   ✅ Sent to ${vendor.name}`);
        } catch (sendErr: any) {
          await prisma.rfqVendorInvitation.update({
            where: {
              procurementRfqId_vendorId: {
                procurementRfqId: rfqRow.id,
                vendorId: vendor.id,
              },
            },
            data: {
              deliveryStatus: "FAILED",
              deliveryError: String(sendErr?.message || sendErr).slice(0, 2000),
              lastDeliveryAttemptAt: new Date(),
            },
          });
          console.error(`   ❌ Failed to send to ${vendor.name}:`, sendErr?.message || sendErr);
          throw sendErr;
        }
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
      const { rfqNumber, requisitionId, limit = 50, offset = 0 } = filters || {};
      await (await import("./status/ProcurementLifecycleService")).ProcurementLifecycleService.closeExpiredRfqs().catch(() => 0);

      const where: any = {};
      if (rfqNumber) where.rfqNumber = rfqNumber;
      if (requisitionId) where.requisitionId = requisitionId;

      const [rows, count] = await Promise.all([
        prisma.procurementRfq.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
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
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.procurementRfq.count({ where }),
      ]);

      const rfqs = rows.map((r) => ({
        id: r.id,
        rfqNumber: r.rfqNumber,
        procurementRfqId: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        visibility: r.visibility,
        closingAt: r.closingAt,
        requisitionId: r.requisitionId,
        rejectionReason: r.rejectionReason,
        rejectionContentFingerprint: r.rejectionContentFingerprint,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        requisition: r.requisition,
        source: "procurement_rfqs",
      }));

      return { rfqs, count, limit, offset };
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
        items,
        validityEndDate,
        drawdownTrancheId,
      } = params;

      // §21: a PO is an order for something: at least one line, a positive quantity, a price that is not negative.
      if (!Array.isArray(items) || !items.length) throw new Error("A purchase order needs at least one line.");
      for (const [i, it] of items.entries()) {
        const q = Number(it.quantity);
        const p = Number(it.unitPrice);
        if (!String(it.itemName || "").trim()) throw new Error(`Line ${i + 1} needs an item name.`);
        if (!Number.isFinite(q) || q <= 0) throw new Error(`Line ${i + 1} (${it.itemName}) needs a quantity above zero.`);
        if (!Number.isFinite(p) || p < 0) throw new Error(`Line ${i + 1} (${it.itemName}) needs a unit price of zero or more.`);
      }

      let portfolioCompanyId: string | undefined;
      let fundIdFromReq: string | undefined;
      let requisitionCurrencyId: string | undefined;
      let requisitionPlanItemId: string | undefined;
      if (requisitionId) {
        const reqRow = await prisma.purchaseRequisition.findUnique({
          where: { id: requisitionId },
          select: { portfolioCompanyId: true, fundId: true, currencyId: true, planItemId: true },
        });
        portfolioCompanyId = reqRow?.portfolioCompanyId ?? undefined;
        fundIdFromReq = reqRow?.fundId ?? undefined;
        requisitionCurrencyId = reqRow?.currencyId ?? undefined;
        requisitionPlanItemId = reqRow?.planItemId ?? undefined;
      }

      // Validate vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      await VendorGateService.assertTransactable(vendor, "PO");

      if (quotationId) {
        const qRow = await prisma.vendorQuotation.findUnique({
          where: { id: quotationId },
          select: { id: true, vendorEmail: true },
        });
        if (!qRow) {
          throw new Error("Vendor quotation not found");
        }
        const vEmail = String(vendor.email || "").trim().toLowerCase();
        const qEmail = String(qRow.vendorEmail || "").trim().toLowerCase();
        if (vEmail && qEmail && vEmail !== qEmail) {
          throw new Error("Selected vendor does not match the vendor quotation");
        }
      }

      // §11: the requisition's currency carries to the order (and from there to the invoice). An order in another currency
      // than the requisition it fulfils is refused rather than silently re-denominated.
      if (currencyId && requisitionCurrencyId && currencyId !== requisitionCurrencyId) {
        throw new Error("The purchase order must be in the requisition's currency.");
      }
      let effectiveCurrencyId = currencyId || requisitionCurrencyId;
      if (!effectiveCurrencyId && vendor.settlementCurrencyId) {
        effectiveCurrencyId = vendor.settlementCurrencyId;
      }
      // §38: every order carries the currency it is priced in. It is never left to a global default at reporting time.
      if (!effectiveCurrencyId) throw new Error("Choose the currency of the purchase order.");

      // SRD §41 "Data Validation": a PO line must have a positive quantity and a non-negative unit
      // price — a negative line here would flow straight into subtotal/tax/total and vendor spend.
      assertValidProcurementLineItems(items, { requireUnitPrice: true });

      await VATService.refreshActiveVatRate(false).catch(() => undefined);

      const computedSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      let subtotal = computedSubtotal;
      let taxAmount = VATService.calculateVAT(computedSubtotal);
      let totalAmount = computedSubtotal + taxAmount;

      if (quotationId) {
        const qAgg = await prisma.vendorQuotation.findUnique({
          where: { id: quotationId },
          select: { subtotal: true, taxAmount: true, totalAmount: true },
        });
        if (qAgg) {
          const qs = Number(qAgg.subtotal);
          const qt = Number(qAgg.taxAmount);
          const qtTot = Number(qAgg.totalAmount);
          const subMatch =
            Number.isFinite(qs) && Math.abs(computedSubtotal - qs) <= 0.02;
          // §15: the order carries the awarded quotation's own subtotal, VAT and total (at the supplier's stated VAT rate),
          // not a recomputation at today's rate; they are used whenever the order's lines are the quotation's lines.
          if (subMatch && Number.isFinite(qt) && Number.isFinite(qtTot) && Math.abs(qs + qt - qtTot) <= 0.02) {
            subtotal = qs;
            taxAmount = qt;
            totalAmount = qtTot;
          }
        }
      }

      const poNumber = await this.resolvePoNumberForCreate(quotationId ?? null);

      // §21: the order carries what it fulfils (vendor code, RFQ, award, cost centre, budget, GL code, conditions) rather than
      // having it re-keyed.
      const { PurchaseOrderControlService } = await import("./p2p/PurchaseOrderControlService");
      const carried = await PurchaseOrderControlService.defaultsFor({
        requisitionId,
        quotationId,
        vendorId,
        costCentre: params.costCentre,
        budgetCode: params.budgetCode,
        glCode: params.glCode,
        purchaseConditions: params.purchaseConditions,
      });
      const approvalStatus = await PurchaseOrderControlService.initialApprovalStatus();

      // Create purchase order
      const purchaseOrder = await NumberingService.guard("PURCHASE_ORDER", poNumber, async () => prisma.purchaseOrder.create({
        data: {
          poNumber,
          requisitionId,
          quotationId,
          vendorId,
          priority,
          ...(requisitionPlanItemId ? { planItemId: requisitionPlanItemId } : {}),
          subtotal: new Decimal(subtotal),
          taxAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId: effectiveCurrencyId,
          expectedDeliveryDate,
          shippingAddress,
          paymentTerms,
          deliveryTerms,
          createdById,
          status: "DRAFT",
          portfolioCompanyId: portfolioCompanyId || null,
          fundId: fundIdFromReq || null,
          drawdownTrancheId: drawdownTrancheId || null,
          validityEndDate: validityEndDate || null,
          vendorCode: carried.vendorCode,
          rfqId: carried.rfqId,
          awardRecommendationId: carried.awardRecommendationId,
          costCentre: carried.costCentre,
          budgetCode: carried.budgetCode,
          glCode: carried.glCode,
          purchaseConditions: carried.purchaseConditions,
          approvalStatus,
          items: {
            create: items.map((item) => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(Math.round(item.quantity * item.unitPrice * 100) / 100),
              unit: item.unit,
              quantityReceived: new Decimal(0),
              quantityPending: new Decimal(item.quantity),
              specifications: item.specifications,
              expectedDeliveryDate: item.expectedDeliveryDate || null,
              lineStatus: "ACTIVE",
            })),
          },
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
          quotation: {
            select: {
              id: true,
              quotationNumber: true,
              status: true,
              rfqNumber: true,
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
      }));

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
  static async sendPurchaseOrder(
    poId: string,
    sentById: string,
    options?: {
      /** When set, email states the linked quotation was accepted (single combined vendor email). */
      quotationAcceptContext?: {
        quotationNumber: string;
        quotationAmount: number;
        currencyCode: string;
        reviewNotes?: string;
        rfqNumber?: string;
      };
    }
  ) {
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

      if (purchaseOrder) await VendorGateService.assertTransactable(purchaseOrder.vendorId, "PO_SEND");
      if (!purchaseOrder) {
        console.error("❌ ERROR: Purchase order not found");
        throw new Error("Purchase order not found");
      }

      console.log(`✅ PO Found: ${purchaseOrder.poNumber}`);
      console.log(`   Vendor: ${purchaseOrder.vendor.name}`);
      console.log(`   Total Amount: ${purchaseOrder.currency?.symbol || '$'}${Number(purchaseOrder.totalAmount).toFixed(2)}`);
      console.log(`   Current Status: ${purchaseOrder.status}`);

      if (String(purchaseOrder.status).toUpperCase() === "REJECTED" || String((purchaseOrder as any).approvalStatus) === "REJECTED") {
        throw new Error(`${purchaseOrder.poNumber} was rejected and cannot be sent.`);
      }
      if (purchaseOrder.status !== "DRAFT" && purchaseOrder.status !== "PENDING" && purchaseOrder.status !== "APPROVED") {
        console.error(`❌ ERROR: PO already sent (status: ${purchaseOrder.status})`);
        throw new Error("Purchase order has already been sent");
      }
      // §21: when the organisation requires PO approval, an unapproved order is not sent.
      {
        const { PurchaseOrderControlService } = await import("./p2p/PurchaseOrderControlService");
        await PurchaseOrderControlService.assertMaySend(purchaseOrder as any);
      }

      if (!purchaseOrder.vendor.email) {
        console.error("❌ ERROR: Vendor email not found");
        throw new Error("Vendor email address is required to send PO");
      }

      console.log(`   ✅ Vendor email: ${purchaseOrder.vendor.email}`);

      console.log("\n📧 Step 2: Sending PO email to vendor...");

      const vendorAckToken = randomBytes(24).toString("hex");
      const poPdfVerificationToken = randomBytes(24).toString("hex");

      // Persist verification tokens BEFORE rendering the PDF so the PDF embeds the same token
      // that vendor-side `verify` endpoints will accept. PO stays in its current pre-send status
      // until the email is dispatched successfully (next step).
      await prisma.purchaseOrder.update({
        where: { id: poId },
        data: { vendorAckToken, poPdfVerificationToken },
      });

      console.log("\n🧾 Step 2a: Rendering branded PO PDF with accounting letterhead (required, same pipeline as sales invoices)...");

      const [{ ProcurementPoPdfService }, { loadCapitalCallAccountingLetterhead }, { EmailNotificationService }] =
        await Promise.all([
          import("./ProcurementPoPdfService"),
          import("../utils/capitalCallAccountingLetterhead"),
          import("./EmailNotificationService"),
        ]);

      const letterhead = await loadCapitalCallAccountingLetterhead();
      const pdfBuf = await ProcurementPoPdfService.renderPurchaseOrderPdf(poId, { letterhead });
      if (!pdfBuf?.length) {
        throw new Error("Purchase order PDF generation returned an empty buffer");
      }
      const safeBase = String(purchaseOrder.poNumber || poId)
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const pdfAttachment = {
        filename: `PurchaseOrder-${safeBase}.pdf`,
        content: pdfBuf,
      };
      console.log("   ✅ PO PDF generated");

      const {
        signVendorPortalToken,
        poInvoicePortalTokenExpiryUnixSeconds,
        VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE,
      } = await import("../utils/vendorPortalToken");
      const { escapeVendorPoInvoiceSubmitUrlForEmailHref } = await import("../utils/vendorPoInvoiceEmailLinks");
      const invExp = poInvoicePortalTokenExpiryUnixSeconds();
      const invoicePortalToken = signVendorPortalToken({
        k: VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE,
        v: purchaseOrder.vendorId,
        p: poId,
        exp: invExp,
      });
      const vendorInvoiceSubmitUrlEscaped =
        escapeVendorPoInvoiceSubmitUrlForEmailHref(invoicePortalToken) || undefined;

      await EmailNotificationService.sendPurchaseOrderToVendor({
        vendorName: purchaseOrder.vendor.name,
        vendorEmail: purchaseOrder.vendor.email,
        poNumber: purchaseOrder.poNumber,
        poDate: purchaseOrder.createdAt,
        totalAmount: Number(purchaseOrder.totalAmount),
        currency: purchaseOrder.currency?.code || "USD",
        items: purchaseOrder.items.map((item) => ({
          itemName: item.itemName,
          description: item.description || "",
          quantity: Number(item.quantity),
          unit: item.unit || undefined,
          unitPrice: Number(item.unitPrice),
          total: Number(item.totalPrice),
        })),
        deliveryAddress: purchaseOrder.shippingAddress || undefined,
        expectedDeliveryDate: purchaseOrder.expectedDeliveryDate || undefined,
        paymentTerms: purchaseOrder.paymentTerms || undefined,
        notes: undefined,
        pdfAttachment,
        vendorInvoiceSubmitUrlEscaped,
        vendorInvoicePortalToken: invoicePortalToken,
        quotationAcceptContext: options?.quotationAcceptContext,
      });

      console.log("   ✅ Email sent successfully");

      console.log("\n📝 Step 3: Updating PO status to SENT...");
      const dispatchedAt = new Date();
      const updatedPO = await prisma.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: "SENT",
          sentAt: dispatchedAt,
          dispatchedAt,
          sentById,
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
      try {
        const { notifySafe } = await import("./notifications/ProcurementNotifier");
        const requisition = purchaseOrder.requisitionId ? await prisma.purchaseRequisition.findUnique({ where: { id: purchaseOrder.requisitionId }, select: { requestedById: true } }) : null;
        await notifySafe("PO_ISSUED", {
          userIds: [purchaseOrder.createdById, requisition?.requestedById].filter(Boolean) as string[], actorId: sentById, entityType: "PurchaseOrder", entityId: poId,
          vars: { ref: purchaseOrder.poNumber, vendor: purchaseOrder.vendor.name, amount: `${updatedPO.currency?.code ?? ""} ${Number(purchaseOrder.totalAmount).toFixed(2)}`.trim(), delivery: purchaseOrder.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toISOString().slice(0, 10) : "" },
        });
      } catch (_e) { /* a notification problem never fails the order */ }

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
   * Reject a procurement invoice that is still awaiting approval. Stores the reason and a content
   * fingerprint, clears any approval stamp and writes a REJECT audit event. Nothing is posted: an
   * invoice creates accounting entries only when it is paid, and a rejected one never is.
   */
  static async rejectProcurementInvoice(invoiceId: string, rejectedById: string, rejectionReason: string) {
    const reason = String(rejectionReason || "").trim();
    if (!reason) {
      throw new Error("Rejection reason is required");
    }

    const existing = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    if (!existing) {
      throw new Error("Invoice not found");
    }
    const status = String(existing.status || "").toUpperCase();
    if (status === "REJECTED") {
      throw new Error("Invoice is already rejected");
    }
    if (!["DRAFT", "PENDING", "PENDING_APPROVAL", "MATCHED", "DISCREPANCY"].includes(status)) {
      throw new Error(`Only an invoice awaiting approval can be rejected (status: ${existing.status})`);
    }

    const { computeProcurementInvoiceRejectionFingerprint } = await import(
      "../utils/procurementEntityRejectionFingerprint"
    );
    const rejectionContentFingerprint = computeProcurementInvoiceRejectionFingerprint({
      ...existing,
      status: "REJECTED",
    });

    const updated = await prisma.procurementInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
        rejectionContentFingerprint,
        approvedById: null,
        approvedAt: null,
        // A rejected invoice frees its number so the supplier can resubmit a corrected one; the number itself stays on the record.
        supplierInvoiceKey: null,
        financeHandoffStatus: null,
      },
      include: {
        vendor: { select: { id: true, name: true, email: true } },
        purchaseOrder: { select: { id: true, poNumber: true, status: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        items: true,
      },
    });

    await AuditService.log({
      userId: rejectedById,
      action: "REJECT",
      entityType: "ProcurementInvoice",
      entityId: invoiceId,
      oldValues: { status: existing.status },
      newValues: { status: "REJECTED", rejectionReason: reason },
    });

    {
      const { dispatchProcurementNotification } = await import("./ProcurementNotificationService");
      const vendorName = updated.vendor?.name || "the vendor";
      const poNumber = updated.purchaseOrder?.poNumber;
      await dispatchProcurementNotification({
        userIds: existing.createdById ? [existing.createdById] : undefined,
        title: `Invoice rejected: ${updated.invoiceNumber}`,
        message: `${updated.invoiceNumber} from ${vendorName}${poNumber ? ` (${poNumber})` : ""} was rejected: ${reason}`,
        type: "PROCUREMENT_INVOICE_REJECTED",
        relatedEntity: "ProcurementInvoice",
        relatedEntityId: invoiceId,
        data: { path: "/procurement/invoices", invoiceNumber: updated.invoiceNumber },
        email: updated.vendor?.email
          ? {
              to: [updated.vendor.email],
              subject: `Invoice ${updated.invoiceNumber} — action required`,
              bodyInnerHtml: `
                <p>Dear ${vendorName},</p>
                <p>Your invoice <strong>${updated.invoiceNumber}</strong>${poNumber ? ` against purchase order <strong>${poNumber}</strong>` : ""} has been reviewed and could not be accepted as submitted.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>Please correct and resubmit the invoice, or contact your procurement contact if you have questions.</p>
              `,
              preheader: `Invoice ${updated.invoiceNumber} was rejected: ${reason}`,
            }
          : undefined,
      }).catch((e) => console.error("dispatchProcurementNotification (invoice rejected):", e?.message || e));
    }

    return updated;
  }

  /**
   * Approve a procurement invoice and create journal entry
   * @param invoiceId - ID of the invoice to approve
   * @param approvedById - ID of the user approving the invoice
   * @param approvalData - Optional approval data including taxable status (VAT calculated automatically)
   */
  static async approveProcurementInvoice(
    invoiceId: string, 
    approvedById: string | null,
    approvalData?: {
      isTaxable?: boolean;
    },
    /** An exact match approved without a person (ProcurementInvoiceAutoApprovalService); approvedById is null. */
    options?: { automatic?: boolean; reason?: string; matchOverrideReason?: string; actor?: any }
  ) {
    if (approvedById && !options?.automatic) await UserMasterPolicyService.guardInvoiceApproval(invoiceId, approvedById);
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
      if (!options?.automatic) await VendorGateService.assertTransactable(invoice.vendorId, "INVOICE");

      console.log("\n🔒 Step 2: Validating invoice status...");
      if (invoice.status !== "MATCHED" && invoice.status !== "DISCREPANCY" && invoice.status !== "DRAFT") {
        console.error(`❌ VALIDATION FAILED: Invoice status is "${invoice.status}", must be "MATCHED", "DISCREPANCY", or "DRAFT"`);
        throw new Error("Invoice is not ready for approval");
      }
      console.log("   ✅ Invoice is ready for approval");

      // §24: an invoice with open three-way match exceptions is not approved, unless a person with the override grant approves
      // over them with a written reason. (An automatic approval already requires an exact match.)
      if (!options?.automatic) {
        const { InvoiceControlService } = await import("./p2p/InvoiceControlService");
        await InvoiceControlService.assertMatchAllows(invoiceId, "APPROVE", options?.actor ?? (approvedById ? await prisma.user.findUnique({ where: { id: approvedById } }) : null), options?.matchOverrideReason);
      }

      // Handle taxable status and tax calculation using VATService
      console.log("\n💰 Step 3: Calculating tax and totals...");
      let finalSubtotal = Number(invoice.subtotal);
      let finalTaxAmount = Number(invoice.taxAmount);
      let finalTotalAmount = Number(invoice.totalAmount);
      
      // Import VATService
      const VATService = (await import('./VATService')).default;
      await VATService.refreshActiveVatRate().catch(() => undefined);
      
      // If approval data provided, recalculate based on taxable status
      // The supplier's own VAT figure stands: only a computed VAT is recalculated by the approver's taxable choice.
      if (approvalData && approvalData.isTaxable !== undefined && (invoice as any).taxSource !== "STATED") {
        const isTaxable = approvalData.isTaxable;
        
        if (isTaxable) {
          // Calculate VAT automatically using active VAT rate from DB
          finalTaxAmount = VATService.isVATEligible(finalSubtotal, true)
            ? VATService.calculateVAT(finalSubtotal)
            : 0;
          finalTotalAmount = finalSubtotal + finalTaxAmount;
          console.log(`   ✅ Invoice is TAXABLE`);
          console.log(`   • Using VAT rate: ${VATService.getVATRate()}% (active VAT)`);
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
          approvalSource: options?.automatic ? "AUTOMATIC" : "MANUAL",
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

      // §25: an approved invoice is ready for Finance.
      {
        const { InvoiceControlService } = await import("./p2p/InvoiceControlService");
        await InvoiceControlService.start(invoiceId, approvedById);
      }

      // Audit log
      console.log("\n📊 Step 5: Creating audit log...");
      await AuditService.log({
        userId: approvedById,
        action: options?.automatic ? "AUTO_APPROVE" : "APPROVE",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: options?.automatic ? { ...updatedInvoice, approvalReason: options.reason ?? null } : updatedInvoice,
      });
      console.log("   ✅ Audit log created");

      // Send approval email to vendor (best-effort: never roll back the APPROVE on email/PDF failure)
      console.log("\n📧 Step 6: Sending approval email to vendor with PDF copy...");
      try {
        const vendorEmail = String(invoice.vendor?.email || "").trim();
        if (!vendorEmail) {
          console.warn("   ⚠️  Skipping vendor email — vendor has no email on file");
        } else {
          const [{ EmailNotificationService }, { loadCapitalCallAccountingLetterhead }, { buildProcurementInvoicePdfBuffer, safeProcurementInvoicePdfFileBaseName }] =
            await Promise.all([
              import("./EmailNotificationService"),
              import("../utils/capitalCallAccountingLetterhead"),
              import("../utils/procurementInvoicePdf"),
            ]);
          const letterhead = await loadCapitalCallAccountingLetterhead().catch(() => null);

          let poNumber: string | null = null;
          if (updatedInvoice.purchaseOrderId) {
            const po = await prisma.purchaseOrder.findUnique({
              where: { id: updatedInvoice.purchaseOrderId },
              select: { poNumber: true },
            });
            poNumber = po?.poNumber || null;
          }

          const pdf = await buildProcurementInvoicePdfBuffer({
            invoiceNumber: updatedInvoice.invoiceNumber,
            invoiceDate: updatedInvoice.invoiceDate,
            dueDate: updatedInvoice.dueDate ?? null,
            status: updatedInvoice.status,
            paymentStatus: updatedInvoice.paymentStatus,
            currencyCode: updatedInvoice.currency?.code || invoice.currency?.code || "USD",
            subtotal: Number(updatedInvoice.subtotal ?? finalSubtotal),
            taxAmount: Number(updatedInvoice.taxAmount ?? finalTaxAmount),
            totalAmount: Number(updatedInvoice.totalAmount ?? finalTotalAmount),
            poNumber,
            vendor: {
              name: invoice.vendor?.name || "Vendor",
              email: invoice.vendor?.email ?? null,
              phone: (invoice.vendor as any)?.phone ?? null,
              address: (invoice.vendor as any)?.address ?? null,
              bpNumber: (invoice.vendor as any)?.bpNumber ?? null,
              taxNumber: (invoice.vendor as any)?.taxNumber ?? null,
            },
            items: (updatedInvoice.items || []).map((it: any) => ({
              itemName: it.itemName,
              description: it.description ?? null,
              quantity: Number(it.quantity ?? 0),
              unitPrice: Number(it.unitPrice ?? 0),
              totalPrice: Number(it.totalPrice ?? 0),
            })),
            letterhead,
          });

          const fileBase = safeProcurementInvoicePdfFileBaseName(updatedInvoice.invoiceNumber);
          await EmailNotificationService.sendProcurementInvoiceToVendor({
            vendorName: invoice.vendor?.name || "Vendor",
            vendorEmail,
            invoiceNumber: updatedInvoice.invoiceNumber,
            invoiceDate: updatedInvoice.invoiceDate,
            totalAmount: Number(updatedInvoice.totalAmount ?? finalTotalAmount),
            currencyCode: updatedInvoice.currency?.code || invoice.currency?.code || "USD",
            dueDate: updatedInvoice.dueDate ?? null,
            poNumber,
            pdfAttachment: { filename: `Invoice-${fileBase}.pdf`, content: pdf },
          });
          console.log("   ✅ Approval email + PDF sent to vendor");
        }
      } catch (emailError: any) {
        console.error("   ⚠️  Failed to send approval email:", emailError?.message || emailError);
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
    await UserMasterPolicyService.guardInvoicePayment(invoiceId, processedById);
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
      console.log(`   Taxable: ${isTaxable ? 'YES (15.5% VAT)' : 'NO'}`);

      // Validation checks
      console.log("\n🔒 Step 2: Validating payment request...");
      
      if (invoice.status !== "APPROVED") {
        console.error(`❌ VALIDATION FAILED: Invoice status is "${invoice.status}", must be "APPROVED"`);
        throw new Error("Invoice must be approved before payment can be processed");
      }
      console.log("   ✅ Invoice is approved");

      // §24/§25: what it is paid against must still match (a receipt may have been rejected since approval), and Finance
      // must have accepted it.
      {
        const { InvoiceControlService } = await import("./p2p/InvoiceControlService");
        await InvoiceControlService.assertReadyToPay(invoiceId);
        await InvoiceControlService.assertMatchAllows(invoiceId, "PAY", await prisma.user.findUnique({ where: { id: processedById } }));
      }

      // Vendor master gate: only an Approved, compliant vendor is paid. Bank payments go to the vendor's own primary
      // account on record, and the payee is written onto the payment so it is traceable.
      await VendorGateService.assertTransactable(invoice.vendorId, "PAY");
      if (String(paymentData.paymentMethod).toUpperCase() === "BANK") {
        const payee = await VendorBankService.requirePayee(invoice.vendorId, invoice.currency?.code);
        paymentData.notes = [paymentData.notes, `Payee: ${payee.accountName}, ${payee.bankName}, acc ${VendorBankService.maskAccount(payee.accountNumber)}, branch ${payee.branchCode}, SWIFT ${payee.swiftCode}`]
          .filter(Boolean)
          .join(" | ");
        // The payee is recorded on the audit trail, so who was paid, where, is traceable to the vendor master's bank record.
        await AuditService.log({
          userId: processedById,
          action: "VENDOR_PAYMENT_PAYEE",
          entityType: "ProcurementInvoice",
          entityId: invoiceId,
          newValues: {
            vendorId: invoice.vendorId,
            vendorBankId: payee.id,
            accountName: payee.accountName,
            bankName: payee.bankName,
            account: VendorBankService.maskAccount(payee.accountNumber),
            branchCode: payee.branchCode,
            swiftCode: payee.swiftCode,
            currency: payee.currencyCode,
            amount: paymentData.paymentAmount,
          },
        }).catch(() => undefined);
      }

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
          // an invoice without a currency is in the base currency (a made-up id broke every read of the journal)
          currencyId: invoice.currencyId || (await prisma.currency.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id,
          transactionDate: paymentData.paymentDate,
          description: `Purchase Invoice: ${invoice.invoiceNumber} - ${invoice.vendor.name}`,
          receiptNumber: invoice.invoiceNumber, // Use invoice number as receipt number
          isTaxable: isTaxable,
          paymentMethod: "CREDIT" as const, // Creates AP liability
          createdById: processedById
        };

        try {
          expenseJournalEntry = await JournalEntryService.createExpenseJournalEntry(expenseJournalEntryParams);
        } catch (integrationErr) {
          const { notifyIntegrationFailure } = await import("./notifications/ProcurementNotifier");
          await notifyIntegrationFailure("General ledger", invoice.invoiceNumber, integrationErr, "ProcurementInvoice", invoice.id);
          throw integrationErr;
        }
        console.log(`   ✅ Expense Entry Created: ${expenseJournalEntry.journalEntry.referenceNumber}`);
        try {
          await AuditService.log({ userId: processedById, action: "JOURNAL_POST", entityType: "ProcurementInvoice", entityId: invoice.id, newValues: { journalReference: expenseJournalEntry.journalEntry.referenceNumber, ledger: "accounting", amount: Number(invoice.totalAmount) }, eventType: "INTEGRATION" });
        } catch (_e) { /* the journal stands; the audit failure is logged by the writer */ }
        console.log(`   ℹ️  Expense recognized: ${isTaxable ? `$${Number(invoice.subtotal).toFixed(2)} + VAT $${Number(invoice.taxAmount).toFixed(2)}` : `$${Number(invoice.totalAmount).toFixed(2)}`}`);
      } else {
        // Subsequent payment (partial payment scenario) - expense already recognized
        console.log("   ℹ️  Expense already recognized in previous payment");
        console.log("   ℹ️  Only creating payment entry (Entry 2)");
        expenseJournalEntry = {
          journalEntry: invoice.journalEntry! // Use existing expense entry
        };
      }
      
      // Create payment via cashbook (Dr. AP, Cr. Bank/Cash) and link to invoice
      console.log("\n   💳 Creating Entry 2: Payment via Cashbook...");
      console.log(`   • DEBIT Accounts Payable: $${paymentData.paymentAmount.toFixed(2)}`);
      console.log(`   • CREDIT ${paymentData.paymentMethod} Account: $${paymentData.paymentAmount.toFixed(2)}`);

      const accountsPayableAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: "2000" },
            { accountName: { contains: "Accounts Payable" } }
          ],
          isActive: true
        }
      });
      if (!accountsPayableAccount) {
        throw new Error("Accounts Payable account (2000) not found in chart of accounts");
      }

      let bankId: string;
      if (paymentData.paymentMethod === "BANK" && paymentData.bankAccountId) {
        const bank = await prisma.bank.findUnique({
          where: { id: paymentData.bankAccountId },
          include: { glAccount: true }
        });
        if (!bank) throw new Error("Bank account not found");
        bankId = bank.id;
      } else {
        const cashBank = await prisma.bank.findFirst({
          where: { name: { contains: "Cash" } },
          include: { glAccount: true }
        });
        if (cashBank) {
          bankId = cashBank.id;
        } else {
          const firstBank = await prisma.bank.findFirst({ include: { glAccount: true } });
          if (!firstBank) throw new Error("No bank account found for payment");
          bankId = firstBank.id;
        }
      }

      let cashbookResult: any;
      try {
        cashbookResult = await CashbookService.createCashPayment({
          bankId,
          transactionDate: paymentData.paymentDate,
          description: `Payment for Procurement Invoice ${invoice.invoiceNumber} - ${invoice.vendor.name}`,
          amount: paymentData.paymentAmount,
          reference: paymentData.paymentReference || `PAY-${invoice.invoiceNumber}`,
          counterpartyType: "GL",
          glAccountId: accountsPayableAccount.id,
          createdById: processedById
        });
      } catch (integrationErr) {
        const { notifyIntegrationFailure } = await import("./notifications/ProcurementNotifier");
        await notifyIntegrationFailure("Cashbook", invoice.invoiceNumber, integrationErr, "ProcurementInvoice", invoice.id);
        throw integrationErr;
      }

      if (!cashbookResult.success || !cashbookResult.transaction) {
        throw new Error(cashbookResult.message || "Failed to create cashbook payment");
      }
      console.log(`   ✅ Cashbook payment created: ${cashbookResult.transaction.id}`);

      const journalEntryResult = cashbookResult.journalEntry
        ? { journalEntry: cashbookResult.journalEntry }
        : { journalEntry: await prisma.journalEntry.findUnique({ where: { id: cashbookResult.transaction.journalEntryId! } }) };

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
      console.log(`   Taxable: ${isTaxable ? 'YES (15.5% VAT)' : 'NO'}`);
      if (paymentData.paymentReference) {
        console.log(`   Payment Reference: ${paymentData.paymentReference}`);
      }
      if (paymentData.proofOfPaymentPath) {
        console.log(`   Proof of Payment: ${paymentData.proofOfPaymentPath}`);
      }
      console.log(`   Receipt Number: ${receiptNumber}`);

      // Update invoice with payment details, journal entry, and cashbook entry link
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus,
          paymentDate: paymentData.paymentDate,
          paymentReference: paymentData.paymentReference || receiptNumber,
          journalEntryId: expenseJournalEntry.journalEntry.id,
          cashbookEntryId: cashbookResult.transaction.id,
          proofOfPaymentPath: paymentData.proofOfPaymentPath || invoice.proofOfPaymentPath,
          proofOfPaymentType: paymentData.proofOfPaymentPath
            ? (paymentData.proofOfPaymentPath.endsWith('.pdf') ? 'PDF' : 'IMAGE')
            : invoice.proofOfPaymentType
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
          },
          cashbookEntry: {
            select: {
              id: true,
              reference: true,
              status: true,
              amount: true
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
      if (paymentStatus === "PAID") {
        const { InvoiceControlService } = await import("./p2p/InvoiceControlService");
        await InvoiceControlService.markPaid(invoiceId, processedById);
      }
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
   * Create a procurement invoice
   */
  static async createProcurementInvoice(params: CreateProcurementInvoiceParams) {
    try {
      const {
        purchaseOrderId,
        vendorId,
        vendorPortalToken,
        invoiceDate,
        dueDate,
        currencyId,
        documentPath,
        documentType,
        attachmentIds,
        readingIntakeId,
        createdById,
        items
      } = params;

      // §23: the supplier's own invoice number is what identifies an invoice; a duplicate is refused before anything is saved.
      const invoiceRules = await import("./p2p/InvoiceRules");
      const supplierInvoiceNumber = invoiceRules.cleanInvoiceNumber(params.supplierInvoiceNumber);
      const supplierInvoiceKey = invoiceRules.invoiceKey(supplierInvoiceNumber);
      if (!supplierInvoiceKey) throw new Error("The supplier's invoice number is required.");
      if (!Array.isArray(items) || !items.length) throw new Error("An invoice needs at least one line.");
      for (const [i, it] of items.entries()) {
        const q = Number(it.quantity);
        const p = Number(it.unitPrice);
        if (!String(it.itemName || "").trim()) throw new Error(`Line ${i + 1} needs an item name.`);
        if (!Number.isFinite(q) || q <= 0) throw new Error(`Line ${i + 1} (${it.itemName}) needs a quantity above zero.`);
        if (!Number.isFinite(p) || p < 0) throw new Error(`Line ${i + 1} (${it.itemName}) needs a unit price of zero or more.`);
      }

      const {
        verifyVendorPortalToken,
        VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE,
      } = await import("../utils/vendorPortalToken");

      let resolvedVendorId = vendorId?.trim() || "";
      let resolvedPurchaseOrderId = purchaseOrderId?.trim() || "";

      const portalRaw = vendorPortalToken?.trim();
      if (portalRaw) {
        const pl = verifyVendorPortalToken(portalRaw);
        if (pl.k !== VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE) {
          throw new Error("Invalid vendor portal token for procurement invoice submission");
        }
        const po = await prisma.purchaseOrder.findUnique({
          where: { id: pl.p },
          select: { id: true, vendorId: true, status: true, poNumber: true },
        });
        if (!po) throw new Error("Purchase order not found");
        if (po.vendorId !== pl.v) throw new Error("Token does not match this purchase order");
        const { canVendorSubmitProcurementInvoice } = await import(
          "../constants/purchaseOrderStatus"
        );
        if (!canVendorSubmitProcurementInvoice(po.status)) {
          throw new Error(`Purchase order is not open for vendor invoices (status: ${po.status})`);
        }
        if (resolvedVendorId && resolvedVendorId !== pl.v) {
          throw new Error("vendorId does not match portal token");
        }
        if (resolvedPurchaseOrderId && resolvedPurchaseOrderId !== pl.p) {
          throw new Error("purchaseOrderId does not match portal token");
        }
        resolvedVendorId = pl.v;
        resolvedPurchaseOrderId = pl.p;
      } else if (!createdById) {
        throw new Error(
          "vendorPortalToken is required when submitting a procurement invoice without staff authentication"
        );
      }

      if (!resolvedVendorId) {
        throw new Error("Vendor ID is required (or supply a valid vendorPortalToken)");
      }
      if (!resolvedPurchaseOrderId) {
        throw new Error("purchaseOrderId is required (or supply a valid vendorPortalToken)");
      }

      const isVendorPortalSubmit = Boolean(portalRaw);
      // An invoice for delivered goods may be recorded for a suspended/expired vendor, never for a blocked, draft or inactive one.
      await VendorGateService.assertTransactable(resolvedVendorId, "INVOICE");
      if (portalRaw && documentPath && !isPlatformMediaReference(String(documentPath))) {
        throw new Error("The invoice document must be uploaded through the vendor portal, not linked from another address.");
      }
      const resolvedInvoiceDate = isVendorPortalSubmit ? new Date() : invoiceDate;
      if (!resolvedInvoiceDate || Number.isNaN(resolvedInvoiceDate.getTime())) {
        throw new Error("Invoice date is required");
      }

      // Validate vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id: resolvedVendorId }
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
              { email: process.env.EMAIL_ADMIN || 'admin@nvccz.co.zw' },
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

      // The invoice carries the order's own currency and payment terms rather than defaulting: no currency stated means the
      // order's; a different one is refused (an invoice in another currency cannot be matched to the order); no due date
      // stated means invoice date plus the order's payment terms (e.g. "Net 30", "30 days from invoice").
      const orderTerms = await prisma.purchaseOrder.findUnique({
        where: { id: resolvedPurchaseOrderId },
        select: { currencyId: true, paymentTerms: true, rfqId: true, subtotal: true, taxAmount: true, currency: { select: { code: true } } },
      });
      await invoiceRules.assertNotDuplicate(resolvedVendorId, supplierInvoiceKey);
      const linkedReceipt = await invoiceRules.assertReceiptBelongs(params.grnId, resolvedPurchaseOrderId);
      const effectivePaymentTerms = (params.paymentTerms && String(params.paymentTerms).trim()) || orderTerms?.paymentTerms || null;
      const effectiveCurrencyId = currencyId || orderTerms?.currencyId || undefined;
      if (!effectiveCurrencyId) throw new Error("The invoice needs a currency: choose one, or link it to a purchase order that has one.");
      if (currencyId && orderTerms?.currencyId && currencyId !== orderTerms.currencyId) {
        throw new Error(`The invoice must be in the purchase order's currency (${orderTerms.currency?.code ?? "as ordered"}).`);
      }
      let effectiveDueDate = dueDate;
      if (!effectiveDueDate && orderTerms?.paymentTerms) {
        const days = /(\d{1,3})/.exec(String(orderTerms.paymentTerms))?.[1];
        if (days) effectiveDueDate = new Date(resolvedInvoiceDate.getTime() + Number(days) * 86400000);
      }

      // Totals: the lines, and the supplier's own VAT when it states one (else the order's VAT rate). Never free-typed.
      await VATService.refreshActiveVatRate(false).catch(() => undefined);
      const figures = await invoiceRules.resolveFigures({
        items,
        po: orderTerms,
        statedSubtotal: params.statedSubtotal,
        statedTax: params.statedTax,
        statedTotal: params.statedTotal,
        activeVat: (s) => VATService.calculateVAT(s),
      });
      const subtotal = figures.subtotal;
      const taxAmount = figures.taxAmount;
      const totalAmount = figures.total;

      const procurementInvoiceInclude = {
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
      };

      let invoice = null;
      let lastProcInvoiceErr: any = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const invoiceNumber = await nextUnifiedInvoiceNumber(prisma, resolvedInvoiceDate);
          invoice = await prisma.procurementInvoice.create({
            data: {
              invoiceNumber,
              purchaseOrderId: resolvedPurchaseOrderId,
              vendorId: resolvedVendorId,
              invoiceDate: resolvedInvoiceDate,
              dueDate: effectiveDueDate,
              subtotal: new Decimal(subtotal),
              taxAmount: new Decimal(taxAmount),
              totalAmount: new Decimal(totalAmount),
              taxSource: figures.taxSource,
              currencyId: effectiveCurrencyId,
              supplierInvoiceNumber,
              supplierInvoiceKey,
              grnId: linkedReceipt?.id ?? null,
              rfqId: orderTerms?.rfqId ?? null,
              paymentTerms: effectivePaymentTerms,
              documentPath,
              documentType,
              createdById: finalCreatedById,
              financeHandoffStatus: null,
              submittedVia: isVendorPortalSubmit ? "VENDOR_PORTAL" : "STAFF",
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
            include: procurementInvoiceInclude
          });
          break;
        } catch (error: any) {
          lastProcInvoiceErr = error;
          if (invoiceRules.isDuplicateKeyError(error)) {
            throw Object.assign(new Error(`Duplicate invoice: this supplier has already submitted invoice ${supplierInvoiceNumber}.`), { status: 409, statusCode: 409, code: "DUPLICATE_INVOICE" });
          }
          if (error?.code === "P2002") {
            const t = error.meta?.target;
            const fields = Array.isArray(t) ? t : t != null ? [t] : [];
            const hit = fields.some(
              (x: string) =>
                x === "invoiceNumber" || String(x).includes("invoice_number") || String(x).includes("invoiceNumber")
            );
            if (hit) continue;
          }
          throw error;
        }
      }

      if (!invoice) {
        throw lastProcInvoiceErr instanceof Error
          ? lastProcInvoiceErr
          : new Error(String(lastProcInvoiceErr));
      }

      const { PO_STATUS, PO_STATUSES_BEFORE_ACKNOWLEDGED } = await import(
        "../constants/purchaseOrderStatus"
      );
      if (resolvedPurchaseOrderId) {
        const poForAck = await prisma.purchaseOrder.findUnique({
          where: { id: resolvedPurchaseOrderId },
          select: { id: true, status: true, poNumber: true },
        });
        if (
          poForAck &&
          PO_STATUSES_BEFORE_ACKNOWLEDGED.includes(String(poForAck.status || ""))
        ) {
          await prisma.purchaseOrder.update({
            where: { id: poForAck.id },
            data: { status: PO_STATUS.ACKNOWLEDGED },
          });
          console.log(
            `   ✅ PO ${poForAck.poNumber} status → ${PO_STATUS.ACKNOWLEDGED} (vendor invoice submitted)`
          );
        }
      }

      if (attachmentIds?.length) {
        const { VendorDocumentAttachmentService } = await import(
          "./VendorDocumentAttachmentService"
        );
        await VendorDocumentAttachmentService.linkStagedAttachments({
          attachmentIds,
          entityType: "PROCUREMENT_INVOICE",
          entityId: invoice.id,
          vendorId: resolvedVendorId,
          actorUserId: createdById ?? finalCreatedById
        });
        invoice = await prisma.procurementInvoice.findUnique({
          where: { id: invoice.id },
          include: procurementInvoiceInclude
        });
      }

      // Three-way match the new invoice against its PO and the receipts so far; a failure here is
      // logged and never blocks the invoice itself.
      {
        const { ProcurementInvoiceMatchService } = await import("./ProcurementInvoiceMatchService");
        if (await ProcurementInvoiceMatchService.evaluateQuietly(invoice.id)) {
          invoice = await prisma.procurementInvoice.findUnique({
            where: { id: invoice.id },
            include: procurementInvoiceInclude,
          });
        }
      }

      // Read the supplier's document with the LLM and compare it with what was captured. A staff capture made from AI
      // Invoice Capture reuses that reading (no second call); a vendor's submission is read in the background, so the
      // vendor is not kept waiting and a slow or failed reading never blocks the invoice.
      if (invoice.documentPath || readingIntakeId) {
        const { ProcurementInvoiceReadingService } = await import("./ProcurementInvoiceReadingService");
        if (readingIntakeId) {
          try {
            await ProcurementInvoiceReadingService.readInvoice(invoice.id, {
              intakeId: readingIntakeId,
              actorUserId: createdById ?? finalCreatedById,
            });
            invoice = await prisma.procurementInvoice.findUnique({
              where: { id: invoice.id },
              include: procurementInvoiceInclude,
            });
          } catch (readErr) {
            console.error("⚠️  Reading the captured invoice's document failed:", (readErr as Error)?.message || readErr);
          }
        } else {
          ProcurementInvoiceReadingService.scheduleRead(invoice.id, { actorUserId: createdById ?? finalCreatedById });
        }
      }

      // Audit log
      await AuditService.log({
        userId: createdById ?? finalCreatedById,
        action: "CREATE",
        entityType: "ProcurementInvoice",
        entityId: invoice.id,
        newValues: invoice,
      });

      if (!createdById) {
        try {
          const recipients = await this.resolveProcurementDeskNotifyRecipients();
          const { EmailNotificationService } = await import("./EmailNotificationService");
          await EmailNotificationService.sendProcurementInvoiceCreatedForReview({
            recipients,
            vendorName: invoice.vendor?.name ?? "Vendor",
            invoiceNumber: invoice.invoiceNumber,
            poNumber: invoice.purchaseOrder?.poNumber ?? null,
            totalAmount: Number(invoice.totalAmount),
            currencyCode: invoice.currency?.code ?? "USD",
          });
        } catch (notifyErr) {
          console.error(
            "⚠️  Failed to notify desk of vendor-submitted procurement invoice:",
            (notifyErr as Error)?.message || notifyErr
          );
        }
      }

      return invoice;
    } catch (error) {
      console.error("Error creating procurement invoice:", error);
      throw error;
    }
  }

  /**
   * Create a goods received note
   */
  static async createGoodsReceivedNote(
    purchaseOrderId: string,
    receivedById: string,
    items: {
      purchaseOrderItemId: string;
      quantityReceived: number;
      quantityAccepted: number;
      quantityRejected: number;
      qualityStatus: string;
      qualityNotes?: string;
      lineType?: string;
      milestoneDescription?: string;
      serialNumbers?: unknown;
      servicePeriodStart?: string | Date | null;
      servicePeriodEnd?: string | Date | null;
      serviceAmount?: number | null;
      serviceEvidence?: unknown;
    }[],
    options?: {
      receivedDate?: Date;
      deliveryNoteNumber?: string;
      locationName?: string;
      comments?: string;
      attachmentUrls?: unknown;
      latitude?: number;
      longitude?: number;
      geoCapturedAt?: Date;
      submittedByInvestee?: boolean;
    }
  ) {
    await UserMasterPolicyService.guardGrnCreation(purchaseOrderId, receivedById);
    try {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          items: true,
        },
      });

      if (!purchaseOrder) {
        throw new Error("Purchase order not found");
      }

      const { PO_STATUS, isPoFullyDelivered } = await import("../constants/purchaseOrderStatus");
      if (purchaseOrder.status === PO_STATUS.DRAFT) {
        throw new Error("Cannot receive goods against a draft purchase order");
      }
      if (purchaseOrder.status === PO_STATUS.BILLED) {
        throw new Error("Cannot receive goods against a purchase order that is already billed");
      }
      // Nothing is received against an order the supplier has not been sent (or that still waits for its approval).
      if (purchaseOrder.status === PO_STATUS.PENDING || (purchaseOrder.status === PO_STATUS.APPROVED && !purchaseOrder.sentAt)) {
        throw new Error("Cannot receive against a purchase order that has not been sent to the supplier");
      }
      if (isPoFullyDelivered(purchaseOrder.status)) {
        const pendingLines = purchaseOrder.items.filter(
          (l) => (l as { lineStatus?: string }).lineStatus !== "CANCELLED" && Number(l.quantityPending) > 0
        );
        if (pendingLines.length === 0) {
          throw new Error("Purchase order is already fully delivered");
        }
      }

      // §22: quantities that add up, no over-receipt beyond the configured tolerance, and a service receipt that states its
      // period, amount and evidence. Every rule is enforced here, whatever the client sent.
      const { getP2pConfig } = await import("./p2p/P2pSettings");
      const { validateReceipt, receiptTypeOf, checkAttachmentUrls, recomputePoDelivery } = await import("./p2p/ReceiptRules");
      const cfg = await getP2pConfig();
      items = (await validateReceipt(purchaseOrder, items as any, cfg)) as any;
      const receiptAttachments = checkAttachmentUrls(options?.attachmentUrls);
      const poItemMap = new Map(purchaseOrder.items.map((i) => [i.id, i]));

      const grnStatus =
        options?.submittedByInvestee === true ? "PENDING_GP_REVIEW" : "RECEIVED";

      const grnNumber = await nextProcurementGrnNumber(prisma as any, new Date());

      // Create GRN
      const grn = await NumberingService.guard("GRN", grnNumber, async () => prisma.goodsReceivedNote.create({
        data: {
          grnNumber,
          purchaseOrderId,
          receivedById,
          // §38: the receipt is in the currency of the order it receives against
          currencyId: (await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { currencyId: true } }))?.currencyId ?? null,
          ...(options?.receivedDate ? { receivedDate: options.receivedDate } : {}),
          ...(receiptAttachments != null ? { attachmentUrls: receiptAttachments as object } : {}),
          deliveryNoteNumber: options?.deliveryNoteNumber ? String(options.deliveryNoteNumber).trim().slice(0, 128) : null,
          locationName: options?.locationName ? String(options.locationName).trim().slice(0, 191) : null,
          receiptType: receiptTypeOf(items as any),
          ...(options?.comments && String(options.comments).trim() ? { qualityNotes: String(options.comments).trim() } : {}),
          ...(options?.latitude != null ? { latitude: new Decimal(options.latitude) } : {}),
          ...(options?.longitude != null ? { longitude: new Decimal(options.longitude) } : {}),
          ...(options?.geoCapturedAt ? { geoCapturedAt: options.geoCapturedAt } : {}),
          submittedByInvestee: !!options?.submittedByInvestee,
          status: grnStatus,
          qualityStatus: "PENDING",
          items: {
            create: items.map((item) => {
              const poi = poItemMap.get(item.purchaseOrderItemId)!;
              return {
                purchaseOrderItemId: item.purchaseOrderItemId,
                quantityOrdered: new Decimal(poi.quantity),
                quantityReceived: new Decimal(item.quantityReceived),
                quantityAccepted: new Decimal(item.quantityAccepted),
                quantityRejected: new Decimal(item.quantityRejected),
                qualityStatus: item.qualityStatus,
                qualityNotes: item.qualityNotes,
                lineType: item.lineType || "GOODS",
                milestoneDescription: item.milestoneDescription || null,
                servicePeriodStart: (item as any).servicePeriodStart ?? null,
                servicePeriodEnd: (item as any).servicePeriodEnd ?? null,
                serviceAmount: (item as any).serviceAmount != null ? new Decimal((item as any).serviceAmount) : null,
                serviceEvidence: (item as any).serviceEvidence != null ? ((item as any).serviceEvidence as object) : undefined,
                serialNumbers: item.serialNumbers != null ? (item.serialNumbers as object) : undefined,
              };
            }),
          },
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
      }));

      // The order's lines and delivery status follow the receipts that stand (recomputed, so they cannot drift).
      const nextPoStatus = await recomputePoDelivery(purchaseOrderId);
      if (nextPoStatus) console.log(`   ✅ PO status → ${nextPoStatus} (GRN ${grn.grnNumber})`);

      // The PO's receipts changed: re-match on create so its open invoices reflect them.
      {
        const { ProcurementInvoiceMatchService } = await import("./ProcurementInvoiceMatchService");
        await ProcurementInvoiceMatchService.evaluateForPurchaseOrder(purchaseOrderId);
      }

      // Audit log
      await AuditService.log({
        userId: receivedById,
        action: "CREATE",
        entityType: "GoodsReceivedNote",
        entityId: grn.id,
        newValues: grn,
      });

      const { VendorRatingService } = await import("./VendorRatingService");
      try {
        await VendorRatingService.recalculateForVendor(grn.purchaseOrder.vendorId);
      } catch (e) {
        console.error("VendorRatingService.recalculateForVendor:", e);
      }

      const grnFresh = await prisma.goodsReceivedNote.findUnique({
        where: { id: grn.id },
        include: {
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
          items: {
            include: {
              purchaseOrderItem: true,
            },
          },
        },
      });

      const grnResult = grnFresh ?? grn;

      // Suite 05.7 — investee GRNs wait in PENDING_GP_REVIEW until the GRN approval stage decides.
      if (grnStatus === "PENDING_GP_REVIEW") {
        try {
          const { ApprovalService } = await import("./ApprovalService");
          await ApprovalService.createApprovalRequest({
            stageType: "GRN",
            entityId: grnResult.id,
            entityData: {
              grnNumber: grnResult.grnNumber,
              purchaseOrderId,
              purchaseOrderNumber: purchaseOrder.poNumber,
            },
            requestedById: receivedById,
          });
        } catch (e) {
          console.error("ApprovalService.createApprovalRequest (GRN / Suite 05.7):", (e as Error)?.message || e);
        }
      }

      if (purchaseOrder.createdById) {
        const { dispatchProcurementNotification } = await import("./ProcurementNotificationService");
        const vendorName = grnResult.purchaseOrder?.vendor?.name || "the vendor";
        await dispatchProcurementNotification({
          userIds: [purchaseOrder.createdById],
          title: `Goods receipt recorded: ${grnResult.grnNumber}`,
          message: `${grnResult.grnNumber} was recorded against ${purchaseOrder.poNumber} (${vendorName}) and is awaiting quality inspection.`,
          type: "PROCUREMENT_GRN_RECORDED",
          relatedEntity: "GoodsReceivedNote",
          relatedEntityId: grnResult.id,
          data: { path: "/procurement/goods-received", grnNumber: grnResult.grnNumber, poNumber: purchaseOrder.poNumber },
        }).catch((e) => console.error("dispatchProcurementNotification (GRN created):", e?.message || e));
      }

      return grnResult;
    } catch (error) {
      console.error("Error creating goods received note:", error);
      throw error;
    }
  }

  /**
   * QC approve a GRN: header + all lines → qualityStatus PASSED; records approver and time.
   */
  static async approveGoodsReceivedNote(
    grnId: string,
    approvedById: string,
    options?: { qualityNotes?: string }
  ) {
    await UserMasterPolicyService.guardGrnApproval(grnId, approvedById);
    const existing = await prisma.goodsReceivedNote.findUnique({
      where: { id: grnId },
      select: { id: true, grnNumber: true, status: true, qualityStatus: true },
    });
    if (!existing) {
      throw new Error("Goods received note not found");
    }
    if (existing.status === "REJECTED") {
      throw new Error("Cannot approve a rejected goods received note");
    }
    if (existing.qualityStatus === "FAILED") {
      throw new Error("Cannot approve a goods received note that failed QC");
    }

    const qualityNotes =
      options?.qualityNotes != null && String(options.qualityNotes).trim()
        ? String(options.qualityNotes).trim()
        : undefined;

    const nextHeaderStatus =
      existing.status === "RECEIVED" ||
      existing.status === "PENDING_GP_REVIEW" ||
      existing.status === "DRAFT"
        ? "APPROVED"
        : existing.status;

    await prisma.$transaction([
      prisma.goodsReceivedNoteItem.updateMany({
        where: { grnId },
        data: { qualityStatus: "PASSED" },
      }),
      prisma.goodsReceivedNote.update({
        where: { id: grnId },
        data: {
          qualityStatus: "PASSED",
          approvedById,
          approvedAt: new Date(),
          status: nextHeaderStatus,
          ...(qualityNotes ? { qualityNotes } : {}),
        },
      }),
    ]);

    const updated = await prisma.goodsReceivedNote.findUnique({
      where: { id: grnId },
      include: {
        purchaseOrder: { include: { vendor: true, items: true } },
        receivedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: { include: { purchaseOrderItem: true } },
        returnToVendors: {
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    // The PO's receipts changed: re-match on approve so its open invoices reflect them.
    {
      const { ProcurementInvoiceMatchService } = await import("./ProcurementInvoiceMatchService");
      await ProcurementInvoiceMatchService.evaluateForPurchaseOrder(updated?.purchaseOrderId);
    }

    await AuditService.log({
      userId: approvedById,
      action: "APPROVE",
      entityType: "GoodsReceivedNote",
      entityId: grnId,
      newValues: {
        qualityStatus: "PASSED",
        status: nextHeaderStatus,
        qualityNotes: qualityNotes ?? null,
      },
    });

    console.log(
      `✅ GRN ${existing.grnNumber} QC approved (qualityStatus=PASSED, status=${nextHeaderStatus})`
    );

    if (updated?.purchaseOrder?.createdById) {
      const { dispatchProcurementNotification } = await import("./ProcurementNotificationService");
      const vendorName = updated.purchaseOrder.vendor?.name || "the vendor";
      await dispatchProcurementNotification({
        userIds: [updated.purchaseOrder.createdById],
        title: `Goods receipt approved: ${existing.grnNumber}`,
        message: `${existing.grnNumber} against ${updated.purchaseOrder.poNumber} (${vendorName}) passed quality inspection.`,
        type: "PROCUREMENT_GRN_APPROVED",
        relatedEntity: "GoodsReceivedNote",
        relatedEntityId: grnId,
        data: { path: "/procurement/goods-received", grnNumber: existing.grnNumber, poNumber: updated.purchaseOrder.poNumber },
      }).catch((e) => console.error("dispatchProcurementNotification (GRN approved):", e?.message || e));
    }

    return updated;
  }

  /**
   * QC reject a GRN: header + all lines → qualityStatus FAILED; status REJECTED; stores reason + fingerprint.
   */
  static async rejectGoodsReceivedNote(
    grnId: string,
    rejectedById: string,
    rejectionReason: string
  ) {
    const reason = String(rejectionReason || "").trim();
    if (!reason) {
      throw new Error("Rejection reason is required");
    }

    const existing = await prisma.goodsReceivedNote.findUnique({
      where: { id: grnId },
      include: { items: true },
    });
    if (!existing) {
      throw new Error("Goods received note not found");
    }
    if (existing.status === "REJECTED") {
      throw new Error("Goods received note is already rejected");
    }

    const { computeGoodsReceivedNoteRejectionFingerprint } = await import(
      "../utils/procurementEntityRejectionFingerprint"
    );
    const rejectionContentFingerprint = computeGoodsReceivedNoteRejectionFingerprint({
      ...existing,
      status: "REJECTED",
      qualityStatus: "FAILED",
      qualityNotes: reason,
    });

    await prisma.$transaction([
      prisma.goodsReceivedNoteItem.updateMany({
        where: { grnId },
        data: { qualityStatus: "FAILED" },
      }),
      prisma.goodsReceivedNote.update({
        where: { id: grnId },
        data: {
          qualityStatus: "FAILED",
          status: "REJECTED",
          rejectionReason: reason,
          rejectionContentFingerprint,
          qualityNotes: reason,
          approvedById: null,
          approvedAt: null,
        },
      }),
    ]);

    const updated = await prisma.goodsReceivedNote.findUnique({
      where: { id: grnId },
      include: {
        purchaseOrder: { include: { vendor: true, items: true } },
        receivedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: { include: { purchaseOrderItem: true } },
        returnToVendors: {
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    // What this receipt carried is owed again, and the order's delivery status follows.
    {
      const { recomputePoDelivery } = await import("./p2p/ReceiptRules");
      await recomputePoDelivery(existing.purchaseOrderId);
    }

    // The PO's receipts changed: re-match on reject so its open invoices stop counting this GRN.
    {
      const { ProcurementInvoiceMatchService } = await import("./ProcurementInvoiceMatchService");
      await ProcurementInvoiceMatchService.evaluateForPurchaseOrder(updated?.purchaseOrderId);
    }

    await AuditService.log({
      userId: rejectedById,
      action: "REJECT",
      entityType: "GoodsReceivedNote",
      entityId: grnId,
      newValues: {
        qualityStatus: "FAILED",
        status: "REJECTED",
        rejectionReason: reason,
      },
    });

    console.log(
      `❌ GRN ${existing.grnNumber} QC rejected (qualityStatus=FAILED, status=REJECTED)`
    );

    if (updated?.purchaseOrder?.createdById) {
      const { dispatchProcurementNotification } = await import("./ProcurementNotificationService");
      const vendorName = updated.purchaseOrder.vendor?.name || "the vendor";
      await dispatchProcurementNotification({
        userIds: [updated.purchaseOrder.createdById],
        title: `Goods receipt rejected: ${existing.grnNumber}`,
        message: `${existing.grnNumber} against ${updated.purchaseOrder.poNumber} (${vendorName}) failed quality inspection: ${reason}`,
        type: "PROCUREMENT_GRN_REJECTED",
        relatedEntity: "GoodsReceivedNote",
        relatedEntityId: grnId,
        data: { path: "/procurement/goods-received", grnNumber: existing.grnNumber, poNumber: updated.purchaseOrder.poNumber },
      }).catch((e) => console.error("dispatchProcurementNotification (GRN rejected):", e?.message || e));
    }

    return updated;
  }

  static async cancelPurchaseOrderLine(poId: string, lineId: string, userId: string) {
    const line = await prisma.purchaseOrderItem.findFirst({
      where: { id: lineId, purchaseOrderId: poId },
    });
    if (!line) throw new Error("PO line not found");
    await prisma.purchaseOrderItem.update({
      where: { id: lineId },
      data: { lineStatus: "CANCELLED", quantityPending: new Decimal(0) },
    });
    const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: poId } });
    const active = items.filter((i) => i.lineStatus !== "CANCELLED");
    const subtotal = active.reduce((s, i) => s + Number(i.totalPrice), 0);
    const taxAmount = VATService.calculateVAT(subtotal);
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        totalAmount: new Decimal(subtotal + taxAmount),
        version: { increment: 1 },
      },
    });
    await AuditService.log({
      userId,
      action: "UPDATE",
      entityType: "PurchaseOrder",
      entityId: poId,
      newValues: { cancelledLineId: lineId, note: "Line cancelled (Suite 04.7)" },
    });
    return { purchaseOrderId: poId, lineId, lineStatus: "CANCELLED" };
  }

  /**
   * Suite 04.6 — amend an issued PO by cloning it into a new version linked via amendmentOfPoId.
   * Optional body.items replaces active lines; omitted lines are copied from the source (non-cancelled).
   */
  static async amendPurchaseOrder(
    sourcePoId: string,
    userId: string,
    body?: {
      items?: Array<{
        itemName: string;
        description?: string;
        quantity: number;
        unitPrice: number;
        unit?: string;
        expectedDeliveryDate?: string | Date;
      }>;
      expectedDeliveryDate?: string | Date;
      shippingAddress?: string;
      paymentTerms?: string;
      deliveryTerms?: string;
    }
  ) {
    const source = await prisma.purchaseOrder.findUnique({
      where: { id: sourcePoId },
      include: { items: true },
    });
    if (!source) throw new Error("Purchase order not found");

    const closed = new Set(["CANCELLED", "CLOSED", "DELIVERED", "FULLY_RECEIVED"]);
    if (closed.has(String(source.status).toUpperCase())) {
      throw new Error(`Cannot amend a purchase order in status ${source.status}`);
    }

    const sourceLines =
      body?.items && body.items.length > 0
        ? body.items.map((i) => ({
            itemName: i.itemName,
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            unit: i.unit,
            expectedDeliveryDate: i.expectedDeliveryDate
              ? new Date(i.expectedDeliveryDate)
              : undefined,
          }))
        : source.items
            .filter((l) => l.lineStatus !== "CANCELLED")
            .map((l) => ({
              itemName: l.itemName,
              description: l.description || undefined,
              quantity: Number(l.quantity),
              unitPrice: Number(l.unitPrice),
              unit: l.unit || undefined,
              expectedDeliveryDate: l.expectedDeliveryDate || undefined,
            }));

    if (!sourceLines.length) throw new Error("Amendment requires at least one line item");

    await VATService.refreshActiveVatRate(false).catch(() => undefined);
    const subtotal = sourceLines.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = VATService.calculateVAT(subtotal);
    const totalAmount = subtotal + taxAmount;
    const poNumber = await this.resolvePoNumberForCreate(null);
    const nextVersion = Number(source.version || 1) + 1;

    const amendment = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        requisitionId: source.requisitionId,
        quotationId: null,
        vendorId: source.vendorId,
        priority: source.priority,
        status: "DRAFT",
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        totalAmount: new Decimal(totalAmount),
        currencyId: source.currencyId,
        expectedDeliveryDate: body?.expectedDeliveryDate
          ? new Date(body.expectedDeliveryDate)
          : source.expectedDeliveryDate,
        shippingAddress: body?.shippingAddress ?? source.shippingAddress,
        paymentTerms: body?.paymentTerms ?? source.paymentTerms,
        deliveryTerms: body?.deliveryTerms ?? source.deliveryTerms,
        createdById: userId,
        portfolioCompanyId: source.portfolioCompanyId,
        fundId: source.fundId,
        drawdownTrancheId: source.drawdownTrancheId,
        version: nextVersion,
        amendmentOfPoId: source.id,
        validityEndDate: source.validityEndDate,
        items: {
          create: sourceLines.map((i) => ({
            itemName: i.itemName,
            description: i.description,
            quantity: new Decimal(i.quantity),
            unitPrice: new Decimal(i.unitPrice),
            totalPrice: new Decimal(i.quantity * i.unitPrice),
            unit: i.unit,
            quantityPending: new Decimal(i.quantity),
            quantityReceived: new Decimal(0),
            ...(i.expectedDeliveryDate ? { expectedDeliveryDate: i.expectedDeliveryDate } : {}),
          })),
        },
      },
      include: {
        vendor: true,
        items: true,
        amendmentParent: { select: { id: true, poNumber: true, version: true } },
      },
    });

    await AuditService.log({
      userId,
      action: "CREATE",
      entityType: "PurchaseOrder",
      entityId: amendment.id,
      newValues: {
        note: "PO amendment (Suite 04.6)",
        amendmentOfPoId: source.id,
        version: nextVersion,
      },
    });

    return amendment;
  }

  static async createGrnReturnToVendor(params: {
    goodsReceivedNoteId: string;
    purchaseOrderItemId: string;
    quantity: number;
    reason?: string;
    createdById: string;
  }) {
    const qty = Number(params.quantity);
    if (!(qty > 0) || Number.isNaN(qty)) {
      throw new Error("quantity must be a positive number");
    }

    const grn = await prisma.goodsReceivedNote.findUnique({
      where: { id: params.goodsReceivedNoteId },
      include: {
        items: {
          where: { purchaseOrderItemId: params.purchaseOrderItemId },
        },
      },
    });

    if (!grn) {
      throw new Error("Goods received note not found");
    }

    const line = grn.items[0];
    if (!line) {
      throw new Error("Purchase order line is not on this GRN");
    }

    const received = Number(line.quantityReceived);
    const agg = await prisma.grnReturnToVendor.aggregate({
      where: {
        goodsReceivedNoteId: params.goodsReceivedNoteId,
        purchaseOrderItemId: params.purchaseOrderItemId,
      },
      _sum: { quantity: true },
    });
    const alreadyReturned = Number(agg._sum.quantity ?? 0);
    const remaining = received - alreadyReturned;
    if (qty > remaining + 1e-9) {
      throw new Error(
        `Return quantity exceeds remaining receivable on this GRN line (${remaining.toFixed(2)} remaining vs ${received.toFixed(2)} received, ${alreadyReturned.toFixed(2)} already marked for RTV)`
      );
    }

    // Suite 05.9 posting: reverse PO received/pending and GRN accepted qty, rematch invoices, mark POSTED.
    const rtv = await prisma.$transaction(async (tx) => {
      const created = await tx.grnReturnToVendor.create({
        data: {
          goodsReceivedNoteId: params.goodsReceivedNoteId,
          purchaseOrderItemId: params.purchaseOrderItemId,
          quantity: new Decimal(qty),
          reason: params.reason,
          status: "POSTED",
          createdById: params.createdById,
        },
      });

      const poi = await tx.purchaseOrderItem.findUnique({
        where: { id: params.purchaseOrderItemId },
      });
      if (poi) {
        const nextReceived = Math.max(0, Number(poi.quantityReceived) - qty);
        const nextPending = Number(poi.quantityPending) + qty;
        await tx.purchaseOrderItem.update({
          where: { id: poi.id },
          data: {
            quantityReceived: new Decimal(nextReceived),
            quantityPending: new Decimal(nextPending),
          },
        });
      }

      const nextAccepted = Math.max(0, Number(line.quantityAccepted) - qty);
      await tx.goodsReceivedNoteItem.update({
        where: { id: line.id },
        data: { quantityAccepted: new Decimal(nextAccepted) },
      });

      return created;
    });

    try {
      const { ProcurementInvoiceMatchService } = await import("./ProcurementInvoiceMatchService");
      await ProcurementInvoiceMatchService.evaluateForPurchaseOrder(grn.purchaseOrderId);
    } catch (e) {
      console.error("RTV rematch:", (e as Error)?.message || e);
    }

    await AuditService.log({
      userId: params.createdById,
      action: "CREATE",
      entityType: "GrnReturnToVendor",
      entityId: rtv.id,
      newValues: { quantity: qty, status: "POSTED", note: "RTV posted (Suite 05.9)" },
    });

    return rtv;
  }

  /**
   * Legacy: creates a sales-module `Invoice` with a generic customer.
   * Prefer {@link PurchaseInvoiceService.createVendorBillFromPurchaseOrder} via
   * `POST /api/procurement/purchase-orders/:id/convert-to-bill` or
   * `POST /api/accounting/purchase-invoices/from-purchase-order`.
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
            email: process.env.EMAIL_SUPPLIERS || 'suppliers@nvccz.co.zw',
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
        vatRate: taxAmount > 0 ? VATService.getVATRate() : 0
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
   * Get procurement dashboard data with detailed information.
   * @param viewerUserId When set, recent requisitions + Suite 02 SLA block respect investee fund isolation (2.7 / 2.8).
   */
  static async getProcurementDashboard(viewerUserId?: string) {
    try {
      const investeeVisibilityWhere = viewerUserId
        ? await this.buildInvesteeFundVisibilityWhereForViewer(viewerUserId)
        : null;

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

      // Get recent requisitions with details (Suite 02: scoped when viewer is fund-manager-only)
      const recentRequisitions = await prisma.purchaseRequisition.findMany({
        where: investeeVisibilityWhere ?? undefined,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          requisitionNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          department: true, // Scalar field (String), not a relation
          rejectionReason: true,
          rejectionContentFingerprint: true,
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
          rejectionReason: true,
          rejectionContentFingerprint: true,
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

      // §16: figures and supplier names of an event whose bids are still sealed never reach the dashboard.
      const sealedRfqIds = (
        await prisma.procurementRfq.findMany({
          where: { sealedBidding: true, bidOpenedAt: null, status: { notIn: ["AWARDED", "CLOSED", "CANCELLED", "COMPLETED"] } },
          select: { id: true },
        })
      ).map((r) => r.id);

      // Get recent quotations
      const recentQuotations = await prisma.vendorQuotation.findMany({
        take: 10,
        orderBy: { submittedAt: 'desc' },
        select: {
          procurementRfqId: true,
          id: true,
          quotationNumber: true,
          rfqNumber: true,
          status: true,
          totalAmount: true,
          vendorName: true,       // Scalar field
          vendorEmail: true,      // Scalar field
          companyName: true,      // Scalar field
          submittedAt: true,
          updatedAt: true,
          rejectionReason: true,
          rejectionContentFingerprint: true,
        }
      });

      // Get quotations by status
      const quotationsByStatus = await prisma.vendorQuotation.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true },
        where: sealedRfqIds.length ? { OR: [{ procurementRfqId: null }, { procurementRfqId: { notIn: sealedRfqIds } }] } : undefined,
      });
      const quotationCountsByStatus = await prisma.vendorQuotation.groupBy({ by: ['status'], _count: { id: true } });

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

      const { OPEN_PO_COMMITMENT_STATUSES } = await import("../constants/purchaseOrderStatus");

      const [committedGroup, openPoCommitmentCount] = await Promise.all([
        prisma.purchaseOrder.groupBy({
          by: ["currencyId"],
          where: { status: { in: OPEN_PO_COMMITMENT_STATUSES } },
          _sum: { totalAmount: true },
          _count: { id: true }
        }),
        prisma.purchaseOrder.count({
          where: { status: { in: OPEN_PO_COMMITMENT_STATUSES } }
        })
      ]);

      const commitCurrencyIds = [
        ...new Set(
          committedGroup
            .map((g) => g.currencyId)
            .filter((id): id is string => id != null)
        )
      ];
      const commitCurrencies =
        commitCurrencyIds.length > 0
          ? await prisma.currency.findMany({
              where: { id: { in: commitCurrencyIds } }
            })
          : [];
      const commitCurrencyMap = new Map(commitCurrencies.map((c) => [c.id, c]));

      const committedSpendByCurrency = committedGroup.map((row) => {
        const cur = row.currencyId
          ? commitCurrencyMap.get(row.currencyId)
          : null;
        return {
          currencyId: row.currencyId,
          code: cur?.code ?? "UNSET",
          symbol: cur?.symbol ?? null,
          name: cur?.name ?? "No currency on PO",
          committedSpend: Number(row._sum.totalAmount || 0),
          openPurchaseOrderCount: row._count.id
        };
      });

      const zigCommitted = committedSpendByCurrency.find(
        (x) => x.code && x.code.toUpperCase() === "ZIG"
      );

      let suite02InvesteeDrawdown: {
        pendingVcExecutiveReviewOver48h: Awaited<
          ReturnType<typeof ProcurementService.listInvesteePrsPendingVcOver48Hours>
        >;
        pendingVcExecutiveReviewOver48hCount: number;
      } | null = null;
      if (viewerUserId) {
        try {
          const sla = await this.listInvesteePrsPendingVcOver48Hours(viewerUserId);
          suite02InvesteeDrawdown = {
            pendingVcExecutiveReviewOver48h: sla,
            pendingVcExecutiveReviewOver48hCount: sla.length,
          };
        } catch {
          suite02InvesteeDrawdown = {
            pendingVcExecutiveReviewOver48h: [],
            pendingVcExecutiveReviewOver48hCount: 0,
          };
        }
      }

      return {
        commitmentAccounting: {
          note:
            "Committed spend sums open purchase orders (DRAFT, SENT, APPROVED, PENDING, ACKNOWLEDGED, partial delivery). No GL posting occurs when a PO is created. When a vendor bill is created from the PO, status becomes BILLED and the amount leaves committed spend; Accounts Payable posts when the purchase invoice is submitted.",
          openPurchaseOrderCount: openPoCommitmentCount,
          committedSpendByCurrency,
          committedSpendZIG: zigCommitted?.committedSpend ?? 0
        },
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
          byStatus: quotationCountsByStatus.map(qs => ({
            status: qs.status,
            count: qs._count.id,
            totalAmount: Number(quotationsByStatus.find((x) => x.status === qs.status)?._sum.totalAmount || 0)
          })),
          recent: recentQuotations.map(q => ({
            id: q.id,
            quotationNumber: q.quotationNumber,
            rfqNumber: q.rfqNumber,
            status: q.status,
            totalAmount: q.procurementRfqId && sealedRfqIds.includes(q.procurementRfqId) ? null : Number(q.totalAmount),
            vendor: q.procurementRfqId && sealedRfqIds.includes(q.procurementRfqId)
              ? { name: null, email: null, companyName: null }
              : {
                  name: q.vendorName,
                  email: q.vendorEmail,
                  companyName: q.companyName
                },
            submittedAt: q.submittedAt,
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
        suite02InvesteeDrawdown,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error("Error getting procurement dashboard:", error);
      throw error;
    }
  }
}
