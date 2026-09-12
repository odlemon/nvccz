// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { buildStockCertificatePdfBuffer } from "../../utils/capTableCertificatePdf";
import { remoteUploadService } from "../RemoteUploadService";
import { CapTableRegistryService } from "./CapTableRegistryService";
import { CapTableTransactionService } from "./CapTableTransactionService";

export class CapTableCertificateService {
  static sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  static async generateForTransaction(portfolioCompanyId: string, transactionId: string) {
    const registry = await CapTableRegistryService.getByPortfolioCompanyId(portfolioCompanyId);
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    if (tx.transactionType !== "ISSUANCE") {
      throw Object.assign(new Error("Certificates only apply to issuances"), { statusCode: 400 });
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { name: true },
    });

    const pdfBuffer = await buildStockCertificatePdfBuffer({
      companyName: company?.name || "Portfolio Company",
      stakeholderName: tx.toStakeholder?.displayName || "Holder",
      shareClassName: tx.shareClass?.className || "Shares",
      quantity: Number(tx.quantity),
      certificateNumber: transactionId.slice(0, 12).toUpperCase(),
      issuanceDateLabel: (tx.issuanceDate ?? new Date()).toISOString().slice(0, 10),
      sha256Preview: "(pending)",
    });

    const sha256 = CapTableCertificateService.sha256(pdfBuffer);
    const filename = `Stock-Certificate-${transactionId.slice(0, 8)}.pdf`;

    let storagePath: string | null = null;
    try {
      const upload = await remoteUploadService.uploadFiles(
        {
          buffer: pdfBuffer,
          originalname: filename,
          mimetype: "application/pdf",
        },
        "cap-table-certificates"
      );
      if (upload.success && upload.files?.[0]) {
        storagePath = upload.files[0].url || upload.files[0].filename || null;
      }
    } catch {
      storagePath = null;
    }

    await prisma.capTableTransaction.update({
      where: { id: transactionId },
      data: {
        certificateSha256: sha256,
        certificateStoragePath: storagePath,
      },
    });

    return { transactionId, sha256, storagePath };
  }

  static async getCertificateBuffer(portfolioCompanyId: string, transactionId: string): Promise<Buffer> {
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    if (tx.transactionType !== "ISSUANCE") {
      throw Object.assign(new Error("Certificate not available"), { statusCode: 404 });
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { name: true },
    });

    return buildStockCertificatePdfBuffer({
      companyName: company?.name || "Portfolio Company",
      stakeholderName: tx.toStakeholder?.displayName || "Holder",
      shareClassName: tx.shareClass?.className || "Shares",
      quantity: Number(tx.quantity),
      certificateNumber: transactionId.slice(0, 12).toUpperCase(),
      issuanceDateLabel: (tx.issuanceDate ?? new Date()).toISOString().slice(0, 10),
      sha256Preview: tx.certificateSha256 || "unverified",
    });
  }

  static async verify(portfolioCompanyId: string, transactionId: string) {
    const tx = await CapTableTransactionService.get(portfolioCompanyId, transactionId);
    if (!tx.certificateSha256) {
      return { valid: false, sha256: null };
    }
    const buf = await CapTableCertificateService.getCertificateBuffer(portfolioCompanyId, transactionId);
    const computed = CapTableCertificateService.sha256(buf);
    return {
      valid: computed === tx.certificateSha256,
      sha256: tx.certificateSha256,
      computedSha256: computed,
    };
  }
}
