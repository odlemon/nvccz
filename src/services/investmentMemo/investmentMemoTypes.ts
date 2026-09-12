// @ts-nocheck

export const MEMO_WORKFLOW_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "LOCKED"] as const;
export type MemoWorkflowStatus = (typeof MEMO_WORKFLOW_STATUSES)[number];

export const VERSION_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "LOCKED"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const APPROVAL_ACTIONS = [
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "REVERTED_TO_DRAFT",
  "LOCKED",
] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const REQUIRED_SECTION_KEYS = [
  "executiveSummary",
  "investmentThesis",
  "marketOpportunity",
  "companyOverview",
  "financialAnalysis",
  "risksAndMitigants",
  "dealTerms",
  "recommendation",
] as const;

export const SECTION_LABELS: Record<string, string> = {
  executiveSummary: "Executive summary",
  investmentThesis: "Investment thesis",
  marketOpportunity: "Market opportunity",
  companyOverview: "Company overview",
  financialAnalysis: "Financial analysis",
  risksAndMitigants: "Risks and mitigants",
  dealTerms: "Deal terms",
  recommendation: "Recommendation",
  overallScore: "Overall score",
  additionalInformation: "Additional information",
};

export interface MemoSections {
  executiveSummary?: string;
  investmentThesis?: string;
  marketOpportunity?: string;
  companyOverview?: string;
  financialAnalysis?: string;
  risksAndMitigants?: string;
  dealTerms?: string;
  recommendation?: string;
  overallScore?: number | null;
  additionalInformation?: string;
}

export interface ValidationResult {
  passed: boolean;
  errors: Array<{ field: string; message: string }>;
}

export function emptySections(): MemoSections {
  return {
    executiveSummary: "",
    investmentThesis: "",
    marketOpportunity: "",
    companyOverview: "",
    financialAnalysis: "",
    risksAndMitigants: "",
    dealTerms: "",
    recommendation: "",
    overallScore: null,
    additionalInformation: "",
  };
}
