// @ts-nocheck

export const DEFAULT_STAGE_SEED = [
  {
    stageCode: "PROSPECT",
    stageName: "Prospect",
    sortOrder: 1,
    winProbabilityPct: 10,
    gateRules: null,
    checklist: [{ itemKey: "initial_contact", label: "Initial contact logged", isRequired: true }],
  },
  {
    stageCode: "ENGAGED",
    stageName: "Engaged",
    sortOrder: 2,
    winProbabilityPct: 25,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "intro_call", label: "Intro call completed", isRequired: true },
      { itemKey: "teaser_sent", label: "Teaser sent", isRequired: false },
    ],
  },
  {
    stageCode: "DUE_DILIGENCE",
    stageName: "Due Diligence",
    sortOrder: 3,
    winProbabilityPct: 50,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "kyc_aml", label: "KYC/AML complete", isRequired: true },
      { itemKey: "dd_questionnaire", label: "DD questionnaire received", isRequired: true },
      { itemKey: "legal_review", label: "Legal review complete", isRequired: false },
    ],
  },
  {
    stageCode: "TERM_SHEET_ISSUED",
    stageName: "Term Sheet Issued",
    sortOrder: 4,
    winProbabilityPct: 75,
    gateRules: { requiresPreviousStageChecklist: true },
    checklist: [
      { itemKey: "term_sheet_issued", label: "Term sheet issued", isRequired: true },
      { itemKey: "term_sheet_ack", label: "Term sheet acknowledged", isRequired: true },
    ],
  },
  {
    stageCode: "WON_SIGNED",
    stageName: "Won / Signed",
    sortOrder: 5,
    winProbabilityPct: 100,
    gateRules: { requiresAgreementSigned: true, requiresChecklistComplete: true },
    checklist: [
      { itemKey: "subscription_signed", label: "Subscription agreement signed", isRequired: true },
    ],
  },
] as const;

export class FundraisingMetricsEngine {
  static weightedPipelineValue(
    deals: Array<{ amount: number; winProbabilityPct: number }>
  ): number {
    return deals.reduce((sum, d) => sum + d.amount * (d.winProbabilityPct / 100), 0);
  }

  static completionPct(wonTotal: number, targetCapital: number): number {
    if (!targetCapital || targetCapital <= 0) return 0;
    return Math.min(100, (wonTotal / targetCapital) * 100);
  }

  static gapRemaining(targetCapital: number, wonTotal: number): number {
    return Math.max(0, targetCapital - wonTotal);
  }

  static daysLeft(closeDate: Date, asOf = new Date()): number {
    const close = new Date(closeDate);
    close.setHours(0, 0, 0, 0);
    const now = new Date(asOf);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
}
