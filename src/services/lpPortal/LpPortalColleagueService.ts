// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";
import { LpPortalError, normalizeLpRole } from "../../middleware/lpPortalFoundation";
import { LpPortalInviteService } from "./LpPortalInviteService";

export class LpPortalColleagueService {
  static async listColleagues(ctx: LpPortalContext) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw new LpPortalError("LP_FORBIDDEN", "Manager access required", 403);

    const rows = await prisma.lpUserRelation.findMany({
      where: { clientId: ctx.clientId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, lastSeen: true } } },
      orderBy: { createdAt: "desc" },
    });

    const userIds = rows.map((r) => r.userId);
    const mfaRows = userIds.length
      ? await prisma.userMfaTotp.findMany({ where: { userId: { in: userIds } } })
      : [];
    const mfaByUser = new Map(mfaRows.map((m) => [m.userId, m]));

    return {
      data: rows.map((r) => ({
        membershipId: r.id,
        userId: r.userId,
        email: r.user.email,
        name: `${r.user.firstName} ${r.user.lastName}`,
        lpRole: normalizeLpRole(r.lpRole),
        fundIds: Array.isArray(r.fundIds) ? r.fundIds : r.fundIds || null,
        isActive: r.isActive,
        status: !r.isActive ? "SUSPENDED" : r.revokedAt ? "SUSPENDED" : "ACTIVE",
        revokedAt: r.revokedAt,
        mfaEnabled: Boolean(mfaByUser.get(r.userId)?.enabledAt),
        lastActiveAt: r.user.lastSeen?.toISOString?.() ?? null,
      })),
    };
  }

  static async inviteColleague(
    ctx: LpPortalContext,
    params: {
      email: string;
      invitedById: string;
      role?: string;
      fundIds?: string[];
    }
  ) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw new LpPortalError("LP_FORBIDDEN", "Manager access required", 403);

    const email = params.email.trim().toLowerCase();
    const role = normalizeLpRole(params.role || "VIEWER");
    if (role === "MANAGER" && !ctx.isStaff) {
      throw new LpPortalError("LP_FORBIDDEN", "Cannot invite another MANAGER via portal", 403);
    }

    // Previously this threw "User not found — invite must match an existing account", which
    // meant an LP manager could only ever grant access to somebody who had already been created
    // by hand elsewhere. Inviting a genuinely new colleague was impossible from the portal.
    // The account is now created on demand with no usable password, and the invitee receives an
    // activation link to set their own (see LpPortalInviteService).
    const client = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { legalName: true },
    });
    const { user, created, activationEmailSent } = await LpPortalInviteService.onboard({
      email,
      organisationName: client?.legalName ?? null,
    });
    if (created && !activationEmailSent) {
      // The membership below still commits — the invitee exists and is authorised — but the
      // caller must know the email did not go out so it can offer a resend.
      console.warn(`[LP invite] account created for ${email} but the invitation email failed`);
    }

    let fundIds = params.fundIds;
    if (fundIds?.length && ctx.fundScope?.length) {
      fundIds = fundIds.filter((id) => ctx.fundScope!.includes(id));
    }

    const existing = await prisma.lpUserRelation.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: ctx.clientId } },
    });
    if (existing?.isActive)
      throw new LpPortalError("LP_VERSION_CONFLICT", "User already has active access", 409);

    if (existing) {
      return prisma.lpUserRelation.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lpRole: role,
          fundIds: fundIds ?? existing.fundIds,
          revokedAt: null,
          invitedById: params.invitedById,
        },
      });
    }

    return prisma.lpUserRelation.create({
      data: {
        userId: user.id,
        clientId: ctx.clientId,
        lpRole: role,
        fundIds: fundIds ?? undefined,
        invitedById: params.invitedById,
      },
    });
  }

  /** @deprecated use inviteColleague */
  static async inviteViewer(ctx: LpPortalContext, params: { email: string; invitedById: string }) {
    return this.inviteColleague(ctx, params);
  }

  static async patchColleague(
    ctx: LpPortalContext,
    membershipId: string,
    patch: { role?: string; fundIds?: string[] }
  ) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw new LpPortalError("LP_FORBIDDEN", "Manager access required", 403);

    const rel = await prisma.lpUserRelation.findUnique({ where: { id: membershipId } });
    if (!rel || rel.clientId !== ctx.clientId)
      throw new LpPortalError("LP_NOT_FOUND", "Membership not found", 404);

    const role = patch.role != null ? normalizeLpRole(patch.role) : undefined;
    if (role === "MANAGER" && !ctx.isStaff) {
      throw new LpPortalError("LP_FORBIDDEN", "Cannot promote to MANAGER via portal", 403);
    }

    let fundIds = patch.fundIds;
    if (fundIds?.length && ctx.fundScope?.length) {
      fundIds = fundIds.filter((id) => ctx.fundScope!.includes(id));
    }

    return prisma.lpUserRelation.update({
      where: { id: membershipId },
      data: {
        ...(role ? { lpRole: role } : {}),
        ...(fundIds !== undefined ? { fundIds } : {}),
      },
    });
  }

  static async revokeViewer(ctx: LpPortalContext, membershipId: string) {
    if (ctx.lpRole !== "MANAGER" && !ctx.isStaff)
      throw new LpPortalError("LP_FORBIDDEN", "Manager access required", 403);

    const rel = await prisma.lpUserRelation.findUnique({ where: { id: membershipId } });
    if (!rel || rel.clientId !== ctx.clientId)
      throw new LpPortalError("LP_NOT_FOUND", "Membership not found", 404);
    if (rel.lpRole === "MANAGER")
      throw new LpPortalError("LP_FORBIDDEN", "Cannot revoke manager via colleague API", 403);

    return LpPortalAccessService.revokeMembership(membershipId);
  }
}
