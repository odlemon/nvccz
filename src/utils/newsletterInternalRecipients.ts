// @ts-nocheck
import { prisma } from "./database";

/** Role names (case-insensitive) that must not receive internal company newsletters. */
const EXCLUDED_ROLE_NAMES = new Set(["limited partner", "applicant"]);
const GLOBAL_SCOPE = "GLOBAL";

export type NewsletterRecipientConfigPayload = {
  includeUserIds?: string[];
  excludeUserIds?: string[];
  includeEmails?: string[];
  excludeEmails?: string[];
};

function normalizeEmailList(list: unknown): string[] {
  if (typeof list === "string") {
    try {
      return normalizeEmailList(JSON.parse(list));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const clean = list
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  return [...new Set(clean)];
}

function normalizeIdList(list: unknown): string[] {
  if (typeof list === "string") {
    try {
      return normalizeIdList(JSON.parse(list));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const clean = list.map((x) => String(x ?? "").trim()).filter(Boolean);
  return [...new Set(clean)];
}

/** Internal users (default newsletter audience) before manual include/exclude overrides. */
export async function listNewsletterBaseAudienceUsers(excludeUserId?: string) {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const excludedRoleIds = roles
    .filter((r) => EXCLUDED_ROLE_NAMES.has(String(r.name ?? "").trim().toLowerCase()))
    .map((r) => r.id);

  return prisma.user.findMany({
    where: {
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      portfolioCompany: { is: null }, // investees excluded
      ...(excludedRoleIds.length > 0 ? { roleId: { notIn: excludedRoleIds } } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: { select: { id: true, name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
  });
}

export async function getNewsletterRecipientConfig() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      include_user_ids: unknown;
      exclude_user_ids: unknown;
      include_emails: unknown;
      exclude_emails: unknown;
      updated_by_id: string | null;
      updated_at: Date | null;
    }>
  >(
    `SELECT include_user_ids, exclude_user_ids, include_emails, exclude_emails, updated_by_id, updated_at
     FROM newsletter_audience_configs
     WHERE scope = ?
     LIMIT 1`,
    GLOBAL_SCOPE
  );
  const row = rows[0];
  return {
    includeUserIds: normalizeIdList(row?.include_user_ids),
    excludeUserIds: normalizeIdList(row?.exclude_user_ids),
    includeEmails: normalizeEmailList(row?.include_emails),
    excludeEmails: normalizeEmailList(row?.exclude_emails),
    updatedById: row?.updated_by_id ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveNewsletterRecipientConfig(updatedById: string, payload: NewsletterRecipientConfigPayload) {
  const includeUserIds = normalizeIdList(payload.includeUserIds);
  const excludeUserIds = normalizeIdList(payload.excludeUserIds);
  const includeEmails = normalizeEmailList(payload.includeEmails);
  const excludeEmails = normalizeEmailList(payload.excludeEmails);

  const overlapUsers = includeUserIds.filter((id) => excludeUserIds.includes(id));
  if (overlapUsers.length) {
    throw new Error("A user cannot be in both includeUserIds and excludeUserIds.");
  }
  const overlapEmails = includeEmails.filter((email) => excludeEmails.includes(email));
  if (overlapEmails.length) {
    throw new Error("An email cannot be in both includeEmails and excludeEmails.");
  }

  const [knownUsers, baseUsers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...includeUserIds, ...excludeUserIds] } }, select: { id: true } }),
    listNewsletterBaseAudienceUsers(),
  ]);
  const knownUserSet = new Set(knownUsers.map((u) => u.id));
  const unknown = [...includeUserIds, ...excludeUserIds].filter((id) => !knownUserSet.has(id));
  if (unknown.length) {
    throw new Error(`Unknown user id(s): ${unknown.join(", ")}`);
  }
  const allowedUserSet = new Set(baseUsers.map((u) => u.id));
  const disallowedInclude = includeUserIds.filter((id) => !allowedUserSet.has(id));
  if (disallowedInclude.length) {
    throw new Error(
      `Only internal users can be included. Blocked includeUserIds: ${disallowedInclude.join(", ")}`
    );
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO newsletter_audience_configs
      (id, scope, include_user_ids, exclude_user_ids, include_emails, exclude_emails, updated_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      include_user_ids = VALUES(include_user_ids),
      exclude_user_ids = VALUES(exclude_user_ids),
      include_emails = VALUES(include_emails),
      exclude_emails = VALUES(exclude_emails),
      updated_by_id = VALUES(updated_by_id)`,
    `nacfg_${Date.now()}`,
    GLOBAL_SCOPE,
    JSON.stringify(includeUserIds),
    JSON.stringify(excludeUserIds),
    JSON.stringify(includeEmails),
    JSON.stringify(excludeEmails),
    updatedById
  );

  return getNewsletterRecipientConfig();
}

/**
 * Resolve recipients used by newsletter create:
 * - userRecipients: users for in-app notification + email
 * - extraEmailRecipients: email-only recipients from includeEmails minus excludes
 */
export async function resolveNewsletterRecipients(excludeUserId: string) {
  const [baseUsers, cfg] = await Promise.all([
    listNewsletterBaseAudienceUsers(excludeUserId),
    getNewsletterRecipientConfig(),
  ]);
  const byId = new Map(baseUsers.map((u) => [u.id, u]));
  const byEmail = new Map(baseUsers.map((u) => [String(u.email).toLowerCase(), u.id]));

  // If includeUserIds is set, it acts as a whitelist. Otherwise use all base users.
  const includeSet = new Set(cfg.includeUserIds);
  const baseSelected =
    cfg.includeUserIds.length > 0 ? baseUsers.filter((u) => includeSet.has(u.id)) : baseUsers;

  // Then apply explicit user-id/email exclusions.
  const excludedUserIds = new Set(cfg.excludeUserIds);
  for (const email of cfg.excludeEmails) {
    const id = byEmail.get(email);
    if (id) excludedUserIds.add(id);
  }
  const userRecipients = baseSelected.filter((u) => !excludedUserIds.has(u.id));

  // Manual include emails are extra email-only recipients unless they map to an excluded user.
  const excludedEmails = new Set(cfg.excludeEmails);
  const userEmailSet = new Set(userRecipients.map((u) => String(u.email).toLowerCase()));
  const extraEmailRecipients = cfg.includeEmails.filter(
    (email) => !excludedEmails.has(email) && !userEmailSet.has(email)
  );

  return { userRecipients, extraEmailRecipients, config: cfg };
}
