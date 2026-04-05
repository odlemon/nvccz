import { prisma } from "../utils/database";

function utcCalendarYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  };
}

/**
 * Finds or creates an ACTIVE DEPARTMENT performance contract for the calendar year
 * of `goalStart` (UTC). Department goals are linked via `performanceContractId` so
 * `getDepartmentScorecard` can resolve `contractType: DEPARTMENT` for the period.
 */
export async function ensureDepartmentPerformanceContractForGoal(params: {
  departmentName: string;
  goalStart: Date;
  createdById: string;
}): Promise<string> {
  const year = params.goalStart.getUTCFullYear();
  const { periodStart, periodEnd } = utcCalendarYearBounds(year);
  const periodLabel = String(year);

  const existing = await prisma.performanceContract.findFirst({
    where: {
      contractType: "DEPARTMENT",
      departmentName: params.departmentName,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    return existing.id;
  }

  const created = await prisma.performanceContract.create({
    data: {
      contractType: "DEPARTMENT",
      title: `Department performance contract — ${params.departmentName} (${periodLabel})`,
      status: "ACTIVE",
      periodLabel,
      periodStart,
      periodEnd,
      departmentName: params.departmentName,
      createdById: params.createdById,
      metadata: { source: "auto_created_with_department_goal" }
    }
  });
  return created.id;
}
