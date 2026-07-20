// @ts-nocheck
import { prisma } from "../../utils/database";

export type LpPortalRole = "VIEWER" | "SIGNATORY" | "MANAGER";

export interface LpPortalContext {
  clientId: string;
  lpRole: LpPortalRole | null;
  membershipId: string | null;
  fundScope: string[] | null;
  isStaff: boolean;
  userId?: string;
  displayName?: string | null;
}

const GP_ROLE_CODES = new Set(["admin", "fund_manager", "cfo", "FUND_MGR", "CFO"]);
const LP_ROLE_CODES = new Set([
  "LIMITED_PARTNER",
  "LP_VIEWER",
  "LP_INSTITUTIONAL_MANAGER",
]);

export function isGpStaff(user: any): boolean {
  const code = String(user?.roleCode || user?.role?.name || "").trim();
  return GP_ROLE_CODES.has(code) || code.toLowerCase() === "admin";
}

export function isSysAdmin(user: any): boolean {
  const code = String(user?.roleCode || user?.role?.name || "").trim().toLowerCase();
  return code === "admin";
}

export function isLpUser(user: any): boolean {
  const code = String(user?.roleCode || user?.role?.name || "").trim();
  return LP_ROLE_CODES.has(code);
}

export class LpPortalAccessService {
  static async resolveAccess(userId: string, staffClientId?: string): Promise<LpPortalContext> {
    const relation = await prisma.lpUserRelation.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const normalizeRole = (raw: string): LpPortalRole => {
      const r = String(raw || "VIEWER").toUpperCase();
      if (r === "SIGNATORY") return "SIGNATORY";
      if (r === "MANAGER" || r === "LP_MANAGER" || r === "ADMIN") return "MANAGER";
      return "VIEWER";
    };

    if (relation) {
      const fundIds = Array.isArray(relation.fundIds)
        ? (relation.fundIds as string[])
        : relation.fundIds
          ? (relation.fundIds as string[])
          : null;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });
      return {
        clientId: relation.clientId,
        lpRole: normalizeRole(relation.lpRole),
        membershipId: relation.id,
        fundScope: fundIds?.length ? fundIds : null,
        isStaff: false,
        userId,
        displayName:
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null,
      };
    }

    const legacyClient = await prisma.client.findUnique({
      where: { userId },
    });
    if (legacyClient && legacyClient.status === "ACTIVE") {
      return {
        clientId: legacyClient.id,
        lpRole: "VIEWER",
        membershipId: null,
        fundScope: null,
        isStaff: false,
        userId,
        displayName: null,
      };
    }

    if (staffClientId) {
      const client = await prisma.client.findUnique({ where: { id: staffClientId } });
      if (!client) throw Object.assign(new Error("Client not found"), { statusCode: 404 });
      return {
        clientId: staffClientId,
        lpRole: null,
        membershipId: null,
        fundScope: null,
        isStaff: true,
        userId,
        displayName: null,
      };
    }

    throw Object.assign(new Error("No active LP portal access"), { statusCode: 401 });
  }

  static async assertClientActive(clientId: string) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw Object.assign(new Error("LP profile not found"), { statusCode: 404 });
    if (client.status !== "ACTIVE")
      throw Object.assign(new Error("LP profile is not active"), { statusCode: 403 });
    return client;
  }

  static fundAllowed(ctx: LpPortalContext, fundId: string): boolean {
    if (!ctx.fundScope?.length) return true;
    return ctx.fundScope.includes(fundId);
  }

  static async revokeMembership(membershipId: string, revokedById?: string) {
    const rel = await prisma.lpUserRelation.findUnique({ where: { id: membershipId } });
    if (!rel) throw Object.assign(new Error("Membership not found"), { statusCode: 404 });

    await prisma.$transaction([
      prisma.lpUserRelation.update({
        where: { id: membershipId },
        data: { isActive: false, revokedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: rel.userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);

    return { membershipId, userId: rel.userId, revokedById };
  }
}
