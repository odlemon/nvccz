/** UAT-aligned application / deal workflow stages (stored in `applications.currentStage`). */

export const DEAL_STAGE = {
  SCREENING_PENDING: "SCREENING_PENDING",
  SCREENING: "SCREENING",
  ACTIVE_DD: "ACTIVE_DD",
  REJECTED_SCREENING: "REJECTED_SCREENING",
  AUTO_REJECTED: "AUTO_REJECTED"
} as const;

/** Minimum analyst screening score (0–100) to avoid automatic rejection (UAT example: 50). */
export const ANALYST_SCREENING_MIN_SCORE = 50;

/** AI shortlisting threshold (aligned with UAT screening minimum). */
export const AI_SHORTLIST_THRESHOLD = 50;
