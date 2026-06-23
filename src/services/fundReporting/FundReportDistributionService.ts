// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundReportAuditService } from "./FundReportAuditService";
import { normalizeEmail } from "./fundReportingSupport";

export class FundReportDistributionService {
  static async list(fundId?: string) {
    return prisma.fundReportDistributionList.findMany({
      where: {
        isActive: true,
        ...(fundId ? { fundId } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async getById(id: string) {
    const row = await prisma.fundReportDistributionList.findUnique({ where: { id } });
    if (!row) throw new Error("Distribution list not found");
    return row;
  }

  static async create(
    authorId: string,
    body: {
      fundId: string;
      name: string;
      sourceType: string;
      roleCodes?: string[];
      cohortFilter?: Record<string, unknown>;
    }
  ) {
    const row = await prisma.fundReportDistributionList.create({
      data: {
        fundId: body.fundId,
        name: body.name,
        sourceType: body.sourceType,
        roleCodes: body.roleCodes || null,
        cohortFilter: body.cohortFilter || null,
      },
    });
    await FundReportAuditService.log({
      entityType: "FundReportDistributionList",
      entityId: row.id,
      action: "CREATE",
      authorId,
      diffJson: { after: row },
    });
    return row;
  }

  static async update(
    id: string,
    authorId: string,
    body: Partial<{
      name: string;
      sourceType: string;
      roleCodes: string[];
      cohortFilter: Record<string, unknown>;
      isActive: boolean;
    }>
  ) {
    const before = await this.getById(id);
    const row = await prisma.fundReportDistributionList.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.sourceType != null ? { sourceType: body.sourceType } : {}),
        ...(body.roleCodes != null ? { roleCodes: body.roleCodes } : {}),
        ...(body.cohortFilter != null ? { cohortFilter: body.cohortFilter } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      },
    });
    await FundReportAuditService.log({
      entityType: "FundReportDistributionList",
      entityId: id,
      action: "UPDATE",
      authorId,
      diffJson: { before, after: row },
    });
    return row;
  }

  static async delete(id: string, authorId: string) {
    const before = await this.getById(id);
    const row = await prisma.fundReportDistributionList.update({
      where: { id },
      data: { isActive: false },
    });
    await FundReportAuditService.log({
      entityType: "FundReportDistributionList",
      entityId: id,
      action: "DELETE",
      authorId,
      diffJson: { before, after: row },
    });
    return row;
  }

  /**
   * Resolve recipients for a fund run. Email must match user directory when user-linked.
   */
  static async resolveRecipients(params: {
    fundId: string;
    distributionListId?: string;
    clientIds?: string[];
  }): Promise<
    Array<{
      clientId: string;
      userId: string | null;
      email: string;
      lpLegalName: string;
    }>
  > {
    let clientIds = params.clientIds;

    if (params.distributionListId) {
      const list = await this.getById(params.distributionListId);
      if (list.fundId !== params.fundId) throw new Error("Distribution list fund mismatch");

      if (list.sourceType === "COMMITMENT_COHORT") {
        const commitments = await prisma.investmentCommitment.findMany({
          where: { fundId: params.fundId, status: { in: ["ACTIVE", "PENDING"] } },
          select: { clientId: true },
        });
        clientIds = [...new Set(commitments.map((c) => c.clientId))];
      } else {
        const roleCodes = Array.isArray(list.roleCodes)
          ? list.roleCodes.map(String)
          : ["LIMITED_PARTNER"];
        const clients = await prisma.client.findMany({
          where: {
            status: "ACTIVE",
            userId: { not: null },
            investmentCommitments: { some: { fundId: params.fundId } },
          },
          include: { user: { include: { role: true } } },
        });
        clientIds = clients
          .filter((c) => {
            if (!c.user) return false;
            const code = c.user.roleCode || c.user.role?.name || "";
            return roleCodes.some((r) => code.toUpperCase().includes(String(r).toUpperCase()));
          })
          .map((c) => c.id);
      }
    }

    if (!clientIds?.length) {
      const commitments = await prisma.investmentCommitment.findMany({
        where: { fundId: params.fundId, status: { in: ["ACTIVE", "PENDING"] } },
        select: { clientId: true },
      });
      clientIds = [...new Set(commitments.map((c) => c.clientId))];
    }

    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds }, status: "ACTIVE" },
      include: { user: true },
    });

    const out: Array<{
      clientId: string;
      userId: string | null;
      email: string;
      lpLegalName: string;
    }> = [];

    for (const c of clients) {
      const directoryEmail = c.user ? normalizeEmail(c.user.email) : normalizeEmail(c.email);
      const clientEmail = normalizeEmail(c.email);
      const email = directoryEmail || clientEmail;
      if (!email) continue;
      if (c.user && clientEmail && directoryEmail && clientEmail !== directoryEmail) continue;
      out.push({
        clientId: c.id,
        userId: c.userId,
        email,
        lpLegalName: c.legalName,
      });
    }

    return out;
  }

  static validateRunEmailOverride(recipientEmail: string, directoryEmail: string | null): void {
    const norm = normalizeEmail(recipientEmail);
    const dir = directoryEmail ? normalizeEmail(directoryEmail) : null;
    if (dir && norm !== dir) {
      throw new Error("Manual email override blocked — address must match user directory");
    }
  }
}
