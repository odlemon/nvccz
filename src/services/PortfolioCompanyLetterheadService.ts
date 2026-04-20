// @ts-nocheck
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";

export type PortfolioCompanyLetterheadUpsertInput = {
  legalName?: string | null;
  registrationNumber?: string | null;
  taxNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  addressLabel?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
};

const UPSERT_KEYS: (keyof PortfolioCompanyLetterheadUpsertInput)[] = [
  "legalName",
  "registrationNumber",
  "taxNumber",
  "email",
  "phone",
  "website",
  "logoUrl",
  "line1",
  "line2",
  "city",
  "state",
  "postalCode",
  "country",
  "addressLabel",
  "twitter",
  "facebook",
  "linkedin",
  "instagram",
];

export class PortfolioCompanyLetterheadService {
  /** Ensures the portfolio company exists. Any authenticated user may call letterhead endpoints (no role gate). */
  static async ensurePortfolioCompanyExists(portfolioCompanyId: string) {
    const pc = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { id: true },
    });
    if (!pc) {
      const e: any = new Error("Portfolio company not found");
      e.statusCode = 404;
      throw e;
    }
  }

  static async getByPortfolioCompanyId(portfolioCompanyId: string) {
    return prisma.portfolioCompanyLetterhead.findUnique({
      where: { portfolioCompanyId },
    });
  }

  static pickUpsertPayload(body: Record<string, unknown>): PortfolioCompanyLetterheadUpsertInput {
    const out: PortfolioCompanyLetterheadUpsertInput = {};
    for (const key of UPSERT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const v = body[key];
        out[key] = v === undefined ? undefined : (v as string | null);
      }
    }
    return out;
  }

  static async upsert(portfolioCompanyId: string, input: PortfolioCompanyLetterheadUpsertInput) {
    const data: Prisma.PortfolioCompanyLetterheadUncheckedUpdateInput = {};
    for (const key of UPSERT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        data[key] = input[key] as any;
      }
    }
    if (Object.keys(data).length === 0) {
      const e: any = new Error("At least one letterhead field is required");
      e.statusCode = 400;
      throw e;
    }

    return prisma.portfolioCompanyLetterhead.upsert({
      where: { portfolioCompanyId },
      create: {
        portfolioCompanyId,
        ...data,
      } as Prisma.PortfolioCompanyLetterheadUncheckedCreateInput,
      update: data,
    });
  }

  static async setLogoUrl(portfolioCompanyId: string, logoUrl: string) {
    return prisma.portfolioCompanyLetterhead.upsert({
      where: { portfolioCompanyId },
      create: {
        portfolioCompanyId,
        logoUrl,
      },
      update: { logoUrl },
    });
  }

  static async deleteForPortfolioCompany(portfolioCompanyId: string) {
    const result = await prisma.portfolioCompanyLetterhead.deleteMany({
      where: { portfolioCompanyId },
    });
    return result.count;
  }
}
