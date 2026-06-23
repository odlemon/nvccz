// @ts-nocheck
import {
  REQUIRED_SECTION_KEYS,
  SECTION_LABELS,
  type MemoSections,
  type ValidationResult,
} from "./investmentMemoTypes";

export class InvestmentMemoValidationService {
  static validateSections(sections: MemoSections | Record<string, unknown>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const src = sections || {};

    for (const key of REQUIRED_SECTION_KEYS) {
      const raw = src[key];
      const text = raw == null ? "" : String(raw).trim();
      if (!text) {
        errors.push({
          field: key,
          message: `${SECTION_LABELS[key] || key} is required`,
        });
      }
    }

    const score = src.overallScore;
    if (score != null && score !== "") {
      const n = Number(score);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push({ field: "overallScore", message: "Overall score must be between 0 and 100" });
      }
    }

    return { passed: errors.length === 0, errors };
  }
}
