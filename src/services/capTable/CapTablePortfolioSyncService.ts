// @ts-nocheck
import { prisma } from "../../utils/database";
import { CapTableBalanceService } from "./CapTableBalanceService";
import { CapTableRegistryService } from "./CapTableRegistryService";

export class CapTablePortfolioSyncService {
  static async sync(portfolioCompanyId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const register = await CapTableBalanceService.issuedByClass(registry.id);

    const securities = register.stakeholders.map((s) => ({
      holder_name: s.displayName,
      security_type: "EQUITY",
      class: s.classCode,
      quantity: s.sharesHeld,
      percent_fully_diluted: s.fullyDilutedPct,
    }));

    const topHolder = [...register.stakeholders].sort((a, b) => b.fullyDilutedPct - a.fullyDilutedPct)[0];

    const capTable = {
      total_fully_diluted_shares: register.fullyDilutedShareCount,
      securities,
      currentOwnership: topHolder
        ? { holderName: topHolder.displayName, percentFullyDiluted: topHolder.fullyDilutedPct }
        : null,
      syncedAt: new Date().toISOString(),
      source: "cap_table_management",
    };

    await prisma.portfolioCompany.update({
      where: { id: portfolioCompanyId },
      data: { capTable },
    });

    return capTable;
  }
}
