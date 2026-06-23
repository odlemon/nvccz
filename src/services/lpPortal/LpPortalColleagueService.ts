// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

export class LpPortalColleagueService {
  static async listColleagues(ctx: LpPortalContext) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw Object.assign(new Error("Manager access required"), { statusCode: 403 });

    const rows = await prisma.lpUserRelation.findMany({
      where: { clientId: ctx.clientId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: rows.map((r) => ({
        membershipId: r.id,
        userId: r.userId,
        email: r.user.email,
        name: `${r.user.firstName} ${r.user.lastName}`,
        lpRole: r.lpRole,
        isActive: r.isActive,
        revokedAt: r.revokedAt,
      })),
    };
  }

  static async inviteViewer(ctx: LpPortalContext, params: { email: string; invitedById: string }) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw Object.assign(new Error("Manager access required"), { statusCode: 403 });

    const email = params.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw Object.assign(new Error("User not found — invite must match an existing account"), { statusCode: 404 });

    const existing = await prisma.lpUserRelation.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: ctx.clientId } },
    });
    if (existing?.isActive) throw Object.assign(new Error("User already has active access"), { statusCode: 409 });

    if (existing) {
      return prisma.lpUserRelation.update({
        where: { id: existing.id },
        data: { isActive: true, lpRole: "VIEWER", revokedAt: null, invitedById: params.invitedById },
      });
    }

    return prisma.lpUserRelation.create({
      data: {
        userId: user.id,
        clientId: ctx.clientId,
        lpRole: "VIEWER",
        invitedById: params.invitedById,
      },
    });
  }

  static async revokeViewer(ctx: LpPortalContext, membershipId: string) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw Object.assign(new Error("Manager access required"), { statusCode: 403 });

    const rel = await prisma.lpUserRelation.findUnique({ where: { id: membershipId } });
    if (!rel || rel.clientId !== ctx.clientId)
      throw Object.assign(new Error("Membership not found"), { statusCode: 404 });
    if (rel.lpRole === "MANAGER")
      throw Object.assign(new Error("Cannot revoke manager via colleague API"), { statusCode: 403 });

    return LpPortalAccessService.revokeMembership(membershipId);
  }
}
