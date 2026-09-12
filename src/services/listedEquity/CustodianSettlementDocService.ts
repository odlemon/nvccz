// @ts-nocheck
import PDFDocument from "pdfkit";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../../utils/database";

export class CustodianSettlementDocService {
  static async buildPdfBuffer(tradeId: string): Promise<Buffer> {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { security: true, fund: true },
    });
    if (!trade) throw new Error("Trade not found");

    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));

    doc.fontSize(16).text("Settlement Instruction", { align: "center" });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Trade Ref: ${trade.tradeRef}`);
    doc.text(`Fund: ${trade.fund.name}`);
    doc.text(`Security: ${trade.security.symbol} (${trade.security.exchangeCode})`);
    doc.text(`Side: ${trade.side}`);
    doc.text(`Quantity: ${trade.quantity}`);
    doc.text(`Price: ${trade.executionPrice} ${trade.executionCurrencyCode}`);
    doc.text(`Fees: ${trade.fees}`);
    doc.text(`Executed: ${trade.executedAt?.toISOString() || "N/A"}`);
    doc.moveDown();
    doc.text("This document is generated for custodian settlement workflow (internal dispatch).");
    doc.text(`Signed metadata ref: fund-${trade.fundId}`);

    doc.end();
    await new Promise((resolve) => doc.on("end", resolve));
    return Buffer.concat(chunks);
  }

  static async storeSettlementPdf(tradeId: string): Promise<string> {
    const buffer = await this.buildPdfBuffer(tradeId);
    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "listed-equity-settlement");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `trade-${tradeId}.pdf`);
    await writeFile(filePath, buffer);
    return filePath;
  }
}
