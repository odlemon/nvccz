// @ts-nocheck
import { prisma } from "./database";

/** Role names (case-insensitive) that must not receive internal company newsletters (LP portal, investee/applicant). */
const EXCLUDED_ROLE_NAMES = new Set(["limited partner", "applicant"]);

/**
 * Users who should receive internal newsletter emails + notifications:
 * all users except investees (portfolio company portal users) and LPs,
 * and except the `applicant` role (investee onboarding).
 */
export async function findNewsletterInternalRecipientUsers(excludeUserId: string) {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const excludedRoleIds = roles
    .filter((r) => EXCLUDED_ROLE_NAMES.has(String(r.name ?? "").trim().toLowerCase()))
    .map((r) => r.id);

  return prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      portfolioCompany: { is: null },
      ...(excludedRoleIds.length > 0 ? { roleId: { notIn: excludedRoleIds } } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
}
