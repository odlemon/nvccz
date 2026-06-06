// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import {
  BOARD_SECTION_LABELS,
  BOARD_SECTION_WEIGHTS,
  CEO_SECTION_LABELS,
  CEO_SECTION_WEIGHTS,
  buildPersonalAttributesRatingGrid,
  buildTrainingSection,
  ceoPerformanceLabelForSection,
  ceoPerformanceLabelOverall,
  computeBudgetUtilisationRating,
  computeGoalProgress,
  computeRawRating,
  computeStatus,
  mergeQualitativeTemplate,
  parsePersonalAttributesGridToRatings,
  performanceLabelFromDepartmentScore,
  performanceLabelFromScore,
  rawRatingBandLabel,
  rawRatingToRowSeverity,
  resolveScorecardLifecycleBanner,
  resolveSectionWeights,
  round,
  summariseEmployeeResultsDelivery,
  toNumber,
  validatePersonalAttributesGrid
} from "./performanceScorecardSupport";

function getRequestMetadata(meta?: any) {
  return {
    ipAddress: meta?.ipAddress || undefined,
    userAgent: meta?.userAgent || undefined
  };
}

function decimalForStorage(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Decimal(round(value, 2).toFixed(2));
}

export type MatrixRowPatch = {
  goalId: string;
  actualValue?: number;
  targetValue?: number;
  rawRating?: number;
  weight?: number;
};

export type ScorecardLookup =
  | { scorecardId: string }
  | {
      scorecardType: "EMPLOYEE";
      employeeUserId: string;
      periodStart?: string | Date;
      periodEnd?: string | Date;
      periodLabel?: string;
    }
  | {
      scorecardType: "CEO";
      periodStart?: string | Date;
      periodEnd?: string | Date;
      periodLabel?: string;
    }
  | {
      scorecardType: "BOARD";
      periodStart?: string | Date;
      periodEnd?: string | Date;
      periodLabel?: string;
    }
  | {
      scorecardType: "DEPARTMENT";
      departmentName?: string;
      departmentId?: string;
      periodStart?: string | Date;
      periodEnd?: string | Date;
      periodLabel?: string;
    };

function currentPeriodBounds() {
  const now = new Date();
  const year = now.getUTCFullYear();
  return {
    periodStart: new Date(Date.UTC(year, 0, 1)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

function periodBoundsFromYearLabel(periodLabel: unknown) {
  const raw = String(periodLabel ?? "").trim();
  const match = raw.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return {
    periodStart: new Date(Date.UTC(year, 0, 1)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: raw || String(year)
  };
}

export function buildScorecardPeriod(input?: {
  periodStart?: string | Date;
  periodEnd?: string | Date;
  periodLabel?: string;
}) {
  if (input?.periodStart && input?.periodEnd) {
    return {
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      periodLabel: input.periodLabel
    };
  }
  const fromYearLabel = periodBoundsFromYearLabel(input?.periodLabel);
  if (fromYearLabel) return fromYearLabel;
  return currentPeriodBounds();
}

async function resolveDepartmentName(input: { departmentId?: string; departmentName?: string }) {
  if (input.departmentId) {
    const d = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true, name: true, isActive: true }
    });
    if (!d || !d.isActive) throw new Error("Department not found.");
    return d.name;
  }
  const name = String(input.departmentName || "").trim();
  if (!name) throw new Error("departmentId or department name is required.");
  return name;
}

export async function resolvePersistedScorecardId(lookup: ScorecardLookup): Promise<string> {
  if ("scorecardId" in lookup && lookup.scorecardId) {
    return lookup.scorecardId;
  }

  const period = buildScorecardPeriod(lookup);

  if (lookup.scorecardType === "EMPLOYEE") {
    const scorecard = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "EMPLOYEE",
        subjectUserId: lookup.employeeUserId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    if (!scorecard) throw new Error("Employee scorecard not found for this period.");
    return scorecard.id;
  }

  if (lookup.scorecardType === "CEO") {
    const scorecard = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "CEO",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    if (!scorecard) throw new Error("CEO scorecard not found for this period.");
    return scorecard.id;
  }

  if (lookup.scorecardType === "BOARD") {
    const scorecard = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "BOARD",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    if (!scorecard) throw new Error("Board scorecard not found for this period.");
    return scorecard.id;
  }

  if (lookup.scorecardType === "DEPARTMENT") {
    const departmentName = await resolveDepartmentName(lookup);
    const scorecard = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: "DEPARTMENT",
        departmentName,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    if (!scorecard) throw new Error("Department scorecard not found for this period.");
    return scorecard.id;
  }

  throw new Error("Invalid scorecard lookup");
}

async function loadScorecardContext(scorecardId: string) {
  const scorecard = await prisma.performanceScorecard.findUnique({
    where: { id: scorecardId },
    include: {
      contract: true,
      subjectUser: {
        include: {
          role: { select: { name: true } },
          employee: { select: { lineManagerUserId: true, terminated: true } }
        }
      }
    }
  });
  if (!scorecard) throw new Error("Scorecard not found");
  if (scorecard.subjectUser?.employee?.terminated) {
    throw new Error("This employee has been terminated.");
  }
  return scorecard;
}

function buildBudgetComponentFromContract(contract: any) {
  if (contract?.allocatedBudget === null || contract?.allocatedBudget === undefined) {
    return { included: false, score: null };
  }
  const allocatedBudget = toNumber(contract.allocatedBudget, 0);
  const actualSpend = toNumber(contract.actualSpend, 0);
  if (allocatedBudget <= 0) return { included: false, score: null };
  const budgetUtilisationPct = round((actualSpend / allocatedBudget) * 100, 2);
  return { included: true, score: computeBudgetUtilisationRating(budgetUtilisationPct) };
}

function matrixRowSeverity(row: any): string {
  if (row.isPendingApproval) return "pending";
  if (row.excludedFromScoring) return "excluded";
  return rawRatingToRowSeverity(row.rawRating);
}

function patchMatrixRows(rows: any[], patches: MatrixRowPatch[] | undefined): any[] {
  if (!patches?.length) return rows.map((r) => ({ ...r }));

  const patchByGoal = new Map(patches.map((p) => [String(p.goalId).trim(), p]));

  return rows.map((row) => {
    const patch = patchByGoal.get(String(row.id || "").trim());
    if (!patch) return { ...row };

    const next = { ...row };
    if (patch.actualValue !== undefined) {
      const actual = toNumber(patch.actualValue, 0);
      next.actualValue = actual;
      next.computedActual = actual;
      next.selectedActualValue = actual;
    }
    if (patch.targetValue !== undefined) next.targetValue = toNumber(patch.targetValue, 0);
    if (patch.weight !== undefined) {
      const w = toNumber(patch.weight, 0);
      next.weight = w;
      next.originalWeight = w;
      if (next.effectiveWeight != null) next.effectiveWeight = w;
    }

    if (patch.rawRating !== undefined && patch.rawRating !== null) {
      next.rawRating = toNumber(patch.rawRating, 0);
    } else if (patch.actualValue !== undefined || patch.targetValue !== undefined) {
      if (!next.isPendingApproval && !next.excludedFromScoring && next.targetValue > 0) {
        const actualForRating =
          next.computedActual ?? next.selectedActualValue ?? next.actualValue ?? 0;
        next.rawRating = computeRawRating({
          actualValue: actualForRating,
          targetValue: next.targetValue,
          allowableVariance: next.allowableVariance,
          isReverseKpi: next.isReverseKpi
        });
        const progress = computeGoalProgress({
          actualValue: actualForRating,
          targetValue: next.targetValue,
          isReverseKpi: next.isReverseKpi,
          stretchScoringEnabled: false
        });
        next.progressPct = progress.progressPct;
        if (next.selectedProgressPct != null) next.selectedProgressPct = progress.progressPct;
      }
    }

    const effWeight = toNumber(next.effectiveWeight ?? next.weight, 0);
    if (next.rawRating != null && !next.isPendingApproval && !next.excludedFromScoring) {
      next.weightedScore = round((effWeight * toNumber(next.rawRating, 0)) / 100, 4);
    }

    return next;
  });
}

function summariseContractSectionScores(
  flatRows: any[],
  sectionWeights: Record<string, number>,
  opts?: {
    sectionBlendMode?: "penalise" | "redistribute";
    sectionLabels?: Record<string, string>;
  }
) {
  const blendMode = opts?.sectionBlendMode ?? "redistribute";
  const sectionLabels = opts?.sectionLabels ?? CEO_SECTION_LABELS;
  const keys = Object.keys(sectionWeights);

  const sections = keys.map((sectionKey) => {
    const sectionRows = flatRows.filter((row) => row.section === sectionKey);
    const activeW = sectionRows.reduce((sum, row) => sum + toNumber(row.effectiveWeight, 0), 0);
    const totalWeightedScore = sectionRows.reduce(
      (sum, row) => sum + toNumber(row.weightedScore, 0),
      0
    );
    const sectionScore = activeW > 0 ? round((totalWeightedScore * 100) / activeW, 4) : 0;
    const scoreableCount = sectionRows.filter((r) => !r.excludedFromScoring).length;
    return {
      key: sectionKey,
      label: sectionLabels[sectionKey] || sectionKey,
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
      }
    }
    finalScore = totalBlendW > 0 ? round(weightedSum / totalBlendW, 2) : 0;
  }

  return { sections, finalScore };
}

function recomputeDepartmentScore(rows: any[]) {
  const activeRows = rows.filter((row) => !row.isPendingApproval && !row.excludedFromScoring);
  const activeGoalWeight = activeRows.reduce(
    (sum, row) => sum + toNumber(row.effectiveWeight ?? row.weight, 0),
    0
  );
  const totalWeightedScore = activeRows.reduce(
    (sum, row) => sum + toNumber(row.weightedScore, 0),
    0
  );
  const departmentScore =
    activeGoalWeight > 0 ? round((totalWeightedScore * 100) / activeGoalWeight, 2) : 0;
  return {
    departmentScore,
    performanceLabel: performanceLabelFromDepartmentScore(departmentScore)
  };
}

function buildManualCorrectionMeta(params: {
  viewer: any;
  editReason: string;
  previousFinalScore: number | null;
  newFinalScore: number;
  scorecardStatus: string;
}) {
  const name =
    `${params.viewer?.firstName || ""} ${params.viewer?.lastName || ""}`.trim() ||
    params.viewer?.email ||
    "User";
  return {
    at: new Date().toISOString(),
    byUserId: params.viewer?.id ?? null,
    byName: name,
    reason: params.editReason,
    previousFinalScore: params.previousFinalScore,
    newFinalScore: params.newFinalScore,
    scorecardStatus: params.scorecardStatus
  };
}

function syncEmployeeMatrixInDocument(doc: Record<string, unknown>, rows: any[]) {
  doc.performanceMatrix = rows.map((row, index) => {
    const pendingOrExcluded = row.isPendingApproval || row.excludedFromScoring;
    const actualForVariance = row.selectedActualValue ?? row.actualValue ?? row.computedActual;
    const varianceStatus =
      pendingOrExcluded || row.targetValue <= 0
        ? null
        : computeStatus({
            actualValue: actualForVariance,
            targetValue: row.targetValue,
            allowableVariance: row.allowableVariance,
            isReverseKpi: row.isReverseKpi
          });
    return {
      index: index + 1,
      goal: row.goalName ?? row.indicatorName,
      kpiOrMeasure: row.kpiOrMeasure ?? row.formulaType,
      target: row.targetValue,
      actual: pendingOrExcluded ? "Pending Approval" : actualForVariance,
      variance: row.targetValue > 0 ? round(actualForVariance - row.targetValue, 2) : null,
      varianceStatus,
      progressPct: pendingOrExcluded ? "Pending Approval" : row.progressPct ?? row.selectedProgressPct,
      rawRating: pendingOrExcluded ? "Pending Approval" : row.rawRating,
      rawRatingLabel:
        !pendingOrExcluded && row.rawRating != null ? rawRatingBandLabel(row.rawRating) : null,
      weight: row.originalWeight ?? row.weight,
      effectiveWeight: row.effectiveWeight ?? row.weight,
      weightedScore: pendingOrExcluded ? "Pending Approval" : row.weightedScore,
      rowSeverity: matrixRowSeverity(row)
    };
  });
}

function syncCeoBoardDocument(
  doc: Record<string, unknown>,
  rows: any[],
  sectionSummary: { sections: any[]; finalScore: number },
  performanceLabel: string,
  scorecardType: string
) {
  const sectionTables = (doc.sectionTables as Record<string, any>) || {};
  for (const sec of sectionSummary.sections) {
    const existing = sectionTables[sec.key] || { rows: [] };
    sectionTables[sec.key] = {
      ...existing,
      sectionScore: sec.sectionScore,
      performanceLabel: sec.performanceLabel,
      rows: sec.indicators.map((r: any, idx: number) => ({
        index: idx + 1,
        indicatorName: r.indicatorName,
        formulaMeasure: r.formulaType,
        unit: r.unit,
        target: r.targetValue,
        computedActual: r.computedActual ?? r.actualValue,
        allowableVariance: r.allowableVariance,
        rawRating: r.rawRating,
        rawRatingLabel: r.rawRating != null ? rawRatingBandLabel(r.rawRating) : null,
        weight: r.originalWeight ?? r.weight,
        effectiveWeight: r.effectiveWeight ?? r.weight,
        weightedScore: r.weightedScore,
        rowSeverity: matrixRowSeverity(r),
        isPendingApproval: r.isPendingApproval,
        excludedFromScoring: r.excludedFromScoring,
        missingValue: r.missingValue
      }))
    };
  }
  doc.sectionTables = sectionTables;
  doc.agreedRatingsSummary = [
    ...sectionSummary.sections.map((s) => ({
      section: s.key,
      heading: s.label,
      sectionScore: s.sectionScore,
      label: s.performanceLabel
    })),
    {
      section: "TOTAL",
      heading: "Final Score",
      sectionScore: sectionSummary.finalScore,
      label: performanceLabel
    }
  ];
  doc.subtotals = {
    ...(doc.subtotals as object),
    finalScore: sectionSummary.finalScore,
    performanceLabel
  };
  if (scorecardType === "CEO") {
    (doc.subtotals as any).sectionBlendScore = sectionSummary.finalScore;
  }
}

function buildScoresResponse(scorecardType: string, computed: Record<string, unknown>) {
  if (scorecardType === "EMPLOYEE") {
    return {
      resultsDeliveryScore: computed.resultsDeliveryScore,
      budgetScore: computed.budgetScore,
      finalScore: computed.finalScore,
      performanceLabel: computed.performanceLabel
    };
  }
  if (scorecardType === "DEPARTMENT") {
    return {
      departmentScore: computed.departmentScore,
      performanceLabel: computed.performanceLabel
    };
  }
  if (scorecardType === "CEO") {
    return {
      sectionScores: computed.sectionScores,
      sectionBlendScore: computed.sectionBlendScore,
      budgetScore: computed.budgetScore,
      finalScore: computed.finalScore,
      performanceLabel: computed.performanceLabel
    };
  }
  return {
    sectionScores: computed.sectionScores,
    finalScore: computed.finalScore,
    performanceLabel: computed.performanceLabel
  };
}

function buildSavedRecord(scorecard: any) {
  return {
    id: scorecard.id,
    scorecardType: scorecard.scorecardType,
    status: scorecard.status,
    isLocked: scorecard.isLocked,
    periodLabel: scorecard.periodLabel,
    periodStart: scorecard.periodStart,
    periodEnd: scorecard.periodEnd,
    resultsDeliveryScore: scorecard.resultsDeliveryScore,
    budgetScore: scorecard.budgetScore,
    finalScore: scorecard.finalScore,
    subjectUserId: scorecard.subjectUserId,
    departmentName: scorecard.departmentName,
    contractId: scorecard.contractId
  };
}

export async function loadScorecardForEdit(scorecardId: string, viewer: any, meta?: any) {
  const scorecard = await loadScorecardContext(scorecardId);
  const matrixRows = Array.isArray(scorecard.matrixRows) ? scorecard.matrixRows : [];
  const document =
    scorecard.documentPayload && typeof scorecard.documentPayload === "object"
      ? scorecard.documentPayload
      : {};
  const lifecycle = resolveScorecardLifecycleBanner(new Date(scorecard.periodEnd), {
    status: scorecard.status,
    isLocked: scorecard.isLocked,
    archivedAt: scorecard.archivedAt
  });

  const finalScore = toNumber(scorecard.finalScore, 0);
  const budgetScore = scorecard.budgetScore != null ? toNumber(scorecard.budgetScore, 0) : null;
  const resultsDeliveryScore = toNumber(scorecard.resultsDeliveryScore, 0);

  let scores: Record<string, unknown>;
  if (scorecard.scorecardType === "DEPARTMENT") {
    scores = {
      departmentScore: finalScore,
      performanceLabel: performanceLabelFromDepartmentScore(finalScore)
    };
  } else if (scorecard.scorecardType === "CEO") {
    const sectionScores: Record<string, number> = {};
    const storedSections = scorecard.sections || {};
    for (const [key, val] of Object.entries(storedSections)) {
      if (val && typeof val === "object" && (val as any).sectionScore != null) {
        sectionScores[key] = toNumber((val as any).sectionScore, 0);
      }
    }
    scores = {
      sectionScores,
      sectionBlendScore: resultsDeliveryScore,
      budgetScore,
      finalScore,
      performanceLabel: performanceLabelFromScore(finalScore)
    };
  } else if (scorecard.scorecardType === "BOARD") {
    const sectionScores: Record<string, number> = {};
    const storedSections = scorecard.sections || {};
    for (const [key, val] of Object.entries(storedSections)) {
      if (val && typeof val === "object" && (val as any).sectionScore != null) {
        sectionScores[key] = toNumber((val as any).sectionScore, 0);
      }
    }
    scores = {
      sectionScores,
      finalScore,
      performanceLabel: performanceLabelFromScore(finalScore)
    };
  } else {
    scores = {
      resultsDeliveryScore,
      budgetScore,
      finalScore,
      performanceLabel: performanceLabelFromScore(finalScore)
    };
  }

  const response: Record<string, unknown> = {
    scorecardId: scorecard.id,
    scorecardType: scorecard.scorecardType,
    savedRecord: buildSavedRecord(scorecard),
    matrixRows,
    sections: scorecard.sections ?? null,
    rollupSummary: scorecard.rollupSummary ?? null,
    qualitativeSections: scorecard.qualitativeSections ?? document.qualitativeSections ?? null,
    scores,
    document,
    lifecycle,
    warnings: Array.isArray(scorecard.warnings) ? scorecard.warnings : []
  };

  if (scorecard.scorecardType === "EMPLOYEE" && scorecard.subjectUser) {
    response.employee = {
      id: scorecard.subjectUser.id,
      name: `${scorecard.subjectUser.firstName} ${scorecard.subjectUser.lastName}`,
      email: scorecard.subjectUser.email,
      department: scorecard.subjectUser.userDepartment
    };
  }
  if (scorecard.scorecardType === "DEPARTMENT") {
    response.department = { name: scorecard.departmentName };
  }

  return response;
}

function assertQualitativeOnlyEditPayload(params: {
  matrixRowPatches?: MatrixRowPatch[];
  scores?: Record<string, number | null | undefined>;
  sectionBlendMode?: string;
}) {
  if (params.matrixRowPatches?.length) {
    throw new Error(
      "matrixRowPatches are not editable. Goal actuals, targets, raw ratings, and weights are system-calculated from progress tracking."
    );
  }
  if (params.scores && Object.keys(params.scores).length > 0) {
    throw new Error(
      "scores cannot be overridden manually. Numeric scores are computed by the system from goals and contract data."
    );
  }
  if (params.sectionBlendMode) {
    throw new Error("sectionBlendMode is not used for qualitative-only scorecard edits.");
  }
}

function buildStoredScoresResponse(scorecard: any) {
  const scorecardType = scorecard.scorecardType;
  const finalScore = toNumber(scorecard.finalScore, 0);
  const resultsDeliveryScore = toNumber(scorecard.resultsDeliveryScore, 0);
  const budgetScore = scorecard.budgetScore != null ? toNumber(scorecard.budgetScore, 0) : null;

  if (scorecardType === "DEPARTMENT") {
    return {
      departmentScore: finalScore,
      performanceLabel: performanceLabelFromDepartmentScore(finalScore)
    };
  }
  if (scorecardType === "CEO") {
    const sectionScores: Record<string, number> = {};
    const storedSections = scorecard.sections || {};
    for (const [key, val] of Object.entries(storedSections)) {
      if (val && typeof val === "object" && (val as any).sectionScore != null) {
        sectionScores[key] = toNumber((val as any).sectionScore, 0);
      }
    }
    return {
      sectionScores,
      sectionBlendScore: resultsDeliveryScore,
      budgetScore,
      finalScore,
      performanceLabel: performanceLabelFromScore(finalScore)
    };
  }
  if (scorecardType === "BOARD") {
    const sectionScores: Record<string, number> = {};
    const storedSections = scorecard.sections || {};
    for (const [key, val] of Object.entries(storedSections)) {
      if (val && typeof val === "object" && (val as any).sectionScore != null) {
        sectionScores[key] = toNumber((val as any).sectionScore, 0);
      }
    }
    return {
      sectionScores,
      finalScore,
      performanceLabel: performanceLabelFromScore(finalScore)
    };
  }
  return {
    resultsDeliveryScore,
    budgetScore,
    finalScore,
    performanceLabel: performanceLabelFromScore(finalScore)
  };
}

export async function applyScorecardManualEdit(params: {
  scorecardId: string;
  viewer: any;
  editReason: string;
  matrixRowPatches?: MatrixRowPatch[];
  scores?: Record<string, number | null | undefined>;
  qualitativeEvaluation?: {
    personalAttributes: { attribute: string; columns: { label: string; selected: boolean | null }[] }[];
    trainingAndDevelopment?: Record<string, unknown>;
  };
  sectionBlendMode?: "penalise" | "redistribute";
  meta?: any;
}) {
  const editReason = String(params.editReason || "").trim();
  if (!editReason) {
    throw new Error("editReason is required for scorecard manual correction");
  }

  assertQualitativeOnlyEditPayload(params);

  if (!params.qualitativeEvaluation?.personalAttributes?.length) {
    throw new Error("qualitativeEvaluation.personalAttributes is required for scorecard manual correction");
  }

  const scorecard = await loadScorecardContext(params.scorecardId);
  const scorecardType = scorecard.scorecardType;
  const previousFinalScore =
    scorecard.finalScore != null ? toNumber(scorecard.finalScore, 0) : null;
  const storedFinalScore = previousFinalScore ?? 0;

  const oldAuditSnapshot = {
    scorecardType,
    qualitativeSections: scorecard.qualitativeSections,
    status: scorecard.status,
    isLocked: scorecard.isLocked
  };

  validatePersonalAttributesGrid(params.qualitativeEvaluation.personalAttributes);
  const personalAttributeRatings = parsePersonalAttributesGridToRatings(
    params.qualitativeEvaluation.personalAttributes
  );
  const attributeNames = params.qualitativeEvaluation.personalAttributes
    .map((r) => String(r.attribute).trim())
    .filter(Boolean);
  const mergedTemplate = mergeQualitativeTemplate(scorecard.contract?.qualitativeTemplate, {
    personalAttributeRatings,
    personalAttributes: attributeNames,
    trainingAndDevelopment: params.qualitativeEvaluation.trainingAndDevelopment
  });

  if (scorecard.contractId) {
    await prisma.performanceContract.update({
      where: { id: scorecard.contractId },
      data: { qualitativeTemplate: mergedTemplate }
    });
  }

  const qualitativeSections = {
    personalAttributes: buildPersonalAttributesRatingGrid(mergedTemplate),
    trainingAndDevelopment: buildTrainingSection(mergedTemplate)
  };

  const doc =
    scorecard.documentPayload && typeof scorecard.documentPayload === "object"
      ? { ...(scorecard.documentPayload as Record<string, unknown>) }
      : {};
  doc.qualitativeSections = qualitativeSections;

  const editorName =
    `${params.viewer?.firstName || ""} ${params.viewer?.lastName || ""}`.trim() ||
    params.viewer?.email ||
    "User";
  const manualCorrection = buildManualCorrectionMeta({
    viewer: params.viewer,
    editReason,
    previousFinalScore,
    newFinalScore: storedFinalScore,
    scorecardStatus: scorecard.status
  });
  doc.manualCorrection = manualCorrection;

  const warnings = Array.isArray(scorecard.warnings) ? [...scorecard.warnings] : [];
  const warnLine = `Qualitative evaluation corrected by ${editorName} on ${new Date().toISOString().slice(0, 10)}`;
  if (!warnings.some((w) => String(w).includes("corrected by"))) {
    warnings.push(warnLine);
  }

  const updated = await prisma.performanceScorecard.update({
    where: { id: scorecard.id },
    data: {
      qualitativeSections,
      warnings,
      documentPayload: doc
    }
  });

  await AuditService.log({
    userId: params.viewer?.id,
    action: "SCORECARD_MANUAL_EDIT",
    entityType: "PerformanceScorecard",
    entityId: scorecard.id,
    oldValues: oldAuditSnapshot,
    newValues: {
      scorecardType,
      qualitativeSections: updated.qualitativeSections,
      editReason,
      subjectUserId: scorecard.subjectUserId,
      departmentName: scorecard.departmentName,
      scorecardStatus: updated.status,
      previousFinalScore,
      newFinalScore: storedFinalScore,
      editScope: "qualitativeEvaluation"
    },
    ...getRequestMetadata(params.meta)
  }).catch((err) => console.error("Audit log (scorecard manual edit) failed:", err));

  const scores = buildStoredScoresResponse(updated);

  return {
    scorecardId: updated.id,
    scorecardType,
    savedRecord: buildSavedRecord(updated),
    document: updated.documentPayload,
    matrixRows: updated.matrixRows,
    sections: updated.sections,
    qualitativeSections: updated.qualitativeSections,
    scores,
    manualCorrection
  };
}

/** @deprecated Use loadScorecardForEdit */
export const loadEmployeeScorecardForEdit = loadScorecardForEdit;
/** @deprecated Use applyScorecardManualEdit */
export const applyEmployeeScorecardManualEdit = applyScorecardManualEdit;
