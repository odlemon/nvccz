// @ts-nocheck
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../../utils/database";
import { emailTransport } from "../../config/email.config";
import { ListedEquityAuditService } from "./ListedEquityAuditService";
import { CustodianSettlementDocService } from "./CustodianSettlementDocService";
import { ListedEquityHoldingsService } from "./ListedEquityHoldingsService";

export class StakeholderDispatchService {
  static async storePayload(tradeId: string, target: string, payload: object): Promise<string> {
    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "listed-equity-dispatch");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${tradeId}-${target}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  }

  /**
   * Mark hop DISPATCHED only when delivery evidence exists.
   * Local durable payload write is accepted as evidence for UAT/file-store mode.
   * Email is recorded as additional evidence only when the transport accepts the message.
   */
  static async markDispatched(
    hopId: string,
    data: {
      payloadRef: string;
      receiptRef?: string;
      externalRef?: string;
      deliveryEvidence: "FILE" | "EMAIL" | "BOTH";
    }
  ) {
    if (!data.payloadRef || !data.deliveryEvidence) {
      throw new Error("DISPATCH_EVIDENCE_REQUIRED");
    }
    return prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: {
        status: "DISPATCHED",
        payloadRef: data.payloadRef,
        receiptRef: data.receiptRef,
        dispatchedAt: new Date(),
        attemptCount: { increment: 1 },
        externalRef: data.externalRef,
      },
    });
  }

  static async trySendEmail(opts: {
    to: string;
    subject: string;
    text: string;
  }): Promise<{ delivered: boolean; error?: string }> {
    if (!emailTransport) {
      return { delivered: false, error: "EMAIL_TRANSPORT_UNAVAILABLE" };
    }
    try {
      const info = await emailTransport.sendMail({
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      });
      const accepted = Array.isArray(info?.accepted)
        ? info.accepted.length > 0
        : Boolean(info?.messageId);
      if (!accepted) {
        return { delivered: false, error: "EMAIL_NOT_ACCEPTED" };
      }
      return { delivered: true };
    } catch (e: any) {
      return { delivered: false, error: e?.message || "EMAIL_SEND_FAILED" };
    }
  }

  static async dispatchBroker(tradeId: string, hopId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: {
        security: true,
        fund: { include: { listedEquityFundConfig: { include: { brokerProfile: true } } } },
      },
    });
    if (!trade) throw new Error("Trade not found");

    const payload = {
      tradeRef: trade.tradeRef,
      side: trade.side,
      symbol: trade.security.symbol,
      exchange: trade.security.exchangeCode,
      quantity: Number(trade.quantity),
      price: Number(trade.executionPrice),
      currency: trade.executionCurrencyCode,
      executedAt: trade.executedAt,
    };
    const payloadRef = await this.storePayload(tradeId, "BROKER", payload);
    const profile = trade.fund.listedEquityFundConfig?.brokerProfile;
    let deliveryEvidence: "FILE" | "EMAIL" | "BOTH" = "FILE";

    if (profile?.contactEmail) {
      const emailResult = await this.trySendEmail({
        to: profile.contactEmail,
        subject: `[Arcus] Broker instruction ${trade.tradeRef}`,
        text: `Trade ${trade.tradeRef} — payload stored at ${payloadRef}`,
      });
      if (!emailResult.delivered) {
        console.warn("[StakeholderDispatch] broker email not verified:", emailResult.error);
      } else {
        deliveryEvidence = "BOTH";
      }
    }

    await this.markDispatched(hopId, {
      payloadRef,
      externalRef: `BRK-${trade.tradeRef}`,
      deliveryEvidence,
    });

    await ListedEquityAuditService.log(
      "ROUTING_HOP_DISPATCHED",
      "ListedEquityTradeRoutingHop",
      hopId,
      { target: "BROKER", tradeId, deliveryEvidence }
    );

    if (process.env.LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER === "true") {
      await this.confirmHop(hopId, "AUTO_CONFIRM_DEV");
    }

    return payloadRef;
  }

  static async dispatchCustodian(tradeId: string, hopId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: {
        fund: { include: { listedEquityFundConfig: { include: { custodianProfile: true } } } },
      },
    });
    if (!trade) throw new Error("Trade not found");

    const pdfRef = await CustodianSettlementDocService.storeSettlementPdf(tradeId);
    const payloadRef = await this.storePayload(tradeId, "CUSTODIAN", {
      pdfRef,
      tradeRef: trade.tradeRef,
    });
    const profile = trade.fund.listedEquityFundConfig?.custodianProfile;
    let deliveryEvidence: "FILE" | "EMAIL" | "BOTH" = "FILE";

    if (profile?.contactEmail) {
      const emailResult = await this.trySendEmail({
        to: profile.contactEmail,
        subject: `[Arcus] Custodian settlement ${trade.tradeRef}`,
        text: `Settlement PDF: ${pdfRef}`,
      });
      if (!emailResult.delivered) {
        console.warn("[StakeholderDispatch] custodian email not verified:", emailResult.error);
      } else {
        deliveryEvidence = "BOTH";
      }
    }

    await prisma.listedEquityTradeSettlement.upsert({
      where: { tradeId },
      create: { tradeId, settlementDocumentRef: pdfRef },
      update: { settlementDocumentRef: pdfRef },
    });

    await this.markDispatched(hopId, {
      payloadRef,
      receiptRef: pdfRef,
      externalRef: `CUS-${trade.tradeRef}`,
      deliveryEvidence,
    });

    await ListedEquityAuditService.log(
      "ROUTING_HOP_DISPATCHED",
      "ListedEquityTradeRoutingHop",
      hopId,
      { target: "CUSTODIAN", tradeId, deliveryEvidence }
    );

    if (process.env.LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER === "true") {
      await this.confirmHop(hopId, "AUTO_CONFIRM_DEV");
    }

    return pdfRef;
  }

  static async confirmHop(hopId: string, externalRef?: string, userId?: string) {
    const hopBefore = await prisma.listedEquityTradeRoutingHop.findUnique({
      where: { id: hopId },
      include: { trade: true },
    });
    if (!hopBefore) throw new Error("Hop not found");

    const hop = await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        externalRef: externalRef || undefined,
        receiptRef: externalRef || undefined,
      },
      include: { trade: true },
    });

    if (hop.target === "CUSTODIAN") {
      if (hop.trade.side === "BUY") {
        await ListedEquityHoldingsService.recordBuy(hop.tradeId);
      } else if (hop.trade.side === "SELL") {
        await ListedEquityHoldingsService.recordSell(hop.tradeId);
      }
    }

    await ListedEquityAuditService.log(
      "ROUTING_HOP_CONFIRMED",
      "ListedEquityTradeRoutingHop",
      hopId,
      { target: hop.target, externalRef },
      userId
    );

    return hop;
  }
}
