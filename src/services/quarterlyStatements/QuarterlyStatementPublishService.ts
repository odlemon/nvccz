// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalVaultService } from "../lpPortal/LpPortalVaultService";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";
import { QuarterlyStatementPdfService } from "./QuarterlyStatementPdfService";
import type { QuarterlyLpMetrics } from "./QuarterlyStatementMetricsService";

export class QuarterlyStatementPublishService {
  static async publishRecipient(args: {
    recipientId: string;
    fundId: string;
    metrics: QuarterlyLpMetrics;
    approvedById: string;
    periodEnd: Date;
  }) {
    const { recipientId, fundId, metrics, approvedById, periodEnd } = args;

    const staged = await QuarterlyStatementPdfService.generateAndStage(recipientId, metrics);

    const title = `${metrics.fundName} — Quarterly Statement (${metrics.periodEnd})`;
    const doc = await LpPortalVaultService.publishDocument({
      clientId: metrics.clientId,
      fundId,
      category: "QUARTERLY_STATEMENT",
      title,
      fileUrl: staged.fileUrl,
      storagePath: staged.fileUrl,
      sha256: staged.sha256,
      publishedById: approvedById,
      sourceType: "QUARTERLY_STATEMENT_SYNC",
      sourceRefId: recipientId,
    });

    await prisma.quarterlyStatementRecipient.update({
      where: { id: recipientId },
      data: {
        status: "PUBLISHED",
        portalDocumentId: doc.id,
        publishedAt: new Date(),
      },
    });

    try {
      const periodStart = new Date(periodEnd);
      periodStart.setFullYear(periodStart.getFullYear() - 1);
      const snap = await LpFundMetricsService.computeForClient({
        fundId,
        clientId: metrics.clientId,
        periodStart,
        periodEnd,
      });
      await prisma.lpPortalMetricSnapshot.upsert({
        where: {
          clientId_fundId_asOfDate: {
            clientId: metrics.clientId,
            fundId,
            asOfDate: periodEnd,
          },
        },
        create: { clientId: metrics.clientId, fundId, asOfDate: periodEnd, metrics: snap },
        update: { metrics: snap },
      });
    } catch {
      // best-effort snapshot refresh
    }

    return doc;
  }
}
