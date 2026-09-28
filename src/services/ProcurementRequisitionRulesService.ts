import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { VendorGateService } from "./VendorGateService";

/**
 * SRD §10/§11 rules a purchase requisition must satisfy: header field vocabulary, plan linkage and consumption, budget
 * availability, and the suggested-vendor rule. One place, called from create / update (field checks) and submit (the
 * plan/budget/vendor gates), so no path can skip them.
 */
export const PROCUREMENT_METHODS = ["RFQ", "OPEN_TENDER", "RESTRICTED_TENDER", "SINGLE_SOURCE", "DIRECT_PURCHASE", "FRAMEWORK_CALL_OFF"] as const;
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const EXCEPTION_TYPES = ["NONE", "EMERGENCY", "SOLE_SOURCE", "RETROSPECTIVE", "UNPLANNED", "OTHER"] as const;
export const SUGGESTED_VENDOR_POLICIES = ["NOT_ALLOWED", "ALLOWED_APPROVED_ONLY", "ONLY_FOR_SOLE_SOURCE"] as const;
export const BUDGET_CHECK_MODES = ["ENFORCE", "WARN", "OFF"] as const;
export const PLAN_LINK_POLICIES = ["OPTIONAL", "REQUIRED"] as const;

/** Requisition statuses that hold budget and plan value: everything that is in flight or has been approved. */
export const COMMITTING_STATUSES = ["PENDING_APPROVAL", "APPROVED", "RFQ_CREATED", "PO_CREATED", "PENDING_VC_EXECUTIVE_REVIEW", "COMPLETED", "PARTIALLY_ORDERED", "ORDERED"];
const RELEASED_STATUSES = ["DRAFT", "REJECTED", "CANCELLED", "RETURNED", "RETURNED_FOR_AMENDMENT"];

const clean = (v: unknown) => (v == null ? "" : String(v).trim());
const yearOf = (v: string | Date | null | undefined) => {
  const m = String(v instanceof Date ? v.getUTCFullYear() : v ?? "").match(/(\d{4})/);
  return m ? m[1] : String(new Date().getFullYear());
};

export type RequisitionHeaderInput = {
  currencyId?: string | null;
  requiredDate?: string | Date | null;
  procurementMethod?: string | null;
  riskLevel?: string | null;
  exceptionType?: string | null;
  suggestedVendorId?: string | null;
};

export class ProcurementRequisitionRulesService {
  static async settings() {
    const row = await (prisma as any).procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
    return {
      suggestedVendorPolicy: String(row?.suggestedVendorPolicy ?? "ALLOWED_APPROVED_ONLY"),
      budgetCheckMode: String(row?.budgetCheckMode ?? "ENFORCE"),
      planLinkPolicy: String(row?.planLinkPolicy ?? "OPTIONAL"),
    };
  }

  /** Validates the §11 header fields and returns the Prisma-ready values for the ones supplied (undefined = untouched). */
  static async normalizeHeader(input: RequisitionHeaderInput, opts: { creating: boolean }) {
    const out: Record<string, any> = {};
    const oneOf = (label: string, raw: unknown, list: readonly string[]) => {
      const v = clean(raw).toUpperCase().replace(/[\s-]+/g, "_");
      if (!v) return null;
      if (!list.includes(v)) throw new Error(`${label} must be one of: ${list.join(", ")}.`);
      return v;
    };
    if (input.procurementMethod !== undefined) out.procurementMethod = oneOf("Procurement method", input.procurementMethod, PROCUREMENT_METHODS);
    if (input.riskLevel !== undefined) out.riskLevel = oneOf("Risk level", input.riskLevel, RISK_LEVELS);
    if (input.exceptionType !== undefined) {
      const v = oneOf("Exception type", input.exceptionType, EXCEPTION_TYPES);
      out.exceptionType = v === "NONE" ? null : v;
    }
    if (input.requiredDate !== undefined) {
      const raw = clean(input.requiredDate instanceof Date ? input.requiredDate.toISOString() : input.requiredDate);
      if (!raw) out.requiredDate = null;
      else {
        const d = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
        if (Number.isNaN(d.getTime())) throw new Error("Required date is not a valid date.");
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (opts.creating && d.getTime() < today.getTime()) throw new Error("Required date cannot be in the past.");
        out.requiredDate = d;
      }
    }
    if (input.currencyId !== undefined) {
      const id = clean(input.currencyId);
      if (!id) out.currencyId = null;
      else {
        const c = await prisma.currency.findFirst({ where: { OR: [{ id }, { code: id.toUpperCase() }] }, select: { id: true } });
        if (!c) throw new Error("Currency not found.");
        out.currencyId = c.id;
      }
    }
    if (input.suggestedVendorId !== undefined) {
      const id = clean(input.suggestedVendorId);
      if (!id) out.suggestedVendorId = null;
      else {
        const v = await prisma.vendor.findUnique({ where: { id }, select: { id: true } });
        if (!v) throw new Error("Suggested vendor not found.");
        out.suggestedVendorId = v.id;
      }
    }
    return out;
  }

  /** The suggested vendor may be named only where the configured rule permits, and is a hint that never narrows sourcing. */
  static async assertSuggestedVendor(pr: { suggestedVendorId?: string | null; exceptionType?: string | null; procurementMethod?: string | null }) {
    if (!pr.suggestedVendorId) return;
    const { suggestedVendorPolicy: policy } = await this.settings();
    if (policy === "NOT_ALLOWED") {
      throw new Error("Naming a suggested vendor is not permitted on requisitions under the current procurement policy. Remove it.");
    }
    if (policy === "ONLY_FOR_SOLE_SOURCE") {
      const sole = pr.exceptionType === "SOLE_SOURCE" || pr.procurementMethod === "SINGLE_SOURCE";
      if (!sole) throw new Error("A suggested vendor may be named only for a sole-source / single-source requisition.");
    }
    // Both remaining rules require the vendor to be one we could actually buy from.
    await VendorGateService.assertTransactable(pr.suggestedVendorId, "INVITE");
  }

  /** How much of a plan line is drawn, by whom, and what is left. `excludeRequisitionId` leaves out the requisition being checked. */
  static async planLineConsumption(planItemId: string, excludeRequisitionId?: string) {
    const item = await prisma.procurementPlanItem.findUnique({ where: { id: planItemId }, include: { plan: true } });
    if (!item) return null;
    const drawn = await prisma.purchaseRequisition.findMany({
      where: { planItemId, status: { notIn: RELEASED_STATUSES }, ...(excludeRequisitionId ? { id: { not: excludeRequisitionId } } : {}) },
      select: { id: true, requisitionNumber: true, title: true, status: true, totalAmount: true },
      orderBy: { createdAt: "asc" },
    });
    const consumed = drawn.reduce((s, r) => s.plus(new Decimal(r.totalAmount.toString())), new Decimal(0));
    const planned = new Decimal(item.estimatedValue.toString());
    return {
      item,
      planned: planned.toNumber(),
      consumed: consumed.toNumber(),
      remaining: planned.minus(consumed).toNumber(),
      requisitions: drawn.map((r) => ({ id: r.id, requisitionNumber: r.requisitionNumber, title: r.title, status: r.status, amount: Number(r.totalAmount) })),
    };
  }

  /** Approved plans only; no overdraw beyond the line's value (an EXCEPTION-typed requisition is allowed to, and says so). */
  static async assertPlanLink(pr: {
    id?: string;
    planItemId?: string | null;
    exceptionType?: string | null;
    totalAmount: Decimal | number | string;
    currencyCode?: string | null;
  }, when: "edit" | "submit") {
    const { planLinkPolicy } = await this.settings();
    if (!pr.planItemId) {
      if (when === "submit" && planLinkPolicy === "REQUIRED" && !pr.exceptionType) {
        throw new Error("This requisition must be linked to a line of an approved procurement plan, or carry an exception type (for example Unplanned).");
      }
      return { warnings: [] as string[] };
    }
    const c = await this.planLineConsumption(pr.planItemId, pr.id);
    if (!c) throw new Error("The linked procurement plan line no longer exists.");
    if (c.item.plan.status !== "APPROVED") {
      throw new Error(`Requisitions may draw only on an approved plan; ${c.item.plan.planNumber} is ${String(c.item.plan.status).toLowerCase().replace(/_/g, " ")}.`);
    }
    const warnings: string[] = [];
    if (when === "submit") {
      if (c.item.currencyCode && pr.currencyCode && c.item.currencyCode.toUpperCase() !== pr.currencyCode.toUpperCase()) {
        throw new Error(`The requisition is in ${pr.currencyCode} but the plan line is in ${c.item.currencyCode}. Use the plan line's currency.`);
      }
      const total = Number(pr.totalAmount);
      if (total > c.remaining + 0.005) {
        const msg = `This requisition (${total.toFixed(2)}) exceeds what remains on plan line "${c.item.description}" (${Math.max(c.remaining, 0).toFixed(2)} of ${c.planned.toFixed(2)}).`;
        if (pr.exceptionType) warnings.push(`${msg} Allowed because the requisition is a declared exception (${pr.exceptionType}).`);
        else throw new Error(`${msg} Reduce the estimate, or declare an exception type.`);
      }
    }
    return { warnings };
  }

  /** Budget line for a code/cost centre: an exact cost-centre row wins over the code-wide (empty cost centre) row. */
  static async budgetLineFor(budgetCode: string, costCentre: string | null | undefined, year: string) {
    const rows = await prisma.procurementBudget.findMany({
      where: { budgetCode, financialYear: { contains: year }, status: "ACTIVE", costCentre: { in: [clean(costCentre), ""] } },
    });
    return rows.find((r) => r.costCentre === clean(costCentre) && r.costCentre !== "") ?? rows.find((r) => r.costCentre === "") ?? null;
  }

  static async budgetPosition(budgetCode: string, costCentre: string | null | undefined, year: string, excludeRequisitionId?: string) {
    const line = await this.budgetLineFor(budgetCode, costCentre, year);
    if (!line) return null;
    const drawn = await prisma.purchaseRequisition.findMany({
      where: {
        budgetCode,
        status: { notIn: RELEASED_STATUSES },
        ...(line.costCentre ? { costCentre: line.costCentre } : {}),
        createdAt: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`) },
        ...(excludeRequisitionId ? { id: { not: excludeRequisitionId } } : {}),
      },
      select: { totalAmount: true },
    });
    const committed = drawn.reduce((s, r) => s + Number(r.totalAmount), 0);
    const amount = Number(line.amount);
    return { line, amount, committed, available: amount - committed };
  }

  static async assertBudget(pr: {
    id?: string;
    budgetCode?: string | null;
    costCentre?: string | null;
    totalAmount: Decimal | number | string;
    currencyCode?: string | null;
  }) {
    const { budgetCheckMode: mode } = await this.settings();
    const warnings: string[] = [];
    if (mode === "OFF") return { warnings };
    const fail = (msg: string) => {
      if (mode === "ENFORCE") throw new Error(msg);
      warnings.push(msg);
    };
    const code = clean(pr.budgetCode);
    if (!code) {
      fail("A budget code is required before the requisition can be submitted.");
      return { warnings };
    }
    const year = String(new Date().getFullYear());
    const pos = await this.budgetPosition(code, pr.costCentre, year, pr.id);
    if (!pos) {
      fail(`Budget code ${code}${clean(pr.costCentre) ? ` / cost centre ${clean(pr.costCentre)}` : ""} has no active budget for ${year}.`);
      return { warnings };
    }
    if (pos.line.currencyCode && pr.currencyCode && pos.line.currencyCode.toUpperCase() !== pr.currencyCode.toUpperCase()) {
      fail(`The budget ${code} is held in ${pos.line.currencyCode}; the requisition is in ${pr.currencyCode}.`);
    }
    const total = Number(pr.totalAmount);
    if (!(total > 0)) fail("Enter an estimated unit price on each line so the budget can be checked.");
    else if (total > pos.available + 0.005) {
      fail(`Insufficient budget on ${code}: ${pos.available.toFixed(2)} available of ${pos.amount.toFixed(2)} (${pos.committed.toFixed(2)} already committed); this requisition needs ${total.toFixed(2)}.`);
    }
    return { warnings };
  }
}
