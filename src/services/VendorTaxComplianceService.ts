// @ts-nocheck
import { prisma } from "../utils/database";
import {
  computeRevalidationAlertDueAt,
  isTaxClearanceValidOnDate,
  parseItf263ExpiryDate,
  shouldFireRevalidationAlert,
  utcDateOnly,
} from "../utils/itf263TaxClearance";

const NOTIFY_ROLE_CODES = [
  "PROC_MGR",
  "PROC_OFF",
  "FIN_MGR",
  "ACCOUNTANT",
];

const NOTIFY_DEPARTMENTS = ["Procurement", "Finance"];

export type TaxClearanceInput = {
  taxClearanceExpiryDate?: string | Date | null;
  itf263CertificateText?: string | null;
};

export function resolveTaxClearanceExpiry(
  input: TaxClearanceInput
): { expiry: Date; source: "explicit" | "parsed" } | { error: string } {
  if (input.taxClearanceExpiryDate) {
    const d =
      input.taxClearanceExpiryDate instanceof Date
        ? input.taxClearanceExpiryDate
        : new Date(input.taxClearanceExpiryDate);
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid taxClearanceExpiryDate" };
    }
    return { expiry: utcDateOnly(d), source: "explicit" };
  }
  if (input.itf263CertificateText?.trim()) {
    const parsed = parseItf263ExpiryDate(input.itf263CertificateText);
    if (!parsed) {
      return {
        error:
          "Could not parse tax clearance expiry from itf263CertificateText. Provide taxClearanceExpiryDate (ISO) or certificate text containing a labelled expiry date.",
      };
    }
    return { expiry: utcDateOnly(parsed), source: "parsed" };
  }
  return { error: "MISSING" };
}

async function findUsersToNotifyTaxCompliance(): Promise<{ id: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { roleCode: { in: NOTIFY_ROLE_CODES } },
        { userDepartment: { in: NOTIFY_DEPARTMENTS } },
      ],
    },
    select: { id: true },
  });
  const seen = new Set<string>();
  return users.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

/**
 * Send in-app notifications for one vendor tax re-validation alert (idempotent via vendor row).
 */
export async function sendTaxRevalidationNotificationsForVendor(vendor: {
  id: string;
  name: string;
  taxClearanceExpiryDate: Date | null;
}): Promise<number> {
  if (!vendor.taxClearanceExpiryDate) return 0;
  const recipients = await findUsersToNotifyTaxCompliance();
  if (recipients.length === 0) return 0;

  const exp = utcDateOnly(vendor.taxClearanceExpiryDate);
  const expStr = exp.toISOString().slice(0, 10);

  await prisma.$transaction(
    recipients.map((u) =>
      prisma.notification.create({
        data: {
          userId: u.id,
          type: "VENDOR_TAX_CLEARANCE_REVALIDATION",
          title: "Vendor tax clearance re-validation due",
          message: `Tax clearance for vendor "${vendor.name}" expires on ${expStr}. Please schedule ZIMRA ITF263 re-validation.`,
          relatedEntity: "Vendor",
          relatedEntityId: vendor.id,
          data: {
            vendorId: vendor.id,
            vendorName: vendor.name,
            taxClearanceExpiryDate: exp.toISOString(),
            alertLeadDays: 30,
          },
        },
      })
    )
  );

  return recipients.length;
}

export async function processVendorTaxRevalidationAlerts(
  now: Date = new Date()
): Promise<{ processedVendors: number; notificationsCreated: number }> {
  const vendors = await prisma.vendor.findMany({
    where: {
      taxComplianceStatus: "ACTIVE",
      taxClearanceExpiryDate: { not: null },
      taxRevalidationAlertDueAt: { not: null },
      taxRevalidationAlertNotifiedAt: null,
    },
  });

  let processedVendors = 0;
  let notificationsCreated = 0;

  for (const v of vendors) {
    const expiry = v.taxClearanceExpiryDate!;
    const due = v.taxRevalidationAlertDueAt!;
    if (!shouldFireRevalidationAlert(expiry, due, now)) continue;

    const count = await sendTaxRevalidationNotificationsForVendor({
      id: v.id,
      name: v.name,
      taxClearanceExpiryDate: expiry,
    });

    if (count === 0) continue;

    await prisma.vendor.update({
      where: { id: v.id },
      data: { taxRevalidationAlertNotifiedAt: now },
    });

    processedVendors += 1;
    notificationsCreated += count;
  }

  return { processedVendors, notificationsCreated };
}

/**
 * Apply tax clearance rules when creating/updating a vendor. Returns prisma data fragment.
 */
export function buildTaxComplianceData(
  input: TaxClearanceInput,
  now: Date = new Date()
):
  | {
      taxComplianceStatus: string;
      taxClearanceExpiryDate: Date;
      taxRevalidationAlertDueAt: Date;
      taxRevalidationAlertNotifiedAt: null;
      isActive: boolean;
      meta: { source: "explicit" | "parsed" };
    }
  | { skip: true }
  | { error: string } {
  const resolved = resolveTaxClearanceExpiry(input);
  if ("error" in resolved) {
    if (resolved.error === "MISSING") return { skip: true };
    return { error: resolved.error };
  }

  const { expiry, source } = resolved;

  if (!isTaxClearanceValidOnDate(expiry, now)) {
    return {
      error:
        "Tax clearance expiry date is in the past. Provide a valid (non-expired) ZIMRA ITF263 clearance.",
    };
  }

  const taxRevalidationAlertDueAt = computeRevalidationAlertDueAt(expiry);

  return {
    taxComplianceStatus: "ACTIVE",
    taxClearanceExpiryDate: expiry,
    taxRevalidationAlertDueAt,
    taxRevalidationAlertNotifiedAt: null,
    isActive: true,
    meta: { source },
  };
}

/**
 * If the alert window is already reached at registration time, send notifications immediately once.
 */
export async function maybeSendImmediateTaxAlertForNewVendor(vendor: {
  id: string;
  name: string;
  taxClearanceExpiryDate: Date | null;
  taxRevalidationAlertDueAt: Date | null;
}): Promise<void> {
  if (
    !vendor.taxClearanceExpiryDate ||
    !vendor.taxRevalidationAlertDueAt
  ) {
    return;
  }
  const now = new Date();
  if (
    !shouldFireRevalidationAlert(
      vendor.taxClearanceExpiryDate,
      vendor.taxRevalidationAlertDueAt,
      now
    )
  ) {
    return;
  }

  const sent = await sendTaxRevalidationNotificationsForVendor({
    id: vendor.id,
    name: vendor.name,
    taxClearanceExpiryDate: vendor.taxClearanceExpiryDate,
  });

  if (sent === 0) return;

  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { taxRevalidationAlertNotifiedAt: now },
  });
}
