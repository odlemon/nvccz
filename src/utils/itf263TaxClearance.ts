/**
 * Best-effort parsing of expiry dates from ZIMRA Tax Clearance (ITF263) certificate text or metadata.
 * Real certificates vary; callers may supply {@link taxClearanceExpiryDate} ISO when OCR is done upstream.
 */

function parseTwoDigitYear(yy: number): number {
  if (yy >= 100) return yy;
  return yy < 50 ? 2000 + yy : 1900 + yy;
}

function buildUtcDate(day: number, month: number, year: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const y = year < 100 ? parseTwoDigitYear(year) : year;
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Parse DD/MM/YYYY, DD-MM-YYYY, or MM/DD/YYYY when day > 12.
 */
export function parseDateFromParts(
  a: number,
  b: number,
  c: number
): Date | null {
  // If first part > 12, treat as DD/MM/YYYY
  if (a > 12) {
    return buildUtcDate(a, b, c);
  }
  if (b > 12) {
    return buildUtcDate(b, a, c);
  }
  // Ambiguous 01/02/2026 — assume DD/MM/YYYY (Zimbabwe convention)
  return buildUtcDate(a, b, c);
}

const LABELLED_PATTERNS: RegExp[] = [
  /valid\s*(?:until|to|through)\s*[:\s]+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i,
  /expir(?:y|es)?(?:\s*date)?\s*[:\s]+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i,
  /certificate\s*(?:is\s*)?valid\s*(?:until|to)\s*[:\s]+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i,
  /ITF\s*263[^\d]{0,80}(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i,
];

/**
 * Extract the tax clearance expiry date from pasted certificate text.
 * Returns null if no recognizable date is found.
 */
export function parseItf263ExpiryDate(text: string): Date | null {
  if (!text || typeof text !== "string") return null;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  for (const re of LABELLED_PATTERNS) {
    const m = normalized.match(re);
    if (m) {
      const d = parseDateFromParts(
        parseInt(m[1], 10),
        parseInt(m[2], 10),
        parseInt(m[3], 10)
      );
      if (d) return d;
    }
  }

  const iso = normalized.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return buildUtcDate(
      parseInt(iso[3], 10),
      parseInt(iso[2], 10),
      parseInt(iso[1], 10)
    );
  }

  return null;
}

export function utcDateOnly(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

/** True if clearance is still valid on the expiry calendar day (inclusive). */
export function isTaxClearanceValidOnDate(expiry: Date, now: Date = new Date()): boolean {
  const e = utcDateOnly(expiry).getTime();
  const t = utcDateOnly(now).getTime();
  return e >= t;
}

/** 30 calendar days before expiry (UTC date-only arithmetic). */
export function computeRevalidationAlertDueAt(expiry: Date): Date {
  const u = utcDateOnly(expiry);
  const d = new Date(u);
  d.setUTCDate(d.getUTCDate() - 30);
  return utcDateOnly(d);
}

/** True if the re-validation alert window has been reached (inclusive) but clearance not yet expired. */
export function shouldFireRevalidationAlert(
  expiry: Date,
  alertDueAt: Date,
  now: Date = new Date()
): boolean {
  if (!isTaxClearanceValidOnDate(expiry, now)) return false;
  return utcDateOnly(now).getTime() >= utcDateOnly(alertDueAt).getTime();
}
