import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES } from "../config/vcCacMarketingExpenseCategories";
import { logger } from "../utils/logger";

export const VC_CAC_KPI_CODE = "VC_CUSTOMER_ACQUISITION_COST";

const SNAPSHOT_CAC = "VC_CAC";
const SNAPSHOT_NUMERATOR = "VC_CAC_NUMERATOR_USD";
const SNAPSHOT_DENOM = "VC_CAC_CUSTOMER_COUNT";

/**
 * Lowercased names that count as marketing for VC CAC.
 * See `VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES` in config; optional `VC_CAC_MARKETING_CATEGORY_NAMES_EXTRA` (comma‑separated).
 */
export function getVcCacMarketingCategoryNames(): string[] {
  const set = new Set(
    VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES.map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
  const extra = process.env.VC_CAC_MARKETING_CATEGORY_NAMES_EXTRA?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const t = part.trim().toLowerCase();
      if (t) set.add(t);
    }
  }
  return [...set];
}

function asDecimal18_6(n: number): string {
  if (!Number.isFinite(n)) return "0.000000";
  return (Math.round(n * 1_000_000) / 1_000_000).toFixed(6);
}

/**
 * ZWG-class amounts use `usdZwgRateSnapshot` as ZWG per 1 USD (see project middleware / Zimrate).
 */
function expenseTotalToUsd(params: {
  totalAmount: Decimal | number;
  currencyCode: string;
  usdZwgRateSnapshot: Decimal | number | null;
}): number {
  const t = Number(params.totalAmount);
  if (!Number.isFinite(t)) return 0;
  const code = String(params.currencyCode || "").toUpperCase();
  if (code === "USD") return t;
  if ((code === "ZWG" || code === "ZWL" || code === "ZIG") && params.usdZwgRateSnapshot != null) {
    const r = Number(params.usdZwgRateSnapshot);
    if (Number.isFinite(r) && r > 0) return t / r;
  }
  // Other currencies: without a cross table here, treat amount as USD (UAT often uses USD).
  return t;
}

export class VcCacSyncService {
  /**
   * All-time VC company CAC: sum(POSTED marketing expenses in USD) / count(active customers).
   * Persists `performance_metric_snapshots` and updates linked CAC performance goals.
   */
  static async recomputeAndPersist(params: { source: "customers" | "expenses" | "system" }) {
    const now = new Date();
    const nameSet = new Set(getVcCacMarketingCategoryNames());

    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });
    const marketingCategoryIds = categories
      .filter((c) => nameSet.has(String(c.name).trim().toLowerCase()))
      .map((c) => c.id);

    const [expenses, customerCount, currencies] = await Promise.all([
      marketingCategoryIds.length
        ? prisma.expense.findMany({
            where: {
              status: "POSTED",
              isActive: true,
              categoryId: { in: marketingCategoryIds }
            },
            select: {
              totalAmount: true,
              usdZwgRateSnapshot: true,
              currencyId: true
            }
          })
        : Promise.resolve([]),
      prisma.customer.count({ where: { isActive: true } }),
      prisma.currency.findMany({ where: { isActive: true }, select: { id: true, code: true } })
    ]);

    const ccy = new Map(currencies.map((c) => [c.id, c.code]));

    let spendUsd = 0;
    for (const e of expenses) {
      const code = ccy.get(e.currencyId) ?? "USD";
      spendUsd += expenseTotalToUsd({
        totalAmount: e.totalAmount,
        currencyCode: code,
        usdZwgRateSnapshot: e.usdZwgRateSnapshot
      });
    }

    const cac = customerCount > 0 ? spendUsd / customerCount : null;
    const cacStr = cac != null ? asDecimal18_6(cac) : "0.000000";
    const numStr = asDecimal18_6(spendUsd);
    const denStr = asDecimal18_6(customerCount);
    const src = `vc-cac|spend_usd=${numStr}|customers=${denStr}|from=${params.source}`;

    await Promise.all([
      prisma.performanceMetricSnapshot.upsert({
        where: { code: SNAPSHOT_CAC },
        create: {
          code: SNAPSHOT_CAC,
          value: cacStr,
          computedAt: now,
          source: cac == null ? `${src}|undefined` : src
        },
        update: {
          value: cacStr,
          computedAt: now,
          source: cac == null ? `${src}|undefined` : src
        }
      }),
      prisma.performanceMetricSnapshot.upsert({
        where: { code: SNAPSHOT_NUMERATOR },
        create: {
          code: SNAPSHOT_NUMERATOR,
          value: numStr,
          computedAt: now,
          source: params.source
        },
        update: { value: numStr, computedAt: now, source: params.source }
      }),
      prisma.performanceMetricSnapshot.upsert({
        where: { code: SNAPSHOT_DENOM },
        create: {
          code: SNAPSHOT_DENOM,
          value: denStr,
          computedAt: now,
          source: params.source
        },
        update: { value: denStr, computedAt: now, source: params.source }
      })
    ]);

    const goalRows = await prisma.performanceGoal.findMany({
      where: {
        OR: [
          { formulaType: { in: ["VC_CAC", "COMPANY_CAC", "VC_CUSTOMER_ACQUISITION_COST"] } },
          { kpi: { code: VC_CAC_KPI_CODE } },
          { kpi: { name: { contains: "Customer Acquisition Cost" } } }
        ]
      },
      include: {
        kpi: { select: { isReverseKpi: true } }
      }
    });

    if (goalRows.length) {
      const { PerformanceGoalProgressEventService } = await import("./PerformanceGoalProgressEventService");
      if (cac != null) {
        for (const g of goalRows) {
          // value, progress and zone come from the event ledger (recomputed), not a direct overwrite
          await PerformanceGoalProgressEventService.setValueFromIntegration(g.id, Number(cacStr), `realtime-vc-cac:${now.toISOString()}`, g.createdById);
          await prisma.performanceGoal.update({
            where: { id: g.id },
            data: {
              lastSyncedValue: cacStr,
              lastSyncedAt: now,
              ...(g.syncEndpointPath && /\/v1\//.test(String(g.syncEndpointPath)) ? {} : { syncEndpointPath: "in-process://realtime-vc-cac" })
            }
          });
        }
      } else {
        // no active customer: the ratio cannot be computed now — the goal keeps its value; the sync records "nothing to measure"
        for (const g of goalRows) {
          await prisma.performanceGoal.update({
            where: { id: g.id },
            data: {
              lastSyncedValue: null,
              lastSyncedAt: now,
              ...(g.syncEndpointPath && /\/v1\//.test(String(g.syncEndpointPath)) ? {} : { syncEndpointPath: "in-process://realtime-vc-cac" })
            }
          });
        }
      }
    }

    const result = {
      marketingSpendUsd: spendUsd,
      customerCount,
      cac,
      cacPrecise: cacStr,
      computedAt: now,
      updatedGoals: goalRows.length
    };
    logger.info("[VC CAC Sync] recomputeAndPersist done", {
      source: params.source,
      ...result
    });
    return result;
  }
}
