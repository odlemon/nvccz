// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundReportAuditService } from "./FundReportAuditService";

const DEFAULT_SECTIONS = {
  INVESTOR: ["commitments", "paidIn", "distributions", "holdings", "dpi", "tvpi", "netIrr"],
  BOARD: ["commitments", "paidIn", "distributions", "holdings", "dpi", "tvpi", "netIrr", "variance", "overhead"],
};

export class FundReportTemplateService {
  static async list(params: { fundId?: string; reportLevel?: string }) {
    return prisma.fundReportTemplate.findMany({
      where: {
        isActive: true,
        ...(params.fundId ? { fundId: params.fundId } : {}),
        ...(params.reportLevel ? { reportLevel: params.reportLevel } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async getById(id: string) {
    const row = await prisma.fundReportTemplate.findUnique({ where: { id } });
    if (!row) throw new Error("Template not found");
    return row;
  }

  static async create(
    authorId: string,
    body: {
      fundId?: string;
      name: string;
      reportLevel: string;
      description?: string;
      sectionConfig?: Record<string, unknown>;
    }
  ) {
    const level = String(body.reportLevel || "INVESTOR").toUpperCase();
    const row = await prisma.fundReportTemplate.create({
      data: {
        fundId: body.fundId || null,
        name: body.name,
        reportLevel: level,
        description: body.description || null,
        sectionConfig: body.sectionConfig || DEFAULT_SECTIONS[level] || DEFAULT_SECTIONS.INVESTOR,
        createdById: authorId,
      },
    });
    await FundReportAuditService.log({
      entityType: "FundReportTemplate",
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
      description: string;
      sectionConfig: Record<string, unknown>;
      isActive: boolean;
    }>
  ) {
    const before = await this.getById(id);
    const row = await prisma.fundReportTemplate.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.description != null ? { description: body.description } : {}),
        ...(body.sectionConfig != null ? { sectionConfig: body.sectionConfig } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      },
    });
    await FundReportAuditService.log({
      entityType: "FundReportTemplate",
      entityId: id,
      action: "UPDATE",
      authorId,
      diffJson: { before, after: row },
    });
    return row;
  }

  static async delete(id: string, authorId: string) {
    const before = await this.getById(id);
    const row = await prisma.fundReportTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    await FundReportAuditService.log({
      entityType: "FundReportTemplate",
      entityId: id,
      action: "DELETE",
      authorId,
      diffJson: { before, after: row },
    });
    return row;
  }
}
