// @ts-nocheck
import { prisma } from "../../utils/database";
import { CapTableBalanceService } from "./CapTableBalanceService";
import { CapTableCertificateService } from "./CapTableCertificateService";
import { CapTableGlPostingService } from "./CapTableGlPostingService";
import { CapTableLpPortalHook } from "./CapTableLpPortalHook";
import { CapTablePortfolioSyncService } from "./CapTablePortfolioSyncService";
import { CapTableRegistryService } from "./CapTableRegistryService";
import { CapTableTransactionService } from "./CapTableTransactionService";

export class CapTableTransactionExecutionService {
  static async execute(portfolioCompanyId: string, transactionId: string, userId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT id FROM cap_table_registries WHERE id = ? FOR UPDATE`,
        registry.id
      );

      const row = await tx.capTableTransaction.findFirst({
        where: { id: transactionId, registryId: registry.id },
        include: { shareClass: true, lines: true },
      });
      if (!row) throw Object.assign(new Error("Transaction not found"), { statusCode: 404 });
      if (row.status === "EXECUTED") return row;
      if (row.status !== "PENDING_APPROVAL") {
        throw Object.assign(new Error("Only PENDING_APPROVAL transactions can be executed"), { statusCode: 400 });
      }

      if (row.shareClassId) {
        await tx.$queryRawUnsafe(
          `SELECT id FROM cap_table_share_classes WHERE id = ? FOR UPDATE`,
          row.shareClassId
        );
      }

      if (row.transactionType === "TRANSFER" && row.fromStakeholderId && row.shareClassId) {
        const balance = await CapTableBalanceService.holderBalance(
          registry.id,
          row.fromStakeholderId,
          row.shareClassId
        );
        if (balance < Number(row.quantity)) {
          throw Object.assign(new Error("Insufficient seller balance at execution time"), { statusCode: 400 });
        }
      }

      if (row.transactionType === "ISSUANCE" && row.shareClassId) {
        const issued = await CapTableBalanceService.holderBalances(registry.id);
        const classIssued = issued
          .filter((b) => b.shareClassId === row.shareClassId)
          .reduce((s, b) => s + b.shares, 0);
        const pendingQty = Number(row.quantity);
        const authorized = Number(row.shareClass?.authorizedShares ?? 0);
        if (classIssued + pendingQty > authorized) {
          throw Object.assign(
            new Error(`Issuance exceeds authorized shares (${authorized} authorized, ${classIssued} issued)`),
            { statusCode: 400 }
          );
        }
      }

      let journalEntryId: string | null = null;
      if (row.transactionType === "ISSUANCE" && row.shareClass) {
        journalEntryId = await CapTableGlPostingService.postIssuance({
          userId,
          portfolioCompanyId,
          registryId: registry.id,
          quantity: Number(row.quantity),
          pricePerShare: Number(row.pricePerShare ?? 0),
          parValue: Number(row.shareClass.parValue),
          issuanceDate: row.issuanceDate ?? new Date(),
          referenceNumber: `CAP-TX-${transactionId}`,
          description: `Cap table stock issuance — ${row.shareClass.className}`,
        });
      }

      const executed = await tx.capTableTransaction.update({
        where: { id: transactionId },
        data: {
          status: "EXECUTED",
          executedAt: new Date(),
          approvedById: row.approvedById ?? userId,
          journalEntryId,
        },
        include: { shareClass: true, toStakeholder: true, lines: true },
      });

      return executed;
    }).then(async (executed) => {
      if (executed.transactionType === "ISSUANCE") {
        await CapTableCertificateService.generateForTransaction(portfolioCompanyId, transactionId).catch(() => null);
      }
      await CapTablePortfolioSyncService.sync(portfolioCompanyId);
      await CapTableLpPortalHook.afterExecuted(portfolioCompanyId, transactionId);
      return CapTableTransactionService.get(portfolioCompanyId, transactionId);
    });
  }
}
