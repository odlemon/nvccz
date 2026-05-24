// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { KpiAccountingIntegrationService } from "./KpiAccountingIntegrationService";
import { KPIService } from "./KPIService";
import {
  computeParentRollupFromChildren,
  deriveGoalProgressState,
  deriveParentStageFromRollup,
  mergeContributionWeightIntoActivities
} from "./performanceGoalRollupUtils";
import {
  normalizeOrgBscScorecardPillar,
  ORG_BSC_CANONICAL_TO_PILLAR_ID,
  resolveGoalEscalationStatus
} from "./performanceScorecardSupport";
import { ScorecardPillarService } from "./ScorecardPillarService";
import {
  resolveDefaultCompanyGoalAssigneeId,
  resolveDefaultDepartmentGoalAssigneeId
} from "./performanceGoalDefaultAssignee";
import { ensureDepartmentPerformanceContractForGoal } from "./DepartmentPerformanceContractService";
import { HARDCODED_KPIS } from "../config/hardcodedKPIs";
import { FirebaseStorageService } from "./FirebaseStorageService";
import { getPostedPeriodRevenueExpenseNetProfit } from "./AccountingGlPeriodTotalsService";

/** Prisma DateTime requires full ISO; breakdown JSON often sends "YYYY-MM-DD" only. */
function isDateOnlyString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** True when [aStart,aEnd] intersects [bStart,bEnd] (inclusive). */
function dateRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

function coerceGoalDateTime(
  value: unknown,
  fallback: Date | null | undefined,
  endOfDay: boolean
): Date {
  const tryParse = (v: unknown): Date | null => {
    if (v == null || v === "") return null;
    if (v instanceof Date) {
      return Number.isNaN(v.getTime()) ? null : v;
    }
    const s = String(v).trim();
    if (!s) return null;
    if (isDateOnlyString(s)) {
      return new Date(endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`);
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const parsed = tryParse(value) ?? tryParse(fallback);
  if (parsed) return parsed;
  throw new Error(
    endOfDay
      ? "Goal endDate is missing or invalid. Use ISO-8601 (e.g. 2026-12-31 or 2026-12-31T23:59:59.000Z)."
      : "Goal startDate is missing or invalid. Use ISO-8601 (e.g. 2026-01-01 or 2026-01-01T00:00:00.000Z)."
  );
}

function decodeGoalAttachmentBase64(contentBase64: string, maxBytes = 5 * 1024 * 1024): Buffer {
  if (!contentBase64 || typeof contentBase64 !== "string") {
    throw new Error("contentBase64 is required");
  }
  const normalized = contentBase64.includes(",")
    ? contentBase64.slice(contentBase64.indexOf(",") + 1)
    : contentBase64;
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer || buffer.length === 0) {
    throw new Error("Attachment payload is empty");
  }
  if (buffer.length > maxBytes) {
    throw new Error("Attachment exceeds 5MB limit");
  }
  return buffer;
}

function extractGoalAttachmentsFromActivities(activities: any): any[] {
  if (!activities || typeof activities !== "object" || Array.isArray(activities)) {
    return [];
  }
  const atts = (activities as any).attachments;
  return Array.isArray(atts) ? atts : [];
}

function withGoalAttachmentFields(goal: any) {
  if (!goal) return goal;
  const attachments = extractGoalAttachmentsFromActivities(goal.activities);
  return {
    ...goal,
    attachments,
    attachmentUrls: attachments
      .map((a: any) => a?.fileUrl)
      .filter((u: any) => typeof u === "string" && u.length > 0)
  };
}

/** targetUnit drives whether legacy percent* vs monetary* columns stay in sync with progress. */
function isPercentageStyleGoal(goal: { targetUnit?: string | null }): boolean {
  const u = String(goal.targetUnit || "")
    .toLowerCase()
    .trim();
  return u === "percentage" || u === "%" || u === "percent" || u.endsWith(" percent");
}

/** Best-effort baseline before applying an increment (currentValue, else legacy achieved). */
export function parseProgressBaseline(goal: {
  currentValue?: unknown;
  targetUnit?: string | null;
  monetaryValueAchieved?: unknown;
  percentValueAchieved?: unknown;
}): number {
  if (goal.currentValue != null && goal.currentValue !== "") {
    const v = parseFloat(String(goal.currentValue));
    if (!Number.isNaN(v)) return v;
  }
  if (isPercentageStyleGoal(goal)) {
    const p = goal.percentValueAchieved;
    if (p != null && p !== "") {
      const v = parseFloat(String(p));
      if (!Number.isNaN(v)) return v;
    }
  } else {
    const m = goal.monetaryValueAchieved;
    if (m != null && m !== "") {
      const v = parseFloat(String(m));
      if (!Number.isNaN(v)) return v;
    }
  }
  return 0;
}

/** Legacy dashboards read monetary* / percent*; keep them aligned with currentValue / targetValue. */
export function legacyProgressFieldsForGoal(
  goal: {
    targetUnit?: string | null;
    monetaryValue?: unknown;
    percentValue?: unknown;
    targetValue?: unknown;
  },
  currentValue: number
): Record<string, unknown> {
  const targetNum =
    goal.targetValue != null && goal.targetValue !== ""
      ? parseFloat(String(goal.targetValue))
      : 0;
  const legacyData: Record<string, unknown> = {};
  if (isPercentageStyleGoal(goal)) {
    legacyData.percentValueAchieved = currentValue;
    const cap =
      goal.percentValue != null && goal.percentValue !== ""
        ? parseFloat(String(goal.percentValue))
        : targetNum > 0 && targetNum <= 100
          ? targetNum
          : 100;
    legacyData.percentValue = cap;
  } else {
    legacyData.monetaryValueAchieved = currentValue;
    const monetaryTarget =
      goal.monetaryValue != null && goal.monetaryValue !== ""
        ? parseFloat(String(goal.monetaryValue))
        : targetNum;
    if (monetaryTarget > 0) {
      legacyData.monetaryValue = monetaryTarget;
    } else if (targetNum > 0) {
      legacyData.monetaryValue = targetNum;
    }
  }
  return legacyData;
}

const REVERSE_KPI_NAME_HINTS = [
  "cost",
  "expense",
  "liabil",
  "outstanding",
  "arrears",
  "overdue",
  "variance",
  "utilisation",
  "utilization",
  "loss",
  "spend",
  "cogs",
  "cost of goods"
];

function inferReverseKpiFromNameOrAccountType(
  kpiName?: string | null,
  goalTitle?: string | null,
  catalogAccountType?: string | null
): boolean {
  if (catalogAccountType === "Expense" || catalogAccountType === "Liability") {
    return true;
  }
  const sources = [kpiName, goalTitle];
  for (const src of sources) {
    const n = String(src || "").toLowerCase().trim();
    if (!n) continue;
    const hardcoded = HARDCODED_KPIS.find(
      (k) => String(k.name || "").toLowerCase().trim() === n
    );
    if (hardcoded?.accountType === "Expense" || hardcoded?.accountType === "Liability") {
      return true;
    }
    if (REVERSE_KPI_NAME_HINTS.some((hint) => n.includes(hint))) {
      return true;
    }
  }
  return false;
}

export interface CreatePerformanceGoalRequest {
  title: string;
  description?: string;
  type: string; // "company", "department", "individual"
  parentGoalId?: string;
  departmentName?: string; // Use hardcoded department names
  // Absolute value targets (replacing percentage-based)
  targetValue: number; // Absolute target value
  targetUnit: string; // "USD", "clients", "invoices", "percentage", "hours", etc.
  currentValue?: number; // Current progress value
  kpiName?: string; // KPI name instead of ID
  priority?: string;
  startDate: Date;
  endDate: Date;
  assignedToId?: string;
  cascadeMode?: string; // "automatic", "manual", "both"
  // NEW: Enhanced Goal Definition Form Fields
  targetOperator?: string; // ">=", "<=", "=" comparison operators
  dataSourceModule?: string; // "Accounting", "Procurement", "PortfolioManagement", "TaskManagement", "Events", "Manual"
  dataSourceField?: string; // Specific field path in source module
  trackingFrequency?: string; // "Daily", "Weekly", "Monthly"
  /** Stored in activities JSON: share of parent roll-up (0–100), e.g. 80 for 80%. */
  contributionWeightPercent?: number;
  /** When set, overrides auto-derivation from targetOperator. */
  isReverseKpi?: boolean;
  /** Required when `type` is `company` (organisational BSC pillar). */
  scorecardPillar?: string;
  /**
   * Optional. When set, the goal is tied to this strategy; must not be archived.
   * Sibling `scorecardWeight` groups use the same `strategyId` and `departmentName` (org line: both null).
   */
  strategyId?: string | null;
  /**
   * BSC line weight within the pillar (0–100). With existing siblings, new + existing weights must total **exactly 100%**.
   * Omit to leave unset and set weights later via `PUT .../company-goal-weights` or the config goal route.
   */
  scorecardWeight?: number;
  /**
   * Links the goal to a performance contract. Use for CEO/Board indicators (required for those scorecards)
   * and optional for `company` org lines; for `department`, if omitted the system ensures a department PC.
   */
  performanceContractId?: string;
}

export interface UpdatePerformanceGoalRequest {
  title?: string;
  description?: string;
  type?: string;
  // Absolute value targets (replacing percentage-based)
  targetValue?: number; // Updated target value
  targetUnit?: string; // Updated target unit
  currentValue?: number; // Current progress value
  kpiId?: string;
  priority?: string;
  status?: string;
  stage?: string;
  startDate?: Date;
  endDate?: Date;
  assignedToId?: string;
  // NEW: Enhanced Goal Definition Form Fields
  targetOperator?: string; // ">=", "<=", "=" comparison operators
  dataSourceModule?: string; // "Accounting", "Procurement", "PortfolioManagement", "TaskManagement", "Events", "Manual"
  dataSourceField?: string; // Specific field path in source module
  trackingFrequency?: string; // "Daily", "Weekly", "Monthly"
  contributionWeightPercent?: number;
  /** Stored in `activities.stretchTargetValue` for BSC stretch line (target remains `targetValue`). */
  stretchTargetValue?: number;
  isReverseKpi?: boolean;
  scorecardPillar?: string | null;
}

export class PerformanceGoalService {
  // Calculate progress percentage based on absolute values
  static calculateProgressPercentage(currentValue: number, targetValue: number): number {
    if (targetValue === 0) return 0;
    return Math.min((currentValue / targetValue) * 100, 100);
  }

  // Calculate next check date based on tracking frequency
  static calculateNextCheckDate(frequency: string): Date {
    const now = new Date();
    
    switch (frequency.toLowerCase()) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      default:
        console.log(`⚠️ Unknown frequency: ${frequency}, defaulting to weekly`);
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Add `increment` to the goal's achieved amount (same unit as target: USD, % points, clients, etc.).
   * Progress % is derived from achieved vs `targetValue`. Legacy monetary* / percent* mirror `currentValue`.
   * Parent roll-up runs asynchronously so the HTTP response returns after the child row update.
   */
  static async updateGoalProgress(goalId: string, increment: number, updatedById: string) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        select: {
          id: true,
          title: true,
          targetValue: true,
          targetUnit: true,
          targetOperator: true,
          isReverseKpi: true,
          progressPercentage: true,
          stage: true,
          status: true,
          currentValue: true,
          monetaryValue: true,
          monetaryValueAchieved: true,
          percentValue: true,
          percentValueAchieved: true,
          parentGoalId: true,
          kpiId: true,
          endDate: true,
          preciseTargetValue: true,
          allowableVariance: true,
          kpi: { select: { name: true, accountType: true } }
        }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      const delta = Number(increment);
      if (Number.isNaN(delta)) {
        throw new Error("value must be a number");
      }

      const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(
        goal.kpi?.name,
        goal.title,
        goal.kpi?.accountType
      );
      const effectiveIsReverseKpi =
        Boolean(goal.isReverseKpi) ||
        String(goal.targetOperator || "").trim() === "<=" ||
        inferredReverseFromKpi;
      const effectiveTargetOperator =
        goal.targetOperator !== undefined && goal.targetOperator !== null
          ? goal.targetOperator
          : effectiveIsReverseKpi
            ? "<="
            : ">=";

      const targetNum = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const prev = parseProgressBaseline(goal);
      const currentValue = Math.max(0, prev + delta);

      const progressState = deriveGoalProgressState({
        currentValue,
        targetValue: goal.targetValue,
        targetOperator: effectiveTargetOperator,
        isReverseKpi: effectiveIsReverseKpi,
        previousStage: goal.stage,
        progressPercentage: goal.progressPercentage
      });
      const isCompleted = progressState.isTargetMet;

      const legacyData = legacyProgressFieldsForGoal(goal, currentValue);

      const performanceRiskZone = resolveGoalEscalationStatus({
        preciseCurrentValue: String(currentValue),
        currentValue,
        preciseTargetValue: goal.preciseTargetValue,
        targetValue: goal.targetValue,
        allowableVariance: goal.allowableVariance,
        isReverseKpi: effectiveIsReverseKpi,
        endDate: goal.endDate
      });

      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goalId },
        data: {
          currentValue: currentValue,
          progressPercentage: progressState.progressPercentage,
          status: progressState.status,
          stage: progressState.stage,
          isReverseKpi: effectiveIsReverseKpi,
          targetOperator: effectiveTargetOperator,
          preciseCurrentValue: String(currentValue),
          performanceRiskZone,
          performanceRiskZoneAt: new Date(),
          ...legacyData,
          updatedAt: new Date()
        }
      });

      if (isCompleted && goal.kpiId) {
        await this.triggerAccountingIntegration(goalId, currentValue, updatedById);
      }

      if (goal.parentGoalId) {
        const parentId = goal.parentGoalId;
        void this.updateParentGoalProgress(parentId).catch((parentErr: Error) => {
          console.error(
            `Failed to update parent goal progress after manual progress on ${goalId}:`,
            parentErr
          );
        });
      }

      return updatedGoal;
    } catch (error) {
      throw new Error(`Failed to update goal progress: ${error.message}`);
    }
  }

  /** Recompute C.05 / scorecard risk zone from persisted goal fields (requires DB columns). */
  static async refreshPerformanceRiskZoneOnGoal(goalId: string) {
    const g = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
    if (!g) return;
    const performanceRiskZone = resolveGoalEscalationStatus({
      preciseCurrentValue: g.preciseCurrentValue,
      currentValue: g.currentValue,
      preciseTargetValue: g.preciseTargetValue,
      targetValue: g.targetValue,
      allowableVariance: g.allowableVariance,
      isReverseKpi: g.isReverseKpi,
      endDate: g.endDate
    });
    await prisma.performanceGoal.update({
      where: { id: goalId },
      data: {
        performanceRiskZone,
        performanceRiskZoneAt: new Date()
      }
    });
  }

  static async triggerAccountingIntegration(goalId: string, achievedValue: number, updatedById: string) {
    await KpiAccountingIntegrationService.triggerKpiAchievementJournal(
      goalId,
      achievedValue,
      updatedById
    );
  }

  // Create a new performance goal
  static async createPerformanceGoal(request: CreatePerformanceGoalRequest, createdById: string) {
    try {
      let kpiId = null;
      let kpiName: string | null = null;
      let kpiCatalog: {
        id: string;
        name: string;
        isReverseKpi: boolean;
        accountType: string | null;
        scorecardPillar: string | null;
      } | null = null;

      // Validate KPI if provided by name
      if (request.kpiName) {
        const kpi = await prisma.kPI.findFirst({
          where: { name: request.kpiName },
          select: { id: true, name: true, isReverseKpi: true, accountType: true, scorecardPillar: true },
        });

        if (!kpi) {
          throw new Error(`KPI '${request.kpiName}' not found`);
        }

        kpiId = kpi.id;
        kpiName = kpi.name;
        kpiCatalog = kpi;
      }

      // Validate department if provided
      if (request.departmentName) {
        // Validate department name is in hardcoded list
        const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
        if (!validDepartments.includes(request.departmentName)) {
          throw new Error(`Invalid department name: ${request.departmentName}. Valid departments: ${validDepartments.join(", ")}`);
        }
      }

      // Validate parent goal if provided
      if (request.parentGoalId) {
        const parentGoal = await prisma.performanceGoal.findUnique({
          where: { id: request.parentGoalId }
        });

        if (!parentGoal) {
          throw new Error("Parent goal not found");
        }
        if (String(parentGoal.status).toLowerCase() !== "active") {
          throw new Error(
            "Parent goal must be active before you can add sub-goals, split work, or link downstream goals."
          );
        }
      }

      const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(
        kpiName,
        request.title,
        kpiCatalog?.accountType
      );
      const resolvedIsReverseKpi =
        typeof request.isReverseKpi === "boolean"
          ? request.isReverseKpi
          : kpiCatalog?.isReverseKpi === true
            ? true
            : request.targetOperator !== undefined
              ? String(request.targetOperator).trim() === "<="
              : inferredReverseFromKpi;
      const resolvedTargetOperator =
        request.targetOperator !== undefined
          ? request.targetOperator
          : resolvedIsReverseKpi
            ? "<="
            : ">=";

      const companyPillarMsg =
        'Organisational (company) goals require scorecardPillar: Financial, Customer & Market, Internal Operations, or Learning, Growth & HR (or FINANCIAL, CUSTOMER, INTERNAL_OPS, LEARNING_GROWTH).';
      const pillarRequiredMsg =
        "scorecardPillar is required for performance goals (or provide a KPI that has scorecardPillar set).";
      let scorecardPillarDb: string | undefined;
      let pillarIdDb: string | null | undefined;
      if (request.type === "company") {
        const fromReq = normalizeOrgBscScorecardPillar(request.scorecardPillar);
        const fromKpi = kpiCatalog?.scorecardPillar
          ? normalizeOrgBscScorecardPillar(kpiCatalog.scorecardPillar)
          : null;
        const p = fromReq || fromKpi;
        if (!p) {
          throw new Error(companyPillarMsg);
        }
        await ScorecardPillarService.assertCanonicalExists(p);
        scorecardPillarDb = p;
        pillarIdDb = ORG_BSC_CANONICAL_TO_PILLAR_ID[p] ?? null;
      } else {
        const fromReq = request.scorecardPillar
          ? normalizeOrgBscScorecardPillar(request.scorecardPillar)
          : null;
        const fromKpi = kpiCatalog?.scorecardPillar
          ? normalizeOrgBscScorecardPillar(kpiCatalog.scorecardPillar)
          : null;
        const p = fromReq || fromKpi;
        if (!p) {
          throw new Error(pillarRequiredMsg);
        }
        await ScorecardPillarService.assertCanonicalExists(p);
        scorecardPillarDb = p;
        pillarIdDb = ORG_BSC_CANONICAL_TO_PILLAR_ID[p] ?? null;
      }

      let performanceContractId: string | undefined =
        request.performanceContractId != null && String(request.performanceContractId).trim() !== ""
          ? String(request.performanceContractId).trim()
          : undefined;

      if (performanceContractId) {
        const pc = await prisma.performanceContract.findFirst({
          where: {
            id: performanceContractId,
            status: { notIn: ["ARCHIVED", "CANCELLED"] }
          },
          select: { id: true, contractType: true, departmentName: true }
        });
        if (!pc) {
          throw new Error("performanceContractId not found or is not an active contract");
        }
        if (request.type === "department" && request.departmentName) {
          if (String(pc.contractType || "").toUpperCase() !== "DEPARTMENT") {
            throw new Error("performanceContractId must reference a DEPARTMENT contract for department goals");
          }
          if (
            pc.departmentName != null &&
            String(pc.departmentName).trim() !== "" &&
            String(pc.departmentName).trim() !== String(request.departmentName).trim()
          ) {
            throw new Error("performanceContractId department does not match goal departmentName");
          }
        }
      }

      if (request.type === "department" && request.departmentName && !performanceContractId) {
        performanceContractId = await ensureDepartmentPerformanceContractForGoal({
          departmentName: request.departmentName,
          goalStart: request.startDate,
          createdById
        });
      }

      let companyStrategyId: string | null = null;
      if (request.type === "company") {
        if (request.strategyId != null && String(request.strategyId).trim() !== "") {
          const sid = String(request.strategyId).trim();
          const st = await prisma.performanceStrategy.findUnique({ where: { id: sid } });
          if (!st) {
            throw new Error("strategyId not found");
          }
          if (st.archivedAt != null || st.status === "ARCHIVED") {
            throw new Error("Cannot link a new goal to an archived strategy.");
          }
          companyStrategyId = sid;
        }
      } else if (request.scorecardWeight !== undefined && request.scorecardWeight !== null) {
        throw new Error(
          "Do not set scorecardWeight on goal create. New goals are created inactive for scorecard weighting; " +
            "set weights using PUT /api/performance/scorecard-pillars/{pillarId}/company-goal-weights (batch) " +
            "or PUT /api/performance/config/goals/{goalId} (single)."
        );
      } else if (request.strategyId != null && String(request.strategyId).trim() !== "") {
        throw new Error("strategyId on create is only supported for organisational (company) goals.");
      }

      if (request.scorecardWeight !== undefined && request.scorecardWeight !== null) {
        throw new Error(
          "Do not set scorecardWeight on goal create. New goals are created inactive for scorecard weighting; " +
            "set weights using PUT /api/performance/scorecard-pillars/{pillarId}/company-goal-weights (batch) " +
            "or PUT /api/performance/config/goals/{goalId} (single)."
        );
      }

      let assignedToId: string | null =
        request.assignedToId != null && String(request.assignedToId).trim() !== ""
          ? String(request.assignedToId).trim()
          : null;
      if (!assignedToId && request.type === "company") {
        assignedToId = await resolveDefaultCompanyGoalAssigneeId();
      }
      if (!assignedToId && request.type === "department" && request.departmentName) {
        assignedToId = await resolveDefaultDepartmentGoalAssigneeId(request.departmentName);
      }

      // Create the performance goal with absolute value targets
      const goal = await prisma.performanceGoal.create({
        data: {
          title: request.title,
          description: request.description,
          type: request.type,
          parentGoalId: request.parentGoalId,
          departmentName: request.departmentName,
          ...(performanceContractId ? { performanceContractId } : {}),
          ...(request.type === "company"
            ? { strategyId: companyStrategyId, scorecardWeight: null }
            : {}),
          // Store absolute value targets
          targetValue: request.targetValue,
          targetUnit: request.targetUnit,
          currentValue: request.currentValue || 0,
          kpiId: kpiId,
          priority: request.priority || "medium",
          startDate: request.startDate,
          endDate: request.endDate,
          assignedToId,
          createdById: createdById,
          // Company goals participate in BSC scoring only after weights are set.
          status: request.type === "company" ? "inactive" : "active",
          stage: "planning",
          // NEW: Enhanced Goal Definition Form Fields
          targetOperator: resolvedTargetOperator,
          isReverseKpi: resolvedIsReverseKpi,
          dataSourceModule: request.dataSourceModule,
          dataSourceField: request.dataSourceField,
          trackingFrequency: request.trackingFrequency,
          nextCheckDate: request.trackingFrequency ? this.calculateNextCheckDate(request.trackingFrequency) : null,
          ...(() => {
            const act = mergeContributionWeightIntoActivities(null, request.contributionWeightPercent);
            return act ? { activities: act as object } : {};
          })(),
          ...(scorecardPillarDb
            ? { scorecardPillar: scorecardPillarDb, pillarId: pillarIdDb ?? null }
            : {})
        },
        include: {
          kpi: {
            select: {
              id: true,
              name: true,
              unitCategory: true,
              unitSymbol: true,
              unitPosition: true,
              scorecardPillar: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        }
      });

      if (kpiId) {
        await KPIService.syncKpiActiveFromLinkedGoals(kpiId);
      }

      // If an individual goal is created directly under a department goal, auto-create the linked task.
      // (Breakdown endpoints already do this; this covers direct POST /api/performance/goals creates.)
      if (goal.type === "individual" && goal.parentGoal?.type === "department") {
        try {
          const { IndividualGoalToTaskService } = await import("./IndividualGoalToTaskService");
          await IndividualGoalToTaskService.convertIndividualGoalsToTasks(goal.id, createdById);
        } catch (taskError: any) {
          throw new Error(
            `Failed to create task for individual goal: ${taskError?.message ?? String(taskError)}`
          );
        }
      }

      // Note: Cascading is now manual - use createBreakdownGoals() method separately

      return goal;
    } catch (error) {
      throw error;
    }
  }

  // Create manual breakdown goals for selected departments
  static async createBreakdownGoals(parentGoalId: string, selectedDepartments: string[], breakdownData: any[]) {
    try {
      const parentGoal = await prisma.performanceGoal.findUnique({
        where: { id: parentGoalId }
      });

      if (!parentGoal) {
        throw new Error("Parent goal not found");
      }

      if (parentGoal.type !== "company") {
        throw new Error("Only company goals can be broken down to departments");
      }

      if (String(parentGoal.status).toLowerCase() !== "active") {
        throw new Error("Company goal must be active before breakdown into department goals.");
      }

      const createdGoals = [];

      for (let i = 0; i < selectedDepartments.length; i++) {
        const departmentName = selectedDepartments[i];
        const departmentData = breakdownData[i];

        const hasDeptOperator =
          departmentData.targetOperator !== undefined &&
          departmentData.targetOperator !== null &&
          String(departmentData.targetOperator).trim() !== "";
        const targetOperatorDept = hasDeptOperator
          ? departmentData.targetOperator
          : parentGoal.targetOperator;
        const isReverseKpiDept =
          typeof departmentData.isReverseKpi === "boolean"
            ? departmentData.isReverseKpi
            : hasDeptOperator
              ? String(departmentData.targetOperator).trim() === "<="
              : Boolean(parentGoal.isReverseKpi);

        const deptGoalStart = coerceGoalDateTime(
          departmentData.startDate,
          parentGoal.startDate,
          false
        );
        const performanceContractId = await ensureDepartmentPerformanceContractForGoal({
          departmentName,
          goalStart: deptGoalStart,
          createdById: parentGoal.createdById
        });

        const departmentAssigneeId = await resolveDefaultDepartmentGoalAssigneeId(departmentName);

        // Create department goal with specified target and fields
        const departmentGoal = await prisma.performanceGoal.create({
          data: {
            title: departmentData.title || `${departmentName} Goal: ${parentGoal.title}`,
            description: departmentData.description || `Department goal for ${departmentName} based on: ${parentGoal.title}`,
            type: "department",
            scorecardPillar: parentGoal.scorecardPillar,
            pillarId: parentGoal.pillarId,
            parentGoalId: parentGoalId,
            departmentName: departmentName, // Use hardcoded department name
            performanceContractId,
            targetValue: departmentData.targetValue,
            targetUnit: departmentData.targetUnit || parentGoal.targetUnit,
            currentValue: 0,
            kpiId: parentGoal.kpiId, // Copy KPI from parent goal
            priority: departmentData.priority || parentGoal.priority,
            startDate: deptGoalStart,
            endDate: coerceGoalDateTime(departmentData.endDate, parentGoal.endDate, true),
            assignedToId: departmentAssigneeId,
            createdById: parentGoal.createdById,
            status: "active",
            stage: "planning",
            // Enhanced Goal Definition Form Fields (operator / reverse align with parent unless overridden in breakdown row)
            targetOperator: targetOperatorDept,
            isReverseKpi: isReverseKpiDept,
            dataSourceModule: departmentData.dataSourceModule,
            dataSourceField: departmentData.dataSourceField,
            trackingFrequency: departmentData.trackingFrequency,
            ...(() => {
              const act = mergeContributionWeightIntoActivities(null, departmentData.contributionWeightPercent);
              return act ? { activities: act as object } : {};
            })()
          },
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            scorecardPillar: true,
            pillarId: true,
            parentGoalId: true,
            departmentName: true,
            targetValue: true,
            targetUnit: true,
            currentValue: true,
            progressPercentage: true,
            targetOperator: true,
            dataSourceModule: true,
            dataSourceField: true,
            trackingFrequency: true,
            lastCheckDate: true,
            nextCheckDate: true,
            kpiId: true,
            isReverseKpi: true,
            status: true,
            priority: true,
            stage: true,
            startDate: true,
            endDate: true,
            completedAt: true,
            assignedToId: true,
            createdById: true,
            activities: true,
            createdAt: true,
            updatedAt: true
            // Exclude monetaryValue, percentValue, monetaryValueAchieved, percentValueAchieved
          }
        });

        createdGoals.push(departmentGoal);
        console.log(`✅ Created department goal for ${departmentName}: ${departmentGoal.id}`);
        if (parentGoal.kpiId) {
          await KPIService.syncKpiActiveFromLinkedGoals(parentGoal.kpiId);
        }
      }

      return createdGoals;
    } catch (error) {
      throw error;
    }
  }

  // Create individual goals for selected users in a department
  static async createIndividualGoals(
    departmentGoalId: string,
    selectedUsers: string[],
    individualData: any[],
    options?: { actingUserId?: string | null }
  ) {
    const breakdownLogTag = "[performance-breakdown:individuals]";
    try {
      console.log(
        breakdownLogTag,
        "createIndividualGoals:start",
        JSON.stringify({
          departmentGoalId,
          userCount: selectedUsers.length,
          rowCount: individualData.length,
          actingUserId: options?.actingUserId ?? null
        })
      );

      const departmentGoal = await prisma.performanceGoal.findUnique({
        where: { id: departmentGoalId }
      });

      if (!departmentGoal) {
        console.warn(breakdownLogTag, "abort: department goal not found", departmentGoalId);
        throw new Error("Department goal not found");
      }

      if (departmentGoal.type !== "department") {
        console.warn(
          breakdownLogTag,
          "abort: parent goal type is not department",
          JSON.stringify({ id: departmentGoal.id, type: departmentGoal.type })
        );
        throw new Error("Only department goals can be broken down to individuals");
      }

      if (String(departmentGoal.status).toLowerCase() !== "active") {
        console.warn(
          breakdownLogTag,
          "abort: department goal not active",
          JSON.stringify({ id: departmentGoal.id, status: departmentGoal.status })
        );
        throw new Error("Department goal must be active before creating individual goals.");
      }

      console.log(
        breakdownLogTag,
        "department goal OK",
        JSON.stringify({
          id: departmentGoal.id,
          title: departmentGoal.title,
          departmentName: departmentGoal.departmentName,
          createdById: departmentGoal.createdById,
          kpiId: departmentGoal.kpiId ?? null
        })
      );

      const createdGoals = [];

      for (let i = 0; i < selectedUsers.length; i++) {
        const userId = selectedUsers[i];
        const userData = individualData[i];
        console.log(
          breakdownLogTag,
          `loop i=${i}`,
          JSON.stringify({
            assignedUserId: userId,
            rowTitle: userData?.title ?? null,
            targetValue: userData?.targetValue ?? null,
            targetUnit: userData?.targetUnit ?? null
          })
        );

        const hasUserOperator =
          userData.targetOperator !== undefined &&
          userData.targetOperator !== null &&
          String(userData.targetOperator).trim() !== "";
        const targetOperatorUser = hasUserOperator
          ? userData.targetOperator
          : departmentGoal.targetOperator;
        const isReverseKpiUser =
          typeof userData.isReverseKpi === "boolean"
            ? userData.isReverseKpi
            : hasUserOperator
              ? String(userData.targetOperator).trim() === "<="
              : Boolean(departmentGoal.isReverseKpi);

        // Create individual goal with specified target and fields
        const individualGoal = await prisma.performanceGoal.create({
          data: {
            title: userData.title || `Individual Goal: ${departmentGoal.title}`,
            description: userData.description || `Individual goal based on: ${departmentGoal.title}`,
            type: "individual",
            scorecardPillar: departmentGoal.scorecardPillar,
            pillarId: departmentGoal.pillarId,
            parentGoalId: departmentGoalId,
            departmentName: departmentGoal.departmentName, // Use same department name
            targetValue: userData.targetValue,
            targetUnit: userData.targetUnit || departmentGoal.targetUnit,
            currentValue: 0,
            kpiId: departmentGoal.kpiId, // Copy KPI from department goal
            priority: userData.priority || departmentGoal.priority,
            startDate: coerceGoalDateTime(userData.startDate, departmentGoal.startDate, false),
            endDate: coerceGoalDateTime(userData.endDate, departmentGoal.endDate, true),
            assignedToId: userId,
            createdById: departmentGoal.createdById,
            status: "active",
            stage: "planning",
            // Enhanced Goal Definition Form Fields (operator / reverse align with department parent unless overridden)
            targetOperator: targetOperatorUser,
            isReverseKpi: isReverseKpiUser,
            dataSourceModule: userData.dataSourceModule,
            dataSourceField: userData.dataSourceField,
            trackingFrequency: userData.trackingFrequency,
            ...(() => {
              const act = mergeContributionWeightIntoActivities(null, userData.contributionWeightPercent);
              return act ? { activities: act as object } : {};
            })()
          }
        });

        console.log(`✅ Created individual goal for user ${userId}: ${individualGoal.id}`);
        console.log(
          breakdownLogTag,
          "individual goal persisted; starting task conversion",
          JSON.stringify({ individualGoalId: individualGoal.id, assignedToId: individualGoal.assignedToId })
        );

        if (departmentGoal.kpiId) {
          await KPIService.syncKpiActiveFromLinkedGoals(departmentGoal.kpiId);
        }

        // Automatically create task for the individual goal (manager/caller as task creator when provided)
        try {
          const { IndividualGoalToTaskService } = await import('./IndividualGoalToTaskService');
          await IndividualGoalToTaskService.convertIndividualGoalsToTasks(
            individualGoal.id,
            options?.actingUserId
          );
          console.log(`✅ Automatically created task for individual goal: ${individualGoal.id}`);
          createdGoals.push(individualGoal);
        } catch (taskError: any) {
          console.error(
            breakdownLogTag,
            "task conversion failed for individual goal",
            individualGoal.id,
            taskError?.message ?? taskError
          );
          console.error(`❌ Failed to create task for individual goal ${individualGoal.id}:`, taskError);
          try {
            await prisma.performanceGoal.delete({ where: { id: individualGoal.id } });
          } catch (cleanupErr) {
            console.error(
              `❌ Failed to cleanup individual goal ${individualGoal.id} after task creation failure:`,
              cleanupErr
            );
          }
          throw new Error(
            `Individual goal was created but linked task failed: ${taskError?.message ?? String(taskError)}`
          );
        }
      }

      return createdGoals;
    } catch (error) {
      throw error;
    }
  }

  // Get all performance goals with filtering
  static async getAllPerformanceGoals(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.departmentName) {
        where.departmentName = filters.departmentName;
      }

      if (filters.assignedToId) {
        where.assignedToId = filters.assignedToId;
      }

      if (filters.parentGoalId) {
        where.parentGoalId = filters.parentGoalId;
      }

      if (filters.kpiId) {
        where.kpiId = filters.kpiId;
      }

      if (filters.strategicThemeId) {
        where.strategicThemeId = filters.strategicThemeId;
      }

      if (Array.isArray(filters.goalIds) && filters.goalIds.length) {
        where.id = { in: filters.goalIds };
      }

      if (filters.scorecardPillar) {
        where.scorecardPillar = filters.scorecardPillar;
      }

      if (filters.pillarId) {
        where.pillarId = filters.pillarId;
      }

      if (filters.search) {
        // MySQL doesn't support mode: 'insensitive', so we use case-insensitive search via SQL
        const searchLower = filters.search.toLowerCase();
        where.OR = [
          { title: { contains: filters.search } },
          { description: { contains: filters.search } }
        ];
      }

      const goals = await prisma.performanceGoal.findMany({
        where,
        include: {
          kpi: {
            select: {
              id: true,
              name: true,
              unitCategory: true,
              unitSymbol: true,
              unitPosition: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          strategicTheme: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true,
              status: true
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return goals.map((goal) => withGoalAttachmentFields(goal));
    } catch (error) {
      throw error;
    }
  }

  /** Fetch goals linked to a specific KPI id (same shape as GET /performance/goals). */
  static async getGoalsByKpiId(kpiId: string) {
    const id = String(kpiId || "").trim();
    if (!id) throw new Error("kpiId is required");
    return this.getAllPerformanceGoals({ kpiId: id });
  }

  /**
   * Same response shape as **GET /api/performance/goals?strategicThemeId=…** (KPI, parent, `strategicTheme` with
   * name/color, `scorecardPillar`, `departmentName`, `type`, subGoals counts, etc.) for org + dept + individual.
   */
  static async getGoalsByStrategicTheme(themeId: string) {
    const theme = await prisma.performanceTheme.findUnique({ where: { id: themeId } });
    if (!theme) {
      throw new Error("Theme not found.");
    }
    return this.getAllPerformanceGoals({ strategicThemeId: themeId });
  }

  /**
   * Full list rows for a set of goal ids (e.g. after tag response) — same include as `getAllPerformanceGoals`.
   */
  static async getPerformanceGoalsByIds(goalIds: string[]) {
    if (!goalIds || goalIds.length === 0) {
      return [];
    }
    return this.getAllPerformanceGoals({ goalIds });
  }

  // Get performance goal by ID
  static async getPerformanceGoalById(id: string) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id },
        include: {
          kpi: {
            select: {
              id: true,
              name: true,
              unitCategory: true,
              unitSymbol: true,
              unitPosition: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          strategicTheme: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true,
              status: true
            }
          },
          subGoals: {
            include: {
              assignedTo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          tasks: {
            include: {
              creator: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!goal) {
        throw new Error("Performance goal not found");
      }

      return withGoalAttachmentFields(goal);
    } catch (error) {
      throw error;
    }
  }

  // Update performance goal
  static async updatePerformanceGoal(id: string, request: UpdatePerformanceGoalRequest) {
    try {
      const existingGoal = await prisma.performanceGoal.findUnique({
        where: { id }
      });

      if (!existingGoal) {
        throw new Error("Performance goal not found");
      }

      // Validate KPI if provided
      if (request.kpiId) {
        const kpi = await prisma.kPI.findUnique({
          where: { id: request.kpiId }
        });

        if (!kpi) {
          throw new Error("KPI not found");
        }
      }

      const companyPillarMsg =
        'Organisational (company) goals require scorecardPillar: Financial, Customer & Market, Internal Operations, or Learning, Growth & HR (or FINANCIAL, CUSTOMER, INTERNAL_OPS, LEARNING_GROWTH).';
      const nextType = request.type ?? existingGoal.type;
      const pillarData: { scorecardPillar?: string | null; pillarId?: string | null } = {};
      if (nextType === "company") {
        const raw =
          request.scorecardPillar !== undefined
            ? request.scorecardPillar
            : existingGoal.scorecardPillar;
        const normalized = normalizeOrgBscScorecardPillar(raw);
        if (!normalized) {
          throw new Error(companyPillarMsg);
        }
        await ScorecardPillarService.assertCanonicalExists(normalized);
        pillarData.scorecardPillar = normalized;
        pillarData.pillarId = ORG_BSC_CANONICAL_TO_PILLAR_ID[normalized] ?? null;
      } else if (existingGoal.type === "company" && nextType !== "company") {
        pillarData.scorecardPillar = null;
        pillarData.pillarId = null;
      } else if (request.scorecardPillar !== undefined) {
        const normalized = normalizeOrgBscScorecardPillar(request.scorecardPillar);
        if (normalized) {
          await ScorecardPillarService.assertCanonicalExists(normalized);
        }
        pillarData.scorecardPillar = normalized;
        pillarData.pillarId = normalized ? ORG_BSC_CANONICAL_TO_PILLAR_ID[normalized] ?? null : null;
      }

      const activitiesPatch = mergeContributionWeightIntoActivities(
        existingGoal.activities,
        request.contributionWeightPercent
      );

      let activitiesForUpdate: Record<string, unknown> | null = activitiesPatch;
      if (request.stretchTargetValue != null) {
        const st = Number(request.stretchTargetValue);
        if (Number.isFinite(st) && st > 0) {
          const base =
            activitiesPatch ||
            (existingGoal.activities != null &&
            typeof existingGoal.activities === "object" &&
            !Array.isArray(existingGoal.activities)
              ? { ...(existingGoal.activities as Record<string, unknown>) }
              : Array.isArray(existingGoal.activities)
                ? { entries: existingGoal.activities as unknown[] }
                : {});
          activitiesForUpdate = { ...base, stretchTargetValue: st };
        }
      }

      let kpiNameForInference: string | null = null;
      let linkedKpiIsReverse: boolean | undefined;
      let linkedKpiAccountType: string | null = null;
      const effectiveKpiId = request.kpiId ?? existingGoal.kpiId;
      if (effectiveKpiId) {
        const k = await prisma.kPI.findUnique({
          where: { id: effectiveKpiId },
          select: { name: true, isReverseKpi: true, accountType: true },
        });
        kpiNameForInference = k?.name || null;
        linkedKpiAccountType = k?.accountType ?? null;
        if (k) linkedKpiIsReverse = k.isReverseKpi;
      }

      const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(
        kpiNameForInference,
        request.title ?? existingGoal.title,
        linkedKpiAccountType
      );
      const resolvedIsReverseKpi =
        request.isReverseKpi !== undefined
          ? request.isReverseKpi
          : linkedKpiIsReverse === true
            ? true
            : request.targetOperator !== undefined
              ? String(request.targetOperator).trim() === "<="
              : inferredReverseFromKpi;
      const reversePatch = { isReverseKpi: resolvedIsReverseKpi };
      const targetOperatorPatch =
        request.targetOperator !== undefined
          ? { targetOperator: request.targetOperator }
          : resolvedIsReverseKpi
            ? { targetOperator: "<=" }
            : { targetOperator: ">=" };

      // Update the goal
      const updatedGoal = await prisma.performanceGoal.update({
        where: { id },
        data: {
          ...pillarData,
          ...(request.title && { title: request.title }),
          ...(request.description !== undefined && { description: request.description }),
          ...(request.type && { type: request.type }),
          ...(request.monetaryValue !== undefined && { monetaryValue: request.monetaryValue }),
          ...(request.percentValue !== undefined && { percentValue: request.percentValue }),
          ...(request.monetaryValueAchieved !== undefined && { monetaryValueAchieved: request.monetaryValueAchieved }),
          ...(request.percentValueAchieved !== undefined && { percentValueAchieved: request.percentValueAchieved }),
          ...(request.kpiId && { kpiId: request.kpiId }),
          ...(request.priority && { priority: request.priority }),
          ...(request.status && { status: request.status }),
          ...(request.stage && { stage: request.stage }),
          ...(request.startDate && { startDate: request.startDate }),
          ...(request.endDate && { endDate: request.endDate }),
          ...(request.assignedToId && { assignedToId: request.assignedToId }),
          ...targetOperatorPatch,
          ...(request.targetValue !== undefined && { targetValue: request.targetValue }),
          ...(request.targetUnit !== undefined && { targetUnit: request.targetUnit }),
          ...(request.currentValue !== undefined && {
            currentValue: request.currentValue,
            preciseCurrentValue: String(request.currentValue)
          }),
          ...(request.dataSourceModule !== undefined && { dataSourceModule: request.dataSourceModule }),
          ...(request.dataSourceField !== undefined && { dataSourceField: request.dataSourceField }),
          ...(request.trackingFrequency !== undefined && { trackingFrequency: request.trackingFrequency }),
          ...reversePatch,
          ...(activitiesForUpdate && { activities: activitiesForUpdate as object })
        },
        include: {
          kpi: {
            select: {
              id: true,
              name: true,
              unitCategory: true,
              unitSymbol: true,
              unitPosition: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        }
      });

      if (existingGoal.kpiId !== updatedGoal.kpiId) {
        if (existingGoal.kpiId) await KPIService.syncKpiActiveFromLinkedGoals(existingGoal.kpiId);
        if (updatedGoal.kpiId) await KPIService.syncKpiActiveFromLinkedGoals(updatedGoal.kpiId);
      }

      await this.refreshPerformanceRiskZoneOnGoal(id);
      if (updatedGoal.parentGoalId) {
        await this.updateParentGoalProgress(updatedGoal.parentGoalId);
      }

      return (
        (await prisma.performanceGoal.findUnique({
          where: { id },
          include: {
            kpi: {
              select: {
                id: true,
                name: true,
                unitCategory: true,
                unitSymbol: true,
                unitPosition: true
              }
            },
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            parentGoal: {
              select: {
                id: true,
                title: true,
                type: true
              }
            },
            subGoals: {
              select: {
                id: true,
                title: true,
                type: true,
                status: true,
                stage: true
              }
            },
            _count: {
              select: {
                subGoals: true,
                tasks: true
              }
            }
          }
        })) || updatedGoal
      );
    } catch (error) {
      throw error;
    }
  }

  // Delete performance goal
  static async deletePerformanceGoal(id: string) {
    try {
      const existingGoal = await prisma.performanceGoal.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        }
      });

      if (!existingGoal) {
        throw new Error("Performance goal not found");
      }

      // Check if goal has sub-goals or tasks
      if (existingGoal._count.subGoals > 0) {
        throw new Error("Cannot delete goal with sub-goals");
      }

      if (existingGoal._count.tasks > 0) {
        throw new Error("Cannot delete goal with associated tasks");
      }

      await prisma.performanceGoal.delete({
        where: { id }
      });

      if (existingGoal.kpiId) {
        await KPIService.syncKpiActiveFromLinkedGoals(existingGoal.kpiId);
      }

      if (existingGoal.parentGoalId) {
        await this.updateParentGoalProgress(existingGoal.parentGoalId);
      }

      return { message: "Performance goal deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  static async uploadGoalAttachmentBase64(
    goalId: string,
    payload: { fileName: string; contentBase64: string; mimeType?: string },
    actorId: string
  ) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      select: {
        id: true,
        activities: true
      }
    });

    if (!goal) {
      throw new Error("Performance goal not found");
    }

    const safeFileName = String(payload.fileName || "").trim();
    if (!safeFileName) {
      throw new Error("fileName is required");
    }

    const fileBuffer = decodeGoalAttachmentBase64(payload.contentBase64);
    const uploaded = await FirebaseStorageService.uploadApplicationDocument(
      fileBuffer,
      safeFileName,
      goal.id,
      "PERFORMANCE_GOAL_ATTACHMENT"
    );

    const attachment = {
      fileName: safeFileName,
      fileUrl: uploaded.downloadURL,
      filePath: uploaded.filePath,
      fileSize: fileBuffer.length,
      mimeType: payload.mimeType || null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: actorId
    };

    const baseActivities =
      goal.activities != null && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : Array.isArray(goal.activities)
          ? { entries: goal.activities as unknown[] }
          : {};
    const currentAttachments = Array.isArray((baseActivities as any).attachments)
      ? ((baseActivities as any).attachments as unknown[])
      : [];
    const mergedAttachments = [...currentAttachments, attachment];
    const nextActivities = {
      ...baseActivities,
      attachments: mergedAttachments
    };

    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        activities: nextActivities as object,
        updatedAt: new Date()
      }
    });

    return {
      goalId: goal.id,
      attachment,
      attachments: mergedAttachments
    };
  }

  static async uploadGoalAttachments(
    goalId: string,
    files: any[],
    actorId: string
  ) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      select: { id: true, activities: true }
    });
    if (!goal) {
      throw new Error("Performance goal not found");
    }
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("At least one attachment is required");
    }

    const uploads = await Promise.all(
      files.map(async (file: any) => {
        if ((file?.size || 0) > 5 * 1024 * 1024) {
          throw new Error("Attachment exceeds 5MB limit");
        }
        const uploaded = await FirebaseStorageService.uploadApplicationDocument(
          file.buffer,
          file.originalname,
          goal.id,
          "PERFORMANCE_GOAL_ATTACHMENT"
        );
        return {
          fileName: file.originalname,
          fileUrl: uploaded.downloadURL,
          filePath: uploaded.filePath,
          fileSize: file.size || null,
          mimeType: file.mimetype || null,
          uploadedAt: new Date().toISOString(),
          uploadedBy: actorId
        };
      })
    );

    const baseActivities =
      goal.activities != null && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : Array.isArray(goal.activities)
          ? { entries: goal.activities as unknown[] }
          : {};
    const currentAttachments = Array.isArray((baseActivities as any).attachments)
      ? ((baseActivities as any).attachments as unknown[])
      : [];
    const mergedAttachments = [...currentAttachments, ...uploads];
    const nextActivities = { ...baseActivities, attachments: mergedAttachments };

    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        activities: nextActivities as object,
        updatedAt: new Date()
      }
    });

    return {
      goalId: goal.id,
      attachments: mergedAttachments,
      attachmentUrls: mergedAttachments
        .map((a: any) => a?.fileUrl)
        .filter((u: any) => typeof u === "string" && u.length > 0)
    };
  }

  // Get performance goal statistics
  static async getPerformanceGoalStatistics() {
    try {
      const [
        totalGoals,
        companyGoals,
        departmentGoals,
        individualGoals,
        activeGoals,
        completedGoals
      ] = await Promise.all([
        prisma.performanceGoal.count(),
        prisma.performanceGoal.count({ where: { type: "company" } }),
        prisma.performanceGoal.count({ where: { type: "department" } }),
        prisma.performanceGoal.count({ where: { type: "individual" } }),
        prisma.performanceGoal.count({ where: { status: "active" } }),
        prisma.performanceGoal.count({ where: { status: "completed" } })
      ]);

      // Get goals by scorecard pillar (BSC)
      const goalsByScorecardPillar = await prisma.performanceGoal.groupBy({
        by: ["scorecardPillar"],
        _count: {
          id: true
        }
      });

      // Get goals by department
      const goalsByDepartment = await prisma.performanceGoal.groupBy({
        by: ['departmentName'],
        _count: {
          id: true
        },
        where: {
          departmentName: { not: null }
        }
      });

      return {
        totalGoals,
        companyGoals,
        departmentGoals,
        individualGoals,
        activeGoals,
        completedGoals,
        goalsByScorecardPillar,
        goalsByDepartment
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Resolve the KPI used for payroll→goal sync. Prefer catalog `PAYROLL_EXPENSE`, then exact / fuzzy name match
   * (seeded DBs sometimes rename the display label slightly).
   */
  static async resolvePayrollExpenseKpiForSync() {
    const byCode = await prisma.kPI.findFirst({ where: { code: "PAYROLL_EXPENSE" } });
    if (byCode) return byCode;
    const byLegacyName = await prisma.kPI.findFirst({ where: { name: "Payroll Expense" } });
    if (byLegacyName) return byLegacyName;
    const pool = await prisma.kPI.findMany({
      where: {
        OR: [
          { name: { contains: "Payroll" } },
          { catalogDescription: { contains: "payroll" } }
        ]
      },
      take: 40
    });
    const norm = (s: string) => String(s || "").toLowerCase();
    return (
      pool.find((k) => norm(k.name).includes("payroll") && norm(k.name).includes("expense")) ||
      pool.find((k) => norm(k.name).includes("payroll") && norm(k.name).includes("gross")) ||
      null
    );
  }

  /**
   * Re-sum all completed payroll runs per goal window and apply reverse-KPI progress.
   * Use for backfill when stored progress used straight-KPI math.
   */
  static async refreshAllPayrollExpenseGoals(createdById: string): Promise<void> {
    const payrollKPI = await PerformanceGoalService.resolvePayrollExpenseKpiForSync();
    if (!payrollKPI) {
      console.log(
        "⚠️ Payroll Expense KPI not found (expected `code` PAYROLL_EXPENSE). Skipping refresh."
      );
      return;
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        OR: [{ kpiId: payrollKPI.id }, { formulaType: "PAYROLL_EXPENSE" }],
        status: { in: ["active", "completed", "in_progress"] }
      },
      select: {
        id: true,
        title: true,
        targetValue: true,
        currentValue: true,
        startDate: true,
        endDate: true,
        monetaryValue: true,
        kpiId: true,
        completedAt: true,
        parentGoalId: true,
        isReverseKpi: true,
        targetOperator: true,
        preciseTargetValue: true,
        allowableVariance: true,
        progressPercentage: true,
        stage: true
      }
    });

    console.log(`🔄 Refreshing ${goals.length} payroll-linked goal(s) (reverse-KPI aware)...`);

    for (const goal of goals) {
      const goalStartDate = new Date(goal.startDate);
      const goalEndDate = new Date(goal.endDate);

      const relevantPayrollRuns = await prisma.payrollRun.findMany({
        where: {
          status: "COMPLETED",
          startDate: { lte: goalEndDate },
          endDate: { gte: goalStartDate }
        },
        select: { totalGrossPay: true }
      });

      let totalPayrollExpense = new Decimal(0);
      for (const run of relevantPayrollRuns) {
        if (run.totalGrossPay) {
          totalPayrollExpense = totalPayrollExpense.add(run.totalGrossPay);
        }
      }

      await PerformanceGoalService.applyPayrollExpenseTotalToGoal(
        goal,
        payrollKPI,
        parseFloat(totalPayrollExpense.toString()),
        createdById
      );
    }

    console.log("✅ Payroll expense goal refresh completed");
  }

  /**
   * Push posted GL totals onto company-level financial KPI goals for a period, then roll up parents.
   */
  static async refreshFinancialGoalsFromGl(input: {
    periodStart: Date;
    periodEnd: Date;
    kpiCodes?: string[];
    createdById: string;
  }): Promise<void> {
    const codes = (input.kpiCodes?.length ? input.kpiCodes : ["TOTAL_REVENUE", "NET_PROFIT"]).map((c) =>
      String(c).toUpperCase()
    );
    const glTotals = await getPostedPeriodRevenueExpenseNetProfit(input.periodStart, input.periodEnd);

    for (const code of codes) {
      if (code === "PAYROLL_EXPENSE") {
        await PerformanceGoalService.refreshAllPayrollExpenseGoals(input.createdById);
        continue;
      }

      let glValue: number | null = null;
      if (code === "TOTAL_REVENUE") glValue = glTotals.revenue;
      else if (code === "NET_PROFIT") glValue = glTotals.netProfit;
      else {
        console.log(`⚠️ refreshFinancialGoalsFromGl: unsupported KPI code ${code}, skipping`);
        continue;
      }

      const kpi = await prisma.kPI.findFirst({
        where: { code, isActive: true },
        select: { id: true, name: true, accountType: true, isReverseKpi: true, code: true }
      });
      if (!kpi) {
        console.log(`⚠️ KPI ${code} not found — skipping GL sync`);
        continue;
      }

      const goals = await prisma.performanceGoal.findMany({
        where: {
          kpiId: kpi.id,
          type: "company",
          status: { in: ["active", "completed", "in_progress"] }
        },
        select: {
          id: true,
          title: true,
          targetValue: true,
          currentValue: true,
          startDate: true,
          endDate: true,
          monetaryValue: true,
          kpiId: true,
          completedAt: true,
          parentGoalId: true,
          isReverseKpi: true,
          targetOperator: true,
          preciseTargetValue: true,
          allowableVariance: true,
          progressPercentage: true,
          stage: true
        }
      });

      console.log(`🔄 GL sync ${code}: ${goals.length} company goal(s), value=${glValue}`);

      for (const goal of goals) {
        const goalStart = new Date(goal.startDate);
        const goalEnd = new Date(goal.endDate);
        if (!dateRangesOverlap(goalStart, goalEnd, input.periodStart, input.periodEnd)) {
          console.log(`⏭️ Skipping ${goal.title} — period does not overlap goal window`);
          continue;
        }

        await PerformanceGoalService.applyFinancialGlValueToGoal(
          goal,
          kpi,
          glValue,
          input.createdById,
          input.periodStart,
          input.periodEnd,
          code
        );
      }
    }

    console.log("✅ Financial GL goal refresh completed");
  }

  private static async applyFinancialGlValueToGoal(
    goal: {
      id: string;
      title: string;
      targetValue: unknown;
      currentValue: unknown;
      startDate: Date;
      endDate: Date;
      monetaryValue: unknown;
      kpiId: string | null;
      completedAt: Date | null;
      parentGoalId: string | null;
      isReverseKpi: boolean | null;
      targetOperator: string | null;
      preciseTargetValue: unknown;
      allowableVariance: unknown;
      progressPercentage: unknown;
      stage: string | null;
    },
    kpi: { name: string; accountType: string | null; isReverseKpi: boolean | null; code: string | null },
    glValue: number,
    createdById: string,
    periodStart: Date,
    periodEnd: Date,
    kpiCode: string
  ): Promise<void> {
    const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(
      kpi.name,
      goal.title,
      kpi.accountType
    );
    const effectiveIsReverseKpi =
      goal.isReverseKpi === true || goal.isReverseKpi === false
        ? goal.isReverseKpi
        : kpi.isReverseKpi === true
          ? true
          : kpi.isReverseKpi === false
            ? false
            : inferredReverseFromKpi;
    const effectiveTargetOperator =
      goal.targetOperator !== undefined && goal.targetOperator !== null && goal.targetOperator !== ""
        ? goal.targetOperator
        : effectiveIsReverseKpi
          ? "<="
          : ">=";

    const progressState = deriveGoalProgressState({
      currentValue: glValue,
      targetValue: goal.targetValue,
      targetOperator: effectiveTargetOperator,
      isReverseKpi: effectiveIsReverseKpi,
      previousStage: goal.stage,
      progressPercentage: goal.progressPercentage
    });
    const isCompleted = progressState.isTargetMet;
    const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
    const monetaryValue = goal.monetaryValue ? parseFloat(goal.monetaryValue.toString()) : targetValue;

    const performanceRiskZone = resolveGoalEscalationStatus({
      preciseCurrentValue: String(glValue),
      currentValue: glValue,
      preciseTargetValue: goal.preciseTargetValue,
      targetValue: goal.targetValue,
      allowableVariance: goal.allowableVariance,
      isReverseKpi: effectiveIsReverseKpi,
      endDate: goal.endDate as Date
    });

    const updatedGoal = await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        ...(goal.isReverseKpi == null && effectiveIsReverseKpi ? { isReverseKpi: true } : {}),
        ...(goal.targetOperator == null && effectiveIsReverseKpi ? { targetOperator: "<=" } : {}),
        currentValue: glValue,
        preciseCurrentValue: String(glValue),
        monetaryValue,
        monetaryValueAchieved: glValue,
        progressPercentage: progressState.progressPercentage,
        performanceRiskZone,
        performanceRiskZoneAt: new Date(),
        status: progressState.status,
        stage: progressState.stage,
        completedAt: isCompleted ? goal.completedAt ?? new Date() : null,
        syncConfig: {
          source: "posted_journal_lines",
          glKpiCode: kpiCode,
          glPeriodStart: periodStart.toISOString(),
          glPeriodEnd: periodEnd.toISOString(),
          glSyncedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      }
    });

    if (isCompleted && goal.kpiId) {
      await PerformanceGoalService.triggerAccountingIntegration(goal.id, glValue, createdById);
    }

    if (goal.kpiId) {
      await PerformanceGoalService.recalculateKPIProgress(goal.kpiId).catch((e) =>
        console.error(`[GL sync] KPI recalc failed for ${goal.kpiId}:`, e)
      );
    }

    if (goal.parentGoalId) {
      await PerformanceGoalService.updateParentGoalProgress(goal.parentGoalId).catch((err) =>
        console.warn(`[GL sync] parent rollup failed for ${goal.id}:`, err?.message)
      );
    }

    console.log(
      `✅ GL sync goal ${updatedGoal.title}: ${glValue} → ${progressState.progressPercentage}% (${progressState.stage})`
    );
  }

  private static async applyPayrollExpenseTotalToGoal(
    goal: {
      id: string;
      title: string;
      targetValue: unknown;
      currentValue: unknown;
      startDate: Date;
      endDate: Date;
      monetaryValue: unknown;
      kpiId: string | null;
      completedAt: Date | null;
      parentGoalId: string | null;
      isReverseKpi: boolean | null;
      targetOperator: string | null;
      preciseTargetValue: unknown;
      allowableVariance: unknown;
      progressPercentage: unknown;
      stage: string | null;
    },
    payrollKPI: { name: string; accountType: string | null; isReverseKpi: boolean | null },
    totalPayrollValue: number,
    createdById: string
  ): Promise<void> {
    const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;

    const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(
      payrollKPI.name,
      goal.title,
      payrollKPI.accountType
    );
    const effectiveIsReverseKpi =
      goal.isReverseKpi === true || goal.isReverseKpi === false
        ? goal.isReverseKpi
        : payrollKPI.isReverseKpi === true
          ? true
          : payrollKPI.isReverseKpi === false
            ? false
            : inferredReverseFromKpi;
    const effectiveTargetOperator =
      goal.targetOperator !== undefined && goal.targetOperator !== null && goal.targetOperator !== ""
        ? goal.targetOperator
        : effectiveIsReverseKpi
          ? "<="
          : ">=";

    const progressState = deriveGoalProgressState({
      currentValue: totalPayrollValue,
      targetValue: goal.targetValue,
      targetOperator: effectiveTargetOperator,
      isReverseKpi: effectiveIsReverseKpi,
      previousStage: goal.stage,
      progressPercentage: goal.progressPercentage
    });
    const isCompleted = progressState.isTargetMet;

    const monetaryValue = goal.monetaryValue ? parseFloat(goal.monetaryValue.toString()) : targetValue;

    const performanceRiskZone = resolveGoalEscalationStatus({
      preciseCurrentValue: String(totalPayrollValue),
      currentValue: totalPayrollValue,
      preciseTargetValue: goal.preciseTargetValue,
      targetValue: goal.targetValue,
      allowableVariance: goal.allowableVariance,
      isReverseKpi: effectiveIsReverseKpi,
      endDate: goal.endDate as Date
    });

    const updatedGoal = await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        ...(goal.isReverseKpi == null && effectiveIsReverseKpi ? { isReverseKpi: true } : {}),
        ...(goal.targetOperator == null && effectiveIsReverseKpi ? { targetOperator: "<=" } : {}),
        currentValue: totalPayrollValue,
        preciseCurrentValue: String(totalPayrollValue),
        monetaryValue,
        monetaryValueAchieved: totalPayrollValue,
        progressPercentage: progressState.progressPercentage,
        performanceRiskZone,
        status: progressState.status,
        stage: progressState.stage,
        completedAt: isCompleted ? goal.completedAt ?? new Date() : null,
        updatedAt: new Date()
      },
      include: {
        parentGoal: { select: { id: true } }
      }
    });

    await PerformanceGoalService.refreshPerformanceRiskZoneOnGoal(goal.id).catch(() => undefined);

    console.log(
      `   ✅ Updated goal "${goal.title}": $${totalPayrollValue.toFixed(2)}/$${targetValue.toFixed(2)} (${progressPercentage.toFixed(1)}%, reverse=${effectiveIsReverseKpi}, completed=${isCompleted})`
    );

    // Do not roll up payroll expense totals to parents here — each linked goal receives the
    // same gross-pay aggregate; parent rollup would overwrite the company goal with weighted child %.

    if (goal.kpiId) {
      try {
        await PerformanceGoalService.recalculateKPIProgress(goal.kpiId);
      } catch (kpiError) {
        console.error(`   ⚠️ Failed to recalculate KPI progress for ${goal.kpiId}:`, kpiError);
      }
    }
  }

  /**
   * Sync payroll data to performance goals linked to Payroll Expense KPI
   * Called after payroll run is processed to update goal progress
   */
  static async syncPayrollToGoals(payrollRunId: string, totalGrossPay: Decimal, createdById: string): Promise<void> {
    try {
      console.log('🔄 Syncing payroll data to performance goals...');
      console.log(`   Payroll Run ID: ${payrollRunId}`);
      console.log(`   Total Gross Pay: ${totalGrossPay.toString()}`);

      const payrollKPI = await PerformanceGoalService.resolvePayrollExpenseKpiForSync();

      if (!payrollKPI) {
        console.log(
          '⚠️ Payroll Expense KPI not found (expected `code` PAYROLL_EXPENSE or name containing "Payroll" + "Expense"). Skipping goal sync.'
        );
        return;
      }

      console.log(`   Found Payroll Expense KPI: ${payrollKPI.id} (${payrollKPI.name}${payrollKPI.code ? `, code=${payrollKPI.code}` : ""})`);

      // Get payroll run to check date range
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        select: {
          endDate: true,
          startDate: true
        }
      });

      if (!payrollRun) {
        console.log('⚠️ Payroll run not found. Skipping goal sync.');
        return;
      }

      const payrollStartDate = new Date(payrollRun.startDate);
      const payrollEndDate = new Date(payrollRun.endDate);

      // Company payroll total applies to root goals only; sub-goals track contributions/tasks.
      const goals = await prisma.performanceGoal.findMany({
        where: {
          OR: [{ kpiId: payrollKPI.id }, { formulaType: "PAYROLL_EXPENSE" }],
          parentGoalId: null,
          status: {
            in: ['active', 'completed', 'in_progress']
          }
        },
        select: {
          id: true,
          title: true,
          targetValue: true,
          currentValue: true,
          startDate: true,
          endDate: true,
          monetaryValue: true,
          kpiId: true,
          completedAt: true,
          parentGoalId: true,
          isReverseKpi: true,
          targetOperator: true,
          preciseTargetValue: true,
          allowableVariance: true,
          progressPercentage: true,
          stage: true
        }
      });

      console.log(`   Found ${goals.length} goal(s) linked to Payroll Expense KPI`);

      // Update each goal
      for (const goal of goals) {
        const goalStartDate = new Date(goal.startDate);
        const goalEndDate = new Date(goal.endDate);

        // Require **interval overlap** between payroll run and goal (not only payroll end inside goal)
        if (!dateRangesOverlap(payrollStartDate, payrollEndDate, goalStartDate, goalEndDate)) {
          console.log(
            `   ⏭️ Skipping goal "${goal.title}" — payroll run [${payrollStartDate.toISOString()} .. ${payrollEndDate.toISOString()}] does not overlap goal [${goalStartDate.toISOString()} .. ${goalEndDate.toISOString()}]`
          );
          continue;
        }

        // Sum all COMPLETED payroll runs whose pay period **overlaps** the goal window
        const relevantPayrollRuns = await prisma.payrollRun.findMany({
          where: {
            status: 'COMPLETED',
            startDate: { lte: goalEndDate },
            endDate: { gte: goalStartDate }
          },
          select: {
            totalGrossPay: true
          }
        });

        let totalPayrollExpense = new Decimal(0);
        for (const run of relevantPayrollRuns) {
          if (run.totalGrossPay) {
            totalPayrollExpense = totalPayrollExpense.add(run.totalGrossPay);
          }
        }

        await PerformanceGoalService.applyPayrollExpenseTotalToGoal(
          goal,
          payrollKPI,
          parseFloat(totalPayrollExpense.toString()),
          createdById
        );
        // Payroll GL is posted by PayrollService; goal sync only updates progress.
      }

      console.log('✅ Payroll-to-goals sync completed');
    } catch (error) {
      console.error('❌ Error syncing payroll to goals:', error);
      // Don't throw - we don't want to fail payroll processing if goal sync fails
    }
  }

  /**
   * Update parent goal progress based on child goals
   */
  static async updateParentGoalProgress(parentGoalId: string): Promise<void> {
    try {
      const parentGoal = await prisma.performanceGoal.findUnique({
        where: { id: parentGoalId },
        include: {
          subGoals: {
            select: {
              id: true,
              activities: true,
              currentValue: true,
              targetValue: true,
              targetOperator: true,
              isReverseKpi: true,
              scorecardWeight: true,
              progressPercentage: true,
              stage: true,
              status: true
            }
          }
        }
      });

      if (!parentGoal) {
        return;
      }

      if (!parentGoal.subGoals || parentGoal.subGoals.length === 0) {
        const parentRiskZone = resolveGoalEscalationStatus({
          currentValue: 0,
          preciseCurrentValue: "0",
          targetValue: parentGoal.targetValue,
          preciseTargetValue: parentGoal.preciseTargetValue,
          allowableVariance: parentGoal.allowableVariance,
          isReverseKpi: parentGoal.isReverseKpi,
          endDate: parentGoal.endDate
        });

        await prisma.performanceGoal.update({
          where: { id: parentGoalId },
          data: {
            currentValue: 0,
            preciseCurrentValue: "0",
            progressPercentage: 0,
            stage: "planning",
            status: "active",
            performanceRiskZone: parentRiskZone,
            performanceRiskZoneAt: new Date(),
            updatedAt: new Date()
          }
        });

        if (parentGoal.parentGoalId) {
          await this.updateParentGoalProgress(parentGoal.parentGoalId);
        }
        return;
      }

      const rollup = computeParentRollupFromChildren(
        parentGoal.subGoals as Parameters<typeof computeParentRollupFromChildren>[0],
        parentGoal.targetValue
      );
      const { stage: newStage, status: newStatus } = deriveParentStageFromRollup({
        allCompleted: rollup.allCompleted,
        anyInProgress: rollup.anyInProgress,
        weightedProgress: rollup.progressPercentage,
        suggestedCurrentValue: rollup.suggestedCurrentValue,
        subGoalCount: parentGoal.subGoals.length,
        previousStage: parentGoal.stage || "planning"
      });

      const parentRiskZone = resolveGoalEscalationStatus({
        currentValue: rollup.suggestedCurrentValue,
        preciseCurrentValue: String(rollup.suggestedCurrentValue),
        targetValue: parentGoal.targetValue,
        preciseTargetValue: parentGoal.preciseTargetValue,
        allowableVariance: parentGoal.allowableVariance,
        isReverseKpi: parentGoal.isReverseKpi,
        endDate: parentGoal.endDate
      });

      await prisma.performanceGoal.update({
        where: { id: parentGoalId },
        data: {
          currentValue: rollup.suggestedCurrentValue,
          preciseCurrentValue: String(rollup.suggestedCurrentValue),
          progressPercentage: rollup.progressPercentage,
          stage: newStage,
          status: newStatus,
          performanceRiskZone: parentRiskZone,
          performanceRiskZoneAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Recursively update grandparent if exists
      if (parentGoal.parentGoalId) {
        await this.updateParentGoalProgress(parentGoal.parentGoalId);
      }
    } catch (error) {
      console.error(`❌ Error updating parent goal progress for ${parentGoalId}:`, error);
      throw error;
    }
  }

  /**
   * Recalculate KPI progress based on all linked goals
   */
  static async recalculateKPIProgress(kpiId: string): Promise<void> {
    try {
      const kpi = await prisma.kPI.findUnique({
        where: { id: kpiId },
        include: {
          performanceGoals: {
            select: {
              id: true,
              monetaryValue: true,
              monetaryValueAchieved: true,
              percentValue: true,
              percentValueAchieved: true,
              currentValue: true,
              targetValue: true,
              status: true
            }
          }
        }
      });

      if (!kpi) {
        return;
      }

      const {
        totalMonetaryTarget,
        totalMonetaryAchieved,
        totalPercentTarget,
        totalPercentAchieved
      } = KPIService.aggregateGoalsForKpiProgress(kpi.performanceGoals);

      const monetaryPct =
        totalMonetaryTarget > 0
          ? Math.min((totalMonetaryAchieved / totalMonetaryTarget) * 100, 100)
          : 0;
      const percentPct =
        totalPercentTarget > 0
          ? Math.min((totalPercentAchieved / totalPercentTarget) * 100, 100)
          : 0;

      // KPI row has no stored progress %; KPIService reads the same aggregates on demand.
      console.log(
        `   ✅ KPI ${kpiId} aggregates (aligned with task/goal updates): value ${totalMonetaryAchieved}/${totalMonetaryTarget} (${monetaryPct.toFixed(1)}%), percent ${totalPercentAchieved}/${totalPercentTarget} (${percentPct.toFixed(1)}%)`
      );
    } catch (error) {
      console.error(`❌ Error recalculating KPI progress for ${kpiId}:`, error);
      throw error;
    }
  }
}

