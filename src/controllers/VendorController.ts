// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import {
  buildTaxComplianceData,
  maybeSendImmediateTaxAlertForNewVendor,
} from "../services/VendorTaxComplianceService";
import { VendorRegistrationDedupeService } from "../services/VendorRegistrationDedupeService";
import { normalizeVendorCategory } from "../utils/vendorCategoryNormalize";
import { VendorBankService } from "../services/VendorBankService";
import { VendorKycService } from "../services/VendorKycService";
import { listVendorsEligibleForRfqQuery } from "../services/VendorProcurementListService";
import { VendorSelfRegistrationService } from "../services/VendorSelfRegistrationService";
import AuditService from "../services/AuditService";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as PROC_PERMS } from "../config/procurementPermissions";
import { EmailNotificationService } from "../services/EmailNotificationService";
import { VendorLifecycleService } from "../services/VendorLifecycleService";
import { VendorGateService } from "../services/VendorGateService";
import { VendorComplianceJobService } from "../services/VendorComplianceJobService";
import {
  RISK_CLASSIFICATIONS,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_DOCUMENT_TYPES,
  VENDOR_DOCUMENT_TYPE_LABELS,
  VendorPolicyError,
  TRANSITIONS,
  documentExpiryState,
  normalizeVendorStatus,
} from "../config/vendorStatus";

const cleanStr = (v: any, max = 255) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw new VendorPolicyError("VALIDATION", `Value too long (max ${max}): ${s.slice(0, 30)}...`, 400);
  return s;
};

/** Commodity/service categories: a list of short labels. */
function cleanCategories(v: any) {
  if (v === undefined) return undefined;
  if (v === null) return [];
  const list = Array.isArray(v) ? v : String(v).split(",");
  return [...new Set(list.map((x: any) => String(x).trim()).filter(Boolean))].slice(0, 30);
}

function cleanRisk(v: any) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === "") return null;
  const r = String(v).trim().toUpperCase();
  if (!(RISK_CLASSIFICATIONS as readonly string[]).includes(r)) {
    throw new VendorPolicyError("VALIDATION", `Invalid risk classification. Valid: ${RISK_CLASSIFICATIONS.join(", ")}`, 400);
  }
  return r;
}

function cleanEmail(v: any) {
  const s = cleanStr(v, 255);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new VendorPolicyError("VALIDATION", "Contact email is not a valid email address", 400);
  return s;
}

/** A settlement currency named by code (the UI works in codes) resolved to its id; unknown codes are refused. */
async function resolveSettlementCurrency(codeRaw: any) {
  if (codeRaw === undefined) return undefined;
  if (codeRaw === null || String(codeRaw).trim() === "") return null;
  const code = String(codeRaw).trim().toUpperCase();
  const cur = await prisma.currency.findFirst({ where: { code } });
  if (!cur) throw new VendorPolicyError("VALIDATION", `Currency ${code} is not set up`, 400);
  return cur.id;
}

function policyStatus(error: any, fallback = 400) {
  return error instanceof VendorPolicyError ? error.statusCode : fallback;
}

/** KYC fields for API responses (never expose encryption IV / auth tag). */
const VENDOR_KYC_API_SELECT = {
  id: true,
  vendorId: true,
  documentType: true,
  fileName: true,
  fileUrl: true,
  isEncrypted: true,
  isVerified: true,
  verifiedById: true,
  verifiedAt: true,
  expiryDate: true,
  issueDate: true,
  documentNumber: true,
  notifyDaysBefore: true,
  lastExpiryNoticeAt: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,
};

function attachStaffKycDownloadUrls(docs: any[]) {
  return (docs || []).map((d) => VendorKycService.formatKycDocumentResponse(d as Record<string, unknown>));
}

export class VendorController {
  /**
   * Create a new vendor
   */
  static async createVendor(req: AuthRequest, res: Response) {
    try {
      const {
        name,
        taxNumber: taxNumberRaw,
        vatNumber,
        bpNumber,
        contactPerson,
        email,
        phone,
        address,
        paymentTerms,
        itf263CertificateText,
        taxClearanceExpiryDate,
        category,
        settlementCurrencyId,
        isBlacklisted,
        blacklistReason,
        registrationStatus,
        country,
        tradingName,
        riskRating,
        registrationNumber,
        commodityCategories,
        notes,
        settlementCurrencyCode,
      } = req.body;
      const currencyFromCode = await resolveSettlementCurrency(settlementCurrencyCode);

      // Status is never set on create: a new vendor is a Draft and moves through the lifecycle (approval, etc.).
      if (req.body?.lifecycleStatus !== undefined || req.body?.registrationStatus !== undefined || req.body?.isBlacklisted !== undefined) {
        return res.status(400).json({
          success: false,
          message: "Vendor status cannot be set on create. A new vendor is a Draft; use POST /vendors/:id/status to move it.",
        });
      }

      let taxNumber = taxNumberRaw;
      if (
        taxNumber === undefined ||
        taxNumber === null ||
        String(taxNumber).trim() === ""
      ) {
        taxNumber = undefined;
      }

      // Validation
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Vendor name is required"
        });
      }

      // SRD §41 "Data Validation" requires server-side email format validation even where frontend validation
      // exists; SRD §8.1 tracks Contact Email as a Vendor Record field. Same pattern as UserService.updateUser.
      if (email !== undefined && email !== null && String(email).trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(email).trim())) {
          return res.status(400).json({
            success: false,
            message: "Invalid email format",
          });
        }
      }

      const compliance = buildTaxComplianceData({
        itf263CertificateText,
        taxClearanceExpiryDate,
      });

      if ("error" in compliance) {
        return res.status(400).json({
          success: false,
          message: compliance.error,
        });
      }

      // Check if vendor name already exists
      const existingVendor = await prisma.vendor.findFirst({
        where: { 
          name: { equals: name },
          isActive: true
        }
      });

      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: "Vendor with this name already exists"
        });
      }

      const dedupe = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
        taxNumber,
        bpNumber,
      });
      if (!dedupe.ok) {
        return res.status(400).json({
          success: false,
          message: dedupe.message,
        });
      }

      const taxData =
        "skip" in compliance
          ? {}
          : {
              taxComplianceStatus: compliance.taxComplianceStatus,
              taxClearanceExpiryDate: compliance.taxClearanceExpiryDate,
              taxRevalidationAlertDueAt: compliance.taxRevalidationAlertDueAt,
              taxRevalidationAlertNotifiedAt: compliance.taxRevalidationAlertNotifiedAt,
              isActive: compliance.isActive,
            };

      const normalizedCat =
        category != null && String(category).trim() !== ""
          ? normalizeVendorCategory(category)
          : undefined;

      const vendor = await prisma.vendor.create({
        data: {
          name,
          taxNumber,
          bpNumber,
          contactPerson,
          email,
          phone,
          address,
          paymentTerms,
          ...(normalizedCat ? { category: normalizedCat } : {}),
          ...(currencyFromCode !== undefined ? { settlementCurrencyId: currencyFromCode } : settlementCurrencyId !== undefined ? { settlementCurrencyId } : {}),
          vendorCode: await VendorLifecycleService.nextVendorCode(),
          lifecycleStatus: "DRAFT",
          approvalStatus: "NOT_SUBMITTED",
          registrationStatus: "PENDING_REVIEW",
          ...(country !== undefined ? { country: cleanStr(country, 64) } : {}),
          ...(tradingName !== undefined ? { tradingName: cleanStr(tradingName) } : {}),
          ...(riskRating !== undefined ? { riskRating: cleanRisk(riskRating) } : {}),
          ...(registrationNumber !== undefined ? { registrationNumber: cleanStr(registrationNumber, 64) } : {}),
          ...(vatNumber !== undefined ? { vatNumber: cleanStr(vatNumber, 64) } : {}),
          ...(commodityCategories !== undefined ? { commodityCategories: cleanCategories(commodityCategories) } : {}),
          ...(notes !== undefined ? { notes: cleanStr(notes, 5000) } : {}),
          ...taxData,
        }
      });
      await VendorGateService.refresh(vendor.id);
      await AuditService.log({
        userId: req.user!.id,
        action: "VENDOR_CREATE",
        entityType: "Vendor",
        entityId: vendor.id,
        newValues: { vendorCode: vendor.vendorCode, name: vendor.name, lifecycleStatus: "DRAFT" },
      }).catch(() => undefined);

      if (!("skip" in compliance)) {
        await maybeSendImmediateTaxAlertForNewVendor({
          id: vendor.id,
          name: vendor.name,
          taxClearanceExpiryDate: vendor.taxClearanceExpiryDate,
          taxRevalidationAlertDueAt: vendor.taxRevalidationAlertDueAt,
        });
      }

      res.status(201).json({
        success: true,
        message: "skip" in compliance
          ? "Vendor created successfully"
          : "Vendor created successfully with ACTIVE tax compliance (ZIMRA ITF263). Re-validation alert is scheduled 30 days before expiry.",
        data: vendor,
        taxCompliance:
          "skip" in compliance
            ? { status: "PENDING", note: "No ITF263 data supplied; tax compliance remains PENDING." }
            : {
                status: vendor.taxComplianceStatus,
                taxClearanceExpiryDate: vendor.taxClearanceExpiryDate,
                taxRevalidationAlertDueAt: vendor.taxRevalidationAlertDueAt,
                expirySource: compliance.meta.source,
              },
      });
    } catch (error: any) {
      res.status(policyStatus(error, 500)).json({
        success: false,
        message: error instanceof VendorPolicyError ? error.message : "Failed to create vendor",
        error: error.message
      });
    }
  }

  /**
   * Get all vendors
   */
  static async getVendors(req: AuthRequest, res: Response) {
    try {
      const { isActive, search, vendorOrigin, registrationStatus } = req.query;

      // Bring stored compliance/expiry in step with today's date before anyone reads a status off the list.
      await VendorComplianceJobService.syncLapsed().catch(() => undefined);

      const where: any = {};

      const statusFilter = String(req.query.status || "")
        .split(",")
        .map((s) => normalizeVendorStatus(s))
        .filter(Boolean);
      if (statusFilter.length) {
        // Asking for a status by name shows vendors in it, including Inactive/Blocked.
        // "ACTIVE" is the pre-status-model spelling of Approved; rows created by older code paths may still carry it.
        const wanted = statusFilter.includes("APPROVED") ? [...statusFilter, "ACTIVE"] : statusFilter;
        where.lifecycleStatus = wanted.length === 1 ? wanted[0] : { in: wanted };
      } else if (isActive !== undefined) {
        where.isActive = isActive === "true";
      } else {
        where.isActive = true;
      }
      if (req.query.compliance) {
        const c = String(req.query.compliance).toUpperCase();
        if (["COMPLIANT", "EXPIRING_SOON", "NON_COMPLIANT", "PENDING"].includes(c)) where.complianceStatus = c;
      }
      if (req.query.approvalStatus) {
        where.approvalStatus = String(req.query.approvalStatus).toUpperCase();
      }

      // staff = created in accounting; portal = self-registered; omit = both
      if (vendorOrigin === "staff") {
        where.selfRegistered = false;
      } else if (vendorOrigin === "portal") {
        where.selfRegistered = true;
      }

      if (registrationStatus && String(registrationStatus).trim() !== "") {
        const statuses = String(registrationStatus)
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        if (statuses.length === 1) {
          where.registrationStatus = statuses[0];
        } else if (statuses.length > 1) {
          where.registrationStatus = { in: statuses };
        }
      }

      if (search) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { name: { contains: search as string } },
            { tradingName: { contains: search as string } },
            { vendorCode: { contains: search as string } },
            { registrationNumber: { contains: search as string } },
            { taxNumber: { contains: search as string } },
            { contactPerson: { contains: search as string } },
            { email: { contains: search as string } },
          ],
        });
      }

      const includeParam = String(req.query.include || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const listInclude: Record<string, unknown> = {};
      if (includeParam.includes("banks")) {
        listInclude.banks = { orderBy: { createdAt: "asc" as const } };
      }
      if (includeParam.includes("kyc")) {
        listInclude.kycDocuments = {
          select: VENDOR_KYC_API_SELECT,
          orderBy: { createdAt: "desc" as const },
        };
      }
      if (
        includeParam.includes("settlementcurrency") ||
        includeParam.includes("currency")
      ) {
        listInclude.settlementCurrency = {
          select: { id: true, code: true, name: true, symbol: true },
        };
      }

      const vendors = await prisma.vendor.findMany({
        where,
        orderBy: { name: "asc" },
        ...(Object.keys(listInclude).length ? { include: listInclude as any } : {}),
      });

      const canSeeBanks = userHasEffectivePermission(req.user, PROC_PERMS.vendorBanksView) || isModulePrivilegedUser(req.user);
      const noticeDays = await VendorGateService.noticeDays();
      // Documents with an expiry date decide compliance, whether or not the caller asked for the file list.
      const expiryDocs = await prisma.vendorKycDocument.findMany({
        where: { vendorId: { in: (vendors as any[]).map((v) => v.id) }, expiryDate: { not: null } },
        select: { vendorId: true, documentType: true, expiryDate: true, notifyDaysBefore: true },
      });
      const docsByVendor = new Map<string, any[]>();
      for (const d of expiryDocs) docsByVendor.set(d.vendorId, [...(docsByVendor.get(d.vendorId) || []), d]);

      let data: any[] = (vendors as any[]).map((v) => {
        const summary = VendorGateService.summarize(v, docsByVendor.get(v.id) || [], noticeDays);
        const { banks, kycDocuments, ...rest } = v as any;
        return {
          ...rest,
          vendorStatus: normalizeVendorStatus(v.lifecycleStatus) || "DRAFT",
          vendorStatusLabel: VENDOR_STATUS_LABELS[normalizeVendorStatus(v.lifecycleStatus) || "DRAFT"],
          transactable: summary.transactable,
          blockedReasons: summary.blockedReasons,
          complianceIssues: summary.compliance.issues,
          complianceWarnings: summary.compliance.warnings,
          // Banking details are finance's: only a caller with the banks permission receives them.
          ...(banks !== undefined ? { banks: canSeeBanks ? banks : [] } : {}),
          ...(kycDocuments !== undefined
            ? {
                kycDocuments: attachStaffKycDownloadUrls(kycDocuments).map((d: any) => ({
                  ...d,
                  typeLabel: VENDOR_DOCUMENT_TYPE_LABELS[d.documentType] || d.documentType,
                  expiryState: documentExpiryState(d.expiryDate, d.notifyDaysBefore ?? noticeDays),
                })),
              }
            : {}),
        };
      });

      res.status(200).json({
        success: true,
        data,
        documentExpiryNoticeDays: noticeDays,
        meta: {
          note: "Includes staff-created and portal self-registered vendors (isActive=true by default). Use ?vendorOrigin=portal|staff and ?registrationStatus=PENDING_REVIEW to filter.",
          includeHint:
            "Optional: ?include=banks,kyc,settlementCurrency (comma-separated) to nest relations on each vendor.",
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch vendors",
        error: error.message
      });
    }
  }

  /**
   * Get vendor by ID
   */
  static async getVendorById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const vendor = await prisma.vendor.findUnique({
        where: { id },
        include: {
          expenses: {
            orderBy: { transactionDate: "desc" },
            take: 10,
          },
          banks: { orderBy: { createdAt: "asc" } },
          kycDocuments: {
            select: VENDOR_KYC_API_SELECT,
            orderBy: { createdAt: "desc" },
          },
          settlementCurrency: {
            select: { id: true, code: true, name: true, symbol: true },
          },
        },
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }
      // Banking details are finance's: a caller without the banks permission gets none.
      if (!(userHasEffectivePermission(req.user, PROC_PERMS.vendorBanksView) || isModulePrivilegedUser(req.user))) {
        (vendor as any).banks = [];
      }

      const fresh = await VendorGateService.refresh(id);
      const noticeDays = await VendorGateService.noticeDays();
      const status = normalizeVendorStatus((fresh || vendor).lifecycleStatus) || "DRAFT";
      const kyc = attachStaffKycDownloadUrls(vendor.kycDocuments).map((d: any) => ({
        ...d,
        typeLabel: VENDOR_DOCUMENT_TYPE_LABELS[d.documentType] || d.documentType,
        expiryState: documentExpiryState(d.expiryDate, d.notifyDaysBefore ?? noticeDays),
      }));
      const [poCount, invoiceCount, quoteCount] = await Promise.all([
        prisma.purchaseOrder.count({ where: { vendorId: id } }),
        prisma.procurementInvoice.count({ where: { vendorId: id } }),
        prisma.vendorQuotation.count({ where: { vendorId: id } }),
      ]);
      const gates: Record<string, { ok: boolean; reasons: string[] }> = {};
      for (const a of ["INVITE", "AWARD", "PO", "PAY"] as const) {
        const r = await VendorGateService.evaluate(id, a);
        gates[a] = { ok: r.ok, reasons: r.reasons };
      }
      const data = {
        ...vendor,
        ...(fresh ? { lifecycleStatus: fresh.lifecycleStatus, complianceStatus: fresh.complianceStatus, taxComplianceStatus: fresh.taxComplianceStatus, statusReason: fresh.statusReason } : {}),
        vendorStatus: status,
        vendorStatusLabel: VENDOR_STATUS_LABELS[status],
        kycDocuments: kyc,
        compliance: fresh?.compliance ?? null,
        availableMoves: VendorLifecycleService.availableMoves(fresh || vendor, req.user),
        gates,
        history: { purchaseOrders: poCount, invoices: invoiceCount, quotations: quoteCount },
        documentExpiryNoticeDays: noticeDays,
      };

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor",
        error: error.message
      });
    }
  }

  /**
   * Update vendor
   */
  static async updateVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        taxNumber: taxNumberRaw,
        vatNumber,
        bpNumber,
        contactPerson,
        email,
        phone,
        address,
        paymentTerms,
        isActive,
        itf263CertificateText,
        taxClearanceExpiryDate,
        category,
        settlementCurrencyId,
        isBlacklisted,
        blacklistReason,
        registrationStatus,
        country,
        tradingName,
        riskRating,
        registrationNumber,
        commodityCategories,
        notes,
        settlementCurrencyCode,
      } = req.body;
      const currencyFromCode = await resolveSettlementCurrency(settlementCurrencyCode);

      const taxNumber = taxNumberRaw !== undefined ? taxNumberRaw : undefined;

      // Status, blocking and activation are decisions with their own guarded route (permission, reason, audit, and
      // segregation of duties). The plain update must never be a way round that.
      if (
        req.body?.lifecycleStatus !== undefined ||
        isBlacklisted !== undefined ||
        blacklistReason !== undefined ||
        registrationStatus !== undefined ||
        isActive !== undefined ||
        req.body?.approvalStatus !== undefined ||
        req.body?.complianceStatus !== undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "Status fields cannot be edited here. Use POST /vendors/:id/status (with a reason) to change a vendor's status.",
        });
      }

      // Check if vendor exists
      const existingVendor = await prisma.vendor.findUnique({
        where: { id }
      });

      if (!existingVendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      // SRD §41 "Data Validation" requires server-side email format validation even where frontend validation
      // exists; SRD §8.1 tracks Contact Email as a Vendor Record field. Same pattern as UserService.updateUser.
      if (email !== undefined && email !== null && String(email).trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(email).trim())) {
          return res.status(400).json({
            success: false,
            message: "Invalid email format",
          });
        }
      }

      const hasItfInput =
        (itf263CertificateText !== undefined &&
          String(itf263CertificateText).trim() !== "") ||
        taxClearanceExpiryDate !== undefined;

      let itfCompliance: ReturnType<typeof buildTaxComplianceData> | null = null;
      if (hasItfInput) {
        itfCompliance = buildTaxComplianceData({
          itf263CertificateText,
          taxClearanceExpiryDate,
        });
        if ("error" in itfCompliance) {
          return res.status(400).json({
            success: false,
            message: itfCompliance.error,
          });
        }
      }

      // If updating name, check if new name already exists
      if (name && name !== existingVendor.name) {
        const nameExists = await prisma.vendor.findFirst({
          where: { 
            name: { equals: name },
            id: { not: id },
            isActive: true
          }
        });

        if (nameExists) {
          return res.status(400).json({
            success: false,
            message: "Vendor with this name already exists"
          });
        }
      }

      const nextTax =
        taxNumber !== undefined ? taxNumber : existingVendor.taxNumber;
      const nextBp =
        bpNumber !== undefined ? bpNumber : existingVendor.bpNumber;

      const dedupe = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
        taxNumber: nextTax,
        bpNumber: nextBp,
        excludeVendorId: id,
      });
      if (!dedupe.ok) {
        return res.status(400).json({
          success: false,
          message: dedupe.message,
        });
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (taxNumber !== undefined) updateData.taxNumber = taxNumber;
      if (bpNumber !== undefined) updateData.bpNumber = bpNumber;
      if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
      if (registrationNumber !== undefined) updateData.registrationNumber = cleanStr(registrationNumber, 64);
      if (vatNumber !== undefined) updateData.vatNumber = cleanStr(vatNumber, 64);
      if (commodityCategories !== undefined) updateData.commodityCategories = cleanCategories(commodityCategories);
      if (notes !== undefined) updateData.notes = cleanStr(notes, 5000);
      if (email !== undefined) updateData.email = cleanEmail(email);

      if (category !== undefined) {
        updateData.category =
          category == null || String(category).trim() === ""
            ? null
            : normalizeVendorCategory(category);
      }
      if (currencyFromCode !== undefined) {
        updateData.settlementCurrencyId = currencyFromCode;
      } else if (settlementCurrencyId !== undefined) {
        updateData.settlementCurrencyId = settlementCurrencyId || null;
      }
      if (country !== undefined) updateData.country = cleanStr(country, 64);
      if (tradingName !== undefined) updateData.tradingName = cleanStr(tradingName);
      if (riskRating !== undefined) updateData.riskRating = cleanRisk(riskRating);

      if (itfCompliance && !("skip" in itfCompliance)) {
        updateData.taxComplianceStatus = itfCompliance.taxComplianceStatus;
        updateData.taxClearanceExpiryDate = itfCompliance.taxClearanceExpiryDate;
        updateData.taxRevalidationAlertDueAt = itfCompliance.taxRevalidationAlertDueAt;
        updateData.taxRevalidationAlertNotifiedAt = null;
      }

      let vendor = await prisma.vendor.update({
        where: { id },
        data: updateData
      });
      // A renewed clearance brings an auto-expired vendor back; a lapsed one takes an approved vendor out.
      await VendorGateService.refresh(id);
      vendor = (await prisma.vendor.findUnique({ where: { id } })) || vendor;

      const changed = Object.keys(updateData).filter(
        (k) => String((existingVendor as any)[k] ?? "") !== String((vendor as any)[k] ?? "")
      );
      if (changed.length) {
        await AuditService.log({
          userId: req.user!.id,
          action: "UPDATE",
          entityType: "Vendor",
          entityId: id,
          oldValues: Object.fromEntries(changed.map((k) => [k, (existingVendor as any)[k] ?? null])),
          newValues: Object.fromEntries(changed.map((k) => [k, (vendor as any)[k] ?? null])),
        }).catch(() => undefined);
      }

      if (hasItfInput && vendor.taxComplianceStatus === "ACTIVE") {
        await maybeSendImmediateTaxAlertForNewVendor({
          id: vendor.id,
          name: vendor.name,
          taxClearanceExpiryDate: vendor.taxClearanceExpiryDate,
          taxRevalidationAlertDueAt: vendor.taxRevalidationAlertDueAt,
        });
      }

      res.status(200).json({
        success: true,
        message: "Vendor updated successfully",
        data: vendor
      });
    } catch (error: any) {
      res.status(policyStatus(error, 500)).json({
        success: false,
        message: error instanceof VendorPolicyError ? error.message : "Failed to update vendor",
        error: error.message
      });
    }
  }

  /**
   * Remove a vendor. A vendor with any historical transaction (orders, invoices, quotations, RFQ invitations,
   * expenses, cashbook) is NEVER destroyed: it is made Inactive and kept with its full history. Only a vendor
   * nothing ever referenced is deleted outright.
   */
  static async deleteVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const vendor = await prisma.vendor.findUnique({ where: { id } });
      if (!vendor) {
        return res.status(404).json({ success: false, message: "Vendor not found" });
      }
      const counts = await Promise.all([
        prisma.purchaseOrder.count({ where: { vendorId: id } }),
        prisma.procurementInvoice.count({ where: { vendorId: id } }),
        prisma.purchaseInvoice.count({ where: { vendorId: id } }),
        prisma.vendorQuotation.count({ where: { vendorId: id } }),
        prisma.rfqVendorInvitation.count({ where: { vendorId: id } }),
        prisma.expense.count({ where: { vendorId: id } }),
        prisma.cashbookEntry.count({ where: { vendorId: id } }),
      ]);
      const hasHistory = counts.some((c) => c > 0);
      if (hasHistory) {
        const status = normalizeVendorStatus(vendor.lifecycleStatus);
        if (status !== "INACTIVE") {
          // Deactivation is a status change like any other: same permission, reason and audit.
          const from = status || "DRAFT";
          if (["APPROVED", "SUSPENDED", "BLOCKED", "EXPIRED", "DRAFT", "PENDING_REVIEW", "PENDING_APPROVAL"].includes(from)) {
            await VendorLifecycleService.transition(id, "INACTIVE", req.user, {
              reason: String(req.body?.reason || "Removed from the registry (has transaction history, so kept)"),
              audit: { ip: req.ip, ua: req.get("user-agent") },
            });
          }
        }
        await AuditService.log({
          userId: req.user!.id,
          action: "VENDOR_SOFT_DELETE",
          entityType: "Vendor",
          entityId: id,
          newValues: { reason: "Has transaction history; record preserved", purchaseOrders: counts[0], invoices: counts[1] + counts[2], quotations: counts[3] },
        }).catch(() => undefined);
        return res.status(200).json({
          success: true,
          deactivated: true,
          message: `${vendor.name} has transaction history, so the record was kept and the vendor was made Inactive instead of deleted.`,
        });
      }
      await prisma.$transaction([
        prisma.vendorBank.deleteMany({ where: { vendorId: id } }),
        prisma.vendorKycDocument.deleteMany({ where: { vendorId: id } }),
        prisma.rfqClarification.deleteMany({ where: { vendorId: id } }),
        prisma.vendor.delete({ where: { id } }),
      ]);
      await AuditService.log({
        userId: req.user!.id,
        action: "VENDOR_DELETE",
        entityType: "Vendor",
        entityId: id,
        oldValues: { vendorCode: vendor.vendorCode, name: vendor.name },
      }).catch(() => undefined);
      res.status(200).json({ success: true, deactivated: false, message: "Vendor deleted (it had no history)." });
    } catch (error: any) {
      res.status(policyStatus(error, 500)).json({
        success: false,
        message: error instanceof VendorPolicyError ? error.message : "Failed to delete vendor",
        error: error.message,
      });
    }
  }

  /** POST /vendors/:id/status { status, reason }: the only route that changes a vendor's status. */
  static async changeVendorStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const to = req.body?.status;
      if (!to) return res.status(400).json({ success: false, message: "status is required" });
      const vendor = await VendorLifecycleService.transition(id, to, req.user, {
        reason: req.body?.reason,
        audit: { ip: req.ip, ua: req.get("user-agent") },
      });
      res.status(200).json({
        success: true,
        message: `Vendor is now ${VENDOR_STATUS_LABELS[normalizeVendorStatus(vendor.lifecycleStatus) || "DRAFT"]}.`,
        data: vendor,
      });
    } catch (error: any) {
      res.status(policyStatus(error, 400)).json({ success: false, code: error?.code, message: error.message });
    }
  }

  /** GET /vendors/status-options: statuses, transitions and document types for the UI (no hard-coded lists in the client). */
  static async getStatusOptions(_req: AuthRequest, res: Response) {
    res.status(200).json({
      success: true,
      data: {
        statuses: VENDOR_STATUSES.map((s) => ({ code: s, label: VENDOR_STATUS_LABELS[s] })),
        risk: RISK_CLASSIFICATIONS,
        documentTypes: VENDOR_DOCUMENT_TYPES.filter((t) => !["CR14", "BANK_LETTER", "ITF263"].includes(t)).map((t) => ({
          code: t,
          label: VENDOR_DOCUMENT_TYPE_LABELS[t],
        })),
        expiryNoticeDays: await VendorGateService.noticeDays(),
        // The moves the lifecycle allows, so the UI never hard-codes them.
        transitions: Object.fromEntries(
          Object.entries(TRANSITIONS).map(([from, rules]) => [from, (rules as any[]).map((r) => ({ to: r.to, label: VENDOR_STATUS_LABELS[r.to], needs: r.needs, reasonRequired: !!r.reason }))])
        ),
      },
    });
  }

  /**
   * Get vendor expenses
   */
  static async getVendorExpenses(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Check if vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id }
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where: { vendorId: id },
          include: {
            category: true,
            currency: true
          },
          orderBy: { transactionDate: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.expense.count({
          where: { vendorId: id }
        })
      ]);

      res.status(200).json({
        success: true,
        data: {
          expenses,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor expenses",
        error: error.message
      });
    }
  }

  static async listVendorsForRfq(req: AuthRequest, res: Response) {
    try {
      const { sourcingCategory, requisitionId, search } = req.query;
      const data = await listVendorsEligibleForRfqQuery({
        sourcingCategory: sourcingCategory as string | undefined,
        requisitionId: requisitionId as string | undefined,
        search: search as string | undefined,
      });
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async listPendingReviewVendors(req: AuthRequest, res: Response) {
    try {
      const rows = await prisma.vendor.findMany({
        where: { registrationStatus: "PENDING_REVIEW", selfRegistered: true, lifecycleStatus: "PENDING_REVIEW" },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { banks: true, kycDocuments: true } } },
      });
      // The self-registration token lets the vendor upload documents without signing in; staff never need it.
      const data = rows.map(({ selfRegistrationToken, ...rest }: any) => rest);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveVendorRegistration(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const vendor = await VendorSelfRegistrationService.approvePendingVendor(id, req.user);
      await AuditService.log({
        userId: req.user!.id,
        action: "APPROVE_REGISTRATION",
        entityType: "Vendor",
        entityId: id,
        oldValues: { registrationStatus: "PENDING_REVIEW" },
        newValues: { registrationStatus: "ACTIVE" },
      }).catch(() => undefined);
      const email = vendor.email && String(vendor.email).trim();
      if (email) {
        try {
          await EmailNotificationService.sendVendorRegistrationApprovedEmail({
            vendorEmail: email,
            vendorName: vendor.name,
            contactPerson: vendor.contactPerson,
          });
        } catch (emailErr: any) {
          console.warn(
            "[vendor] Registration approved but approval email failed:",
            emailErr?.message || emailErr
          );
        }
      }
      res.status(200).json({ success: true, data: vendor });
    } catch (error: any) {
      res.status(policyStatus(error, 400)).json({ success: false, code: error?.code, message: error.message });
    }
  }

  /** Decline a self-registration: the vendor is deactivated, the reason audited and emailed to the vendor. */
  static async declineVendorRegistration(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) {
        return res.status(400).json({ success: false, message: "Say why the registration is declined; the vendor is told." });
      }
      const vendor = await VendorSelfRegistrationService.declinePendingVendor(id, reason);
      await AuditService.log({
        userId: req.user!.id,
        action: "DECLINE_REGISTRATION",
        entityType: "Vendor",
        entityId: id,
        oldValues: { registrationStatus: "PENDING_REVIEW" },
        newValues: { registrationStatus: "DECLINED", reason },
      }).catch(() => undefined);
      const email = vendor.email && String(vendor.email).trim();
      if (email) {
        try {
          await EmailNotificationService.sendVendorRegistrationDeclinedEmail({
            vendorEmail: email,
            vendorName: vendor.name,
            contactPerson: vendor.contactPerson,
            reason,
          });
        } catch (emailErr: any) {
          console.warn("[vendor] Registration declined but the email failed:", emailErr?.message || emailErr);
        }
      }
      res.status(200).json({ success: true, data: vendor });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /** Block a vendor (Blocked status): cannot be invited, awarded, issued a PO or paid. Same as POST /:id/status BLOCKED. */
  static async blacklistVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const reasonRaw = req.body?.blacklistReason ?? req.body?.reason;
      const vendor = await VendorLifecycleService.transition(id, "BLOCKED", req.user, {
        reason: reasonRaw != null && String(reasonRaw).trim() !== "" ? String(reasonRaw).trim() : "Blocked",
        audit: { ip: req.ip, ua: req.get("user-agent") },
      });
      res.status(200).json({
        success: true,
        message: "Vendor blocked. They cannot be invited to RFQs, awarded, issued purchase orders or paid.",
        data: vendor,
      });
    } catch (error: any) {
      res.status(policyStatus(error, 400)).json({ success: false, code: error?.code, message: error.message });
    }
  }

  /** Reinstate a blocked vendor (Blocked -> Approved), with a reason. */
  static async unblacklistVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const vendor = await VendorLifecycleService.transition(id, "APPROVED", req.user, {
        reason: String(req.body?.reason || "Reinstated"),
        audit: { ip: req.ip, ua: req.get("user-agent") },
      });
      res.status(200).json({ success: true, message: "Vendor reinstated.", data: vendor });
    } catch (error: any) {
      res.status(policyStatus(error, 400)).json({ success: false, code: error?.code, message: error.message });
    }
  }

  static async createVendorBank(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = await VendorBankService.create({
        vendorId: id,
        bankName: b.bankName,
        accountName: b.accountName,
        accountNumber: b.accountNumber,
        iban: b.iban,
        branchCode: b.branchCode,
        swiftCode: b.swiftCode,
        currencyCode: b.currencyCode,
        isPrimary: b.isPrimary,
        createdById: req.user.id,
      });
      res.status(201).json({ success: true, data: row });
    } catch (error: any) {
      const msg = error.message || "Failed to create vendor bank";
      res.status(400).json({ success: false, message: msg });
    }
  }

  static async updateVendorBank(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;
      const b = req.body;
      const row = await VendorBankService.update(bankId, {
        bankName: b.bankName,
        accountName: b.accountName,
        accountNumber: b.accountNumber,
        iban: b.iban,
        branchCode: b.branchCode,
        swiftCode: b.swiftCode,
        currencyCode: b.currencyCode,
        isPrimary: b.isPrimary,
        isActive: b.isActive,
        updatedById: req.user.id,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      res.status(200).json({ success: true, data: row });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async listVendorBanks(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const rows = await VendorBankService.listByVendor(id);
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async uploadVendorKyc(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ success: false, message: "File is required" });
      }
      const documentType = req.body.documentType || req.body.document_type;
      if (!documentType) {
        return res.status(400).json({ success: false, message: "documentType is required" });
      }
      const row = await VendorKycService.uploadEncrypted({
        vendorId: id,
        documentType,
        file,
        uploadedById: req.user.id,
        meta: {
          expiryDate: req.body.expiryDate ?? req.body.expiry_date,
          issueDate: req.body.issueDate ?? req.body.issue_date,
          documentNumber: req.body.documentNumber ?? req.body.document_number,
          notifyDaysBefore: req.body.notifyDaysBefore ?? req.body.notify_days_before,
        },
      });
      await AuditService.log({
        userId: req.user.id,
        action: "VENDOR_DOCUMENT_UPLOAD",
        entityType: "Vendor",
        entityId: id,
        newValues: { documentId: row.id, documentType: row.documentType, expiryDate: row.expiryDate },
      }).catch(() => undefined);
      res.status(201).json({
        success: true,
        data: VendorKycService.formatKycDocumentResponse(row as Record<string, unknown>),
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /** PUT /vendors/kyc-documents/:documentId: set/renew a document's expiry, issue date, number and notice period. */
  static async updateVendorKyc(req: AuthRequest, res: Response) {
    try {
      const row = await VendorKycService.updateMeta(req.params.documentId, req.body || {});
      await AuditService.log({
        userId: req.user.id,
        action: "VENDOR_DOCUMENT_UPDATE",
        entityType: "Vendor",
        entityId: row.vendorId,
        newValues: { documentId: row.id, expiryDate: row.expiryDate, notifyDaysBefore: row.notifyDaysBefore },
      }).catch(() => undefined);
      res.status(200).json({ success: true, data: VendorKycService.formatKycDocumentResponse(row as Record<string, unknown>) });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /** GET/PUT /vendors/document-settings: default pre-expiry lead time (days) for vendor documents. */
  static async getDocumentSettings(_req: AuthRequest, res: Response) {
    res.status(200).json({ success: true, data: { expiryNoticeDays: await VendorGateService.noticeDays() } });
  }

  static async updateDocumentSettings(req: AuthRequest, res: Response) {
    try {
      const n = Number(req.body?.expiryNoticeDays);
      if (!Number.isInteger(n) || n < 0 || n > 730) {
        return res.status(400).json({ success: false, message: "expiryNoticeDays must be a whole number of days from 0 to 730" });
      }
      const existing = await prisma.vendorDocumentUploadSettings.findFirst();
      if (existing) await prisma.vendorDocumentUploadSettings.update({ where: { id: existing.id }, data: { expiryNoticeDays: n } });
      else await prisma.vendorDocumentUploadSettings.create({ data: { id: "default", allowedFileTypes: [], expiryNoticeDays: n } });
      await AuditService.log({ userId: req.user.id, action: "VENDOR_DOCUMENT_SETTINGS_UPDATE", entityType: "VendorDocumentUploadSettings", entityId: "default", newValues: { expiryNoticeDays: n } }).catch(() => undefined);
      res.status(200).json({ success: true, data: { expiryNoticeDays: n } });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /** POST /vendors/compliance-cycle: run the expiry sync and pre-expiry notifications now. */
  static async runComplianceCycle(_req: AuthRequest, res: Response) {
    try {
      const summary = await VendorComplianceJobService.runCycle();
      res.status(200).json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async listVendorKyc(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const rows = await VendorKycService.listForVendor(id);
      res.status(200).json({
        success: true,
        data: rows.map((r) => VendorKycService.formatKycDocumentResponse(r as Record<string, unknown>)),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async downloadVendorKyc(req: AuthRequest, res: Response) {
    try {
      const documentId = req.params.documentId;
      const doc = await prisma.vendorKycDocument.findUnique({ where: { id: documentId } });
      if (!doc) {
        return res.status(404).json({ success: false, message: "Not found" });
      }
      const { buffer, fileName, mimeType } = await VendorKycService.getDecryptedBuffer(documentId);
      res.setHeader("Content-Type", mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
