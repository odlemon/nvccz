// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";
import { KPIService } from "./KPIService";
import {
  computeAchievementPercent,
  computeParentRollupFromChildren,
  deriveParentStageFromRollup,
  isTargetMet,
  mergeContributionWeightIntoActivities
} from "./performanceGoalRollupUtils";
import {
  normalizeOrgBscScorecardPillar,
  ORG_BSC_CANONICAL_TO_PILLAR_ID,
  resolveGoalEscalationStatus
} from "./performanceScorecardSupport";
import { ensureDepartmentPerformanceContractForGoal } from "./DepartmentPerformanceContractService";
import { HARDCODED_KPIS } from "../config/hardcodedKPIs";
import { FirebaseStorageService } from "./FirebaseStorageService";

/** Prisma DateTime requires full ISO; breakdown JSON often sends "YYYY-MM-DD" only. */
function isDateOnlyString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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
  goalTitle?: string | null
): boolean {
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
  category: string; // "financial", "operational", "strategic"
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
}

export interface UpdatePerformanceGoalRequest {
  title?: string;
  description?: string;
  type?: string;
  category?: string;
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
          kpi: { select: { name: true } }
        }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      const delta = Number(increment);
      if (Number.isNaN(delta)) {
        throw new Error("value must be a number");
      }

      const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(goal.kpi?.name, goal.title);
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

      const progressPercentage = computeAchievementPercent({
        currentValue,
        targetValue: goal.targetValue,
        targetOperator: effectiveTargetOperator,
        isReverseKpi: effectiveIsReverseKpi,
        progressPercentage: goal.progressPercentage
      });
      const isCompleted = isTargetMet(currentValue, targetNum, effectiveTargetOperator, effectiveIsReverseKpi);
      const partialProgress =
        !isCompleted && targetNum > 0 && Number(currentValue) > 0;
      const nextStage = isCompleted ? "completed" : partialProgress ? "in_progress" : goal.stage;

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
          progressPercentage: progressPercentage,
          status: isCompleted ? "completed" : "active",
          stage: nextStage,
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
        await this.triggerAccountingIntegration(goalId, currentValue, updatedById, {
          title: goal.title,
          targetUnit: goal.targetUnit,
          kpi: goal.kpi
        });
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

  // Trigger accounting integration when KPI goals are completed
  static async triggerAccountingIntegration(
    goalId: string,
    achievedValue: number,
    updatedById: string,
    snapshot?: { title: string; targetUnit: string | null; kpi: { name: string } | null }
  ) {
    try {
      let goal: {
        id: string;
        title: string;
        targetUnit: string | null;
        kpi: { name: string };
      } | null = null;

      if (snapshot?.kpi) {
        goal = {
          id: goalId,
          title: snapshot.title,
          targetUnit: snapshot.targetUnit,
          kpi: snapshot.kpi
        };
      } else {
        const loaded = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: { kpi: true }
      });
        if (!loaded?.kpi) {
          return;
        }
        goal = {
          id: loaded.id,
          title: loaded.title,
          targetUnit: loaded.targetUnit,
          kpi: { name: loaded.kpi.name }
        };
      }

      if (!goal) {
        return;
      }

      // Import the hardcoded KPIs to get accounting details
      const { HARDCODED_KPIS } = await import("../config/hardcodedKPIs");
      const kpiConfig = HARDCODED_KPIS.find(
        k => String(k.name || "").toLowerCase().trim() === String(goal.kpi.name || "").toLowerCase().trim()
      );

      if (kpiConfig && kpiConfig.isFinancial) {
        // Create journal entry based on KPI completion
        const journalEntry = await createJournalEntryWithAuditSequence({
          transactionDate: new Date(),
          referenceNumber: `KPI-${goal.id}-${Date.now()}`,
          description: `KPI Achievement: ${goal.title} - ${achievedValue} ${goal.targetUnit}`,
          totalAmount: achievedValue,
          currencyId: "USD",
          status: "POSTED",
          createdById: updatedById,
          journalEntryLines: {
            create: [
              {
                chartOfAccountId: kpiConfig.journalEntryType === "Debit" ? kpiConfig.accountNumber : "1000",
                debitAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
                creditAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
                description: `KPI: ${goal.kpi.name}`,
              },
              {
                chartOfAccountId: kpiConfig.journalEntryType === "Credit" ? kpiConfig.accountNumber : "1000",
                debitAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
                creditAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
                description: `KPI: ${goal.kpi.name}`,
              },
            ],
          },
        });

        console.log(`✅ Accounting integration triggered for goal ${goalId}: Journal Entry ${journalEntry.id} created`);
      }
    } catch (error) {
      console.error(`❌ Failed to trigger accounting integration for goal ${goalId}:`, error);
    }
  }

  // Create a new performance goal
  static async createPerformanceGoal(request: CreatePerformanceGoalRequest, createdById: string) {
    try {
      let kpiId = null;
      let kpiName: string | null = null;
      
      // Validate KPI if provided by name
      if (request.kpiName) {
        const kpi = await prisma.kPI.findFirst({
          where: { name: request.kpiName }
        });

        if (!kpi) {
          throw new Error(`KPI '${request.kpiName}' not found`);
        }
        
        kpiId = kpi.id;
        kpiName = kpi.name;
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
      }

      const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(kpiName, request.title);
      const resolvedIsReverseKpi =
        typeof request.isReverseKpi === "boolean"
          ? request.isReverseKpi
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
      let scorecardPillarDb: string | undefined;
      let pillarIdDb: string | null | undefined;
      if (request.type === "company") {
        const p = normalizeOrgBscScorecardPillar(request.scorecardPillar);
        if (!p) {
          throw new Error(companyPillarMsg);
        }
        scorecardPillarDb = p;
        pillarIdDb = ORG_BSC_CANONICAL_TO_PILLAR_ID[p] ?? null;
      }

      let performanceContractId: string | undefined;
      if (request.type === "department" && request.departmentName) {
        performanceContractId = await ensureDepartmentPerformanceContractForGoal({
          departmentName: request.departmentName,
          goalStart: request.startDate,
          createdById
        });
      }

      // Create the performance goal with absolute value targets
      const goal = await prisma.performanceGoal.create({
        data: {
          title: request.title,
          description: request.description,
          type: request.type,
          category: request.category,
          parentGoalId: request.parentGoalId,
          departmentName: request.departmentName,
          ...(performanceContractId ? { performanceContractId } : {}),
          // Store absolute value targets
          targetValue: request.targetValue,
          targetUnit: request.targetUnit,
          currentValue: request.currentValue || 0,
          kpiId: kpiId,
          priority: request.priority || "medium",
          startDate: request.startDate,
          endDate: request.endDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          status: "active", // Goals are active by default
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
              type: true,
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

        // Create department goal with specified target and fields
        const departmentGoal = await prisma.performanceGoal.create({
          data: {
            title: departmentData.title || `${departmentName} Goal: ${parentGoal.title}`,
            description: departmentData.description || `Department goal for ${departmentName} based on: ${parentGoal.title}`,
            type: "department",
            category: parentGoal.category,
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
            category: true,
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
      }

      return createdGoals;
    } catch (error) {
      throw error;
    }
  }

  // Create individual goals for selected users in a department
  static async createIndividualGoals(departmentGoalId: string, selectedUsers: string[], individualData: any[]) {
    try {
      const departmentGoal = await prisma.performanceGoal.findUnique({
        where: { id: departmentGoalId }
      });

      if (!departmentGoal) {
        throw new Error("Department goal not found");
      }

      if (departmentGoal.type !== "department") {
        throw new Error("Only department goals can be broken down to individuals");
      }

      const createdGoals = [];

      for (let i = 0; i < selectedUsers.length; i++) {
        const userId = selectedUsers[i];
        const userData = individualData[i];

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
            category: departmentGoal.category,
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

        createdGoals.push(individualGoal);
        console.log(`✅ Created individual goal for user ${userId}: ${individualGoal.id}`);

        // Automatically create task for the individual goal
        try {
          const { IndividualGoalToTaskService } = await import('./IndividualGoalToTaskService');
          await IndividualGoalToTaskService.convertIndividualGoalsToTasks(individualGoal.id);
          console.log(`✅ Automatically created task for individual goal: ${individualGoal.id}`);
        } catch (taskError) {
          console.error(`❌ Failed to create task for individual goal ${individualGoal.id}:`, taskError);
          // Don't throw error - goal creation should still succeed even if task creation fails
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

      if (filters.category) {
        where.category = filters.category;
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

      if (filters.strategicThemeId) {
        where.strategicThemeId = filters.strategicThemeId;
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
              type: true,
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
              type: true,
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
        pillarData.scorecardPillar = normalized;
        pillarData.pillarId = ORG_BSC_CANONICAL_TO_PILLAR_ID[normalized] ?? null;
      } else if (existingGoal.type === "company" && nextType !== "company") {
        pillarData.scorecardPillar = null;
        pillarData.pillarId = null;
      } else if (request.scorecardPillar !== undefined) {
        const normalized = normalizeOrgBscScorecardPillar(request.scorecardPillar);
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
      if (request.kpiId) {
        const k = await prisma.kPI.findUnique({
          where: { id: request.kpiId },
          select: { name: true }
        });
        kpiNameForInference = k?.name || null;
      } else if (existingGoal.kpiId) {
        const k = await prisma.kPI.findUnique({
          where: { id: existingGoal.kpiId },
          select: { name: true }
        });
        kpiNameForInference = k?.name || null;
      }

      const inferredReverseFromKpi = inferReverseKpiFromNameOrAccountType(
        kpiNameForInference,
        request.title ?? existingGoal.title
      );
      const resolvedIsReverseKpi =
        request.isReverseKpi !== undefined
          ? request.isReverseKpi
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
          ...(request.category && { category: request.category }),
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
              type: true,
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
                type: true,
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

      // Get goals by category
      const goalsByCategory = await prisma.performanceGoal.groupBy({
        by: ['category'],
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
        goalsByCategory,
        goalsByDepartment
      };
    } catch (error) {
      throw error;
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

      // Get the Payroll Expense KPI
      const payrollKPI = await prisma.kPI.findFirst({
        where: {
          name: 'Payroll Expense'
        }
      });

      if (!payrollKPI) {
        console.log('⚠️ Payroll Expense KPI not found. Skipping goal sync.');
        return;
      }

      console.log(`   Found Payroll Expense KPI: ${payrollKPI.id}`);

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

      // Find all active goals linked to Payroll Expense KPI
      const goals = await prisma.performanceGoal.findMany({
        where: {
          kpiId: payrollKPI.id,
          status: {
            in: ['active', 'completed'] // Include completed to handle updates
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
          completedAt: true
        }
      });

      console.log(`   Found ${goals.length} goal(s) linked to Payroll Expense KPI`);

      // Update each goal
      for (const goal of goals) {
        // Check if payroll run falls within goal's date range
        const payrollEndDate = new Date(payrollRun.endDate);
        const goalStartDate = new Date(goal.startDate);
        const goalEndDate = new Date(goal.endDate);

        if (payrollEndDate < goalStartDate || payrollEndDate > goalEndDate) {
          console.log(`   ⏭️ Skipping goal "${goal.title}" - payroll run date (${payrollEndDate.toISOString()}) outside goal range (${goalStartDate.toISOString()} to ${goalEndDate.toISOString()})`);
          continue;
        }

        // Sum all COMPLETED payroll runs within goal's date range
        const relevantPayrollRuns = await prisma.payrollRun.findMany({
          where: {
            status: 'COMPLETED',
            endDate: {
              gte: goalStartDate,
              lte: goalEndDate
            }
          },
          select: {
            totalGrossPay: true
          }
        });

        // Calculate total payroll expense for this goal
        let totalPayrollExpense = new Decimal(0);
        for (const run of relevantPayrollRuns) {
          if (run.totalGrossPay) {
            totalPayrollExpense = totalPayrollExpense.add(run.totalGrossPay);
          }
        }

        const totalPayrollValue = parseFloat(totalPayrollExpense.toString());
        const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
        const progressPercentage = targetValue > 0 
          ? Math.min((totalPayrollValue / targetValue) * 100, 100) 
          : 0;
        const isCompleted = totalPayrollValue >= targetValue;

        // Set monetaryValue to targetValue if not already set (for KPI calculations)
        const monetaryValue = goal.monetaryValue ? parseFloat(goal.monetaryValue.toString()) : targetValue;

        // Update goal with all necessary fields
        const updatedGoal = await prisma.performanceGoal.update({
          where: { id: goal.id },
          data: {
            currentValue: totalPayrollValue,
            monetaryValue: monetaryValue, // Set target monetary value
            monetaryValueAchieved: totalPayrollValue, // Set achieved monetary value
            progressPercentage: progressPercentage,
            status: isCompleted ? 'completed' : 'active',
            stage: isCompleted ? 'completed' : 'in_progress',
            completedAt: isCompleted && !goal.completedAt ? new Date() : undefined,
            updatedAt: new Date()
          },
          include: {
            parentGoal: {
              select: { id: true }
            }
          }
        });

        console.log(`   ✅ Updated goal "${goal.title}": ${totalPayrollValue.toFixed(2)}/${targetValue.toFixed(2)} (${progressPercentage.toFixed(1)}%)`);

        // Update parent goal progress if this is a sub-goal
        if (updatedGoal.parentGoalId) {
          try {
            await this.updateParentGoalProgress(updatedGoal.parentGoalId);
          } catch (parentError) {
            console.error(`   ⚠️ Failed to update parent goal ${updatedGoal.parentGoalId}:`, parentError);
          }
        }

        // Recalculate KPI progress after goal update
        if (goal.kpiId) {
          try {
            await this.recalculateKPIProgress(goal.kpiId);
          } catch (kpiError) {
            console.error(`   ⚠️ Failed to recalculate KPI progress for ${goal.kpiId}:`, kpiError);
          }
        }

        // If goal is completed and has KPI integration, trigger accounting
        if (isCompleted && goal.kpiId) {
          try {
            await this.triggerAccountingIntegration(goal.id, totalPayrollValue, createdById);
          } catch (accountingError) {
            console.error(`   ⚠️ Failed to trigger accounting integration for goal ${goal.id}:`, accountingError);
            // Don't fail the sync if accounting integration fails
          }
        }
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

