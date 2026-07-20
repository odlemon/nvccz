// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { createHash } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { orderRef, paginatedResult } from "./investmentOpsSupport";

const db = prisma as any;

function contentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class InvestmentModelPortfolioService {
  static async list() {
    const rows = await prisma.investmentModelPortfolio.findMany({
      where: { isActive: true },
      include: { allocations: true },
    });
    return paginatedResult(rows, rows.length, 1, rows.length || 50);
  }

  static async create(data: {
    name: string;
    strategyCode?: string;
    baseCurrencyCode?: string;
    linkedFundId?: string;
    allocations?: Array<{ allocationType: string; allocationKey: string; targetWeightPct: number }>;
  }) {
    const model = await prisma.investmentModelPortfolio.create({
      data: {
        name: data.name,
        strategyCode: data.strategyCode,
        baseCurrencyCode: data.baseCurrencyCode || "USD",
        linkedFundId: data.linkedFundId || null,
      },
    });
    if (data.allocations?.length) {
      await prisma.investmentModelPortfolioAllocation.createMany({
        data: data.allocations.map((a) => ({
          modelPortfolioId: model.id,
          allocationType: a.allocationType,
          allocationKey: a.allocationKey,
          targetWeightPct: a.targetWeightPct,
        })),
      });
    }
    return prisma.investmentModelPortfolio.findUnique({
      where: { id: model.id },
      include: { allocations: true },
    });
  }

  static async get(id: string) {
    const model = await db.investmentModelPortfolio.findUnique({
      where: { id },
      include: {
        allocations: true,
        versions: { include: { allocations: true }, orderBy: { versionNo: "desc" } },
      },
    });
    if (!model) throw new InvestmentOpsError("MODEL_PORTFOLIO_NOT_FOUND", "Model portfolio not found", 404);
    return model;
  }

  static async update(id: string, data: any, expectedVersion: string, userId: string) {
    const model = await this.get(id);
    if (String(model.currentVersionNo) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Model portfolio changed", 409);
    }
    const allocations = Array.isArray(data.allocations) ? data.allocations : model.allocations;
    const total = allocations.reduce((sum: Decimal, item: any) => sum.plus(item.targetWeightPct), new Decimal(0));
    if (!total.eq(100)) {
      throw new InvestmentOpsError("INVALID_MODEL_WEIGHTS", "Target weights must total exactly 100", 400);
    }
    const versionNo = model.currentVersionNo + 1;
    const snapshot = allocations.map((item: any) => ({
      allocationType: item.allocationType,
      allocationKey: item.allocationKey,
      targetWeightPct: String(item.targetWeightPct),
      minWeightPct: item.minWeightPct == null ? null : String(item.minWeightPct),
      maxWeightPct: item.maxWeightPct == null ? null : String(item.maxWeightPct),
    }));
    await db.$transaction(async (tx: any) => {
      await tx.investmentModelPortfolio.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.strategyCode !== undefined ? { strategyCode: data.strategyCode } : {}),
          ...(data.baseCurrencyCode !== undefined ? { baseCurrencyCode: data.baseCurrencyCode } : {}),
          ...(data.linkedFundId !== undefined ? { linkedFundId: data.linkedFundId || null } : {}),
          currentVersionNo: versionNo,
        },
      });
      const version = await tx.investmentModelPortfolioVersion.create({
        data: {
          modelPortfolioId: id,
          versionNo,
          status: "DRAFT",
          changeReason: data.changeReason,
          contentHash: contentHash(snapshot),
          createdById: userId,
        },
      });
      await tx.investmentModelPortfolioVersionAllocation.createMany({
        data: snapshot.map((item: any) => ({ modelPortfolioVersionId: version.id, ...item })),
      });
      await tx.investmentModelPortfolioAllocation.deleteMany({ where: { modelPortfolioId: id } });
      await tx.investmentModelPortfolioAllocation.createMany({
        data: snapshot.map((item: any) => ({
          modelPortfolioId: id,
          allocationType: item.allocationType,
          allocationKey: item.allocationKey,
          targetWeightPct: item.targetWeightPct,
        })),
      });
    });
    return this.get(id);
  }

  static async activate(id: string, expectedVersion: string, userId: string) {
    const model = await this.get(id);
    if (String(model.currentVersionNo) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Model portfolio changed", 409);
    }
    let version = model.versions.find((item: any) => item.versionNo === model.currentVersionNo);
    if (!version) {
      const snapshot = model.allocations.map((item: any) => ({
        allocationType: item.allocationType,
        allocationKey: item.allocationKey,
        targetWeightPct: String(item.targetWeightPct),
      }));
      version = await db.investmentModelPortfolioVersion.create({
        data: {
          modelPortfolioId: id,
          versionNo: model.currentVersionNo,
          status: "DRAFT",
          contentHash: contentHash(snapshot),
          createdById: userId,
          allocations: { create: snapshot },
        },
      });
    }
    await db.$transaction([
      db.investmentModelPortfolioVersion.updateMany({
        where: { modelPortfolioId: id, status: "ACTIVE" },
        data: { status: "ARCHIVED" },
      }),
      db.investmentModelPortfolioVersion.update({
        where: { id: version.id },
        data: { status: "ACTIVE", effectiveFrom: new Date(), approvedById: userId, approvedAt: new Date() },
      }),
      db.investmentModelPortfolio.update({ where: { id }, data: { isActive: true } }),
    ]);
    return this.get(id);
  }

  static async archive(id: string, expectedVersion: string) {
    const model = await this.get(id);
    if (String(model.currentVersionNo) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Model portfolio changed", 409);
    }
    await db.$transaction([
      db.investmentModelPortfolio.update({ where: { id }, data: { isActive: false } }),
      db.investmentModelPortfolioVersion.updateMany({
        where: { modelPortfolioId: id, status: { not: "ARCHIVED" } },
        data: { status: "ARCHIVED" },
      }),
    ]);
    return this.get(id);
  }

  static async drift(modelId: string, fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const model = await prisma.investmentModelPortfolio.findUnique({
      where: { id: modelId },
      include: { allocations: true },
    });
    if (!model) throw new Error("Model not found");

    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const totalMv = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0) || 1;

    const liveWeights: Record<string, number> = {};
    for (const h of holdings) {
      const key = h.security?.exchangeCode ?? "EQUITY";
      liveWeights[key] = (liveWeights[key] || 0) + ((h.marketValue ?? 0) / totalMv) * 100;
    }

    const drift = model.allocations.map((a) => {
      const target = Number(a.targetWeightPct);
      const live =
        a.allocationType === "EXCHANGE"
          ? liveWeights[a.allocationKey] ?? 0
          : a.allocationType === "ASSET_CLASS" && a.allocationKey === "EQUITY"
            ? 100
            : 0;
      return {
        allocationType: a.allocationType,
        key: a.allocationKey,
        targetWeightPct: target,
        liveWeightPct: live,
        driftPct: live - target,
        rebalanceAction: live > target ? "REDUCE" : live < target ? "INCREASE" : "HOLD",
      };
    });

    return { model, fundId, drift, recommendations: drift.filter((d) => Math.abs(d.driftPct) > 2) };
  }

  static async recommend(
    modelId: string,
    fundId: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const replay = await db.investmentRebalanceRun.findUnique({ where: { idempotencyKey } });
    if (replay) return db.investmentRebalanceRun.findUnique({ where: { id: replay.id }, include: { items: true } });
    const detail = await this.drift(modelId, fundId, userId, user);
    const version = await db.investmentModelPortfolioVersion.findFirst({
      where: { modelPortfolioId: modelId, status: "ACTIVE" },
      orderBy: { versionNo: "desc" },
    });
    if (!version) throw new InvestmentOpsError("MODEL_NOT_ACTIVE", "Activate a model version before rebalancing", 409);
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const byKey = new Map(holdings.map((holding: any) => [holding.security?.exchangeCode, holding]));
    return db.$transaction(async (tx: any) => {
      const run = await tx.investmentRebalanceRun.create({
        data: {
          fundId,
          modelPortfolioId: modelId,
          modelPortfolioVersionId: version.id,
          asOf: new Date(),
          inputSnapshotJson: {
            modelVersionId: version.id,
            holdings: holdings.map((holding: any) => ({
              holdingId: holding.id,
              quantity: String(holding.quantity),
              marketValue: holding.marketValue == null ? null : String(holding.marketValue),
            })),
          },
          summaryJson: { recommendationCount: detail.recommendations.length },
          idempotencyKey,
          createdById: userId,
        },
      });
      for (const item of detail.recommendations) {
        const holding: any = byKey.get(item.key);
        const amount = holding?.marketValue
          ? new Decimal(holding.marketValue).mul(Math.abs(item.driftPct)).div(Math.max(item.liveWeightPct, 1))
          : null;
        const quantity = amount && holding?.currentPrice ? amount.div(holding.currentPrice) : null;
        const instrument = holding?.securityId
          ? await tx.investmentInstrument.findFirst({
              where: { listedEquitySecurityId: holding.securityId, status: "APPROVED" },
            })
          : null;
        await tx.investmentRebalanceItem.create({
          data: {
            rebalanceRunId: run.id,
            instrumentId: instrument?.id || null,
            allocationKey: item.key,
            currentWeightPct: item.liveWeightPct,
            targetWeightPct: item.targetWeightPct,
            deltaWeightPct: -item.driftPct,
            proposedQuantity: quantity,
            proposedAmount: amount,
            action: item.rebalanceAction === "REDUCE" ? "SELL" : "BUY",
            rationaleJson: {
              driftThresholdPct: "2",
              sourceHoldingId: holding?.id || null,
              securityId: holding?.securityId || null,
              tradeCurrency: instrument?.listingCurrencyCode || holding?.wacCurrencyCode || null,
            },
          },
        });
      }
      return tx.investmentRebalanceRun.findUnique({ where: { id: run.id }, include: { items: true } });
    });
  }

  static async convertToDraftOrders(
    runId: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const run = await db.investmentRebalanceRun.findUnique({ where: { id: runId }, include: { items: true } });
    if (!run) throw new InvestmentOpsError("REBALANCE_RUN_NOT_FOUND", "Rebalance run not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, run.fundId, user);
    if (run.status !== "DRAFT") throw new InvestmentOpsError("REBALANCE_ALREADY_CONVERTED", "Run is not draft", 409);
    const created = [];
    const skipped = [];
    for (const item of run.items) {
      const rationale = (item.rationaleJson || {}) as any;
      let instrument = item.instrumentId
        ? await db.investmentInstrument.findUnique({ where: { id: item.instrumentId } })
        : null;
      const securityId = instrument?.listedEquitySecurityId || rationale.securityId || null;
      if (!instrument && securityId) {
        instrument = await db.investmentInstrument.findFirst({
          where: { listedEquitySecurityId: securityId, status: "APPROVED" },
        });
      }
      const tradeCurrency = instrument?.listingCurrencyCode || rationale.tradeCurrency || null;
      if (!item.proposedQuantity || new Decimal(item.proposedQuantity).lte(0) || !securityId || !tradeCurrency) {
        skipped.push({
          rebalanceItemId: item.id,
          allocationKey: item.allocationKey,
          reason: "MISSING_PERSISTED_SECURITY_OR_QUANTITY",
        });
        continue;
      }
      const order = await db.investmentOrder.create({
        data: {
          orderRef: orderRef(),
          idempotencyKey: `${idempotencyKey}:${item.id}`,
          fundId: run.fundId,
          instrumentId: instrument?.id || item.instrumentId || null,
          securityId,
          side: item.action,
          quantity: item.proposedQuantity,
          orderType: "MARKET",
          tradeCurrency,
          status: "DRAFT",
          createdById: userId,
          revisions: {
            create: {
              revisionNo: 1,
              snapshotJson: {
                source: "MODEL_REBALANCE",
                rebalanceRunId: run.id,
                rebalanceItemId: item.id,
                proposedQuantity: item.proposedQuantity.toString(),
                securityId,
              },
              contentHash: contentHash({
                runId: run.id,
                itemId: item.id,
                quantity: item.proposedQuantity.toString(),
                securityId,
              }),
              createdById: userId,
            },
          },
        },
      });
      await db.investmentRebalanceItem.update({
        where: { id: item.id },
        data: { generatedOrderId: order.id, instrumentId: instrument?.id || item.instrumentId || null },
      });
      created.push(order);
    }
    if (run.items.length > 0 && created.length === 0) {
      throw new InvestmentOpsError(
        "REBALANCE_CONVERSION_EMPTY",
        "No draft orders could be created from persisted rebalance recommendations",
        422,
        { skipped }
      );
    }
    await db.investmentRebalanceRun.update({
      where: { id: run.id },
      data: {
        status: "CONVERTED",
        version: { increment: 1 },
        summaryJson: { ...(run.summaryJson || {}), skipped, convertedCount: created.length },
      },
    });
    return { runId, orders: created, skipped };
  }
}
