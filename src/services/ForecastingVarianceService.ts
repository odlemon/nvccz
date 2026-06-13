// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import {
  translateBaseValue,
  varianceAbsolute,
  variancePercent,
  toDec,
  roundAmount
} from "../utils/forecastMath";
import { ForecastingFxService } from "./ForecastingFxService";
import { periodKeyToBounds } from "../utils/forecastPeriodUtils";

export class ForecastingVarianceService {
  static async recomputeForCell(
    cell: {
      id: string;
      forecastValue: Decimal;
      actualValueOverride: Decimal | null;
      txCurrencyValue: Decimal;
      projectedRate: Decimal | null;
      actualRate: Decimal | null;
    },
    actualFromGl: number | null,
    isElapsed: boolean
  ) {
    if (!isElapsed) {
      return prisma.forecastCell.update({
        where: { id: cell.id },
        data: { varianceAbsolute: null, variancePercent: null }
      });
    }
    const actual = actualFromGl != null ? toDec(actualFromGl) : cell.actualValueOverride ?? toDec(0);
    const forecast = toDec(cell.forecastValue);
    const vAbs = varianceAbsolute(actual, forecast);
    const vPct = variancePercent(actual, forecast);
    return prisma.forecastCell.update({
      where: { id: cell.id },
      data: {
        actualValueOverride: cell.actualValueOverride ?? roundAmount(actual),
        varianceAbsolute: vAbs,
        variancePercent: vPct
      }
    });
  }

  static async recomputeScenarioElapsed(
    scenarioId: string,
    periodKeys: string[],
    elapsedKeys: string[],
    baseCurrency: string
  ) {
    if (!elapsedKeys.length) return 0;
    const cells = await prisma.forecastCell.findMany({
      where: { scenarioId, periodKey: { in: elapsedKeys } }
    });
    let updated = 0;
    for (const cell of cells) {
      const bounds = periodKeyToBounds(cell.periodKey);
      const actualRate =
        cell.actualRate ??
        (await ForecastingFxService.resolveActualRate(
          baseCurrency,
          cell.txCurrency,
          bounds.start,
          bounds.end
        ));
      const actual = cell.actualValueOverride ?? cell.baseCurrencyValue;
      const vAbs = varianceAbsolute(actual, cell.forecastValue);
      const vPct = variancePercent(actual, cell.forecastValue);
      await prisma.forecastCell.update({
        where: { id: cell.id },
        data: {
          actualRate,
          varianceAbsolute: vAbs,
          variancePercent: vPct
        }
      });
      updated++;
    }
    return updated;
  }

  static applyFxToCell(
    txValue: number,
    projectedRate: Decimal,
    baseCurrency: string,
    txCurrency: string
  ) {
    const tx = toDec(txValue);
    const base = translateBaseValue(tx, projectedRate);
    return {
      txCurrency,
      txCurrencyValue: tx,
      baseCurrencyValue: base,
      forecastValue: base,
      projectedRate
    };
  }
}
