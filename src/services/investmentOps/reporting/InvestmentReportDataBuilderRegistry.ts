// @ts-nocheck
import path from "path";
import { PerformanceReportDataBuilder } from "./PerformanceReportDataBuilder";
import { ArcusPlaceholderFillEngine } from "./ArcusPlaceholderFillEngine";
import { extractDocxPlaceholders } from "./extractDocxPlaceholders";
import { getInvestmentReportTemplate, resolveDocxTemplatePath } from "./investmentReportTemplates";
import { ReportBuilderContextLoader, type ReportBuildParams } from "./ReportBuilderContext";

export class InvestmentReportDataBuilderRegistry {
  static async build(params: ReportBuildParams): Promise<Record<string, string>> {
    const def = getInvestmentReportTemplate(params.reportType);
    if (!def.docxTemplate) {
      throw new Error(`Report ${params.reportType} has no DOCX template`);
    }

    if (params.reportType === "PERFORMANCE_REPORT") {
      return PerformanceReportDataBuilder.build({
        fundId: params.fundId!,
        userId: params.userId,
        user: params.user,
        reportRunId: params.reportRunId,
        parameters: params.parameters,
      });
    }

    const templatePath = resolveDocxTemplatePath(def);
    const placeholders = extractDocxPlaceholders(templatePath);
    const ctx = await ReportBuilderContextLoader.load(params);
    return ArcusPlaceholderFillEngine.fill(placeholders, ctx);
  }
}
