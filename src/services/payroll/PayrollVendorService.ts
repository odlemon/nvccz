// @ts-nocheck
import { prisma } from "../../utils/database";

const db = () => prisma as any;

/**
 * Vendors, for the payroll module's Vendors & Quotations screen.
 *
 * That screen was rendering a hardcoded fixture — invented suppliers ("Medsure Health Fund",
 * VEN-001…) with invented ratings, contract values and compliance percentages, presented to staff
 * as real records. It was the largest single block of untraced numbers in the module.
 *
 * No new model is needed: `Vendor` already carries name, contact, category, rating, tax-compliance
 * status and blacklisting. This reads those real rows and derives the header figures from them,
 * so the screen shows the organisation's actual suppliers or an honest empty state.
 *
 * Deliberately read-only. Vendor records are owned by procurement; payroll displays them.
 */
export class PayrollVendorService {
  static async list(query: Record<string, unknown> = {}) {
    const search = query.search ? String(query.search).trim() : "";
    const category = query.category ? String(query.category) : undefined;
    const take = Math.min(500, Math.max(1, Number(query.limit ?? 200) || 200));

    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { contactPerson: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const rows = await db().vendor.findMany({
      where,
      take,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        contactPerson: true,
        email: true,
        phone: true,
        paymentTerms: true,
        taxComplianceStatus: true,
        taxClearanceExpiryDate: true,
        isBlacklisted: true,
        blacklistReason: true,
        vendorRating: true,
        vendorRatingUpdatedAt: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const items = rows.map((v: any) => {
      const expiry = v.taxClearanceExpiryDate ? new Date(v.taxClearanceExpiryDate) : null;
      const expired = expiry ? expiry.getTime() < now.getTime() : false;
      return {
        id: v.id,
        name: v.name,
        category: v.category ?? null,
        contactPerson: v.contactPerson ?? null,
        email: v.email ?? null,
        phone: v.phone ?? null,
        paymentTerms: v.paymentTerms ?? null,
        // The screen shows a compliance state per vendor; it is the tax-clearance position, not a
        // score, so it is reported as the status it actually is rather than a percentage.
        complianceStatus: v.isBlacklisted
          ? "BLACKLISTED"
          : expired
            ? "EXPIRED"
            : String(v.taxComplianceStatus || "PENDING").toUpperCase(),
        taxClearanceExpiryDate: v.taxClearanceExpiryDate
          ? new Date(v.taxClearanceExpiryDate).toISOString().slice(0, 10)
          : null,
        blacklisted: !!v.isBlacklisted,
        blacklistReason: v.blacklistReason ?? null,
        // Null when nobody has rated the vendor. A missing rating is not a zero.
        rating: v.vendorRating != null ? Number(v.vendorRating.toString()) : null,
        ratingUpdatedAt: v.vendorRatingUpdatedAt
          ? new Date(v.vendorRatingUpdatedAt).toISOString().slice(0, 10)
          : null,
      };
    });

    const rated = items.filter((v: any) => v.rating != null);
    return {
      items,
      total: items.length,
      // Header figures, each derived from the rows above rather than asserted.
      summary: {
        registered: items.length,
        compliant: items.filter((v: any) => v.complianceStatus === "COMPLIANT").length,
        pending: items.filter((v: any) => v.complianceStatus === "PENDING").length,
        expired: items.filter((v: any) => v.complianceStatus === "EXPIRED").length,
        blacklisted: items.filter((v: any) => v.blacklisted).length,
        ratedCount: rated.length,
        averageRating: rated.length
          ? Number((rated.reduce((s: number, v: any) => s + v.rating, 0) / rated.length).toFixed(2))
          : null,
        categories: [...new Set(items.map((v: any) => v.category).filter(Boolean))].length,
      },
    };
  }
}
