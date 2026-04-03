/**
 * Parse a date string safely for storage.
 *
 * When the frontend sends a date-only string like "2026-04-02",
 * `new Date("2026-04-02")` interprets it as midnight UTC (2026-04-02T00:00:00Z).
 * In UTC+2 (Zimbabwe) that renders as April 1st — off by one day.
 *
 * This helper detects date-only strings and sets the time to noon UTC,
 * so the date survives any timezone offset without rolling backward.
 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  if (typeof input !== "string") return new Date(input);

  if (DATE_ONLY_PATTERN.test(input)) {
    return new Date(`${input}T12:00:00.000Z`);
  }

  return new Date(input);
}

/**
 * UTC calendar-day bounds for filter queries when the client sends YYYY-MM-DD.
 * Uses the same noon-UTC anchor as {@link parseDate} so listed/stored dates stay in sync
 * (avoids server-local setHours shifting "April 2" into "April 1" on UTC+2 hosts).
 */
export function parseDateOnlyUtcStart(dateOnly: string): Date | null {
  const s = dateOnly.trim();
  if (!DATE_ONLY_PATTERN.test(s)) return null;
  const d = parseDate(s);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function parseDateOnlyUtcEnd(dateOnly: string): Date | null {
  const s = dateOnly.trim();
  if (!DATE_ONLY_PATTERN.test(s)) return null;
  const d = parseDate(s);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
