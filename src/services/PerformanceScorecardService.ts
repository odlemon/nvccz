// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { RollupCalculationService } from "./RollupCalculationService";
import {
  BOARD_SECTION_LABELS,
  BOARD_SECTION_WEIGHTS,
  CEO_SECTION_LABELS,
  CEO_SECTION_WEIGHTS,
  DEFAULT_ORG_PILLAR_WEIGHTS,
  ORG_BSC_PILLAR_META,
  assertIndividualGoalWeightsSum100,
  normalizeEmployeeGoalWeightsForScorecard,
  buildPersonalAttributesRatingGrid,
  buildTrainingSection,
  computeBudgetUtilisationRating,
  computeGoalProgress,
  computeRawRating,
  computeStatus,
  departmentProgressTrafficStatus,
  departmentMatrixVarianceStatus,
  parseStretchTargetValueFromActivities,
  deriveActualFromProgress,
  getContributionWeight,
  resolveDepartmentRollupChildWeights,
  isCEO,
  isComplianceLeader,
  isDepartmentManager,
  isExecutive,
  isFinalOrArchived,
  isAdminViewer,
  isHRLeader,
  isMonitoringAndEvaluationLeader,
  isSysAdmin,
  normalisePillarWeightsTo100,
  PERFORMANCE_RATING_SCALE,
  performanceLabelFromScore,
  rawRatingBandLabel,
  rawRatingToRowSeverity,
  redistributeWeights,
  resolveScorecardLifecycleBanner,
  departmentGoalRowStatus,
  hasAnySignal,
  isEmployeeGoalStoredActualMissing,
  ceoPerformanceLabelForSection,
  ceoPerformanceLabelOverall,
  performanceLabelFromDepartmentScore,
  resolveGoalEscalationStatus,
  resolvePeriodLabel,
  resolveSectionWeights,
  resolveWeight,
  resolveStoredGoalActual,
  periodLabelMatches,
  round,
  summariseEmployeeResultsDelivery,
  toNumber
} from "./performanceScorecardSupport";
import {
  boardDirectorsWithOrganisationShort,
  chiefExecutiveOrganisationLine,
  resolveOrganisationDisplayName
} from "../config/companyDisplay";
import { CompanyProfileAddressService } from "./CompanyProfileAddressService";
import { normaliseTaskStage, TASK_STAGE_OPTIONS } from "./TaskCollaborationService";
import { isPrecisionSensitiveFormula, shouldRaiseDataQualityAlert } from "./performanceBackendSupport";

type AccessContext = {
  entityId: string;
  viewer: any;
  meta?: any;
};

function currentPeriodBounds() {
  const now = new Date();
  return {
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  };
}

/** When the client sends only `periodLabel` like "2026", use full UTC calendar year (matches department contracts). */
function periodBoundsFromYearLabel(periodLabel: unknown): { periodStart: Date; periodEnd: Date; periodLabel: string } | null {
  const raw = String(periodLabel ?? "").trim();
  const m = raw.match(/^(\d{4})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (year < 1970 || year > 2100) return null;
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: raw
  };
}

function decimalForStorage(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return round(value, 2);
}

function getRequestMetadata(meta?: any) {
  return {
    ipAddress: meta?.ipAddress || null,
    userAgent: meta?.userAgent || null
  };
}

/** Branding rarely changes; longer TTL cuts repeated Prisma round-trips on scorecard endpoints. */
const BRANDING_CACHE_TTL = 300_000;
let _brandingCache: { profile: any; letterhead: any; ts: number } | null = null;

/** Formal title on CEO scorecard documents (never from user.departmentRole). */
const CEO_SCORECARD_FORMAL_TITLE = "Chief Executive Officer";

export const CEO_CONTRACT_NOT_FOUND_MESSAGE =
  "No CEO performance contract found for this period. Create a contract of type CEO with organisational goals linked before generating this scorecard.";

const CEO_SAVE_NO_INDICATORS_MESSAGE =
  "Cannot save CEO scorecard: no indicators are linked to this CEO contract.";

export const BOARD_CONTRACT_NOT_FOUND_MESSAGE =
  "No Board performance contract found for this period. Create a contract of type BOARD with governance indicators before generating this scorecard.";

const BOARD_SAVE_NO_INDICATORS_MESSAGE =
  "Cannot save Board scorecard: no indicators are linked to this Board contract.";

const BOARD_SCORECARD_CHAIR_TITLE = "Board Chairperson";

async function getCachedBranding() {
  if (_brandingCache && Date.now() - _brandingCache.ts < BRANDING_CACHE_TTL) {
    return _brandingCache;
  }
  const [profile, letterhead] = await Promise.all([
    prisma.companyProfile.findFirst({ orderBy: { updatedAt: "desc" }, select: { logoUrl: true, legalName: true } }),
    CompanyProfileAddressService.getActive()
  ]);
  _brandingCache = { profile, letterhead, ts: Date.now() };
  return _brandingCache;
}

export class PerformanceScorecardService {
  private static async logAccessDenied(context: AccessContext, auditDetail: string) {
    const metadata = getRequestMetadata(context.meta);
    await AuditService.log({
      userId: context.viewer?.id || null,
      action: "PERFORMANCE_SCORECARD_ACCESS_DENIED",
      entityType: "PerformanceScorecardAccess",
      entityId: context.entityId,
      newValues: {
        allowed: false,
        reason: auditDetail
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });

    throw new Error("Access denied");
  }

  private static async assertEmployeeAccess(viewer: any, employeeUser: any, employeeRecord: any, mode: "view" | "generate", meta?: any) {
    const targetUserId = employeeUser?.id;
    if (!viewer?.id) {
      await this.logAccessDenied(
        { viewer: viewer || {}, entityId: targetUserId || "unknown", meta },
        "Unauthenticated"
      );
    }

    const isSelf = viewer.id === targetUserId;
    const lineManagerId = employeeRecord?.lineManagerUserId || null;
    const isLineManager = Boolean(lineManagerId && viewer.id === lineManagerId);
    const hr = isHRLeader(viewer);
    const ceo = isCEO(viewer);
    const admin = isAdminViewer(viewer);

    if (mode === "generate") {
      if (admin) {
        return;
      }
      if (!(isLineManager || hr || ceo)) {
        await this.logAccessDenied(
          { viewer, entityId: targetUserId, meta },
          isSelf
            ? "Employees cannot generate their own scorecard"
            : "Only direct manager, HR, CEO, or administrator may generate employee scorecards"
        );
      }
      return;
    }

    if (isSelf || isLineManager || hr || ceo || admin) {
      return;
    }

    await this.logAccessDenied(
      { viewer, entityId: targetUserId, meta },
      "View allowed only for self, direct manager, HR, CEO, or administrator"
    );
  }

  private static async evaluateDepartmentScorecardAccess(viewer: any, departmentName: string) {
    const deptNorm = String(departmentName || "").trim();
    if (!viewer?.id) {
      return { canView: false, canGenerate: false };
    }

    const admin = isAdminViewer(viewer);
    const ceo = isCEO(viewer);
    const hr = isHRLeader(viewer);
    const me = isMonitoringAndEvaluationLeader(viewer);
    const compliance = isComplianceLeader(viewer);

    let resolvedDeptName: string | null = null;
    if (viewer.departmentId) {
      const d = await prisma.department.findUnique({
        where: { id: viewer.departmentId },
        select: { name: true }
      });
      resolvedDeptName = d?.name || null;
    }

    const manages = hasAnySignal(viewer, ["_mgr", " manager"]);
    const managerOfTarget =
      manages &&
      (String(viewer.userDepartment || "").trim().toLowerCase() === deptNorm.toLowerCase() ||
        (resolvedDeptName && resolvedDeptName.toLowerCase() === deptNorm.toLowerCase()));

    const unrestricted = admin || ceo || hr;
    const canGenerate = unrestricted || (managerOfTarget && !me && !compliance);
    const canView = unrestricted || managerOfTarget || me || compliance;

    return { canView, canGenerate };
  }

  private static async assertDepartmentAccess(
    viewer: any,
    departmentName: string,
    mode: "view" | "generate",
    meta?: any
  ): Promise<{ canView: boolean; canGenerate: boolean }> {
    const deptNorm = String(departmentName || "").trim();
    if (!viewer?.id) {
      await this.logAccessDenied(
        { viewer: viewer || {}, entityId: deptNorm || "unknown", meta },
        "Unauthenticated"
      );
    }

    const { canView, canGenerate } = await this.evaluateDepartmentScorecardAccess(viewer, deptNorm);

    if (mode === "generate" && !canGenerate) {
      await this.logAccessDenied(
        { viewer, entityId: deptNorm, meta },
        "Only department manager, HR, CEO, or administrator may generate department scorecards (M&E / Compliance may view only)"
      );
    }

    if (mode === "view" && !canView) {
      await this.logAccessDenied(
        { viewer, entityId: deptNorm, meta },
        "View denied for this department scorecard"
      );
    }

    return { canView, canGenerate };
  }

  /**
   * CEO scorecard: role checks are enforced on the frontend; any authenticated user may call the API.
   */
  private static evaluateCEOScorecardAccess(viewer: any): { canView: boolean; canGenerate: boolean } {
    if (!viewer?.id) {
      return { canView: false, canGenerate: false };
    }
    return { canView: true, canGenerate: true };
  }

  private static async assertCEOAccess(
    viewer: any,
    mode: "view" | "generate",
    meta?: any
  ): Promise<{ canView: boolean; canGenerate: boolean }> {
    if (!viewer?.id) {
      await this.logAccessDenied(
        { viewer: viewer || {}, entityId: "ceo_scorecard", meta },
        "Unauthenticated"
      );
    }
    return this.evaluateCEOScorecardAccess(viewer);
  }

  /** Role gating is left to the frontend; any authenticated user may call the Board scorecard API. */
  private static evaluateBoardScorecardAccess(viewer: any): { canView: boolean; canGenerate: boolean } {
    if (!viewer?.id) {
      return { canView: false, canGenerate: false };
    }
    return { canView: true, canGenerate: true };
  }

  private static async assertBoardAccess(
    viewer: any,
    meta?: any
  ): Promise<{ canView: boolean; canGenerate: boolean }> {
    if (!viewer?.id) {
      await this.logAccessDenied(
        { viewer: viewer || {}, entityId: "board_scorecard", meta },
        "Unauthenticated"
      );
    }
    return this.evaluateBoardScorecardAccess(viewer);
  }

  /** Org BSC is a computed dashboard; any authenticated user may fetch it (drill-down flags reflect full detail). */
  private static evaluateOrgBscAccess(viewer: any): { canView: boolean } {
    if (!viewer?.id) {
      return { canView: false };
    }
    return { canView: true };
  }

  private static async assertOrgDashboardAccess(
    viewer: any,
    meta?: any
  ): Promise<{ canView: boolean }> {
    if (!viewer?.id) {
      await this.logAccessDenied(
        { viewer: viewer || {}, entityId: "org_bsc_dashboard", meta },
        "Unauthenticated"
      );
    }
    return this.evaluateOrgBscAccess(viewer);
  }

  private static buildPeriod(input?: any) {
    if (input?.periodStart && input?.periodEnd) {
      return {
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        periodLabel: input.periodLabel
      };
    }

    const fromYearLabel = periodBoundsFromYearLabel(input?.periodLabel);
    if (fromYearLabel) {
      return fromYearLabel;
    }

    return currentPeriodBounds();
  }

  private static buildPeriodWhere(period: any) {
    return {
      startDate: {
        lte: period.periodEnd
      },
      endDate: {
        gte: period.periodStart
      }
    };
  }

  private static buildContractPeriodWhere(period: any) {
    return {
      periodStart: {
        lte: period.periodEnd
      },
      periodEnd: {
        gte: period.periodStart
      }
    };
  }

  private static async resolveContract(params: {
    contractType: string;
    subjectUserId?: string;
    departmentName?: string;
    period?: any;
  }) {
    const period = params.period || currentPeriodBounds();
    return prisma.performanceContract.findFirst({
      where: {
        contractType: params.contractType,
        ...(params.subjectUserId ? { subjectUserId: params.subjectUserId } : {}),
        ...(params.departmentName ? { departmentName: params.departmentName } : {}),
        ...this.buildContractPeriodWhere(period),
        status: {
          notIn: ["ARCHIVED", "CANCELLED"]
        }
      },
      include: {
        subjectUser: {
          include: {
            role: true,
            employee: true
          }
        },
        reviewer: {
          include: { role: true }
        },
        approver: {
          include: { role: true }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  private static performanceContractScorecardInclude() {
    return {
      subjectUser: {
        include: {
          role: true,
          employee: true
        }
      },
      reviewer: {
        include: { role: true }
      },
      approver: {
        include: { role: true }
      }
    };
  }

  /** Minimal relations for CEO scorecard path (names + scoring fields only). */
  private static performanceContractCEOInclude() {
    return {
      subjectUser: {
        select: { id: true, firstName: true, lastName: true }
      },
      reviewer: {
        select: { id: true, firstName: true, lastName: true }
      },
      approver: {
        select: { id: true, firstName: true, lastName: true }
      }
    };
  }

  /**
   * Resolve CEO scorecard contract: only `contractType` CEO (overlap or periodLabel match). No EMPLOYEE fallback.
   * One DB round-trip when a period label is present; prefers period overlap over label-only match.
   */
  private static async resolveCEOPerformanceContract(period: {
    periodStart: Date;
    periodEnd: Date;
    periodLabel?: string;
  }): Promise<{ contract: any | null; resolutionNotes: string[] }> {
    const notes: string[] = [];
    const activeStatus = { notIn: ["ARCHIVED", "CANCELLED"] as string[] };
    const overlap = this.buildContractPeriodWhere(period);
    const include = this.performanceContractCEOInclude();
    const labelTrim =
      period.periodLabel != null && String(period.periodLabel).trim() !== ""
        ? String(period.periodLabel).trim()
        : null;

    const orClause: Record<string, unknown>[] = [overlap];
    if (labelTrim) {
      orClause.push({ periodLabel: labelTrim });
    }

    const candidates = await prisma.performanceContract.findMany({
      where: {
        contractType: { in: ["CEO", "ceo"] },
        status: activeStatus,
        OR: orClause
      },
      include,
      orderBy: { updatedAt: "desc" },
      take: 100
    });

    if (!candidates.length) {
      return { contract: null, resolutionNotes: notes };
    }

    const overlapsWindow = (c: { periodStart: Date; periodEnd: Date }) =>
      c.periodStart <= period.periodEnd && c.periodEnd >= period.periodStart;

    const overlapMatch = candidates.find((c) => overlapsWindow(c));
    if (overlapMatch) {
      return { contract: overlapMatch, resolutionNotes: notes };
    }

    if (labelTrim) {
      const byLabel = candidates.find(
        (c) => c.periodLabel === labelTrim || periodLabelMatches(c.periodLabel, labelTrim)
      );
      if (byLabel) {
        notes.push(
          "CEO contract matched by period label; contract dates may not overlap the requested window — verify period alignment."
        );
        return { contract: byLabel, resolutionNotes: notes };
      }
    }

    return { contract: null, resolutionNotes: notes };
  }

  private static performanceContractBoardInclude() {
    return {
      reviewer: { select: { id: true, firstName: true, lastName: true } },
      approver: { select: { id: true, firstName: true, lastName: true } },
      subjectUser: { select: { id: true, firstName: true, lastName: true } }
    };
  }

  /** BOARD contract only — no fallback to other types. */
  private static async resolveBoardPerformanceContract(period: {
    periodStart: Date;
    periodEnd: Date;
    periodLabel?: string;
  }): Promise<{ contract: any | null; resolutionNotes: string[] }> {
    const notes: string[] = [];
    const activeStatus = { notIn: ["ARCHIVED", "CANCELLED"] as string[] };
    const overlap = this.buildContractPeriodWhere(period);
    const include = this.performanceContractBoardInclude();
    const labelTrim =
      period.periodLabel != null && String(period.periodLabel).trim() !== ""
        ? String(period.periodLabel).trim()
        : null;
    const orClause: Record<string, unknown>[] = [overlap];
    if (labelTrim) {
      orClause.push({ periodLabel: labelTrim });
    }

    const candidates = await prisma.performanceContract.findMany({
      where: {
        contractType: { in: ["BOARD", "board"] },
        status: activeStatus,
        OR: orClause
      },
      include,
      orderBy: { updatedAt: "desc" },
      take: 100
    });

    if (!candidates.length) {
      return { contract: null, resolutionNotes: notes };
    }

    const overlapsWindow = (c: { periodStart: Date; periodEnd: Date }) =>
      c.periodStart <= period.periodEnd && c.periodEnd >= period.periodStart;

    const overlapMatch = candidates.find((c) => overlapsWindow(c));
    if (overlapMatch) {
      return { contract: overlapMatch, resolutionNotes: notes };
    }

    if (labelTrim) {
      const byLabel = candidates.find(
        (c) => c.periodLabel === labelTrim || periodLabelMatches(c.periodLabel, labelTrim)
      );
      if (byLabel) {
        notes.push(
          "Board contract matched by period label; contract dates may not overlap the requested window — verify period alignment."
        );
        return { contract: byLabel, resolutionNotes: notes };
      }
    }

    return { contract: null, resolutionNotes: notes };
  }

  private static async resolveEmployeeContext(employeeUserId: string, periodInput?: any) {
    const employeeUser = await prisma.user.findUnique({
      where: { id: employeeUserId },
      include: {
        role: true,
        employee: true
      }
    });

    if (!employeeUser) {
      throw new Error("Employee not found");
    }

    const contract = await this.resolveContract({
      contractType: "EMPLOYEE",
      subjectUserId: employeeUserId,
      period: this.buildPeriod(periodInput)
    });

    if (!contract) {
      throw new Error("No active performance contract found for this employee in the selected period.");
    }

    const period = {
      periodStart: contract.periodStart,
      periodEnd: contract.periodEnd,
      periodLabel: contract.periodLabel
    };

    const goals = await prisma.performanceGoal.findMany({
      where: {
        assignedToId: employeeUserId,
        type: "individual",
        OR: [
          { performanceContractId: contract.id },
          this.buildPeriodWhere(period)
        ]
      },
      include: {
        kpi: true,
        parentGoal: {
          select: {
            id: true,
            title: true,
            departmentName: true,
            scorecardPillar: true,
            parentGoalId: true
          }
        }
      },
      orderBy: [
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    return {
      employeeUser,
      employeeRecord: employeeUser.employee,
      contract,
      period,
      goals
    };
  }

  private static taskStageDisplayLabel(stage: string) {
    const code = normaliseTaskStage(stage);
    const row = TASK_STAGE_OPTIONS.find((o) => o.code === code);
    return row?.label || code;
  }

  private static isTaskBasedIndividualGoal(goal: any) {
    const ft = String(goal.formulaType || "").toUpperCase();
    if (ft === "TASK_COMPLETION") return true;
    const act = goal.activities;
    return Boolean(act && typeof act === "object" && !Array.isArray(act) && act.taskBasedProgress === true);
  }

  private static async fetchTasksByGoalIds(goalIds: string[]) {
    if (!goalIds.length) {
      return new Map<string, any[]>();
    }
    const tasks = await prisma.task.findMany({
      where: {
        goalId: { in: goalIds },
        isTrashed: false
      },
      select: {
        id: true,
        title: true,
        stage: true,
        status: true,
        date: true,
        updatedAt: true,
        goalId: true
      }
    });
    const map = new Map<string, any[]>();
    for (const t of tasks) {
      if (!t.goalId) continue;
      const list = map.get(t.goalId) || [];
      list.push(t);
      map.set(t.goalId, list);
    }
    return map;
  }

  private static buildEmployeeIndividualGoalRows(
    goals: any[],
    options: {
      stretchScoringEnabled?: boolean;
      tasksByGoalId: Map<string, any[]>;
      warnings: string[];
    }
  ) {
    const fallbackWeight = goals.length > 0 ? 100 / goals.length : 0;
    const baseRows = goals.map((goal) => {
      const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
      const weight = resolveWeight(goal.scorecardWeight, fallbackWeight);
      const taskBased = this.isTaskBasedIndividualGoal(goal);
      const tasks = options.tasksByGoalId.get(goal.id) || [];
      const storedActualResolved = taskBased
        ? { value: 0, hasExplicitStored: false }
        : resolveStoredGoalActual(goal);
      const hasNullStoredActual = !taskBased && !storedActualResolved.hasExplicitStored;

      let targetValue: number;
      let actualValue: number;
      let excludedFromScoring = false;
      let hasRecordedPerformance = false;

      if (taskBased) {
        targetValue = tasks.length;
        actualValue = tasks.filter((t) => normaliseTaskStage(t.stage) === "completed").length;
        if (targetValue === 0) {
          excludedFromScoring = true;
          options.warnings.push(
            `Goal "${goal.title}" uses task-based progress but has no linked tasks. It will be excluded from scoring.`
          );
        } else {
          hasRecordedPerformance = true;
        }
      } else {
        targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
        actualValue = storedActualResolved.value;
        if (hasNullStoredActual) {
          options.warnings.push(
            `Goal "${goal.title}" has no actual value recorded. It will be scored as 0.`
          );
        } else if (isEmployeeGoalStoredActualMissing(goal)) {
          options.warnings.push(
            `Goal "${goal.title}" has no non-zero actual in stored fields (sync may not have run). It will be scored as 0.`
          );
        }
        hasRecordedPerformance = !isEmployeeGoalStoredActualMissing(goal);
        if (targetValue <= 0) {
          excludedFromScoring = true;
          options.warnings.push(
            `Goal "${goal.title}" has no valid target (configuration). It will be excluded from scoring.`
          );
        }
      }

      const isPendingApproval = Boolean(goal.isPendingApproval);
      const progress =
        isPendingApproval || excludedFromScoring
          ? { progressPct: null, isMissing: false }
          : computeGoalProgress({
              actualValue,
              targetValue,
              isReverseKpi: goal.isReverseKpi,
              stretchScoringEnabled: options.stretchScoringEnabled
            });

      let rawRating: number | null = null;
      if (!isPendingApproval && !excludedFromScoring) {
        rawRating = computeRawRating({
          actualValue,
          targetValue,
          allowableVariance: goal.allowableVariance,
          isReverseKpi: goal.isReverseKpi
        });
      }

      const activities =
        goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
          ? goal.activities
          : {};
      const rollupWeight = toNumber(
        activities.contributionWeightPercent ?? activities.rollupWeightPercent,
        0
      );

      return {
        id: goal.id,
        goalName: goal.title,
        kpiOrMeasure: goal.measureName || goal.kpi?.name || goal.title,
        targetValue,
        stretchTargetValue,
        actualValue,
        allowableVariance: toNumber(goal.allowableVariance, 0.1),
        isReverseKpi: Boolean(goal.isReverseKpi),
        isPendingApproval,
        excludedFromScoring,
        hasRecordedPerformance,
        taskBased,
        originalWeight: round(weight, 4),
        weight,
        progressPct: isPendingApproval || excludedFromScoring ? null : progress.progressPct,
        rawRating,
        missingValue:
          isPendingApproval || excludedFromScoring || taskBased
            ? false
            : isEmployeeGoalStoredActualMissing(goal),
        parentGoalId: goal.parentGoalId,
        parentGoal: goal.parentGoal,
        rollupWeight: rollupWeight > 0 ? rollupWeight : null,
        sourceGoal: goal,
        linkedTasks: tasks
      };
    });

    return redistributeWeights(baseRows).map((row) => ({
      ...row,
      weightedScore:
        row.rawRating === null ? null : round((row.effectiveWeight * row.rawRating) / 100, 4)
    }));
  }

  private static buildBudgetComponent(contract: any) {
    if (contract?.allocatedBudget === null || contract?.allocatedBudget === undefined) {
      return {
        included: false,
        score: null,
        budgetUtilisationPct: null,
        allocatedBudget: null,
        actualSpend: null
      };
    }

    const allocatedBudget = toNumber(contract.allocatedBudget, 0);
    const actualSpend = toNumber(contract.actualSpend, 0);

    if (allocatedBudget <= 0) {
      return {
        included: false,
        score: null,
        budgetUtilisationPct: null,
        allocatedBudget,
        actualSpend
      };
    }

    const budgetUtilisationPct = round((actualSpend / allocatedBudget) * 100, 2);
    const rating = computeBudgetUtilisationRating(budgetUtilisationPct);

    return {
      included: true,
      score: rating,
      budgetUtilisationPct,
      allocatedBudget,
      actualSpend
    };
  }

  private static employeeMatrixRowSeverity(row: any): string {
    if (row.isPendingApproval) return "pending";
    if (row.excludedFromScoring) return "excluded";
    return rawRatingToRowSeverity(row.rawRating);
  }

  /** User with `departmentRole` HEAD whose `userDepartment` matches the employee's (case-insensitive). */
  private static async fetchDepartmentHeadUser(employeeUser: {
    id?: string;
    userDepartment?: string | null;
  }) {
    const want = String(employeeUser?.userDepartment || "").trim().toLowerCase();
    if (!want) return null;
    const candidates = await prisma.user.findMany({
      where: {
        departmentRole: "HEAD",
        userDepartment: { not: null }
      },
      include: { role: true },
      take: 500
    });
    return (
      candidates.find(
        (u) =>
          u.id !== employeeUser.id &&
          String(u.userDepartment || "").trim().toLowerCase() === want
      ) || null
    );
  }

  private static buildEmployeeDocument(params: {
    employeeUser: any;
    contract: any;
    period: any;
    rows: any[];
    resultsDeliveryScore: number;
    budgetComponent: any;
    finalScore: number;
    performanceLabel: string;
    generatedAt: Date;
    /** Department HEAD for `employeeUser.userDepartment` when contract has no reviewer. */
    departmentHeadUser?: any;
    directManagerUser?: any;
    scorecardStatus?: string;
    organisationName?: string;
    organisationLogoUrl?: string | null;
  }) {
    const appraiserFromContract = params.contract.reviewer
      ? {
          name: `${params.contract.reviewer.firstName} ${params.contract.reviewer.lastName}`,
          title: params.contract.reviewer?.departmentRole || params.contract.reviewer?.role?.name || null
        }
      : null;
    const appraiserFromDepartmentHead =
      params.departmentHeadUser && !appraiserFromContract
        ? {
            name: `${params.departmentHeadUser.firstName} ${params.departmentHeadUser.lastName}`,
            title:
              params.departmentHeadUser?.departmentRole ||
              params.departmentHeadUser?.role?.name ||
              null
          }
        : null;
    const appraiserFromLineManager =
      params.directManagerUser && !appraiserFromContract && !appraiserFromDepartmentHead
        ? {
            name: `${params.directManagerUser.firstName} ${params.directManagerUser.lastName}`,
            title: params.directManagerUser?.departmentRole || params.directManagerUser?.role?.name || null
          }
        : null;
    const appraiser =
      appraiserFromContract || appraiserFromDepartmentHead || appraiserFromLineManager;

    return {
      header: {
        organisationName: resolveOrganisationDisplayName(params.organisationName ?? null),
        organisationLogoUrl: params.organisationLogoUrl ?? null,
        documentTitle: "Individual Performance Scorecard",
        employeeName: `${params.employeeUser.firstName} ${params.employeeUser.lastName}`,
        jobTitle: params.employeeUser.departmentRole || params.employeeUser.role?.name || null,
        department: params.employeeUser.userDepartment,
        appraiserName: appraiser?.name || null,
        appraiserTitle: appraiser?.title || null,
        reviewPeriod: resolvePeriodLabel({
          periodLabel: params.period.periodLabel,
          periodStart: params.period.periodStart,
          periodEnd: params.period.periodEnd
        }),
        dateGenerated: params.generatedAt.toISOString()
      },
      performanceMatrix: params.rows.map((row, index) => {
        const pendingOrExcluded = row.isPendingApproval || row.excludedFromScoring;
        const varianceStatus =
          pendingOrExcluded || row.targetValue <= 0
            ? null
            : computeStatus({
                actualValue: row.actualValue,
                targetValue: row.targetValue,
                allowableVariance: row.allowableVariance,
                isReverseKpi: row.isReverseKpi
              });
        return {
          index: index + 1,
          goal: row.goalName,
          kpiOrMeasure: row.kpiOrMeasure,
          target: row.targetValue,
          actual: row.isPendingApproval
            ? "Pending Approval"
            : row.excludedFromScoring
              ? "Excluded"
              : row.actualValue,
          variance: row.targetValue > 0 ? round(row.actualValue - row.targetValue, 2) : null,
          varianceStatus,
          progressPct: row.isPendingApproval ? "Pending Approval" : row.excludedFromScoring ? "N/A" : row.progressPct,
          rawRating: row.isPendingApproval ? "Pending Approval" : row.excludedFromScoring ? "N/A" : row.rawRating,
          rawRatingLabel:
            !row.isPendingApproval &&
            !row.excludedFromScoring &&
            row.rawRating != null &&
            typeof row.rawRating === "number"
              ? rawRatingBandLabel(row.rawRating)
              : null,
          weight: row.originalWeight,
          effectiveWeight: row.effectiveWeight,
          weightedScore: row.isPendingApproval
            ? "Pending Approval"
            : row.excludedFromScoring
              ? "N/A"
              : row.weightedScore,
          rowSeverity: this.employeeMatrixRowSeverity(row)
        };
      }),
      taskSummary: params.rows.map((row) => ({
        goalId: row.id,
        goalName: row.goalName,
        tasks: (row.linkedTasks || []).map((t: any) => ({
          taskId: t.id,
          taskName: t.title,
          status: this.taskStageDisplayLabel(t.stage),
          dueDate: t.date ? new Date(t.date).toISOString() : null,
          completedDate:
            normaliseTaskStage(t.stage) === "completed" && t.updatedAt
              ? new Date(t.updatedAt).toISOString()
              : null
        }))
      })),
      subtotals: {
        resultsDeliveryScore: round(params.resultsDeliveryScore, 2),
        budgetPerformanceScore: params.budgetComponent.included ? params.budgetComponent.score : null,
        finalScore: round(params.finalScore, 2),
        performanceLabel: params.performanceLabel
      },
      qualitativeSections: {
        personalAttributes: buildPersonalAttributesRatingGrid(params.contract.qualitativeTemplate),
        trainingAndDevelopment: buildTrainingSection(params.contract.qualitativeTemplate)
      },
      signatureBlock: {
        appraisee: {
          name: `${params.employeeUser.firstName} ${params.employeeUser.lastName}`,
          signature: null,
          date: null
        },
        appraiser: {
          name: appraiser?.name || null,
          signature: null,
          date: null
        }
      },
      status: params.scorecardStatus || "DRAFT"
    };
  }

  private static departmentMatrixRowSeverity(row: any): string {
    if (row.isPendingApproval) return "pending";
    if (row.excludedFromScoring) return "excluded";
    return rawRatingToRowSeverity(row.rawRating);
  }

  private static buildDepartmentDocument(params: {
    departmentId?: string | null;
    departmentName: string;
    period: any;
    manager: any;
    rows: any[];
    rollupSummary: any[];
    departmentScore: number;
    performanceLabel: string;
    status?: string;
    organisationName?: string;
    organisationLogoUrl?: string | null;
    generatedAt?: Date;
  }) {
    const generatedAt = params.generatedAt || new Date();
    return {
      header: {
        organisationName: resolveOrganisationDisplayName(params.organisationName ?? null),
        organisationLogoUrl: params.organisationLogoUrl ?? null,
        documentTitle: "Departmental Performance Scorecard",
        /** Department scorecard = Head of Department scorecard (same artefact). */
        scorecardFraming:
          "This scorecard is the Head of Department’s performance review for this department — departmental results and HOD accountability are one document.",
        departmentId: params.departmentId ?? null,
        departmentName: params.departmentName,
        headOfDepartmentName: params.manager
          ? `${params.manager.firstName} ${params.manager.lastName}`.trim()
          : null,
        headOfDepartmentTitle: params.manager?.departmentRole || params.manager?.role?.name || null,
        managerName: params.manager
          ? `${params.manager.firstName} ${params.manager.lastName}`
          : null,
        managerTitle: params.manager?.departmentRole || params.manager?.role?.name || null,
        departmentManagerName: params.manager
          ? `${params.manager.firstName} ${params.manager.lastName}`
          : null,
        departmentManagerTitle: params.manager?.departmentRole || params.manager?.role?.name || null,
        reviewPeriod: resolvePeriodLabel({
          periodLabel: params.period.periodLabel,
          periodStart: params.period.periodStart,
          periodEnd: params.period.periodEnd
        }),
        dateGenerated: generatedAt.toISOString()
      },
      performanceMatrix: params.rows.map((row, index) => {
        const pending = row.isPendingApproval;
        const varianceNum =
          pending || row.targetValue <= 0 ? null : round(row.selectedActualValue - row.targetValue, 2);
        const varianceStatus =
          pending || row.targetValue <= 0
            ? null
            : departmentMatrixVarianceStatus({
                variance: row.selectedActualValue - row.targetValue,
                targetValue: row.targetValue,
                allowableVariance: row.allowableVariance,
                isReverseKpi: row.isReverseKpi,
                missingValue: Boolean(row.missingValue)
              });
        const varianceStatusNote =
          !pending && row.targetValue > 0 && row.missingValue
            ? "Status reflects missing performance data, not variance direction."
            : null;
        return {
          index: index + 1,
          goal: row.goalName,
          kpiOrMeasure: row.kpiOrMeasure,
          kpi: row.kpiOrMeasure,
          target: row.targetValue,
          actualDirect: pending ? "Pending Approval" : row.directActualValue,
          rollupProgress: pending ? "Pending Approval" : row.rollupProgressPct,
          selectedProgress: pending ? "Pending Approval" : row.selectedProgressPct,
          selectedSource: pending ? "Pending Approval" : row.selectedSource,
          variance: varianceNum,
          varianceStatus,
          varianceStatusNote,
          rawRating: pending ? "Pending Approval" : row.rawRating,
          rawRatingLabel:
            !pending && row.rawRating != null && typeof row.rawRating === "number"
              ? rawRatingBandLabel(row.rawRating)
              : null,
          weight: row.originalWeight,
          effectiveWeight: row.effectiveWeight,
          weightedScore: pending ? "Pending Approval" : row.weightedScore,
          rowSeverity: this.departmentMatrixRowSeverity(row),
          status: row.status
        };
      }),
      rollupTable: params.rollupSummary.map((r) => ({
        employeeName: r.employeeName,
        finalScore: r.finalScore,
        rollupWeight: r.rollupWeight,
        weightedContribution: r.weightedContribution
      })),
      employeeRollupSummary: params.rollupSummary,
      subtotals: {
        departmentScore: round(params.departmentScore, 2),
        performanceLabel: params.performanceLabel
      },
      finalScore: round(params.departmentScore, 2),
      qualitativeSections: {
        personalAttributes: buildPersonalAttributesRatingGrid(params.period?.qualitativeTemplate),
        trainingAndDevelopment: buildTrainingSection(params.period?.qualitativeTemplate)
      },
      signatureBlock: {
        departmentManager: {
          name: params.manager ? `${params.manager.firstName} ${params.manager.lastName}` : null,
          signature: null,
          date: null
        },
        appraiser: {
          name: null,
          title: "CEO / HR Manager",
          signature: null,
          date: null
        },
        approver: {
          name: null,
          signature: null,
          date: null
        }
      },
      status: params.status || "DRAFT"
    };
  }

  private static extractFormulaActual(goal: any) {
    const inputs = goal.activities && typeof goal.activities === "object"
      ? goal.activities
      : {};
    const storedActual = resolveStoredGoalActual(goal).value;

    const scSkills = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
    const bscKindForm = String((scSkills as any).bscEntryKind || "").trim();
    if (bscKindForm === "SKILLS_DEVELOPMENT_PROGRESS" || bscKindForm === "CSR_PARTICIPATION_RATE") {
      return storedActual;
    }

    const formulaType = String(goal.formulaType || "").toUpperCase();

    switch (formulaType) {
      case "ROI":
        return inputs.initialCost > 0
          ? ((toNumber(inputs.finalValue, 0) - toNumber(inputs.initialCost, 0)) / toNumber(inputs.initialCost, 1)) * 100
          : storedActual;
      case "BUSINESS_SURVIVAL_RATE":
        return inputs.totalFundedCompanies > 0
          ? (toNumber(inputs.activePortfolioCompanies, 0) / toNumber(inputs.totalFundedCompanies, 1)) * 100
          : storedActual;
      case "CORPORATE_GOVERNANCE_INDEX": {
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "GOVERNANCE_CHECKLIST_INDEX") return storedActual;
        return inputs.totalGovernanceRequirements > 0
          ? (toNumber(inputs.complianceItemsMet, 0) / toNumber(inputs.totalGovernanceRequirements, 1)) * 100
          : storedActual;
      }
      case "STAKEHOLDER_SATISFACTION_INDEX":
      case "EMPLOYEE_SATISFACTION_INDEX":
      case "CUSTOMER_SATISFACTION_INDEX":
        return toNumber(inputs.averageSurveyScore, storedActual) * 100;
      case "FUNDING_RATE":
        return inputs.projectsApproved > 0
          ? (toNumber(inputs.projectsFunded, 0) / toNumber(inputs.projectsApproved, 1)) * 100
          : storedActual;
      case "PROJECTS_FUNDED":
        return inputs.targetProjects > 0
          ? (toNumber(inputs.projectsFunded, 0) / toNumber(inputs.targetProjects, 1)) * 100
          : storedActual;
      case "CAPITAL_DISBURSED":
        return inputs.budgetedCapital > 0
          ? (toNumber(inputs.capitalDisbursed, 0) / toNumber(inputs.budgetedCapital, 1)) * 100
          : storedActual;
      case "RESOURCES_MOBILISED":
      case "ALTERNATIVE_RESOURCES_MOBILISED":
        return inputs.targetAmount > 0
          ? (toNumber(inputs.amountRaised, 0) / toNumber(inputs.targetAmount, 1)) * 100
          : storedActual;
      case "CHARTER_SCORE":
        return [
          ["charterReviewed", 20],
          ["charterDisplayed", 30],
          ["charterAvailableOnline", 35],
          ["charterLocalLanguages", 5],
          ["customerAwareness", 10]
        ].reduce((sum, [key, weight]) => sum + ((toNumber(inputs[key], 0) * weight) / 100), 0);
      case "EASE_OF_DOING_BUSINESS": {
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "EASE_OF_DOING_BUSINESS_PROGRESS") return storedActual;
        return inputs.targetInnovations > 0
          ? (toNumber(inputs.innovationsCompleted, 0) / toNumber(inputs.targetInnovations, 1)) * 100
          : storedActual;
      }
      case "STRATEGIC_ALLOCATION_COMPLIANCE":
        return inputs.totalBudget > 0
          ? (toNumber(inputs.budgetAlignedToPolicy, 0) / toNumber(inputs.totalBudget, 1)) * 100
          : storedActual;
      case "STATUTORY_REPORTS": {
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "STATUTORY_REPORTS_OUTPUT") {
          const tc =
            toNumber(goal.preciseTargetValue, 0) ||
            toNumber(goal.targetValue, 0) ||
            toNumber(inputs.targetCount ?? inputs.reports_planned ?? inputs.reports_target, 0);
          const cc = storedActual;
          if (tc > 0) return (cc / tc) * 100;
          return storedActual;
        }
        return inputs.targetCount > 0
          ? (toNumber(inputs.completedCount, 0) / toNumber(inputs.targetCount, 1)) * 100
          : storedActual;
      }
      case "INTERNAL_PROCESS_EFFICIENCY":
      case "E_GOVERNMENT_FLAGSHIPS":
      case "PROJECTS_COMMISSIONED":
      case "POLICIES_FORMULATED":
      case "MONITORING_REPORTS":
      case "PERFORMANCE_LEVELS_EVALUATED":
      case "PERFORMANCE_CONTRACTS_SIGNED":
      case "STRATEGIC_PLANNING_REVIEWS":
      case "POLICIES_SUBMITTED_TO_MINISTER":
      case "DISPOSAL_OF_IDLE_ASSETS":
      case "NDS2_PROGRAMME_ACHIEVEMENT":
        return inputs.targetCount > 0
          ? (toNumber(inputs.completedCount, 0) / toNumber(inputs.targetCount, 1)) * 100
          : storedActual;
      case "STAFF_RETENTION":
        return inputs.totalStaff > 0
          ? (toNumber(inputs.retainedStaff, 0) / toNumber(inputs.totalStaff, 1)) * 100
          : storedActual;
      case "CODE_OF_ETHICS_COMPLIANCE":
        return inputs.totalEmployees > 0
          ? (toNumber(inputs.compliantEmployees, 0) / toNumber(inputs.totalEmployees, 1)) * 100
          : storedActual;
      default:
        return storedActual;
    }
  }

  /**
   * CEO scorecard: compute indicator actual from `activities` / stored fields.
   * Division by zero or missing required inputs => `{ value: 0, missingValue: true }` (spec Step 4/5).
   */
  private static extractCEOFormulaActual(goal: any): { value: number; missingValue: boolean } {
    const inputs = goal.activities && typeof goal.activities === "object" ? goal.activities : {};
    const storedResolved = resolveStoredGoalActual(goal);
    const storedActual = storedResolved.value;
    const raw = String(goal.formulaType || "direct").trim().replace(/-/g, "_").toUpperCase();

    const miss = () => ({ value: 0, missingValue: true });
    const ok = (v: number) => ({ value: round(toNumber(v, 0), 4), missingValue: false });

    const scSkillsCeo = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
    const bscKindCeo = String((scSkillsCeo as any).bscEntryKind || "").trim();
    if (bscKindCeo === "SKILLS_DEVELOPMENT_PROGRESS" || bscKindCeo === "CSR_PARTICIPATION_RATE") {
      return ok(storedActual);
    }

    const type =
      raw === "SURVIVAL_RATE"
        ? "BUSINESS_SURVIVAL_RATE"
        : raw === "GOVERNANCE_INDEX"
          ? "CORPORATE_GOVERNANCE_INDEX"
          : raw === "DISBURSEMENT_RATE"
            ? "CAPITAL_DISBURSED"
            : raw === "MOBILISATION_RATE" || raw === "MOBILIZATION_RATE"
              ? "RESOURCES_MOBILISED"
              : raw === "COMPOSITE"
                ? "CHARTER_SCORE"
                : raw === "ALLOCATION_COMPLIANCE"
                  ? "STRATEGIC_ALLOCATION_COMPLIANCE"
                  : raw === "COMPLIANCE_RATE"
                    ? "CODE_OF_ETHICS_COMPLIANCE"
                    : raw === "RETENTION_RATE"
                      ? "STAFF_RETENTION"
                      : raw === "DEBT_EQUITY_RATIO"
                        ? "RATIO"
                        : raw;

    switch (type) {
      case "DIRECT":
      case "": {
        const fromActs = toNumber(
          inputs.efficiency_rating_pct ?? inputs.financial_sustainability_pct ?? inputs.total_income,
          NaN
        );
        if (!storedResolved.hasExplicitStored && Number.isFinite(fromActs)) {
          return ok(fromActs);
        }
        return ok(storedActual);
      }
      case "ROI": {
        // BSC financial-outcome ROI (net profit ÷ capital) is written to currentValue + syncConfig.bscEntryKind.
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "FINANCIAL_OUTCOME_ROI") {
          return ok(storedActual);
        }
        if (!(toNumber(inputs.initialCost, 0) > 0)) {
          return storedResolved.hasExplicitStored ? ok(storedActual) : miss();
        }
        return ok(
          ((toNumber(inputs.finalValue, 0) - toNumber(inputs.initialCost, 0)) / toNumber(inputs.initialCost, 1)) *
            100
        );
      }
      case "REVENUE_GROWTH": {
        const prev = toNumber(inputs.previousRevenue ?? inputs.previous_revenue, 0);
        if (prev <= 0) return miss();
        return ok(
          ((toNumber(inputs.currentRevenue ?? inputs.current_revenue, 0) - prev) / prev) * 100
        );
      }
      case "RATIO": {
        const eq = toNumber(inputs.totalShareholdersEquity ?? inputs.total_shareholders_equity, 0);
        if (eq <= 0) return miss();
        return ok(toNumber(inputs.totalLiabilities ?? inputs.total_liabilities, 0) / eq);
      }
      case "BUSINESS_SURVIVAL_RATE":
        if (!(toNumber(inputs.totalFundedCompanies, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.activePortfolioCompanies, 0) / toNumber(inputs.totalFundedCompanies, 1)) * 100
        );
      case "CORPORATE_GOVERNANCE_INDEX": {
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "GOVERNANCE_CHECKLIST_INDEX") return ok(storedActual);
        const totReq = toNumber(inputs.totalGovernanceRequirements ?? inputs.total_governance_requirements, 0);
        const met = toNumber(inputs.complianceItemsMet ?? inputs.compliance_items_met, 0);
        if (!(totReq > 0)) return miss();
        return ok((met / totReq) * 100);
      }
      case "SURVEY_AVERAGE":
      case "STAKEHOLDER_SATISFACTION_INDEX":
      case "EMPLOYEE_SATISFACTION_INDEX":
      case "CUSTOMER_SATISFACTION_INDEX": {
        let avg: number;
        if (Array.isArray(inputs.surveyScores) && inputs.surveyScores.length > 0) {
          avg =
            inputs.surveyScores.reduce((s: number, x: any) => s + toNumber(x, 0), 0) /
            inputs.surveyScores.length;
        } else {
          avg = toNumber(inputs.averageSurveyScore, NaN);
        }
        if (!Number.isFinite(avg)) return miss();
        return ok(avg * 100);
      }
      case "FUNDING_RATE":
        if (!(toNumber(inputs.projectsApproved, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.projectsFunded, 0) / toNumber(inputs.projectsApproved, 1)) * 100
        );
      case "PROJECTS_FUNDED":
        if (!(toNumber(inputs.targetProjects, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.projectsFunded, 0) / toNumber(inputs.targetProjects, 1)) * 100
        );
      case "CAPITAL_DISBURSED":
        if (!(toNumber(inputs.budgetedCapital, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.capitalDisbursed, 0) / toNumber(inputs.budgetedCapital, 1)) * 100
        );
      case "RESOURCES_MOBILISED":
      case "ALTERNATIVE_RESOURCES_MOBILISED":
        if (!(toNumber(inputs.targetAmount, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.amountRaised, 0) / toNumber(inputs.targetAmount, 1)) * 100
        );
      case "CHARTER_SCORE":
        return ok(
          (
            [
              ["charterReviewed", 20],
              ["charterDisplayed", 30],
              ["charterAvailableOnline", 35],
              ["charterLocalLanguages", 5],
              ["customerAwareness", 10]
            ] as const
          ).reduce((sum, [key, w]) => sum + (toNumber(inputs[key], 0) * w) / 100, 0)
        );
      case "EASE_OF_DOING_BUSINESS": {
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "EASE_OF_DOING_BUSINESS_PROGRESS") return ok(storedActual);
        if (!(toNumber(inputs.targetInnovations, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.innovationsCompleted, 0) / toNumber(inputs.targetInnovations, 1)) * 100
        );
      }
      case "STRATEGIC_ALLOCATION_COMPLIANCE":
        if (!(toNumber(inputs.totalBudget, 0) > 0)) return miss();
        return ok(
          (toNumber(inputs.budgetAlignedToPolicy ?? inputs.budget_aligned_to_plan, 0) /
            toNumber(inputs.totalBudget, 1)) *
            100
        );
      case "COUNT_VS_TARGET": {
        const meta =
          inputs.metadata && typeof inputs.metadata === "object" && !Array.isArray(inputs.metadata)
            ? inputs.metadata
            : {};
        const num = toNumber(
          inputs.completedCount ??
            inputs.evaluated_levels ??
            inputs.contracts_signed ??
            inputs.reviews_completed ??
            inputs.reportsSubmitted ??
            inputs.reports_submitted ??
            inputs.reportsProduced ??
            inputs.reports_produced ??
            inputs.policiesApproved ??
            inputs.policies_approved ??
            inputs.policiesSubmitted ??
            inputs.policies_submitted ??
            inputs.achieved_KPIs ??
            inputs.achieved_kpis ??
            inputs.projectsFunded ??
            inputs.projects_commissioned ??
            inputs.assetsDisposed ??
            inputs.assets_disposed ??
            inputs.itInitiativesCompleted ??
            inputs.it_initiatives_completed ??
            inputs.innovationsCompleted ??
            inputs.measuresImplemented,
          NaN
        );
        const den = toNumber(
          inputs.targetCount ??
            inputs.total_levels ??
            inputs.contracts_planned ??
            inputs.contracts_target ??
            inputs.reviews_planned ??
            inputs.reportsPlanned ??
            inputs.reports_planned ??
            inputs.reportsTarget ??
            inputs.reports_target ??
            inputs.policies_target ??
            inputs.planned_KPIs ??
            inputs.planned_kpis ??
            inputs.targetProjects ??
            inputs.target_projects ??
            meta.targetProjects ??
            inputs.assets_planned_for_disposal ??
            inputs.it_initiatives_planned ??
            inputs.targetInnovations ??
            inputs.targetMeasures ??
            inputs.targetInitiatives,
          NaN
        );
        if (!Number.isFinite(den) || den <= 0 || !Number.isFinite(num)) return miss();
        return ok((num / den) * 100);
      }
      case "STATUTORY_REPORTS": {
        const sc = goal.syncConfig && typeof goal.syncConfig === "object" ? goal.syncConfig : {};
        const bscKind = String((sc as any).bscEntryKind || "").trim();
        if (bscKind === "STATUTORY_REPORTS_OUTPUT") {
          const tc =
            toNumber(goal.preciseTargetValue, 0) ||
            toNumber(goal.targetValue, 0) ||
            toNumber(inputs.targetCount ?? inputs.reports_planned ?? inputs.reports_target, 0);
          const cc = storedActual;
          if (!(tc > 0)) return miss();
          return ok((cc / tc) * 100);
        }
        const tc = toNumber(
          inputs.targetCount ??
            inputs.total_levels ??
            inputs.contracts_planned ??
            inputs.contracts_target ??
            inputs.reviews_planned ??
            inputs.reports_planned ??
            inputs.reports_target ??
            inputs.policies_target ??
            inputs.planned_KPIs ??
            inputs.planned_kpis ??
            inputs.target_projects ??
            inputs.assets_planned_for_disposal ??
            inputs.it_initiatives_planned,
          0
        );
        const cc = toNumber(
          inputs.completedCount ??
            inputs.evaluated_levels ??
            inputs.contracts_signed ??
            inputs.reviews_completed ??
            inputs.reports_submitted ??
            inputs.reports_produced ??
            inputs.policies_approved ??
            inputs.policies_submitted ??
            inputs.achieved_KPIs ??
            inputs.achieved_kpis ??
            inputs.projects_commissioned ??
            inputs.assets_disposed ??
            inputs.it_initiatives_completed,
          0
        );
        if (!(tc > 0)) return miss();
        return ok((cc / tc) * 100);
      }
      case "INTERNAL_PROCESS_EFFICIENCY":
      case "E_GOVERNMENT_FLAGSHIPS":
      case "PROJECTS_COMMISSIONED":
      case "POLICIES_FORMULATED":
      case "MONITORING_REPORTS":
      case "PERFORMANCE_LEVELS_EVALUATED":
      case "PERFORMANCE_CONTRACTS_SIGNED":
      case "STRATEGIC_PLANNING_REVIEWS":
      case "POLICIES_SUBMITTED_TO_MINISTER":
      case "DISPOSAL_OF_IDLE_ASSETS":
      case "NDS2_PROGRAMME_ACHIEVEMENT": {
        const tc = toNumber(
          inputs.targetCount ??
            inputs.total_levels ??
            inputs.contracts_planned ??
            inputs.contracts_target ??
            inputs.reviews_planned ??
            inputs.reports_planned ??
            inputs.reports_target ??
            inputs.policies_target ??
            inputs.planned_KPIs ??
            inputs.planned_kpis ??
            inputs.target_projects ??
            inputs.assets_planned_for_disposal ??
            inputs.it_initiatives_planned,
          0
        );
        const cc = toNumber(
          inputs.completedCount ??
            inputs.evaluated_levels ??
            inputs.contracts_signed ??
            inputs.reviews_completed ??
            inputs.reports_submitted ??
            inputs.reports_produced ??
            inputs.policies_approved ??
            inputs.policies_submitted ??
            inputs.achieved_KPIs ??
            inputs.achieved_kpis ??
            inputs.projects_commissioned ??
            inputs.assets_disposed ??
            inputs.it_initiatives_completed,
          0
        );
        if (!(tc > 0)) return miss();
        return ok((cc / tc) * 100);
      }
      case "STAFF_RETENTION": {
        const ts = toNumber(inputs.totalStaff ?? inputs.total_staff, 0);
        const rs = toNumber(inputs.retainedStaff ?? inputs.retained_staff, 0);
        if (!(ts > 0)) return miss();
        return ok((rs / ts) * 100);
      }
      case "CODE_OF_ETHICS_COMPLIANCE": {
        const denom = toNumber(
          inputs.totalEmployees ?? inputs.total_employees ?? inputs.SOPs_planned ?? inputs.sops_planned,
          0
        );
        const numer = toNumber(
          inputs.compliantEmployees ??
            inputs.compliant_employees ??
            inputs.SOPs_implemented ??
            inputs.sops_implemented,
          0
        );
        if (!(denom > 0)) return miss();
        return ok((numer / denom) * 100);
      }
      default:
        return ok(storedActual);
    }
  }

  private static ceoIndicatorRowSeverity(row: any): string {
    if (row.isPendingApproval) return "pending";
    if (row.excludedFromScoring) return "excluded";
    return rawRatingToRowSeverity(row.rawRating);
  }

  private static buildCEOSectionRows(goals: any[], contract: any, warningsOut: string[]) {
    const sectionOrder = ["A1", "A2", "B", "C", "D"];
    const countBySection: Record<string, number> = {};
    for (const g of goals) {
      const k = g.scorecardSection || "UNASSIGNED";
      countBySection[k] = (countBySection[k] || 0) + 1;
    }

    const base = goals.map((goal) => {
      const section = goal.scorecardSection || "UNASSIGNED";
      const n = countBySection[section] || 1;
      const fallbackWeight = 100 / n;
      const { value: computedActual, missingValue: formulaMissing } = this.extractCEOFormulaActual(goal);
      const storedResolved = resolveStoredGoalActual(goal);
      let effectiveActual = computedActual;
      let effectiveMissing = formulaMissing;
      if (formulaMissing && storedResolved.hasExplicitStored) {
        effectiveActual = storedResolved.value;
        effectiveMissing = false;
      }
      const isPending = Boolean(goal.isPendingApproval);
      const excludedFromScoring = isPending || effectiveMissing;
      const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
      const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
      const weight = resolveWeight(goal.scorecardWeight, fallbackWeight);
      const unit = goal.targetUnit || goal.measureName || null;

      let rawRating: number | null = null;
      if (!excludedFromScoring) {
        rawRating = computeRawRating({
          actualValue: effectiveActual,
          targetValue,
          allowableVariance: goal.allowableVariance,
          isReverseKpi: goal.isReverseKpi
        });
      }

      const progress = excludedFromScoring
        ? { progressPct: null as number | null }
        : computeGoalProgress({
            actualValue: effectiveActual,
            targetValue,
            isReverseKpi: goal.isReverseKpi,
            stretchScoringEnabled: contract?.stretchScoringEnabled,
            stretchTargetValue
          });

      return {
        id: goal.id,
        section,
        indicatorName: goal.title,
        formulaType: goal.formulaType || "direct",
        unit,
        targetValue,
        stretchTargetValue,
        computedActual: round(effectiveActual, 4),
        allowableVariance: toNumber(goal.allowableVariance, 0.1),
        isReverseKpi: Boolean(goal.isReverseKpi),
        isPendingApproval: isPending,
        excludedFromScoring,
        missingValue: effectiveMissing && !isPending,
        originalWeight: round(weight, 4),
        weight,
        rawRating,
        progressPct: progress.progressPct,
        effectiveWeight: 0,
        weightedScore: 0,
        goal
      };
    });

    for (const key of sectionOrder) {
      const rowsInSec = base.filter((r) => r.section === key);
      if (!rowsInSec.length) continue;
      const sumW = rowsInSec.reduce((s, r) => s + toNumber(r.weight, 0), 0);
      if (Math.abs(sumW - 100) > 0.01) {
        warningsOut.push(
          `Section ${key} (${CEO_SECTION_LABELS[key] || key}) indicator weights sum to ${round(sumW, 2)}, not 100.`
        );
      }
      const active = rowsInSec.filter((r) => !r.excludedFromScoring);
      if (active.length === 0 && rowsInSec.length > 0) {
        warningsOut.push(
          `All indicators in section ${key} (${CEO_SECTION_LABELS[key] || key}) are excluded or missing; section score is 0.`
        );
      }
      const totalActiveW = active.reduce((s, r) => s + toNumber(r.weight, 0), 0);
      for (const r of base) {
        if (r.section !== key) continue;
        if (r.excludedFromScoring) {
          r.effectiveWeight = 0;
          r.weightedScore = 0;
        } else {
          const eff = totalActiveW > 0 ? (toNumber(r.weight, 0) / totalActiveW) * 100 : 0;
          r.effectiveWeight = round(eff, 4);
          r.weightedScore =
            r.rawRating != null ? round((r.effectiveWeight * r.rawRating) / 100, 4) : 0;
        }
      }
    }

    for (const r of base) {
      if (!sectionOrder.includes(r.section)) {
        warningsOut.push(
          `Indicator "${r.indicatorName}" is in unknown section "${r.section}" and is omitted from fixed section totals.`
        );
      }
    }

    return base;
  }

  private static summariseCEOSectionScores(
    flatRows: any[],
    sectionWeights: Record<string, number>,
    opts?: {
      sectionBlendMode?: "penalise" | "redistribute";
      warningsOut?: string[];
      sectionLabels?: Record<string, string>;
    }
  ) {
    const blendMode = opts?.sectionBlendMode ?? "redistribute";
    const warningsOut = opts?.warningsOut;
    const sectionLabels = opts?.sectionLabels ?? CEO_SECTION_LABELS;

    const keys = Object.keys(sectionWeights);
    const sections = keys.map((sectionKey) => {
      const sectionRows = flatRows.filter((row) => row.section === sectionKey);
      const activeW = sectionRows.reduce((sum, row) => sum + toNumber(row.effectiveWeight, 0), 0);
      const totalWeightedScore = sectionRows.reduce(
        (sum, row) => sum + toNumber(row.weightedScore, 0),
        0
      );
      const sectionScore =
        activeW > 0 ? round((totalWeightedScore * 100) / activeW, 4) : 0;
      const scoreableCount = sectionRows.filter((r) => !r.excludedFromScoring).length;
      return {
        key: sectionKey,
        label: sectionLabels[sectionKey] || sectionKey,
        weight: sectionWeights[sectionKey] / 100,
        weightPercent: sectionWeights[sectionKey],
        sectionScore,
        performanceLabel: ceoPerformanceLabelForSection(
          sectionScore,
          sectionRows.length,
          scoreableCount
        ),
        indicators: sectionRows
      };
    });

    let finalScore: number;
    if (blendMode === "penalise") {
      finalScore = round(
        sections.reduce((sum, sec) => sum + (sectionWeights[sec.key] * sec.sectionScore) / 100, 0),
        2
      );
    } else {
      let totalBlendW = 0;
      let weightedSum = 0;
      for (const sec of sections) {
        const scoreableCount = sec.indicators.filter((r: any) => !r.excludedFromScoring).length;
        const w = toNumber(sectionWeights[sec.key], 0);
        if (scoreableCount > 0) {
          totalBlendW += w;
          weightedSum += w * sec.sectionScore;
        } else if (sec.indicators.length > 0 && warningsOut) {
          warningsOut.push(
            `Section ${sec.key} (${sectionLabels[sec.key] || sec.key}) has no scoreable indicators and has been excluded from the final score calculation; its weight (${round(w, 2)}%) was redistributed across remaining sections.`
          );
        }
      }
      finalScore = totalBlendW > 0 ? round(weightedSum / totalBlendW, 2) : 0;
    }

    return { sections, finalScore };
  }

  private static buildBoardSectionRows(goals: any[], contract: any, warningsOut: string[]) {
    const sectionOrder = ["A1", "A2", "B", "C", "D"];
    const countBySection: Record<string, number> = {};
    for (const g of goals) {
      const k = g.scorecardSection || "UNASSIGNED";
      countBySection[k] = (countBySection[k] || 0) + 1;
    }

    const base = goals.map((goal) => {
      const section = goal.scorecardSection || "UNASSIGNED";
      const n = countBySection[section] || 1;
      const fallbackWeight = 100 / n;
      const { value: computedActual, missingValue: formulaMissing } = this.extractCEOFormulaActual(goal);
      const storedResolved = resolveStoredGoalActual(goal);
      let effectiveActual = computedActual;
      let effectiveMissing = formulaMissing;
      if (formulaMissing && storedResolved.hasExplicitStored) {
        effectiveActual = storedResolved.value;
        effectiveMissing = false;
      }
      const isPending = Boolean(goal.isPendingApproval);
      const excludedFromScoring = isPending || effectiveMissing;
      const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
      const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
      const weight = resolveWeight(goal.scorecardWeight, fallbackWeight);
      const unit = goal.targetUnit || goal.measureName || null;

      let rawRating: number | null = null;
      if (!excludedFromScoring) {
        rawRating = computeRawRating({
          actualValue: effectiveActual,
          targetValue,
          allowableVariance: goal.allowableVariance,
          isReverseKpi: goal.isReverseKpi
        });
      }

      const progress = excludedFromScoring
        ? { progressPct: null as number | null }
        : computeGoalProgress({
            actualValue: effectiveActual,
            targetValue,
            isReverseKpi: goal.isReverseKpi,
            stretchScoringEnabled: contract?.stretchScoringEnabled,
            stretchTargetValue
          });

      return {
        id: goal.id,
        section,
        indicatorName: goal.title,
        formulaType: goal.formulaType || "direct",
        unit,
        targetValue,
        stretchTargetValue,
        computedActual: round(effectiveActual, 4),
        allowableVariance: toNumber(goal.allowableVariance, 0.1),
        isReverseKpi: Boolean(goal.isReverseKpi),
        isPendingApproval: isPending,
        excludedFromScoring,
        missingValue: effectiveMissing && !isPending,
        originalWeight: round(weight, 4),
        weight,
        rawRating,
        progressPct: progress.progressPct,
        effectiveWeight: 0,
        weightedScore: 0,
        goal
      };
    });

    for (const key of sectionOrder) {
      const rowsInSec = base.filter((r) => r.section === key);
      if (!rowsInSec.length) continue;
      const sumW = rowsInSec.reduce((s, r) => s + toNumber(r.weight, 0), 0);
      if (Math.abs(sumW - 100) > 0.01) {
        warningsOut.push(
          `Section ${key} (${BOARD_SECTION_LABELS[key] || key}) indicator weights sum to ${round(sumW, 2)}, not 100.`
        );
      }
      const active = rowsInSec.filter((r) => !r.excludedFromScoring);
      if (active.length === 0 && rowsInSec.length > 0) {
        warningsOut.push(
          `All indicators in section ${key} (${BOARD_SECTION_LABELS[key] || key}) are excluded or missing; section score is 0.`
        );
      }
      const totalActiveW = active.reduce((s, r) => s + toNumber(r.weight, 0), 0);
      for (const r of base) {
        if (r.section !== key) continue;
        if (r.excludedFromScoring) {
          r.effectiveWeight = 0;
          r.weightedScore = 0;
        } else {
          const eff = totalActiveW > 0 ? (toNumber(r.weight, 0) / totalActiveW) * 100 : 0;
          r.effectiveWeight = round(eff, 4);
          r.weightedScore =
            r.rawRating != null ? round((r.effectiveWeight * r.rawRating) / 100, 4) : 0;
        }
      }
    }

    for (const r of base) {
      if (!sectionOrder.includes(r.section)) {
        warningsOut.push(
          `Indicator "${r.indicatorName}" is in unknown section "${r.section}" and is omitted from fixed section totals.`
        );
      }
    }

    return base;
  }

  private static summariseBoardSectionScores(
    flatRows: any[],
    sectionWeights: Record<string, number>,
    opts?: {
      sectionBlendMode?: "penalise" | "redistribute";
      warningsOut?: string[];
      sectionLabels?: Record<string, string>;
    }
  ) {
    const blendMode = opts?.sectionBlendMode ?? "redistribute";
    const warningsOut = opts?.warningsOut;
    const sectionLabels = opts?.sectionLabels ?? BOARD_SECTION_LABELS;

    const keys = Object.keys(sectionWeights);
    const sections = keys.map((sectionKey) => {
      const sectionRows = flatRows.filter((row) => row.section === sectionKey);
      const activeW = sectionRows.reduce((sum, row) => sum + toNumber(row.effectiveWeight, 0), 0);
      const totalWeightedScore = sectionRows.reduce(
        (sum, row) => sum + toNumber(row.weightedScore, 0),
        0
      );
      const sectionScore =
        activeW > 0 ? round((totalWeightedScore * 100) / activeW, 4) : 0;
      const scoreableCount = sectionRows.filter((r) => !r.excludedFromScoring).length;
      return {
        key: sectionKey,
        label: sectionLabels[sectionKey] || sectionKey,
        weight: sectionWeights[sectionKey] / 100,
        weightPercent: sectionWeights[sectionKey],
        sectionScore,
        performanceLabel: ceoPerformanceLabelForSection(
          sectionScore,
          sectionRows.length,
          scoreableCount
        ),
        indicators: sectionRows
      };
    });

    let finalScore: number;
    if (blendMode === "penalise") {
      finalScore = round(
        sections.reduce((sum, sec) => sum + (sectionWeights[sec.key] * sec.sectionScore) / 100, 0),
        2
      );
    } else {
      let totalBlendW = 0;
      let weightedSum = 0;
      for (const sec of sections) {
        const scoreableCount = sec.indicators.filter((r: any) => !r.excludedFromScoring).length;
        const w = toNumber(sectionWeights[sec.key], 0);
        if (scoreableCount > 0) {
          totalBlendW += w;
          weightedSum += w * sec.sectionScore;
        } else if (sec.indicators.length > 0 && warningsOut) {
          warningsOut.push(
            `Section ${sec.key} (${sectionLabels[sec.key] || sec.key}) has no scoreable indicators and has been excluded from the final score calculation; its weight (${round(w, 2)}%) was redistributed across remaining sections.`
          );
        }
      }
      finalScore = totalBlendW > 0 ? round(weightedSum / totalBlendW, 2) : 0;
    }

    return { sections, finalScore };
  }

  private static buildSectionRows(goals: any[], contract: any) {
    const fallbackWeight = goals.length > 0 ? 100 / goals.length : 0;

    return goals.map((goal) => {
      const actualValue = this.extractFormulaActual(goal);
      const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
      const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
      const weight = resolveWeight(goal.scorecardWeight, fallbackWeight);
      const progress = computeGoalProgress({
        actualValue,
        targetValue,
        isReverseKpi: goal.isReverseKpi,
        stretchScoringEnabled: contract?.stretchScoringEnabled
      });
      const rawRating = computeRawRating({
        actualValue,
        targetValue,
        allowableVariance: goal.allowableVariance,
        isReverseKpi: goal.isReverseKpi
      });

      return {
        id: goal.id,
        section: goal.scorecardSection || "UNASSIGNED",
        heading: goal.scorecardSection || "Unassigned",
        indicator: goal.title,
        formulaType: goal.formulaType || "DIRECT",
        weight,
        targetValue,
        stretchTargetValue,
        actualValue: round(actualValue, 4),
        allowableVariance: toNumber(goal.allowableVariance, 0.1),
        progressPct: progress.progressPct,
        rawRating,
        weightedScore: round((weight * rawRating) / 100, 4),
        goal
      };
    });
  }

  private static summariseSectionScores(rows: any[], sectionWeights: Record<string, number>) {
    const bySection = Object.keys(sectionWeights).map((sectionKey) => {
      const sectionRows = rows.filter((row) => row.section === sectionKey);
      const totalIndicatorWeight = sectionRows.reduce((sum, row) => sum + row.weight, 0);
      const sectionScore = totalIndicatorWeight > 0
        ? round(sectionRows.reduce((sum, row) => sum + row.weightedScore, 0) / totalIndicatorWeight, 4)
        : 0;

      return {
        key: sectionKey,
        score: sectionScore,
        weight: sectionWeights[sectionKey],
        indicators: sectionRows
      };
    });

    const finalScore = bySection.reduce(
      (sum, section) => sum + (section.weight * section.score) / 100,
      0
    );

    return {
      sections: bySection,
      finalScore: round(finalScore, 2)
    };
  }

  private static async upsertDraftScorecard(payload: any) {
    const existing = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: payload.scorecardType,
        subjectUserId: payload.subjectUserId || null,
        departmentName: payload.departmentName || null,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        isLocked: false,
        status: "DRAFT"
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    if (existing) {
      return prisma.performanceScorecard.update({
        where: { id: existing.id },
        data: payload
      });
    }

    return prisma.performanceScorecard.create({
      data: payload
    });
  }

  /** Walk `parentGoalId` chain to the top-level performance goal (no parent). */
  private static async findPerformanceGoalRootId(startId: string): Promise<string | null> {
    let current = await prisma.performanceGoal.findUnique({
      where: { id: startId },
      select: { id: true, parentGoalId: true }
    });
    if (!current) {
      return null;
    }
    while (current.parentGoalId) {
      const next = await prisma.performanceGoal.findUnique({
        where: { id: current.parentGoalId },
        select: { id: true, parentGoalId: true }
      });
      if (!next) {
        break;
      }
      current = next;
    }
    return current.id;
  }

  /**
   * Batches unique **company roots** then runs one bottom-up rollup per root (not once per
   * department parent). Skips the heavy `calculateGoalRollup` read — same persisted goal updates
   * as before, much faster when many department goals share one strategy tree.
   */
  private static async triggerUpwardRecalculation(goals: { parentGoalId?: string | null }[]) {
    const parentGoalIds = Array.from(
      new Set(
        goals
          .map((goal) => goal.parentGoalId)
          .filter(Boolean)
      )
    ) as string[];

    const rootIds = new Set<string>();
    for (const parentGoalId of parentGoalIds) {
      const rootId = await this.findPerformanceGoalRootId(parentGoalId);
      if (rootId) {
        rootIds.add(rootId);
      }
    }

    for (const rootId of rootIds) {
      try {
        await RollupCalculationService.syncEntireGoalHierarchyFromRoot(rootId);
      } catch (error) {
        console.error(`Failed to recalculate rollups for root ${rootId}:`, error);
      }
    }
  }

  static async getEmployeeScorecard(params: {
    viewer: any;
    employeeUserId: string;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
  }) {
    const periodInput = this.buildPeriod(params);
    const contractPeriodWhere = this.buildContractPeriodWhere(periodInput);

    const [employeeUser, contract, branding] = await Promise.all([
      prisma.user.findUnique({
        where: { id: params.employeeUserId },
        include: { role: true, employee: true }
      }),
      prisma.performanceContract.findFirst({
        where: {
          contractType: "EMPLOYEE",
          subjectUserId: params.employeeUserId,
          ...contractPeriodWhere,
          status: { notIn: ["ARCHIVED", "CANCELLED"] }
        },
        select: {
          id: true,
          title: true,
          periodLabel: true,
          periodStart: true,
          periodEnd: true,
          stretchScoringEnabled: true,
          allocatedBudget: true,
          actualSpend: true,
          qualitativeTemplate: true,
          reviewer: {
            select: { id: true, firstName: true, lastName: true, departmentRole: true, role: { select: { name: true } } }
          }
        },
        orderBy: { updatedAt: "desc" }
      }),
      getCachedBranding()
    ]);

    const companyProfile = branding.profile;
    const activeLetterhead = branding.letterhead;

    if (!employeeUser) {
      throw new Error("Employee not found");
    }
    if (!contract) {
      throw new Error("No active performance contract found for this employee in the selected period.");
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        assignedToId: params.employeeUserId,
        type: "individual",
        OR: [
          { performanceContractId: contract.id },
          this.buildPeriodWhere({
            periodStart: contract.periodStart,
            periodEnd: contract.periodEnd
          })
        ]
      },
      include: {
        kpi: true,
        parentGoal: {
          select: { id: true, title: true, departmentName: true, scorecardPillar: true, parentGoalId: true }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    });

    const employeeRecord = employeeUser.employee;
    const period = {
      periodStart: contract.periodStart,
      periodEnd: contract.periodEnd,
      periodLabel: contract.periodLabel
    };

    await this.assertEmployeeAccess(params.viewer, employeeUser, employeeRecord, params.persist ? "generate" : "view", params.meta);

    const dept = String(employeeUser.userDepartment || "").trim();
    const goalIds = goals.map((g) => g.id);
    const needsFallbackAppraiser = !contract.reviewer;

    const phase2Queries: Promise<any>[] = [
      goalIds.length > 0
        ? prisma.task.findMany({
            where: { goalId: { in: goalIds }, isTrashed: false },
            select: { id: true, title: true, stage: true, status: true, date: true, updatedAt: true, goalId: true }
          })
        : Promise.resolve([]),
      needsFallbackAppraiser && dept
        ? prisma.user.findFirst({
            where: {
              departmentRole: "HEAD",
              userDepartment: dept,
              id: { not: employeeUser.id }
            },
            select: { id: true, firstName: true, lastName: true, departmentRole: true, role: { select: { name: true } } }
          })
        : Promise.resolve(null),
      needsFallbackAppraiser && employeeRecord?.lineManagerUserId
        ? prisma.user.findUnique({
            where: { id: employeeRecord.lineManagerUserId },
            select: { id: true, firstName: true, lastName: true, departmentRole: true, role: { select: { name: true } } }
          })
        : Promise.resolve(null)
    ];
    if (params.persist) {
      phase2Queries.push(
        prisma.performanceScorecard.findFirst({
          where: {
            scorecardType: "EMPLOYEE",
            subjectUserId: employeeUser.id,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            isLocked: false,
            status: "DRAFT"
          },
          select: { id: true },
          orderBy: { updatedAt: "desc" }
        })
      );
    }

    const [tasksByGoalIdRaw, departmentHeadUser, directManagerUser, existingScorecardResult] = await Promise.all(
      phase2Queries
    );

    const latestScorecardForLifecycle = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "EMPLOYEE",
        subjectUserId: employeeUser.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { status: true, isLocked: true, archivedAt: true }
    });

    const tasksByGoalId = new Map<string, any[]>();
    for (const t of tasksByGoalIdRaw) {
      if (!t.goalId) continue;
      const list = tasksByGoalId.get(t.goalId) || [];
      list.push(t);
      tasksByGoalId.set(t.goalId, list);
    }

    const warnings: string[] = [];
    normalizeEmployeeGoalWeightsForScorecard(goals, warnings);
    assertIndividualGoalWeightsSum100(goals);

    const siblingCountByParent = new Map<string, number>();
    for (const g of goals) {
      const pid = g.parentGoalId;
      if (pid) siblingCountByParent.set(pid, (siblingCountByParent.get(pid) || 0) + 1);
    }

    if (goals.length > 0 && goals.every((g) => Boolean(g.isPendingApproval))) {
      throw new Error("No scoreable goals available.");
    }

    const rows = this.buildEmployeeIndividualGoalRows(goals, {
      stretchScoringEnabled: contract.stretchScoringEnabled,
      tasksByGoalId,
      warnings
    });

    const activeScoringRows = rows.filter((r) => !r.isPendingApproval && !r.excludedFromScoring);
    if (activeScoringRows.length === 0) {
      throw new Error("No scoreable goals available.");
    }

    if (!activeScoringRows.some((r) => r.hasRecordedPerformance)) {
      throw new Error("No performance data recorded for this employee in this period.");
    }

    const resultsSummary = summariseEmployeeResultsDelivery(rows);
    if (resultsSummary.pendingApprovalCount > 0) {
      warnings.push(
        `${resultsSummary.pendingApprovalCount} goal(s) are pending approval and were excluded from scoring.`
      );
    }

    const periodEndDate = new Date(period.periodEnd);
    const lifecycle = resolveScorecardLifecycleBanner(periodEndDate, latestScorecardForLifecycle);
    if (periodEndDate.getTime() > Date.now()) {
      warnings.push("This period has not ended. Scorecard reflects performance to date only.");
    }

    if (!contract.reviewer) {
      if (!departmentHeadUser && !directManagerUser) {
        warnings.push(
          "No contract reviewer is assigned, and no department HEAD (for this employee's department) or line manager was found. The scorecard cannot be finalised until an appraiser is assigned."
        );
      } else {
        warnings.push(
          "No contract reviewer is assigned on this performance contract. The document shows the department HEAD or line manager as appraiser for this draft only; assign a reviewer on the contract before finalisation."
        );
      }
    }

    const addressLogo =
      activeLetterhead?.logoUrl && String(activeLetterhead.logoUrl).trim()
        ? String(activeLetterhead.logoUrl).trim()
        : null;
    const organisationLogoUrl = addressLogo ?? companyProfile?.logoUrl ?? null;
    const organisationName = resolveOrganisationDisplayName(companyProfile?.legalName);

    if (!organisationLogoUrl) {
      warnings.push(
        "No letterhead logo is set on the active company address (Company Profile → Addresses) or on the company profile. The document is generated without letterhead logo."
      );
    }

    const budgetComponent = this.buildBudgetComponent(contract);
    const resultsDeliveryScore = resultsSummary.resultsDeliveryScore;
    const finalScore = budgetComponent.included
      ? round(resultsDeliveryScore * 0.9 + toNumber(budgetComponent.score, 0) * 0.1, 2)
      : round(resultsDeliveryScore, 2);

    const performanceLabel = performanceLabelFromScore(finalScore);

    const documentPayload = this.buildEmployeeDocument({
      employeeUser,
      contract,
      period,
      rows,
      resultsDeliveryScore,
      budgetComponent,
      finalScore,
      performanceLabel,
      generatedAt: new Date(),
      departmentHeadUser,
      directManagerUser,
      scorecardStatus: "DRAFT",
      organisationName,
      organisationLogoUrl
    });

    let scorecardRecord = null;
    if (params.persist) {
      const pLabel = resolvePeriodLabel({
        periodLabel: period.periodLabel,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      });
      const coreData: any = {
        contractId: contract.id,
        scorecardType: "EMPLOYEE",
        status: "DRAFT",
        subjectUserId: employeeUser.id,
        generatedById: params.viewer.id,
        periodLabel: pLabel,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        resultsDeliveryScore: decimalForStorage(resultsDeliveryScore),
        budgetScore: decimalForStorage(budgetComponent.score),
        finalScore: decimalForStorage(finalScore),
        warnings,
        sections: { resultsDeliveryScore, budgetComponent },
        matrixRows: rows.map(({ linkedTasks: _lt, sourceGoal: _sg, ...row }) => row),
        qualitativeSections: documentPayload.qualitativeSections,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      };

      scorecardRecord = existingScorecardResult
        ? await prisma.performanceScorecard.update({ where: { id: existingScorecardResult.id }, data: coreData })
        : await prisma.performanceScorecard.create({ data: coreData });

      const rollupGoals = goals.map((g) => ({ parentGoalId: g.parentGoalId }));

      setImmediate(() => {
        void Promise.all([
          AuditService.log({
            userId: params.viewer.id,
            action: "GENERATE" as const,
            entityType: "PerformanceScorecard",
            entityId: scorecardRecord!.id,
            newValues: { type: "EMPLOYEE", subjectUserId: employeeUser.id, finalScore },
            ...getRequestMetadata(params.meta)
          }).catch((err) =>
            console.error("Audit log (employee scorecard generate) failed:", err)
          ),
          PerformanceScorecardService.triggerUpwardRecalculation(rollupGoals).catch((err) =>
            console.error("Background employee goal rollup failed:", err)
          )
        ]);
      });
    }

    const lineManagerId = employeeRecord?.lineManagerUserId || null;
    const isLineManager = Boolean(lineManagerId && params.viewer.id === lineManagerId);
    const hr = isHRLeader(params.viewer);
    const ceo = isCEO(params.viewer);
    const admin = isAdminViewer(params.viewer);
    const isSelf = params.viewer.id === employeeUser.id;

    return {
      scorecardType: "EMPLOYEE",
      access: {
        canView: Boolean(isSelf || isLineManager || hr || ceo || admin),
        canGenerate: Boolean(isLineManager || hr || ceo || admin)
      },
      employee: {
        id: employeeUser.id,
        name: `${employeeUser.firstName} ${employeeUser.lastName}`,
        email: employeeUser.email,
        department: employeeUser.userDepartment,
        role: employeeUser.departmentRole || employeeUser.role?.name || null
      },
      contract: {
        id: contract.id,
        title: contract.title,
        periodLabel: resolvePeriodLabel({
          periodLabel: period.periodLabel,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        }),
        stretchScoringEnabled: contract.stretchScoringEnabled,
        reviewer: contract.reviewer
          ? {
              id: contract.reviewer.id,
              name: `${contract.reviewer.firstName} ${contract.reviewer.lastName}`
            }
          : null
      },
      warnings,
      lifecycle,
      goals: rows.map(({ linkedTasks, sourceGoal, ...rest }) => ({
        ...rest,
        rawRatingLabel: rawRatingBandLabel(rest.rawRating)
      })),
      impactProgress: rows.map((row) => {
        const n = row.parentGoalId ? siblingCountByParent.get(row.parentGoalId) : 0;
        const equalSplitPct =
          row.parentGoalId && n && n > 0 && row.rollupWeight == null ? round(100 / n, 4) : null;
        return {
          performanceGoalId: row.id,
          goalName: row.goalName,
          parentDepartmentGoalId: row.parentGoalId ?? null,
          parentDepartmentGoalTitle: row.parentGoal?.title ?? null,
          contributionPercentOfParentGoal: row.rollupWeight != null ? row.rollupWeight : equalSplitPct,
          progressPct: row.progressPct,
          rawRating: row.rawRating,
          rawRatingLabel: rawRatingBandLabel(row.rawRating)
        };
      }),
      scores: {
        resultsDeliveryScore: round(resultsDeliveryScore, 2),
        budgetScore: budgetComponent.score,
        finalScore,
        performanceLabel,
        ratingScale: { ...PERFORMANCE_RATING_SCALE }
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async resolveDepartmentForScorecard(input: { departmentId?: string; departmentName?: string }) {
    if (input.departmentId) {
      const d = await prisma.department.findUnique({
        where: { id: input.departmentId },
        select: { id: true, name: true, isActive: true }
      });
      if (!d || !d.isActive) {
        throw new Error("Department not found.");
      }
      return { id: d.id, name: d.name };
    }
    const name = String(input.departmentName || "").trim();
    if (!name) {
      throw new Error("departmentId or department name is required.");
    }
    const d = await prisma.department.findFirst({
      where: { name, isActive: true },
      select: { id: true, name: true }
    });
    if (d) return { id: d.id, name: d.name };
    return { id: null, name };
  }

  private static async assertNoFinalDepartmentScorecard(
    departmentName: string,
    periodStart: Date,
    periodEnd: Date
  ) {
    const existing = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "DEPARTMENT",
        departmentName,
        periodStart,
        periodEnd,
        OR: [{ status: "FINAL" }, { isLocked: true }]
      }
    });
    if (existing) {
      throw new Error("A finalised scorecard already exists for this department and period.");
    }
  }

  static async getDepartmentScorecard(params: {
    viewer: any;
    departmentName?: string;
    departmentId?: string;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
  }) {
    const resolvedDept = await this.resolveDepartmentForScorecard({
      departmentId: params.departmentId,
      departmentName: params.departmentName
    });
    const departmentName = resolvedDept.name;

    const accessFlags = await this.assertDepartmentAccess(
      params.viewer,
      departmentName,
      params.persist ? "generate" : "view",
      params.meta
    );

    const period = this.buildPeriod(params);
    const periodWhere = this.buildPeriodWhere(period);
    const contractPeriodWhere = this.buildContractPeriodWhere(period);

    const [departmentContract, departmentUsers, employeeScorecards, departmentGoalsBase, branding] = await Promise.all([
      prisma.performanceContract.findFirst({
        where: {
          contractType: "DEPARTMENT",
          departmentName,
          ...contractPeriodWhere,
          status: { notIn: ["ARCHIVED", "CANCELLED"] }
        },
        select: {
          id: true,
          title: true,
          periodLabel: true,
          periodStart: true,
          periodEnd: true,
          stretchScoringEnabled: true,
          qualitativeTemplate: true,
          reviewer: {
            select: { id: true, firstName: true, lastName: true }
          }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.user.findMany({
        where: { userDepartment: departmentName },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          role: { select: { name: true } }
        }
      }),
      prisma.performanceScorecard.findMany({
        where: {
          scorecardType: "EMPLOYEE",
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          subjectUser: { userDepartment: departmentName }
        },
        select: {
          subjectUserId: true,
          status: true,
          finalScore: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.performanceGoal.findMany({
        where: {
          type: "department",
          departmentName,
          ...periodWhere
        },
        include: { kpi: true },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      }),
      getCachedBranding()
    ]);

    const companyProfile = branding.profile;
    const activeLetterhead = branding.letterhead;

    if (!departmentContract) {
      throw new Error("No active performance contract found for this department and period.");
    }

    const departmentManager =
      departmentUsers.find((user) => isDepartmentManager(user, departmentName)) || null;

    const latestByEmployee = new Map<string, any>();
    for (const scorecard of employeeScorecards) {
      if (!scorecard.subjectUserId || latestByEmployee.has(scorecard.subjectUserId)) continue;
      latestByEmployee.set(scorecard.subjectUserId, scorecard);
    }

    const finalScorecardByEmployee = new Map<string, any>();
    for (const scorecard of employeeScorecards) {
      if (scorecard.status !== "FINAL" || !scorecard.subjectUserId) continue;
      const prev = finalScorecardByEmployee.get(scorecard.subjectUserId);
      if (!prev || new Date(scorecard.updatedAt).getTime() > new Date(prev.updatedAt).getTime()) {
        finalScorecardByEmployee.set(scorecard.subjectUserId, scorecard);
      }
    }

    let departmentGoals: any[] = departmentGoalsBase;
    if (finalScorecardByEmployee.size > 0) {
      const goalIds = departmentGoalsBase.map((g: any) => g.id);
      const subGoalsRaw = await prisma.performanceGoal.findMany({
        where: { parentGoalId: { in: goalIds } },
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } }
      });
      const subGoalsByParent = new Map<string, any[]>();
      for (const sg of subGoalsRaw) {
        const arr = subGoalsByParent.get(sg.parentGoalId!) || [];
        arr.push(sg);
        subGoalsByParent.set(sg.parentGoalId!, arr);
      }
      departmentGoals = departmentGoalsBase.map((g: any) => ({
        ...g,
        subGoals: subGoalsByParent.get(g.id) || []
      }));
    }

    if (departmentGoals.length > 0 && departmentGoals.every((g: any) => Boolean(g.isPendingApproval))) {
      throw new Error("No scoreable goals available.");
    }

    const draftEmployees = Array.from(latestByEmployee.values()).filter((sc: any) => sc.status === "DRAFT");
    const finalCount = finalScorecardByEmployee.size;
    const subjectUserIds = departmentUsers.map((user) => user.id);

    const warnings: string[] = [];
    const fallbackWeight = departmentGoals.length > 0 ? 100 / departmentGoals.length : 0;
    const weightSum = departmentGoals.reduce(
      (s, g) => s + resolveWeight(g.scorecardWeight, fallbackWeight),
      0
    );
    if (departmentGoals.length > 0 && Math.abs(weightSum - 100) > 0.01) {
      warnings.push(
        `Department goal weights sum to ${round(weightSum, 2)}, not 100. Scores may be inaccurate.`
      );
    }

    if (!departmentContract.reviewer) {
      warnings.push(
        "No appraiser (contract reviewer) is assigned on this department performance contract. The scorecard cannot be finalised until an appraiser is assigned."
      );
    }

    if (draftEmployees.length > 0) {
      warnings.push(
        `${draftEmployees.length} employee scorecard(s) are not yet finalised and have been excluded from the roll-up. Department score may be incomplete.`
      );
    }

    if (finalCount === 0 && subjectUserIds.length > 0) {
      warnings.push(
        "No finalised employee scorecards for this period; roll-up progress is 0 and only direct KPI values apply."
      );
    }

    const periodEndDate = new Date(period.periodEnd);

    const goalRows = redistributeWeights(
      departmentGoals.map((goal) => {
        const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
        const directStored = resolveStoredGoalActual(goal);
        const directActualValue = directStored.value;
        const missingValue = isEmployeeGoalStoredActualMissing(goal);
        const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
        const directProgress = computeGoalProgress({
          actualValue: directActualValue,
          targetValue,
          isReverseKpi: goal.isReverseKpi,
          stretchScoringEnabled: departmentContract.stretchScoringEnabled,
          stretchTargetValue
        });

        const childGoals = goal.subGoals || [];
        const eligibleChildren = childGoals.filter((cg) => {
          if (!cg.assignedToId) return false;
          const fin = finalScorecardByEmployee.get(cg.assignedToId);
          return Boolean(fin);
        });
        const { weights: childRollupWeights, warnings: rollupWeightWarnings } =
          resolveDepartmentRollupChildWeights(eligibleChildren, goal.title);
        for (const rw of rollupWeightWarnings) {
          warnings.push(rw);
        }
        const childContributions = eligibleChildren.map((childGoal, idx) => {
          const childStretch = parseStretchTargetValueFromActivities(childGoal.activities);
          const childProgress = computeGoalProgress({
            actualValue: resolveStoredGoalActual(childGoal).value,
            targetValue: toNumber(childGoal.preciseTargetValue ?? childGoal.targetValue, 0),
            isReverseKpi: childGoal.isReverseKpi,
            stretchScoringEnabled: departmentContract.stretchScoringEnabled,
            stretchTargetValue: childStretch
          });
          const contributionWeight = childRollupWeights[idx] ?? 0;
          return {
            employeeId: childGoal.assignedToId,
            employeeName: childGoal.assignedTo
              ? `${childGoal.assignedTo.firstName} ${childGoal.assignedTo.lastName}`
              : "Unknown",
            progressPct: childProgress.progressPct,
            contributionWeight
          };
        });

        const totalContributionWeight = childContributions.reduce((sum, item) => sum + item.contributionWeight, 0);
        const weightedContributionTotal = childContributions.reduce(
          (sum, item) => sum + item.progressPct * item.contributionWeight,
          0
        );
        const rollupProgressPct =
          totalContributionWeight > 0
            ? round(weightedContributionTotal / totalContributionWeight, 2)
            : 0;

        const selectedProgressPct = Math.max(directProgress.progressPct, rollupProgressPct);
        const selectedSource =
          directProgress.progressPct >= rollupProgressPct ? "direct" : "rollup";
        const selectedActualValue =
          directProgress.progressPct >= rollupProgressPct
            ? directActualValue
            : deriveActualFromProgress(targetValue, selectedProgressPct, goal.isReverseKpi);
        const isPending = Boolean(goal.isPendingApproval);
        const rawRating = isPending
          ? null
          : computeRawRating({
              actualValue: selectedActualValue,
              targetValue,
              allowableVariance: goal.allowableVariance,
              isReverseKpi: goal.isReverseKpi
            });

        const status = isPending
          ? "PENDING"
          : departmentGoalRowStatus(selectedProgressPct, goal.allowableVariance, periodEndDate);

        return {
          id: goal.id,
          goalName: goal.title,
          kpiOrMeasure: goal.measureName || goal.kpi?.name || goal.title,
          targetValue,
          stretchTargetValue,
          directActualValue,
          directProgressPct: directProgress.progressPct,
          rollupProgressPct,
          selectedProgressPct,
          selectedSource,
          selectedActualValue,
          originalWeight: resolveWeight(goal.scorecardWeight, fallbackWeight),
          weight: resolveWeight(goal.scorecardWeight, fallbackWeight),
          allowableVariance: toNumber(goal.allowableVariance, 0.1),
          isReverseKpi: Boolean(goal.isReverseKpi),
          rawRating,
          isPendingApproval: isPending,
          excludedFromScoring: isPending,
          missingValue: isPending ? false : missingValue || directProgress.isMissing,
          parentGoalId: goal.parentGoalId || null,
          rollupWeight: (() => {
            const act = goal.activities && typeof goal.activities === "object" ? goal.activities : {};
            const w = toNumber(
              act.contributionWeightPercent ?? act.rollupWeightPercent,
              0
            );
            return w > 0 ? round(w, 4) : null;
          })(),
          status,
          childContributions
        };
      })
    ).map((row) => ({
      ...row,
      weightedScore: row.isPendingApproval
        ? 0
        : round((row.effectiveWeight * toNumber(row.rawRating, 0)) / 100, 4)
    }));

    const activeRows = goalRows.filter((row) => !row.isPendingApproval);
    const activeGoalWeight = activeRows.reduce((sum, row) => sum + row.effectiveWeight, 0);
    const totalWeightedScore = activeRows.reduce((sum, row) => sum + row.weightedScore, 0);
    const departmentScore =
      activeGoalWeight > 0 ? round((totalWeightedScore * 100) / activeGoalWeight, 2) : 0;

    const performanceLabel = performanceLabelFromDepartmentScore(departmentScore);

    const limitedEmployeeVisibility =
      (isMonitoringAndEvaluationLeader(params.viewer) || isComplianceLeader(params.viewer)) &&
      !isDepartmentManager(params.viewer, departmentName) &&
      !isHRLeader(params.viewer) &&
      !isCEO(params.viewer);

    const rollupSummary = departmentUsers.map((user, index) => {
      const childGoalWeights = goalRows.reduce((sum, row) => {
        const contribution = row.childContributions.find((item) => item.employeeId === user.id);
        return sum + (contribution?.contributionWeight || 0);
      }, 0);
      const finalSc = finalScorecardByEmployee.get(user.id);
      const finalScore =
        finalSc?.finalScore != null ? toNumber(finalSc.finalScore, 0) : null;
      const weightedContribution =
        finalScore !== null ? round((finalScore * childGoalWeights) / 100, 4) : null;

        return {
        employeeId: user.id,
        employeeName: limitedEmployeeVisibility
          ? `Employee ${index + 1}`
          : `${user.firstName} ${user.lastName}`,
        finalScore,
        rollupWeight: round(childGoalWeights, 4),
        weightedContribution
      };
    });

    const addressLogo =
      activeLetterhead?.logoUrl && String(activeLetterhead.logoUrl).trim()
        ? String(activeLetterhead.logoUrl).trim()
        : null;
    const organisationLogoUrl = addressLogo ?? companyProfile?.logoUrl ?? null;
    const organisationName = resolveOrganisationDisplayName(companyProfile?.legalName);

    if (!organisationLogoUrl) {
      warnings.push(
        "No letterhead logo is set on the active company address (Company Profile → Addresses) or on the company profile. The document is generated without letterhead logo."
      );
    }

    const qualitativeSections = {
      personalAttributes: buildPersonalAttributesRatingGrid(departmentContract.qualitativeTemplate),
      trainingAndDevelopment: buildTrainingSection(departmentContract.qualitativeTemplate)
    };

    const documentPayload = this.buildDepartmentDocument({
      departmentId: resolvedDept.id,
      departmentName,
      period: departmentContract,
      manager: departmentManager,
      rows: goalRows,
      rollupSummary,
      departmentScore,
      performanceLabel,
      status: "DRAFT",
      organisationName,
      organisationLogoUrl,
      generatedAt: new Date()
    });

    const documentPayloadForStorage = { ...documentPayload };
    delete documentPayloadForStorage.employeeRollupSummary;

    let scorecardRecord = null;
    if (params.persist) {
      const existingScorecard = await prisma.performanceScorecard.findFirst({
        where: {
          scorecardType: "DEPARTMENT",
          departmentName,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        },
        select: { id: true, status: true, isLocked: true },
        orderBy: { updatedAt: "desc" }
      });

      if (existingScorecard?.status === "FINAL" || existingScorecard?.isLocked) {
        throw new Error("A finalised scorecard already exists for this department and period.");
      }

      const upsertData = {
        contractId: departmentContract.id,
        scorecardType: "DEPARTMENT" as const,
        status: "DRAFT" as const,
        departmentName,
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: departmentContract.periodLabel || params.periodLabel,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        }),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        finalScore: decimalForStorage(departmentScore),
        resultsDeliveryScore: decimalForStorage(departmentScore),
        warnings,
        sections: {
          departmentScore,
          performanceLabel
        },
        matrixRows: goalRows.map(({ childContributions: _cc, ...row }) => row),
        rollupSummary,
        qualitativeSections,
        signatureState: documentPayload.signatureBlock,
        documentPayload: documentPayloadForStorage
      };

      scorecardRecord = existingScorecard
        ? await prisma.performanceScorecard.update({ where: { id: existingScorecard.id }, data: upsertData })
        : await prisma.performanceScorecard.create({ data: upsertData });

      const rollupRefs = departmentGoals.map((g: any) => ({ parentGoalId: g.parentGoalId }));
      const auditPayload = {
        userId: params.viewer.id,
        action: "GENERATE" as const,
        entityType: "PerformanceScorecard",
        entityId: scorecardRecord.id,
        newValues: {
          type: "DEPARTMENT",
          departmentName,
          finalScore: departmentScore
        },
        ...getRequestMetadata(params.meta)
      };

      setImmediate(() => {
        void Promise.all([
          AuditService.log(auditPayload).catch((err) =>
            console.error("Audit log (department scorecard generate) failed:", err)
          ),
          PerformanceScorecardService.triggerUpwardRecalculation(rollupRefs).catch((err) =>
            console.error("Background department goal rollup failed:", err)
          )
        ]);
      });
    }

    const latestDeptScorecardLifecycle = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "DEPARTMENT",
        departmentName,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { status: true, isLocked: true, archivedAt: true }
    });
    const departmentLifecycle = resolveScorecardLifecycleBanner(
      new Date(period.periodEnd),
      latestDeptScorecardLifecycle
    );

    return {
      scorecardType: "DEPARTMENT",
      access: accessFlags,
      department: {
        id: resolvedDept.id,
        name: departmentName,
        managerId: departmentManager?.id || null,
        managerName: departmentManager
          ? `${departmentManager.firstName} ${departmentManager.lastName}`
          : null,
        headOfDepartmentName: departmentManager
          ? `${departmentManager.firstName} ${departmentManager.lastName}`.trim()
          : null,
        headOfDepartmentTitle:
          departmentManager?.departmentRole || departmentManager?.role?.name || null
      },
      contract: {
        id: departmentContract.id,
        title: departmentContract.title,
        periodLabel: resolvePeriodLabel({
          periodLabel: departmentContract.periodLabel,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        }),
        stretchScoringEnabled: departmentContract.stretchScoringEnabled,
        reviewer: departmentContract.reviewer
          ? {
              id: departmentContract.reviewer.id,
              name: `${departmentContract.reviewer.firstName} ${departmentContract.reviewer.lastName}`
            }
          : null
      },
      warnings,
      lifecycle: departmentLifecycle,
      goals: goalRows.map((gr: any) => ({
        ...gr,
        rawRatingLabel: rawRatingBandLabel(gr.rawRating)
      })),
      rollupSummary,
      employeeRollupSummary: rollupSummary,
      scores: {
        departmentScore,
        performanceLabel,
        ratingScale: { ...PERFORMANCE_RATING_SCALE }
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getCEOScorecard(params: {
    viewer: any;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
    /** Default `redistribute`: omit non-scoreable sections from the final blend and re-normalise weights. */
    sectionBlendMode?: "penalise" | "redistribute";
  }) {
    const access = await this.assertCEOAccess(
      params.viewer,
      params.persist ? "generate" : "view",
      params.meta
    );

    const period = this.buildPeriod(params);
    const [{ contract, resolutionNotes }, branding] = await Promise.all([
      this.resolveCEOPerformanceContract(period),
      getCachedBranding()
    ]);

    if (!contract) {
      throw new Error(CEO_CONTRACT_NOT_FOUND_MESSAGE);
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        performanceContractId: contract.id
      },
      orderBy: [
        { scorecardSection: "asc" },
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const warnings: string[] = [...resolutionNotes];
    if (!contract.reviewer) {
      warnings.push(
        "No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned."
      );
    }
    if (new Date(contract.periodEnd).getTime() > Date.now()) {
      warnings.push("This period has not ended. Scorecard reflects performance to date only.");
    }

    if (params.persist && goals.length === 0) {
      throw new Error(CEO_SAVE_NO_INDICATORS_MESSAGE);
    }

    const flatRows = this.buildCEOSectionRows(goals, contract, warnings);
    const sectionWeights = resolveSectionWeights(contract.sectionWeights, CEO_SECTION_WEIGHTS);
    const sectionSummary = this.summariseCEOSectionScores(flatRows, sectionWeights, {
      sectionBlendMode: params.sectionBlendMode,
      warningsOut: warnings,
      sectionLabels: CEO_SECTION_LABELS
    });
    const budgetComponent = this.buildBudgetComponent(contract);
    const sectionBlendScore = sectionSummary.finalScore;
    const finalScore = budgetComponent.included
      ? round(sectionBlendScore * 0.9 + toNumber(budgetComponent.score, 0) * 0.1, 2)
      : sectionBlendScore;
    const scoreableIndicatorCount = flatRows.filter((r) => !r.excludedFromScoring).length;
    const performanceLabel = ceoPerformanceLabelOverall(
      finalScore,
      goals.length,
      scoreableIndicatorCount
    );

    const stripGoal = (row: any) => {
      const { goal: _g, ...rest } = row;
      return rest;
    };

    const sectionsNested: Record<string, any> = {};
    for (const s of sectionSummary.sections) {
      sectionsNested[s.key] = {
        label: s.label,
        weight: s.weight,
        sectionScore: s.sectionScore,
        performanceLabel: s.performanceLabel,
        indicators: s.indicators.map((ind: any) => {
          const stripped = stripGoal(ind);
          return {
            ...stripped,
            rawRatingLabel: rawRatingBandLabel(stripped.rawRating)
          };
        })
      };
    }

    const sectionScoresMap: Record<string, number> = {};
    for (const s of sectionSummary.sections) {
      sectionScoresMap[s.key] = s.sectionScore;
    }

    const agreedRatingsSummary = sectionSummary.sections.map((s) => ({
      section: s.key,
      heading: s.label,
      sectionScore: s.sectionScore,
      label: s.performanceLabel
    }));
    agreedRatingsSummary.push({
      section: "TOTAL",
      heading: "Final Score",
      sectionScore: finalScore,
      label: performanceLabel
    });

    const sectionOrder = ["A1", "A2", "B", "C", "D"];
    const sectionTables: Record<string, any> = {};
    for (const key of sectionOrder) {
      const meta = sectionSummary.sections.find((x) => x.key === key);
      const secRows = flatRows.filter((r) => r.section === key);
      sectionTables[key] = {
        sectionLabel: `${key} — ${CEO_SECTION_LABELS[key]} (${CEO_SECTION_WEIGHTS[key]}%)`,
        rows: secRows.map((r, idx) => ({
          index: idx + 1,
          indicatorName: r.indicatorName,
          formulaMeasure: r.formulaType,
          unit: r.unit,
          target: r.targetValue,
          computedActual: r.computedActual,
          allowableVariance: r.allowableVariance,
          rawRating: r.rawRating,
          rawRatingLabel: rawRatingBandLabel(r.rawRating),
          weight: r.originalWeight,
          effectiveWeight: r.effectiveWeight,
          weightedScore: r.weightedScore,
          rowSeverity: this.ceoIndicatorRowSeverity(r),
          isPendingApproval: r.isPendingApproval,
          excludedFromScoring: r.excludedFromScoring,
          missingValue: r.missingValue
        })),
        sectionScore: meta?.sectionScore ?? 0,
        performanceLabel:
          meta?.performanceLabel ??
          ceoPerformanceLabelForSection(
            0,
            secRows.length,
            secRows.filter((r) => !r.excludedFromScoring).length
          )
      };
    }

    const addressLogo =
      branding.letterhead?.logoUrl && String(branding.letterhead.logoUrl).trim()
        ? String(branding.letterhead.logoUrl).trim()
        : null;
    const organisationLogoUrl = addressLogo ?? branding.profile?.logoUrl ?? null;
    const organisationName = resolveOrganisationDisplayName(branding.profile?.legalName);

    const reviewerUser = contract.reviewer || contract.approver;
    const reviewerName = reviewerUser
      ? `${reviewerUser.firstName} ${reviewerUser.lastName}`.trim()
      : null;

    const qualitativeSections = {
      personalAttributes: buildPersonalAttributesRatingGrid(contract.qualitativeTemplate),
      trainingAndDevelopment: buildTrainingSection(contract.qualitativeTemplate)
    };

    const ceoName = contract.subjectUser
      ? `${contract.subjectUser.firstName} ${contract.subjectUser.lastName}`.trim()
      : null;
    const ceoTitle = CEO_SCORECARD_FORMAL_TITLE;
    const contractParty2 = ceoName
      ? `The Chief Executive Officer — ${ceoName}`
      : `The Chief Executive Officer — ${chiefExecutiveOrganisationLine()}`;

    const documentPayload = {
      header: {
        organisationName,
        organisationLogoUrl,
        governmentCrestUrl: null,
        documentTitle: "CEO Performance Contract Review",
        contractParty1: boardDirectorsWithOrganisationShort(),
        contractParty2,
        ceoName,
        ceoTitle,
        reviewerName,
        reviewerTitle: "Board Chairperson",
        reviewPeriod: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        dateGenerated: new Date().toISOString()
      },
      sectionTables,
      agreedRatingsSummary,
      qualitativeSections,
      signatureBlock: {
        ceo: {
          name: ceoName,
          title: CEO_SCORECARD_FORMAL_TITLE,
          signature: null,
          date: null
        },
        boardChairperson: {
          name: reviewerName,
          title: "Board Chairperson",
          signature: null,
          date: null
        }
      },
      subtotals: {
        finalScore,
        performanceLabel
      },
      status: "DRAFT"
    };

    const matrixRowsForDb = flatRows.map((r) => stripGoal(r));
    const sectionsForDb = sectionSummary.sections.map((s) => ({
      key: s.key,
      label: s.label,
      weightPercent: s.weightPercent,
      sectionScore: s.sectionScore,
      performanceLabel: s.performanceLabel
    }));

    let scorecardRecord = null;
    if (params.persist) {
      if (!contract.subjectUserId) {
        throw new Error("CEO performance contract has no subject user; cannot persist scorecard.");
      }

      const [finalExists, existingDraft] = await Promise.all([
        prisma.performanceScorecard.findFirst({
          where: {
            scorecardType: "CEO",
            subjectUserId: contract.subjectUserId,
            periodStart: contract.periodStart,
            periodEnd: contract.periodEnd,
            OR: [{ status: "FINAL" }, { isLocked: true }]
          },
          select: { id: true }
        }),
        prisma.performanceScorecard.findFirst({
          where: {
            scorecardType: "CEO",
            subjectUserId: contract.subjectUserId,
            periodStart: contract.periodStart,
            periodEnd: contract.periodEnd,
            status: "DRAFT",
            isLocked: false
          },
          select: { id: true },
          orderBy: { updatedAt: "desc" }
        })
      ]);
      if (finalExists) {
        throw new Error("A finalised CEO scorecard already exists for this period.");
      }

      const upsertData = {
        contractId: contract.id,
        scorecardType: "CEO" as const,
        status: "DRAFT" as const,
        subjectUserId: contract.subjectUserId,
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd,
        resultsDeliveryScore: decimalForStorage(finalScore),
        budgetScore: decimalForStorage(budgetComponent.score),
        finalScore: decimalForStorage(finalScore),
        warnings,
        sections: {
          ...sectionsForDb.reduce((acc: any, s: any) => {
            acc[s.key] = {
              label: s.label,
              weightPercent: s.weightPercent,
              sectionScore: s.sectionScore,
              performanceLabel: s.performanceLabel
            };
            return acc;
          }, {}),
          sectionBlendScore,
          budgetComponent,
          performanceLabel
        },
        matrixRows: matrixRowsForDb,
        qualitativeSections,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      };

      scorecardRecord = existingDraft
        ? await prisma.performanceScorecard.update({ where: { id: existingDraft.id }, data: upsertData })
        : await prisma.performanceScorecard.create({ data: upsertData });
    }

    const ceoLifecycleWhere: Record<string, unknown> = {
      scorecardType: "CEO",
      periodStart: contract.periodStart,
      periodEnd: contract.periodEnd
    };
    if (contract.subjectUserId) {
      ceoLifecycleWhere.subjectUserId = contract.subjectUserId;
    }
    const latestCeoScorecardLifecycle = await prisma.performanceScorecard.findFirst({
      where: ceoLifecycleWhere as any,
      orderBy: { updatedAt: "desc" },
      select: { status: true, isLocked: true, archivedAt: true }
    });
    const ceoLifecycle = resolveScorecardLifecycleBanner(
      new Date(contract.periodEnd),
      latestCeoScorecardLifecycle
    );

    return {
      scorecardType: "CEO",
      access,
      ceo: {
        id: contract.subjectUserId,
        name: ceoName,
        title: ceoTitle
      },
      contract: {
        id: contract.id,
        title: contract.title,
        periodLabel: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        stretchScoringEnabled: Boolean(contract.stretchScoringEnabled),
        reviewerId: contract.reviewer?.id ?? null,
        reviewerName
      },
      warnings,
      lifecycle: ceoLifecycle,
      sections: sectionsNested,
      agreedRatingsSummary,
      scores: {
        sectionScores: sectionScoresMap,
        sectionBlendScore,
        budgetScore: budgetComponent.score,
        finalScore,
        performanceLabel,
        ratingScale: { ...PERFORMANCE_RATING_SCALE }
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getBoardScorecard(params: {
    viewer: any;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
    sectionBlendMode?: "penalise" | "redistribute";
  }) {
    const access = await this.assertBoardAccess(params.viewer, params.meta);

    const period = this.buildPeriod(params);
    const [{ contract, resolutionNotes }, branding] = await Promise.all([
      this.resolveBoardPerformanceContract(period),
      getCachedBranding()
    ]);

    if (!contract) {
      throw new Error(BOARD_CONTRACT_NOT_FOUND_MESSAGE);
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        performanceContractId: contract.id
      },
      select: {
        id: true,
        title: true,
        scorecardSection: true,
        formulaType: true,
        activities: true,
        preciseTargetValue: true,
        targetValue: true,
        scorecardWeight: true,
        allowableVariance: true,
        isReverseKpi: true,
        isPendingApproval: true,
        targetUnit: true,
        measureName: true,
        preciseCurrentValue: true,
        currentValue: true,
        displayOrder: true,
        createdAt: true
      },
      orderBy: [
        { scorecardSection: "asc" },
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const warnings: string[] = [...resolutionNotes];
    if (!contract.reviewer) {
      warnings.push(
        "No Ministry/Shareholder representative assigned as reviewer. The scorecard cannot be finalised until a reviewer is assigned."
      );
    }
    if (new Date(contract.periodEnd).getTime() > Date.now()) {
      warnings.push("This period has not ended. Scorecard reflects performance to date only.");
    }

    if (params.persist && goals.length === 0) {
      throw new Error(BOARD_SAVE_NO_INDICATORS_MESSAGE);
    }

    const sectionWeights = resolveSectionWeights(contract.sectionWeights, BOARD_SECTION_WEIGHTS);
    const swSum = Object.values(sectionWeights).reduce((s, w) => s + toNumber(w, 0), 0);
    if (Math.abs(swSum - 100) > 0.02) {
      warnings.push(
        `Board section weights from the contract sum to ${round(swSum, 2)}%, not 100. Scores use these weights as stored.`
      );
    }

    const flatRows = this.buildBoardSectionRows(goals, contract, warnings);
    const sectionSummary = this.summariseBoardSectionScores(flatRows, sectionWeights, {
      sectionBlendMode: params.sectionBlendMode,
      warningsOut: warnings,
      sectionLabels: BOARD_SECTION_LABELS
    });
    const finalScore = sectionSummary.finalScore;
    const scoreableIndicatorCount = flatRows.filter((r) => !r.excludedFromScoring).length;
    const performanceLabel = ceoPerformanceLabelOverall(
      finalScore,
      goals.length,
      scoreableIndicatorCount
    );

    const stripGoal = (row: any) => {
      const { goal: _g, ...rest } = row;
      return rest;
    };

    const sectionsNested: Record<string, any> = {};
    for (const s of sectionSummary.sections) {
      sectionsNested[s.key] = {
        label: s.label,
        weight: s.weight,
        sectionScore: s.sectionScore,
        performanceLabel: s.performanceLabel,
        indicators: s.indicators.map((ind: any) => {
          const stripped = stripGoal(ind);
          return {
            ...stripped,
            rawRatingLabel: rawRatingBandLabel(stripped.rawRating)
          };
        })
      };
    }

    const sectionScoresMap: Record<string, number> = {};
    for (const s of sectionSummary.sections) {
      sectionScoresMap[s.key] = s.sectionScore;
    }

    const agreedRatingsSummary = sectionSummary.sections.map((s) => ({
      section: s.key,
      heading: s.label,
      sectionScore: s.sectionScore,
      label: s.performanceLabel
    }));
    agreedRatingsSummary.push({
      section: "TOTAL",
      heading: "Final Score",
      sectionScore: finalScore,
      label: performanceLabel
    });

    const sectionOrder = ["A1", "A2", "B", "C", "D"];
    const sectionTables: Record<string, any> = {};
    for (const key of sectionOrder) {
      const meta = sectionSummary.sections.find((x) => x.key === key);
      const secRows = flatRows.filter((r) => r.section === key);
      sectionTables[key] = {
        sectionLabel: `${key} — ${BOARD_SECTION_LABELS[key]} (${BOARD_SECTION_WEIGHTS[key]}%)`,
        rows: secRows.map((r, idx) => ({
          index: idx + 1,
          indicatorName: r.indicatorName,
          formulaMeasure: r.formulaType,
          unit: r.unit,
          target: r.targetValue,
          computedActual: r.computedActual,
          allowableVariance: r.allowableVariance,
          rawRating: r.rawRating,
          rawRatingLabel: rawRatingBandLabel(r.rawRating),
          weight: r.originalWeight,
          effectiveWeight: r.effectiveWeight,
          weightedScore: r.weightedScore,
          rowSeverity: this.ceoIndicatorRowSeverity(r),
          isPendingApproval: r.isPendingApproval,
          excludedFromScoring: r.excludedFromScoring,
          missingValue: r.missingValue
        })),
        sectionScore: meta?.sectionScore ?? 0,
        performanceLabel:
          meta?.performanceLabel ??
          ceoPerformanceLabelForSection(
            0,
            secRows.length,
            secRows.filter((r) => !r.excludedFromScoring).length
          )
      };
    }

    const addressLogo =
      branding.letterhead?.logoUrl && String(branding.letterhead.logoUrl).trim()
        ? String(branding.letterhead.logoUrl).trim()
        : null;
    const organisationLogoUrl = addressLogo ?? branding.profile?.logoUrl ?? null;
    const organisationName = resolveOrganisationDisplayName(branding.profile?.legalName);

    const chairpersonName = `${params.viewer.firstName || ""} ${params.viewer.lastName || ""}`.trim() || null;
    const reviewerUser = contract.reviewer;
    const reviewerName = reviewerUser
      ? `${reviewerUser.firstName} ${reviewerUser.lastName}`.trim()
      : null;

    const qualitativeSections = {
      personalAttributes: buildPersonalAttributesRatingGrid(contract.qualitativeTemplate),
      trainingAndDevelopment: buildTrainingSection(contract.qualitativeTemplate)
    };

    const documentPayload = {
      header: {
        organisationName,
        organisationLogoUrl,
        governmentCrestUrl: null,
        documentTitle: "Board of Directors Performance Contract Review",
        contractParty1: "Ministry / Shareholder Representative",
        contractParty2: boardDirectorsWithOrganisationShort(),
        chairpersonName,
        chairpersonTitle: BOARD_SCORECARD_CHAIR_TITLE,
        reviewerName,
        reviewerTitle: "Ministry Representative",
        reviewPeriod: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        dateGenerated: new Date().toISOString()
      },
      sectionTables,
      agreedRatingsSummary,
      governanceNarrative: {
        label: "Governance Assessment Narrative",
        content: null
      },
      qualitativeSections,
      signatureBlock: {
        boardChairperson: {
          name: chairpersonName,
          title: BOARD_SCORECARD_CHAIR_TITLE,
          signature: null,
          date: null
        },
        ministryRepresentative: {
          name: reviewerName,
          title: "Ministry / Shareholder Representative",
          signature: null,
          date: null
        }
      },
      status: "DRAFT"
    };

    const matrixRowsForDb = flatRows.map((r) => stripGoal(r));
    const sectionsForDb = sectionSummary.sections.map((s) => ({
      key: s.key,
      label: s.label,
      weightPercent: s.weightPercent,
      sectionScore: s.sectionScore,
      performanceLabel: s.performanceLabel
    }));

    let scorecardRecord = null;
    if (params.persist) {
      const subjectUserId = params.viewer.id;

      const [finalExists, existingDraft] = await Promise.all([
        prisma.performanceScorecard.findFirst({
          where: {
            scorecardType: "BOARD",
            subjectUserId,
            periodStart: contract.periodStart,
            periodEnd: contract.periodEnd,
            OR: [{ status: "FINAL" }, { isLocked: true }]
          },
          select: { id: true }
        }),
        prisma.performanceScorecard.findFirst({
          where: {
            scorecardType: "BOARD",
            subjectUserId,
            periodStart: contract.periodStart,
            periodEnd: contract.periodEnd,
            status: "DRAFT",
            isLocked: false
          },
          select: { id: true },
          orderBy: { updatedAt: "desc" }
        })
      ]);
      if (finalExists) {
        throw new Error("A finalised Board scorecard already exists for this period.");
      }

      const upsertData = {
        contractId: contract.id,
        scorecardType: "BOARD" as const,
        status: "DRAFT" as const,
        subjectUserId,
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd,
        resultsDeliveryScore: decimalForStorage(finalScore),
        finalScore: decimalForStorage(finalScore),
        warnings,
        sections: {
          ...sectionsForDb.reduce((acc: any, s: any) => {
            acc[s.key] = {
              label: s.label,
              weightPercent: s.weightPercent,
              sectionScore: s.sectionScore,
              performanceLabel: s.performanceLabel
            };
            return acc;
          }, {}),
          performanceLabel
        },
        matrixRows: matrixRowsForDb,
        qualitativeSections,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      };

      scorecardRecord = existingDraft
        ? await prisma.performanceScorecard.update({ where: { id: existingDraft.id }, data: upsertData })
        : await prisma.performanceScorecard.create({ data: upsertData });
    }

    const latestBoardScorecardLifecycle = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "BOARD",
        subjectUserId: params.viewer.id,
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { status: true, isLocked: true, archivedAt: true }
    });
    const boardLifecycle = resolveScorecardLifecycleBanner(
      new Date(contract.periodEnd),
      latestBoardScorecardLifecycle
    );

    return {
      scorecardType: "BOARD",
      access,
      board: {
        chairpersonId: params.viewer.id,
        chairpersonName,
        chairpersonTitle: BOARD_SCORECARD_CHAIR_TITLE
      },
      contract: {
        id: contract.id,
        title: contract.title,
        periodLabel: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        stretchScoringEnabled: Boolean(contract.stretchScoringEnabled),
        reviewerId: contract.reviewer?.id ?? null,
        reviewerName
      },
      warnings,
      lifecycle: boardLifecycle,
      sections: sectionsNested,
      agreedRatingsSummary,
      scores: {
        sectionScores: sectionScoresMap,
        finalScore,
        performanceLabel,
        ratingScale: { ...PERFORMANCE_RATING_SCALE }
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getOrgBSCDashboard(params: {
    viewer: any;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    meta?: any;
  }) {
    const orgAccess = await this.assertOrgDashboardAccess(params.viewer, params.meta);

    const period = this.buildPeriod(params);
    const [contract, activeStrategy, branding] = await Promise.all([
      this.resolveContract({
        contractType: "ORG_BSC",
        period
      }),
      prisma.performanceStrategy.findFirst({
        where: {
          status: "ACTIVE",
          archivedAt: null
        },
        orderBy: {
          periodStart: "desc"
        }
      }),
      getCachedBranding()
    ]);

    let pillarWeightsResolved = resolveSectionWeights(
      contract?.sectionWeights || activeStrategy?.pillarWeights,
      DEFAULT_ORG_PILLAR_WEIGHTS
    );
    const { normalised: pillarWeightsNormalised, didNormalise } =
      normalisePillarWeightsTo100(pillarWeightsResolved);
    pillarWeightsResolved = pillarWeightsNormalised;
    const dashboardWarnings: string[] = [];
    if (didNormalise) {
      dashboardWarnings.push(
        "Organisational BSC pillar weights did not sum to 100%; weights were normalised proportionally."
      );
    }

    const canDrillToDepartment = orgAccess.canView;
    const canDrillToIndividual = orgAccess.canView;

    const looksLikeDepartmentId = (s: string) => {
      const t = s.trim();
      return t.length >= 20 && t.length <= 36 && /^c[a-z0-9]+$/i.test(t);
    };

    const companyGoals = await prisma.performanceGoal.findMany({
      where: {
        type: "company",
        OR: [
          contract ? { performanceContractId: contract.id } : undefined,
          this.buildPeriodWhere(period)
        ].filter(Boolean)
      },
      select: {
        id: true,
        title: true,
        preciseTargetValue: true,
        targetValue: true,
        currentValue: true,
        preciseCurrentValue: true,
        activities: true,
        isReverseKpi: true,
        isPendingApproval: true,
        lastApprovedValue: true,
        formulaType: true,
        dataSourceModule: true,
        syncEndpointPath: true,
        lastSyncedAt: true,
        endDate: true,
        allowableVariance: true,
        scorecardWeight: true,
        scorecardPillar: true,
        displayOrder: true,
        createdAt: true,
        subGoals: {
          select: {
            id: true,
            title: true,
            departmentName: true,
            currentValue: true,
            preciseCurrentValue: true,
            targetValue: true,
            preciseTargetValue: true,
            progressPercentage: true,
            activities: true,
            scorecardWeight: true,
            isReverseKpi: true,
            allowableVariance: true,
            endDate: true,
            assignedToId: true,
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            isPendingApproval: true,
            lastApprovedValue: true,
            formulaType: true,
            dataSourceModule: true,
            lastSyncedAt: true
          }
        }
      },
      orderBy: [
        { scorecardPillar: "asc" },
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const deptIdCandidates = new Set<string>();
    const deptNameCandidates = new Set<string>();
    for (const g of companyGoals) {
      for (const cg of g.subGoals || []) {
        const raw = cg.departmentName != null ? String(cg.departmentName).trim() : "";
        if (!raw) continue;
        if (looksLikeDepartmentId(raw)) deptIdCandidates.add(raw);
        else deptNameCandidates.add(raw);
      }
    }
    const deptOr: { id?: { in: string[] }; name?: { in: string[] } }[] = [];
    if (deptIdCandidates.size) deptOr.push({ id: { in: [...deptIdCandidates] } });
    if (deptNameCandidates.size) deptOr.push({ name: { in: [...deptNameCandidates] } });
    const resolvedDepartments =
      deptOr.length > 0
        ? await prisma.department.findMany({
            where: { OR: deptOr },
            select: { id: true, name: true }
          })
        : [];
    const deptById = new Map(resolvedDepartments.map((d) => [d.id, d]));
    const deptByName = new Map(resolvedDepartments.map((d) => [d.name, d]));
    const unresolvedDeptLabels = new Set<string>();

    const resolveDeptForBreakdown = (cg: { id: string; departmentName: string | null }) => {
      const raw = cg.departmentName != null ? String(cg.departmentName).trim() : "";
      if (!raw) {
        unresolvedDeptLabels.add(`sub-goal ${cg.id} (blank departmentName)`);
        return { departmentId: null as string | null, departmentName: "[Department Removed]" };
      }
      if (looksLikeDepartmentId(raw)) {
        const d = deptById.get(raw);
        if (d) return { departmentId: d.id, departmentName: d.name };
        unresolvedDeptLabels.add(`id "${raw}"`);
        return { departmentId: null, departmentName: "[Department Removed]" };
      }
      const d = deptByName.get(raw);
      if (d) return { departmentId: d.id, departmentName: d.name };
      unresolvedDeptLabels.add(`"${raw}"`);
      return { departmentId: null, departmentName: "[Department Removed]" };
    };

    const organisationName = resolveOrganisationDisplayName(branding.profile?.legalName);
    const visionStatement = contract?.visionStatement || activeStrategy?.visionStatement || null;
    const strategyDocumentUrl =
      contract?.strategyDocumentUrl || activeStrategy?.strategyDocumentUrl || null;

    const alertsAccumulator: any[] = [];

    const groupedByPillar = Object.keys(pillarWeightsResolved).map((pillarName) => {
      const pillarMeta = ORG_BSC_PILLAR_META[pillarName] || {
        pillarCode: pillarName.toUpperCase().replace(/\s+/g, "_"),
        pillarLabel: pillarName
      };
      const pillarGoals = companyGoals.filter((goal) => (goal.scorecardPillar || "Financial") === pillarName);
      const fallbackWeight = pillarGoals.length > 0 ? 100 / pillarGoals.length : 0;
      const rows = redistributeWeights(
        pillarGoals.map((goal) => {
          const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
          const actualValue = resolveStoredGoalActual(goal).value;
          const directProgress = computeGoalProgress({
            actualValue,
            targetValue,
            isReverseKpi: goal.isReverseKpi,
            stretchScoringEnabled: contract?.stretchScoringEnabled
          });

          const dataQualityAlert = shouldRaiseDataQualityAlert({
            currentValue: resolveStoredGoalActual(goal).value,
            lastApprovedValue: goal.lastApprovedValue,
            formulaType: goal.formulaType
          });
          const lastApr = toNumber(goal.lastApprovedValue, 0);
          const excludedFromScoring = Boolean(goal.isPendingApproval) || (dataQualityAlert && lastApr !== 0);

          const childGoals = Array.isArray(goal.subGoals) ? goal.subGoals : [];
          const childFallbackWeight = childGoals.length > 0 ? 100 / childGoals.length : 0;
          const childContributions = childGoals.map((childGoal) => {
            const childActual = resolveStoredGoalActual(childGoal).value;
            const childTarget = toNumber(childGoal.preciseTargetValue ?? childGoal.targetValue, 0);
            const childProgress = computeGoalProgress({
              actualValue: childActual,
              targetValue: childTarget,
              isReverseKpi: childGoal.isReverseKpi,
              stretchScoringEnabled: contract?.stretchScoringEnabled
            });
            return {
              progressPct: childProgress.progressPct,
              contributionWeight: getContributionWeight(childGoal, childFallbackWeight)
            };
          });
          const totalContributionWeight = childContributions.reduce(
            (sum, item) => sum + item.contributionWeight,
            0
          );
          const weightedContributionTotal = childContributions.reduce(
            (sum, item) => sum + item.progressPct * item.contributionWeight,
            0
          );
          const rollupProgressPct = totalContributionWeight > 0
            ? round(weightedContributionTotal / totalContributionWeight, 2)
            : 0;

          const directPct = toNumber(directProgress.progressPct, 0);
          const selectedProgressPct = Math.max(directPct, rollupProgressPct);
          const selectedActualValue =
            directPct >= rollupProgressPct
              ? actualValue
              : deriveActualFromProgress(targetValue, selectedProgressPct, goal.isReverseKpi);

          const status = resolveGoalEscalationStatus({
            preciseCurrentValue: String(selectedActualValue),
            currentValue: selectedActualValue,
            preciseTargetValue: goal.preciseTargetValue,
            targetValue: goal.targetValue,
            allowableVariance: goal.allowableVariance,
            isReverseKpi: goal.isReverseKpi,
            endDate: goal.endDate,
            stretchScoringEnabled: contract?.stretchScoringEnabled
          });

          const missingValue = Boolean(directProgress.isMissing);

          const departmentBreakdown = childGoals.map((cg) => {
            const childActual = resolveStoredGoalActual(cg).value;
            const childTarget = toNumber(cg.preciseTargetValue ?? cg.targetValue, 0);
            const childProgress = computeGoalProgress({
              actualValue: childActual,
              targetValue: childTarget,
              isReverseKpi: cg.isReverseKpi,
              stretchScoringEnabled: contract?.stretchScoringEnabled
            });
            const pct = toNumber(cg.progressPercentage, childProgress.progressPct ?? 0);
            const resolvedDept = resolveDeptForBreakdown(cg);
            const row: any = {
              departmentId: resolvedDept.departmentId,
              departmentName: resolvedDept.departmentName,
              departmentProgress: round(toNumber(pct, 0), 2),
              departmentStatus: departmentProgressTrafficStatus(
                toNumber(pct, 0),
                cg.allowableVariance ?? goal.allowableVariance
              )
            };
            if (canDrillToIndividual && cg.assignedTo) {
              row.individualContributors = [
                {
                  userId: cg.assignedTo.id,
                  name: `${cg.assignedTo.firstName || ""} ${cg.assignedTo.lastName || ""}`.trim(),
                  progressPct: round(toNumber(pct, 0), 2)
                }
              ];
            }
            return row;
          });

          if (dataQualityAlert && lastApr !== 0) {
            alertsAccumulator.push({
              type: "DATA_QUALITY",
              goalId: goal.id,
              goalName: goal.title,
              pillar: pillarMeta.pillarCode,
              message:
                "IRR / AUM value has a material discrepancy from last approved value. Pending manager approval before scoring.",
              triggeredAt: new Date().toISOString()
            });
          }
          if (String(status).includes("AMBER_ZONE")) {
            alertsAccumulator.push({
              type: "AMBER_ZONE",
              goalId: goal.id,
              goalName: goal.title,
              pillar: pillarMeta.pillarCode,
              message: "Goal entered amber escalation window (approaching period end).",
              triggeredAt: new Date().toISOString()
            });
          }
          if (String(status).includes("RED_ZONE")) {
            alertsAccumulator.push({
              type: "RED_ZONE",
              goalId: goal.id,
              goalName: goal.title,
              pillar: pillarMeta.pillarCode,
              message: "Goal is in the red zone after period end.",
              triggeredAt: new Date().toISOString()
            });
          }

          const displayActual = isPrecisionSensitiveFormula(goal.formulaType)
            ? round(toNumber(selectedActualValue, 0), 4)
            : round(toNumber(selectedActualValue, 0), 2);

          const daysRemaining = Math.ceil(
            (new Date(goal.endDate).getTime() - Date.now()) / 86400000
          );

          return {
            id: goal.id,
            goalName: goal.title,
            progressPct: selectedProgressPct,
            status,
            weight: resolveWeight(goal.scorecardWeight, fallbackWeight),
            actualValue: displayActual,
            targetValue,
            stretchTargetValue: parseStretchTargetValueFromActivities(goal.activities),
            isReverseKpi: Boolean(goal.isReverseKpi),
            isPendingApproval: Boolean(goal.isPendingApproval),
            excludedFromScoring,
            missingValue,
            dataQualityAlert,
            dataSource: goal.dataSourceModule || goal.syncEndpointPath || null,
            lastSyncedAt: goal.lastSyncedAt,
            periodEnd: goal.endDate,
            daysRemaining,
            departmentBreakdown
          };
        })
      );

      const activeRows = rows.filter((row) => !row.excludedFromScoring);
      const pillarScore = activeRows.reduce(
        (sum, row) => sum + (row.effectiveWeight * row.progressPct) / 100,
        0
      );
      const pillarScoreRounded = round(pillarScore, 2);
      const pillarStatus = departmentProgressTrafficStatus(pillarScoreRounded, 0.1);

      return {
        pillarName,
        pillarCode: pillarMeta.pillarCode,
        pillarLabel: pillarMeta.pillarLabel,
        pillarWeight: pillarWeightsResolved[pillarName],
        pillarScore: pillarScoreRounded,
        pillarStatus,
        goals: rows,
        trendVsPreviousPeriod: null as number | null,
        dataQualityAlert: rows.some((r) => r.dataQualityAlert)
      };
    });

    const orgBscScore = groupedByPillar.reduce(
      (sum, pillar) => sum + (pillar.pillarWeight * pillar.pillarScore) / 100,
      0
    );
    const orgBscScoreRounded = round(orgBscScore, 2);
    const orgBscStatus = departmentProgressTrafficStatus(orgBscScoreRounded, 0.1);

    if (unresolvedDeptLabels.size > 0) {
      dashboardWarnings.push(
        `Department breakdown could not resolve: ${[...unresolvedDeptLabels].join("; ")}.`
      );
    }

    const reviewPeriod = resolvePeriodLabel({
      periodLabel: contract?.periodLabel || params.periodLabel,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd
    });

    return {
      viewType: "ORG_BSC",
      organisationName,
      reviewPeriod,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      lastUpdated: new Date().toISOString(),
      /** Indicator raw ratings else use 1–6; org pillar scores remain progress % for the heatmap. */
      ratingScale: { ...PERFORMANCE_RATING_SCALE },
      ceoVision: {
        statement: visionStatement,
        strategyDocumentUrl
      },
      orgBscScore: orgBscScoreRounded,
      orgBscStatus,
      warnings: dashboardWarnings,
      alerts: alertsAccumulator,
      pillars: groupedByPillar.map((pillar) => ({
        pillarCode: pillar.pillarCode,
        pillarLabel: pillar.pillarLabel,
        pillarWeight: pillar.pillarWeight,
        pillarScore: pillar.pillarScore,
        pillarStatus: pillar.pillarStatus,
        trendVsPreviousPeriod: pillar.trendVsPreviousPeriod,
        dataQualityAlert: pillar.dataQualityAlert,
        goals: pillar.goals.map((goal: any) => ({
          goalId: goal.id,
          goalName: goal.goalName,
          goalWeight: goal.weight,
          effectiveWeight: goal.effectiveWeight,
          targetValue: goal.targetValue,
          actualValue: goal.actualValue,
          progressPct: goal.excludedFromScoring ? 0 : goal.progressPct,
          status: goal.excludedFromScoring ? "PENDING" : goal.status,
          isReverseKpi: Boolean(goal.isReverseKpi),
          isPendingApproval: goal.isPendingApproval,
          missingValue: goal.missingValue,
          excludedFromScoring: goal.excludedFromScoring,
          dataQualityAlert: goal.dataQualityAlert,
          dataSource: goal.dataSource,
          lastSyncedAt: goal.lastSyncedAt ? goal.lastSyncedAt.toISOString() : null,
          periodEnd: goal.periodEnd ? goal.periodEnd.toISOString() : null,
          daysRemaining: goal.daysRemaining,
          departmentBreakdown: canDrillToDepartment ? goal.departmentBreakdown : []
        }))
      })),
      access: {
        canView: orgAccess.canView,
        drillDownToDepartment: canDrillToDepartment,
        drillDownToIndividual: canDrillToIndividual
      },
      overallScore: orgBscScoreRounded
    };
  }

  static async finalizeScorecard(params: {
    viewer: any;
    scorecardId: string;
    meta?: any;
  }) {
    const scorecard = await prisma.performanceScorecard.findUnique({
      where: { id: params.scorecardId },
      include: {
        contract: true,
        subjectUser: {
          include: {
            role: true,
            employee: true
          }
        }
      }
    });

    if (!scorecard) {
      throw new Error("Scorecard not found");
    }

    if (scorecard.isLocked || isFinalOrArchived(scorecard.status)) {
      return scorecard;
    }

    if (scorecard.scorecardType === "EMPLOYEE") {
      await this.assertEmployeeAccess(params.viewer, scorecard.subjectUser, scorecard.subjectUser?.employee, "generate", params.meta);
    } else if (scorecard.scorecardType === "DEPARTMENT") {
      await this.assertDepartmentAccess(params.viewer, scorecard.departmentName, "generate", params.meta);
    } else if (scorecard.scorecardType === "CEO") {
      await this.assertCEOAccess(params.viewer, "generate", params.meta);
    } else if (scorecard.scorecardType === "BOARD") {
      await this.assertBoardAccess(params.viewer, params.meta);
    }

    const updated = await prisma.performanceScorecard.update({
      where: { id: params.scorecardId },
      data: {
        status: "FINAL",
        isLocked: true,
        documentLockedAt: new Date(),
        finalisedById: params.viewer.id,
        signatureState: {
          ...(scorecard.signatureState || {}),
          finalisedBy: params.viewer.id,
          finalisedAt: new Date().toISOString()
        }
      }
    });

    await AuditService.log({
      userId: params.viewer.id,
      action: "FINALIZE",
      entityType: "PerformanceScorecard",
      entityId: updated.id,
      newValues: {
        status: "FINAL",
        isLocked: true
      },
      ...getRequestMetadata(params.meta)
    });

    return updated;
  }
}
