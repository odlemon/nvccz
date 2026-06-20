// @ts-nocheck
import { prisma } from "../../utils/database";
import { MarketDataScraperService } from "./MarketDataScraperService";

export class MarketDataScraperCronService {
  static async runDomesticScrape() {
    return MarketDataScraperService.scrapeAllDomestic();
  }

  static async retryFailedIngest() {
    const failed = await prisma.listedEquityMarketDataIngestBatch.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const results = [];
    for (const batch of failed) {
      try {
        const r = await MarketDataScraperService.scrapeSource(batch.sourceCode);
        await prisma.listedEquityMarketDataIngestBatch.update({
          where: { id: batch.id },
          data: { status: "RETRIED" },
        });
        results.push({ batchId: batch.id, ok: true, newBatchId: r.batch.id });
      } catch (e: any) {
        results.push({ batchId: batch.id, ok: false, error: e.message });
      }
    }
    return { retried: results.length, results };
  }
}
