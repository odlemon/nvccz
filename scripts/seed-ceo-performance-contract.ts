/**
 * Idempotent: ensures one ACTIVE PerformanceContract (type CEO) for a calendar year
 * and seeds NVCCZ-style organisational indicators (A1–D) with weights summing to 100 per section.
 *
 * Env:
 *   CEO_SEED_YEAR — default 2026
 *   CEO_SEED_USER_EMAIL — optional; resolve subject user by email (must exist)
 *   If CEO_SEED_USER_EMAIL unset, picks first user whose role name contains "CEO" (case-insensitive).
 *
 * Usage: npx ts-node scripts/seed-ceo-performance-contract.ts
 */
// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function resolveCeoSubjectUserId(): Promise<string> {
  const email = String(process.env.CEO_SEED_USER_EMAIL || "").trim();
  if (email) {
    const byEmail = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });
    if (!byEmail) throw new Error(`CEO_SEED_USER_EMAIL not found: ${email}`);
    return byEmail.id;
  }

  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { role: { name: { contains: "CEO" } } },
        { role: { name: { contains: "Chief Executive" } } },
        { roleCode: { in: ["CEO", "ceo", "chief_executive"] } }
      ]
    },
    include: { role: true },
    take: 50
  });

  const ceo =
    candidates.find((u) => {
      const signals = [
        u.role?.name,
        u.roleCode,
        u.departmentRole,
        u.userDepartment
      ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      return signals.some((s) => s.includes("ceo") || s.includes("chief executive"));
    }) || null;

  if (!ceo) {
    throw new Error(
      "Could not resolve CEO user. Set CEO_SEED_USER_EMAIL to an existing user's email, or assign a CEO role."
    );
  }
  return ceo.id;
}

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
  isReverseKpi?: boolean;
  activities: Record<string, unknown>;
  displayOrder: number;
};

function buildSeedGoals(): SeedGoal[] {
  let order = 0;
  const g = (row: Omit<SeedGoal, "displayOrder">): SeedGoal => ({
    ...row,
    displayOrder: order++
  });

  return [
    // A1 — Outcomes (5 × 20%)
    g({
      title: "Return on Investment (ROI)",
      section: "A1",
      weight: 20,
      formulaType: "ROI",
      measureName: "%",
      targetValue: 12,
      preciseTargetValue: 12,
      currentValue: 10,
      preciseCurrentValue: 10,
      activities: { initialCost: 1_000_000, finalValue: 1_100_000 }
    }),
    g({
      title: "Revenue growth",
      section: "A1",
      weight: 20,
      formulaType: "REVENUE_GROWTH",
      measureName: "%",
      targetValue: 10,
      preciseTargetValue: 10,
      currentValue: 8,
      preciseCurrentValue: 8,
      activities: { currentRevenue: 1_080_000, previousRevenue: 1_000_000 }
    }),
    g({
      title: "Business survival rate",
      section: "A1",
      weight: 20,
      formulaType: "BUSINESS_SURVIVAL_RATE",
      measureName: "%",
      targetValue: 90,
      preciseTargetValue: 90,
      currentValue: 88,
      preciseCurrentValue: 88,
      activities: { activePortfolioCompanies: 44, totalFundedCompanies: 50 }
    }),
    g({
      title: "Corporate governance index",
      section: "A1",
      weight: 20,
      formulaType: "CORPORATE_GOVERNANCE_INDEX",
      measureName: "%",
      targetValue: 95,
      preciseTargetValue: 95,
      currentValue: 92,
      preciseCurrentValue: 92,
      activities: { complianceItemsMet: 23, totalGovernanceRequirements: 25 }
    }),
    g({
      title: "Funding rate",
      section: "A1",
      weight: 20,
      formulaType: "FUNDING_RATE",
      measureName: "%",
      targetValue: 85,
      preciseTargetValue: 85,
      currentValue: 80,
      preciseCurrentValue: 80,
      activities: { projectsFunded: 40, projectsApproved: 50 }
    }),

    // A2 — Outputs (4 × 25%)
    g({
      title: "Statutory reports produced",
      section: "A2",
      weight: 25,
      formulaType: "STATUTORY_REPORTS",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 100,
      preciseCurrentValue: 100,
      activities: { completedCount: 12, targetCount: 12 }
    }),
    g({
      title: "Projects funded (output)",
      section: "A2",
      weight: 25,
      formulaType: "PROJECTS_FUNDED",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 90,
      preciseCurrentValue: 90,
      activities: { projectsFunded: 18, targetProjects: 20 }
    }),
    g({
      title: "Capital disbursed",
      section: "A2",
      weight: 25,
      formulaType: "CAPITAL_DISBURSED",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 85,
      preciseCurrentValue: 85,
      activities: { capitalDisbursed: 85_000_000, budgetedCapital: 100_000_000 }
    }),
    g({
      title: "Resources mobilised",
      section: "A2",
      weight: 25,
      formulaType: "RESOURCES_MOBILISED",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 75,
      preciseCurrentValue: 75,
      activities: { amountRaised: 75_000_000, targetAmount: 100_000_000 }
    }),

    // B — Service delivery (40 / 30 / 30)
    g({
      title: "Customer service charter (composite)",
      section: "B",
      weight: 40,
      formulaType: "CHARTER_SCORE",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 92,
      preciseCurrentValue: 92,
      activities: {
        charterReviewed: 100,
        charterDisplayed: 90,
        charterAvailableOnline: 95,
        charterLocalLanguages: 80,
        customerAwareness: 85
      }
    }),
    g({
      title: "Customer satisfaction index",
      section: "B",
      weight: 30,
      formulaType: "CUSTOMER_SATISFACTION_INDEX",
      measureName: "%",
      targetValue: 80,
      preciseTargetValue: 80,
      currentValue: 78,
      preciseCurrentValue: 78,
      activities: { surveyScores: [0.78, 0.8, 0.76] }
    }),
    g({
      title: "Ease of doing business innovations",
      section: "B",
      weight: 30,
      formulaType: "EASE_OF_DOING_BUSINESS",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 67,
      preciseCurrentValue: 67,
      activities: { innovationsCompleted: 2, targetInnovations: 3 }
    }),

    // C — Management & capacity (5 × 20%)
    g({
      title: "Strategic allocation compliance",
      section: "C",
      weight: 20,
      formulaType: "STRATEGIC_ALLOCATION_COMPLIANCE",
      measureName: "%",
      targetValue: 70,
      preciseTargetValue: 70,
      currentValue: 68,
      preciseCurrentValue: 68,
      activities: { budgetAlignedToPolicy: 68_000_000, totalBudget: 100_000_000 }
    }),
    g({
      title: "EBIT",
      section: "C",
      weight: 20,
      formulaType: "DIRECT",
      measureName: "ZiG",
      targetValue: 270_000,
      preciseTargetValue: 270_000,
      currentValue: 265_000,
      preciseCurrentValue: 265_000,
      activities: {}
    }),
    g({
      title: "Debt–equity ratio",
      section: "C",
      weight: 20,
      formulaType: "RATIO",
      measureName: "ratio",
      targetValue: 1.5,
      preciseTargetValue: 1.5,
      currentValue: 1.45,
      preciseCurrentValue: 1.45,
      isReverseKpi: true,
      activities: { totalLiabilities: 1_450_000, totalShareholdersEquity: 1_000_000 }
    }),
    g({
      title: "Alternative resources mobilised",
      section: "C",
      weight: 20,
      formulaType: "ALTERNATIVE_RESOURCES_MOBILISED",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 55,
      preciseCurrentValue: 55,
      activities: { amountRaised: 297_000, targetAmount: 540_000 }
    }),
    g({
      title: "E-government flagships",
      section: "C",
      weight: 20,
      formulaType: "E_GOVERNMENT_FLAGSHIPS",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 50,
      preciseCurrentValue: 50,
      activities: { completedCount: 1, targetCount: 2 }
    }),

    // D — Cross-cutting (4 × 25%)
    g({
      title: "Integrity and anti-corruption",
      section: "D",
      weight: 25,
      formulaType: "DIRECT",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 98,
      preciseCurrentValue: 98,
      activities: { integrityCompliancePct: 98 }
    }),
    g({
      title: "Health and wellness",
      section: "D",
      weight: 25,
      formulaType: "DIRECT",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 95,
      preciseCurrentValue: 95,
      activities: { wellnessParticipationRatePct: 95 }
    }),
    g({
      title: "Inclusive programming",
      section: "D",
      weight: 25,
      formulaType: "DIRECT",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 100,
      preciseCurrentValue: 100,
      activities: { inclusiveProgrammingCompliancePct: 100 }
    }),
    g({
      title: "Clean environment",
      section: "D",
      weight: 25,
      formulaType: "DIRECT",
      measureName: "%",
      targetValue: 100,
      preciseTargetValue: 100,
      currentValue: 92,
      preciseCurrentValue: 92,
      activities: { cleanEnvironmentParticipationPct: 92 }
    })
  ];
}

async function main() {
  const year = parseInt(String(process.env.CEO_SEED_YEAR || "2026"), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid CEO_SEED_YEAR: ${process.env.CEO_SEED_YEAR}`);
  }

  const { periodStart, periodEnd, periodLabel } = utcYearBounds(year);
  const createdById = await resolveActorUserId();
  const subjectUserId = await resolveCeoSubjectUserId();

  const subject = await prisma.user.findUnique({
    where: { id: subjectUserId },
    include: { role: true }
  });
  const ceoName = subject ? `${subject.firstName} ${subject.lastName}`.trim() : "CEO";

  let contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "CEO",
      subjectUserId,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!contract) {
    contract = await prisma.performanceContract.create({
      data: {
        contractType: "CEO",
        title: `CEO performance contract — ${ceoName} (${periodLabel})`,
        status: "ACTIVE",
        periodLabel,
        periodStart,
        periodEnd,
        subjectUserId,
        createdById,
        stretchScoringEnabled: false,
        sectionWeights: { A1: 30, A2: 20, B: 20, C: 25, D: 5 },
        metadata: { source: "seed-ceo-performance-contract.ts" }
      }
    });
    console.log(`[ok] Created CEO contract ${contract.id}`);
  } else {
    console.log(`[skip] CEO contract already exists ${contract.id}`);
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
    await prisma.performanceGoal.create({
      data: {
        title: row.title,
        description: `Seeded organisational indicator for CEO scorecard (${row.section}).`,
        type: "company",
        category: "strategic",
        performanceContractId: contract.id,
        startDate: periodStart,
        endDate: periodEnd,
        createdById,
        assignedToId: subjectUserId,
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
        isReverseKpi: Boolean(row.isReverseKpi),
        activities: row.activities as object,
        displayOrder: row.displayOrder
      }
    });
  }

  console.log(`[ok] Inserted ${rows.length} CEO organisational goals on contract ${contract.id}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
