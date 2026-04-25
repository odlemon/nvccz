// @ts-nocheck

import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { remoteUploadService } from "./RemoteUploadService";
import {
  BSC_PILLAR_UAT_LABEL,
  HARD_CODED_BSC_PILLARS,
  asNumber,
  pillarSlugForScorecardPillar,
  roundTo,
  toSafeFileName,
  validateFixedPillarSet,
  validateWeightTotal
} from "./performanceBackendSupport";
import { ORG_BSC_CANONICAL_TO_PILLAR_ID } from "./performanceScorecardSupport";

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
  /**
   * Resolved BSC pillar weights %: prefer `scorecard_pillars.weight` when set, else
   * `activeStrategy.pillarWeights` JSON, else 25 per pillar.
   */
  static async resolvePillarWeightRecord(
    activeStrategy: { pillarWeights?: unknown } | null
  ): Promise<Record<string, number>> {
    const ids = Object.values(ORG_BSC_CANONICAL_TO_PILLAR_ID);
    const rows = await prisma.scorecardPillar.findMany({
      where: { id: { in: ids } },
      select: { canonicalName: true, weight: true }
    });
    const byName = new Map<string, unknown>();
    for (const r of rows) {
      byName.set(r.canonicalName, r.weight);
    }
    const j = (activeStrategy?.pillarWeights as Record<string, number> | null) || {};
    const weights: Record<string, number> = {};
    for (const pillar of HARD_CODED_BSC_PILLARS) {
      const col = byName.get(pillar);
      weights[pillar] =
        col != null && col !== undefined && col !== "" ? asNumber(col, 25) : asNumber(j[pillar], 25);
    }
    return weights;
  }

  static async syncPillarTableWeightsToDatabase(pillarWeights: Record<string, number>) {
    for (const name of HARD_CODED_BSC_PILLARS) {
      const id = ORG_BSC_CANONICAL_TO_PILLAR_ID[name];
      if (!id) continue;
      const w = asNumber(pillarWeights[name], 25);
      await prisma.scorecardPillar.updateMany({ where: { id }, data: { weight: w } });
    }
  }

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

    const weights = await this.resolvePillarWeightRecord(activeStrategy);

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

  /** Active strategy’s vision only (minimal read for dashboards / “line of sight”). */
  static async getVisionStatement() {
    const activeStrategy = await prisma.performanceStrategy.findFirst({
      where: {
        status: "ACTIVE",
        archivedAt: null
      },
      orderBy: { periodStart: "desc" },
      select: { id: true, visionStatement: true }
    });
    return {
      strategyId: activeStrategy?.id ?? null,
      visionStatement: activeStrategy?.visionStatement ?? null
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

  /** Archived / historical strategies only (read-only records for “Historical Archives” UAT; newest period first). */
  static async listArchivedStrategies() {
    return prisma.performanceStrategy.findMany({
      where: {
        OR: [{ status: "ARCHIVED" }, { archivedAt: { not: null } }]
      },
      orderBy: { periodStart: "desc" }
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
        `Balance Required: pillar weights must use all four BSC pillars and total exactly 100% (got ${pillarValidation.total}%). Missing: ${pillarValidation.missing.join(", ") || "none"}; unexpected: ${pillarValidation.unexpected.join(", ") || "none"}.`
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

    await this.syncPillarTableWeightsToDatabase(pillarWeights as Record<string, number>);

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

  /**
   * Set **`scorecardWeight` on every `company` goal in this pillar** for one sibling group
   * (same `strategyId` and `departmentName` as the goals you send). The provided weights
   * must list **all** such goals and **sum to exactly 100%** (same rule as
   * {@link updateGoalScorecardConfig} for a single row).
   */
  static async setCompanyGoalWeightsInPillarBatch(params: {
    pillarId: string;
    goalWeights: Record<string, number>;
    weightChangeReason: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const reason = String(params.weightChangeReason || "").trim();
    if (!reason) {
      throw new Error("A weight change reason is required when updating goal weights.");
    }
    if (!params.goalWeights || typeof params.goalWeights !== "object" || Array.isArray(params.goalWeights)) {
      throw new Error("goalWeights is required: an object of { [goalId]: number }");
    }
    const inputIds = Object.keys(params.goalWeights);
    if (inputIds.length === 0) {
      throw new Error("goalWeights must include at least one goal id");
    }

    const pillarRow = await prisma.scorecardPillar.findUnique({ where: { id: params.pillarId } });
    if (!pillarRow) {
      throw new Error("Scorecard pillar not found");
    }
    const canonical = pillarRow.canonicalName;
    if (!HARD_CODED_BSC_PILLARS.includes(canonical)) {
      throw new Error("Pillar is not a BSC system pillar");
    }

    const aliasRows = await prisma.scorecardPillarAlias.findMany({
      where: { pillarId: params.pillarId },
      select: { alias: true }
    });
    const aliasValues = (aliasRows.map((r) => r.alias).filter(Boolean) as string[]);
    const orPillar: Array<{ pillarId?: string; scorecardPillar?: string }> = [
      { pillarId: params.pillarId },
      { scorecardPillar: canonical }
    ];
    for (const a of aliasValues) {
      orPillar.push({ scorecardPillar: a });
    }

    const weights = inputIds.map((id) => roundTo(asNumber(params.goalWeights[id], NaN), 4));
    for (let i = 0; i < weights.length; i++) {
      if (!Number.isFinite(weights[i]!) || weights[i]! < 0 || weights[i]! > 100) {
        throw new Error(`Invalid weight for goal ${inputIds[i]} (use 0–100)`);
      }
    }
    const validation = validateWeightTotal(weights, 100);
    if (!validation.valid) {
      throw new Error(
        `Goal weights in this pillar must total exactly 100% (proposed total ${validation.total}%).`
      );
    }

    const goals = await prisma.performanceGoal.findMany({
      where: { id: { in: inputIds } }
    });
    if (goals.length !== inputIds.length) {
      throw new Error("One or more goal ids were not found");
    }

    for (const g of goals) {
      if (g.type !== "company") {
        throw new Error(`Goal ${g.id} is not a company goal; pillar line weights apply to company goals only.`);
      }
    }

    for (const g of goals) {
      const inPillar =
        g.pillarId === params.pillarId ||
        g.scorecardPillar === canonical ||
        (g.scorecardPillar && aliasValues.includes(g.scorecardPillar));
      if (!inPillar) {
        throw new Error(`Goal ${g.id} is not mapped to this scorecard pillar`);
      }
    }

    const sStrat = goals[0]!.strategyId ?? null;
    const sDept =
      goals[0]!.departmentName != null && String(goals[0]!.departmentName).trim() !== ""
        ? goals[0]!.departmentName
        : null;
    for (const g of goals) {
      const gStrat = g.strategyId ?? null;
      const gDept = g.departmentName != null && String(g.departmentName).trim() !== "" ? g.departmentName : null;
      if (gStrat !== sStrat || (gDept || null) !== (sDept || null)) {
        throw new Error(
          "All goals in goalWeights must share the same strategy and department (including all org-level: strategy null, department null)."
        );
      }
    }

    if (sStrat) {
      const st = await prisma.performanceStrategy.findUnique({ where: { id: sStrat } });
      if (st && (st.archivedAt != null || st.status === "ARCHIVED")) {
        throw new Error("Cannot update goals tied to an archived strategy.");
      }
    }

    const siblingWhere: any = {
      type: "company",
      OR: orPillar
    };
    if (sStrat) {
      siblingWhere.strategyId = sStrat;
    } else {
      siblingWhere.strategyId = null;
    }
    if (sDept != null) {
      siblingWhere.departmentName = sDept;
    } else {
      siblingWhere.departmentName = null;
    }

    const allSiblings = await prisma.performanceGoal.findMany({
      where: siblingWhere,
      select: { id: true }
    });
    const expected = new Set(allSiblings.map((r) => r.id));
    const got = new Set(inputIds);
    if (expected.size !== got.size || [...expected].some((id) => !got.has(id))) {
      const missing = [...expected].filter((id) => !got.has(id));
      const extra = [...got].filter((id) => !expected.has(id));
      throw new Error(
        `goalWeights must include every company goal in this pillar for the same strategy/department. ` +
          (missing.length ? `Missing: ${missing.join(", ")}. ` : "") +
          (extra.length ? `Unexpected: ${extra.join(", ")}.` : "")
      );
    }

    const updated: any[] = [];
    for (const id of inputIds) {
      const w = roundTo(asNumber(params.goalWeights[id], 0), 4);
      const gBefore = goals.find((x) => x.id === id)!;
      const u = await prisma.performanceGoal.update({
        where: { id },
        data: {
          scorecardWeight: w,
          weightChangeReason: reason,
          pillarId: pillarSlugForScorecardPillar(canonical)
        }
      });
      await AuditService.log({
        userId: params.actor.id,
        action: "GOAL_SCORECARD_CONFIG_UPDATE",
        entityType: "PerformanceGoal",
        entityId: id,
        oldValues: {
          scorecardPillar: gBefore.scorecardPillar,
          pillarId: gBefore.pillarId,
          scorecardWeight: asNumber(gBefore.scorecardWeight, 0),
          strategyId: gBefore.strategyId,
          strategicThemeId: gBefore.strategicThemeId
        },
        newValues: {
          scorecardPillar: u.scorecardPillar,
          pillarId: u.pillarId,
          scorecardWeight: asNumber(u.scorecardWeight, 0),
          strategyId: u.strategyId,
          strategicThemeId: u.strategicThemeId,
          weightChangeReason: reason
        },
        ...metaToAudit(params.meta)
      });
      updated.push(u);
    }
    return updated;
  }
}
