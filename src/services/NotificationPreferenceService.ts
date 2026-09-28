// Gates the four notification categories the Matanho AI home module's Settings modal exposes
// (calendarAlerts / newsDigest / forumMentions / performanceReminders) against each recipient's
// saved preference, stored in the `settings` JSON column on `home_preferences` (see
// HomepageController.updateMyHomePreference). Read with raw SQL, matching the rest of this
// table's access — the generated Prisma Client in this checkout predates the column.
//
// Only wired into the notification-creation call sites that map cleanly onto one of these four
// toggles (new event, new post split by News/Forums category, new newsletter, performance
// review/goal reminders). Everything else (task assignment, procurement/FP&A/vendor alerts, etc.)
// has no corresponding Settings toggle and is left alone.
import { prisma } from "../utils/database";

export type NotificationPreferenceKey =
  | "calendarAlerts"
  | "newsDigest"
  | "forumMentions"
  | "performanceReminders";

// A user who has never opened Settings has no home_preferences row (or one with no `settings`
// blob) at all — default to notifying them, so silence is opt-in, never the accidental default.
export async function filterUsersByNotificationPreference(
  userIds: string[],
  key: NotificationPreferenceKey
): Promise<string[]> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const placeholders = unique.map(() => "?").join(",");
  const rows: Array<{ user_id: string; settings: unknown }> = await prisma.$queryRawUnsafe(
    `SELECT user_id, settings FROM home_preferences WHERE user_id IN (${placeholders})`,
    ...unique
  );

  const disabled = new Set<string>();
  for (const row of rows) {
    const raw = row.settings;
    if (raw == null) continue;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && parsed[key] === false) disabled.add(row.user_id);
    } catch {
      // Malformed settings blob: fail open (don't suppress a notification over bad JSON).
    }
  }

  return unique.filter((id) => !disabled.has(id));
}
