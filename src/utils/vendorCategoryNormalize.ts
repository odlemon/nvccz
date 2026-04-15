// @ts-nocheck

/** Normalize category keys for RFQ matching (Agrotech → AGROTECH). */
export function normalizeVendorCategory(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function categoriesMatch(
  vendorCategory: string | null | undefined,
  requisitionCategory: string | null | undefined
): boolean {
  const v = normalizeVendorCategory(vendorCategory);
  const r = normalizeVendorCategory(requisitionCategory);
  if (!r) return true;
  if (!v) return false;
  return v === r;
}
