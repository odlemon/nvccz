// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  db,
  emitCash,
  moneyStr,
  paginated,
  parsePagination,
  requireStr,
} from "./spCashSupport";

function d(v: unknown) {
  try {
    return new Decimal(String(v ?? 0));
  } catch {
    return new Decimal(0);
  }
}

function presentItem(row: any) {
  const qty = d(row.quantity);
  const price = d(row.price);
  const notional = qty.mul(price);
  const diff = row.differenceAmount != null ? d(row.differenceAmount) : new Decimal(0);
  const internalAmount = row.internalAmount != null ? d(row.internalAmount) : notional;
  const brokerAmount =
    row.brokerAmount != null ? d(row.brokerAmount) : internalAmount.plus(diff);
  const custodianAmount =
    row.custodianAmount != null ? d(row.custodianAmount) : internalAmount;
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    instrumentIsin: row.instrumentIsin,
    instrumentName: row.instrumentName,
    symbol: row.symbol,
    quantity: row.quantity != null ? moneyStr(row.quantity) : null,
    price: row.price != null ? moneyStr(row.price) : null,
    tradeDate: row.tradeDate,
    settleDate: row.settleDate,
    internalStatus: row.internalStatus,
    brokerStatus: row.brokerStatus,
    custodianStatus: row.custodianStatus,
    overallStatus: row.overallStatus,
    differenceAmount: row.differenceAmount != null ? moneyStr(row.differenceAmount) : moneyStr(diff),
    internalAmount: moneyStr(internalAmount),
    brokerAmount: moneyStr(brokerAmount),
    custodianAmount: moneyStr(custodianAmount),
    internalRef: row.internalRef ?? null,
    brokerRef: row.brokerRef ?? null,
    custodianRef: row.custodianRef ?? null,
    currency: row.currency,
    assignedToId: row.assignedToId,
    comments: row.comments,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function queueBucket(status: string | null | undefined): "new" | "potential" | "matched" | "exception" | "escalated" {
  const s = String(status || "").toUpperCase();
  if (s === "MATCHED" || s === "CLEARED") return "matched";
  if (s === "POTENTIAL" || s === "SUGGESTED" || s === "PARTIAL") return "potential";
  if (s === "ESCALATED") return "escalated";
  if (s === "EXCEPTION") return "exception";
  if (s === "NEW" || s === "OPEN" || !s) return "new";
  return "exception";
}

function groupBucket(status: string | null | undefined): "MATCHED" | "POTENTIAL" | "EXCEPTION" {
  const q = queueBucket(status);
  if (q === "matched") return "MATCHED";
  if (q === "potential") return "POTENTIAL";
  return "EXCEPTION";
}

export class SpCashBrokerCustodianService {
  static async workspace(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.portfolioId) where.portfolioId = String(query.portfolioId);
    if (query.overallStatus) where.overallStatus = String(query.overallStatus);

    const [items, total] = await Promise.all([
      db.spCashBrokerCustodianItem.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: Math.max(take, 200),
      }),
      db.spCashBrokerCustodianItem.count({ where }),
    ]);

    const grouped = {
      MATCHED: [] as any[],
      POTENTIAL: [] as any[],
      EXCEPTION: [] as any[],
    };
    const queueCounts = { new: 0, potential: 0, matched: 0, exception: 0, escalated: 0 };
    const presentedItems = items.map(presentItem);
    for (const row of items) {
      const presented = presentItem(row);
      grouped[groupBucket(row.overallStatus)].push(presented);
      queueCounts[queueBucket(row.overallStatus)] += 1;
    }

    return {
      portfolioId: query.portfolioId || null,
      counts: {
        MATCHED: grouped.MATCHED.length,
        POTENTIAL: grouped.POTENTIAL.length,
        EXCEPTION: grouped.EXCEPTION.length,
        matched: grouped.MATCHED.length,
        potential: grouped.POTENTIAL.length,
        exception: grouped.EXCEPTION.length,
        total,
      },
      queueCounts,
      groups: grouped,
      items: presentedItems,
      page,
      pageSize,
    };
  }

  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.portfolioId) where.portfolioId = String(query.portfolioId);
    if (query.overallStatus) where.overallStatus = String(query.overallStatus);
    const [items, total] = await Promise.all([
      db.spCashBrokerCustodianItem.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      db.spCashBrokerCustodianItem.count({ where }),
    ]);
    return paginated(items.map(presentItem), total, page, pageSize);
  }

  static async confirmMatch(body: any, actorId: string) {
    const ids: string[] = Array.isArray(body.itemIds)
      ? body.itemIds
      : body.itemId
        ? [body.itemId]
        : [];
    if (!ids.length) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "itemId or itemIds required", 400);
    }

    const updated = [];
    for (const id of ids) {
      const row = await db.spCashBrokerCustodianItem.findUnique({ where: { id } });
      if (!row) continue;
      const next = await db.spCashBrokerCustodianItem.update({
        where: { id },
        data: {
          overallStatus: "MATCHED",
          internalStatus: row.internalStatus || "MATCHED",
          brokerStatus: row.brokerStatus || "MATCHED",
          custodianStatus: row.custodianStatus || "MATCHED",
          differenceAmount: 0,
          version: { increment: 1 },
          comments: body.notes
            ? `${row.comments || ""}\n${body.notes}`.trim()
            : row.comments,
        },
      });
      updated.push(presentItem(next));
    }

    await emitCash({
      eventType: "cash.broker_custodian.matched",
      aggregateType: "SpCashBrokerCustodianItem",
      aggregateId: ids[0],
      aggregateVersion: 1,
      actorId,
      payload: { itemIds: ids, count: updated.length },
    });
    return { items: updated };
  }

  static async escalate(id: string, body: any, actorId: string) {
    const row = await db.spCashBrokerCustodianItem.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Broker/custodian item not found", 404);

    const updated = await db.spCashBrokerCustodianItem.update({
      where: { id },
      data: {
        overallStatus: "ESCALATED",
        assignedToId: body.assigneeId || body.assignedToId || actorId,
        comments: body.notes
          ? `${row.comments || ""}\nESCALATED: ${body.notes}`.trim()
          : row.comments,
        version: { increment: 1 },
      },
    });

    if (body.createException !== false) {
      await db.spCashReconciliationException.create({
        data: {
          cashAccountId: body.cashAccountId || `portfolio:${row.portfolioId}`,
          category: "BROKER_CUSTODIAN",
          severity: body.severity || "HIGH",
          status: "OPEN",
          amountTxn: row.differenceAmount,
          currencyTxn: row.currency,
          assignedToId: updated.assignedToId,
          instrumentJson: {
            name: row.instrumentName,
            symbol: row.symbol,
            isin: row.instrumentIsin,
          },
          tradeDate: row.tradeDate,
          settleDate: row.settleDate,
          source: "BROKER_CUSTODIAN",
          counterparty: body.counterparty || null,
        },
      });
    }

    await emitCash({
      eventType: "cash.broker_custodian.escalated",
      aggregateType: "SpCashBrokerCustodianItem",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.notes || null,
    });
    return presentItem(updated);
  }

  static async clear(id: string, body: any, actorId: string) {
    const row = await db.spCashBrokerCustodianItem.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Broker/custodian item not found", 404);

    const updated = await db.spCashBrokerCustodianItem.update({
      where: { id },
      data: {
        overallStatus: "CLEARED",
        comments: body.notes
          ? `${row.comments || ""}\nCLEARED: ${body.notes}`.trim()
          : row.comments,
        version: { increment: 1 },
      },
    });
    await emitCash({
      eventType: "cash.broker_custodian.cleared",
      aggregateType: "SpCashBrokerCustodianItem",
      aggregateId: id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.notes || null,
    });
    return presentItem(updated);
  }
}
