// @ts-nocheck
/**
 * Vendor Status transitions (SRD §8.2). Every change of status goes through here: the move must be one the
 * rules allow, the actor must hold the right procurement permission, a reason is recorded where required,
 * segregation of duties applies to approval, and the older flags are kept in step. Every move is audited.
 */
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as PROC_PERMS } from "../config/procurementPermissions";
import {
  TRANSITIONS,
  VENDOR_STATUS_LABELS,
  VendorPolicyError,
  normalizeVendorStatus,
  type VendorStatus,
} from "../config/vendorStatus";
import { VendorGateService } from "./VendorGateService";

/** Bring the older, separately-read flags in line with the new status. */
function legacyAxes(to: VendorStatus, reason?: string | null) {
  switch (to) {
    case "APPROVED":
      return { registrationStatus: "ACTIVE", approvalStatus: "APPROVED", isActive: true, isBlacklisted: false, blacklistReason: null };
    case "PENDING_REVIEW":
      return { registrationStatus: "PENDING_REVIEW", approvalStatus: "NOT_SUBMITTED" };
    case "PENDING_APPROVAL":
      return { registrationStatus: "PENDING_REVIEW", approvalStatus: "PENDING_APPROVAL" };
    case "DRAFT":
      return { registrationStatus: "PENDING_REVIEW", approvalStatus: "NOT_SUBMITTED", isActive: true };
    case "SUSPENDED":
      return { registrationStatus: "SUSPENDED", isBlacklisted: false };
    case "BLOCKED":
      return { isBlacklisted: true, blacklistReason: reason || "Blocked" };
    case "INACTIVE":
      return { isActive: false };
    case "EXPIRED":
      return {};
  }
}

export class VendorLifecycleService {
  /** Next Vendor Code, VND-00001 upwards. */
  static async nextVendorCode(db: any = prisma): Promise<string> {
    const rows = await db.$queryRawUnsafe(
      "SELECT MAX(CAST(SUBSTRING(`vendor_code`, 5) AS UNSIGNED)) AS n FROM `vendors` WHERE `vendor_code` REGEXP '^VND-[0-9]+$'"
    );
    return `VND-${String(Number(rows?.[0]?.n ?? 0) + 1).padStart(5, "0")}`;
  }

  static canDo(user: any, needs: "manage" | "approve") {
    if (!user) return false;
    const perm = needs === "approve" ? PROC_PERMS.vendorsApprove : PROC_PERMS.vendorsManage;
    return userHasEffectivePermission(user, perm) || isModulePrivilegedUser(user);
  }

  /** The moves this user could make from the vendor's current status (drives the UI's action buttons). */
  static availableMoves(vendor: any, user: any) {
    const from = normalizeVendorStatus(vendor?.lifecycleStatus);
    if (!from) return [];
    return TRANSITIONS[from]
      .filter((r) => this.canDo(user, r.needs))
      .map((r) => ({ to: r.to, label: VENDOR_STATUS_LABELS[r.to], reasonRequired: !!r.reason }));
  }

  static async transition(
    vendorId: string,
    toRaw: string,
    actor: any | null,
    opts: { reason?: string | null; audit?: { ip?: string | null; ua?: string | null }; skipSod?: boolean } = {}
  ) {
    const to = normalizeVendorStatus(toRaw);
    if (!to) throw new VendorPolicyError("VENDOR_STATUS_INVALID", `Unknown vendor status "${toRaw}"`, 400);
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new VendorPolicyError("VENDOR_NOT_FOUND", "Vendor not found", 404);
    const from = normalizeVendorStatus(vendor.lifecycleStatus) || "DRAFT";
    if (from === to) throw new VendorPolicyError("VENDOR_STATUS_UNCHANGED", `The vendor is already ${VENDOR_STATUS_LABELS[to]}.`, 409);

    const rule = TRANSITIONS[from].find((r) => r.to === to);
    if (!rule) {
      throw new VendorPolicyError(
        "VENDOR_TRANSITION_NOT_ALLOWED",
        `A vendor cannot move from ${VENDOR_STATUS_LABELS[from]} to ${VENDOR_STATUS_LABELS[to]}.`,
        409
      );
    }
    if (actor && !this.canDo(actor, rule.needs)) {
      throw new VendorPolicyError(
        "VENDOR_TRANSITION_FORBIDDEN",
        `You need the ${rule.needs === "approve" ? "vendor approval" : "vendor management"} permission to move a vendor to ${VENDOR_STATUS_LABELS[to]}.`,
        403
      );
    }
    const reason = opts.reason ? String(opts.reason).trim() : "";
    if (rule.reason && !reason) {
      throw new VendorPolicyError("VENDOR_REASON_REQUIRED", `A reason is required to move a vendor to ${VENDOR_STATUS_LABELS[to]}.`, 400);
    }

    // Segregation of duties: whoever put the vendor forward for approval cannot approve it.
    if (to === "APPROVED" && from === "PENDING_APPROVAL" && actor && !opts.skipSod && vendor.statusChangedById && vendor.statusChangedById === actor.id) {
      throw new VendorPolicyError(
        "SOD_VENDOR_APPROVAL",
        "Segregation of duties: you submitted this vendor for approval, so someone else must approve it.",
        403
      );
    }
    // A vendor that is out of compliance cannot be (re)approved until that is put right.
    if (to === "APPROVED") {
      const c = await VendorGateService.computeCompliance(vendor);
      if (c.status === "NON_COMPLIANT") {
        throw new VendorPolicyError("VENDOR_NON_COMPLIANT", `The vendor cannot be approved while non-compliant: ${c.issues.join("; ")}.`, 409);
      }
    }

    const data: any = {
      lifecycleStatus: to,
      statusReason: reason || null,
      statusChangedAt: new Date(),
      statusChangedById: actor?.id ?? null,
      ...legacyAxes(to, reason),
    };
    if (to === "APPROVED") {
      data.approvedById = actor?.id ?? null;
      data.approvedAt = new Date();
      if (!vendor.onboardingDate) data.onboardingDate = new Date();
    }
    if (to === "DRAFT" && from === "PENDING_APPROVAL") data.approvalStatus = "REJECTED";

    const updated = await prisma.vendor.update({ where: { id: vendorId }, data });
    await VendorGateService.refresh(vendorId);
    await AuditService.log({
      userId: actor?.id ?? null,
      action: "VENDOR_STATUS_CHANGE",
      entityType: "Vendor",
      entityId: vendorId,
      oldValues: { lifecycleStatus: from, approvalStatus: vendor.approvalStatus },
      newValues: { lifecycleStatus: to, approvalStatus: data.approvalStatus ?? vendor.approvalStatus, reason: reason || null },
      ipAddress: opts.audit?.ip ?? null,
      userAgent: opts.audit?.ua ?? null,
    });
    return updated;
  }

  /** A self-registered supplier reviewed by staff: review and approval in one act, both recorded. */
  static async approveSelfRegistration(vendorId: string, actor: any, audit?: any) {
    const v = await prisma.vendor.findUnique({ where: { id: vendorId } });
    const from = normalizeVendorStatus(v?.lifecycleStatus);
    if (from === "PENDING_REVIEW") await this.transition(vendorId, "PENDING_APPROVAL", null, { reason: "Registration reviewed" });
    return this.transition(vendorId, "APPROVED", actor, { audit, skipSod: true });
  }
}
