// @ts-nocheck
import { logger } from "../../utils/logger";
import { ExchangeRateDisplayCronService } from "./ExchangeRateDisplayCronService";

/**
 * In-process scheduler for street/official USD-ZWG rate ingestion.
 *
 * Background (FINDING-SR-002, design-refs/street-rates/TEST_FINDINGS.md in nvccz-new): before this
 * file existed, the only way `ExchangeRateQuote` rows ever refreshed was a staff member manually
 * clicking "Force Ingest Run" on /street-rates/config. Nobody remembered for over a month and every
 * dashboard reading through `ExchangeRateDisplayResolverService` (DASHBOARD_ACCOUNTING,
 * DASHBOARD_PORTFOLIO, DASHBOARD_CEO, PRICING_LISTED_EQUITY, LP_PORTAL, GENERIC) served a stale rate.
 *
 * Cadence decision: hourly (`DEFAULT_INTERVAL_MS` below), calling the exact same
 * `ExchangeRateDisplayCronService.refreshSnapshots()` the (previously unused) POST
 * /api/cron/exchange-rate-display/snapshot-refresh route and the "Force Ingest Run" button both call.
 * Reasoning:
 *   - The upstream source (`ZimrateRateService.fetchZimrateRates`) scrapes https://zimrate.com/ for a
 *     single JSON-LD "current" rate, falling back to the Statotec API. Neither publishes an intraday
 *     series — the ingested `date_label`/`asOfDate` is a calendar day, not a timestamp — so there is
 *     nothing to gain from polling more often than the source could plausibly change.
 *   - Neither call site documents or enforces a rate limit, and there's no evidence of a paid/metered
 *     tier (the Statotec bearer token is a static embedded credential, not a quota-tracked API key
 *     visible in this codebase). A single GET once an hour is not remotely aggressive for either a
 *     public website scrape or a fallback REST call.
 *   - Hourly is a safety margin, not an attempt to catch intraday moves: it means a freshly published
 *     day's rate shows up within an hour instead of depending on staff noticing and clicking a button.
 *     Daily would still leave up to 24h of staleness right after a source update; every-6-hours was
 *     considered but hourly costs one extra cheap HTTP call for meaningfully fresher dashboards.
 *   - Configurable via STREET_RATE_REFRESH_INTERVAL_MS (floor of 5 minutes, to prevent misconfiguration
 *     from hammering the upstream source) in case ops ever confirms the source is rate-limited and
 *     needs to back off to every 6h or daily.
 */

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MIN_INTERVAL_MS = 5 * 60 * 1000; // floor: refuse to poll more often than every 5 minutes
const STARTUP_DELAY_MS = 30 * 1000; // let DB connection / server settle before the first run

function resolveIntervalMs(): number {
  const raw = process.env.STREET_RATE_REFRESH_INTERVAL_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= MIN_INTERVAL_MS) {
    return parsed;
  }
  if (raw) {
    logger.warn(
      `[StreetRateAutoRefresh] Ignoring STREET_RATE_REFRESH_INTERVAL_MS="${raw}" (must be a number >= ${MIN_INTERVAL_MS}ms); using default`
    );
  }
  return DEFAULT_INTERVAL_MS;
}

let isRunning = false;
let timer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;

async function runOnce(trigger: "startup" | "interval"): Promise<void> {
  if (isRunning) {
    logger.warn(`[StreetRateAutoRefresh] Skipped ${trigger} run — a previous run is still in progress`);
    return;
  }
  isRunning = true;
  try {
    const result = await ExchangeRateDisplayCronService.refreshSnapshots();
    logger.info(`[StreetRateAutoRefresh] Refresh (${trigger}) completed`, result);
  } catch (error: any) {
    logger.error(`[StreetRateAutoRefresh] Refresh (${trigger}) failed`, {
      error: error?.message || String(error),
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Start the automatic ingest schedule. Call once from server startup, after the DB connection is
 * confirmed. Safe to call more than once — subsequent calls are a no-op while already scheduled.
 */
export function startStreetRateAutoRefresh(): void {
  if (timer || startupTimer) return; // already scheduled

  const intervalMs = resolveIntervalMs();
  logger.info(
    `[StreetRateAutoRefresh] Scheduling automatic street-rate ingest every ${Math.round(
      intervalMs / 60000
    )} min (first run in ${Math.round(STARTUP_DELAY_MS / 1000)}s)`
  );

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void runOnce("startup");
  }, STARTUP_DELAY_MS);
  startupTimer.unref?.();

  timer = setInterval(() => {
    void runOnce("interval");
  }, intervalMs);
  timer.unref?.();
}

/** Stop the schedule. Used on graceful shutdown; also handy for tests. */
export function stopStreetRateAutoRefresh(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
