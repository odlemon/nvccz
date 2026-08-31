// @ts-nocheck
import { prisma } from "../utils/database";
import { isGpStaff, isLpUser } from "../services/lpPortal/LpPortalAccessService";

export type AuthPortal = "staff" | "lp" | "investee";

export function normalizeAuthPortal(raw: unknown): AuthPortal {
  const p = String(raw || "staff").trim().toLowerCase();
  if (p === "lp" || p === "investee") return p;
  return "staff";
}

export async function resolveApplicantFlag(userId: string, email: string): Promise<boolean> {
  const application = await prisma.application.findFirst({
    where: { applicantEmail: email.trim().toLowerCase() },
  });
  if (application) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: { select: { name: true } }, roleCode: true },
  });
  const role = String(user?.roleCode || user?.role?.name || "").toLowerCase();
  return role === "applicant";
}

export async function resolveLpAccess(userId: string): Promise<boolean> {
  const relation = await prisma.lpUserRelation.findFirst({
    where: { userId, isActive: true },
  });
  if (relation) return true;
  const legacyClient = await prisma.client.findUnique({ where: { userId } });
  if (legacyClient && legacyClient.status === "ACTIVE") return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return isLpUser(user) || isGpStaff(user);
}

export async function assertPortalLoginAllowed(
  portal: AuthPortal,
  user: any,
  email: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const roleName = String(user?.role?.name || "").trim().toLowerCase();
  const roleCode = String(user?.roleCode || "").trim();
  const isApplicant =
    roleName === "applicant" ||
    roleCode.toLowerCase() === "applicant" ||
    (await resolveApplicantFlag(user.id, email));
  const hasLp = await resolveLpAccess(user.id);
  const isStaffUser = isGpStaff(user) || roleName === "admin" || roleCode.toLowerCase() === "admin";

  if (portal === "investee") {
    if (!isApplicant) {
      return { ok: false, message: "This account is not authorized for the investee portal." };
    }
    return { ok: true };
  }

  if (portal === "lp") {
    if (!hasLp) {
      return { ok: false, message: "This account is not authorized for the LP portal." };
    }
    return { ok: true };
  }

  // staff portal
  if (isStaffUser) {
    return { ok: true };
  }
  if (isApplicant) {
    return { ok: false, message: "Applicant accounts must use the investee portal." };
  }
  if (hasLp && isLpUser(user)) {
    return { ok: false, message: "LP accounts must use the LP portal." };
  }
  return { ok: true };
}
