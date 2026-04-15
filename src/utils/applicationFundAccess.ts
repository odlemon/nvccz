// @ts-nocheck
/**
 * Deal access gate (optional hard isolation).
 * While UAT/testing: any authenticated user may access deals — re-enable strict checks with
 * `NVCCZ_STRICT_DEAL_ACCESS=true` (fund manager / assigned analyst / DD reviewer / exec roles).
 */
export async function userCanAccessApplication(
  user: { id: string; role?: { name?: string | null } | null },
  application: {
    id: string;
    fundId?: string | null;
    assignedAnalystId?: string | null;
    dueDiligenceReview?: { reviewerId?: string | null } | null;
  }
): Promise<boolean> {
  if (!user?.id) return false;

  if (process.env.NVCCZ_STRICT_DEAL_ACCESS !== "true") {
    return true;
  }

  const { prisma } = await import("./database");
  const PRIVILEGED_ROLE_NAMES = new Set(["admin", "ceo", "cio"]);
  const roleName = String(user.role?.name || "").trim().toLowerCase();
  if (PRIVILEGED_ROLE_NAMES.has(roleName)) {
    return true;
  }

  if (application.assignedAnalystId && application.assignedAnalystId === user.id) {
    return true;
  }

  if (application.dueDiligenceReview?.reviewerId === user.id) {
    return true;
  }

  const fundId = application.fundId;
  if (!fundId) {
    return false;
  }

  const fm = await prisma.fundManager.findFirst({
    where: { fundId, userId: user.id, isActive: true },
    select: { id: true }
  });
  return Boolean(fm);
}
