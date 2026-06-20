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

  static async dispatchBroker(tradeId: string, hopId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { security: true, fund: { include: { listedEquityFundConfig: { include: { brokerProfile: true } } } } },
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

    if (profile?.contactEmail && emailTransport) {
      try {
        await emailTransport.sendMail({
          to: profile.contactEmail,
          subject: `[Arcus] Broker instruction ${trade.tradeRef}`,
          text: `Trade ${trade.tradeRef} — see attached payload at ${payloadRef}`,
        });
      } catch (e) {
        console.warn("[StakeholderDispatch] broker email failed:", e);
      }
    }

    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: {
        status: "DISPATCHED",
        payloadRef,
        dispatchedAt: new Date(),
        attemptCount: { increment: 1 },
        externalRef: `BRK-${trade.tradeRef}`,
      },
    });

    await ListedEquityAuditService.log("ROUTING_HOP_DISPATCHED", "ListedEquityTradeRoutingHop", hopId, {
      target: "BROKER",
      tradeId,
    });

    if (process.env.LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER === "true") {
      await this.confirmHop(hopId, "AUTO_CONFIRM_DEV");
    }

    return payloadRef;
  }

  static async dispatchCustodian(tradeId: string, hopId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { fund: { include: { listedEquityFundConfig: { include: { custodianProfile: true } } } } },
    });
    if (!trade) throw new Error("Trade not found");

    const pdfRef = await CustodianSettlementDocService.storeSettlementPdf(tradeId);
    const payloadRef = await this.storePayload(tradeId, "CUSTODIAN", { pdfRef, tradeRef: trade.tradeRef });
    const profile = trade.fund.listedEquityFundConfig?.custodianProfile;

    if (profile?.contactEmail && emailTransport) {
      try {
        await emailTransport.sendMail({
          to: profile.contactEmail,
          subject: `[Arcus] Custodian settlement ${trade.tradeRef}`,
          text: `Settlement PDF: ${pdfRef}`,
        });
      } catch (e) {
        console.warn("[StakeholderDispatch] custodian email failed:", e);
      }
    }

    await prisma.listedEquityTradeSettlement.upsert({
      where: { tradeId },
      create: { tradeId, settlementDocumentRef: pdfRef },
      update: { settlementDocumentRef: pdfRef },
    });

    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: {
        status: "DISPATCHED",
        payloadRef,
        receiptRef: pdfRef,
        dispatchedAt: new Date(),
        attemptCount: { increment: 1 },
        externalRef: `CUS-${trade.tradeRef}`,
      },
    });

    await ListedEquityAuditService.log("ROUTING_HOP_DISPATCHED", "ListedEquityTradeRoutingHop", hopId, {
      target: "CUSTODIAN",
      tradeId,
    });

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
