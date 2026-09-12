// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";
import { CapTableRegistryService } from "./CapTableRegistryService";
import { CapTableTransactionService } from "./CapTableTransactionService";

export class CapTableLpPortalHook {
  static async afterExecuted(portfolioCompanyId: string, transactionId: string) {
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    const stakeholderIds = new Set<string>();
    if (tx.toStakeholderId) stakeholderIds.add(tx.toStakeholderId);
    if (tx.fromStakeholderId) stakeholderIds.add(tx.fromStakeholderId);
    for (const line of tx.lines ?? []) stakeholderIds.add(line.stakeholderId);

    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const stakeholders = await prisma.capTableStakeholder.findMany({
      where: { registryId: registry.id, id: { in: [...stakeholderIds] }, clientId: { not: null } },
      select: { clientId: true },
    });

    const clientIds = [...new Set(stakeholders.map((s) => s.clientId).filter(Boolean))] as string[];
    if (!clientIds.length) return { refreshed: 0 };

    const asOf = new Date();
    const periodEnd = asOf;
    const periodStart = new Date(asOf);
    periodStart.setFullYear(periodStart.getFullYear() - 1);

    let refreshed = 0;
    for (const clientId of clientIds) {
      const commitments = await prisma.investmentCommitment.findMany({
        where: { clientId, status: { in: ["ACTIVE", "PENDING"] } },
        select: { fundId: true },
      });
      for (const c of commitments) {
        const metrics = await LpFundMetricsService.computeForClient({
          fundId: c.fundId,
          clientId,
          periodStart,
          periodEnd,
        });
        await prisma.lpPortalMetricSnapshot.upsert({
          where: {
            clientId_fundId_asOfDate: { clientId, fundId: c.fundId, asOfDate: asOf },
          },
          create: { clientId, fundId: c.fundId, asOfDate: asOf, metrics },
          update: { metrics },
        });
        refreshed++;
      }
    }
    return { refreshed };
  }
}
