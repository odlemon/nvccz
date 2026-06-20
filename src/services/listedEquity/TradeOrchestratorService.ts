// @ts-nocheck
import { randomBytes } from "crypto";
import { prisma } from "../../utils/database";
import { ROUTING_TARGETS, RETRY_BACKOFF_MINUTES, MAX_ROUTING_ATTEMPTS } from "./listedEquityConstants";
import { ListedEquityAuditService } from "./ListedEquityAuditService";
import { StakeholderDispatchService } from "./StakeholderDispatchService";
import { CoreBankingBridgeService } from "./CoreBankingBridgeService";
import { ListedEquityGlPostingService } from "./ListedEquityGlPostingService";
import { ListedEquityHoldingsService } from "./ListedEquityHoldingsService";
import { isCustodianRoutingEnabled, isInternalSettlementMode } from "./listedEquityRoutingMode";

function tradeRef(): string {
  return `TXN-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.toUpperCase();
}

export class TradeOrchestratorService {
  static async createDraft(data: {
    fundId: string;
    securityId: string;
    side: string;
    quantity: number;
    executionPrice: number;
    executionCurrencyCode: string;
    fees?: number;
  }) {
    return prisma.listedEquityTrade.create({
      data: {
        tradeRef: tradeRef(),
        fundId: data.fundId,
        securityId: data.securityId,
        side: data.side.toUpperCase(),
        quantity: data.quantity,
        executionPrice: data.executionPrice,
        executionCurrencyCode: data.executionCurrencyCode,
        fees: data.fees ?? 0,
        status: "DRAFT",
      },
      include: { security: true, fund: true },
    });
  }

  static async execute(tradeId: string, userId: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await prisma.listedEquityTrade.findUnique({ where: { idempotencyKey } });
      if (existing && existing.id !== tradeId) {
        return this.getTradeDetail(existing.id);
      }
    }

    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) throw new Error("Trade not found");
    if (trade.status !== "DRAFT" && trade.status !== "EXECUTED" && trade.status !== "ROUTING") {
      throw new Error(`Cannot execute trade in status ${trade.status}`);
    }

    if (trade.status === "DRAFT") {
      await prisma.listedEquityTrade.update({
        where: { id: tradeId },
        data: {
          status: "EXECUTED",
          executedAt: new Date(),
          executedById: userId,
          idempotencyKey: idempotencyKey || trade.idempotencyKey,
        },
      });
      await ListedEquityAuditService.log("TRADE_EXECUTED", "ListedEquityTrade", tradeId, {
        fundId: trade.fundId,
        side: trade.side,
        quantity: Number(trade.quantity),
      }, userId);

      for (const target of ROUTING_TARGETS) {
        await prisma.listedEquityTradeRoutingHop.upsert({
          where: { tradeId_target: { tradeId, target } },
          create: { tradeId, target, status: "STAGED" },
          update: {},
        });
      }

      await prisma.listedEquityTrade.update({
        where: { id: tradeId },
        data: { status: "ROUTING" },
      });
    }

    await this.processRouting(tradeId, userId);
    return this.getTradeDetail(tradeId);
  }

  /** Internal mode: skip custodian dispatch; apply holdings so bank + GL can complete. */
  static async ensureCustodianSkipped(tradeId: string, userId?: string) {
    if (!isInternalSettlementMode()) return;

    const hop = await prisma.listedEquityTradeRoutingHop.findFirst({
      where: { tradeId, target: "CUSTODIAN" },
    });
    if (!hop || hop.status === "CONFIRMED") return;

    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) return;

    if (trade.side === "BUY") {
      await ListedEquityHoldingsService.recordBuy(tradeId);
    } else if (trade.side === "SELL") {
      await ListedEquityHoldingsService.recordSell(tradeId);
    }

    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hop.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        externalRef: "SKIPPED_INTERNAL",
        payloadRef: "custodian-routing-disabled",
      },
    });

    await ListedEquityAuditService.log(
      "ROUTING_HOP_SKIPPED",
      "ListedEquityTradeRoutingHop",
      hop.id,
      { target: "CUSTODIAN", reason: "internal-settlement-mode" },
      userId
    );
  }

  static async advanceCoreBankingHop(tradeId: string, hopId: string, trade: { side: string }) {
    const hop = await prisma.listedEquityTradeRoutingHop.findUnique({ where: { id: hopId } });
    if (!hop || hop.status === "CONFIRMED" || hop.status === "FAILED") return;

    if (isInternalSettlementMode()) {
      if (hop.status === "STAGED") {
        await CoreBankingBridgeService.placeHold(tradeId, hopId);
      }
      const refreshed = await prisma.listedEquityTradeRoutingHop.findUnique({ where: { id: hopId } });
      if (refreshed?.status === "DISPATCHED") {
        await CoreBankingBridgeService.releaseHold(tradeId, hopId);
      }
      return;
    }

    const custodian = await prisma.listedEquityTradeRoutingHop.findFirst({
      where: { tradeId, target: "CUSTODIAN" },
    });
    const custodianReady =
      custodian?.status === "CONFIRMED" || process.env.LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER === "true";

    if (trade.side === "BUY" && !custodianReady) {
      if (hop.status === "STAGED") await CoreBankingBridgeService.placeHold(tradeId, hopId);
      return;
    }

    if (hop.status === "STAGED") {
      await CoreBankingBridgeService.placeHold(tradeId, hopId);
    } else if (hop.status === "DISPATCHED") {
      await CoreBankingBridgeService.releaseHold(tradeId, hopId);
    }
  }

  static async processRouting(tradeId: string, userId: string) {
    await this.ensureCustodianSkipped(tradeId, userId);

    const hops = await prisma.listedEquityTradeRoutingHop.findMany({
      where: { tradeId },
      orderBy: { createdAt: "asc" },
    });
    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) return;

    for (const hop of hops) {
      if (hop.status === "CONFIRMED" || hop.status === "FAILED") continue;

      try {
        if (hop.target === "BROKER" && hop.status === "STAGED") {
          await StakeholderDispatchService.dispatchBroker(tradeId, hop.id);
        } else if (
          hop.target === "CUSTODIAN" &&
          isCustodianRoutingEnabled() &&
          ["STAGED", "DISPATCHED"].includes(hop.status)
        ) {
          const broker = hops.find((h) => h.target === "BROKER");
          if (broker?.status !== "CONFIRMED" && process.env.LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER !== "true") {
            continue;
          }
          if (hop.status === "STAGED") {
            await StakeholderDispatchService.dispatchCustodian(tradeId, hop.id);
          }
        } else if (hop.target === "CORE_BANKING") {
          await this.advanceCoreBankingHop(tradeId, hop.id, trade);
        } else if (hop.target === "ACCOUNTING_GL") {
          if (hop.status === "CONFIRMED") continue;
          const custodian = await prisma.listedEquityTradeRoutingHop.findFirst({
            where: { tradeId, target: "CUSTODIAN" },
          });
          const bank = await prisma.listedEquityTradeRoutingHop.findFirst({
            where: { tradeId, target: "CORE_BANKING" },
          });
          const settlement = await prisma.listedEquityTradeSettlement.findUnique({ where: { tradeId } });
          if (settlement?.journalEntryId) {
            await ListedEquityGlPostingService.completeSettlement(
              tradeId,
              hop.id,
              settlement.journalEntryId,
              settlement.realizedPnl != null ? Number(settlement.realizedPnl) : null
            );
            continue;
          }
          const settlementReady =
            isInternalSettlementMode() || custodian?.status === "CONFIRMED";
          if (settlementReady && (bank?.status === "CONFIRMED" || trade.side === "SELL")) {
            await ListedEquityGlPostingService.postSettlement(tradeId, hop.id, userId);
          }
        }
      } catch (e: any) {
        await this.scheduleRetry(hop.id, e.message);
      }
    }

    await this.reconcileTradeSettlementState(tradeId);
  }

  /** Repair hop/trade status drift (e.g. cron reset DISPATCHED → STAGED while confirmedAt remains). */
  static async reconcileTradeSettlementState(tradeId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { routingHops: true, settlement: true },
    });
    if (!trade || trade.status === "CANCELLED") return;

    for (const hop of trade.routingHops) {
      if (hop.confirmedAt && hop.status !== "CONFIRMED" && hop.status !== "FAILED") {
        await prisma.listedEquityTradeRoutingHop.update({
          where: { id: hop.id },
          data: { status: "CONFIRMED" },
        });
      }
    }

    const hops = await prisma.listedEquityTradeRoutingHop.findMany({ where: { tradeId } });
    const glHop = hops.find((h) => h.target === "ACCOUNTING_GL");
    const allConfirmed = hops.length > 0 && hops.every((h) => h.status === "CONFIRMED");
    const glPosted = Boolean(trade.settlement?.journalEntryId && glHop?.status === "CONFIRMED");

    if (allConfirmed || glPosted) {
      await prisma.listedEquityTrade.update({
        where: { id: tradeId },
        data: {
          status: "SETTLED",
          settledAt: trade.settledAt ?? new Date(),
        },
      });
    }
  }

  static async confirmHop(hopId: string, userId?: string, externalRef?: string) {
    const hopBefore = await prisma.listedEquityTradeRoutingHop.findUnique({
      where: { id: hopId },
      include: { trade: true },
    });
    if (!hopBefore) throw new Error("Hop not found");

    let hop = hopBefore;
    if (hopBefore.target === "BROKER" || hopBefore.target === "CUSTODIAN") {
      hop = await StakeholderDispatchService.confirmHop(hopId, externalRef, userId);
    } else if (hopBefore.target === "CORE_BANKING") {
      if (hopBefore.status === "STAGED") {
        await CoreBankingBridgeService.placeHold(hopBefore.tradeId, hopId);
      }
      await CoreBankingBridgeService.releaseHold(hopBefore.tradeId, hopId);
      hop = await prisma.listedEquityTradeRoutingHop.findUnique({
        where: { id: hopId },
        include: { trade: true },
      });
    } else if (hopBefore.target === "ACCOUNTING_GL") {
      await ListedEquityGlPostingService.postSettlement(
        hopBefore.tradeId,
        hopId,
        userId || hopBefore.trade.executedById || ""
      );
      hop = await prisma.listedEquityTradeRoutingHop.findUnique({
        where: { id: hopId },
        include: { trade: true },
      });
    }

    await this.processRouting(hop!.tradeId, userId || hop!.trade.executedById || "");
    return hop;
  }

  static async scheduleRetry(hopId: string, error: string) {
    const hop = await prisma.listedEquityTradeRoutingHop.findUnique({ where: { id: hopId } });
    if (!hop) return;
    const attempt = hop.attemptCount + 1;
    if (attempt >= MAX_ROUTING_ATTEMPTS) {
      await prisma.listedEquityTradeRoutingHop.update({
        where: { id: hopId },
        data: { status: "FAILED", lastError: error, attemptCount: attempt },
      });
      await prisma.listedEquityTrade.update({
        where: { id: hop.tradeId },
        data: { status: "SETTLEMENT_FAILED" },
      });
      await ListedEquityAuditService.log("ROUTING_HOP_FAILED", "ListedEquityTradeRoutingHop", hopId, {
        error,
        attemptCount: attempt,
      });
      return;
    }
    const minutes = RETRY_BACKOFF_MINUTES[Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];
    const nextRetryAt = new Date(Date.now() + minutes * 60_000);
    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: {
        status: "RETRYING",
        lastError: error,
        attemptCount: attempt,
        nextRetryAt,
      },
    });
  }

  static async retryHop(hopId: string, userId: string) {
    const hop = await prisma.listedEquityTradeRoutingHop.findUnique({ where: { id: hopId } });
    if (!hop) throw new Error("Hop not found");
    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: { status: "STAGED", nextRetryAt: null },
    });
    await this.processRouting(hop.tradeId, userId);
    return this.getTradeDetail(hop.tradeId);
  }

  static async checkAllConfirmed(tradeId: string) {
    await this.reconcileTradeSettlementState(tradeId);
  }

  static async getTradeDetail(tradeId: string) {
    return prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: {
        security: true,
        fund: true,
        routingHops: { orderBy: { createdAt: "asc" } },
        settlement: true,
        cashHolds: true,
      },
    });
  }

  static async listTrades(filters: { fundId?: string; status?: string; fundScope?: string[] | "ALL" }) {
    const where: any = {};
    if (filters.fundId) where.fundId = filters.fundId;
    if (filters.status) where.status = filters.status;
    if (filters.fundScope && filters.fundScope !== "ALL") {
      where.fundId = { in: filters.fundScope };
    }
    return prisma.listedEquityTrade.findMany({
      where,
      include: { security: true, routingHops: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  static async cancel(tradeId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) throw new Error("Trade not found");
    if (["SETTLED", "SETTLEMENT_FAILED"].includes(trade.status)) {
      throw new Error("Cannot cancel settled trade");
    }
    return prisma.listedEquityTrade.update({
      where: { id: tradeId },
      data: { status: "CANCELLED" },
    });
  }
}
