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
import { EmailNotificationService } from "../services/EmailNotificationService";

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
      } = req.body;

      let taxNumber = taxNumberRaw;
      if (
        taxNumber === undefined ||
        taxNumber === null ||
        String(taxNumber).trim() === ""
      ) {
        if (vatNumber !== undefined && vatNumber !== null && String(vatNumber).trim() !== "") {
          taxNumber = vatNumber;
        } else {
          taxNumber = undefined;
        }
      }

      // Validation
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Vendor name is required"
        });
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
          ...(settlementCurrencyId !== undefined ? { settlementCurrencyId } : {}),
          ...(isBlacklisted !== undefined ? { isBlacklisted: !!isBlacklisted } : {}),
          ...(blacklistReason !== undefined ? { blacklistReason } : {}),
          ...(registrationStatus !== undefined
            ? { registrationStatus: String(registrationStatus).toUpperCase() }
            : {}),
          ...taxData,
        }
      });

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
      res.status(500).json({
        success: false,
        message: "Failed to create vendor",
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

      const where: any = {};

      if (isActive !== undefined) {
        where.isActive = isActive === "true";
      } else {
        where.isActive = true;
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

      let data: any[] = vendors as any[];
      if (includeParam.includes("kyc")) {
        data = data.map((v) => ({
          ...v,
          kycDocuments: attachStaffKycDownloadUrls(v.kycDocuments),
        }));
      }

      res.status(200).json({
        success: true,
        data,
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

      const data = {
        ...vendor,
        kycDocuments: attachStaffKycDownloadUrls(vendor.kycDocuments),
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
      } = req.body;

      const taxNumber =
        taxNumberRaw !== undefined
          ? taxNumberRaw
          : vatNumber !== undefined
            ? vatNumber
            : undefined;

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
      if (isActive !== undefined) updateData.isActive = isActive;

      if (category !== undefined) {
        updateData.category =
          category == null || String(category).trim() === ""
            ? null
            : normalizeVendorCategory(category);
      }
      if (settlementCurrencyId !== undefined) {
        updateData.settlementCurrencyId = settlementCurrencyId || null;
      }
      if (isBlacklisted !== undefined) updateData.isBlacklisted = !!isBlacklisted;
      if (blacklistReason !== undefined) updateData.blacklistReason = blacklistReason;
      if (registrationStatus !== undefined) {
        updateData.registrationStatus = String(registrationStatus).toUpperCase();
      }

      if (itfCompliance && !("skip" in itfCompliance)) {
        updateData.taxComplianceStatus = itfCompliance.taxComplianceStatus;
        updateData.taxClearanceExpiryDate = itfCompliance.taxClearanceExpiryDate;
        updateData.taxRevalidationAlertDueAt = itfCompliance.taxRevalidationAlertDueAt;
        updateData.taxRevalidationAlertNotifiedAt = null;
        updateData.isActive = itfCompliance.isActive;
      }

      const vendor = await prisma.vendor.update({
        where: { id },
        data: updateData
      });

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
      res.status(500).json({
        success: false,
        message: "Failed to update vendor",
        error: error.message
      });
    }
  }

  /**
   * Delete vendor (soft delete)
   */
  static async deleteVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

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

      // Check if vendor has expenses
      const expenseCount = await prisma.expense.count({
        where: { vendorId: id }
      });

      if (expenseCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete vendor that has associated expenses"
        });
      }

      // Soft delete by setting isActive to false
      await prisma.vendor.update({
        where: { id },
        data: { isActive: false }
      });

      res.status(200).json({
        success: true,
        message: "Vendor deleted successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete vendor",
        error: error.message
      });
    }
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
        where: { registrationStatus: "PENDING_REVIEW" },
        orderBy: { createdAt: "desc" },
      });
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveVendorRegistration(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const vendor = await VendorSelfRegistrationService.approvePendingVendor(id);
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
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /** Blacklist: excluded from GET /vendors/for-rfq and blocked from POST /procurement/rfq (and new POs). */
  static async blacklistVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const reasonRaw = req.body?.blacklistReason ?? req.body?.reason;
      const blacklistReason =
        reasonRaw != null && String(reasonRaw).trim() !== ""
          ? String(reasonRaw).trim()
          : "Blacklisted";

      const before = await prisma.vendor.findUnique({ where: { id } });
      if (!before) {
        return res.status(404).json({ success: false, message: "Vendor not found" });
      }

      const vendor = await prisma.vendor.update({
        where: { id },
        data: { isBlacklisted: true, blacklistReason },
      });

      await AuditService.log({
        userId: req.user.id,
        action: "BLACKLIST",
        entityType: "Vendor",
        entityId: id,
        oldValues: {
          isBlacklisted: before.isBlacklisted,
          blacklistReason: before.blacklistReason,
        },
        newValues: {
          isBlacklisted: true,
          blacklistReason: vendor.blacklistReason,
        },
        ipAddress: req.ip || undefined,
        userAgent: req.get("user-agent") || undefined,
      });

      res.status(200).json({
        success: true,
        message: "Vendor blacklisted. They will not appear in RFQ vendor picker and cannot be sent new RFQs.",
        data: vendor,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async unblacklistVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const before = await prisma.vendor.findUnique({ where: { id } });
      if (!before) {
        return res.status(404).json({ success: false, message: "Vendor not found" });
      }

      const vendor = await prisma.vendor.update({
        where: { id },
        data: { isBlacklisted: false, blacklistReason: null },
      });

      await AuditService.log({
        userId: req.user.id,
        action: "UNBLACKLIST",
        entityType: "Vendor",
        entityId: id,
        oldValues: {
          isBlacklisted: before.isBlacklisted,
          blacklistReason: before.blacklistReason,
        },
        newValues: {
          isBlacklisted: false,
          blacklistReason: null,
        },
        ipAddress: req.ip || undefined,
        userAgent: req.get("user-agent") || undefined,
      });

      res.status(200).json({
        success: true,
        message: "Vendor removed from blacklist.",
        data: vendor,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
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
      });
      res.status(201).json({
        success: true,
        data: VendorKycService.formatKycDocumentResponse(row as Record<string, unknown>),
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
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
