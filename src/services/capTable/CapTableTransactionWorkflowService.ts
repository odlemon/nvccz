// @ts-nocheck
import { prisma } from "../../utils/database";
import { CapTableRegistryService } from "./CapTableRegistryService";
import { CapTableTransactionService } from "./CapTableTransactionService";

export class CapTableTransactionWorkflowService {
  static async submit(portfolioCompanyId: string, transactionId: string) {
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    if (tx.status !== "DRAFT") {
      throw Object.assign(new Error("Only DRAFT transactions can be submitted"), { statusCode: 400 });
    }
    return prisma.capTableTransaction.update({
      where: { id: transactionId },
      data: { status: "PENDING_APPROVAL" },
    });
  }

  static async approve(portfolioCompanyId: string, transactionId: string, userId: string) {
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    if (tx.status !== "PENDING_APPROVAL") {
      throw Object.assign(new Error("Only PENDING_APPROVAL transactions can be approved"), { statusCode: 400 });
    }
    return prisma.capTableTransaction.update({
      where: { id: transactionId },
      data: { approvedById: userId },
    });
  }

  static async reject(portfolioCompanyId: string, transactionId: string, notes?: string) {
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    if (!["DRAFT", "PENDING_APPROVAL"].includes(tx.status)) {
      throw Object.assign(new Error("Transaction cannot be rejected in current status"), { statusCode: 400 });
    }
    return prisma.capTableTransaction.update({
      where: { id: transactionId },
      data: { status: "REJECTED", notes: notes ?? tx.notes },
    });
  }
}
