import { prisma } from "../utils/database";
import { normalizeOrgBscScorecardPillar, ORG_BSC_CANONICAL_TO_PILLAR_ID } from "./performanceScorecardSupport";

export type ScorecardPillarRow = {
  id: string;
  canonicalName: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class ScorecardPillarService {
  static async list(): Promise<ScorecardPillarRow[]> {
    return prisma.scorecardPillar.findMany({ orderBy: { createdAt: "asc" } }) as any;
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
}

