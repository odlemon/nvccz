import path from "path";

export type ReportScopeType =
  | "FIRM"
  | "FUND"
  | "CIS_SCHEME"
  | "CLIENT_MANDATE"
  | "PORTFOLIO"
  | "INVESTOR"
  | "TRANSACTION"
  | "REGULATOR_PACK";

export type InvestmentReportTemplateCode =
  | "PERFORMANCE_REPORT"
  | "HOLDINGS_REPORT"
  | "TRANSACTION_REPORT"
  | "ASSET_ALLOCATION_REPORT"
  | "INCOME_REPORT"
  | "FEE_REPORT"
  | "CLIENT_PORTFOLIO_VALUATION"
  | "RECONCILIATION_EXCEPTION_REPORT"
  | "CUSTODIAN_TRUSTEE_RECONCILIATION"
  | "SUBSCRIPTIONS_REDEMPTIONS_REPORT"
  | "AUM_FUM_MOVEMENT_REPORT"
  | "TRUSTEE_QUARTERLY_PACK"
  | "CIS_MONTHLY_RETURN_PACK"
  | "AML_CFT_CPF_RETURN_PACK"
  | "SECZIM_CAPITAL_ADEQUACY_PACK"
  | "SECZIM_PRUDENTIAL_RETURN_PACK"
  | "PORTFOLIO_VALUATION"
  | "TRADE_BLOTTER"
  | "HOLDINGS_SUMMARY"
  | "COMPLIANCE_SUMMARY"
  | "RECONCILIATION_SUMMARY";

export type InvestmentReportOutputFormat = "JSON" | "PDF" | "CSV" | "EXCEL" | "XLSX" | "DOCX";

export type ReportParameterSchema = {
  type: "object";
  required?: string[];
  properties: Record<
    string,
    {
      type: string | string[];
      description?: string;
      enum?: string[];
      format?: string;
    }
  >;
};

export interface InvestmentReportTemplateDef {
  code: InvestmentReportTemplateCode;
  name: string;
  description: string;
  scopeType: ReportScopeType;
  docxTemplate?: string;
  supportedFormats: InvestmentReportOutputFormat[];
  requiresFundId: boolean;
  requiresClientId?: boolean;
  /** Template contract version for FE clients. */
  version: number;
  parameterSchema: ReportParameterSchema;
}

export const INVESTMENT_REPORT_TEMPLATE_VERSION = 1;

function baseParameterSchema(opts: {
  requiresFundId: boolean;
  requiresClientId?: boolean;
  extra?: ReportParameterSchema["properties"];
}): ReportParameterSchema {
  const properties: ReportParameterSchema["properties"] = {
    format: {
      type: "string",
      description: "Output format",
    },
    asOf: {
      type: "string",
      format: "date",
      description: "Optional as-of date (ISO)",
    },
    ...(opts.extra || {}),
  };
  if (opts.requiresFundId) {
    properties.fundId = { type: "string", description: "Fund / portfolio id" };
  }
  if (opts.requiresClientId) {
    properties.clientId = { type: "string", description: "Client mandate id" };
  }
  const required: string[] = [];
  if (opts.requiresFundId) required.push("fundId");
  if (opts.requiresClientId) required.push("clientId");
  return { type: "object", required, properties };
}

const TEMPLATE_DIR = path.join(process.cwd(), "storage", "report-templates", "investment-ops");

const DOCX_REPORTS: Omit<
  InvestmentReportTemplateDef,
  "supportedFormats" | "version" | "parameterSchema"
>[] = [
  {
    code: "PERFORMANCE_REPORT",
    name: "Performance Report",
    description: "Client portfolio performance, benchmark comparison and P&L attribution.",
    scopeType: "FUND",
    docxTemplate: "performance-report.docx",
    requiresFundId: true,
  },
  {
    code: "HOLDINGS_REPORT",
    name: "Holdings Report",
    description: "Detailed holdings snapshot with asset class and custody breakdown.",
    scopeType: "FUND",
    docxTemplate: "holdings-report.docx",
    requiresFundId: true,
  },
  {
    code: "TRANSACTION_REPORT",
    name: "Transaction Report",
    description: "Trade blotter, cash movements and settlement activity.",
    scopeType: "FUND",
    docxTemplate: "transaction-report.docx",
    requiresFundId: true,
  },
  {
    code: "ASSET_ALLOCATION_REPORT",
    name: "Asset Allocation Report",
    description: "Portfolio allocation vs model weights and drift.",
    scopeType: "FUND",
    docxTemplate: "asset-allocation-report.docx",
    requiresFundId: true,
  },
  {
    code: "INCOME_REPORT",
    name: "Income Report",
    description: "Dividend, interest and other income accruals.",
    scopeType: "FUND",
    docxTemplate: "income-report.docx",
    requiresFundId: true,
  },
  {
    code: "FEE_REPORT",
    name: "Fee Report",
    description: "Management fees, custody and transaction costs.",
    scopeType: "FUND",
    docxTemplate: "fee-report.docx",
    requiresFundId: true,
  },
  {
    code: "CLIENT_PORTFOLIO_VALUATION",
    name: "Client Portfolio Valuation Statement",
    description: "Client mandate valuation and commitment position.",
    scopeType: "CLIENT_MANDATE",
    docxTemplate: "client-portfolio-valuation.docx",
    requiresFundId: true,
    requiresClientId: true,
  },
  {
    code: "RECONCILIATION_EXCEPTION_REPORT",
    name: "Reconciliation Exception Report",
    description: "Open reconciliation and valuation exceptions.",
    scopeType: "FUND",
    docxTemplate: "reconciliation-exception-report.docx",
    requiresFundId: true,
  },
  {
    code: "CUSTODIAN_TRUSTEE_RECONCILIATION",
    name: "Custodian Trustee Reconciliation",
    description: "Custodian vs internal position reconciliation.",
    scopeType: "FUND",
    docxTemplate: "custodian-trustee-reconciliation.docx",
    requiresFundId: true,
  },
  {
    code: "SUBSCRIPTIONS_REDEMPTIONS_REPORT",
    name: "Subscriptions and Redemptions Report",
    description: "Capital calls, subscriptions and distribution activity.",
    scopeType: "FUND",
    docxTemplate: "subscriptions-redemptions-report.docx",
    requiresFundId: true,
  },
  {
    code: "AUM_FUM_MOVEMENT_REPORT",
    name: "AUM / FUM Movement Report",
    description: "Firm-wide assets under management movement.",
    scopeType: "FIRM",
    docxTemplate: "aum-fum-movement-report.docx",
    requiresFundId: false,
  },
  {
    code: "TRUSTEE_QUARTERLY_PACK",
    name: "Trustee Quarterly Pack",
    description: "Trustee oversight pack for a fund or CIS scheme.",
    scopeType: "CIS_SCHEME",
    docxTemplate: "trustee-quarterly-pack.docx",
    requiresFundId: true,
  },
  {
    code: "CIS_MONTHLY_RETURN_PACK",
    name: "CIS Monthly Return Pack",
    description: "Monthly CIS regulatory return for a scheme.",
    scopeType: "CIS_SCHEME",
    docxTemplate: "cis-monthly-return-pack.docx",
    requiresFundId: true,
  },
  {
    code: "AML_CFT_CPF_RETURN_PACK",
    name: "AML / CFT / CPF Return Pack",
    description: "Firm-wide AML compliance return with fund/client drill-down.",
    scopeType: "FIRM",
    docxTemplate: "aml-cft-cpf-return-pack.docx",
    requiresFundId: false,
  },
  {
    code: "SECZIM_CAPITAL_ADEQUACY_PACK",
    name: "SECZIM Capital Adequacy Pack",
    description: "Firm capital adequacy regulatory return.",
    scopeType: "FIRM",
    docxTemplate: "seczim-capital-adequacy-pack.docx",
    requiresFundId: false,
  },
  {
    code: "SECZIM_PRUDENTIAL_RETURN_PACK",
    name: "SECZIM Prudential Return Pack",
    description: "SECZIM prudential return with fund sections.",
    scopeType: "REGULATOR_PACK",
    docxTemplate: "seczim-prudential-return-pack.docx",
    requiresFundId: false,
  },
];

function withTemplateContract(
  def: Omit<InvestmentReportTemplateDef, "version" | "parameterSchema" | "supportedFormats"> & {
    supportedFormats: InvestmentReportOutputFormat[];
  }
): InvestmentReportTemplateDef {
  return {
    ...def,
    version: INVESTMENT_REPORT_TEMPLATE_VERSION,
    parameterSchema: baseParameterSchema({
      requiresFundId: def.requiresFundId,
      requiresClientId: def.requiresClientId,
    }),
  };
}

export const INVESTMENT_REPORT_TEMPLATES: InvestmentReportTemplateDef[] = [
  ...DOCX_REPORTS.map((d) =>
    withTemplateContract({
      ...d,
      // DOCX is preferred; also allow PDF/JSON/CSV so FE generate pickers are not blocked.
      supportedFormats: ["DOCX", "PDF", "JSON", "CSV", "XLSX"] as InvestmentReportOutputFormat[],
    })
  ),
  withTemplateContract({
    code: "PORTFOLIO_VALUATION",
    name: "Portfolio Valuation",
    description: "Holdings and P&L snapshot (JSON/PDF/CSV/Excel).",
    scopeType: "FUND",
    supportedFormats: ["PDF", "EXCEL", "XLSX", "CSV", "JSON"],
    requiresFundId: true,
  }),
  withTemplateContract({
    code: "TRADE_BLOTTER",
    name: "Trade Blotter",
    description: "Recent trades for the fund.",
    scopeType: "FUND",
    supportedFormats: ["PDF", "EXCEL", "XLSX", "CSV", "JSON"],
    requiresFundId: true,
  }),
  withTemplateContract({
    code: "HOLDINGS_SUMMARY",
    name: "Holdings Summary",
    description: "Current positions with market values.",
    scopeType: "FUND",
    supportedFormats: ["PDF", "EXCEL", "XLSX", "CSV", "JSON"],
    requiresFundId: true,
  }),
  withTemplateContract({
    code: "COMPLIANCE_SUMMARY",
    name: "Compliance Summary",
    description: "Rules and recent compliance check results.",
    scopeType: "FUND",
    supportedFormats: ["PDF", "EXCEL", "XLSX", "CSV", "JSON"],
    requiresFundId: true,
  }),
  withTemplateContract({
    code: "RECONCILIATION_SUMMARY",
    name: "Reconciliation Summary",
    description: "Recent reconciliation batches and items.",
    scopeType: "FUND",
    supportedFormats: ["PDF", "EXCEL", "XLSX", "CSV", "JSON"],
    requiresFundId: true,
  }),
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

export function requiresFundIdForScope(scopeType: ReportScopeType): boolean {
  return ["FUND", "CIS_SCHEME", "PORTFOLIO", "CLIENT_MANDATE"].includes(scopeType);
}

export function requiresClientIdForScope(scopeType: ReportScopeType): boolean {
  return ["CLIENT_MANDATE", "INVESTOR"].includes(scopeType);
}
