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

/** "Sep 2026" — an X-axis tick a person can read. See `historySteps` for why. */
function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
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
    let singleFundOperatingModel: string | null = null;
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
      if (opts.fundId === fundId) singleFundOperatingModel = operatingModel;
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
      // SRD section 3: "Do not show commitment, DPI or TVPI concepts to an open-ended fund unless
      // explicitly configured", and section 37 forbids displaying DPI/RVPI/TVPI regardless of the
      // operating model. These multiples are defined against called and paid-in capital, which an
      // open-ended vehicle does not have, so for OPEN_ENDED they are not merely inapplicable but
      // meaningless: this fund was reporting a Net IRR of -102 against zero paid-in and zero NAV,
      // and the screen rendered it as "-102.0%" next to a real 18.7%. They are withheld at the
      // source rather than left to each client to remember to hide.
      const privateCapitalMultiples = operatingModel !== "OPEN_ENDED";
      series.push({
        fundId,
        fundName: m.fundName,
        operatingModel,
        structure: operatingModel === "OPEN_ENDED" ? "Open-End" : operatingModel === "CREDIT" ? "Credit" : "Closed-End",
        netIrr: privateCapitalMultiples && m.netIrr != null ? ratioStr(m.netIrr, 4) : null,
        tvpi: privateCapitalMultiples ? ratioStr(m.tvpi, 4) : null,
        dpi: privateCapitalMultiples ? ratioStr(m.dpi, 4) : null,
        rvpi: privateCapitalMultiples ? ratioStr(m.rvpi, 4) : null,
        nav: moneyStr(m.nav),
        paidIn: moneyStr(m.totalPaidIn),
        distributions: moneyStr(m.totalDistributions),
      });
    }

    const paidIn = totals.paidIn;
    const tvpi = paidIn > 0 ? (totals.distributions + totals.currentNav) / paidIn : 0;
    const dpi = paidIn > 0 ? totals.distributions / paidIn : 0;
    const rvpi = paidIn > 0 ? totals.currentNav / paidIn : 0;
    // Same SRD gate as the `byFund` rows above, applied to this single-fund summary: when the
    // caller scoped the request to one specific fund (opts.fundId) and that fund is OPEN_ENDED,
    // these multiples are meaningless (not just inapplicable) for it, the same way they are per row
    // in `series`. Without this, selecting an open-ended fund on its own in the Performance screen
    // showed a real closed-end-style Net IRR/TVPI/DPI/RVPI computed against its own zero paid-in
    // capital — exactly the "-102% next to a real 18.7%" failure mode the comment above describes,
    // just reached through the single-fund summary instead of the all-funds row.
    const suppressMultiples = singleFundOperatingModel === "OPEN_ENDED";

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
        netIrr: suppressMultiples ? null : totals.netIrr != null ? ratioStr(totals.netIrr, 4) : null,
        tvpi: suppressMultiples ? null : ratioStr(tvpi, 4),
        dpi: suppressMultiples ? null : ratioStr(dpi, 4),
        rvpi: suppressMultiples ? null : ratioStr(rvpi, 4),
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
    const points: Array<{ date: string; label: string; nav: string | null; paidIn: string; distributions: string }> = [];

    // Cumulative paid-in and distributions as at each point, from the dated records themselves.
    //
    // This used to take the investor's CURRENT metrics and multiply them by a decay factor
    // ("Scale for placeholder history series"), which manufactured a plausible upward curve out
    // of nothing: an investor whose only capital call was issued on 2026-09-04 was shown paid-in
    // of 625,000 as at 2019, and 1,025,000 as at 2025 — a figure that appears in no record. That
    // is invented performance history presented to an investor, so it is computed for real here.
    //
    // `metricsForFund` cannot be reused for this: `paidInByClientFund` /
    // `distributionsByClientFund` in LpFundMetricsService take no date bound, so they always
    // return today's totals regardless of the period passed. Rather than change that shared
    // reporting helper's signature and every caller with it, the two cumulative series are read
    // directly from the dated source rows.
    const commitments = await db().investmentCommitment.findMany({
      where: { clientId: ctx.clientId, fundId: { in: fundIds }, status: { in: ["ACTIVE", "PENDING"] } },
      select: { id: true, effectiveDate: true },
    });
    const commitmentIds = commitments.map((c) => c.id);

    const paidRows = commitmentIds.length
      ? await db().capitalCallAllocation.findMany({
          where: { investmentCommitmentId: { in: commitmentIds } },
          select: { amountPaid: true, capitalCall: { select: { transactionDate: true } } },
        })
      : [];

    const distRows = await db().distributionAllocation.findMany({
      where: {
        clientId: ctx.clientId,
        distribution: { fundId: { in: fundIds }, status: { not: "CANCELLED" } },
      },
      select: { amountPaid: true, distribution: { select: { distributionDate: true } } },
    });

    // "Since Inception" means since THIS investor's inception. It used to mean a flat 84 months
    // for everybody, so an LP whose first commitment was taken in September 2026 was shown seven
    // years of chart before they existed — the series sat on zero across most of the width and
    // the axis implied a history the investor does not have. Inception is the earliest dated
    // thing on their account; if none exists there is nothing to plot a history from and the
    // default window stands.
    const inceptionCandidates = [
      ...commitments.map((c) => c.effectiveDate),
      ...paidRows.map((r) => r.capitalCall?.transactionDate),
      ...distRows.map((r) => r.distribution?.distributionDate),
    ]
      .filter(Boolean)
      .map((d) => new Date(d as any).getTime())
      .filter((t) => Number.isFinite(t));
    const inception = inceptionCandidates.length ? new Date(Math.min(...inceptionCandidates)) : null;

    const steps = this.historySteps(opts.range || "SI", asOf, inception);

    for (const step of steps) {
      const pointDate = monthsBack(asOf, step.monthsBack);

      const paidIn = paidRows.reduce(
        (sum, r) =>
          r.capitalCall?.transactionDate && new Date(r.capitalCall.transactionDate) <= pointDate
            ? sum + Number(r.amountPaid?.toString() ?? "0")
            : sum,
        0
      );
      const distributions = distRows.reduce(
        (sum, r) =>
          r.distribution?.distributionDate && new Date(r.distribution.distributionDate) <= pointDate
            ? sum + Number(r.amountPaid?.toString() ?? "0")
            : sum,
        0
      );

      // NAV is a valuation, not a running total, so it cannot be derived from transactions. Only
      // a snapshot taken at or before the point date is a real answer; the current NAV is used
      // for "Now" alone. Anywhere else it is genuinely unknown and reported as null rather than
      // back-filled, so the chart draws no line instead of a made-up one.
      let nav: number | null = null;
      if (step.monthsBack === 0) {
        nav = 0;
        for (const fundId of fundIds) {
          const m = await this.metricsForFund(ctx, fundId, monthsBack(pointDate, 12), pointDate);
          nav += m.nav;
        }
      } else {
        const snaps = await db().lpPortalMetricSnapshot.findMany({
          where: { clientId: ctx.clientId, fundId: { in: fundIds }, asOfDate: { lte: pointDate } },
          orderBy: { asOfDate: "desc" },
        });
        const seen = new Set<string>();
        let total = 0;
        for (const snap of snaps) {
          if (seen.has(snap.fundId)) continue;
          seen.add(snap.fundId);
          total += Number((snap.metrics as any)?.nav ?? 0);
        }
        if (seen.size > 0) nav = total;
      }

      points.push({
        date: dateOnly(pointDate)!,
        label: step.monthsBack === 0 ? "Now" : monthLabel(pointDate),
        nav: nav === null ? null : moneyStr(nav),
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

  /**
   * Approved benchmark series for the LP performance screen.
   *
   * This used to manufacture the series: for each benchmark id it took a hardcoded `base` and
   * `step` and returned `base + i * step` across six yearly points, stamped `valuationStatus:
   * "FINAL"`, with a note reading "replace with approved index feed when available". Investors
   * were therefore comparing their fund against a straight line that came from nowhere — and the
   * note was rendered into the fund table's Benchmark column, so the placeholder text itself was
   * on screen.
   *
   * A benchmark is an external index. It cannot be derived from anything the platform holds, so
   * either approved points exist in `lp_benchmark_series_points` or the benchmark is reported as
   * not configured and the UI says so.
   */
  static async benchmarks(
    ctx: LpPortalContext,
    opts: { metric?: string; benchmarkId?: string; fundId?: string; asOfDate?: string } = {}
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const metric = String(opts.metric || "NET_IRR").toUpperCase();
    const benchmarkId = String(opts.benchmarkId || "CAMBRIDGE").toUpperCase();
    const asOf = opts.asOfDate ? new Date(opts.asOfDate) : new Date();

    const rows = await db().lpBenchmarkSeriesPoint.findMany({
      where: { benchmarkId, metric, asOfDate: { lte: asOf } },
      orderBy: { asOfDate: "asc" },
      select: { asOfDate: true, value: true, label: true, source: true, approvedAt: true },
    });

    const configured = rows.length > 0;

    return {
      metric,
      benchmarkId,
      asOfDate: dateOnly(asOf),
      valuationStatus: configured ? "FINAL" : "UNAVAILABLE",
      configured,
      series: rows.map((r) => ({
        date: dateOnly(r.asOfDate),
        label: r.label || dateOnly(r.asOfDate),
        value: ratioStr(Number(r.value?.toString() ?? "0"), 4),
      })),
      source: configured ? rows[rows.length - 1]?.source ?? null : null,
      approvedAt: configured ? dateOnly(rows[rows.length - 1]?.approvedAt) : null,
      note: configured
        ? null
        : `No approved ${benchmarkId} series is configured for ${metric}.`,
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

  /**
   * The points to plot for a range.
   *
   * `label` here is only a fallback: `history()` overwrites it with the point's own month and
   * year. The old labels were months-back tokens ("−84M"), which read as money on a chart
   * whose Y axis is denominated in $M.
   *
   * For SI the window is the investor's own lifetime, passed in as `inception`, rather than a
   * fixed 84 months. Clamped to at least 12 months so a brand-new investor still gets a chart
   * with width, and to at most 120 so a very old relationship stays legible.
   */
  private static historySteps(
    range: string,
    asOf?: Date,
    inception?: Date | null
  ): Array<{ monthsBack: number; label: string }> {
    const r = String(range || "SI").toUpperCase();
    const token = (m: number) => (m === 0 ? "Now" : `−${m}M`);
    const series = (span: number) => {
      const step = Math.max(1, Math.round(span / 6));
      const out: Array<{ monthsBack: number; label: string }> = [];
      for (let m = span; m > 0; m -= step) out.push({ monthsBack: m, label: token(m) });
      out.push({ monthsBack: 0, label: "Now" });
      return out;
    };

    if (r === "1Y") return series(12);
    if (r === "3Y") return series(36);
    if (r === "5Y") return series(60);
    if (r === "10Y" || r === "MAX") return series(120);
    if (r === "SI") {
      let span = 84;
      if (asOf && inception) {
        const months =
          (asOf.getUTCFullYear() - inception.getUTCFullYear()) * 12 +
          (asOf.getUTCMonth() - inception.getUTCMonth());
        span = Math.min(120, Math.max(12, months));
      }
      return series(span);
    }
    return series(24);
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
      // A snapshot's stored metrics JSON does not always carry the fund's name, and the fallback
      // was the raw fund id — so the Performance table showed an investor
      // "cmtmb1j1m0008unwo7m6zv48z" in the Fund column instead of "Arcus Growth Fund V". The name
      // is a lookup away; an opaque database id is never a reasonable thing to show.
      let fundName = m.fundName;
      if (!fundName) {
        const fund = await db().fund.findUnique({ where: { id: fundId }, select: { name: true } });
        fundName = fund?.name || fundId;
      }
      // `totalPaidIn`/`nav`/`totalDistributions` are the field names computeForClient() (the live
      // fallback below) currently returns and the cron snapshot writer persists verbatim — but
      // snapshots written before that shape existed used `paidIn`/`currentNav`/`distributions`.
      // A stale row in that older shape isn't re-upserted until the cron next fires for its exact
      // (clientId, fundId, asOfDate) key, so reading only the new names silently zeroed out real
      // paid-in/NAV/distributions on this fund while tvpi/dpi/rvpi (same key name either shape)
      // stayed correct — the Capital Activity chart and Current NAV/Paid-In cards went blank while
      // the ratio cards kept showing real numbers. Read both shapes rather than only the new one.
      return {
        fundName,
        totalCommitment: Number(m.totalCommitment ?? 0),
        totalPaidIn: Number(m.totalPaidIn ?? m.paidIn ?? 0),
        totalDistributions: Number(m.totalDistributions ?? m.distributions ?? 0),
        nav: Number(m.nav ?? m.currentNav ?? 0),
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
