// @ts-nocheck
import { prisma } from "../utils/database";
import {
  DUPLICATE_ENTITY_MESSAGE,
  normalizeRegistrationKey,
} from "../utils/vendorRegistrationDedupe";

/**
 * Cross-registry duplicate check for vendor onboarding: active vendors + active customers (VAT),
 * and active vendors only (BP). Single DB deployment = effective "cross-tenant" scope.
 */
export class VendorRegistrationDedupeService {
  static async assertNoDuplicateIdentifiers(params: {
    taxNumber?: string | null;
    bpNumber?: string | null;
    excludeVendorId?: string;
  }): Promise<{ ok: true } | { ok: false; message: string }> {
    const nVat = normalizeRegistrationKey(params.taxNumber);
    const nBp = normalizeRegistrationKey(params.bpNumber);

    if (nVat) {
      const hit = await this.findVatConflict(nVat, params.excludeVendorId);
      if (hit) {
        return { ok: false, message: DUPLICATE_ENTITY_MESSAGE };
      }
    }
    if (nBp) {
      const hit = await this.findBpConflict(nBp, params.excludeVendorId);
      if (hit) {
        return { ok: false, message: DUPLICATE_ENTITY_MESSAGE };
      }
    }
    return { ok: true };
  }

  private static async findVatConflict(
    normalized: string,
    excludeVendorId?: string
  ): Promise<unknown | null> {
    const [vendors, customers] = await Promise.all([
      prisma.vendor.findMany({
        where: { isActive: true, taxNumber: { not: null } },
        select: { id: true, taxNumber: true, name: true },
      }),
      prisma.customer.findMany({
        where: { isActive: true, taxNumber: { not: null } },
        select: { id: true, taxNumber: true, name: true },
      }),
    ]);

    for (const v of vendors) {
      if (excludeVendorId && v.id === excludeVendorId) continue;
      if (normalizeRegistrationKey(v.taxNumber) === normalized) {
        return v;
      }
    }
    for (const c of customers) {
      if (normalizeRegistrationKey(c.taxNumber) === normalized) {
        return c;
      }
    }
    return null;
  }

  private static async findBpConflict(
    normalized: string,
    excludeVendorId?: string
  ): Promise<unknown | null> {
    // Raw SQL so duplicate checks work even before Prisma Client is regenerated for `bpNumber`;
    // column `bp_number` is added by `npm run db:migrate:vendor-bp-number`.
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; bp_number: string | null }>
    >(
      "SELECT `id`, `bp_number` FROM `vendors` WHERE `isActive` = 1 AND `bp_number` IS NOT NULL"
    );

    for (const v of rows) {
      if (excludeVendorId && v.id === excludeVendorId) continue;
      if (normalizeRegistrationKey(v.bp_number) === normalized) {
        return { id: v.id, bpNumber: v.bp_number };
      }
    }
    return null;
  }
}
