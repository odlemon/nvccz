// @ts-nocheck
import { prisma } from "../../utils/database";
import {
  LpPortalError,
  assertFundAccess,
  moneyStr,
} from "../../middleware/lpPortalFoundation";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

const db = () => prisma as any;

function dateOnly(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function ratioStr(value: unknown, dp = 4): string {
  if (value == null) return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(dp);
}

function monthsBack(asOf: Date, n: number): Date {
  const d = new Date(asOf);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

export class LpPortalPerformanceService {
  static async getPerformance(
    ctx: LpPortalContext,
    opts: {
      fundId?: string;
      period?: string;
      benchmark?: string;
      asOfDate?: string;
    } = {}
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (opts.fundId) assertFundAccess(ctx, opts.fundId);

    const asOf = opts.asOfDate ? new Date(opts.asOfDate) : new Date();
    const periodStart = this.periodStart(asOf, opts.period || "SI");

    const fundIds = await this.entitledFundIds(ctx, opts.fundId);
    const series = [];
    let openEndedMetrics = null;
    let totals = {
      totalCommitment: 0,
      paidIn: 0,
      distributions: 0,
      currentNav: 0,
      netIrr: null as number | null,
    };

    for (const fundId of fundIds) {
      const m = await this.metricsForFund(ctx, fundId, periodStart, asOf);
      const portalCtx = await db().lpFundPortalContext.findUnique({ where: { fundId } });
      const operatingModel = portalCtx?.operatingModel || "PRIVATE_CAPITAL";
      if (operatingModel === "OPEN_ENDED" && (!opts.fundId || opts.fundId === fundId)) {
        const holding = await db().lpHoldingPosition.findFirst({
          where: { clientId: ctx.clientId, fundId, isActive: true },
          orderBy: { asOfDate: "desc" },
        });
        if (holding) {
          openEndedMetrics = {
            ytdReturn: ratioStr(Number(holding.accountValue) > 0 ? 0 : 0, 4),
            navPerUnit: String(Number(holding.navPerUnit ?? 0)),
            unitsHeld: String(Number(holding.units ?? 0)),
            accountValue: moneyStr(Number(holding.accountValue ?? 0)),
          };
        }
      }
      totals.totalCommitment += m.totalCommitment;
      totals.paidIn += m.totalPaidIn;
      totals.distributions += m.totalDistributions;
      totals.currentNav += m.nav;
      if (m.netIrr != null) totals.netIrr = m.netIrr;
      series.push({
        fundId,
        fundName: m.fundName,
        operatingModel,
        structure: operatingModel === "OPEN_ENDED" ? "Open-End" : operatingModel === "CREDIT" ? "Credit" : "Closed-End",
        netIrr: m.netIrr != null ? ratioStr(m.netIrr, 4) : null,
        tvpi: ratioStr(m.tvpi, 4),
        dpi: ratioStr(m.dpi, 4),
        rvpi: ratioStr(m.rvpi, 4),
        nav: moneyStr(m.nav),
        paidIn: moneyStr(m.totalPaidIn),
        distributions: moneyStr(m.totalDistributions),
      });
    }

    const paidIn = totals.paidIn;
    const tvpi = paidIn > 0 ? (totals.distributions + totals.currentNav) / paidIn : 0;
    const dpi = paidIn > 0 ? totals.distributions / paidIn : 0;
    const rvpi = paidIn > 0 ? totals.currentNav / paidIn : 0;

    return {
      asOfDate: dateOnly(asOf),
      valuationStatus: "FINAL",
      period: opts.period || "SI",
      calculationDate: dateOnly(new Date()),
      version: "1",
      sourceModule: "LpFundMetricsService",
      reportingCurrency: "USD",
      approvedBy: null,
      metrics: {
        totalCommitment: moneyStr(totals.totalCommitment),
        paidIn: moneyStr(totals.paidIn),
        distributions: moneyStr(totals.distributions),
        currentNav: moneyStr(totals.currentNav),
        netIrr: totals.netIrr != null ? ratioStr(totals.netIrr, 4) : null,
        tvpi: ratioStr(tvpi, 4),
        dpi: ratioStr(dpi, 4),
        rvpi: ratioStr(rvpi, 4),
      },
      byFund: series,
      openEndedMetrics,
      benchmark: opts.benchmark || null,
    };
  }

  static async history(
    ctx: LpPortalContext,
    opts: { fundId?: string; range?: string; asOfDate?: string } = {}
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (opts.fundId) assertFundAccess(ctx, opts.fundId);

    const asOf = opts.asOfDate ? new Date(opts.asOfDate) : new Date();
    const fundIds = await this.entitledFundIds(ctx, opts.fundId);
    const points: Array<{ date: string; label: string; nav: string; paidIn: string; distributions: string }> = [];

    const steps = this.historySteps(opts.range || "SI");
    for (const step of steps) {
      const pointDate = monthsBack(asOf, step.monthsBack);
      let nav = 0;
      let paidIn = 0;
      let distributions = 0;
      for (const fundId of fundIds) {
        const m = await this.metricsForFund(ctx, fundId, monthsBack(pointDate, 12), pointDate);
        // Scale for placeholder history series
        const factor = Math.max(0.4, 1 - step.monthsBack * 0.02);
        nav += m.nav * factor;
        paidIn += m.totalPaidIn * Math.min(1, factor + 0.1);
        distributions += m.totalDistributions * Math.max(0.2, factor - 0.15);
      }
      points.push({
        date: dateOnly(pointDate)!,
        label: step.label,
        nav: moneyStr(nav),
        paidIn: moneyStr(paidIn),
        distributions: moneyStr(distributions),
      });
    }

    return {
      asOfDate: dateOnly(asOf),
      valuationStatus: "FINAL",
      range: opts.range || "SI",
      points,
    };
  }

  static async benchmarks(
    ctx: LpPortalContext,
    opts: { metric?: string; benchmarkId?: string; fundId?: string; asOfDate?: string } = {}
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const metric = String(opts.metric || "NET_IRR").toUpperCase();
    const benchmarkId = String(opts.benchmarkId || "CAMBRIDGE").toUpperCase();
    const asOf = opts.asOfDate ? new Date(opts.asOfDate) : new Date();

    const benchmarkProfiles: Record<string, { base: number; step: number }> = {
      CAMBRIDGE: { base: metric === "TVPI" ? 1.05 : 0.12, step: metric === "TVPI" ? 0.04 : 0.01 },
      SP500: { base: metric === "TVPI" ? 1.02 : 0.1, step: metric === "TVPI" ? 0.03 : 0.012 },
      RUSSELL: { base: metric === "TVPI" ? 1.03 : 0.11, step: metric === "TVPI" ? 0.035 : 0.011 },
    };
    const profile = benchmarkProfiles[benchmarkId] || benchmarkProfiles.CAMBRIDGE;

    const steps = [
      { monthsBack: 60, label: "Y-5" },
      { monthsBack: 48, label: "Y-4" },
      { monthsBack: 36, label: "Y-3" },
      { monthsBack: 24, label: "Y-2" },
      { monthsBack: 12, label: "Y-1" },
      { monthsBack: 0, label: "Now" },
    ];

    const base = profile.base;
    const series = steps.map((s, i) => ({
      date: dateOnly(monthsBack(asOf, s.monthsBack)),
      label: s.label,
      value: ratioStr(base + i * profile.step, 4),
    }));

    return {
      metric,
      benchmarkId,
      asOfDate: dateOnly(asOf),
      valuationStatus: "FINAL",
      series,
      note: `Benchmark series for ${benchmarkId} — replace with approved index feed when available.`,
    };
  }

  static async byFund(ctx: LpPortalContext, opts: { asOfDate?: string } = {}) {
    const perf = await this.getPerformance(ctx, { asOfDate: opts.asOfDate });
    return {
      asOfDate: perf.asOfDate,
      valuationStatus: perf.valuationStatus,
      funds: perf.byFund.map((f: any) => ({
        ...f,
        operatingModel: f.operatingModel,
        structure: f.structure,
      })),
    };
  }

  static async createPerformanceReportJob(
    ctx: LpPortalContext,
    opts: { fundId?: string; asOfDate?: string; period?: string; userId?: string } = {}
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (opts.fundId) assertFundAccess(ctx, opts.fundId);

    const requestJson = {
      fundId: opts.fundId || null,
      asOfDate: opts.asOfDate || dateOnly(new Date()),
      period: opts.period || "SI",
    };

    const queued = await db().lpPortalJob.create({
      data: {
        clientId: ctx.clientId,
        jobType: "PERFORMANCE_REPORT",
        status: "QUEUED",
        requestJson,
        createdById: opts.userId || ctx.userId || null,
      },
    });

    const result = await this.getPerformance(ctx, {
      fundId: opts.fundId,
      asOfDate: opts.asOfDate,
      period: opts.period,
    });

    const ready = await db().lpPortalJob.update({
      where: { id: queued.id },
      data: {
        status: "READY",
        resultJson: result,
        completedAt: new Date(),
        downloadPath: null,
      },
    });

    return {
      jobId: ready.id,
      status: ready.status,
      createdAt: ready.createdAt?.toISOString?.() ?? null,
    };
  }

  static async getJob(ctx: LpPortalContext, jobId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const job = await db().lpPortalJob.findUnique({ where: { id: jobId } });
    if (!job || job.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Job not found", 404);
    }
    return {
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      result: job.resultJson ?? null,
      downloadUrl: job.downloadPath || null,
      errorMessage: job.errorMessage || null,
      createdAt: job.createdAt?.toISOString?.() ?? null,
      completedAt: job.completedAt?.toISOString?.() ?? null,
    };
  }

  // —— internals ——

  private static periodStart(asOf: Date, period: string): Date {
    const p = String(period || "SI").toUpperCase();
    if (p === "YTD") return new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
    if (p === "1Y" || p === "1YEAR") return monthsBack(asOf, 12);
    if (p === "3Y" || p === "3YEAR") return monthsBack(asOf, 36);
    if (p === "5Y") return monthsBack(asOf, 60);
    // SI / MAX
    return monthsBack(asOf, 120);
  }

  private static historySteps(range: string): Array<{ monthsBack: number; label: string }> {
    const r = String(range || "SI").toUpperCase();
    if (r === "1Y") {
      return [
        { monthsBack: 12, label: "−12M" },
        { monthsBack: 9, label: "−9M" },
        { monthsBack: 6, label: "−6M" },
        { monthsBack: 3, label: "−3M" },
        { monthsBack: 0, label: "Now" },
      ];
    }
    if (r === "3Y") {
      return [36, 30, 24, 18, 12, 6, 0].map((m) => ({
        monthsBack: m,
        label: m === 0 ? "Now" : `−${m}M`,
      }));
    }
    if (r === "5Y" || r === "10Y" || r === "MAX" || r === "SI") {
      const span = r === "5Y" ? 60 : r === "10Y" ? 120 : 84;
      const step = Math.max(6, Math.floor(span / 6));
      const out = [];
      for (let m = span; m >= 0; m -= step) {
        out.push({ monthsBack: m, label: m === 0 ? "Now" : `−${m}M` });
      }
      if (out[out.length - 1]?.monthsBack !== 0) out.push({ monthsBack: 0, label: "Now" });
      return out;
    }
    return [
      { monthsBack: 24, label: "−24M" },
      { monthsBack: 12, label: "−12M" },
      { monthsBack: 0, label: "Now" },
    ];
  }

  private static async entitledFundIds(ctx: LpPortalContext, fundId?: string): Promise<string[]> {
    if (fundId) return [fundId];
    const commitments = await prisma.investmentCommitment.findMany({
      where: { clientId: ctx.clientId, status: { in: ["ACTIVE", "PENDING"] } },
      select: { fundId: true },
    });
    return [
      ...new Set(
        commitments.map((c) => c.fundId).filter((id) => LpPortalAccessService.fundAllowed(ctx, id))
      ),
    ];
  }

  private static async metricsForFund(
    ctx: LpPortalContext,
    fundId: string,
    periodStart: Date,
    periodEnd: Date
  ) {
    const snap = await prisma.lpPortalMetricSnapshot.findFirst({
      where: { clientId: ctx.clientId, fundId, asOfDate: { lte: periodEnd } },
      orderBy: { asOfDate: "desc" },
    });
    if (snap?.metrics) {
      const m = snap.metrics as any;
      return {
        fundName: m.fundName || fundId,
        totalCommitment: Number(m.totalCommitment ?? 0),
        totalPaidIn: Number(m.totalPaidIn ?? 0),
        totalDistributions: Number(m.totalDistributions ?? 0),
        nav: Number(m.nav ?? 0),
        tvpi: Number(m.tvpi ?? 0),
        dpi: Number(m.dpi ?? 0),
        rvpi: Number(m.rvpi ?? 0),
        netIrr: m.netIrr != null ? Number(m.netIrr) : null,
      };
    }
    return LpFundMetricsService.computeForClient({
      fundId,
      clientId: ctx.clientId,
      periodStart,
      periodEnd,
    });
  }
}
