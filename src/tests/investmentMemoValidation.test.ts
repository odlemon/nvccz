// @ts-nocheck
import { describe, it, expect } from "@jest/globals";
import { InvestmentMemoValidationService } from "../services/investmentMemo/InvestmentMemoValidationService";
import { emptySections } from "../services/investmentMemo/investmentMemoTypes";

describe("InvestmentMemoValidationService", () => {
  it("fails when required sections are empty", () => {
    const result = InvestmentMemoValidationService.validateSections(emptySections());
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(8);
  });

  it("passes when all required sections are filled", () => {
    const sections = emptySections();
    for (const key of Object.keys(sections)) {
      if (key === "overallScore" || key === "additionalInformation") continue;
      (sections as any)[key] = "filled";
    }
    const result = InvestmentMemoValidationService.validateSections(sections);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid overallScore", () => {
    const sections = { ...emptySections(), overallScore: 150 };
    const result = InvestmentMemoValidationService.validateSections(sections);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.field === "overallScore")).toBe(true);
  });
});
