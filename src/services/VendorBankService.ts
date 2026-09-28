// @ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import AuditService from "./AuditService";
import { assertVendorBankPaymentReadiness } from "../utils/vendorPaymentReadiness";
import { EmailNotificationService } from "./EmailNotificationService";
function accountOrIbanChanged(
  before: { accountNumber: string; iban: string | null },
  after: { accountNumber: string; iban: string | null }
) {
  return (
    String(before.accountNumber) !== String(after.accountNumber) ||
    String(before.iban ?? "") !== String(after.iban ?? "")
  );
}

export class VendorBankService {
  /** Last four digits only, for narratives and logs. */
  static maskAccount(n: string | null | undefined) {
    const s = String(n || "");
    return s.length <= 4 ? "****" : `****${s.slice(-4)}`;
  }

  /**
   * The account a bank payment goes to: the vendor's active primary bank, in the payment currency when one is held.
   * A vendor with no usable bank account cannot be paid by bank (409), rather than paid to nowhere.
   */
  static async requirePayee(vendorId: string, currencyCode?: string | null) {
    const banks = await prisma.vendorBank.findMany({ where: { vendorId, isActive: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
    const inCurrency = currencyCode ? banks.find((b) => String(b.currencyCode).toUpperCase() === String(currencyCode).toUpperCase()) : null;
    const chosen = inCurrency || banks.find((b) => b.isPrimary) || banks[0];
    if (!chosen) {
      const { VendorPolicyError } = await import("../config/vendorStatus");
      throw new VendorPolicyError("VENDOR_BANK_MISSING", "This vendor has no active bank account on record, so it cannot be paid by bank. Add the vendor's banking details first.", 409);
    }
    return chosen;
  }

  static async listByVendor(vendorId: string) {
    return prisma.vendorBank.findMany({
      where: { vendorId, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  static async create(params: {
    vendorId: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    iban?: string | null;
    branchCode: string;
    swiftCode: string;
    currencyCode: string;
    isPrimary?: boolean;
    createdById: string;
    /** When true, audit log has no userId (avoids FK to users — public portal registration). */
    portalSelfRegistration?: boolean;
  }) {
    assertVendorBankPaymentReadiness({
      branchCode: params.branchCode,
      swiftCode: params.swiftCode,
      currencyCode: params.currencyCode,
    });

    const vendor = await prisma.vendor.findUnique({ where: { id: params.vendorId } });
    if (!vendor) throw new Error("Vendor not found");

    if (params.isPrimary) {
      await prisma.vendorBank.updateMany({
        where: { vendorId: params.vendorId },
        data: { isPrimary: false },
      });
    }

    const row = await prisma.vendorBank.create({
      data: {
        vendorId: params.vendorId,
        bankName: params.bankName.trim(),
        accountName: params.accountName.trim(),
        accountNumber: String(params.accountNumber).trim(),
        iban: params.iban != null ? String(params.iban).trim() : null,
        branchCode: String(params.branchCode).trim(),
        swiftCode: String(params.swiftCode).trim(),
        currencyCode: String(params.currencyCode).trim().toUpperCase(),
        isPrimary: !!params.isPrimary,
        createdById: params.createdById,
      },
    });

    await AuditService.log({
      userId: params.portalSelfRegistration ? null : params.createdById,
      action: "CREATE",
      entityType: "VendorBank",
      entityId: row.id,
      newValues: {
        ...row,
        note: params.portalSelfRegistration
          ? "Vendor bank account created (vendor portal self-registration)"
          : "Vendor bank account created",
      },
    });

    return row;
  }

  static async update(
    bankId: string,
    params: {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      iban?: string | null;
      branchCode?: string;
      swiftCode?: string;
      currencyCode?: string;
      isPrimary?: boolean;
      isActive?: boolean;
      updatedById: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ) {
    const existing = await prisma.vendorBank.findUnique({ where: { id: bankId } });
    if (!existing) throw new Error("Vendor bank not found");

    const merged = {
      branchCode: params.branchCode !== undefined ? params.branchCode : existing.branchCode,
      swiftCode: params.swiftCode !== undefined ? params.swiftCode : existing.swiftCode,
      currencyCode: params.currencyCode !== undefined ? params.currencyCode : existing.currencyCode,
    };
    assertVendorBankPaymentReadiness(merged);

    const nextAccount =
      params.accountNumber !== undefined ? String(params.accountNumber).trim() : existing.accountNumber;
    const nextIban =
      params.iban !== undefined
        ? params.iban == null
          ? null
          : String(params.iban).trim()
        : existing.iban;

    const critical = accountOrIbanChanged(
      { accountNumber: existing.accountNumber, iban: existing.iban },
      { accountNumber: nextAccount, iban: nextIban }
    );
    const criticalBankingFieldsChanged: string[] = [];
    if (String(existing.accountNumber) !== String(nextAccount)) {
      criticalBankingFieldsChanged.push("accountNumber");
    }
    if (String(existing.iban ?? "") !== String(nextIban ?? "")) {
      criticalBankingFieldsChanged.push("iban");
    }

    if (params.isPrimary) {
      await prisma.vendorBank.updateMany({
        where: { vendorId: existing.vendorId },
        data: { isPrimary: false },
      });
    }

    const row = await prisma.vendorBank.update({
      where: { id: bankId },
      data: {
        ...(params.bankName !== undefined ? { bankName: params.bankName.trim() } : {}),
        ...(params.accountName !== undefined ? { accountName: params.accountName.trim() } : {}),
        ...(params.accountNumber !== undefined ? { accountNumber: nextAccount } : {}),
        ...(params.iban !== undefined ? { iban: nextIban } : {}),
        ...(params.branchCode !== undefined ? { branchCode: String(params.branchCode).trim() } : {}),
        ...(params.swiftCode !== undefined ? { swiftCode: String(params.swiftCode).trim() } : {}),
        ...(params.currencyCode !== undefined
          ? { currencyCode: String(params.currencyCode).trim().toUpperCase() }
          : {}),
        ...(params.isPrimary !== undefined ? { isPrimary: params.isPrimary } : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
    });

    await AuditService.log({
      userId: params.updatedById,
      action: "UPDATE",
      entityType: "VendorBank",
      entityId: row.id,
      oldValues: existing,
      newValues: {
        ...row,
        auditPriority: critical ? "HIGH" : "NORMAL",
        auditReason: critical
          ? "Vendor bank account number and/or IBAN changed — CFO notified"
          : undefined,
        criticalBankingFieldsChanged: critical ? criticalBankingFieldsChanged : undefined,
        vendorId: row.vendorId,
      },
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
    });

    if (critical) {
      logger.warn("[HIGH] Vendor bank account number or IBAN modified", {
        vendorId: row.vendorId,
        vendorBankId: row.id,
        actorUserId: params.updatedById,
        fields: criticalBankingFieldsChanged,
      });
      const vendor = await prisma.vendor.findUnique({ where: { id: row.vendorId } });
      await EmailNotificationService.sendVendorBankCriticalChangeAlert({
        vendorName: vendor?.name ?? row.vendorId,
        vendorId: row.vendorId,
        bankId: row.id,
        actorUserId: params.updatedById,
        changedFields: criticalBankingFieldsChanged,
      });
    }

    return row;
  }
}
