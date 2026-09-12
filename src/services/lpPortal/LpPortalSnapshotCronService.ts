// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";

export class LpPortalSnapshotCronService {
  static async refreshAll(asOfDate = new Date()) {
    const asOf = new Date(asOfDate.toISOString().slice(0, 10));
    const periodEnd = asOf;
    const periodStart = new Date(asOf);
    periodStart.setFullYear(periodStart.getFullYear() - 1);

    const commitments = await prisma.investmentCommitment.findMany({
      where: { status: { in: ["ACTIVE", "PENDING"] } },
      select: { clientId: true, fundId: true },
    });

    let refreshed = 0;
    for (const c of commitments) {
      const metrics = await LpFundMetricsService.computeForClient({
        fundId: c.fundId,
        clientId: c.clientId,
        periodStart,
        periodEnd,
      });
      await prisma.lpPortalMetricSnapshot.upsert({
        where: {
          clientId_fundId_asOfDate: {
            clientId: c.clientId,
            fundId: c.fundId,
            asOfDate: asOf,
          },
        },
        create: {
          clientId: c.clientId,
          fundId: c.fundId,
          asOfDate: asOf,
          metrics,
        },
        update: { metrics },
      });
      refreshed++;
    }
    return { refreshed, asOfDate: asOf.toISOString().slice(0, 10) };
  }
}
