// @ts-nocheck
import { prisma } from "../../utils/database";
import { TaxReturnPackAuditService } from "./TaxReturnPackAuditService";
import {
  TRP_AUDIT_EVENTS,
  TRP_ENTITY_TYPES,
  TRP_PACK_STATUSES,
  TRP_TAX_REGIMES,
  taxPeriodBounds,
} from "./taxReturnPackSupport";

export type ProvisionTaxPackInput = {
  forecastEntityId: string;
  taxYear: number;
  taxPeriod?: string;
  taxRegime?: string;
  baseCurrency?: string;
  fundId?: string | null;
  createdById: string;
};

export class TaxReturnPackProvisionService {
  static async findExisting(input: Pick<ProvisionTaxPackInput, "forecastEntityId" | "taxYear" | "taxPeriod" | "taxRegime">) {
    return prisma.taxReturnPack.findFirst({
      where: {
        forecastEntityId: input.forecastEntityId,
        taxYear: input.taxYear,
        taxPeriod: input.taxPeriod || "ANNUAL",
        taxRegime: input.taxRegime || TRP_TAX_REGIMES.ZIMRA_CIT,
      },
    });
  }

  static async provision(input: ProvisionTaxPackInput) {
    const taxPeriod = input.taxPeriod || "ANNUAL";
    const taxRegime = input.taxRegime || TRP_TAX_REGIMES.ZIMRA_CIT;

    const entity = await prisma.forecastEntity.findUnique({
      where: { id: input.forecastEntityId },
      select: { id: true, name: true, type: true, isActive: true, baseCurrency: true },
    });
    if (!entity || !entity.isActive) {
      throw Object.assign(new Error("Forecast entity not found or inactive"), { statusCode: 404 });
    }

    const existing = await TaxReturnPackProvisionService.findExisting({
      forecastEntityId: input.forecastEntityId,
      taxYear: input.taxYear,
      taxPeriod,
      taxRegime,
    });
    if (existing) return existing;

    const { periodStart, periodEnd } = taxPeriodBounds(input.taxYear, taxPeriod);
    const baseCurrency = input.baseCurrency || entity.baseCurrency || "USD";

    const pack = await prisma.taxReturnPack.create({
      data: {
        forecastEntityId: input.forecastEntityId,
        fundId: input.fundId ?? null,
        taxYear: input.taxYear,
        taxPeriod,
        taxRegime,
        baseCurrency,
        status: TRP_PACK_STATUSES.DRAFT,
        periodStart,
        periodEnd,
        createdById: input.createdById,
      },
      include: {
        forecastEntity: { select: { id: true, name: true, type: true } },
        fund: { select: { id: true, name: true } },
      },
    });

    await TaxReturnPackAuditService.log(pack.id, TRP_AUDIT_EVENTS.PACK_CREATED, input.createdById, {
      forecastEntityId: input.forecastEntityId,
      taxYear: input.taxYear,
      taxPeriod,
      entityType: entity.type,
    });

    return pack;
  }

  static async list(filters: {
    forecastEntityId?: string;
    fundId?: string;
    taxYear?: number;
    status?: string;
  }) {
    return prisma.taxReturnPack.findMany({
      where: {
        forecastEntityId: filters.forecastEntityId,
        fundId: filters.fundId,
        taxYear: filters.taxYear,
        status: filters.status,
      },
      include: {
        forecastEntity: { select: { id: true, name: true, type: true } },
        fund: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async getDetail(packId: string) {
    const pack = await prisma.taxReturnPack.findUnique({
      where: { id: packId },
      include: {
        forecastEntity: { select: { id: true, name: true, type: true, baseCurrency: true } },
        fund: { select: { id: true, name: true } },
        reconciliationLines: { orderBy: { displayOrder: "asc" } },
        cgtLines: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!pack) throw Object.assign(new Error("Tax return pack not found"), { statusCode: 404 });
    return pack;
  }

  static supportsFullCitIngest(entityType: string): boolean {
    return entityType === TRP_ENTITY_TYPES.INTERNAL_SUBSIDIARY;
  }
}
