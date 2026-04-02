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
export function parseDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  if (typeof input !== "string") return new Date(input);

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(input)) {
    return new Date(`${input}T12:00:00.000Z`);
  }

  return new Date(input);
}
