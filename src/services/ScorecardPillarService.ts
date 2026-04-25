import { prisma } from "../utils/database";
import {
  HARD_CODED_BSC_PILLARS,
  asNumber,
  roundTo,
  validateFixedPillarSet
} from "./performanceBackendSupport";
import { normalizeOrgBscScorecardPillar, ORG_BSC_CANONICAL_TO_PILLAR_ID } from "./performanceScorecardSupport";
import { PerformanceConfigService } from "./PerformanceConfigService";

export type ScorecardPillarRow = {
  id: string;
  canonicalName: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Weight %: `scorecard_pillars.weight` when set, else active strategy `pillar_weights` (via `getPillarConfig`). */
export type ScorecardPillarWithWeight = ScorecardPillarRow & {
  weight: number | null;
  strategyId: string | null;
};

export class ScorecardPillarService {
  private static async weightByCanonicalName(): Promise<{
    map: Record<string, number | null>;
    strategyId: string | null;
  }> {
    const cfg = await PerformanceConfigService.getPillarConfig();
    const map: Record<string, number | null> = {};
    for (const p of cfg.pillars || []) {
      if (p?.name) {
        map[String(p.name)] = typeof p.weight === "number" ? p.weight : null;
      }
    }
    return { map, strategyId: cfg.strategyId ?? null };
  }

  static async list(): Promise<ScorecardPillarWithWeight[]> {
    const [rows, weights] = await Promise.all([
      prisma.scorecardPillar.findMany({ orderBy: { createdAt: "asc" } }) as any,
      this.weightByCanonicalName(),
    ]);
    return rows.map((r: ScorecardPillarRow & { weight?: unknown }) => {
      const fromRow = (r as any).weight;
      const resolved =
        fromRow != null && fromRow !== "" ? asNumber(fromRow) : (weights.map[r.canonicalName] ?? null);
      return {
        ...r,
        weight: resolved,
        strategyId: weights.strategyId,
      };
    });
  }

  private static normalizeLoose(input: unknown): string | null {
    if (input == null) return null;
    const s = String(input).trim();
    return s ? s : null;
  }

  static async resolveCanonicalName(raw: unknown): Promise<string | null> {
    const loose = this.normalizeLoose(raw);
    if (!loose) return null;

    // 1) Exact / case-insensitive canonical match in DB.
    const direct = await prisma.scorecardPillar.findFirst({
      where: { canonicalName: { equals: loose, mode: "insensitive" } as any },
      select: { canonicalName: true },
    });
    if (direct?.canonicalName) return direct.canonicalName as any;

    // 2) Alias match (supports canonical renames).
    const aliasRow = await prisma.scorecardPillarAlias.findFirst({
      where: { alias: { equals: loose, mode: "insensitive" } as any },
      select: { pillar: { select: { canonicalName: true } } },
    });
    if ((aliasRow as any)?.pillar?.canonicalName) return (aliasRow as any).pillar.canonicalName;

    // 3) Legacy hardcoded normalization (codes/variants) -> then re-resolve via DB/aliases.
    const legacy = normalizeOrgBscScorecardPillar(loose);
    if (legacy) {
      const mapped = await prisma.scorecardPillar.findFirst({
        where: { canonicalName: { equals: legacy, mode: "insensitive" } as any },
        select: { canonicalName: true },
      });
      if (mapped?.canonicalName) return mapped.canonicalName as any;
      const legacyAlias = await prisma.scorecardPillarAlias.findFirst({
        where: { alias: { equals: legacy, mode: "insensitive" } as any },
        select: { pillar: { select: { canonicalName: true } } },
      });
      if ((legacyAlias as any)?.pillar?.canonicalName) return (legacyAlias as any).pillar.canonicalName;
    }

    return null;
  }

  static async findByCanonicalName(canonicalName: string): Promise<ScorecardPillarRow | null> {
    const n = String(canonicalName || "").trim();
    if (!n) return null;
    return (await prisma.scorecardPillar.findUnique({ where: { canonicalName: n } })) as any;
  }

  static async assertCanonicalExists(raw: unknown): Promise<{ canonicalName: string; pillarId: string | null }> {
    const canonical = await this.resolveCanonicalName(raw);
    if (!canonical) {
      throw new Error(
        "Invalid scorecardPillar. Use Financial, Customer & Market, Internal Operations, or Learning, Growth & HR (or FINANCIAL, CUSTOMER, INTERNAL_OPS, LEARNING_GROWTH)."
      );
    }
    const row = await this.findByCanonicalName(canonical);
    if (!row) {
      throw new Error(
        `Scorecard pillar '${canonical}' is not configured. Ask an admin to seed pillars or run db:migrate:scorecard-pillars.`
      );
    }
    return { canonicalName: canonical, pillarId: ORG_BSC_CANONICAL_TO_PILLAR_ID[canonical] ?? row.id ?? null };
  }

  static async create(input: { canonicalName: string; displayName?: string; description?: string | null }) {
    const canonical = normalizeOrgBscScorecardPillar(input.canonicalName);
    if (!canonical) {
      throw new Error(
        "Invalid canonicalName. Only the 4 organisational pillars are supported currently (Financial, Customer & Market, Internal Operations, Learning, Growth & HR)."
      );
    }
    const id = ORG_BSC_CANONICAL_TO_PILLAR_ID[canonical];
    return prisma.scorecardPillar.upsert({
      where: { id },
      create: {
        id,
        canonicalName: canonical,
        displayName: String(input.displayName || canonical).trim() || canonical,
        description: input.description ?? null,
        isSystem: true,
      },
      update: {
        displayName: String(input.displayName || canonical).trim() || canonical,
        description: input.description ?? null,
      },
    }) as any;
  }

  static async update(id: string, patch: { displayName?: string; description?: string | null }) {
    const existing = await prisma.scorecardPillar.findUnique({ where: { id } });
    if (!existing) throw new Error("Scorecard pillar not found");

    // For system pillars we allow editing displayName/description only.
    return prisma.scorecardPillar.update({
      where: { id },
      data: {
        displayName: patch.displayName !== undefined ? String(patch.displayName).trim() : undefined,
        description: patch.description !== undefined ? patch.description : undefined,
      },
    }) as any;
  }

  private static get bscPillarIdSet(): Set<string> {
    return new Set(Object.values(ORG_BSC_CANONICAL_TO_PILLAR_ID));
  }

  /** Build `pillarId` → `weight` from `pillarWeights` and/or `weights: [{ id, weight }]` (array overrides same id). */
  static parsePillarWeightsFromBody(body: any): Record<string, number> {
    const byId: Record<string, number> = {};
    const fromObj = body?.pillarWeights ?? body?.pillar_weights;
    if (fromObj !== undefined && fromObj !== null) {
      if (typeof fromObj !== "object" || Array.isArray(fromObj)) {
        throw new Error("pillarWeights must be an object keyed by pillar id");
      }
      for (const [k, v] of Object.entries(fromObj)) {
        byId[k] = roundTo(asNumber(v, NaN), 2);
      }
    }
    if (body?.weights !== undefined) {
      if (!Array.isArray(body.weights)) {
        throw new Error("weights must be an array of { id, weight }");
      }
      for (const row of body.weights) {
        const id = String(row?.id ?? "").trim();
        if (!id) {
          throw new Error("Each weights[] entry must include a non-empty id");
        }
        byId[id] = roundTo(asNumber(row?.weight, NaN), 2);
      }
    }
    if (Object.keys(byId).length === 0) {
      throw new Error("Send weights: [{ id, weight }, ...] and/or pillarWeights: { bsc_financial: 25, ... } (all four ids required)");
    }
    return byId;
  }

  /**
   * Persists the **four** BSC system pillar weights (slugs like `bsc_financial`). The four must sum to **exactly 100%**.
   * (Frontend should pre-validate; server enforces the same rules as strategy `pillarWeights`.)
   * Writes `scorecard_pillars` and, when an active strategy exists, `performance_strategies.pillar_weights`.
   */
  static async setPillarWeightsBsc(body: any): Promise<ScorecardPillarWithWeight[]> {
    const byId = this.parsePillarWeightsFromBody(body);
    const expected = this.bscPillarIdSet;
    const got = new Set(Object.keys(byId));
    for (const id of expected) {
      if (!got.has(id)) {
        throw new Error(
          `Each of the four BSC pillar ids is required. Missing: ${id}. ` +
            `Expected: ${Array.from(expected).join(", ")}`
        );
      }
    }
    for (const id of got) {
      if (!expected.has(id)) {
        throw new Error(
          `Unknown or non-BSC pillar id: ${id}. ` + `Use only: ${Array.from(expected).join(", ")}`
        );
      }
    }
    for (const [id, w] of Object.entries(byId)) {
      if (!Number.isFinite(w) || w < 0 || w > 100) {
        throw new Error(`Invalid weight for ${id} (use 0–100)`);
      }
    }
    const byCanonical: Record<string, number> = {} as Record<string, number>;
    for (const [pillarId, w] of Object.entries(byId)) {
      const canonical = Object.entries(ORG_BSC_CANONICAL_TO_PILLAR_ID).find(([, v]) => v === pillarId)?.[0];
      if (!canonical) throw new Error(`Invalid pillar id: ${pillarId}`);
      byCanonical[canonical] = w;
    }
    const v = validateFixedPillarSet(byCanonical);
    if (!v.valid) {
      throw new Error(
        `Balance Required: all four BSC pillars are required and weights must total exactly 100% (total ${v.total}%). ` +
          `Missing: ${v.missing.join(", ") || "none"}; unexpected: ${v.unexpected.join(", ") || "none"}.`
      );
    }

    const activeStrategy = await prisma.performanceStrategy.findFirst({
      where: { status: "ACTIVE", archivedAt: null },
      orderBy: { periodStart: "desc" },
    });
    await prisma.$transaction(async (tx) => {
      if (activeStrategy) {
        await tx.performanceStrategy.update({
          where: { id: activeStrategy.id },
          data: { pillarWeights: byCanonical as any },
        });
      }
      for (const name of HARD_CODED_BSC_PILLARS) {
        const pid = ORG_BSC_CANONICAL_TO_PILLAR_ID[name];
        if (!pid) continue;
        await tx.scorecardPillar.updateMany({
          where: { id: pid },
          data: { weight: byCanonical[name] },
        });
      }
    });
    return this.list();
  }

  static async renameCanonical(id: string, nextCanonicalName: string) {
    const existing = await prisma.scorecardPillar.findUnique({ where: { id } });
    if (!existing) throw new Error("Scorecard pillar not found");

    const next = String(nextCanonicalName || "").trim();
    if (!next) throw new Error("canonicalName is required");
    if (next.toLowerCase() === String(existing.canonicalName).toLowerCase()) {
      return existing as any;
    }

    // Do not allow collisions on canonicalName.
    const taken = await prisma.scorecardPillar.findFirst({
      where: { canonicalName: { equals: next, mode: "insensitive" } as any },
      select: { id: true },
    });
    if (taken?.id && taken.id !== id) {
      throw new Error("canonicalName already exists");
    }

    const prevCanonical = existing.canonicalName;

    return prisma.$transaction(async (tx) => {
      // 1) Store previous canonical as alias (idempotent-ish).
      await tx.scorecardPillarAlias.create({
        data: { pillarId: id, alias: prevCanonical },
      } as any).catch(() => {});

      // 2) Update canonicalName on pillar.
      const updated = await tx.scorecardPillar.update({
        where: { id },
        data: { canonicalName: next },
      });

      // 3) Cascade update references (KPIs + goals store canonicalName string).
      await tx.kPI.updateMany({
        where: { scorecardPillar: prevCanonical },
        data: { scorecardPillar: next },
      });
      await tx.performanceGoal.updateMany({
        where: { scorecardPillar: prevCanonical },
        data: { scorecardPillar: next },
      });

      return updated as any;
    });
  }

  static async remove(id: string) {
    const existing = await prisma.scorecardPillar.findUnique({ where: { id } });
    if (!existing) throw new Error("Scorecard pillar not found");
    if (existing.isSystem) {
      throw new Error("System pillars cannot be deleted.");
    }
    // Block delete when used by goals/KPIs (scorecardPillar stores canonicalName; goals also have pillarId).
    const [kpiCount, goalCount] = await Promise.all([
      prisma.kPI.count({ where: { scorecardPillar: existing.canonicalName } }),
      prisma.performanceGoal.count({ where: { OR: [{ pillarId: id }, { scorecardPillar: existing.canonicalName }] } }),
    ]);
    if (kpiCount > 0 || goalCount > 0) {
      throw new Error("Cannot delete pillar while it is referenced by KPIs or goals.");
    }
    await prisma.scorecardPillar.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Pillar row plus performance goals mapped to this pillar via `pillar_id` and/or `scorecard_pillar`
   * (includes legacy alias values stored on goals after renames).
   */
  static async getByIdWithGoals(
    id: string,
    opts?: { type?: string; status?: string; limit?: number; offset?: number }
  ): Promise<ScorecardPillarWithWeight & { goals: any[]; goalsTotal: number }> {
    const pillar = (await prisma.scorecardPillar.findUnique({ where: { id } })) as any;
    if (!pillar) {
      throw new Error("Scorecard pillar not found");
    }

    const { map: wmap, strategyId } = await this.weightByCanonicalName();

    const aliasRows = await prisma.scorecardPillarAlias.findMany({
      where: { pillarId: id },
      select: { alias: true },
    });
    const aliasValues = aliasRows.map((r) => r.alias).filter(Boolean) as string[];

    const orClause: Array<{ pillarId?: string; scorecardPillar?: string }> = [
      { pillarId: id },
      { scorecardPillar: pillar.canonicalName },
    ];
    for (const a of aliasValues) {
      orClause.push({ scorecardPillar: a });
    }

    const whereBase: any = { OR: orClause };
    if (opts?.type) whereBase.type = opts.type;
    if (opts?.status) whereBase.status = opts.status;

    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const [goalsTotal, goals] = await Promise.all([
      prisma.performanceGoal.count({ where: whereBase }),
      prisma.performanceGoal.findMany({
        where: whereBase,
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          stage: true,
          scorecardPillar: true,
          pillarId: true,
          scorecardWeight: true,
          strategyId: true,
          startDate: true,
          endDate: true,
          kpiId: true,
          departmentName: true,
          parentGoalId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const goalsWithWeight = (goals as any[]).map((g) => {
      const w =
        g.scorecardWeight != null && g.scorecardWeight !== "" ? asNumber(g.scorecardWeight) : null;
      return { ...g, weight: w };
    });

    const fromRow = (pillar as any).weight;
    const weight =
      fromRow != null && fromRow !== "" ? asNumber(fromRow) : (wmap[pillar.canonicalName] ?? null);

    return {
      ...pillar,
      weight,
      strategyId,
      goals: goalsWithWeight,
      goalsTotal,
    };
  }
}

