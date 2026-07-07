// @ts-nocheck
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../../utils/database";

export class InvestmentDocumentationService {
  static async list(filters: { fundId?: string; documentType?: string }) {
    const where: any = {};
    if (filters.fundId) where.fundId = filters.fundId;
    if (filters.documentType) where.documentType = filters.documentType;
    return prisma.investmentDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  static async upload(data: {
    fundId?: string;
    documentType: string;
    title: string;
    contentBase64?: string;
    fileRef?: string;
    orderId?: string;
    tradeId?: string;
    userId: string;
  }) {
    let fileRef = data.fileRef;
    if (data.contentBase64) {
      const dir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-docs");
      await mkdir(dir, { recursive: true });
      const fname = `${Date.now()}-${data.title.replace(/\W+/g, "_")}.bin`;
      fileRef = path.join(dir, fname);
      await writeFile(fileRef, Buffer.from(data.contentBase64, "base64"));
    }
    if (!fileRef) throw new Error("fileRef or contentBase64 required");
    return prisma.investmentDocument.create({
      data: {
        fundId: data.fundId,
        documentType: data.documentType,
        title: data.title,
        fileRef,
        orderId: data.orderId,
        tradeId: data.tradeId,
        uploadedById: data.userId,
        approvalStatus: "PENDING",
      },
    });
  }

  static async get(id: string) {
    return prisma.investmentDocument.findUnique({ where: { id } });
  }
}
