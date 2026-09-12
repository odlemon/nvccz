// @ts-nocheck
/**
 * Broker-outside trading model (BA-TR-1 / BA-TR-2).
 * AM records instruction + confirmation; accept creates blotter trade.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { InvestmentOrderPhase2Service, assertOrderTransition } from "./InvestmentOrderPhase2Service";
import { InvestmentOrderService } from "./InvestmentOrderService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";

const db = prisma as any;

const OUTCOMES = ["FILLED", "COUNTER", "UNABLE", "PARTIAL"] as const;

function fail(code: string, message: string, status = 400, details?: unknown): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function serializeConfirmation(row: any) {
  if (!row) return row;
  return {
    ...row,
    quantity: row.quantity != null ? String(row.quantity) : null,
    price: row.price != null ? String(row.price) : null,
    tradeDate: row.tradeDate
      ? row.tradeDate instanceof Date
        ? row.tradeDate.toISOString().slice(0, 10)
        : String(row.tradeDate).slice(0, 10)
      : null,
    valueDate: row.valueDate
      ? row.valueDate instanceof Date
        ? row.valueDate.toISOString().slice(0, 10)
        : String(row.valueDate).slice(0, 10)
      : null,
    recordedAt: row.recordedAt?.toISOString?.() ?? row.recordedAt,
    decidedAt: row.decidedAt?.toISOString?.() ?? row.decidedAt ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

export class InvestmentBrokerConfirmationService {
  /** BA-TR-1 — send instruction externally; order stays on orderbook. */
  static async sendToBroker(
    id: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const orderBefore = await InvestmentOrderPhase2Service.get(id, userId, user);
    if (String(orderBefore.version) !== String(expectedVersion)) {
      fail("VERSION_CONFLICT", "Order has changed since it was read", 409, {
        expectedVersion,
        currentVersion: String(orderBefore.version),
      });
    }

    const routePayload = {
      venueCode: data?.venueCode,
      brokerProfileId: data?.brokerProfileId,
      requestPayload: data?.requestPayload,
      externalOrderRef: data?.externalOrderRef,
      channel: data?.channel,
      notes: data?.notes,
      sentAt: data?.sentAt,
    };

    let route;
    if (orderBefore.status === "APPROVED") {
      route = await InvestmentOrderPhase2Service.route(
        id,
        routePayload,
        expectedVersion,
        idempotencyKey,
        userId,
        user
      );
    } else if (["SENT_TO_BROKER", "ROUTED"].includes(orderBefore.status)) {
      route = await InvestmentOrderPhase2Service.routeResend(
        id,
        routePayload,
        expectedVersion,
        idempotencyKey,
        userId,
        user
      );
    } else {
      fail(
        "ORDER_NOT_SENDABLE",
        "Order must be approved or awaiting broker to send an instruction",
        409
      );
    }

    const sentAt = data?.sentAt ? new Date(data.sentAt) : new Date();
    const channel = data?.channel ? String(data.channel).toUpperCase() : "EMAIL";
    const notes = data?.notes != null ? String(data.notes) : null;

    // Phase-1 custodian authorisation fields (FE Send modal)
    const custodianProfileId =
      data?.custodianProfileId || data?.custodianId || undefined;
    const settlementAccountId =
      data?.settlementAccountId || data?.settlementAccount || undefined;
    const valueDate = data?.valueDate ? new Date(data.valueDate) : undefined;

    await db.investmentOrder.update({
      where: { id },
      data: {
        sentToBrokerAt: sentAt,
        sentToBrokerChannel: channel,
        sentToBrokerNotes: notes,
        ...(custodianProfileId !== undefined
          ? { custodianProfileId: custodianProfileId || null }
          : {}),
        ...(settlementAccountId !== undefined
          ? { settlementAccountId: settlementAccountId || null }
          : {}),
        ...(valueDate !== undefined ? { valueDate } : {}),
        ...(data?.brokerProfileId
          ? { brokerProfileId: data.brokerProfileId }
          : {}),
      },
    });

    const order = await InvestmentOrderPhase2Service.get(id, userId, user);

    // Email PO-style instruction + magic-link reply (broker communication flow)
    let instructionDispatch: any = null;
    try {
      const { InvestmentBrokerInstructionService } = await import(
        "./InvestmentBrokerInstructionService"
      );
      instructionDispatch = await InvestmentBrokerInstructionService.dispatchAfterSend(
        id,
        data,
        userId,
        user
      );
    } catch (e: any) {
      console.warn("[sendToBroker] instruction email dispatch failed:", e?.message || e);
      instructionDispatch = {
        status: "FAILED",
        deliveryError: e?.message || "INSTRUCTION_DISPATCH_FAILED",
      };
    }

    return {
      order: {
        ...order,
        custodianId: order.custodianProfileId ?? null,
        settlementAccountId: order.settlementAccountId ?? null,
      },
      route,
      instruction: instructionDispatch,
    };
  }

  static async list(orderId: string, userId: string, user: any) {
    await InvestmentOrderPhase2Service.get(orderId, userId, user);
    const rows = await db.investmentOrderBrokerConfirmation.findMany({
      where: { orderId },
      orderBy: { recordedAt: "desc" },
    });
    return rows.map(serializeConfirmation);
  }

  static async record(
    orderId: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string | null,
    user: any,
    opts: { skipAccessCheck?: boolean } = {}
  ) {
    if (idempotencyKey) {
      const replay = await db.investmentOrderBrokerConfirmation.findUnique({
        where: { idempotencyKey },
      });
      if (replay) return serializeConfirmation(replay);
    }

    const order = opts.skipAccessCheck
      ? await db.investmentOrder.findUnique({ where: { id: orderId } })
      : await InvestmentOrderPhase2Service.get(orderId, userId, user);
    if (!order) fail("ORDER_NOT_FOUND", "Order not found", 404);
    if (String(order.version) !== String(expectedVersion)) {
      fail("VERSION_CONFLICT", "Order has changed since it was read", 409, {
        expectedVersion,
        currentVersion: String(order.version),
      });
    }
    // ROUTED is legacy/alias; sendToBroker persists SENT_TO_BROKER but older rows may still say ROUTED.
    if (
      !["SENT_TO_BROKER", "ROUTED", "BROKER_CONFIRMATION_RECORDED", "PARTIALLY_EXECUTED"].includes(
        order.status
      )
    ) {
      fail(
        "ORDER_NOT_AWAITING_BROKER",
        "Order must be SENT_TO_BROKER (or awaiting) before recording a confirmation",
        422,
        { status: order.status }
      );
    }
    if (order.tradeId && order.status === "EXECUTED") {
      fail("ORDER_ALREADY_EXECUTED", "Order already has an accepted trade", 409);
    }

    const outcome = String(data?.outcome || "FILLED").toUpperCase();
    if (!OUTCOMES.includes(outcome as any)) {
      fail("VALIDATION_ERROR", `outcome must be one of ${OUTCOMES.join(", ")}`, 422);
    }

    let quantity: Decimal;
    let price: Decimal;
    try {
      quantity = new Decimal(String(data?.quantity ?? ""));
      price = new Decimal(String(data?.price ?? ""));
    } catch {
      fail("VALIDATION_ERROR", "quantity and price are required decimal strings", 422);
    }
    if (outcome !== "UNABLE" && (!quantity.isPositive() || !price.isPositive())) {
      fail("VALIDATION_ERROR", "quantity and price must be greater than zero", 422);
    }
    if (outcome === "UNABLE") {
      if (!quantity.isPositive()) quantity = new Decimal(String(order.quantity || "1"));
      if (!price.isPositive()) price = new Decimal(String(order.limitPrice || "0.01"));
    }

    const row = await db.investmentOrderBrokerConfirmation.create({
      data: {
        id: `bcf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        orderId,
        outcome,
        status: "RECORDED",
        quantity,
        price,
        currencyCode: String(data?.currencyCode || order.tradeCurrency || "USD").toUpperCase(),
        brokerReference: data?.brokerReference || null,
        tradeDate: data?.tradeDate ? new Date(data.tradeDate) : null,
        valueDate: data?.valueDate ? new Date(data.valueDate) : null,
        notes: data?.notes || null,
        attachmentFileId: data?.attachmentFileId || null,
        idempotencyKey: idempotencyKey || null,
        recordedById: userId || null,
      },
    });

    if (order.status === "SENT_TO_BROKER" || order.status === "ROUTED") {
      if (order.status === "SENT_TO_BROKER") {
        assertOrderTransition("SENT_TO_BROKER", "BROKER_CONFIRMATION_RECORDED");
      }
      const changed = await db.investmentOrder.updateMany({
        where: { id: orderId, version: order.version },
        data: {
          status: "BROKER_CONFIRMATION_RECORDED",
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("VERSION_CONFLICT", "Order changed while recording confirmation", 409);
    } else {
      await db.investmentOrder.updateMany({
        where: { id: orderId, version: order.version },
        data: { version: { increment: 1 } },
      });
    }

    await InvestmentOpsAuditService.log(
      "BROKER_CONFIRMATION_RECORDED",
      "InvestmentOrder",
      orderId,
      { confirmationId: row.id, outcome, quantity: String(quantity), price: String(price) },
      userId
    );

    return serializeConfirmation(row);
  }

  static async accept(
    orderId: string,
    confirmationId: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const order = await InvestmentOrderPhase2Service.get(orderId, userId, user);
    if (String(order.version) !== String(expectedVersion)) {
      fail("VERSION_CONFLICT", "Order has changed since it was read", 409, {
        expectedVersion,
        currentVersion: String(order.version),
      });
    }
    if (["EXECUTED", "PENDING_SETTLEMENT", "SETTLED"].includes(order.status) && order.tradeId) {
      fail("ORDER_ALREADY_EXECUTED", "Order already executed", 409, { tradeId: order.tradeId });
    }
    if (
      !["SENT_TO_BROKER", "ROUTED", "BROKER_CONFIRMATION_RECORDED", "PARTIALLY_EXECUTED"].includes(
        order.status
      )
    ) {
      fail("ORDER_NOT_AWAITING_BROKER", "Cannot accept confirmation in current status", 422, {
        status: order.status,
      });
    }

    const confirmation = await db.investmentOrderBrokerConfirmation.findFirst({
      where: { id: confirmationId, orderId },
    });
    if (!confirmation) fail("CONFIRMATION_NOT_FOUND", "Broker confirmation not found", 404);
    if (confirmation.status === "ACCEPTED" && confirmation.acceptedTradeId) {
      const trade = await InvestmentOrderService.attachOrderLinks([
        await (await import("../listedEquity/TradeOrchestratorService")).TradeOrchestratorService.getTradeDetail(
          confirmation.acceptedTradeId
        ),
      ]);
      return {
        order: await InvestmentOrderPhase2Service.get(orderId, userId, user),
        trade: InvestmentOrderService.enrichTradeBlotter(trade[0]),
        confirmation: serializeConfirmation(confirmation),
      };
    }
    if (confirmation.status !== "RECORDED") {
      fail("CONFIRMATION_NOT_ACCEPTABLE", `Confirmation status is ${confirmation.status}`, 422);
    }
    if (["UNABLE"].includes(String(confirmation.outcome))) {
      fail("CONFIRMATION_UNABLE", "Cannot accept an UNABLE outcome — reject or re-negotiate", 422);
    }

    const fillQty = Number(confirmation.quantity);
    const execPrice = Number(confirmation.price);

    const executed = await InvestmentOrderService.executeOrder(
      orderId,
      userId,
      user,
      idempotencyKey || `accept-conf:${confirmationId}`,
      {
        partialFillQuantity: fillQty,
        quantity: fillQty,
        executionPrice: execPrice,
      }
    );

    const orderQty = Number(order.quantity);
    const nextStatus = fillQty < orderQty ? "PARTIALLY_EXECUTED" : "EXECUTED";

    await db.investmentOrder.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        executionPrice: confirmation.price,
        tradeDate: confirmation.tradeDate || undefined,
        valueDate: confirmation.valueDate || order.valueDate || undefined,
      },
    });

    await db.investmentOrderBrokerConfirmation.update({
      where: { id: confirmationId },
      data: {
        status: "ACCEPTED",
        acceptedTradeId: executed.tradeId,
        decidedAt: new Date(),
        decidedById: userId,
      },
    });

    await InvestmentOpsAuditService.log(
      "BROKER_CONFIRMATION_ACCEPTED",
      "InvestmentOrder",
      orderId,
      { confirmationId, tradeId: executed.tradeId, status: nextStatus },
      userId
    );

    const refreshedOrder = await InvestmentOrderPhase2Service.get(orderId, userId, user);
    const [linked] = await InvestmentOrderService.attachOrderLinks([executed.trade]);
    const trade = InvestmentOrderService.enrichTradeBlotter(linked);

    return {
      order: {
        ...refreshedOrder,
        status: nextStatus,
        tradeId: executed.tradeId,
      },
      trade: {
        ...trade,
        settlementStatus:
          trade.status === "SETTLED" ? "SETTLED" : "PENDING_SETTLEMENT",
      },
      confirmation: serializeConfirmation(
        await db.investmentOrderBrokerConfirmation.findUnique({ where: { id: confirmationId } })
      ),
    };
  }

  static async reject(
    orderId: string,
    confirmationId: string,
    data: any,
    expectedVersion: string,
    userId: string,
    user: any
  ) {
    const order = await InvestmentOrderPhase2Service.get(orderId, userId, user);
    if (String(order.version) !== String(expectedVersion)) {
      fail("VERSION_CONFLICT", "Order has changed since it was read", 409, {
        expectedVersion,
        currentVersion: String(order.version),
      });
    }

    const confirmation = await db.investmentOrderBrokerConfirmation.findFirst({
      where: { id: confirmationId, orderId },
    });
    if (!confirmation) fail("CONFIRMATION_NOT_FOUND", "Broker confirmation not found", 404);
    if (confirmation.status !== "RECORDED") {
      fail("CONFIRMATION_NOT_REJECTABLE", `Confirmation status is ${confirmation.status}`, 422);
    }

    const reason = String(data?.reason || "").trim();
    if (!reason) fail("VALIDATION_ERROR", "reason is required", 422);

    await db.investmentOrderBrokerConfirmation.update({
      where: { id: confirmationId },
      data: {
        status: "REJECTED",
        rejectReason: reason,
        decidedAt: new Date(),
        decidedById: userId,
      },
    });
    const changed = await db.investmentOrder.updateMany({
      where: { id: orderId, version: order.version },
      data: {
        status: "SENT_TO_BROKER",
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) fail("VERSION_CONFLICT", "Order changed while rejecting confirmation", 409);

    await InvestmentOpsAuditService.log(
      "BROKER_CONFIRMATION_REJECTED",
      "InvestmentOrder",
      orderId,
      { confirmationId, reason },
      userId
    );

    return {
      order: await InvestmentOrderPhase2Service.get(orderId, userId, user),
      confirmation: serializeConfirmation(
        await db.investmentOrderBrokerConfirmation.findUnique({ where: { id: confirmationId } })
      ),
    };
  }
}
