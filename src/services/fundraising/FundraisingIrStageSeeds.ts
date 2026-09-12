// @ts-nocheck

export type IrStageSeed = {
  stageCode: string;
  stageName: string;
  sortOrder: number;
  winProbabilityPct: number;
  gateRules: Record<string, unknown> | null;
  checklist: Array<{ itemKey: string; label: string; isRequired: boolean }>;
};

export const PE_VC_STAGE_SEED: IrStageSeed[] = [
  {
    stageCode: "TARGET_INVESTOR",
    stageName: "Target Investor",
    sortOrder: 1,
    winProbabilityPct: 10,
    gateRules: null,
    checklist: [{ itemKey: "target_identified", label: "Target investor identified", isRequired: true }],
  },
  {
    stageCode: "CONTACTED",
    stageName: "Contacted",
    sortOrder: 2,
    winProbabilityPct: 15,
    gateRules: null,
    checklist: [{ itemKey: "intro_outreach", label: "Initial outreach logged", isRequired: true }],
  },
  {
    stageCode: "QUALIFIED",
    stageName: "Qualified",
    sortOrder: 3,
    winProbabilityPct: 25,
    gateRules: { requiresIndicativeAmount: true },
    checklist: [
      { itemKey: "fit_confirmed", label: "Investment fit confirmed", isRequired: true },
      { itemKey: "indicative_captured", label: "Indicative amount captured", isRequired: true },
    ],
  },
  {
    stageCode: "ENGAGED",
    stageName: "Engaged",
    sortOrder: 4,
    winProbabilityPct: 35,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "materials_sent", label: "Marketing materials sent", isRequired: true },
      { itemKey: "follow_up_scheduled", label: "Follow-up scheduled", isRequired: false },
    ],
  },
  {
    stageCode: "DATA_ROOM",
    stageName: "Data Room",
    sortOrder: 5,
    winProbabilityPct: 45,
    gateRules: { requiresSoftCircle: true },
    checklist: [
      { itemKey: "data_room_access", label: "Data room access granted", isRequired: true },
      { itemKey: "nda_executed", label: "NDA executed", isRequired: true },
    ],
  },
  {
    stageCode: "DUE_DILIGENCE",
    stageName: "Due Diligence",
    sortOrder: 6,
    winProbabilityPct: 55,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "dd_pack_shared", label: "DD pack shared", isRequired: true },
      { itemKey: "dd_qna_open", label: "DD Q&A tracked", isRequired: false },
    ],
  },
  {
    stageCode: "IC_REVIEW",
    stageName: "IC Review",
    sortOrder: 7,
    winProbabilityPct: 60,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [{ itemKey: "ic_materials", label: "IC materials prepared", isRequired: true }],
  },
  {
    stageCode: "COMMERCIAL_NEGOTIATION",
    stageName: "Commercial Negotiation",
    sortOrder: 8,
    winProbabilityPct: 70,
    gateRules: { requiresProposed: true },
    checklist: [
      { itemKey: "term_sheet", label: "Term sheet / commercial terms agreed", isRequired: true },
      { itemKey: "proposed_amount", label: "Proposed amount locked", isRequired: true },
    ],
  },
  {
    stageCode: "SUBSCRIPTION_DOCS",
    stageName: "Subscription Docs",
    sortOrder: 9,
    winProbabilityPct: 80,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [{ itemKey: "sub_docs_issued", label: "Subscription docs issued", isRequired: true }],
  },
  {
    stageCode: "KYC_COMPLIANCE",
    stageName: "KYC / Compliance",
    sortOrder: 10,
    winProbabilityPct: 85,
    gateRules: { requiresKycNotBlocked: true },
    checklist: [
      { itemKey: "kyc_complete", label: "KYC complete", isRequired: true },
      { itemKey: "sanctions_clear", label: "Sanctions clear", isRequired: true },
    ],
  },
  {
    stageCode: "SIGNED",
    stageName: "Signed",
    sortOrder: 11,
    winProbabilityPct: 95,
    gateRules: { requiresSigned: true },
    checklist: [{ itemKey: "subscription_signed", label: "Subscription signed", isRequired: true }],
  },
  {
    stageCode: "ADMITTED",
    stageName: "Admitted",
    sortOrder: 12,
    winProbabilityPct: 98,
    gateRules: { requiresSigned: true },
    checklist: [{ itemKey: "lp_admitted", label: "LP admitted to fund", isRequired: true }],
  },
  {
    stageCode: "FUNDED",
    stageName: "Funded",
    sortOrder: 13,
    winProbabilityPct: 100,
    gateRules: { requiresSigned: true },
    checklist: [{ itemKey: "capital_called", label: "Capital funded / called", isRequired: true }],
  },
];

export const AM_MANDATE_STAGE_SEED: IrStageSeed[] = [
  {
    stageCode: "TARGET_CLIENT",
    stageName: "Target Client",
    sortOrder: 1,
    winProbabilityPct: 10,
    gateRules: null,
    checklist: [{ itemKey: "client_identified", label: "Target client identified", isRequired: true }],
  },
  {
    stageCode: "INITIAL_CONTACT",
    stageName: "Initial Contact",
    sortOrder: 2,
    winProbabilityPct: 15,
    gateRules: null,
    checklist: [{ itemKey: "intro_meeting", label: "Intro meeting / call logged", isRequired: true }],
  },
  {
    stageCode: "DISCOVERY",
    stageName: "Discovery",
    sortOrder: 3,
    winProbabilityPct: 25,
    gateRules: null,
    checklist: [
      { itemKey: "needs_captured", label: "Client needs captured", isRequired: true },
      { itemKey: "mandate_scope", label: "Mandate scope drafted", isRequired: false },
    ],
  },
  {
    stageCode: "QUALIFIED",
    stageName: "Qualified",
    sortOrder: 4,
    winProbabilityPct: 35,
    gateRules: { requiresIndicativeAmount: true },
    checklist: [
      { itemKey: "budget_fit", label: "Budget / AUM fit confirmed", isRequired: true },
      { itemKey: "expected_aum", label: "Expected AUM captured", isRequired: true },
    ],
  },
  {
    stageCode: "RFI_RFP",
    stageName: "RFI / RFP",
    sortOrder: 5,
    winProbabilityPct: 45,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "rfi_received", label: "RFI/RFP received", isRequired: true },
      { itemKey: "response_submitted", label: "Response submitted", isRequired: true },
    ],
  },
  {
    stageCode: "PROPOSAL",
    stageName: "Proposal",
    sortOrder: 6,
    winProbabilityPct: 55,
    gateRules: { requiresProposed: true },
    checklist: [{ itemKey: "proposal_issued", label: "Formal proposal issued", isRequired: true }],
  },
  {
    stageCode: "DUE_DILIGENCE",
    stageName: "Due Diligence",
    sortOrder: 7,
    winProbabilityPct: 60,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "dd_questionnaire", label: "DD questionnaire completed", isRequired: true },
      { itemKey: "ops_dd", label: "Operational DD scheduled", isRequired: false },
    ],
  },
  {
    stageCode: "PRESENTATION",
    stageName: "Presentation",
    sortOrder: 8,
    winProbabilityPct: 70,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [{ itemKey: "finalist_pitch", label: "Finalist presentation delivered", isRequired: true }],
  },
  {
    stageCode: "PREFERRED_BIDDER",
    stageName: "Preferred Bidder",
    sortOrder: 9,
    winProbabilityPct: 75,
    gateRules: { requiresSoftCircle: true },
    checklist: [{ itemKey: "preferred_status", label: "Preferred bidder status confirmed", isRequired: true }],
  },
  {
    stageCode: "NEGOTIATION",
    stageName: "Negotiation",
    sortOrder: 10,
    winProbabilityPct: 85,
    gateRules: { requiresProposed: true },
    checklist: [
      { itemKey: "ima_terms", label: "IMA / fee terms negotiated", isRequired: true },
      { itemKey: "legal_review", label: "Legal review complete", isRequired: false },
    ],
  },
  {
    stageCode: "AWARDED",
    stageName: "Awarded",
    sortOrder: 11,
    winProbabilityPct: 90,
    gateRules: { requiresSigned: true, requiresKycNotBlocked: true },
    checklist: [
      { itemKey: "award_letter", label: "Award / appointment letter received", isRequired: true },
      { itemKey: "kyc_cleared", label: "KYC cleared", isRequired: true },
    ],
  },
  {
    stageCode: "ASSETS_IN_TRANSITION",
    stageName: "Assets in Transition",
    sortOrder: 12,
    winProbabilityPct: 95,
    gateRules: { requiresSigned: true },
    checklist: [{ itemKey: "transition_plan", label: "Asset transition plan agreed", isRequired: true }],
  },
  {
    stageCode: "ACTIVATED",
    stageName: "Activated",
    sortOrder: 13,
    winProbabilityPct: 100,
    gateRules: { requiresSigned: true },
    checklist: [{ itemKey: "mandate_live", label: "Mandate activated / AUM live", isRequired: true }],
  },
];

const PE_TYPES = new Set([
  "PE_FUNDRAISE",
  "VC_FUNDRAISE",
  "CO_INVESTMENT",
  "SPV",
  "CONTINUATION_VEHICLE",
]);

const AM_TYPES = new Set(["INSTITUTIONAL_MANDATE", "PRODUCT_LAUNCH", "DISTRIBUTOR_CAMPAIGN"]);

export function stageSeedForCampaignType(campaignType: string): IrStageSeed[] {
  const t = String(campaignType || "").trim().toUpperCase();
  if (AM_TYPES.has(t)) return AM_MANDATE_STAGE_SEED;
  if (PE_TYPES.has(t)) return PE_VC_STAGE_SEED;
  return PE_VC_STAGE_SEED;
}
