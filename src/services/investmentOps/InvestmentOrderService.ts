// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { TradeOrchestratorService } from "../listedEquity/TradeOrchestratorService";
import { InvestmentComplianceService } from "./InvestmentComplianceService";
import { InvestmentAccountingFacadeService } from "./InvestmentAccountingFacadeService";
import { InvestmentInstrumentService } from "./InvestmentInstrumentService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { assertFourEyeApproval } from "./investmentOpsFourEye";
import { orderRef, paginatedResult, parsePagination } from "./investmentOpsSupport";

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "COMPLIANCE_REVIEW", "CANCELLED"],
  SUBMITTED: ["COMPLIANCE_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  COMPLIANCE_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SENT_TO_BROKER", "CANCELLED"],
  SENT_TO_BROKER: ["PARTIALLY_EXECUTED", "EXECUTED", "PENDING_SETTLEMENT", "CANCELLED", "FAILED"],
  PARTIALLY_EXECUTED: ["EXECUTED", "PENDING_SETTLEMENT", "CANCELLED", "FAILED"],
  EXECUTED: ["PENDING_SETTLEMENT", "SETTLED", "FAILED"],
  PENDING_SETTLEMENT: ["SETTLED", "FAILED"],
  SETTLED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  FAILED: ["ARCHIVED"],
};

export class InvestmentOrderService {
  static async list(
    userId: string,
    user: any,
    filters: { status?: string; fundId?: string; page?: number; pageSize?: number }
  ) {
    const where: any = await ListedEquityAccessService.accessibleFundIdFilter(
      userId,
      user,
      filters.fundId
    );
    if (filters.status) where.status = filters.status;

    const { page, pageSize, skip, take } = parsePagination(filters);
    const [rows, total] = await Promise.all([
      prisma.investmentOrder.findMany({
        where,
        include: { instrument: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.investmentOrder.count({ where }),
    ]);
    return paginatedResult(rows, total, page, pageSize);
  }

  static async assertOrderAccess(id: string, userId: string, user: any) {
    return ListedEquityAccessService.assertObjectFundAccess(
      userId,
      user,
      "Order",
      id,
      async () =>
        (await prisma.investmentOrder.findUnique({
          where: { id },
          select: { fundId: true },
        }))?.fundId
    );
  }

  static async get(id: string, userId: string, user: any) {
    await this.assertOrderAccess(id, userId, user);
    return prisma.investmentOrder.findUnique({
      where: { id },
      include: { instrument: true, approvals: true, complianceResults: true },
    });
  }

  static async preview(data: Record<string, unknown>, userId: string, user: any) {
    const fundId = data.fundId as string;
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    let instrument = null;
    if (data.instrumentId) {
      instrument = await InvestmentInstrumentService.get(data.instrumentId as string);
      if (instrument && !["ACTIVE", "APPROVED"].includes(instrument.status)) {
        return {
          blocked: true,
          blockReason: `Instrument ${instrument.instrumentCode} is not approved (status: ${instrument.status})`,
        };
      }
    }

    const qty = Number(data.quantity);
    const price = Number(data.executionPrice || data.limitPrice || 0);
    const grossConsideration = qty * price;

    let commissionBps = 0;
    if (data.brokerProfileId) {
      const comm = await prisma.investmentBrokerCommission.findFirst({
        where: {
          stakeholderProfileId: data.brokerProfileId as string,
          isActive: true,
          OR: [
            { instrumentTypeCode: instrument?.instrumentTypeCode },
            { instrumentTypeCode: null },
          ],
        },
        orderBy: { instrumentTypeCode: "desc" },
      });
      if (comm) commissionBps = Number(comm.rateBps);
    }
    const fees = grossConsideration * (commissionBps / 10000);
    const taxes = 0;
    const settlementAmount = grossConsideration + fees + taxes;

    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId },
      orderBy: { asOf: "desc" },
    });
    const nav = snap ? Number(snap.navBaseCurrency) : 0;
    const weightAfterPct = nav > 0 ? (settlementAmount / nav) * 100 : 0;

    const cashImpact = data.side === "BUY" ? -settlementAmount : settlementAmount;
    return {
      grossConsideration,
      fees,
      taxes,
      settlementAmount,
      portfolioWeightAfterPct: weightAfterPct,
      cashImpact,
      nav,
      instrumentStatus: instrument?.status ?? null,
      compliancePreview: await InvestmentComplianceService.previewCheck({
        fundId,
        side: String(data.side).toUpperCase(),
        orderValue: settlementAmount,
        instrument,
      }),
    };
  }

  static async create(data: Record<string, unknown>, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, data.fundId as string, user);
    if (data.instrumentId) {
      await InvestmentInstrumentService.assertApprovedForTrade(data.instrumentId as string);
    }
    let securityId = data.securityId as string | undefined;
    if (!securityId && data.instrumentId) {
      const inst = await prisma.investmentInstrument.findUnique({
        where: { id: data.instrumentId as string },
      });
      securityId = inst?.listedEquitySecurityId ?? undefined;
    }
    const order = await prisma.investmentOrder.create({
      data: {
        orderRef: orderRef(),
        fundId: data.fundId as string,
        instrumentId: data.instrumentId as string | undefined,
        securityId,
        side: String(data.side).toUpperCase(),
        quantity: Number(data.quantity),
        orderType: (data.orderType as string) || "MARKET",
        limitPrice: data.limitPrice != null ? Number(data.limitPrice) : undefined,
        executionPrice: data.executionPrice != null ? Number(data.executionPrice) : undefined,
        tradeCurrency: (data.tradeCurrency as string) || "USD",
        settlementCurrency: data.settlementCurrency as string | undefined,
        brokerProfileId: data.brokerProfileId as string | undefined,
        custodianProfileId: data.custodianProfileId as string | undefined,
        valueDate: data.valueDate ? new Date(data.valueDate as string) : undefined,
        tradeDate: data.tradeDate ? new Date(data.tradeDate as string) : undefined,
        notes: data.notes as string | undefined,
        status: "DRAFT",
        createdById: userId,
      },
      include: { instrument: true },
    });
    await InvestmentOpsAuditService.log("ORDER_CREATED", "Order", order.id, { orderRef: order.orderRef }, userId);
    return order;
  }

  static assertTransition(oldStatus: string, newStatus: string) {
    const allowed = VALID_TRANSITIONS[oldStatus];
    if (!allowed?.includes(newStatus)) {
      throw new Error(`Invalid transition ${oldStatus} → ${newStatus}`);
    }
  }

  static async transition(
    id: string,
    userId: string,
    newStatus: string,
    approvalType: string,
    reason?: string,
    user?: any
  ) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    const oldStatus = order.status;
    this.assertTransition(oldStatus, newStatus);

    const latestApproval = await prisma.investmentOrderApproval.findFirst({
      where: { orderId: id },
      orderBy: [{ revisionNo: "desc" }, { approvalSequence: "desc" }],
    });
    const revisionNo = order.currentRevisionNo || 1;
    const approvalSequence = latestApproval
      ? latestApproval.revisionNo === revisionNo
        ? latestApproval.approvalSequence + 1
        : 1
      : 1;

    const updated = await prisma.investmentOrder.update({
      where: { id },
      data: {
        status: newStatus,
        submittedAt: newStatus === "SUBMITTED" ? new Date() : order.submittedAt,
        approvedAt: newStatus === "APPROVED" ? new Date() : order.approvedAt,
      },
    });
    await prisma.investmentOrderApproval.create({
      data: {
        orderId: id,
        approvalType,
        status: "RECORDED",
        approverId: userId,
        reason,
        oldStatus,
        newStatus,
        approvalSequence,
        revisionNo,
        idempotencyKey: `order-transition:${id}:${oldStatus}:${newStatus}:${approvalSequence}:${revisionNo}`,
      },
    });
    await InvestmentOpsAuditService.log(
      "ORDER_STATUS_CHANGED",
      "Order",
      id,
      { oldStatus, newStatus, approvalType, reason },
      userId
    );
    return updated;
  }

  static async submit(id: string, userId: string, user: any) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id }, include: { instrument: true } });
    if (!order) throw new Error("Order not found");
    if (order.instrumentId) {
      await InvestmentInstrumentService.assertApprovedForTrade(order.instrumentId);
    }
    const check = await InvestmentComplianceService.checkOrder(id, userId, user);
    if (check.outcome === "FAILED" || check.outcome === "REQUIRES_OVERRIDE") {
      await prisma.investmentOrder.update({
        where: { id },
        data: { complianceStatus: check.outcome, status: "COMPLIANCE_REVIEW" },
      });
      await InvestmentOpsAuditService.log("ORDER_COMPLIANCE_FAILED", "Order", id, check, userId);
      throw new Error(`Compliance failed: ${check.message}`);
    }
    await prisma.investmentOrder.update({
      where: { id },
      data: { complianceStatus: check.outcome },
    });
    if (check.outcome === "WARNING") {
      await this.transition(id, userId, "COMPLIANCE_REVIEW", "SUBMIT_WITH_WARNING", undefined, user);
    } else {
      await this.transition(id, userId, "SUBMITTED", "SUBMIT", undefined, user);
    }
    return this.get(id, userId, user);
  }

  static async approve(id: string, userId: string, user: any) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    await assertFourEyeApproval(order, userId, user);
    if (!["SUBMITTED", "COMPLIANCE_REVIEW"].includes(order.status)) {
      throw new Error(`Cannot approve order in status ${order.status}`);
    }
    return this.transition(id, userId, "APPROVED", "COMPLIANCE_APPROVE", undefined, user);
  }

  static async sendToBroker(id: string, userId: string, user: any) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    if (order.status !== "APPROVED") throw new Error(`Cannot send to broker from status ${order.status}`);
    return this.transition(id, userId, "SENT_TO_BROKER", "SEND_TO_BROKER", undefined, user);
  }

  static async reject(id: string, userId: string, reason: string, user: any) {
    return this.transition(id, userId, "REJECTED", "REJECT", reason, user);
  }

  static async cancel(id: string, userId: string, reason?: string, user?: any) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    const cancellable = [
      "DRAFT",
      "SUBMITTED",
      "COMPLIANCE_REVIEW",
      "APPROVED",
      "SENT_TO_BROKER",
      "PARTIALLY_EXECUTED",
    ];
    if (!cancellable.includes(order.status)) {
      throw new Error(`Cannot cancel order in status ${order.status}`);
    }
    return this.transition(id, userId, "CANCELLED", "CANCEL", reason, user);
  }

  static async fail(id: string, userId: string, reason: string, user?: any) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    const failFrom = ["SENT_TO_BROKER", "PARTIALLY_EXECUTED", "EXECUTED", "PENDING_SETTLEMENT"];
    if (!failFrom.includes(order.status)) {
      throw new Error(`Cannot fail order in status ${order.status}`);
    }
    if (!reason?.trim()) throw new Error("reason is required to fail an order");
    return this.transition(id, userId, "FAILED", "FAIL", reason, user);
  }

  static async archive(id: string, userId: string, reason?: string, user?: any) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    const archivable = ["SETTLED", "REJECTED", "CANCELLED", "FAILED"];
    if (!archivable.includes(order.status)) {
      throw new Error(`Cannot archive order in status ${order.status}`);
    }
    return this.transition(id, userId, "ARCHIVED", "ARCHIVE", reason, user);
  }

  static async executeOrder(
    id: string,
    userId: string,
    user: any,
    idempotencyKey: string,
    opts: { quantity?: number; executionPrice?: number; partialFillQuantity?: number } = {}
  ) {
    await this.assertOrderAccess(id, userId, user);
    const order = await prisma.investmentOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    const existingTrade = await prisma.listedEquityTrade.findUnique({
      where: { idempotencyKey },
    });
    if (existingTrade) {
      const owningOrder = await prisma.investmentOrder.findFirst({
        where: { tradeId: existingTrade.id },
        select: { id: true },
      });
      if (existingTrade.fundId !== order.fundId || (owningOrder && owningOrder.id !== id)) {
        throw new Error("Idempotency key is already used for another command");
      }
      await prisma.investmentOrder.update({
        where: { id },
        data: { tradeId: existingTrade.id },
      });
      return {
        order: await this.get(id, userId, user),
        trade: await TradeOrchestratorService.getTradeDetail(existingTrade.id),
        tradeId: existingTrade.id,
      };
    }
    if (!["APPROVED", "SENT_TO_BROKER"].includes(order.status)) {
      throw new Error(`Cannot execute order in status ${order.status}`);
    }
    if (order.status === "APPROVED") {
      await this.sendToBroker(id, userId, user);
    }
    if (!order.securityId) throw new Error("Order has no linked security for execution");
    if (order.instrumentId) {
      await InvestmentInstrumentService.assertApprovedForTrade(order.instrumentId);
    }

    const orderQty = Number(order.quantity);
    const fillQty = Number(
      opts.partialFillQuantity ?? opts.quantity ?? order.quantity
    );
    if (!Number.isFinite(fillQty) || fillQty <= 0) {
      throw new Error("Execute quantity must be greater than zero");
    }
    if (fillQty > orderQty) {
      throw new Error("Execute quantity cannot exceed order quantity");
    }
    const execPrice = Number(
      opts.executionPrice ?? order.executionPrice ?? order.limitPrice ?? 0
    );

    const trade = await TradeOrchestratorService.createDraft({
      fundId: order.fundId,
      securityId: order.securityId,
      side: order.side,
      quantity: fillQty,
      executionPrice: execPrice,
      executionCurrencyCode: order.tradeCurrency,
    });

    const executed = await TradeOrchestratorService.execute(trade.id, userId, idempotencyKey);

    let newStatus = "PENDING_SETTLEMENT";
    if (fillQty < orderQty) {
      newStatus = "PARTIALLY_EXECUTED";
    } else if (executed.status === "SETTLED") {
      newStatus = "SETTLED";
    } else if (executed.status === "ROUTING" || executed.status === "EXECUTED") {
      newStatus = "PENDING_SETTLEMENT";
    }

    await prisma.investmentOrder.update({
      where: { id },
      data: {
        tradeId: trade.id,
        status: newStatus,
        executionPrice: execPrice,
        ...(fillQty < orderQty
          ? {}
          : {}),
      },
    });
    await InvestmentOpsAuditService.log(
      "ORDER_EXECUTED",
      "Order",
      id,
      { tradeId: trade.id, newStatus, fillQty, orderQty },
      userId
    );

    if (executed.settlement?.journalEntryId) {
      await InvestmentAccountingFacadeService.recordFromTradeSettlement(
        order.fundId,
        trade.id,
        executed.tradeRef,
        executed.settlement.journalEntryId,
        executed.settlement.realizedPnl != null ? Number(executed.settlement.realizedPnl) : null
      );
      if (fillQty >= orderQty && (newStatus === "PENDING_SETTLEMENT" || newStatus === "EXECUTED")) {
        await prisma.investmentOrder.update({ where: { id }, data: { status: "SETTLED" } });
        newStatus = "SETTLED";
      }
    }

    const orderRow = await this.get(id, userId, user);
    return {
      order: orderRow,
      trade: executed,
      tradeId: trade.id,
      status: newStatus,
      filledQuantity: String(fillQty),
      remainingQuantity: String(Math.max(0, orderQty - fillQty)),
    };
  }

  static enrichTradeBlotter(trade: any) {
    const fundCfg = trade.fund?.listedEquityFundConfig;
    const glHopConfirmed = trade.routingHops?.some(
      (h: any) => h.target === "ACCOUNTING_GL" && h.status === "CONFIRMED"
    );
    const accountingPosted = Boolean(trade.settlement?.journalEntryId) || Boolean(glHopConfirmed);
    const brokerProfileId =
      trade.brokerProfileId ?? fundCfg?.brokerProfileId ?? fundCfg?.brokerProfile?.id ?? null;
    const custodianProfileId =
      trade.custodianProfileId ?? fundCfg?.custodianProfileId ?? fundCfg?.custodianProfile?.id ?? null;
    const qty = Number(trade.quantity || 0);
    const px = Number(trade.executionPrice || 0);
    const fees = Number(trade.fees || 0);
    const taxes = Number(trade.taxes ?? trade.taxAmount ?? 0);
    const orderId =
      trade.orderId ?? trade.investmentOrder?.id ?? trade.order?.id ?? null;
    const orderRef =
      trade.orderRef ?? trade.investmentOrder?.orderRef ?? trade.order?.orderRef ?? null;
    return {
      ...trade,
      accountingStatus: accountingPosted ? "POSTED" : "NOT_POSTED",
      confirmationStatus: trade.routingHops?.find((h: any) => h.target === "BROKER")?.status ?? "STAGED",
      settlementStatus: trade.status,
      quantity: String(trade.quantity ?? ""),
      executionPrice: String(trade.executionPrice ?? ""),
      filledQuantity: String(trade.filledQuantity ?? trade.quantity ?? ""),
      orderId,
      orderRef,
      fundName: trade.fund?.name ?? trade.fundName ?? null,
      fund: trade.fund
        ? { id: trade.fund.id, name: trade.fund.name }
        : trade.fundId
          ? { id: trade.fundId, name: trade.fundName ?? null }
          : null,
      grossConsideration: String(qty * px),
      netConsideration: String(qty * px + fees + taxes),
      fees: String(fees),
      taxes: String(taxes),
      feesBreakdown: { fees: String(fees), taxes: String(taxes) },
      brokerProfileId,
      custodianProfileId,
      brokerName: fundCfg?.brokerProfile?.name ?? trade.brokerName ?? null,
      custodianName: fundCfg?.custodianProfile?.name ?? trade.custodianName ?? null,
      broker: fundCfg?.brokerProfile?.name ?? trade.broker ?? null,
      custodian: fundCfg?.custodianProfile?.name ?? trade.custodian ?? null,
      valueDate: trade.valueDate ?? trade.settlement?.valueDate ?? trade.settledAt ?? null,
    };
  }

  /** Attach owning InvestmentOrder id/ref onto listed-equity trades (link is order.tradeId). */
  static async attachOrderLinks(trades: any[]) {
    if (!trades.length) return trades;
    const tradeIds = trades.map((t) => t.id).filter(Boolean);
    const orders = await prisma.investmentOrder.findMany({
      where: { tradeId: { in: tradeIds } },
      select: { id: true, orderRef: true, tradeId: true, status: true },
    });
    const byTrade = Object.fromEntries(
      orders.filter((o: any) => o.tradeId).map((o: any) => [o.tradeId, o])
    );
    return trades.map((t) => {
      const order = byTrade[t.id];
      if (!order) {
        return { ...t, orderId: t.orderId ?? null, orderRef: t.orderRef ?? null };
      }
      return {
        ...t,
        orderId: order.id,
        orderRef: order.orderRef,
        orderStatus: order.status,
      };
    });
  }
}
