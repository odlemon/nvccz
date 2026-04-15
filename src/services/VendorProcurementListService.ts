// @ts-nocheck
import { prisma } from "../utils/database";
import { normalizeVendorCategory } from "../utils/vendorCategoryNormalize";

/**
 * Vendors eligible for "Invite to Quote" / RFQ (excludes blacklisted, suspended, pending review, no email).
 * When sourcingCategory or requisitionId resolves to a category, only vendors with that category are returned.
 */
export async function listVendorsEligibleForRfqQuery(opts: {
  sourcingCategory?: string;
  requisitionId?: string;
  search?: string;
}) {
  let categoryFilter: string | undefined;
  if (opts.sourcingCategory != null && String(opts.sourcingCategory).trim() !== "") {
    categoryFilter = normalizeVendorCategory(opts.sourcingCategory);
  } else if (opts.requisitionId) {
    const r = await prisma.purchaseRequisition.findUnique({
      where: { id: opts.requisitionId },
      select: { sourcingCategory: true },
    });
    if (r?.sourcingCategory) {
      categoryFilter = normalizeVendorCategory(r.sourcingCategory);
    }
  }

  const where: any = {
    isActive: true,
    isBlacklisted: false,
    registrationStatus: { notIn: ["SUSPENDED", "PENDING_REVIEW"] },
  };

  if (categoryFilter) {
    where.category = categoryFilter;
  }

  if (opts.search && String(opts.search).trim() !== "") {
    const q = String(opts.search).trim();
    where.AND = where.AND || [];
    where.AND.push({
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
        { contactPerson: { contains: q } },
      ],
    });
  }

  const rows = await prisma.vendor.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      category: true,
      vendorRating: true,
      taxComplianceStatus: true,
      settlementCurrencyId: true,
    },
  });

  return rows.filter((v) => v.email && String(v.email).trim() !== "");
}
