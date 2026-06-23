// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import { LpPortalAccessService } from "./LpPortalAccessService";
import { LpPortalVaultService } from "./LpPortalVaultService";

export class LpPortalAdminService {
  static async listMemberships(clientId?: string) {
    const where = clientId ? { clientId } : {};
    const rows = await prisma.lpUserRelation.findMany({
      where,
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        client: { select: { legalName: true, investorId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: rows.map((r) => ({
        membershipId: r.id,
        clientId: r.clientId,
        clientName: r.client.legalName,
        userId: r.userId,
        email: r.user.email,
        lpRole: r.lpRole,
        isActive: r.isActive,
        revokedAt: r.revokedAt,
      })),
    };
  }

  static async createMembership(params: {
    clientId: string;
    userId: string;
    lpRole?: "VIEWER" | "MANAGER";
    fundIds?: string[];
    invitedById: string;
  }) {
    const client = await prisma.client.findUnique({ where: { id: params.clientId } });
    if (!client) throw Object.assign(new Error("Client not found"), { statusCode: 404 });
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

    const existing = await prisma.lpUserRelation.findUnique({
      where: { userId_clientId: { userId: params.userId, clientId: params.clientId } },
    });
    if (existing) {
      return prisma.lpUserRelation.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lpRole: params.lpRole || "VIEWER",
          fundIds: params.fundIds ?? undefined,
          revokedAt: null,
          invitedById: params.invitedById,
        },
      });
    }

    await prisma.client.update({
      where: { id: params.clientId },
      data: { userId: params.userId },
    });

    return prisma.lpUserRelation.create({
      data: {
        userId: params.userId,
        clientId: params.clientId,
        lpRole: params.lpRole || "VIEWER",
        fundIds: params.fundIds ?? undefined,
        invitedById: params.invitedById,
      },
    });
  }

  static async revokeMembership(membershipId: string) {
    return LpPortalAccessService.revokeMembership(membershipId);
  }

  static async publishDocument(params: {
    clientId: string;
    fundId?: string;
    category: string;
    title: string;
    fileBuffer: Buffer;
    mimeType: string;
    publishedById: string;
  }) {
    const sha256 = crypto.createHash("sha256").update(params.fileBuffer).digest("hex");
    const RemoteUploadService = (await import("../RemoteUploadService")).default;
    const upload = new RemoteUploadService();
    const filename = params.title.replace(/[^\w.-]+/g, "-") + ".pdf";
    const staged = await upload.uploadSingleFile(params.fileBuffer, "lp-portal-vault");

    return LpPortalVaultService.publishDocument({
      clientId: params.clientId,
      fundId: params.fundId,
      category: params.category,
      title: params.title,
      fileUrl: staged.downloadURL,
      storagePath: staged.filePath,
      sha256,
      publishedById: params.publishedById,
      sourceType: "GP_UPLOAD",
    });
  }

  static async getMfaPolicy() {
    let policy = await prisma.lpPortalMfaPolicy.findUnique({ where: { id: "default" } });
    if (!policy) {
      policy = await prisma.lpPortalMfaPolicy.create({
        data: { id: "default", requireMfaForLp: false, issuerName: "Arcus LP Portal" },
      });
    }
    return policy;
  }

  static async updateMfaPolicy(params: { requireMfaForLp?: boolean; issuerName?: string }) {
    return prisma.lpPortalMfaPolicy.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        requireMfaForLp: params.requireMfaForLp ?? false,
        issuerName: params.issuerName ?? "Arcus LP Portal",
      },
      update: {
        ...(params.requireMfaForLp !== undefined ? { requireMfaForLp: params.requireMfaForLp } : {}),
        ...(params.issuerName !== undefined ? { issuerName: params.issuerName } : {}),
      },
    });
  }
}
