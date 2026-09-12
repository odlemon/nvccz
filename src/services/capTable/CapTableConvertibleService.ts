// @ts-nocheck
import { prisma } from "../../utils/database";
import { CapTableRegistryService } from "./CapTableRegistryService";

export class CapTableConvertibleService {
  static async list(portfolioCompanyId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableConvertibleInstrument.findMany({
      where: { registryId: registry.id },
      include: { holder: { select: { id: true, displayName: true } } },
      orderBy: { issueDate: "desc" },
    });
  }

  static async create(
    portfolioCompanyId: string,
    body: {
      holderStakeholderId: string;
      principal: number;
      annualInterestRate?: number;
      valuationCap?: number;
      discountRate?: number;
      issueDate: string;
      maturityDate?: string;
    }
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableConvertibleInstrument.create({
      data: {
        registryId: registry.id,
        holderStakeholderId: body.holderStakeholderId,
        principal: body.principal,
        annualInterestRate: body.annualInterestRate ?? 0,
        valuationCap: body.valuationCap ?? null,
        discountRate: body.discountRate ?? null,
        issueDate: new Date(body.issueDate),
        maturityDate: body.maturityDate ? new Date(body.maturityDate) : null,
        status: "OUTSTANDING",
      },
    });
  }
}
