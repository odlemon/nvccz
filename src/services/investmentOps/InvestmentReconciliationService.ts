// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";

function parseCsvLines(csvText: string): Array<Record<string, string>> {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
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

export class InvestmentReconciliationService {
  static async run(
    fundId: string,
    reconType: string,
    userId: string,
    user: any,
    externalFile?: { csvText?: string; fileName?: string }
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const batch = await prisma.investmentReconciliationBatch.create({
      data: {
        fundId,
        reconType,
        asOfDate: new Date(),
        status: "RUNNING",
        createdById: userId,
        externalFileName: externalFile?.fileName,
      },
    });

    const items = [];
    const externalRows = externalFile?.csvText ? parseCsvLines(externalFile.csvText) : [];

    if (reconType === "HOLDINGS" || reconType === "CUSTODIAN_POSITION") {
      const holdings = await prisma.listedEquityHolding.findMany({
        where: { fundId },
        include: { security: true },
      });
      const externalByRef = new Map<string, number>();
      for (const row of externalRows) {
        const ref = row.ref || row.symbol || row.ticker || row.internal_ref;
        const qty = Number(row.quantity || row.qty || row.amount || 0);
        if (ref) externalByRef.set(ref.toUpperCase(), qty);
      }
      for (const h of holdings) {
        const ref = `${h.security.symbol}:${h.security.exchangeCode}`;
        const internalQty = Number(h.quantity);
        const internalAmount = internalQty * Number(h.wac);
        const extQty = externalByRef.get(ref.toUpperCase()) ?? externalByRef.get(h.security.symbol.toUpperCase());
        let status = "MATCHED";
        let externalAmount = internalAmount;
        let variance = 0;
        let message = "Internal holding snapshot";
        if (externalRows.length) {
          if (extQty == null) {
            status = "UNMATCHED";
            message = "No external line for holding";
          } else {
            externalAmount = extQty * Number(h.wac);
            variance = internalAmount - externalAmount;
            status = Math.abs(variance) < 0.01 ? "MATCHED" : "PARTIALLY_MATCHED";
            message =
              status === "MATCHED"
                ? "Custodian quantity matches"
                : `Qty variance internal=${internalQty} external=${extQty}`;
          }
        } else {
          message = "Internal holding snapshot — upload custodian file to compare";
        }
        items.push({
          batchId: batch.id,
          status,
          internalRef: ref,
          internalAmount,
          externalAmount,
          variance,
          message,
        });
      }
      for (const row of externalRows) {
        const ref = (row.ref || row.symbol || row.ticker || "").toUpperCase();
        if (!ref) continue;
        const matched = holdings.some(
          (h) =>
            `${h.security.symbol}:${h.security.exchangeCode}`.toUpperCase() === ref ||
            h.security.symbol.toUpperCase() === ref
        );
        if (!matched) {
          items.push({
            batchId: batch.id,
            status: "UNMATCHED",
            internalRef: null,
            externalRef: ref,
            externalAmount: Number(row.quantity || row.qty || 0),
            message: "External line with no internal holding",
          });
        }
      }
    } else if (reconType === "TRADE") {
      const trades = await prisma.listedEquityTrade.findMany({
        where: { fundId, status: { in: ["SETTLED", "ROUTING", "EXECUTED"] } },
        take: 100,
      });
      const externalByRef = new Map<string, number>();
      for (const row of externalRows) {
        const ref = row.trade_ref || row.ref || row.reference;
        if (ref) externalByRef.set(ref.toUpperCase(), Number(row.amount || row.value || 0));
      }
      for (const t of trades) {
        const amt = Number(t.quantity) * Number(t.executionPrice);
        const ext = externalByRef.get(t.tradeRef.toUpperCase());
        let status = t.status === "SETTLED" ? "MATCHED" : "UNMATCHED";
        if (externalRows.length && ext != null) {
          status = Math.abs(amt - ext) < 0.01 ? "MATCHED" : "PARTIALLY_MATCHED";
        }
        items.push({
          batchId: batch.id,
          status,
          internalRef: t.tradeRef,
          internalAmount: amt,
          externalAmount: ext ?? null,
          variance: ext != null ? amt - ext : null,
          message: externalRows.length ? "Broker trade compare" : `Trade status ${t.status}`,
        });
      }
    } else if (reconType === "PRICE") {
      const holdings = await prisma.listedEquityHolding.findMany({ where: { fundId } });
      for (const h of holdings) {
        const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
        items.push({
          batchId: batch.id,
          status: price != null ? "MATCHED" : "UNMATCHED",
          internalRef: h.securityId,
          message: price != null ? `Approved price ${price}` : "Missing approved price",
        });
      }
    } else if (reconType === "CASH") {
      const config = await prisma.listedEquityFundConfig.findUnique({ where: { fundId } });
      let internalAmount = 0;
      if (config?.trustBankId) {
        const entries = await prisma.cashbookEntry.aggregate({
          where: { bankId: config.trustBankId },
          _sum: { amount: true },
        });
        internalAmount = Number(entries._sum.amount || 0);
      }
      const extCash = externalRows.reduce((s, r) => s + Number(r.amount || r.balance || 0), 0);
      items.push({
        batchId: batch.id,
        status: externalRows.length
          ? Math.abs(internalAmount - extCash) < 0.01
            ? "MATCHED"
            : "UNMATCHED"
          : config?.trustBankId
            ? "INVESTIGATING"
            : "UNMATCHED",
        internalRef: `trust:${config?.trustBankId ?? "none"}`,
        internalAmount,
        externalAmount: externalRows.length ? extCash : null,
        variance: externalRows.length ? internalAmount - extCash : null,
        message: externalRows.length
          ? "Bank statement vs trust cashbook"
          : "Upload bank statement CSV (columns: ref, amount/balance)",
      });
    }

    if (items.length) {
      await prisma.investmentReconciliationItem.createMany({ data: items });
    }
    const matched = items.filter((i) => i.status === "MATCHED").length;
    const unmatched = items.filter((i) => i.status === "UNMATCHED").length;
    await prisma.investmentReconciliationBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        matchedCount: matched,
        unmatchedCount: unmatched,
        completedAt: new Date(),
      },
    });
    await InvestmentOpsAuditService.log(
      "RECONCILIATION_RUN",
      "ReconciliationBatch",
      batch.id,
      { reconType, itemCount: items.length },
      userId
    );
    return prisma.investmentReconciliationBatch.findUnique({
      where: { id: batch.id },
      include: { items: true },
    });
  }

  static async uploadExternalFile(
    fundId: string,
    reconType: string,
    csvText: string,
    fileName: string,
    userId: string,
    user: any
  ) {
    return this.run(fundId, reconType, userId, user, { csvText, fileName });
  }

  static async listBatches(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    return prisma.investmentReconciliationBatch.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  static async getBatch(id: string) {
    return prisma.investmentReconciliationBatch.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  static async resolveItem(itemId: string, userId: string, reason: string, documentId?: string) {
    const item = await prisma.investmentReconciliationItem.update({
      where: { id: itemId },
      data: {
        status: "RESOLVED",
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionReason: reason,
        resolutionDocumentId: documentId,
      },
    });
    await InvestmentOpsAuditService.log(
      "RECON_ITEM_RESOLVED",
      "ReconciliationItem",
      itemId,
      { reason, documentId },
      userId
    );
    return item;
  }
}
