// @ts-nocheck
/**
 * Trade 3-way reconciliation (BA-RC-1 / BA-RC-4): internal blotter × broker × custodian.
 */
import { randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";

const db = prisma as any;

function fail(code: string, message: string, status = 400, details?: unknown): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function parseCsv(csvText: string): Array<Record<string, string>> {
  const lines = String(csvText || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function dec(v: unknown): Decimal {
  try {
    return new Decimal(String(v ?? 0));
  } catch {
    return new Decimal(0);
  }
}

function mapRow(raw: Record<string, string>, columnMap: Record<string, string>) {
  const get = (logical: string) => {
    const col = (columnMap[logical] || logical).toLowerCase();
    return raw[col] ?? raw[logical.toLowerCase()] ?? "";
  };
  return {
    instrumentSymbol: String(get("instrumentSymbol") || get("symbol") || "").toUpperCase(),
    side: String(get("side") || "").toUpperCase(),
    quantity: get("quantity"),
    price: get("price"),
    tradeDate: get("tradeDate") || get("trade_date"),
    externalRef: get("externalRef") || get("broker_ref") || get("custodian_ref"),
    currencyCode: String(get("currencyCode") || get("currency") || "USD").toUpperCase(),
  };
}

function serializeException(e: any) {
  if (!e) return e;
  return {
    ...e,
    internalQuantity: e.internalQuantity != null ? String(e.internalQuantity) : null,
    brokerQuantity: e.brokerQuantity != null ? String(e.brokerQuantity) : null,
    custodianQuantity: e.custodianQuantity != null ? String(e.custodianQuantity) : null,
    price: e.price != null ? String(e.price) : null,
    tradeDate: e.tradeDate
      ? e.tradeDate instanceof Date
        ? e.tradeDate.toISOString().slice(0, 10)
        : String(e.tradeDate).slice(0, 10)
      : null,
  };
}

function matchKey(symbol: string, side: string, tradeDate: string | null) {
  return `${symbol}|${side}|${tradeDate || ""}`;
}

export class InvestmentTradeReconService {
  static async listTemplates() {
    const rows = await db.investmentTradeReconTemplate.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });
    return rows.map((r: any) => ({
      ...r,
      columnMap: r.columnMapJson,
      demoFiles: {
        happy: `/demo-templates/trade-recon/${r.party.toLowerCase()}-happy.csv`,
        qtyMismatch: `/demo-templates/trade-recon/${r.party.toLowerCase()}-qty-mismatch.csv`,
        missing: `/demo-templates/trade-recon/${r.party.toLowerCase()}-missing.csv`,
      },
    }));
  }

  static async createBatch(
    data: { fundId: string; asOfDate: string; brokerTemplateCode?: string; custodianTemplateCode?: string },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, data.fundId, user);
    if (idempotencyKey) {
      const replay = await db.investmentTradeReconBatch.findUnique({ where: { idempotencyKey } });
      if (replay) return replay;
    }
    return db.investmentTradeReconBatch.create({
      data: {
        id: `trb_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
        fundId: data.fundId,
        asOfDate: new Date(data.asOfDate),
        status: "OPEN",
        brokerTemplateCode: data.brokerTemplateCode || "BROKER_ZSE_CSV_V1",
        custodianTemplateCode: data.custodianTemplateCode || "CUSTODIAN_CSD_CSV_V1",
        idempotencyKey: idempotencyKey || null,
        createdById: userId,
      },
    });
  }

  static async getBatch(batchId: string, userId: string, user: any) {
    const batch = await db.investmentTradeReconBatch.findUnique({
      where: { id: batchId },
      include: {
        lines: { orderBy: [{ source: "asc" }, { lineNo: "asc" }] },
        exceptions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!batch) fail("TRADE_RECON_BATCH_NOT_FOUND", "Batch not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, batch.fundId, user);
    return {
      ...batch,
      exceptions: batch.exceptions.map(serializeException),
      lines: batch.lines.map((l: any) => ({
        ...l,
        quantity: l.quantity != null ? String(l.quantity) : null,
        price: l.price != null ? String(l.price) : null,
      })),
    };
  }

  static async ingest(
    batchId: string,
    source: "BROKER" | "CUSTODIAN",
    csvText: string,
    templateCode: string | undefined,
    userId: string,
    user: any
  ) {
    const batch = await this.getBatch(batchId, userId, user);
    if (batch.status === "COMPLETED") fail("BATCH_COMPLETED", "Cannot ingest into completed batch", 422);

    const code =
      templateCode ||
      (source === "BROKER" ? batch.brokerTemplateCode : batch.custodianTemplateCode) ||
      (source === "BROKER" ? "BROKER_ZSE_CSV_V1" : "CUSTODIAN_CSD_CSV_V1");

    const template = await db.investmentTradeReconTemplate.findUnique({ where: { code } });
    const columnMap = (template?.columnMapJson || {
      instrumentSymbol: "symbol",
      side: "side",
      quantity: "quantity",
      price: "price",
      tradeDate: "trade_date",
      externalRef: source === "BROKER" ? "broker_ref" : "custodian_ref",
      currencyCode: "currency",
    }) as Record<string, string>;

    await db.investmentTradeReconLine.deleteMany({ where: { batchId, source } });

    const rows = parseCsv(csvText);
    const created = [];
    let lineNo = 0;
    for (const raw of rows) {
      lineNo += 1;
      const mapped = mapRow(raw, columnMap);
      if (!mapped.instrumentSymbol && !mapped.quantity) continue;
      const row = await db.investmentTradeReconLine.create({
        data: {
          id: `trl_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          batchId,
          source,
          lineNo,
          instrumentSymbol: mapped.instrumentSymbol || null,
          side: mapped.side || null,
          quantity: mapped.quantity ? dec(mapped.quantity) : null,
          price: mapped.price ? dec(mapped.price) : null,
          tradeDate: mapped.tradeDate ? new Date(mapped.tradeDate) : batch.asOfDate,
          externalRef: mapped.externalRef || null,
          currencyCode: mapped.currencyCode || null,
          rawJson: raw,
          matchStatus: "UNMATCHED",
        },
      });
      created.push(row);
    }

    if (source === "BROKER") {
      await db.investmentTradeReconBatch.update({
        where: { id: batchId },
        data: { brokerTemplateCode: code, status: "INGESTED" },
      });
    } else {
      await db.investmentTradeReconBatch.update({
        where: { id: batchId },
        data: { custodianTemplateCode: code, status: "INGESTED" },
      });
    }

    await InvestmentOpsAuditService.log(
      "TRADE_RECON_INGEST",
      "TradeReconBatch",
      batchId,
      { source, lineCount: created.length, templateCode: code },
      userId
    );

    return { batchId, source, lineCount: created.length, templateCode: code };
  }

  static async runMatch(batchId: string, userId: string, user: any) {
    const batch = await this.getBatch(batchId, userId, user);

    const asOf = batch.asOfDate instanceof Date ? batch.asOfDate : new Date(batch.asOfDate);
    const dayStart = new Date(asOf);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(asOf);
    dayEnd.setHours(23, 59, 59, 999);

    const internalTrades = await db.listedEquityTrade.findMany({
      where: {
        fundId: batch.fundId,
        status: { in: ["EXECUTED", "ROUTING", "SETTLED"] },
        OR: [
          { executedAt: { gte: dayStart, lte: dayEnd } },
          { createdAt: { gte: dayStart, lte: dayEnd } },
        ],
      },
      include: { security: true },
    });

    await db.investmentTradeReconException.deleteMany({ where: { batchId } });
    await db.investmentTradeReconLine.updateMany({
      where: { batchId },
      data: { matchStatus: "UNMATCHED", matchedTradeId: null },
    });

    const brokerLines = batch.lines.filter((l: any) => l.source === "BROKER");
    const custodianLines = batch.lines.filter((l: any) => l.source === "CUSTODIAN");

    const usedBroker = new Set<string>();
    const usedCustodian = new Set<string>();
    const usedInternal = new Set<string>();
    const exceptions: any[] = [];
    let matched = 0;

    // DUPLICATE: same source key appearing more than once in an ingest
    const flagDuplicates = (lines: any[], source: "BROKER" | "CUSTODIAN") => {
      const byKey = new Map<string, any[]>();
      for (const l of lines) {
        const key = [
          String(l.instrumentSymbol || "").toUpperCase(),
          String(l.side || "").toUpperCase(),
          l.tradeDate?.toISOString?.().slice(0, 10) || String(l.tradeDate || "").slice(0, 10),
          String(l.externalRef || ""),
          String(l.quantity ?? ""),
          String(l.price ?? ""),
        ].join("|");
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(l);
      }
      for (const group of byKey.values()) {
        if (group.length < 2) continue;
        for (const l of group) {
          if (source === "BROKER") usedBroker.add(l.id);
          else usedCustodian.add(l.id);
          exceptions.push({
            code: "DUPLICATE",
            instrumentSymbol: l.instrumentSymbol,
            side: l.side,
            brokerQuantity: source === "BROKER" ? l.quantity : null,
            custodianQuantity: source === "CUSTODIAN" ? l.quantity : null,
            brokerLineId: source === "BROKER" ? l.id : null,
            custodianLineId: source === "CUSTODIAN" ? l.id : null,
            price: l.price,
            tradeDate: l.tradeDate || asOf,
            message: `Duplicate ${source.toLowerCase()} statement line`,
          });
        }
      }
    };
    flagDuplicates(brokerLines, "BROKER");
    flagDuplicates(custodianLines, "CUSTODIAN");

    for (const trade of internalTrades) {
      const symbol = String(trade.security?.ticker || trade.security?.symbol || "").toUpperCase();
      const side = String(trade.side || "").toUpperCase();
      const tradeDate = (trade.executedAt || trade.createdAt || asOf).toISOString?.().slice(0, 10);
      const qty = dec(trade.quantity);
      const price = dec(trade.executionPrice);

      const broker = brokerLines.find(
        (l: any) =>
          !usedBroker.has(l.id) &&
          matchKey(String(l.instrumentSymbol || "").toUpperCase(), String(l.side || "").toUpperCase(), l.tradeDate?.toISOString?.().slice(0, 10) || String(l.tradeDate || "").slice(0, 10)) ===
            matchKey(symbol, side, tradeDate)
      );
      const custodian = custodianLines.find(
        (l: any) =>
          !usedCustodian.has(l.id) &&
          matchKey(String(l.instrumentSymbol || "").toUpperCase(), String(l.side || "").toUpperCase(), l.tradeDate?.toISOString?.().slice(0, 10) || String(l.tradeDate || "").slice(0, 10)) ===
            matchKey(symbol, side, tradeDate)
      );

      if (!broker && !custodian) {
        exceptions.push({
          code: "MISSING_BROKER",
          tradeId: trade.id,
          instrumentSymbol: symbol,
          side,
          internalQuantity: qty,
          price,
          tradeDate: asOf,
          message: "Internal blotter trade has no matching broker/custodian statement line",
        });
        usedInternal.add(trade.id);
        continue;
      }

      if (!broker) {
        exceptions.push({
          code: "MISSING_BROKER",
          tradeId: trade.id,
          instrumentSymbol: symbol,
          side,
          internalQuantity: qty,
          custodianQuantity: custodian ? dec(custodian.quantity) : null,
          custodianLineId: custodian?.id || null,
          price,
          tradeDate: asOf,
          message: "Missing broker statement line",
        });
        if (custodian) usedCustodian.add(custodian.id);
        usedInternal.add(trade.id);
        continue;
      }

      if (!custodian) {
        exceptions.push({
          code: "MISSING_CUSTODIAN",
          tradeId: trade.id,
          instrumentSymbol: symbol,
          side,
          internalQuantity: qty,
          brokerQuantity: dec(broker.quantity),
          brokerLineId: broker.id,
          price,
          tradeDate: asOf,
          message: "Missing custodian statement line",
        });
        usedBroker.add(broker.id);
        usedInternal.add(trade.id);
        continue;
      }

      const bQty = dec(broker.quantity);
      const cQty = dec(custodian.quantity);
      const bPrice = dec(broker.price);
      let code: string | null = null;
      if (!qty.eq(bQty) || !qty.eq(cQty)) code = "QTY_MISMATCH";
      else if (!price.eq(bPrice) && bPrice.gt(0)) code = "PRICE_MISMATCH";

      if (code) {
        exceptions.push({
          code,
          tradeId: trade.id,
          instrumentSymbol: symbol,
          side,
          internalQuantity: qty,
          brokerQuantity: bQty,
          custodianQuantity: cQty,
          brokerLineId: broker.id,
          custodianLineId: custodian.id,
          price,
          tradeDate: asOf,
          message: `${code}: internal ${qty} @ ${price} vs broker ${bQty} @ ${bPrice}`,
        });
      } else {
        matched += 1;
        await db.investmentTradeReconLine.update({
          where: { id: broker.id },
          data: { matchStatus: "MATCHED", matchedTradeId: trade.id },
        });
        await db.investmentTradeReconLine.update({
          where: { id: custodian.id },
          data: { matchStatus: "MATCHED", matchedTradeId: trade.id },
        });
      }
      usedBroker.add(broker.id);
      usedCustodian.add(custodian.id);
      usedInternal.add(trade.id);
    }

    for (const l of brokerLines) {
      if (usedBroker.has(l.id)) continue;
      exceptions.push({
        code: "MISSING_INTERNAL",
        instrumentSymbol: l.instrumentSymbol,
        side: l.side,
        brokerQuantity: l.quantity,
        brokerLineId: l.id,
        price: l.price,
        tradeDate: l.tradeDate || asOf,
        message: "Broker line has no matching internal blotter trade",
      });
    }
    for (const l of custodianLines) {
      if (usedCustodian.has(l.id)) continue;
      exceptions.push({
        code: "MISSING_INTERNAL",
        instrumentSymbol: l.instrumentSymbol,
        side: l.side,
        custodianQuantity: l.quantity,
        custodianLineId: l.id,
        price: l.price,
        tradeDate: l.tradeDate || asOf,
        message: "Custodian line has no matching internal blotter trade",
      });
    }

    for (const e of exceptions) {
      await db.investmentTradeReconException.create({
        data: {
          id: `tre_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          batchId,
          code: e.code,
          status: "OPEN",
          instrumentSymbol: e.instrumentSymbol || null,
          side: e.side || null,
          internalQuantity: e.internalQuantity ?? null,
          brokerQuantity: e.brokerQuantity ?? null,
          custodianQuantity: e.custodianQuantity ?? null,
          price: e.price ?? null,
          tradeDate: e.tradeDate || null,
          tradeId: e.tradeId || null,
          brokerLineId: e.brokerLineId || null,
          custodianLineId: e.custodianLineId || null,
          message: e.message || null,
        },
      });
    }

    await db.investmentTradeReconBatch.update({
      where: { id: batchId },
      data: {
        status: "MATCHED",
        matchedCount: matched,
        exceptionCount: exceptions.length,
      },
    });

    return this.getBatch(batchId, userId, user);
  }

  static async manualMatch(
    exceptionId: string,
    data: { tradeId?: string; brokerLineId?: string; custodianLineId?: string; reason?: string },
    userId: string,
    user: any
  ) {
    const exc = await db.investmentTradeReconException.findUnique({ where: { id: exceptionId } });
    if (!exc) fail("EXCEPTION_NOT_FOUND", "Exception not found", 404);
    const batch = await this.getBatch(exc.batchId, userId, user);
    if (exc.status !== "OPEN") fail("EXCEPTION_NOT_OPEN", "Exception is not open", 422);

    const tradeId = data.tradeId || exc.tradeId;
    if (data.brokerLineId) {
      await db.investmentTradeReconLine.update({
        where: { id: data.brokerLineId },
        data: { matchStatus: "MATCHED", matchedTradeId: tradeId || null },
      });
    }
    if (data.custodianLineId) {
      await db.investmentTradeReconLine.update({
        where: { id: data.custodianLineId },
        data: { matchStatus: "MATCHED", matchedTradeId: tradeId || null },
      });
    }

    const updated = await db.investmentTradeReconException.update({
      where: { id: exceptionId },
      data: {
        status: "MATCHED",
        tradeId: tradeId || null,
        brokerLineId: data.brokerLineId || exc.brokerLineId,
        custodianLineId: data.custodianLineId || exc.custodianLineId,
        resolutionReason: data.reason || "Manual match",
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });

    await db.investmentTradeReconBatch.update({
      where: { id: batch.id },
      data: {
        matchedCount: { increment: 1 },
        exceptionCount: { decrement: 1 },
      },
    });

    return serializeException(updated);
  }

  static async writeOff(exceptionId: string, reason: string, userId: string, user: any) {
    const exc = await db.investmentTradeReconException.findUnique({ where: { id: exceptionId } });
    if (!exc) fail("EXCEPTION_NOT_FOUND", "Exception not found", 404);
    await this.getBatch(exc.batchId, userId, user);
    if (!String(reason || "").trim()) fail("VALIDATION_ERROR", "reason is required", 422);
    const updated = await db.investmentTradeReconException.update({
      where: { id: exceptionId },
      data: {
        status: "WRITTEN_OFF",
        resolutionReason: reason,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });
    return serializeException(updated);
  }

  static async complete(batchId: string, userId: string, user: any) {
    const batch = await this.getBatch(batchId, userId, user);
    const open = await db.investmentTradeReconException.count({
      where: { batchId, status: "OPEN" },
    });
    if (open > 0) {
      fail("OPEN_EXCEPTIONS", "Resolve or write-off open exceptions before completing", 422, {
        openExceptionCount: open,
      });
    }
    return db.investmentTradeReconBatch.update({
      where: { id: batchId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  /** BA-TR-4 — blotter → recon handoff */
  static async tradeReconciliationSummary(tradeId: string, userId: string, user: any) {
    const trade = await db.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) fail("TRADE_NOT_FOUND", "Trade not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, trade.fundId, user);

    const brokerMatched = await db.investmentTradeReconLine.findFirst({
      where: { matchedTradeId: tradeId, source: "BROKER", matchStatus: "MATCHED" },
    });
    const custodianMatched = await db.investmentTradeReconLine.findFirst({
      where: { matchedTradeId: tradeId, source: "CUSTODIAN", matchStatus: "MATCHED" },
    });
    const openExceptions = await db.investmentTradeReconException.findMany({
      where: { tradeId, status: "OPEN" },
      select: { id: true, code: true },
    });

    return {
      tradeId,
      internalMatched: ["EXECUTED", "ROUTING", "SETTLED"].includes(trade.status),
      brokerStatementMatched: Boolean(brokerMatched),
      custodianMatched: Boolean(custodianMatched),
      openExceptionIds: openExceptions.map((e: any) => e.id),
      openExceptions,
      deepLink: `/investments-v2/reconciliation?tab=trade&tradeId=${tradeId}`,
    };
  }

  /** BA-RC-3 — read-only client/fund position breaks vs settled trades */
  static async clientAccountRecon(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    const positions = await db.listedEquityHolding.findMany({
      where: { fundId },
      include: { security: true },
    });

    const settled = await db.listedEquityTrade.findMany({
      where: { fundId, status: "SETTLED" },
      include: { security: true },
    });

    const expectedBySecurity: Record<string, Decimal> = {};
    for (const t of settled) {
      const sid = t.securityId;
      const qty = dec(t.quantity);
      const signed = String(t.side).toUpperCase() === "SELL" ? qty.neg() : qty;
      expectedBySecurity[sid] = (expectedBySecurity[sid] || new Decimal(0)).plus(signed);
    }

    const breaks = [];
    const bySec = new Map<string, any>();
    for (const p of positions) bySec.set(p.securityId, p);

    const securityIds = new Set([...Object.keys(expectedBySecurity), ...bySec.keys()]);
    for (const sid of securityIds) {
      const pos = bySec.get(sid);
      const actual = dec(pos?.quantity ?? 0);
      const expected = expectedBySecurity[sid] || new Decimal(0);
      if (!actual.eq(expected)) {
        breaks.push({
          securityId: sid,
          symbol:
            pos?.security?.ticker ||
            settled.find((t: any) => t.securityId === sid)?.security?.ticker ||
            null,
          positionQuantity: String(actual),
          expectedFromSettledTrades: String(expected),
          variance: String(actual.minus(expected)),
          status: "BREAK",
        });
      }
    }

    return {
      fundId,
      asOf: new Date().toISOString(),
      positionCount: positions.length,
      settledTradeCount: settled.length,
      breakCount: breaks.length,
      breaks,
    };
  }
}
