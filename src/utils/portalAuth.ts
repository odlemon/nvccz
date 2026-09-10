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

/**
 * Account types that belong to an external portal and must never be admitted to
 * the staff portal.
 *
 * This exists because the staff branch of assertPortalLoginAllowed ends in a
 * default `return { ok: true }`. An INVESTEE account matched none of the earlier
 * cases -- its role NAME is "INVESTEE" and its roleCode is null, so the
 * applicant check missed it -- and fell through to that default. It could then
 * sign in to the staff portal, read the entire staff directory through
 * GET /api/users, and create an IT_MGR account.
 *
 * Narrowing the staff portal to isGpStaff() instead would lock out almost
 * everyone: GP_ROLE_CODES is only {admin, fund_manager, cfo}, so HR, Payroll,
 * Operations and Analyst roles are not "GP staff". Classifying the external
 * types is the change that closes the hole without taking the platform down.
 */
const EXTERNAL_PORTAL_ROLE_TOKENS = new Set([
  "investee",
  "applicant",
  "limited_partner",
  "lp_viewer",
  "lp_institutional_manager",
]);

export function isExternalPortalUser(user: any): boolean {
  const name = String(user?.role?.name || "").trim().toLowerCase();
  const code = String(user?.roleCode || "").trim().toLowerCase();
  return EXTERNAL_PORTAL_ROLE_TOKENS.has(name) || EXTERNAL_PORTAL_ROLE_TOKENS.has(code);
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
  // Any account belonging to an external portal is refused here regardless of
  // whether the checks above happened to recognise it.
  if (isExternalPortalUser(user)) {
    return { ok: false, message: "This account is not authorized for the staff portal." };
  }
  return { ok: true };
}
