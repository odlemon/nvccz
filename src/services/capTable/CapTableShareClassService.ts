// @ts-nocheck
import { prisma } from "../../utils/database";
import { CapTableRegistryService } from "./CapTableRegistryService";

export class CapTableShareClassService {
  static async list(portfolioCompanyId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableShareClass.findMany({
      where: { registryId: registry.id },
      orderBy: [{ seniorityIndex: "asc" }, { classCode: "asc" }],
    });
  }

  static async create(
    portfolioCompanyId: string,
    body: {
      classCode: string;
      className: string;
      classType?: string;
      parValue?: number;
      votingMultiplier?: number;
      seniorityIndex?: number;
      liquidationMultiplier?: number;
      isParticipating?: boolean;
      authorizedShares: number;
    }
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableShareClass.create({
      data: {
        registryId: registry.id,
        classCode: String(body.classCode).trim().toUpperCase(),
        className: body.className,
        classType: body.classType ?? "COMMON",
        parValue: body.parValue ?? 0,
        votingMultiplier: body.votingMultiplier ?? 1,
        seniorityIndex: body.seniorityIndex ?? 99,
        liquidationMultiplier: body.liquidationMultiplier ?? 1,
        isParticipating: Boolean(body.isParticipating),
        authorizedShares: body.authorizedShares,
        status: "ACTIVE",
      },
    });
  }

  static async update(
    portfolioCompanyId: string,
    shareClassId: string,
    body: Partial<{
      className: string;
      authorizedShares: number;
      status: string;
      votingMultiplier: number;
      seniorityIndex: number;
      liquidationMultiplier: number;
      isParticipating: boolean;
    }>
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const row = await prisma.capTableShareClass.findFirst({
      where: { id: shareClassId, registryId: registry.id },
    });
    if (!row) throw Object.assign(new Error("Share class not found"), { statusCode: 404 });
    return prisma.capTableShareClass.update({ where: { id: shareClassId }, data: body });
  }
}
