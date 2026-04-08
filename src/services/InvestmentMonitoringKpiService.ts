// @ts-nocheck
/**
 * Investment monitoring KPIs from ACCEPTED `financial_reports.parsedSnapshot` only.
 * Pure formulas live in `./investmentMonitoringKpiCompute` (testable without Prisma).
 */
import { prisma } from "../utils/database";
import {
  computeMonitoringKpisFromInputs,
  monthsBetweenPeriodStartEnd,
  parseMonitoringSnapshot,
} from "./investmentMonitoringKpiCompute";

export { computeMonitoringKpisFromInputs } from "./investmentMonitoringKpiCompute";

export class InvestmentMonitoringKpiService {
  static async recomputeAndPersistForPeriod(portfolioCompanyId: string, reportingPeriodIso: string): Promise<void> {
    const periodDate = new Date(reportingPeriodIso);
    if (Number.isNaN(periodDate.getTime())) {
      throw new Error("Invalid reportingPeriodIso");
    }

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT reportType, parsedSnapshot, periodStart, periodEnd
         FROM financial_reports
        WHERE portfolioCompanyId = ?
          AND status = 'ACCEPTED'
          AND DATE(COALESCE(reportingPeriod, periodEnd)) = DATE(?)`,
      portfolioCompanyId,
      reportingPeriodIso
    );

    let income: any = null;
    let balance: any = null;
    let cashFlow: any = null;
    let months = 1;

    for (const row of rows) {
      const snap = parseMonitoringSnapshot(row.parsedSnapshot);
      if (!snap) continue;
      const rt = String(row.reportType || "").toUpperCase();
      if (rt === "INCOME_STATEMENTS" || rt === "INCOME_STATEMENT") {
        income = snap;
        const ps = row.periodStart ? new Date(row.periodStart) : null;
        const pe = row.periodEnd ? new Date(row.periodEnd) : null;
        if (ps && pe && !Number.isNaN(ps.getTime()) && !Number.isNaN(pe.getTime())) {
          months = monthsBetweenPeriodStartEnd(ps, pe);
        }
      } else if (rt === "STATEMENT_OF_FINANCIAL_POSITION" || rt === "BALANCE_SHEET") {
        balance = snap;
      } else if (rt === "CASHFLOW_STATEMENTS" || rt === "CASHFLOW_STATEMENT") {
        cashFlow = snap;
        const ps = row.periodStart ? new Date(row.periodStart) : null;
        const pe = row.periodEnd ? new Date(row.periodEnd) : null;
        if (ps && pe && !Number.isNaN(ps.getTime()) && !Number.isNaN(pe.getTime())) {
          months = monthsBetweenPeriodStartEnd(ps, pe);
        }
      }
    }

    const priorRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT parsedSnapshot
         FROM financial_reports
        WHERE portfolioCompanyId = ?
          AND status = 'ACCEPTED'
          AND reportType IN ('INCOME_STATEMENTS', 'INCOME_STATEMENT')
          AND DATE(COALESCE(reportingPeriod, periodEnd)) < DATE(?)
        ORDER BY COALESCE(reportingPeriod, periodEnd) DESC
        LIMIT 1`,
      portfolioCompanyId,
      reportingPeriodIso
    );

    const priorRow = priorRows[0];
    const priorIncome = priorRow ? parseMonitoringSnapshot(priorRow.parsedSnapshot) : null;

    const { financial, operational } = computeMonitoringKpisFromInputs({
      incomeStatement: income,
      balanceSheet: balance,
      cashFlow,
      priorPeriodIncomeStatement: priorIncome,
      monthsInPeriod: months,
    });

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { financialKpis: true },
    });
    if (!company) throw new Error("Portfolio company not found");

    const snapshot = (company.financialKpis as any) || {};
    snapshot.monitoringKpis = { ...financial, operational };
    snapshot.monitoringKpisMeta = {
      asOfPeriod: reportingPeriodIso.slice(0, 10),
      computedAt: new Date().toISOString(),
      source: "ACCEPTED_FINANCIAL_REPORT_SNAPSHOTS",
    };

    await prisma.portfolioCompany.update({
      where: { id: portfolioCompanyId },
      data: { financialKpis: snapshot },
    });
  }
}
