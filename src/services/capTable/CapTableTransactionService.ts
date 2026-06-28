// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import { CapTableBalanceService } from "./CapTableBalanceService";
import { CapTableRegistryService } from "./CapTableRegistryService";
import type { CapTableTxType } from "./capTableTypes";

export class CapTableTransactionService {
  static async list(portfolioCompanyId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    return prisma.capTableTransaction.findMany({
      where: { registryId: registry.id },
      include: {
        shareClass: true,
        fromStakeholder: { select: { id: true, displayName: true } },
        toStakeholder: { select: { id: true, displayName: true } },
        lines: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(portfolioCompanyId: string, transactionId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const tx = await prisma.capTableTransaction.findFirst({
      where: { id: transactionId, registryId: registry.id },
      include: {
        shareClass: true,
        fromStakeholder: true,
        toStakeholder: true,
        lines: { include: { stakeholder: true, shareClass: true } },
      },
    });
    if (!tx) throw Object.assign(new Error("Transaction not found"), { statusCode: 404 });
    return tx;
  }

  static async createIssuance(
    portfolioCompanyId: string,
    userId: string,
    body: {
      shareClassId: string;
      toStakeholderId: string;
      quantity: number;
      pricePerShare: number;
      issuanceDate: string;
      boardResolutionUrl?: string;
      notes?: string;
    }
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    if (body.quantity <= 0) throw Object.assign(new Error("Quantity must be positive"), { statusCode: 400 });

    const shareClass = await prisma.capTableShareClass.findFirst({
      where: { id: body.shareClassId, registryId: registry.id },
    });
    if (!shareClass) throw Object.assign(new Error("Share class not found"), { statusCode: 404 });

    const txId = randomUUID();
    const lineId = randomUUID();
    return prisma.$transaction([
      prisma.capTableTransaction.create({
        data: {
          id: txId,
          registryId: registry.id,
          transactionType: "ISSUANCE",
          status: "DRAFT",
          shareClassId: body.shareClassId,
          quantity: body.quantity,
          pricePerShare: body.pricePerShare,
          issuanceDate: new Date(body.issuanceDate),
          boardResolutionUrl: body.boardResolutionUrl ?? null,
          toStakeholderId: body.toStakeholderId,
          notes: body.notes ?? null,
          createdById: userId,
        },
      }),
      prisma.capTableTransactionLine.create({
        data: {
          id: lineId,
          transactionId: txId,
          stakeholderId: body.toStakeholderId,
          shareClassId: body.shareClassId,
          quantityDelta: body.quantity,
        },
      }),
    ]).then(() => CapTableTransactionService.get(portfolioCompanyId, txId));
  }

  static async createTransfer(
    portfolioCompanyId: string,
    userId: string,
    body: {
      shareClassId: string;
      fromStakeholderId: string;
      toStakeholderId: string;
      quantity: number;
      issuanceDate?: string;
      notes?: string;
    }
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    if (body.quantity <= 0) throw Object.assign(new Error("Quantity must be positive"), { statusCode: 400 });

    const balance = await CapTableBalanceService.holderBalance(
      registry.id,
      body.fromStakeholderId,
      body.shareClassId
    );
    if (balance < body.quantity) {
      throw Object.assign(
        new Error(`Insufficient holdings: seller has ${balance}, transfer requires ${body.quantity}`),
        { statusCode: 400 }
      );
    }

    const txId = randomUUID();
    return prisma.$transaction([
      prisma.capTableTransaction.create({
        data: {
          id: txId,
          registryId: registry.id,
          transactionType: "TRANSFER",
          status: "DRAFT",
          shareClassId: body.shareClassId,
          quantity: body.quantity,
          issuanceDate: body.issuanceDate ? new Date(body.issuanceDate) : new Date(),
          fromStakeholderId: body.fromStakeholderId,
          toStakeholderId: body.toStakeholderId,
          notes: body.notes ?? null,
          createdById: userId,
        },
      }),
      prisma.capTableTransactionLine.create({
        data: {
          id: randomUUID(),
          transactionId: txId,
          stakeholderId: body.fromStakeholderId,
          shareClassId: body.shareClassId,
          quantityDelta: -body.quantity,
        },
      }),
      prisma.capTableTransactionLine.create({
        data: {
          id: randomUUID(),
          transactionId: txId,
          stakeholderId: body.toStakeholderId,
          shareClassId: body.shareClassId,
          quantityDelta: body.quantity,
        },
      }),
    ]).then(() => CapTableTransactionService.get(portfolioCompanyId, txId));
  }

  static async createFromDealPack(
    portfolioCompanyId: string,
    userId: string,
    dealExecutionPackId: string,
    items: Array<{
      shareClassCode: string;
      quantity: number;
      pricePerShare: number;
      investorStakeholderRef?: string;
    }>
  ) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const created: string[] = [];

    for (const item of items) {
      const shareClass = await prisma.capTableShareClass.findFirst({
        where: { registryId: registry.id, classCode: item.shareClassCode.toUpperCase() },
      });
      if (!shareClass) continue;

      let stakeholder = item.investorStakeholderRef
        ? await prisma.capTableStakeholder.findFirst({
            where: {
              registryId: registry.id,
              OR: [{ externalRef: item.investorStakeholderRef }, { id: item.investorStakeholderRef }],
            },
          })
        : null;
      if (!stakeholder) {
        stakeholder = await prisma.capTableStakeholder.create({
          data: {
            registryId: registry.id,
            displayName: item.investorStakeholderRef || `Investor ${dealExecutionPackId.slice(0, 8)}`,
            stakeholderType: "INVESTOR",
            externalRef: item.investorStakeholderRef ?? null,
          },
        });
      }

      const txId = randomUUID();
      await prisma.$transaction([
        prisma.capTableTransaction.create({
          data: {
            id: txId,
            registryId: registry.id,
            transactionType: "ISSUANCE",
            status: "DRAFT",
            shareClassId: shareClass.id,
            quantity: item.quantity,
            pricePerShare: item.pricePerShare,
            issuanceDate: new Date(),
            toStakeholderId: stakeholder.id,
            dealExecutionPackId,
            notes: `Auto-created from Deal Execution Pack ${dealExecutionPackId} (placeholder)`,
            createdById: userId,
          },
        }),
        prisma.capTableTransactionLine.create({
          data: {
            id: randomUUID(),
            transactionId: txId,
            stakeholderId: stakeholder.id,
            shareClassId: shareClass.id,
            quantityDelta: item.quantity,
          },
        }),
      ]);
      created.push(txId);
    }

    return { createdTransactionIds: created, dealExecutionPackId };
  }
}
