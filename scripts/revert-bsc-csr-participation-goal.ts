/**
 * Undo the latest BSC CSR participation write: restores from
 * `BSC_ENTRY_CSR_PARTICIPATION_RATE` audit, strips BSC + participant snapshot keys from syncConfig,
 * clears activities (optional --completed / --eligible), deletes that audit row.
 *
 * Usage:
 *   npx ts-node scripts/revert-bsc-csr-participation-goal.ts <goalId>
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/client";
import { computeAchievementPercent, isTargetMet } from "../src/services/performanceGoalRollupUtils";
import { legacyProgressFieldsForGoal } from "../src/services/PerformanceGoalService";
import { resolveGoalEscalationStatus } from "../src/services/performanceScorecardSupport";

const prisma = new PrismaClient();

const ACTION = "BSC_ENTRY_CSR_PARTICIPATION_RATE";

function stripBscKeys(raw: unknown): Prisma.InputJsonValue {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of Object.keys(o)) {
    if (String(k).toLowerCase().startsWith("bsc")) delete o[k];
  }
  for (const k of ["participantsCompleted", "participantsEligible", "participationPercent"]) {
    delete o[k];
  }
  return o as Prisma.InputJsonValue;
}

function parseArgs(argv: string[]): { goalId: string; completed: number; eligible: number } {
  const rest = argv.filter((a) => a !== "--");
  let completed = 0;
  let eligible = 0;
  const gid = rest[0];
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === "--completed" && rest[i + 1]) {
      completed = Math.max(0, parseInt(rest[i + 1], 10) || 0);
      i++;
    } else if (rest[i] === "--eligible" && rest[i + 1]) {
      eligible = Math.max(0, parseInt(rest[i + 1], 10) || 0);
      i++;
    }
  }
  if (!gid) {
    console.error(
      "Usage: ts-node scripts/revert-bsc-csr-participation-goal.ts <goalId> [--completed N] [--eligible N]"
    );
    process.exit(1);
  }
  return { goalId: gid, completed, eligible };
}

async function main() {
  const { goalId, completed, eligible } = parseArgs(process.argv.slice(2));

  const log = await prisma.auditLog.findFirst({
    where: { entityType: "PerformanceGoal", entityId: goalId, action: ACTION },
    orderBy: { createdAt: "desc" }
  });

  if (!log?.oldValues || typeof log.oldValues !== "object") {
    console.log(`[skip] no ${ACTION} audit for ${goalId}`);
    await prisma.$disconnect();
    return;
  }

  const ov = log.oldValues as Record<string, unknown>;
  const g = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
  if (!g) {
    console.log(`[skip] goal not found ${goalId}`);
    await prisma.$disconnect();
    return;
  }

  const cvRaw = ov.currentValue;
  const cv = parseFloat(String(cvRaw != null && cvRaw !== "" ? cvRaw : "0"));
  const currentValue = Number.isFinite(cv) ? cv : 0;

  const progressPercentage = computeAchievementPercent({
    currentValue,
    targetValue: g.targetValue,
    targetOperator: g.targetOperator,
    isReverseKpi: g.isReverseKpi,
    progressPercentage: g.progressPercentage
  });
  const targetNum = g.targetValue ? parseFloat(String(g.targetValue)) : 0;
  const metTarget = isTargetMet(currentValue, targetNum, g.targetOperator, g.isReverseKpi);
  const stage = metTarget ? "completed" : "in_progress";
  const status = metTarget ? "completed" : "active";

  const riskZoneResolved = resolveGoalEscalationStatus({
    preciseCurrentValue: String(currentValue),
    currentValue,
    preciseTargetValue: g.preciseTargetValue,
    targetValue: g.targetValue,
    allowableVariance: g.allowableVariance,
    isReverseKpi: g.isReverseKpi,
    endDate: g.endDate
  });

  const legacy = legacyProgressFieldsForGoal(g, currentValue);
  const nextSync = stripBscKeys(g.syncConfig);
  const baseActs =
    g.activities && typeof g.activities === "object" && !Array.isArray(g.activities)
      ? { ...(g.activities as Record<string, unknown>) }
      : {};
  const activities =
    completed > 0 || eligible > 0
      ? { ...baseActs, participantsCompleted: completed, participantsEligible: eligible }
      : null;

  await prisma.performanceGoal.update({
    where: { id: goalId },
    data: {
      currentValue: new Decimal(currentValue),
      preciseCurrentValue: currentValue > 0 ? String(currentValue) : null,
      progressPercentage: new Decimal(progressPercentage),
      stage,
      status,
      performanceRiskZone: riskZoneResolved,
      performanceRiskZoneAt: new Date(),
      syncConfig: nextSync,
      activities,
      ...legacy,
      updatedAt: new Date()
    }
  });

  await prisma.auditLog.delete({ where: { id: log.id } });
  console.log(`[ok] reverted ${goalId} to CSR index ${currentValue}, removed audit ${log.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
