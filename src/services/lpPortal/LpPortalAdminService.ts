// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import { LpPortalAccessService } from "./LpPortalAccessService";
import { LpPortalVaultService } from "./LpPortalVaultService";
import { LpPortalInviteService } from "./LpPortalInviteService";

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

  /**
   * Grant an investor access to a client's portal.
   *
   * Accepts either an existing `userId` or an `email`. The email form is what makes this an
   * actual invitation: previously only `userId` was accepted, so a GP admin could not onboard
   * anyone who did not already have an account, and nobody was ever notified they had access.
   * Passing `email` creates the account when needed and sends an activation link.
   */
  static async createMembership(params: {
    clientId: string;
    userId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    lpRole?: "VIEWER" | "MANAGER";
    fundIds?: string[];
    invitedById: string;
  }) {
    const client = await prisma.client.findUnique({ where: { id: params.clientId } });
    if (!client) throw Object.assign(new Error("Client not found"), { statusCode: 404 });

    let user: any = null;
    let invite: { created: boolean; activationEmailSent: boolean } | null = null;

    if (params.userId) {
      user = await prisma.user.findUnique({ where: { id: params.userId } });
      if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
    } else if (params.email) {
      const inviter = await prisma.user.findUnique({
        where: { id: params.invitedById },
        select: { firstName: true, lastName: true },
      });
      const res = await LpPortalInviteService.onboard({
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        organisationName: (client as any).legalName ?? null,
        invitedByName: inviter ? `${inviter.firstName ?? ""} ${inviter.lastName ?? ""}`.trim() || null : null,
      });
      user = res.user;
      invite = { created: res.created, activationEmailSent: res.activationEmailSent };
    } else {
      throw Object.assign(new Error("Either userId or email is required"), { statusCode: 400 });
    }

    const userId = user.id as string;

    const existing = await prisma.lpUserRelation.findUnique({
      where: { userId_clientId: { userId, clientId: params.clientId } },
    });
    if (existing) {
      const membership = await prisma.lpUserRelation.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lpRole: params.lpRole || "VIEWER",
          fundIds: params.fundIds ?? undefined,
          revokedAt: null,
          invitedById: params.invitedById,
        },
      });
      return { ...membership, invite };
    }

    await prisma.client.update({
      where: { id: params.clientId },
      data: { userId },
    });

    const membership = await prisma.lpUserRelation.create({
      data: {
        userId,
        clientId: params.clientId,
        lpRole: params.lpRole || "VIEWER",
        fundIds: params.fundIds ?? undefined,
        invitedById: params.invitedById,
      },
    });
    // `invite` tells the caller whether an account was created and whether the activation email
    // actually went out, so the UI can offer a resend instead of implying delivery.
    return { ...membership, invite };
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
