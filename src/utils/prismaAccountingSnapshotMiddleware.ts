// @ts-nocheck
import { Prisma, PrismaClient } from '@prisma/client';
import { resolveUsdZwgAvgForSnapshot } from '../services/UsdZwgRateResolver';

const SNAPSHOT_MODELS = new Set([
  'JournalEntry',
  'Expense',
  'Revenue',
  'Invoice',
  'PurchaseInvoice',
  'ProcurementInvoice',
  'CreditNote',
  'CashbookEntry',
  'Asset',
  'StockMovement',
  'InventoryItem',
  'DepreciationRecord',
  'AssetDisposalRecord'
]);

async function enrichRecordedCurrency(client: PrismaClient, model: string, data: Record<string, unknown>) {
  if (model === 'CashbookEntry') {
    if (data.recordedCurrencyId == null && data.bankId) {
      const bank = await client.bank.findUnique({
        where: { id: data.bankId as string },
        select: { currencyId: true }
      });
      if (bank?.currencyId) {
        data.recordedCurrencyId = bank.currencyId;
      }
    }
    return;
  }

  if (model === 'DepreciationRecord' && data.recordedCurrencyId == null && data.assetId) {
    const asset = await client.asset.findUnique({
      where: { id: data.assetId as string },
      select: { recordedCurrencyId: true }
    });
    if (asset?.recordedCurrencyId) {
      data.recordedCurrencyId = asset.recordedCurrencyId;
    }
    return;
  }

  if (model === 'AssetDisposalRecord' && data.recordedCurrencyId == null && data.assetId) {
    const asset = await client.asset.findUnique({
      where: { id: data.assetId as string },
      select: { recordedCurrencyId: true }
    });
    if (asset?.recordedCurrencyId) {
      data.recordedCurrencyId = asset.recordedCurrencyId;
    }
    return;
  }

  if (model === 'StockMovement') {
    if (data.recordedCurrencyId == null && data.itemId) {
      const item = await client.inventoryItem.findUnique({
        where: { id: data.itemId as string },
        select: { recordedCurrencyId: true }
      });
      if (item?.recordedCurrencyId) {
        data.recordedCurrencyId = item.recordedCurrencyId;
      }
    }
    if (data.recordedCurrencyId == null) {
      const def = await client.currency.findFirst({
        where: { isDefault: true },
        select: { id: true }
      });
      if (def?.id) {
        data.recordedCurrencyId = def.id;
      }
    }
    return;
  }

  if ((model === 'Asset' || model === 'InventoryItem') && data.recordedCurrencyId == null) {
    const def = await client.currency.findFirst({
      where: { isDefault: true },
      select: { id: true }
    });
    if (def?.id) {
      data.recordedCurrencyId = def.id;
    }
  }
}

async function applyUsdZwgSnapshot(client: PrismaClient, model: string, data: Record<string, unknown>) {
  if (data.usdZwgRateSnapshot !== undefined) {
    return;
  }
  const avg = await resolveUsdZwgAvgForSnapshot(client);
  if (avg == null) {
    return;
  }
  const dec = new Prisma.Decimal(avg);
  data.usdZwgRateSnapshot = dec;
  if (model === 'Invoice' && (data.exchangeRateAtCreation === undefined || data.exchangeRateAtCreation === null)) {
    data.exchangeRateAtCreation = dec;
  }
  if (model === 'ProcurementInvoice' && (data.exchangeRateAtCreation === undefined || data.exchangeRateAtCreation === null)) {
    data.exchangeRateAtCreation = dec;
  }
}

export function attachAccountingSnapshotMiddleware(client: PrismaClient): void {
  client.$use(async (params, next) => {
    const model = params.model;
    if (!model || !SNAPSHOT_MODELS.has(model)) {
      return next(params);
    }

    if (params.action === 'create') {
      const data = params.args.data;
      if (data && typeof data === 'object') {
        await enrichRecordedCurrency(client, model, data);
        await applyUsdZwgSnapshot(client, model, data);
      }
      return next(params);
    }

    if (params.action === 'createMany') {
      const rows = params.args.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return next(params);
      }
      for (const row of rows) {
        if (row && typeof row === 'object') {
          await enrichRecordedCurrency(client, model, row);
        }
      }
      const needsSnap = rows.some((r) => r && r.usdZwgRateSnapshot === undefined);
      if (needsSnap) {
        const avg = await resolveUsdZwgAvgForSnapshot(client);
        if (avg != null) {
          const dec = new Prisma.Decimal(avg);
          for (const row of rows) {
            if (!row || typeof row !== 'object') {
              continue;
            }
            if (row.usdZwgRateSnapshot === undefined) {
              row.usdZwgRateSnapshot = dec;
              if (model === 'Invoice' && (row.exchangeRateAtCreation === undefined || row.exchangeRateAtCreation === null)) {
                row.exchangeRateAtCreation = dec;
              }
              if (model === 'ProcurementInvoice' && (row.exchangeRateAtCreation === undefined || row.exchangeRateAtCreation === null)) {
                row.exchangeRateAtCreation = dec;
              }
            }
          }
        }
      }
      return next(params);
    }

    return next(params);
  });
}
