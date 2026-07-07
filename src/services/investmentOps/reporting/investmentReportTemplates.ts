import path from "path";

export type InvestmentReportTemplateCode =
  | "PERFORMANCE_REPORT"
  | "PORTFOLIO_VALUATION"
  | "TRADE_BLOTTER"
  | "HOLDINGS_SUMMARY"
  | "COMPLIANCE_SUMMARY"
  | "RECONCILIATION_SUMMARY";

export type InvestmentReportOutputFormat = "JSON" | "PDF" | "CSV" | "EXCEL" | "XLSX" | "DOCX";

export interface InvestmentReportTemplateDef {
  code: InvestmentReportTemplateCode;
  name: string;
  description: string;
  /** File under storage/report-templates/investment-ops/ when docxTemplate is set */
  docxTemplate?: string;
  supportedFormats: InvestmentReportOutputFormat[];
  requiresFundId: boolean;
}

const TEMPLATE_DIR = path.join(process.cwd(), "storage", "report-templates", "investment-ops");

export const INVESTMENT_REPORT_TEMPLATES: InvestmentReportTemplateDef[] = [
  {
    code: "PERFORMANCE_REPORT",
    name: "Performance Report",
    description:
      "Client portfolio performance, benchmark comparison and P&L attribution (Arcus Word template).",
    docxTemplate: "performance-report.docx",
    supportedFormats: ["DOCX"],
    requiresFundId: true,
  },
  {
    code: "PORTFOLIO_VALUATION",
    name: "Portfolio Valuation",
    description: "Holdings and P&L snapshot (JSON/PDF/CSV/Excel).",
    supportedFormats: ["JSON", "PDF", "CSV", "EXCEL", "XLSX"],
    requiresFundId: true,
  },
  {
    code: "TRADE_BLOTTER",
    name: "Trade Blotter",
    description: "Recent trades for the fund.",
    supportedFormats: ["JSON", "PDF", "CSV", "EXCEL", "XLSX"],
    requiresFundId: true,
  },
  {
    code: "HOLDINGS_SUMMARY",
    name: "Holdings Summary",
    description: "Current positions with market values.",
    supportedFormats: ["JSON", "PDF", "CSV", "EXCEL", "XLSX"],
    requiresFundId: true,
  },
  {
    code: "COMPLIANCE_SUMMARY",
    name: "Compliance Summary",
    description: "Rules and recent compliance check results.",
    supportedFormats: ["JSON", "PDF", "CSV", "EXCEL", "XLSX"],
    requiresFundId: true,
  },
  {
    code: "RECONCILIATION_SUMMARY",
    name: "Reconciliation Summary",
    description: "Recent reconciliation batches and items.",
    supportedFormats: ["JSON", "PDF", "CSV", "EXCEL", "XLSX"],
    requiresFundId: true,
  },
];

export function getInvestmentReportTemplate(code: string): InvestmentReportTemplateDef {
  const def = INVESTMENT_REPORT_TEMPLATES.find((t) => t.code === code);
  if (!def) throw new Error(`Unknown report template: ${code}`);
  return def;
}

export function resolveDocxTemplatePath(def: InvestmentReportTemplateDef): string {
  if (!def.docxTemplate) throw new Error(`Report ${def.code} has no DOCX template`);
  return path.join(TEMPLATE_DIR, def.docxTemplate);
}
