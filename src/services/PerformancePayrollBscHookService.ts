import { BscDigitalEntryService } from "./BscDigitalEntryService";

/**
 * SRD §4.2 vacant-posts / headcount style KPI: caller passes the performance goal id
 * (e.g. `bscNewHireCounterGoalId` on `POST /api/payroll/employees`).
 */
export class PerformancePayrollBscHookService {
  static async onEmployeeCreated(params: {
    bscNewHireCounterGoalId?: string | null;
    createdByUserId: string | null;
  }): Promise<void> {
    const goalId = params.bscNewHireCounterGoalId?.trim();
    if (!goalId) return;
    await BscDigitalEntryService.submitPayrollNewHireCounter({
      goalId,
      incrementBy: 1,
      responsibleUserId: params.createdByUserId
    });
  }
}
