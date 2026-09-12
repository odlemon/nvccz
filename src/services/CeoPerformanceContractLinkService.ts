import { prisma } from "../utils/database";

const ACTIVE_CONTRACT_STATUS = { notIn: ["ARCHIVED", "CANCELLED"] as string[] };

export function periodsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

/**
 * Active CEO performance contract overlapping a goal's date window (newest first).
 */
export async function findActiveCeoContractForGoalPeriod(
  startDate: Date,
  endDate: Date
): Promise<{ id: string; periodStart: Date; periodEnd: Date } | null> {
  const goalStart = new Date(startDate);
  const goalEnd = new Date(endDate);
  if (Number.isNaN(goalStart.getTime()) || Number.isNaN(goalEnd.getTime())) {
    return null;
  }

  const candidates = await prisma.performanceContract.findMany({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      status: ACTIVE_CONTRACT_STATUS,
      periodStart: { lte: goalEnd },
      periodEnd: { gte: goalStart }
    },
    select: { id: true, periodStart: true, periodEnd: true },
    orderBy: { updatedAt: "desc" },
    take: 5
  });

  const match = candidates.find((c) =>
    periodsOverlap(c.periodStart, c.periodEnd, goalStart, goalEnd)
  );
  return match ?? null;
}

/** Resolve CEO contract id for auto-linking a company goal, or undefined if none. */
export async function resolveCeoContractIdForCompanyGoal(
  startDate: Date,
  endDate: Date
): Promise<string | undefined> {
  const pc = await findActiveCeoContractForGoalPeriod(startDate, endDate);
  return pc?.id;
}

/**
 * Link company goals in the contract window to the CEO contract (idempotent).
 */
export async function syncCompanyGoalsToCeoContract(
  contractId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ linkedCount: number }> {
  const windowStart = new Date(periodStart);
  const windowEnd = new Date(periodEnd);

  const overlapping = await prisma.performanceGoal.findMany({
    where: {
      type: "company",
      startDate: { lte: windowEnd },
      endDate: { gte: windowStart },
      OR: [{ performanceContractId: null }, { performanceContractId: contractId }]
    },
    select: { id: true, performanceContractId: true }
  });

  const toLink = overlapping.filter(
    (g) => g.performanceContractId == null || g.performanceContractId === contractId
  );

  if (!toLink.length) {
    return { linkedCount: 0 };
  }

  const result = await prisma.performanceGoal.updateMany({
    where: { id: { in: toLink.map((g) => g.id) } },
    data: { performanceContractId: contractId }
  });

  return { linkedCount: result.count };
}
