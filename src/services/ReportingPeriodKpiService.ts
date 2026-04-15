import { prisma } from "../utils/database";
import { computeDerivedKpis } from "../utils/reportingDerivedKpis";
import { normalizeOperationalKpiPayload } from "../config/operationalKpiFieldSchema";
import AuditService from "./AuditService";

function periodKeyFromEnd(periodEnd: Date | string): string {
  const d = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
  return d.toISOString().split("T")[0];
}

/** Exported for submit-time validation (revenue variance vs prior period). */
export function priorPeriodRevenueFromSnapshot(snapshot: any, currentKey: string): number | null {
  const kpiValues = snapshot?.kpiValues;
  if (!kpiValues || typeof kpiValues !== "object") return null;
  const keys = Object.keys(kpiValues)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  const idx = keys.indexOf(currentKey);
  if (idx <= 0) return null;
  const prevKey = keys[idx - 1];
  const prev = kpiValues[prevKey];
  if (!prev || typeof prev !== "object") return null;
  const tr = prev.TOTAL_REVENUE ?? prev.TOTAL_REVENUE_COMPUTED;
  if (typeof tr === "number" && Number.isFinite(tr) && tr > 0) return tr;
  const derived = prev.derived?.financial?.TOTAL_REVENUE_COMPUTED;
  if (typeof derived === "number" && Number.isFinite(derived) && derived > 0) return derived;
  return null;
}

export class ReportingPeriodKpiService {
  static async getOperationalPayload(portfolioCompanyId: string, periodEnd: Date | string): Promise<Record<string, number>> {
    const pk = periodKeyFromEnd(periodEnd);
    const row = await prisma.reportingPeriodOperationalKpi.findUnique({
      where: {
        portfolioCompanyId_reportingPeriodEnd: {
          portfolioCompanyId,
          reportingPeriodEnd: new Date(pk),
        },
      },
    });
    if (!row?.payload || typeof row.payload !== "object") return {};
    return row.payload as Record<string, number>;
  }

  /**
   * After investee **submit** on an `OPERATIONAL_KPIS` financial report: upsert DB payload + recompute derived KPIs.
   * No-op for other report types. Fast path (DB upsert + one company read/update + in-memory math).
   */
  static async syncFromSubmittedOperationalReport(report: any, submittedById: string | null): Promise<void> {
    const rt = String(report?.reportType || "").toUpperCase();
    if (rt !== "OPERATIONAL_KPIS") return;

    const raw = report.parsedSnapshot ?? report.parsedsnapshot;
    let parsed: any = null;
    if (raw == null) return;
    if (typeof raw === "object" && !Buffer.isBuffer(raw)) {
      parsed = raw;
    } else if (typeof raw === "string" && String(raw).trim()) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (!parsed || typeof parsed !== "object") return;

    const payload = normalizeOperationalKpiPayload(parsed.operational ?? {});
    const portfolioCompanyId = report.portfolioCompanyId;
    const periodEnd = report.periodEnd ?? report.reportingPeriod;
    const periodStart = report.periodStart ?? periodEnd;
    if (!portfolioCompanyId || !periodEnd) return;

    const periodKey = periodKeyFromEnd(periodEnd);
    await prisma.reportingPeriodOperationalKpi.upsert({
      where: {
        portfolioCompanyId_reportingPeriodEnd: {
          portfolioCompanyId,
          reportingPeriodEnd: new Date(periodKey),
        },
      },
      create: {
        portfolioCompanyId,
        reportingPeriodEnd: new Date(periodKey),
        payload,
      },
      update: { payload },
    });

    await this.recomputeAndPersist({
      portfolioCompanyId,
      periodStart,
      periodEnd,
      submittedById,
    });

    await AuditService.log({
      userId: submittedById || null,
      action: "REPORTING_PERIOD_OPERATIONAL_KPIS_SUBMITTED",
      entityType: "PortfolioCompany",
      entityId: portfolioCompanyId,
      newValues: {
        reportingPeriod: periodKey,
        financialReportId: report.id ?? null,
        keys: Object.keys(payload),
      },
    });
  }

  /**
   * Refresh derived financial + operational KPIs into `portfolio_companies.financialKpis` for one period.
   */
  static async recomputeAndPersist(opts: {
    portfolioCompanyId: string;
    periodStart: Date | string;
    periodEnd: Date | string;
    submittedById?: string | null;
  }): Promise<ReturnType<typeof computeDerivedKpis>> {
    const periodKey = periodKeyFromEnd(opts.periodEnd);

    const [company, operationalRow] = await Promise.all([
      prisma.portfolioCompany.findUnique({
        where: { id: opts.portfolioCompanyId },
        select: { financialKpis: true },
      }),
      prisma.reportingPeriodOperationalKpi.findUnique({
        where: {
          portfolioCompanyId_reportingPeriodEnd: {
            portfolioCompanyId: opts.portfolioCompanyId,
            reportingPeriodEnd: new Date(periodKey),
          },
        },
      }),
    ]);

    const snapshot = (company?.financialKpis as any) || {};
    const periodBucket = snapshot.kpiValues?.[periodKey] || {};
    const manual = periodBucket.manualEntries || {};

    const incomeLineItems = manual.incomeStatement || null;
    let sofpCurrent = manual.statementOfFinancialPosition?.currentPeriod || null;
    if (!sofpCurrent && manual.statementOfFinancialPosition && typeof manual.statementOfFinancialPosition === "object") {
      const raw = manual.statementOfFinancialPosition;
      if (!raw.currentPeriod && !raw.priorPeriod) {
        sofpCurrent = raw;
      }
    }
    const cashflowLineItems = manual.cashflowStatement || null;

    const reports = snapshot.reports?.[periodKey] || {};
    const parsedIncome = reports.incomeStatement;
    const parsedSofp = reports.balanceSheet;
    const parsedCashflow = reports.cashflowStatement;

    const operational =
      operationalRow?.payload && typeof operationalRow.payload === "object"
        ? (operationalRow.payload as Record<string, number>)
        : {};

    const priorPeriodRevenue = priorPeriodRevenueFromSnapshot(snapshot, periodKey);

    const derived = computeDerivedKpis({
      incomeLineItems,
      sofpCurrent,
      cashflowLineItems,
      parsedIncome,
      parsedSofp,
      parsedCashflow,
      operational,
      priorPeriodRevenue,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
    });

    snapshot.kpiValues = snapshot.kpiValues || {};
    snapshot.kpiValues[periodKey] = { ...periodBucket };
    snapshot.kpiValues[periodKey].derived = {
      computedAt: new Date().toISOString(),
      formulasVersion: derived.formulasVersion,
      financial: derived.financial,
      operationalDerived: derived.operationalDerived,
      missingInputs: derived.missing,
    };

    const flatForLatest: Record<string, number> = {};
    for (const [k, v] of Object.entries(derived.financial)) {
      if (v != null && Number.isFinite(v)) flatForLatest[k] = v;
    }
    for (const [k, v] of Object.entries(derived.operationalDerived)) {
      if (v != null && Number.isFinite(v)) flatForLatest[k] = v;
    }
    snapshot.kpiValues[periodKey].AUTO_KPI_FLAT = flatForLatest;
    snapshot.latestDerivedKpisAt = new Date().toISOString();
    snapshot.latestDerivedKpisPeriod = periodKey;

    const allPeriodKeys = Object.keys(snapshot.kpiValues || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    const maxKey = allPeriodKeys.sort().pop();
    if (maxKey === periodKey) {
      snapshot.latestKpiValues = { ...(snapshot.latestKpiValues || {}), ...flatForLatest };
      snapshot.latestMetrics = snapshot.latestKpiValues;
    }

    await prisma.portfolioCompany.update({
      where: { id: opts.portfolioCompanyId },
      data: { financialKpis: snapshot as any },
    });

    return derived;
  }

  static async getPeriodSummaryForApplicant(params: {
    portfolioCompanyId: string;
    periodEnd: Date | string;
    periodStart?: Date | string | null;
  }) {
    const periodKey = periodKeyFromEnd(params.periodEnd);
    const row = await prisma.reportingPeriodOperationalKpi.findUnique({
      where: {
        portfolioCompanyId_reportingPeriodEnd: {
          portfolioCompanyId: params.portfolioCompanyId,
          reportingPeriodEnd: new Date(periodKey),
        },
      },
    });
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: params.portfolioCompanyId },
      select: { financialKpis: true },
    });
    const snapshot = (company?.financialKpis as any) || {};
    const derived = snapshot.kpiValues?.[periodKey]?.derived || null;
    return {
      periodEnd: periodKey,
      operational: (row?.payload as Record<string, number>) || {},
      derived,
    };
  }
}
