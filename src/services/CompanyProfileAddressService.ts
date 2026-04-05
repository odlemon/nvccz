// @ts-nocheck
import { prisma } from "../utils/database";

export type UpsertCompanyAddressRequest = {
  label?: string | null;
  logoUrl?: string | null;
  line1: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  isActive?: boolean;
};

async function ensureCompanyProfileId(tx: any): Promise<string> {
  const existing = await tx.companyProfile.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.companyProfile.create({ data: {} });
  return created.id;
}

export class CompanyProfileAddressService {
  /** Single active letterhead address for the company profile (if any). */
  static async getActive() {
    const profile = await prisma.companyProfile.findFirst({ select: { id: true } });
    if (!profile) return null;
    return prisma.companyProfileAddress.findFirst({
      where: { companyProfileId: profile.id, isActive: true }
    });
  }

  static async list() {
    const profile = await prisma.companyProfile.findFirst({ select: { id: true } });
    if (!profile) return [];
    return prisma.companyProfileAddress.findMany({
      where: { companyProfileId: profile.id },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
    });
  }

  static async create(request: UpsertCompanyAddressRequest) {
    if (!request?.line1 || String(request.line1).trim() === "") {
      throw new Error("line1 is required");
    }

    return prisma.$transaction(async (tx) => {
      const companyProfileId = await ensureCompanyProfileId(tx);
      if (request.isActive) {
        await tx.companyProfileAddress.updateMany({
          where: { companyProfileId, isActive: true },
          data: { isActive: false }
        });
      }
      return tx.companyProfileAddress.create({
        data: {
          companyProfileId,
          label: request.label ?? null,
          logoUrl: request.logoUrl ?? null,
          line1: request.line1,
          line2: request.line2 ?? null,
          city: request.city ?? null,
          state: request.state ?? null,
          postalCode: request.postalCode ?? null,
          country: request.country ?? null,
          isActive: Boolean(request.isActive)
        }
      });
    });
  }

  static async update(id: string, request: Partial<UpsertCompanyAddressRequest>) {
    const existing = await prisma.companyProfileAddress.findUnique({ where: { id } });
    if (!existing) throw new Error("Address not found");

    return prisma.$transaction(async (tx) => {
      if (request.isActive) {
        await tx.companyProfileAddress.updateMany({
          where: { companyProfileId: existing.companyProfileId, isActive: true },
          data: { isActive: false }
        });
      }
      return tx.companyProfileAddress.update({
        where: { id },
        data: {
          ...(request.label !== undefined ? { label: request.label ?? null } : {}),
          ...(request.logoUrl !== undefined ? { logoUrl: request.logoUrl ?? null } : {}),
          ...(request.line1 !== undefined ? { line1: request.line1 } : {}),
          ...(request.line2 !== undefined ? { line2: request.line2 ?? null } : {}),
          ...(request.city !== undefined ? { city: request.city ?? null } : {}),
          ...(request.state !== undefined ? { state: request.state ?? null } : {}),
          ...(request.postalCode !== undefined ? { postalCode: request.postalCode ?? null } : {}),
          ...(request.country !== undefined ? { country: request.country ?? null } : {}),
          ...(request.isActive !== undefined ? { isActive: Boolean(request.isActive) } : {})
        }
      });
    });
  }

  static async setActive(id: string) {
    const existing = await prisma.companyProfileAddress.findUnique({ where: { id } });
    if (!existing) throw new Error("Address not found");

    return prisma.$transaction(async (tx) => {
      await tx.companyProfileAddress.updateMany({
        where: { companyProfileId: existing.companyProfileId, isActive: true },
        data: { isActive: false }
      });
      return tx.companyProfileAddress.update({
        where: { id },
        data: { isActive: true }
      });
    });
  }

  static async remove(id: string) {
    const existing = await prisma.companyProfileAddress.findUnique({ where: { id } });
    if (!existing) throw new Error("Address not found");
    return prisma.companyProfileAddress.delete({ where: { id } });
  }
}

