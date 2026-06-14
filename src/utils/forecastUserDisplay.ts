// @ts-nocheck

/** Display name for forecast API responses (never expose raw user ids to the UI). */
export function formatForecastUserName(
  user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined
): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
}

export function formatForecastAuditUserName(
  user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined
): string {
  return formatForecastUserName(user) || "System";
}
