// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalVaultService } from "../lpPortal/LpPortalVaultService";

export class TaxReturnPackPublishService {
  static async resolvePortalClientId(fundId: string): Promise<string | null> {
    const commitment = await prisma.investmentCommitment.findFirst({
      where: { fundId, status: { in: ["ACTIVE", "PENDING"] } },
      select: { clientId: true },
      orderBy: { createdAt: "asc" },
    });
    return commitment?.clientId ?? null;
  }

  static async publishPack(args: {
    pack: { id: string; fundId?: string | null; taxYear: number; taxPeriod: string; forecastEntity?: { name?: string } };
    pdfUrl: string;
    storagePath?: string | null;
    sha256: string;
    approvedById: string;
  }): Promise<string | null> {
    if (!args.pack.fundId) return null;

    const clientId = await TaxReturnPackPublishService.resolvePortalClientId(args.pack.fundId);
    if (!clientId) return null;

    const title = `${args.pack.forecastEntity?.name || "Entity"} — Tax Return ${args.pack.taxPeriod} ${args.pack.taxYear}`;
    const doc = await LpPortalVaultService.publishDocument({
      clientId,
      fundId: args.pack.fundId,
      category: "TAX",
      title,
      fileUrl: args.pdfUrl,
      storagePath: args.storagePath || undefined,
      sha256: args.sha256,
      publishedById: args.approvedById,
      sourceType: "TAX_RETURN_PACK_SYNC",
      sourceRefId: args.pack.id,
    });

    return doc.id;
  }
}
