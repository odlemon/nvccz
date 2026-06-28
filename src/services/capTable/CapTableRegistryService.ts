// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";

export class CapTableRegistryService {
  static async list(args?: { fundId?: string }) {
    const where: any = {};
    if (args?.fundId) {
      where.portfolioCompany = { fundId: args.fundId };
    }
    return prisma.capTableRegistry.findMany({
      where,
      include: {
        portfolioCompany: { select: { id: true, name: true, fundId: true } },
        glMapping: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getByPortfolioCompanyId(portfolioCompanyId: string) {
    const registry = await prisma.capTableRegistry.findUnique({
      where: { portfolioCompanyId },
      include: {
        portfolioCompany: { select: { id: true, name: true, fundId: true } },
        glMapping: true,
        shareClasses: { where: { status: "ACTIVE" }, orderBy: { seniorityIndex: "asc" } },
      },
    });
    if (!registry) {
      throw Object.assign(new Error("Cap table registry not found for this company"), { statusCode: 404 });
    }
    return registry;
  }

  static async bootstrap(portfolioCompanyId: string, baseCurrencyCode = "USD") {
    const company = await prisma.portfolioCompany.findUnique({ where: { id: portfolioCompanyId } });
    if (!company) throw Object.assign(new Error("Portfolio company not found"), { statusCode: 404 });

    const existing = await prisma.capTableRegistry.findUnique({ where: { portfolioCompanyId } });
    if (existing) return CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);

    const registryId = randomUUID();
    const glId = randomUUID();
    await prisma.$transaction([
      prisma.capTableRegistry.create({
        data: {
          id: registryId,
          portfolioCompanyId,
          baseCurrencyCode,
          status: "ACTIVE",
        },
      }),
      prisma.capTableGlMapping.create({
        data: {
          id: glId,
          registryId,
          cashAccountCode: "1010",
          shareCapitalAccountCode: "3000",
          sharePremiumAccountCode: "3050",
        },
      }),
    ]);

    return CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
  }
}
