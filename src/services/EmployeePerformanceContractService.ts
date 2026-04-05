import type { Prisma } from "@prisma/client";

/** Calendar-year period used for default individual performance contracts. */
export function defaultEmployeePerformanceContractPeriod(now: Date = new Date()) {
  const year = now.getUTCFullYear();
  return {
    periodLabel: String(year),
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  };
}

/**
 * Creates an ACTIVE EMPLOYEE performance contract for payroll onboarding.
 * Call inside `prisma.$transaction` when creating the `Employee` row.
 */
export async function createDefaultEmployeePerformanceContract(
  tx: Prisma.TransactionClient,
  params: {
    subjectUserId: string;
    departmentName: string | null;
    createdById: string;
    employeeFirstName: string;
    employeeLastName: string;
  }
) {
  const { periodLabel, periodStart, periodEnd } = defaultEmployeePerformanceContractPeriod();
  const name = `${params.employeeFirstName} ${params.employeeLastName}`.trim() || "Employee";
  return tx.performanceContract.create({
    data: {
      contractType: "EMPLOYEE",
      title: `Individual performance contract — ${name} (${periodLabel})`,
      status: "ACTIVE",
      periodLabel,
      periodStart,
      periodEnd,
      subjectUserId: params.subjectUserId,
      departmentName: params.departmentName,
      createdById: params.createdById,
      metadata: { source: "payroll_employee_onboarding" }
    }
  });
}
