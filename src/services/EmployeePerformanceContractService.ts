import type { Prisma } from "@prisma/client";
import {
  createEmployeePerformanceContractInTransaction,
  defaultEmployeePerformanceContractPeriod,
  utcCalendarYearBounds
} from "./PerformanceContractSetupService";

export { defaultEmployeePerformanceContractPeriod, utcCalendarYearBounds };

/**
 * Creates an EMPLOYEE performance contract inside a transaction.
 * Used by backfill scripts and explicit period setup — not from payroll employee creation.
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
  const result = await createEmployeePerformanceContractInTransaction(tx, {
    ...params,
    periodLabel,
    periodStart,
    periodEnd
  });
  return result.contract;
}
