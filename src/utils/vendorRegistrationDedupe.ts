/**
 * Normalize BP / VAT-style identifiers for duplicate detection (case-insensitive, strip common separators).
 */
export function normalizeRegistrationKey(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.replace(/[\s\-_.]/g, "").toUpperCase();
}

export const DUPLICATE_ENTITY_MESSAGE = "Duplicate Entity Detected";
