/**
 * Backfill helper: ensure KPI analytics uses correct accounting dates and income statement shape.
 *
 * This script does NOT change data; it prints the Payroll Expense KPI analytics for a period.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/backfill-performance-kpi-analytics-sanity.ts --start=2026-01-01 --end=2026-01-31
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceAnalyticsService } from "../src/services/PerformanceAnalyticsService";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const i = process.argv.indexOf(hit);
  return process.argv[i + 1];
}

async function main() {
  const startStr = arg("--start") || "2026-01-01";
  const endStr = arg("--end") || "2026-01-31";
  const start = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T23:59:59.999Z`);
  const usd = await prisma.currency.findFirst({ where: { code: "USD" } });
  const out = await PerformanceAnalyticsService.getKPIAnalysis(undefined, undefined, { start, end }, usd?.id);
  const payroll = out.kpiAnalytics?.find((k: any) => String(k.kpi?.name || "").toLowerCase().includes("payroll"));
  console.log("KPI analytics window:", { start: startStr, end: endStr, currency: usd?.code });
  console.log("Payroll KPI row:", payroll);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

