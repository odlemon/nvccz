// @ts-nocheck
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";

const ADMIN_CODES = new Set(["CFO", "FIN_MGR", "FIN_MANAGER", "FINANCE_MANAGER"]);

export class ExchangeRateDisplayAccessService {
  static isFinanceAdmin(user: any): boolean {
    if (isAdminViewer(user)) return true;
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    if (ADMIN_CODES.has(code)) return true;
    return hasAnySignal(user, ["cfo", "fin_mgr", "finance manager", "finance_manager"]);
  }

  static assertFinanceAdmin(user: any) {
    if (ExchangeRateDisplayAccessService.isFinanceAdmin(user)) return;
    throw Object.assign(new Error("CFO or finance admin access required"), { statusCode: 403 });
  }
}
