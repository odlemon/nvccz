/**
 * Which financial report types are accepted without valuation/dividend automation
 * (no GL impact from the accept action itself). The single **POST .../review** handler
 * branches on `reportType`: these types skip `runPostApprovalAutomations`; core
 * financial statements require an accounting payload on ACCEPT.
 */

const U = (rt: string | null | undefined) => String(rt || "").toUpperCase();

/** Report types where ACCEPT skips accounting journal automation (operational / document family). */
export const REPORT_TYPES_ACCEPT_WITHOUT_ACCOUNTING = new Set([
  "OPERATIONAL_KPIS",
  "NON_FINANCIAL_KPIS",
  "BUSINESS_PLAN",
  "BANK_STATEMENTS",
  "TAX_COMPLIANCE",
  "MANAGEMENT_ACCOUNTS",
]);

export function isReportTypeAcceptWithoutAccounting(reportType: string | null | undefined): boolean {
  return REPORT_TYPES_ACCEPT_WITHOUT_ACCOUNTING.has(U(reportType));
}

/** True when ACCEPT via `.../review` must include valuation/dividend automation (existing accounting path). */
export function reportTypeRequiresAccountingAutomationOnAccept(reportType: string | null | undefined): boolean {
  return !isReportTypeAcceptWithoutAccounting(reportType);
}
