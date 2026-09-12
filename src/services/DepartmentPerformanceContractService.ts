import { prisma } from "../utils/database";
import { utcCalendarYearBounds } from "./PerformanceContractSetupService";

/**
 * Finds or creates an ACTIVE DEPARTMENT performance contract for the calendar year
 * of `goalStart` (UTC). Prefer creating department PCs explicitly at period start (CEO/HR);
 * this remains as a fallback when the first department-scoped goal is saved without a PC.
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
      metadata: { source: "auto_linked_first_department_goal" }
    }
  });
  return created.id;
}
