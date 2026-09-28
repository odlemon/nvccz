// @ts-nocheck
/**
 * Vendor compliance cycle: brings stored compliance/status in step with today's dates, and alerts the people who
 * manage vendors BEFORE a document (or tax clearance) expires, and again when it has.
 *
 *  - syncLapsed(): cheap, called whenever the registry is read; expiry can therefore never be "stale".
 *  - runCycle(): syncLapsed + notifications. Runs on a timer (startScheduler), from the cron route, and on demand.
 */
import { prisma } from "../utils/database";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as PROC_PERMS } from "../config/procurementPermissions";
import { userAvailability } from "../config/userMasterAccess";
import { VENDOR_DOCUMENT_TYPE_LABELS } from "../config/vendorStatus";
import { VendorGateService } from "./VendorGateService";

const DAY = 86400000;

function label(t: string) {
  return VENDOR_DOCUMENT_TYPE_LABELS[t] || String(t).replace(/_/g, " ").toLowerCase();
}
function ymd(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

export class VendorComplianceJobService {
  /** People who look after vendors: hold the vendor manage/approve permission (or are admin/CFO), and can act today. */
  static async authorisedUsers() {
    const users = await prisma.user.findMany({
      where: { role: { name: { notIn: ["applicant", "INVESTEE", "Limited Partner"] } } },
      include: { role: true },
    });
    return users.filter(
      (u: any) =>
        userAvailability(u).ok &&
        (userHasEffectivePermission(u, PROC_PERMS.vendorsManage) ||
          userHasEffectivePermission(u, PROC_PERMS.vendorsApprove) ||
          isModulePrivilegedUser(u))
    );
  }

  /** Vendors whose stored state no longer matches the calendar. */
  static async syncLapsed(limit = 500) {
    const now = new Date();
    const rows = await prisma.vendor.findMany({
      where: {
        OR: [
          { taxClearanceExpiryDate: { lt: now }, OR: [{ complianceStatus: { not: "NON_COMPLIANT" } }, { lifecycleStatus: "APPROVED" }] },
          { kycDocuments: { some: { expiryDate: { lt: now } } }, OR: [{ complianceStatus: { not: "NON_COMPLIANT" } }, { lifecycleStatus: "APPROVED" }] },
          { lifecycleStatus: "EXPIRED", statusReason: { startsWith: "AUTO:" } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    for (const r of rows) await VendorGateService.refresh(r.id);
    return rows.length;
  }

  /** Through the one shared procurement dispatcher: the rule, the recipient check, the in-app row, the email and the log. */
  private static async notify(users: any[], n: { vendorId: string; type: string; vars: Record<string, any> }) {
    const { notify } = await import("./notifications/ProcurementNotifier");
    const r = await notify("VENDOR_DOCUMENT_EXPIRING", { userIds: users.map((u) => u.id), entityType: "Vendor", entityId: n.vendorId, type: n.type, data: { vendorId: n.vendorId, expiry: n.vars.expiry, daysLeft: n.vars.daysLeft }, vars: n.vars });
    return r.enabled ? users.length : 0;
  }

  static async runCycle() {
    const summary = { synced: 0, expiring: 0, expired: 0, notifications: 0, recipients: 0 };
    summary.synced = await this.syncLapsed();
    const users = await this.authorisedUsers();
    summary.recipients = users.length;
    if (!users.length) return summary;
    // a switched-off rule stops the notices and leaves them unmarked, so switching it back on sends what is still due
    if (!(await (await import("./notifications/ProcurementNotifier")).getRules()).VENDOR_DOCUMENT_EXPIRING.enabled) return summary;

    const { getRules } = await import("./notifications/ProcurementNotifier");
    const defaultLead = (await getRules()).VENDOR_DOCUMENT_EXPIRING?.params?.daysBefore ?? (await VendorGateService.noticeDays());
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const docs = await prisma.vendorKycDocument.findMany({
      where: { expiryDate: { not: null } },
      include: { vendor: { select: { id: true, name: true, vendorCode: true } } },
    });
    for (const d of docs) {
      const exp = new Date(d.expiryDate as any);
      const lead = d.notifyDaysBefore ?? defaultLead;
      const who = `${d.vendor.vendorCode ? d.vendor.vendorCode + " " : ""}${d.vendor.name}`;
      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / DAY);
      if (daysLeft < 0 && (!d.lastExpiryNoticeAt || new Date(d.lastExpiryNoticeAt) < exp)) {
        summary.notifications += await this.notify(users, {
          vendorId: d.vendor.id, type: "VENDOR_DOCUMENT_EXPIRED",
          vars: { vendor: who, document: label(d.documentType), expiry: ymd(exp), expired: true },
        });
        await prisma.vendorKycDocument.update({ where: { id: d.id }, data: { lastExpiryNoticeAt: new Date() } });
        summary.expired++;
      } else if (daysLeft >= 0 && daysLeft <= lead && !d.lastExpiryNoticeAt) {
        summary.notifications += await this.notify(users, {
          vendorId: d.vendor.id, type: "VENDOR_DOCUMENT_EXPIRING",
          vars: { vendor: who, document: label(d.documentType), expiry: ymd(exp), daysLeft },
        });
        await prisma.vendorKycDocument.update({ where: { id: d.id }, data: { lastExpiryNoticeAt: new Date() } });
        summary.expiring++;
      }
    }

    // Tax clearance is the vendor's own date; it alerts on the same terms.
    const vendors = await prisma.vendor.findMany({
      where: { taxClearanceExpiryDate: { not: null }, isActive: true },
      select: { id: true, name: true, vendorCode: true, taxClearanceExpiryDate: true, taxRevalidationAlertNotifiedAt: true },
    });
    for (const v of vendors) {
      const exp = new Date(v.taxClearanceExpiryDate as any);
      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / DAY);
      const who = `${v.vendorCode ? v.vendorCode + " " : ""}${v.name}`;
      const notified = v.taxRevalidationAlertNotifiedAt ? new Date(v.taxRevalidationAlertNotifiedAt) : null;
      if (daysLeft < 0 && (!notified || notified < exp)) {
        summary.notifications += await this.notify(users, {
          vendorId: v.id, type: "VENDOR_TAX_CLEARANCE_EXPIRED",
          vars: { vendor: who, document: "Tax clearance", expiry: ymd(exp), expired: true },
        });
        await prisma.vendor.update({ where: { id: v.id }, data: { taxRevalidationAlertNotifiedAt: new Date() } });
        summary.expired++;
      } else if (daysLeft >= 0 && daysLeft <= defaultLead && !notified) {
        summary.notifications += await this.notify(users, {
          vendorId: v.id, type: "VENDOR_TAX_CLEARANCE_EXPIRING",
          vars: { vendor: who, document: "Tax clearance", expiry: ymd(exp), daysLeft },
        });
        await prisma.vendor.update({ where: { id: v.id }, data: { taxRevalidationAlertNotifiedAt: new Date() } });
        summary.expiring++;
      }
    }
    return summary;
  }

  /** Every six hours, plus once shortly after start. Off with VENDOR_COMPLIANCE_JOB=off. */
  static startScheduler() {
    if (String(process.env.VENDOR_COMPLIANCE_JOB || "").toLowerCase() === "off") return;
    const run = () => this.runCycle().then((s) => console.log("[vendor-compliance]", JSON.stringify(s))).catch((e) => console.error("[vendor-compliance] failed:", e?.message || e));
    setTimeout(run, 120000).unref?.();
    setInterval(run, 6 * 3600 * 1000).unref?.();
  }
}
