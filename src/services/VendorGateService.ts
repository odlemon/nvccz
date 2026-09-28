// @ts-nocheck
/**
 * The single place that decides whether a vendor may be used for a procurement action.
 *
 * Status, approval status, blacklist/active flags, tax clearance expiry and document expiry are all evaluated
 * LIVE from dates (never trusting a stored "ACTIVE" that a scheduled job has not caught up with), and the stored
 * compliance state is brought in step as a side effect (APPROVED <-> EXPIRED is automatic; anything a person set is left alone).
 */
import { prisma } from "../utils/database";
import {
  ACTION_LABELS,
  INVOICE_CAPTURE_STATUSES,
  VENDOR_STATUS_LABELS,
  VendorPolicyError,
  documentExpiryState,
  normalizeVendorStatus,
  type VendorAction,
} from "../config/vendorStatus";

const GATE_SELECT = {
  id: true,
  name: true,
  vendorCode: true,
  isActive: true,
  isBlacklisted: true,
  lifecycleStatus: true,
  registrationStatus: true,
  approvalStatus: true,
  complianceStatus: true,
  taxComplianceStatus: true,
  taxClearanceExpiryDate: true,
  statusReason: true,
} as const;

export type Compliance = {
  status: "COMPLIANT" | "EXPIRING_SOON" | "NON_COMPLIANT" | "PENDING";
  issues: string[];
  warnings: string[];
};

function fmt(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

export class VendorGateService {
  static async noticeDays(db: any = prisma): Promise<number> {
    const s = await db.vendorDocumentUploadSettings.findFirst().catch(() => null);
    return Number(s?.expiryNoticeDays ?? 30);
  }

  /** Compliance from the dates as they stand now. */
  static async computeCompliance(vendor: any, db: any = prisma, now = new Date()): Promise<Compliance> {
    const notice = await this.noticeDays(db);
    const docs = await db.vendorKycDocument.findMany({
      where: { vendorId: vendor.id, expiryDate: { not: null } },
      select: { documentType: true, expiryDate: true, notifyDaysBefore: true },
    });
    return this.complianceOf(vendor, docs, notice, now);
  }

  /** The same rule, from already-loaded rows (used to summarise many vendors without a query each). */
  static complianceOf(vendor: any, docs: any[], notice: number, now = new Date()): Compliance {
    const issues: string[] = [];
    const warnings: string[] = [];
    const taxState = String(vendor.taxComplianceStatus || "PENDING").toUpperCase();

    if (vendor.taxClearanceExpiryDate) {
      const st = documentExpiryState(vendor.taxClearanceExpiryDate, notice, now);
      if (st === "EXPIRED") issues.push(`Tax clearance expired on ${fmt(vendor.taxClearanceExpiryDate)}`);
      else if (st === "EXPIRING") warnings.push(`Tax clearance expires on ${fmt(vendor.taxClearanceExpiryDate)}`);
    } else if (taxState === "EXPIRED" || taxState === "INVALID") {
      issues.push(`Tax clearance is ${taxState.toLowerCase()}`);
    }

    docs = (docs || []).filter((d: any) => d.expiryDate);
    for (const d of docs) {
      const st = documentExpiryState(d.expiryDate, d.notifyDaysBefore ?? notice, now);
      const label = String(d.documentType).replace(/_/g, " ").toLowerCase();
      if (st === "EXPIRED") issues.push(`${label} expired on ${fmt(d.expiryDate)}`);
      else if (st === "EXPIRING") warnings.push(`${label} expires on ${fmt(d.expiryDate)}`);
    }

    let status: Compliance["status"];
    if (issues.length) status = "NON_COMPLIANT";
    else if (warnings.length) status = "EXPIRING_SOON";
    else if (taxState === "ACTIVE" || docs.length) status = "COMPLIANT";
    else status = "PENDING";
    return { status, issues, warnings };
  }

  /**
   * Persist compliance, and move an APPROVED vendor to EXPIRED when clearance/documents lapse (and back when renewed).
   * Only the system's own EXPIRED (reason starting "AUTO:") is ever reversed automatically.
   */
  static async refresh(vendorId: string, db: any = prisma) {
    const vendor = await db.vendor.findUnique({ where: { id: vendorId }, select: GATE_SELECT });
    if (!vendor) return null;
    const c = await this.computeCompliance(vendor, db);
    const data: any = {};
    if (vendor.complianceStatus !== c.status) data.complianceStatus = c.status;
    if (vendor.taxClearanceExpiryDate && new Date(vendor.taxClearanceExpiryDate) < new Date() && vendor.taxComplianceStatus !== "EXPIRED") {
      data.taxComplianceStatus = "EXPIRED";
    }
    const status = normalizeVendorStatus(vendor.lifecycleStatus);
    if (c.status === "NON_COMPLIANT" && status === "APPROVED") {
      data.lifecycleStatus = "EXPIRED";
      data.statusReason = `AUTO: ${c.issues.join("; ")}`;
      data.statusChangedAt = new Date();
    } else if (c.status !== "NON_COMPLIANT" && status === "EXPIRED" && String(vendor.statusReason || "").startsWith("AUTO:")) {
      data.lifecycleStatus = "APPROVED";
      data.statusReason = null;
      data.statusChangedAt = new Date();
    }
    if (Object.keys(data).length) {
      await db.vendor.update({ where: { id: vendorId }, data });
      if (data.lifecycleStatus) {
        await db.auditLog
          .create({
            data: {
              userId: null,
              action: data.lifecycleStatus === "EXPIRED" ? "VENDOR_AUTO_EXPIRED" : "VENDOR_AUTO_REINSTATED",
              entityType: "Vendor",
              entityId: vendorId,
              oldValues: { lifecycleStatus: vendor.lifecycleStatus },
              newValues: { lifecycleStatus: data.lifecycleStatus, reason: data.statusReason ?? "compliance restored" },
            },
          })
          .catch(() => undefined);
      }
    }
    return { ...vendor, ...data, compliance: c };
  }

  /**
   * One vendor's verdict from rows already in memory: is it usable for the procurement actions (invite, quote, award, PO, pay)
   * and, if not, why. Never writes; the authoritative check is assertTransactable at the moment of the action.
   */
  static summarize(vendor: any, docs: any[], notice: number) {
    const c = this.complianceOf(vendor, docs, notice);
    const status = normalizeVendorStatus(vendor.lifecycleStatus);
    const label = VENDOR_STATUS_LABELS[status as any] || String(vendor.lifecycleStatus);
    const reasons: string[] = [];
    if (vendor.isBlacklisted) reasons.push("the vendor is blocked (blacklisted)");
    if (status !== "APPROVED") reasons.push(`the vendor status is ${label}`);
    if (vendor.approvalStatus !== "APPROVED") reasons.push(`the vendor is not fully approved (approval status ${String(vendor.approvalStatus).replace(/_/g, " ").toLowerCase()})`);
    if (!vendor.isActive) reasons.push("the vendor is inactive");
    if (c.status === "NON_COMPLIANT") reasons.push(`the vendor is non-compliant: ${c.issues.join("; ")}`);
    return { compliance: c, transactable: reasons.length === 0, blockedReasons: reasons };
  }

  /** Why (if at all) the vendor may not do `action`. Empty list = allowed. */
  static async evaluate(vendorOrId: any, action: VendorAction, db: any = prisma) {
    const id = typeof vendorOrId === "string" ? vendorOrId : vendorOrId?.id;
    const v = await this.refresh(id, db);
    if (!v) return { ok: false, reasons: ["Vendor not found"], vendor: null, warnings: [] as string[] };
    const reasons: string[] = [];
    const status = normalizeVendorStatus(v.lifecycleStatus);
    const label = VENDOR_STATUS_LABELS[status as any] || String(v.lifecycleStatus);

    if (v.isBlacklisted) reasons.push("the vendor is blocked (blacklisted)");
    if (action === "INVOICE") {
      if (!status || !INVOICE_CAPTURE_STATUSES.includes(status)) reasons.push(`the vendor status is ${label}`);
    } else if (status !== "APPROVED") {
      reasons.push(`the vendor status is ${label}`);
    }
    if (action !== "INVOICE") {
      if (v.approvalStatus !== "APPROVED") reasons.push(`the vendor is not fully approved (approval status ${String(v.approvalStatus).replace(/_/g, " ").toLowerCase()})`);
      if (!v.isActive) reasons.push("the vendor is inactive");
      if (v.compliance.status === "NON_COMPLIANT") reasons.push(`the vendor is non-compliant: ${v.compliance.issues.join("; ")}`);
    }
    return { ok: reasons.length === 0, reasons, vendor: v, warnings: v.compliance.warnings };
  }

  static async assertTransactable(vendorOrId: any, action: VendorAction, db: any = prisma) {
    const r = await this.evaluate(vendorOrId, action, db);
    if (!r.ok) {
      const who = r.vendor ? `${r.vendor.vendorCode ? r.vendor.vendorCode + " " : ""}${r.vendor.name}` : "Vendor";
      throw new VendorPolicyError(
        "VENDOR_NOT_TRANSACTABLE",
        `${who} cannot ${ACTION_LABELS[action]}: ${r.reasons.join("; ")}.`,
        409
      );
    }
    return r;
  }

  /** Prisma `where` for "eligible to be invited / auto-selected". Expiry is checked on the date itself, not the stored flag. */
  static eligibleWhere(): any {
    return {
      isActive: true,
      isBlacklisted: false,
      lifecycleStatus: "APPROVED",
      approvalStatus: "APPROVED",
      complianceStatus: { not: "NON_COMPLIANT" },
      OR: [{ taxClearanceExpiryDate: null }, { taxClearanceExpiryDate: { gte: new Date() } }],
      kycDocuments: { none: { expiryDate: { lt: new Date() } } },
    };
  }
}
