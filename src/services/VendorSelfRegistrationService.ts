// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import { normalizeVendorCategory } from "../utils/vendorCategoryNormalize";
import { assertVendorBankPaymentReadiness } from "../utils/vendorPaymentReadiness";
import { buildTaxComplianceData } from "./VendorTaxComplianceService";
import { VendorRegistrationDedupeService } from "./VendorRegistrationDedupeService";
import AuditService from "./AuditService";
import { VENDOR_PORTAL_ACTOR_ID } from "../constants/vendorPortalActor";

export type PublicVendorRegistrationBankInput = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban?: string | null;
  branchCode: string;
  swiftCode: string;
  currencyCode: string;
  isPrimary?: boolean;
};

export class VendorSelfRegistrationService {
  /**
   * Full vendor self-registration (public): profile + at least one bank in one request.
   * Returns a secret token for follow-up KYC document uploads only.
   */
  static async registerFromPublicPortal(body: {
    name: string;
    email: string;
    contactPerson?: string;
    phone?: string;
    address?: string;
    paymentTerms?: string;
    taxNumber?: string;
    vatNumber?: string;
    bpNumber?: string;
    category?: string;
    /** Prefer this when you have the UUID from `currencies.id`. */
    settlementCurrencyId?: string;
    /** Alternative: ISO-style code (e.g. USD, ZWG) — resolved to an active `Currency` row. */
    settlementCurrencyCode?: string;
    itf263CertificateText?: string;
    taxClearanceExpiryDate?: string | Date;
    banks: PublicVendorRegistrationBankInput[];
  }) {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    if (!name) throw new Error("name is required");
    if (!email) throw new Error("email is required");
    const banks = body.banks;
    if (!Array.isArray(banks) || banks.length === 0) {
      throw new Error("banks is required and must contain at least one bank account");
    }

    let taxNumber = body.taxNumber;
    if (
      taxNumber === undefined ||
      taxNumber === null ||
      String(taxNumber).trim() === ""
    ) {
      if (body.vatNumber != null && String(body.vatNumber).trim() !== "") {
        taxNumber = body.vatNumber;
      } else {
        taxNumber = undefined;
      }
    }

    const nameExists = await prisma.vendor.findFirst({
      where: { name: { equals: name }, isActive: true },
    });
    if (nameExists) {
      throw new Error("A vendor with this name already exists");
    }

    const bpNumber =
      body.bpNumber != null && String(body.bpNumber).trim() !== ""
        ? String(body.bpNumber).trim()
        : undefined;

    const dedupe = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
      taxNumber,
      bpNumber,
    });
    if (!dedupe.ok) {
      throw new Error(dedupe.message);
    }

    const compliance = buildTaxComplianceData({
      itf263CertificateText: body.itf263CertificateText,
      taxClearanceExpiryDate: body.taxClearanceExpiryDate,
    });
    if ("error" in compliance) {
      throw new Error(compliance.error);
    }

    let settlementCurrencyId = body.settlementCurrencyId;
    if (settlementCurrencyId) {
      const cur = await prisma.currency.findUnique({
        where: { id: settlementCurrencyId },
      });
      if (!cur) throw new Error("settlementCurrencyId: currency not found");
    } else if (
      body.settlementCurrencyCode != null &&
      String(body.settlementCurrencyCode).trim() !== ""
    ) {
      const code = String(body.settlementCurrencyCode).trim().toUpperCase();
      const cur = await prisma.currency.findFirst({
        where: { code, isActive: true },
      });
      if (!cur) {
        throw new Error(
          `settlementCurrencyCode: no active currency with code ${code}`
        );
      }
      settlementCurrencyId = cur.id;
    }

    const normalizedCat =
      body.category != null && String(body.category).trim() !== ""
        ? normalizeVendorCategory(body.category)
        : undefined;

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

    const token = crypto.randomBytes(32).toString("hex");

    const primaryMarked = banks.filter((b) => b.isPrimary).length;
    if (primaryMarked > 1) {
      throw new Error("Only one bank may be marked isPrimary: true");
    }
    let primaryIdx = banks.findIndex((b) => b.isPrimary);
    if (primaryIdx < 0) primaryIdx = 0;

    const result = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          name,
          email,
          contactPerson: body.contactPerson,
          phone: body.phone,
          address: body.address,
          paymentTerms: body.paymentTerms,
          taxNumber,
          bpNumber,
          ...(normalizedCat ? { category: normalizedCat } : {}),
          ...(settlementCurrencyId ? { settlementCurrencyId } : {}),
          registrationStatus: "PENDING_REVIEW",
          selfRegistered: true,
          selfRegistrationToken: token,
          isActive: true,
          ...taxData,
        },
      });

      const bankRows: any[] = [];
      for (let i = 0; i < banks.length; i++) {
        const b = banks[i];
        assertVendorBankPaymentReadiness({
          branchCode: b.branchCode,
          swiftCode: b.swiftCode,
          currencyCode: b.currencyCode,
        });
        const isPrimary = i === primaryIdx;
        if (isPrimary) {
          await tx.vendorBank.updateMany({
            where: { vendorId: vendor.id },
            data: { isPrimary: false },
          });
        }
        const row = await tx.vendorBank.create({
          data: {
            vendorId: vendor.id,
            bankName: String(b.bankName).trim(),
            accountName: String(b.accountName).trim(),
            accountNumber: String(b.accountNumber).trim(),
            iban: b.iban != null ? String(b.iban).trim() : null,
            branchCode: String(b.branchCode).trim(),
            swiftCode: String(b.swiftCode).trim(),
            currencyCode: String(b.currencyCode).trim().toUpperCase(),
            isPrimary,
            createdById: VENDOR_PORTAL_ACTOR_ID,
          },
        });
        bankRows.push(row);
      }

      return { vendor, bankRows };
    });

    await AuditService.log({
      userId: null,
      action: "CREATE",
      entityType: "Vendor",
      entityId: result.vendor.id,
      newValues: {
        ...result.vendor,
        note: "Vendor portal self-registration",
        bankCount: result.bankRows.length,
      },
    });

    for (const row of result.bankRows) {
      await AuditService.log({
        userId: null,
        action: "CREATE",
        entityType: "VendorBank",
        entityId: row.id,
        newValues: {
          ...row,
          note: "Vendor bank from portal self-registration",
        },
      });
    }

    return { vendor: result.vendor, token, banks: result.bankRows };
  }

  static async getByToken(token: string) {
    return prisma.vendor.findFirst({
      where: { selfRegistrationToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        registrationStatus: true,
        selfRegistered: true,
      },
    });
  }

  /**
   * Validates a self-registration link for portal KYC upload/list/download (no staff JWT).
   * Allowed while registration is still pending review and the token is valid.
   */
  static async assertTokenOpenForPortalKyc(token: string): Promise<{ id: string }> {
    const t = String(token || "").trim();
    if (t.length < 16) {
      throw new Error("Invalid or expired registration link");
    }
    const row = await prisma.vendor.findFirst({
      where: { selfRegistrationToken: t },
      select: { id: true, selfRegistered: true, registrationStatus: true },
    });
    if (!row) {
      throw new Error("Invalid or expired registration link");
    }
    if (!row.selfRegistered) {
      throw new Error("This registration link is not valid for the vendor portal");
    }
    if (row.registrationStatus !== "PENDING_REVIEW") {
      throw new Error(
        "Portal document upload is closed for this vendor. If you were approved, use your buyer contact."
      );
    }
    return { id: row.id };
  }

  static async submitProfile(
    token: string,
    body: {
      name?: string;
      contactPerson?: string;
      phone?: string;
      address?: string;
      taxNumber?: string;
      bpNumber?: string;
      category?: string;
    }
  ) {
    const v = await prisma.vendor.findFirst({ where: { selfRegistrationToken: token } });
    if (!v) throw new Error("Invalid or expired registration link");
    if (v.registrationStatus !== "PENDING_REVIEW") {
      throw new Error("This registration has already been processed");
    }

    const data: any = {};
    if (body.name) data.name = body.name.trim();
    if (body.contactPerson !== undefined) data.contactPerson = body.contactPerson;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.address !== undefined) data.address = body.address;
    if (body.taxNumber !== undefined) data.taxNumber = body.taxNumber;
    if (body.bpNumber !== undefined) data.bpNumber = body.bpNumber;
    if (body.category != null && String(body.category).trim() !== "") {
      data.category = normalizeVendorCategory(body.category);
    }

    return prisma.vendor.update({
      where: { id: v.id },
      data,
    });
  }

  static async approvePendingVendor(vendorId: string) {
    const v = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!v) throw new Error("Vendor not found");
    if (v.registrationStatus !== "PENDING_REVIEW") {
      throw new Error("Vendor is not in PENDING_REVIEW status");
    }
    return prisma.vendor.update({
      where: { id: vendorId },
      data: {
        registrationStatus: "ACTIVE",
        selfRegistrationToken: null,
      },
    });
  }
}
