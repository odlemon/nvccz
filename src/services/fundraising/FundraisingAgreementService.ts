// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService } from "../RemoteUploadService";
import { FundraisingDealService } from "./FundraisingDealService";
import { FundraisingCloseService } from "./FundraisingCloseService";

export class FundraisingAgreementService {
  static sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  static async get(dealId: string) {
    const agreement = await prisma.fundraisingDealAgreement.findUnique({ where: { dealId } });
    if (!agreement) {
      return { dealId, status: "DRAFT", fileUrl: null };
    }
    return agreement;
  }

  static async uploadSigned(
    dealId: string,
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string }
  ) {
    const deal = await FundraisingDealService.get(dealId);
    const sha256 = FundraisingAgreementService.sha256(file.buffer);

    const upload = await remoteUploadService.uploadFiles(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      "fundraising-subscription-agreements"
    );

    if (!upload.success || !upload.files?.[0]) {
      throw Object.assign(new Error("File upload failed"), { statusCode: 500 });
    }

    const fileUrl = upload.files[0].url || upload.files[0].filename;
    const signedAt = new Date();

    const agreement = await prisma.fundraisingDealAgreement.upsert({
      where: { dealId },
      create: {
        dealId,
        fileUrl,
        fileName: file.originalname,
        mimeType: file.mimetype,
        status: "SIGNED",
        signedAt,
        sha256,
        uploadedById: userId,
      },
      update: {
        fileUrl,
        fileName: file.originalname,
        mimeType: file.mimetype,
        status: "SIGNED",
        signedAt,
        sha256,
        uploadedById: userId,
      },
    });

    const wonStage = await prisma.fundraisingPipelineStage.findFirst({
      where: { campaignId: deal.campaignId, stageCode: "WON_SIGNED" },
    });
    if (wonStage && deal.stageId !== wonStage.id) {
      await prisma.fundraisingPipelineDeal.update({
        where: { id: dealId },
        data: { stageId: wonStage.id },
      });
    }

    await FundraisingCloseService.closeDeal(dealId, userId);

    return agreement;
  }
}
