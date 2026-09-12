/**
 * Traces CEO/Board/Employee scorecard data: contracts + goals + BSC-relevant fields.
 *
 * Usage: npx ts-node scripts/diagnose-performance-scorecard-data-flow.ts [periodLabel]
 * Default periodLabel: 2026
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const periodLabel = process.argv[2] || "2026";

async function main() {
  const userMatch = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "karata" } },
        { email: { contains: "shakarata" } },
        { firstName: { contains: "Nyasha" } },
        { lastName: { contains: "Karata" } }
      ]
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      userDepartment: true
    },
    take: 20
  });

  const ceoContracts = await prisma.performanceContract.findMany({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      periodLabel,
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: {
      id: true,
      title: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      subjectUserId: true
    },
    orderBy: { updatedAt: "desc" },
    take: 5
  });

  const boardContracts = await prisma.performanceContract.findMany({
    where: {
      contractType: { in: ["BOARD", "board"] },
      periodLabel,
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: { id: true, title: true, periodLabel: true },
    take: 5
  });

  let ceoGoals: any[] = [];
  if (ceoContracts[0]) {
    ceoGoals = await prisma.performanceGoal.findMany({
      where: { performanceContractId: ceoContracts[0].id },
      select: {
        id: true,
        title: true,
        type: true,
        formulaType: true,
        scorecardSection: true,
        preciseTargetValue: true,
        targetValue: true,
        preciseCurrentValue: true,
        currentValue: true,
        isPendingApproval: true,
        isReverseKpi: true,
        syncConfig: true,
        status: true
      },
      orderBy: [{ scorecardSection: "asc" }, { displayOrder: "asc" }]
    });
  }

  let employeeGoals: { contract: unknown; goals: unknown[] } | null = null;
  if (userMatch[0]) {
    const uid = userMatch[0].id;
    const empPc = await prisma.performanceContract.findFirst({
      where: {
        contractType: "EMPLOYEE",
        subjectUserId: uid,
        periodLabel,
        status: { notIn: ["ARCHIVED", "CANCELLED"] }
      },
      select: {
        id: true,
        title: true,
        periodLabel: true,
        periodStart: true,
        periodEnd: true
      },
      orderBy: { updatedAt: "desc" }
    });
    if (empPc) {
      const eg = await prisma.performanceGoal.findMany({
        where: {
          assignedToId: uid,
          type: "individual",
          OR: [
            { performanceContractId: empPc.id },
            {
              startDate: { lte: empPc.periodEnd },
              endDate: { gte: empPc.periodStart }
            }
          ]
        },
        select: {
          id: true,
          title: true,
          performanceContractId: true,
          scorecardWeight: true,
          preciseCurrentValue: true,
          currentValue: true,
          startDate: true,
          endDate: true
        },
        take: 50
      });
      employeeGoals = { contract: empPc, goals: eg };
    } else {
      employeeGoals = { contract: null, goals: [] };
    }
  }

  const syncSnippet = (g: { syncConfig: unknown }) => {
    const sc = g.syncConfig && typeof g.syncConfig === "object" ? (g.syncConfig as Record<string, unknown>) : {};
    return {
      bscEntryKind: sc.bscEntryKind ?? null,
      lastBscEntryAt: sc.lastBscEntryAt ?? null
    };
  };

  console.log(
    JSON.stringify(
      {
        periodLabel,
        usersMatchingKarataShakarata: userMatch,
        boardContractsForPeriod: boardContracts,
        ceoContractsForPeriod: ceoContracts,
        ceoContractUsed: ceoContracts[0]?.id ?? null,
        ceoGoalCount: ceoGoals.length,
        ceoGoals: ceoGoals.map((g) => ({
          ...g,
          preciseCurrentValue: g.preciseCurrentValue?.toString?.() ?? g.preciseCurrentValue,
          targetValue: g.targetValue?.toString?.() ?? g.targetValue,
          currentValue: g.currentValue?.toString?.() ?? g.currentValue,
          syncConfig: syncSnippet(g)
        })),
        employeeForKarataUser: userMatch[0]
          ? {
              userId: userMatch[0].id,
              employeePcAndGoals: employeeGoals
            }
          : null,
        scorecardDataFlow: {
          bscEntry:
            "POST /api/performance/bsc-entry/... endpoints update performance_goals by goalId (preciseCurrentValue, currentValue, syncConfig.bscEntryKind).",
          ceoScorecard:
            "GET/POST /api/performance/scorecards/ceo — loads goals WHERE performanceContractId = CEO contract id; scoring uses extractCEOFormulaActual + stored values (resolveStoredGoalActual). Goals must be ON the CEO contract.",
          alignment:
            "If BSC updates goals that are NOT linked to performanceContractId = CEO contract, CEO scorecard will not see them."
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
