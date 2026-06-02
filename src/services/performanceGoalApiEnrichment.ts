// @ts-nocheck
import { prisma } from "../utils/database";
import {
  deriveGoalProgressState,
  parseGoalCurrentAndTargetForAnalytics
} from "./performanceGoalRollupUtils";
import { resolveDefaultCompanyGoalAssigneeId } from "./performanceGoalDefaultAssignee";
import { resolveGoalTargetUnitForApi } from "./performanceGoalTargetUnit";

export type CompanyGoalAssigneeCache = {
  ceoUser: { id: string; firstName: string; lastName: string; email: string } | null;
  loaded: boolean;
};

export function createCompanyGoalAssigneeCache(): CompanyGoalAssigneeCache {
  return { ceoUser: null, loaded: false };
}

async function loadCeoAssignee(cache: CompanyGoalAssigneeCache) {
  if (cache.loaded) return cache.ceoUser;
  cache.loaded = true;
  const ceoId = await resolveDefaultCompanyGoalAssigneeId();
  if (!ceoId) return null;
  const user = await prisma.user.findUnique({
    where: { id: ceoId },
    select: { id: true, firstName: true, lastName: true, email: true }
  });
  cache.ceoUser = user;
  return cache.ceoUser;
}

function toProgressNumber(progressPercentage: string | number | unknown): number {
  if (progressPercentage == null || progressPercentage === "") return 0;
  const n = parseFloat(String(progressPercentage));
  return Number.isFinite(n) ? n : 0;
}

/**
 * API list/detail: correct progress % from current/target and CEO as owner for company goals.
 */
export async function enrichPerformanceGoalForApi(
  goal: any,
  cache: CompanyGoalAssigneeCache = createCompanyGoalAssigneeCache()
): Promise<any> {
  if (!goal) return goal;

  const { current, target } = parseGoalCurrentAndTargetForAnalytics(goal);
  const progressState = deriveGoalProgressState({
    currentValue: current,
    targetValue: target,
    targetOperator: goal.targetOperator,
    isReverseKpi: goal.isReverseKpi,
    previousStage: goal.stage,
    progressPercentage: goal.progressPercentage
  });

  let assignedTo = goal.assignedTo ?? null;
  let assignedToId = goal.assignedToId ?? assignedTo?.id ?? null;
  const isCompany = String(goal.type || "").toLowerCase() === "company";

  if (isCompany && !assignedTo) {
    const ceo = await loadCeoAssignee(cache);
    if (ceo) {
      assignedTo = ceo;
      if (!assignedToId) {
        assignedToId = ceo.id;
      }
    }
  }

  const ownerDisplayName = assignedTo
    ? `${assignedTo.firstName || ""} ${assignedTo.lastName || ""}`.trim() || assignedTo.email
    : null;

  return {
    ...goal,
    targetUnit: resolveGoalTargetUnitForApi(goal),
    progressPercentage: toProgressNumber(progressState.progressPercentage),
    stage: progressState.stage,
    assignedTo,
    assignedToId,
    ownerDisplayName
  };
}

export async function enrichPerformanceGoalsForApi(goals: any[]): Promise<any[]> {
  const cache = createCompanyGoalAssigneeCache();
  return Promise.all(goals.map((g) => enrichPerformanceGoalForApi(g, cache)));
}
