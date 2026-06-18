// @ts-nocheck
import { prisma } from "../utils/database";
import { FORECAST_BATCH_CELL_MAX, FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import { buildCellNaturalKeyHash, normalizeCellDimension } from "../utils/forecastCellKey";
import { isFuturePeriod } from "../utils/forecastPeriodUtils";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingComputeService } from "./ForecastingComputeService";
import { ForecastingError } from "./ForecastingError";
import { ForecastingFxService } from "./ForecastingFxService";
import { ForecastingVarianceService } from "./ForecastingVarianceService";
import { periodKeyToBounds } from "../utils/forecastPeriodUtils";

const idempotencyCache = new Map<string, { at: number; result: unknown }>();

export class ForecastingCellService {
  static async patchCell(
    scenarioId: string,
    user: { id: string },
    body: {
      period_key: string;
      account_id: string;
      fund_id?: string;
      portfolio_company_id?: string;
      analytical_tag?: string;
      new_value: number;
      tx_currency: string;
      expected_updated_at?: string;
      idempotency_key?: string;
    }
  ) {
    if (body.idempotency_key) {
      const cached = idempotencyCache.get(body.idempotency_key);
      if (cached && Date.now() - cached.at < 3600000) return cached.result;
    }

    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    ForecastingAccessService.assertScenarioEditable(scenario);
    if (!isFuturePeriod(body.period_key)) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_PERIOD, "Only future periods are editable", 400);
    }

    const naturalKeyHash = buildCellNaturalKeyHash({
      scenarioId,
      periodKey: body.period_key,
      accountId: body.account_id,
      entityId: scenario.entityId,
      fundId: body.fund_id ?? scenario.fundId,
      portfolioCompanyId: body.portfolio_company_id,
      analyticalTag: body.analytical_tag
    });

    const existing = await prisma.forecastCell.findUnique({ where: { naturalKeyHash } });
    if (existing && body.expected_updated_at) {
      const expected = new Date(body.expected_updated_at).getTime();
      if (existing.updatedAt.getTime() !== expected) {
        throw ForecastingError.staleCellEdit();
      }
    }

    const bounds = periodKeyToBounds(body.period_key);
    const projectedRate = await ForecastingFxService.resolveProjectedRate(
      scenario.baseCurrency,
      body.tx_currency,
      bounds.end
    );
    const fx = ForecastingVarianceService.applyFxToCell(
      body.new_value,
      projectedRate,
      scenario.baseCurrency,
      body.tx_currency
    );

    const [accountMeta, portfolioCompany] = await Promise.all([
      prisma.entityChartOfAccount.findUnique({
        where: { id: body.account_id },
        select: { accountNo: true, accountName: true }
      }),
      body.portfolio_company_id
        ? prisma.portfolioCompany.findUnique({
            where: { id: body.portfolio_company_id },
            select: { name: true }
          })
        : Promise.resolve(null)
    ]);

    const beforeValue = existing ? Number(existing.txCurrencyValue) : null;

    await prisma.$transaction(
      async (tx) => {
        await tx.forecastCell.upsert({
          where: { naturalKeyHash },
          create: {
            scenarioId,
            periodKey: body.period_key,
            accountId: body.account_id,
            entityId: scenario.entityId,
            fundId: normalizeCellDimension(body.fund_id ?? scenario.fundId),
            portfolioCompanyId: normalizeCellDimension(body.portfolio_company_id),
            analyticalTag: normalizeCellDimension(body.analytical_tag),
            naturalKeyHash,
            ...fx,
            isManualOverride: true,
            lastEditedById: user.id,
            lastEditedAt: new Date()
          },
          update: {
            ...fx,
            isManualOverride: true,
            lastEditedById: user.id,
            lastEditedAt: new Date()
          }
        });
        await ForecastingAuditService.log(tx, {
          scenarioId,
          userId: user.id,
          actionType: "CELL_EDIT",
          deltaPayload: {
            period_key: body.period_key,
            account_id: body.account_id,
            account_no: accountMeta?.accountNo ?? null,
            account_name: accountMeta?.accountName ?? null,
            portfolio_company_id: body.portfolio_company_id ?? null,
            portfolio_company_name: portfolioCompany?.name ?? null,
            analytical_tag: body.analytical_tag ?? null,
            tx_currency: body.tx_currency,
            before_value: beforeValue,
            after_value: body.new_value,
            new_value: body.new_value,
            is_manual_override: true
          }
        });
      },
      { maxWait: 15_000, timeout: 30_000 }
    );

    const cell = await prisma.forecastCell.findUnique({ where: { naturalKeyHash } });

    const compute = await ForecastingComputeService.run({
      scenarioId,
      editType: "CELL",
      user,
      userId: user.id,
      coordinates: {
        period_key: body.period_key,
        account_id: body.account_id
      },
      options: { skip_manual_overrides: true, include_elapsed_variance: true }
    });

    const result = {
      cell_updated: true,
      cell,
      compute: {
        ...compute,
        note:
          compute.affected_cell_count === 0
            ? "Manual cell saved above. Driver recalculation skipped manual overrides, so affected_cell_count may be 0."
            : undefined
      }
    };
    if (body.idempotency_key) {
      idempotencyCache.set(body.idempotency_key, { at: Date.now(), result });
    }
    return result;
  }

  static async patchBatch(
    scenarioId: string,
    user: { id: string },
    edits: Array<Record<string, unknown>>,
    atomic = true
  ) {
    if (edits.length > FORECAST_BATCH_CELL_MAX) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, `Max ${FORECAST_BATCH_CELL_MAX} cells`, 400);
    }
    const results = [];
    if (atomic) {
      for (const edit of edits) {
        results.push(await ForecastingCellService.patchCell(scenarioId, user, edit as any));
      }
      return { edits: results.length, results };
    }
    for (const edit of edits) {
      try {
        results.push(await ForecastingCellService.patchCell(scenarioId, user, edit as any));
      } catch (e) {
        results.push({ error: (e as Error).message });
      }
    }
    return { edits: results.length, results };
  }

  static async clearOverride(
    scenarioId: string,
    user: { id: string },
    query: Record<string, string>
  ) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    ForecastingAccessService.assertScenarioEditable(scenario);
    const naturalKeyHash = buildCellNaturalKeyHash({
      scenarioId,
      periodKey: query.period_key,
      accountId: query.account_id,
      entityId: scenario.entityId,
      fundId: query.fund_id ?? scenario.fundId,
      portfolioCompanyId: query.portfolio_company_id,
      analyticalTag: query.analytical_tag
    });
    const cell = await prisma.forecastCell.findUnique({ where: { naturalKeyHash } });
    if (!cell) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Cell not found", 400);
    }
    const accountMeta = await prisma.entityChartOfAccount.findUnique({
      where: { id: query.account_id },
      select: { accountNo: true, accountName: true }
    });
    await prisma.$transaction(
      async (tx) => {
        await tx.forecastCell.update({
          where: { id: cell.id },
          data: { isManualOverride: false }
        });
        await ForecastingAuditService.log(tx, {
          scenarioId,
          userId: user.id,
          actionType: "CELL_OVERRIDE_CLEAR",
          deltaPayload: {
            period_key: query.period_key,
            account_id: query.account_id,
            account_no: accountMeta?.accountNo ?? null,
            account_name: accountMeta?.accountName ?? null,
            cleared_value: Number(cell.txCurrencyValue)
          }
        });
      },
      { maxWait: 15_000, timeout: 30_000 }
    );
    const compute = await ForecastingComputeService.run({
      scenarioId,
      editType: "CELL",
      user,
      userId: user.id,
      coordinates: { period_key: query.period_key, account_id: query.account_id },
      options: { skip_manual_overrides: false, include_elapsed_variance: true }
    });
    return { cleared: true, compute };
  }
}
