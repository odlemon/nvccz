// @ts-nocheck

import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { remoteUploadService } from "./RemoteUploadService";
import {
  BSC_PILLAR_UAT_LABEL,
  HARD_CODED_BSC_PILLARS,
  asNumber,
  pillarSlugForScorecardPillar,
  toSafeFileName,
  validateFixedPillarSet,
  validateWeightTotal
} from "./performanceBackendSupport";

type AuditMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function metaToAudit(meta?: AuditMeta) {
  return {
    ipAddress: meta?.ipAddress || undefined,
    userAgent: meta?.userAgent || undefined
  };
}

export class PerformanceConfigService {
  static async getPillarConfig() {
    const activeStrategy = await prisma.performanceStrategy.findFirst({
      where: {
        status: "ACTIVE",
        archivedAt: null
      },
      orderBy: {
        periodStart: "desc"
      }
    });

    const configuredWeights = activeStrategy?.pillarWeights || {};
    const weights: Record<string, number> = {};

    for (const pillar of HARD_CODED_BSC_PILLARS) {
      weights[pillar] = asNumber(configuredWeights?.[pillar], 25);
    }

    return {
      strategyId: activeStrategy?.id || null,
      strategyTitle: activeStrategy?.title || null,
      periodStart: activeStrategy?.periodStart || null,
      periodEnd: activeStrategy?.periodEnd || null,
      visionStatement: activeStrategy?.visionStatement || null,
      pillars: HARD_CODED_BSC_PILLARS.map((pillar) => ({
        name: pillar,
        uatDisplayName: BSC_PILLAR_UAT_LABEL[pillar] || pillar,
        weight: weights[pillar],
        nonDeletable: true
      })),
      strategyDocumentUrl: activeStrategy?.strategyDocumentUrl || null
    };
  }

  static async listStrategies(includeArchived = true) {
    return prisma.performanceStrategy.findMany({
      where: includeArchived
        ? undefined
        : {
            archivedAt: null,
            status: {
              not: "ARCHIVED"
            }
          },
      orderBy: {
        periodStart: "desc"
      }
    });
  }

  /** Single strategy (includes `strategyDocumentUrl` for client download links). */
  static async getStrategyById(strategyId: string) {
    const strategy = await prisma.performanceStrategy.findUnique({
      where: { id: strategyId }
    });
    if (!strategy) {
      throw new Error("Strategy not found.");
    }
    return strategy;
  }

  static async upsertStrategy(params: {
    strategyId?: string;
    title?: string;
    periodStart?: Date | string;
    periodEnd?: Date | string;
    strategicGoalId?: string;
    strategyDocumentUrl?: string;
    visionStatement?: string | null;
    pillarWeights?: Record<string, number>;
    metadata?: any;
    actor: any;
    meta?: AuditMeta;
  }) {
    const existing = params.strategyId
      ? await prisma.performanceStrategy.findUnique({ where: { id: params.strategyId } })
      : null;

    if (existing?.archivedAt || existing?.status === "ARCHIVED") {
      throw new Error("Archived strategies are read-only.");
    }

    const isUpdate = !!existing;

    let title: string;
    let periodStart: Date;
    let periodEnd: Date;
    let pillarWeights: Record<string, number>;

    if (isUpdate) {
      title =
        params.title !== undefined && params.title !== null && String(params.title).trim() !== ""
          ? String(params.title).trim()
          : existing.title;
      periodStart =
        params.periodStart !== undefined && params.periodStart !== null && String(params.periodStart) !== ""
          ? new Date(params.periodStart as string | Date)
          : new Date(existing.periodStart);
      periodEnd =
        params.periodEnd !== undefined && params.periodEnd !== null && String(params.periodEnd) !== ""
          ? new Date(params.periodEnd as string | Date)
          : new Date(existing.periodEnd);
      pillarWeights =
        params.pillarWeights !== undefined && params.pillarWeights !== null
          ? (params.pillarWeights as Record<string, number>)
          : ((existing.pillarWeights as Record<string, number> | null) || {});
    } else {
      if (!params.title || String(params.title).trim() === "") {
        throw new Error("title is required.");
      }
      if (params.periodStart === undefined || params.periodStart === null || String(params.periodStart) === "") {
        throw new Error("periodStart is required.");
      }
      if (params.periodEnd === undefined || params.periodEnd === null || String(params.periodEnd) === "") {
        throw new Error("periodEnd is required.");
      }
      if (params.pillarWeights === undefined || params.pillarWeights === null) {
        throw new Error("pillarWeights is required.");
      }
      title = String(params.title).trim();
      periodStart = new Date(params.periodStart as string | Date);
      periodEnd = new Date(params.periodEnd as string | Date);
      pillarWeights = params.pillarWeights as Record<string, number>;
    }

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new Error("Invalid periodStart or periodEnd.");
    }

    if (periodStart >= periodEnd) {
      throw new Error("Strategy period start must be before period end.");
    }

    const pillarValidation = validateFixedPillarSet(pillarWeights);
    if (!pillarValidation.valid) {
      throw new Error(
        `Pillar weights must match the fixed BSC pillars and total exactly 100%. Missing: ${pillarValidation.missing.join(", ") || "none"}, unexpected: ${pillarValidation.unexpected.join(", ") || "none"}, total: ${pillarValidation.total}.`
      );
    }

    const strategicGoalId = isUpdate
      ? params.strategicGoalId !== undefined
        ? params.strategicGoalId || null
        : existing.strategicGoalId
      : params.strategicGoalId || null;

    const strategyDocumentUrl = isUpdate
      ? params.strategyDocumentUrl !== undefined
        ? params.strategyDocumentUrl || null
        : existing.strategyDocumentUrl
      : params.strategyDocumentUrl || null;

    const visionStatement = isUpdate
      ? params.visionStatement !== undefined
        ? params.visionStatement === null || params.visionStatement === ""
          ? null
          : String(params.visionStatement)
        : existing.visionStatement
      : params.visionStatement === undefined || params.visionStatement === null || params.visionStatement === ""
        ? null
        : String(params.visionStatement);

    const metadata = isUpdate
      ? params.metadata !== undefined
        ? params.metadata ?? null
        : existing.metadata
      : params.metadata || null;

    const payload = {
      title,
      periodStart,
      periodEnd,
      strategicGoalId,
      strategyDocumentUrl,
      visionStatement,
      pillarWeights,
      metadata,
      status: "ACTIVE",
      archivedAt: null,
      createdById: existing?.createdById || params.actor.id
    };

    const strategy = existing
      ? await prisma.performanceStrategy.update({
          where: { id: existing.id },
          data: payload
        })
      : await prisma.performanceStrategy.create({
          data: payload
        });

    await AuditService.log({
      userId: params.actor.id,
      action: existing ? "UPDATE" : "CREATE",
      entityType: "PerformanceStrategy",
      entityId: strategy.id,
      oldValues: existing || undefined,
      newValues: strategy,
      ...metaToAudit(params.meta)
    });

    return strategy;
  }

  static async archiveStrategy(strategyId: string, actor: any, meta?: AuditMeta) {
    const strategy = await prisma.performanceStrategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy) {
      throw new Error("Strategy not found.");
    }

    if (strategy.archivedAt || strategy.status === "ARCHIVED") {
      return strategy;
    }

    const archived = await prisma.performanceStrategy.update({
      where: { id: strategyId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date()
      }
    });

    await AuditService.log({
      userId: actor.id,
      action: "ARCHIVE",
      entityType: "PerformanceStrategy",
      entityId: strategyId,
      oldValues: strategy,
      newValues: archived,
      ...metaToAudit(meta)
    });

    return archived;
  }

  static async attachStrategyDocument(params: {
    strategyId: string;
    fileBuffer: Buffer;
    originalName: string;
    /** Optional: link uploaded PDF metadata to a strategic / parent performance goal (UAT A.02). */
    strategicGoalId?: string | null;
    actor: any;
    meta?: AuditMeta;
  }) {
    const strategy = await prisma.performanceStrategy.findUnique({
      where: { id: params.strategyId }
    });

    if (!strategy) {
      throw new Error("Strategy not found.");
    }

    if (strategy.archivedAt || strategy.status === "ARCHIVED") {
      throw new Error("Archived strategies are read-only.");
    }

    // Same remote pipeline as portfolio application uploads (`FirebaseStorageService.uploadApplicationDocument` → `RemoteUploadService`).
    const safeBase = toSafeFileName(strategy.title);
    const remoteFileName = `${Date.now()}-${safeBase}-${strategy.id}.pdf`;
    const { downloadURL } = await remoteUploadService.uploadSingleFile(
      {
        buffer: params.fileBuffer,
        originalname: remoteFileName,
        mimetype: "application/pdf",
        size: params.fileBuffer.length
      },
      "application-documents"
    );

    const strategicGoalId =
      params.strategicGoalId !== undefined && params.strategicGoalId !== null && String(params.strategicGoalId).trim() !== ""
        ? String(params.strategicGoalId).trim()
        : undefined;

    if (strategicGoalId) {
      const g = await prisma.performanceGoal.findUnique({ where: { id: strategicGoalId } });
      if (!g) {
        throw new Error("strategicGoalId must reference an existing performance goal.");
      }
    }

    const updated = await prisma.performanceStrategy.update({
      where: { id: strategy.id },
      data: {
        strategyDocumentUrl: downloadURL,
        ...(strategicGoalId !== undefined ? { strategicGoalId } : {})
      }
    });

    await AuditService.log({
      userId: params.actor.id,
      action: "UPLOAD_DOCUMENT",
      entityType: "PerformanceStrategyDocument",
      entityId: strategy.id,
      oldValues: {
        strategyDocumentUrl: strategy.strategyDocumentUrl,
        strategicGoalId: strategy.strategicGoalId
      },
      newValues: {
        strategyDocumentUrl: updated.strategyDocumentUrl,
        strategicGoalId: updated.strategicGoalId,
        originalName: params.originalName
      },
      ...metaToAudit(params.meta)
    });

    return updated;
  }

  static async listThemes() {
    return prisma.performanceTheme.findMany({
      where: {
        status: {
          not: "ARCHIVED"
        }
      },
      orderBy: {
        name: "asc"
      }
    });
  }

  static async createTheme(params: {
    name: string;
    description?: string;
    color?: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const existing = await prisma.performanceTheme.findUnique({
      where: {
        name: params.name
      }
    });

    if (existing) {
      return existing;
    }

    const theme = await prisma.performanceTheme.create({
      data: {
        name: params.name,
        description: params.description || null,
        color: params.color || null,
        createdById: params.actor.id
      }
    });

    await AuditService.log({
      userId: params.actor.id,
      action: "CREATE",
      entityType: "PerformanceTheme",
      entityId: theme.id,
      newValues: theme,
      ...metaToAudit(params.meta)
    });

    return theme;
  }

  static async tagGoalsWithTheme(params: {
    themeId: string;
    goalIds: string[];
    actor: any;
    meta?: AuditMeta;
  }) {
    const theme = await prisma.performanceTheme.findUnique({
      where: { id: params.themeId }
    });

    if (!theme) {
      throw new Error("Theme not found.");
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        id: {
          in: params.goalIds
        }
      }
    });

    await prisma.$transaction(
      goals.map((goal) =>
        prisma.performanceGoal.update({
          where: { id: goal.id },
          data: {
            strategicThemeId: params.themeId
          }
        })
      )
    );

    await AuditService.log({
      userId: params.actor.id,
      action: "TAG_THEME",
      entityType: "PerformanceGoalThemeAssignment",
      entityId: params.themeId,
      oldValues: {
        goalIds: goals.map((goal) => ({ id: goal.id, strategicThemeId: goal.strategicThemeId }))
      },
      newValues: {
        themeId: params.themeId,
        goalIds: goals.map((goal) => goal.id)
      },
      ...metaToAudit(params.meta)
    });

    return prisma.performanceGoal.findMany({
      where: {
        id: {
          in: params.goalIds
        }
      },
      orderBy: {
        title: "asc"
      }
    });
  }

  static async getGoalsByTheme(themeId: string) {
    return prisma.performanceGoal.findMany({
      where: {
        strategicThemeId: themeId
      },
      orderBy: [
        { departmentName: "asc" },
        { title: "asc" }
      ]
    });
  }

  static async updateGoalScorecardConfig(params: {
    goalId: string;
    scorecardPillar?: string;
    scorecardWeight?: number;
    strategyId?: string;
    strategicThemeId?: string;
    targetValue?: number;
    preciseTargetValue?: number;
    targetChangeReason?: string;
    weightChangeReason?: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: params.goalId }
    });

    if (!goal) {
      throw new Error("Performance goal not found.");
    }

    const nextPillar = params.scorecardPillar ?? goal.scorecardPillar;
    if (nextPillar && !HARD_CODED_BSC_PILLARS.includes(nextPillar)) {
      throw new Error("Goal pillar must be one of the fixed BSC pillars.");
    }

    const effectiveStrategyId =
      params.strategyId !== undefined ? params.strategyId : goal.strategyId;
    if (effectiveStrategyId) {
      const st = await prisma.performanceStrategy.findUnique({
        where: { id: effectiveStrategyId }
      });
      if (st && (st.archivedAt != null || st.status === "ARCHIVED")) {
        throw new Error("Cannot update scorecard mapping for a goal tied to an archived strategy.");
      }
    }

    if (
      params.targetValue !== undefined &&
      asNumber(params.targetValue, 0) !== asNumber(goal.targetValue, 0) &&
      !String(params.targetChangeReason || "").trim()
    ) {
      throw new Error("A target change reason is required when updating a KPI target.");
    }

    if (
      params.scorecardWeight !== undefined &&
      asNumber(params.scorecardWeight, 0) !== asNumber(goal.scorecardWeight, 0) &&
      !String(params.weightChangeReason || "").trim()
    ) {
      throw new Error("A weight change reason is required when updating goal weighting.");
    }

    if (params.scorecardWeight !== undefined && nextPillar) {
      const siblingStrategyId = params.strategyId ?? goal.strategyId ?? null;
      const siblingWhere: any = {
        scorecardPillar: nextPillar,
        id: { not: goal.id }
      };
      if (siblingStrategyId) {
        siblingWhere.strategyId = siblingStrategyId;
      } else {
        siblingWhere.strategyId = null;
      }
      if (goal.departmentName != null && String(goal.departmentName).trim() !== "") {
        siblingWhere.departmentName = goal.departmentName;
      } else {
        siblingWhere.departmentName = null;
      }

      const siblingGoals = await prisma.performanceGoal.findMany({
        where: siblingWhere,
        select: {
          scorecardWeight: true
        }
      });

      const validation = validateWeightTotal([
        ...siblingGoals.map((item) => asNumber(item.scorecardWeight, 0)),
        asNumber(params.scorecardWeight, 0)
      ]);

      if (!validation.valid) {
        throw new Error(`Goal weights within ${nextPillar} must total exactly 100%. Proposed total is ${validation.total}.`);
      }
    }

    const pillarAfterUpdate =
      params.scorecardPillar !== undefined ? params.scorecardPillar : goal.scorecardPillar;

    const updated = await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        ...(params.scorecardPillar !== undefined ? { scorecardPillar: params.scorecardPillar } : {}),
        ...(params.scorecardWeight !== undefined ? { scorecardWeight: params.scorecardWeight } : {}),
        ...(params.strategyId !== undefined ? { strategyId: params.strategyId } : {}),
        ...(params.strategicThemeId !== undefined ? { strategicThemeId: params.strategicThemeId } : {}),
        ...(params.targetValue !== undefined ? { targetValue: params.targetValue } : {}),
        ...(params.preciseTargetValue !== undefined ? { preciseTargetValue: params.preciseTargetValue } : {}),
        ...(params.targetChangeReason !== undefined ? { targetChangeReason: params.targetChangeReason } : {}),
        ...(params.weightChangeReason !== undefined ? { weightChangeReason: params.weightChangeReason } : {}),
        pillarId: pillarSlugForScorecardPillar(pillarAfterUpdate)
      }
    });

    const prevTarget = asNumber(goal.targetValue, 0);
    const nextTarget = asNumber(updated.targetValue, 0);
    const targetChanged =
      params.targetValue !== undefined && asNumber(params.targetValue, 0) !== asNumber(goal.targetValue, 0);

    if (targetChanged) {
      await AuditService.log({
        userId: params.actor.id,
        action: "KPI_TARGET_UPDATE",
        entityType: "PerformanceGoal",
        entityId: updated.id,
        oldValues: { targetValue: prevTarget },
        newValues: {
          targetValue: nextTarget,
          delta: nextTarget - prevTarget,
          reason: String(params.targetChangeReason || "").trim()
        },
        ...metaToAudit(params.meta)
      });
    }

    const nonTargetConfigChanged =
      (params.scorecardPillar !== undefined && params.scorecardPillar !== goal.scorecardPillar) ||
      (params.scorecardWeight !== undefined &&
        asNumber(params.scorecardWeight, 0) !== asNumber(goal.scorecardWeight, 0)) ||
      (params.strategyId !== undefined &&
        String(params.strategyId || "") !== String(goal.strategyId || "")) ||
      (params.strategicThemeId !== undefined &&
        String(params.strategicThemeId || "") !== String(goal.strategicThemeId || "")) ||
      (params.preciseTargetValue !== undefined &&
        String(params.preciseTargetValue ?? "") !== String(goal.preciseTargetValue ?? ""));

    if (nonTargetConfigChanged) {
      await AuditService.log({
        userId: params.actor.id,
        action: "GOAL_SCORECARD_CONFIG_UPDATE",
        entityType: "PerformanceGoal",
        entityId: updated.id,
        oldValues: {
          scorecardPillar: goal.scorecardPillar,
          pillarId: goal.pillarId,
          scorecardWeight: asNumber(goal.scorecardWeight, 0),
          strategyId: goal.strategyId,
          strategicThemeId: goal.strategicThemeId,
          preciseTargetValue: goal.preciseTargetValue != null ? Number(goal.preciseTargetValue) : null
        },
        newValues: {
          scorecardPillar: updated.scorecardPillar,
          pillarId: updated.pillarId,
          scorecardWeight: asNumber(updated.scorecardWeight, 0),
          strategyId: updated.strategyId,
          strategicThemeId: updated.strategicThemeId,
          preciseTargetValue:
            updated.preciseTargetValue != null ? Number(updated.preciseTargetValue) : null,
          ...(params.scorecardWeight !== undefined &&
          asNumber(params.scorecardWeight, 0) !== asNumber(goal.scorecardWeight, 0)
            ? { weightChangeReason: params.weightChangeReason }
            : {})
        },
        ...metaToAudit(params.meta)
      });
    }

    return updated;
  }
}
