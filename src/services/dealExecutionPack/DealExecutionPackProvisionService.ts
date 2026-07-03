// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import { DealExecutionPackAuditService } from "./DealExecutionPackAuditService";
import {
  DEFAULT_SIGNATURE_TEMPLATE,
  DEP_AUDIT_EVENTS,
  DEP_PACK_STATUSES,
  DEP_SIG_STATUSES,
  DEP_TRANSACTION_TYPES,
  SLOT_TEMPLATES,
} from "./dealExecutionPackSupport";

export type ProvisionPackInput = {
  fundId: string;
  portfolioCompanyId: string;
  applicationId?: string | null;
  transactionType?: string;
  baseCurrency?: string;
  investmentAmount?: number | null;
  preMoneyValuation?: number | null;
  metadata?: Record<string, unknown> | null;
  createdById: string;
};

export class DealExecutionPackProvisionService {
  static async findExisting(input: Pick<ProvisionPackInput, "fundId" | "portfolioCompanyId" | "applicationId">) {
    if (input.applicationId) {
      return prisma.dealExecutionPack.findFirst({
        where: {
          fundId: input.fundId,
          portfolioCompanyId: input.portfolioCompanyId,
          applicationId: input.applicationId,
        },
      });
    }
    return prisma.dealExecutionPack.findFirst({
      where: {
        fundId: input.fundId,
        portfolioCompanyId: input.portfolioCompanyId,
        applicationId: null,
        status: { not: "EXECUTED" },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async provision(input: ProvisionPackInput) {
    const existing = await DealExecutionPackProvisionService.findExisting(input);
    if (existing) return existing;

    const transactionType = input.transactionType || DEP_TRANSACTION_TYPES.EQUITY_ROUND;
    const slotTemplate = SLOT_TEMPLATES[transactionType] || SLOT_TEMPLATES.EQUITY_ROUND;
    const packId = randomUUID();

    const pack = await prisma.$transaction(
      async (tx) => {
        const created = await tx.dealExecutionPack.create({
          data: {
            id: packId,
            fundId: input.fundId,
            portfolioCompanyId: input.portfolioCompanyId,
            applicationId: input.applicationId ?? null,
            transactionType,
            status: DEP_PACK_STATUSES.DRAFT,
            baseCurrency: input.baseCurrency || "USD",
            investmentAmount: input.investmentAmount ?? null,
            preMoneyValuation: input.preMoneyValuation ?? null,
            metadata: input.metadata ?? undefined,
            createdById: input.createdById,
          },
        });

        await tx.dealExecutionPackDocumentSlot.createMany({
          data: slotTemplate.map((slot) => ({
            id: randomUUID(),
            packId,
            slotCode: slot.slotCode,
            displayName: slot.displayName,
            isMandatory: slot.isMandatory,
            displayOrder: slot.displayOrder,
          })),
        });

        await tx.dealExecutionPackSignature.createMany({
          data: DEFAULT_SIGNATURE_TEMPLATE.map((sig) => ({
            id: randomUUID(),
            packId,
            roleCode: sig.roleCode,
            status: DEP_SIG_STATUSES.PENDING,
          })),
        });

        return created;
      },
      { timeout: 30000 }
    );

    await DealExecutionPackAuditService.log(pack.id, DEP_AUDIT_EVENTS.PACK_CREATED, input.createdById, {
      fundId: input.fundId,
      portfolioCompanyId: input.portfolioCompanyId,
      applicationId: input.applicationId ?? null,
      transactionType,
    });

    return pack;
  }

  static async list(filters: { fundId?: string; portfolioCompanyId?: string; status?: string }) {
    return prisma.dealExecutionPack.findMany({
      where: {
        fundId: filters.fundId,
        portfolioCompanyId: filters.portfolioCompanyId,
        status: filters.status,
      },
      include: {
        fund: { select: { id: true, name: true } },
        portfolioCompany: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async getDetail(packId: string) {
    return prisma.dealExecutionPack.findUnique({
      where: { id: packId },
      include: {
        fund: { select: { id: true, name: true } },
        portfolioCompany: { select: { id: true, name: true } },
        application: { select: { id: true, businessName: true, dealReference: true } },
        documentSlots: {
          orderBy: { displayOrder: "asc" },
          include: {
            documents: { orderBy: { version: "desc" }, take: 3 },
          },
        },
        cps: { orderBy: { createdAt: "asc" } },
        signatures: { orderBy: { createdAt: "asc" } },
      },
    });
  }
}
