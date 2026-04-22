/**
 * Idempotent: ensures one ACTIVE PerformanceContract (type BOARD) for a calendar year
 * and seeds one governance indicator per section A1–D (100% weight within each section).
 *
 * Fixes Postman / UAT error BOARD_CONTRACT_NOT_FOUND when no BOARD contract exists.
 *
 * Env:
 *   BOARD_SEED_YEAR — default 2026
 *   BOARD_SEED_REVIEWER_EMAIL — optional; Ministry/Shareholder reviewer (must exist)
 *   BOARD_SEED_APPROVER_EMAIL — optional; Board Chair approver (must exist)
 *   COMPANY_NAME_SHORT — optional; used in seeded contract title (default NVCCZ)
 *
 * Usage: npm run db:seed:board-performance-contract
 *
 * After seeding, read-only check (same service as GET /api/performance/scorecards/board):
 *   npm run db:verify:board-scorecard
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { companyNameShortFromEnv } from "../src/config/companyDisplay";

const prisma = new PrismaClient();

const BOARD_SECTION_WEIGHTS = { A1: 30, A2: 20, B: 20, C: 22, D: 8 };

function utcYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

async function resolveActorUserId(): Promise<string> {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!u) throw new Error("No users in database; create a user first.");
  return u.id;
}

async function resolveUserIdByEmailOptional(envKey: string): Promise<string | null> {
  const email = String(process.env[envKey] || "").trim();
  if (!email) return null;
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new Error(`${envKey} user not found: ${email}`);
  return u.id;
}

const BOARD_PILLAR_BY_SECTION: Record<
  string,
  { scorecardPillar: string; pillarId: string }
> = {
  A1: { scorecardPillar: "Financial", pillarId: "bsc_financial" },
  A2: { scorecardPillar: "Internal Operations", pillarId: "bsc_internal_operations" },
  B: { scorecardPillar: "Learning, Growth & HR", pillarId: "bsc_learning_growth_hr" },
  C: { scorecardPillar: "Financial", pillarId: "bsc_financial" },
  D: { scorecardPillar: "Customer & Market", pillarId: "bsc_customer_market" }
};

type SeedGoal = {
  title: string;
  section: string;
  weight: number;
  formulaType: string;
  measureName: string;
  targetValue: number;
  preciseTargetValue: number;
  currentValue: number;
  preciseCurrentValue: number;
  activities: Record<string, unknown>;
  displayOrder: number;
};

function buildSeedGoals(): SeedGoal[] {
  let order = 0;
  const g = (row: Omit<SeedGoal, "displayOrder">): SeedGoal => ({ ...row, displayOrder: order++ });

  return [
    g({
      title: "Revenue (total income)",
      section: "A1",
      weight: 100,
      formulaType: "direct",
      measureName: "ZiG m",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 95,
      preciseCurrentValue: 95,
      activities: { total_income: 95 }
    }),
    g({
      title: "Performance levels evaluated",
      section: "A2",
      weight: 100,
      formulaType: "COUNT_VS_TARGET",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 90,
      preciseCurrentValue: 90,
      activities: { evaluated_levels: 9, total_levels: 10 }
    }),
    g({
      title: "Strategic planning reviews completed",
      section: "B",
      weight: 100,
      formulaType: "STRATEGIC_PLANNING_REVIEWS",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 100,
      preciseCurrentValue: 100,
      activities: { reviews_completed: 4, reviews_planned: 4 }
    }),
    g({
      title: "Strategic allocation of resources",
      section: "C",
      weight: 100,
      formulaType: "ALLOCATION_COMPLIANCE",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 92,
      preciseCurrentValue: 92,
      activities: { budget_aligned_to_plan: 92, total_budget: 100 }
    }),
    g({
      title: "NDS2 programme achievement",
      section: "D",
      weight: 100,
      formulaType: "NDS2_PROGRAMME_ACHIEVEMENT",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 88,
      preciseCurrentValue: 88,
      activities: { achieved_KPIs: 22, planned_KPIs: 25 }
    })
  ];
}

async function main() {
  const year = parseInt(String(process.env.BOARD_SEED_YEAR || "2026"), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid BOARD_SEED_YEAR: ${process.env.BOARD_SEED_YEAR}`);
  }

  const { periodStart, periodEnd, periodLabel } = utcYearBounds(year);
  const createdById = await resolveActorUserId();
  const reviewerUserId = await resolveUserIdByEmailOptional("BOARD_SEED_REVIEWER_EMAIL");
  const approverUserId = await resolveUserIdByEmailOptional("BOARD_SEED_APPROVER_EMAIL");

  let contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "BOARD",
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!contract) {
    contract = await prisma.performanceContract.create({
      data: {
        contractType: "BOARD",
        title: `Board of Directors Performance Contract — ${companyNameShortFromEnv()} (${periodLabel})`,
        status: "ACTIVE",
        periodLabel,
        periodStart,
        periodEnd,
        subjectUserId: null,
        createdById,
        reviewerUserId: reviewerUserId || undefined,
        approverUserId: approverUserId || undefined,
        stretchScoringEnabled: false,
        sectionWeights: BOARD_SECTION_WEIGHTS,
        metadata: { source: "seed-board-performance-contract.ts" }
      }
    });
    console.log(`[ok] Created BOARD contract ${contract.id}`);
  } else {
    console.log(`[skip] BOARD contract already exists ${contract.id}`);
  }

  const existingCount = await prisma.performanceGoal.count({
    where: { performanceContractId: contract.id }
  });

  if (existingCount > 0) {
    console.log(`[skip] Contract already has ${existingCount} goal(s); not inserting duplicates.`);
    console.log(`       To re-seed, delete goals for contract ${contract.id} and run again.`);
    await prisma.$disconnect();
    return;
  }

  const rows = buildSeedGoals();
  for (const row of rows) {
    const ph = BOARD_PILLAR_BY_SECTION[row.section] || BOARD_PILLAR_BY_SECTION.A1;
    await prisma.performanceGoal.create({
      data: {
        title: row.title,
        description: `Seeded governance indicator for Board scorecard (${row.section}).`,
        type: "company",
        scorecardPillar: ph.scorecardPillar,
        pillarId: ph.pillarId,
        performanceContractId: contract.id,
        startDate: periodStart,
        endDate: periodEnd,
        createdById,
        status: "active",
        stage: "planning",
        targetValue: row.targetValue,
        preciseTargetValue: row.preciseTargetValue,
        currentValue: row.currentValue,
        preciseCurrentValue: row.preciseCurrentValue,
        scorecardSection: row.section,
        scorecardWeight: row.weight,
        formulaType: row.formulaType,
        measureName: row.measureName,
        allowableVariance: 0.1,
        isReverseKpi: false,
        activities: row.activities as object,
        displayOrder: row.displayOrder
      }
    });
  }

  console.log(`[ok] Inserted ${rows.length} Board goals on contract ${contract.id}`);
  console.log(`     GET /api/performance/scorecards/board?periodLabel=${periodLabel}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
