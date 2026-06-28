// @ts-nocheck
import { prisma } from "../../utils/database";
import { CapTableRegistryService } from "./CapTableRegistryService";

export class CapTableStakeholderService {
  static async list(portfolioCompanyId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableStakeholder.findMany({
      where: { registryId: registry.id, isActive: true },
      orderBy: { displayName: "asc" },
    });
  }

  static async create(
    portfolioCompanyId: string,
    body: {
      displayName: string;
      stakeholderType?: string;
      clientId?: string;
      email?: string;
      externalRef?: string;
    }
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableStakeholder.create({
      data: {
        registryId: registry.id,
        displayName: body.displayName,
        stakeholderType: body.stakeholderType ?? "INVESTOR",
        clientId: body.clientId ?? null,
        email: body.email ?? null,
        externalRef: body.externalRef ?? null,
        isActive: true,
      },
    });
  }

  static async update(
    portfolioCompanyId: string,
    stakeholderId: string,
    body: Partial<{ displayName: string; email: string; isActive: boolean; clientId: string }>
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const row = await prisma.capTableStakeholder.findFirst({
      where: { id: stakeholderId, registryId: registry.id },
    });
    if (!row) throw Object.assign(new Error("Stakeholder not found"), { statusCode: 404 });
    return prisma.capTableStakeholder.update({ where: { id: stakeholderId }, data: body });
  }
}
