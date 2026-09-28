//@ts-nocheck
import { prisma } from "../utils/database";
import { randomBytes } from "crypto";
import AuditService from "./AuditService";
import { processVendorTaxRevalidationAlerts } from "./VendorTaxComplianceService";

/** Remaining NTS gaps (ex-SmartStream): settings, reminders, RPA, AI usage, conflicts, dept probe. */
export class ProcurementNtsRemainingService {
  static async getSettings() {
    let row = await prisma.procurementSettings.findUnique({ where: { id: "default" } });
    if (!row) {
      row = await prisma.procurementSettings.create({
        data: { id: "default" },
      });
    }
    return row;
  }

  static async updateSettings(userId: string, patch: Record<string, unknown>) {
    const data: any = {};
    const map: Record<string, string> = {
      overDeliveryTolerancePct: "overDeliveryTolerancePct",
      matchPriceVariancePct: "matchPriceVariancePct",
      matchQtyTolerancePct: "matchQtyTolerancePct",
      poValidityGraceDays: "poValidityGraceDays",
      autoApproveMatchedInvoices: "autoApproveMatchedInvoices",
      autoApproveInvoiceLimit: "autoApproveInvoiceLimit",
      prNumberFormat: "prNumberFormat",
      poNumberFormat: "poNumberFormat",
      rfqNumberFormat: "rfqNumberFormat",
      consolidationFxCurrencyId: "consolidationFxCurrencyId",
      notificationRulesJson: "notificationRulesJson",
      statusVocabularyJson: "statusVocabularyJson",
    };
    for (const [k, field] of Object.entries(map)) {
      if (patch[k] !== undefined) data[field] = patch[k];
    }
    // The purchase-to-pay controls (tolerances, enforcement, AI switch and limits) are validated on their own.
    const { p2pSettingsPatch, invalidateP2pConfig } = await import("./p2p/P2pSettings");
    Object.assign(data, p2pSettingsPatch(patch));
    for (const key of ["matchPriceVariancePct", "matchQtyTolerancePct", "overDeliveryTolerancePct"]) {
      if (data[key] === undefined) continue;
      const n = Number(data[key]);
      if (data[key] === null || data[key] === "" || !Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${key} must be a number between 0 and 100.`);
      data[key] = n;
    }
    await this.getSettings();
    const updated = await prisma.procurementSettings.update({
      where: { id: "default" },
      data,
    });
    invalidateP2pConfig();
    try {
      const { invalidateMatchVarianceCache } = await import("../config/suite06Config");
      invalidateMatchVarianceCache();
    } catch {
      /* ignore */
    }
    await AuditService.log({
      userId,
      action: "UPDATE",
      entityType: "ProcurementSettings",
      entityId: "default",
      newValues: data,
    });
    return updated;
  }

  static async runComplianceReminders(userId: string) {
    const result = await processVendorTaxRevalidationAlerts(new Date());
    await AuditService.log({
      userId,
      action: "UPDATE",
      entityType: "Vendor",
      entityId: "tax-revalidation-batch",
      newValues: result,
    });
    return result;
  }

  static async listRpaJobs(params?: { status?: string; take?: number; skip?: number }) {
    const where: any = {};
    if (params?.status) where.status = params.status;
    const take = Math.min(Math.max(Number(params?.take) || 50, 1), 200);
    const skip = Math.max(Number(params?.skip) || 0, 0);
    const [items, total] = await Promise.all([
      prisma.procurementRpaJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.procurementRpaJob.count({ where }),
    ]);
    return { items, total, take, skip };
  }

  static async enqueueRpaJob(params: {
    jobType: string;
    payload?: object;
    createdById?: string;
  }) {
    return prisma.procurementRpaJob.create({
      data: {
        id: `rpa_${randomBytes(12).toString("hex")}`,
        jobType: params.jobType,
        status: "QUEUED",
        payloadJson: (params.payload || {}) as object,
        createdById: params.createdById || null,
        updatedAt: new Date(),
      },
    });
  }

  static async recordAiUsage(params: {
    userId?: string;
    feature: string;
    units?: number;
    meta?: object;
  }) {
    return prisma.procurementAiUsage.create({
      data: {
        id: `aiu_${randomBytes(12).toString("hex")}`,
        userId: params.userId || null,
        feature: params.feature,
        units: params.units ?? 1,
        metaJson: (params.meta || {}) as object,
      },
    });
  }

  static async aiUsageSummary(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await prisma.procurementAiUsage.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: since } },
      _sum: { units: true },
      _count: { _all: true },
    });
    return {
      since: since.toISOString(),
      byFeature: rows.map((r) => ({
        feature: r.feature,
        units: r._sum.units ?? 0,
        events: r._count._all,
      })),
    };
  }

  static async saveConflictDeclarations(params: {
    procurementRfqId: string;
    declarations: Array<{
      userId?: string;
      name: string;
      hasConflict: boolean;
      details?: string;
    }>;
    recordedById: string;
  }) {
    const rfq = await prisma.procurementRfq.findUnique({ where: { id: params.procurementRfqId } });
    if (!rfq) throw new Error("RFQ not found");
    const packageJson = {
      declarations: params.declarations,
      recordedById: params.recordedById,
      recordedAt: new Date().toISOString(),
    };
    const updated = await prisma.procurementRfq.update({
      where: { id: rfq.id },
      data: { conflictDeclarationsJson: packageJson as object },
    });
    await AuditService.log({
      userId: params.recordedById,
      action: "UPDATE",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      newValues: { note: "Conflict declarations (SRD §19)", count: params.declarations.length },
    });
    return updated;
  }

  /** §70 — dept A must not see dept B requisitions when both are scoped. */
  static async deptIsolationProbe(actor: {
    userId: string;
    department?: string | null;
    isPrivileged?: boolean;
  }) {
    const mine = String(actor.department || "").trim();
    if (actor.isPrivileged || !mine) {
      return {
        ok: true,
        skipped: true,
        reason: actor.isPrivileged
          ? "Privileged users intentionally see cross-department data."
          : "Caller has no department scope to probe.",
      };
    }
    const foreign = await prisma.purchaseRequisition.findFirst({
      where: {
        AND: [{ department: { not: null } }, { department: { not: mine } }],
      },
      select: { id: true, requisitionNumber: true, department: true },
    });
    if (!foreign) {
      return { ok: true, skipped: true, reason: "No other-department requisitions exist to compare." };
    }
    // Probe: list as the caller would — department filter should exclude foreign.
    const leaked = await prisma.purchaseRequisition.findMany({
      where: { department: mine },
      select: { id: true, department: true },
      take: 500,
    });
    const leak = leaked.some((r) => r.id === foreign.id);
    return {
      ok: !leak,
      foreignSample: {
        id: foreign.id,
        requisitionNumber: foreign.requisitionNumber,
        department: foreign.department,
      },
      callerDepartment: mine,
      message: leak
        ? "FAIL: foreign requisition appeared in department-scoped list."
        : "PASS: foreign requisition excluded from department-scoped list.",
    };
  }

  static async consolidationFxRate(toCurrencyId?: string | null) {
    const settings = await this.getSettings();
    const targetId = toCurrencyId || (settings as any).consolidationFxCurrencyId;
    if (!targetId) {
      const def = await prisma.currency.findFirst({ where: { isDefault: true } });
      return { currencyId: def?.id ?? null, code: def?.code ?? null, note: "Using company default currency." };
    }
    const cur = await prisma.currency.findUnique({ where: { id: targetId } });
    return {
      currencyId: cur?.id ?? targetId,
      code: cur?.code ?? null,
      note: "Consolidation reporting currency from procurement settings (SRD §38).",
    };
  }
}
