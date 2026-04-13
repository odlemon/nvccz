/**
 * Undo the last BSC financial-outcome ROI write on one or more goals: restores numeric fields
 * from the latest `BSC_ENTRY_FINANCIAL_OUTCOME_ROI` audit row, strips `bsc*` keys from syncConfig,
 * deletes that audit row. Optionally reverts CEO/Board rows mirrored from a source goal.
 *
 * Usage:
 *   npx ts-node scripts/revert-bsc-financial-roi-goal.ts <sourceGoalId>
 *   npx ts-node scripts/revert-bsc-financial-roi-goal.ts <goalId1> <goalId2>
 *
 * With mirrors (goals where syncConfig.mirroredFromGoalId === sourceGoalId):
 *   npx ts-node scripts/revert-bsc-financial-roi-goal.ts <sourceGoalId> --with-mirrors
 *
 * Parent goal rollups are not automatically recomputed; refresh parents via the app if needed.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACTION = "BSC_ENTRY_FINANCIAL_OUTCOME_ROI";

function stripBscKeys(raw: unknown): Prisma.InputJsonValue {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of Object.keys(o)) {
    if (String(k).toLowerCase().startsWith("bsc")) delete o[k];
  }
  return o as Prisma.InputJsonValue;
}

async function findMirroredGoalIds(sourceGoalId: string): Promise<string[]> {
  const rows = await prisma.performanceGoal.findMany({
    where: { syncConfig: { not: Prisma.JsonNull } },
    select: { id: true, syncConfig: true }
  });
  return rows
    .filter((r) => {
      const sc = r.syncConfig as Record<string, unknown> | null;
      return sc && String(sc.mirroredFromGoalId || "") === sourceGoalId;
    })
    .map((r) => r.id);
}

async function revertOneGoal(goalId: string): Promise<boolean> {
  const log = await prisma.auditLog.findFirst({
    where: {
      entityType: "PerformanceGoal",
      entityId: goalId,
      action: ACTION
    },
    orderBy: { createdAt: "desc" }
  });

  if (!log?.oldValues || typeof log.oldValues !== "object") {
    console.log(`[skip] no ${ACTION} audit for ${goalId}`);
    return false;
  }

  const ov = log.oldValues as Record<string, unknown>;
  const g = await prisma.performanceGoal.findUnique({
    where: { id: goalId },
    select: { syncConfig: true }
  });
  if (!g) {
    console.log(`[skip] goal not found ${goalId}`);
    return false;
  }

  const nextSync = stripBscKeys(g.syncConfig);

  await prisma.performanceGoal.update({
    where: { id: goalId },
    data: {
      currentValue:
        ov.currentValue != null && ov.currentValue !== ""
          ? new Decimal(String(ov.currentValue))
          : undefined,
      preciseCurrentValue:
        ov.preciseCurrentValue != null && ov.preciseCurrentValue !== ""
          ? String(ov.preciseCurrentValue)
          : undefined,
      progressPercentage:
        ov.progressPercentage != null && ov.progressPercentage !== ""
          ? new Decimal(String(ov.progressPercentage))
          : undefined,
      performanceRiskZone:
        ov.performanceRiskZone != null ? String(ov.performanceRiskZone) : null,
      performanceRiskZoneAt: ov.performanceRiskZone != null ? new Date() : null,
      syncConfig: nextSync,
      updatedAt: new Date()
    }
  });

  await prisma.auditLog.delete({ where: { id: log.id } });
  console.log(`[ok] reverted ${goalId}, removed audit ${log.id}`);
  return true;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--with-mirrors");
  const withMirrors = process.argv.includes("--with-mirrors");
  if (args.length < 1) {
    console.error("Usage: ts-node scripts/revert-bsc-financial-roi-goal.ts <goalId> [--with-mirrors]");
    process.exit(1);
  }

  const primary = args[0];
  const ids = new Set<string>([primary]);
  if (withMirrors) {
    for (const m of await findMirroredGoalIds(primary)) ids.add(m);
  }
  for (const id of args.slice(1)) ids.add(id);

  for (const gid of ids) {
    await revertOneGoal(gid);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
