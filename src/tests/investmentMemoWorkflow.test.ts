// @ts-nocheck
import { describe, it, expect } from "@jest/globals";
import { InvestmentMemoAccessService } from "../services/investmentMemo/InvestmentMemoAccessService";

describe("InvestmentMemoAccessService", () => {
  it("identifies CIO by role code", () => {
    expect(InvestmentMemoAccessService.isCio({ roleCode: "CIO" })).toBe(true);
    expect(InvestmentMemoAccessService.isCio({ roleCode: "FUND_MGR" })).toBe(false);
  });

  it("allows CIO to approve", () => {
    expect(() => InvestmentMemoAccessService.assertCanApprove({ roleCode: "CIO" })).not.toThrow();
  });

  it("blocks non-CIO from approve", () => {
    expect(() => InvestmentMemoAccessService.assertCanApprove({ roleCode: "INV_ANALYST" })).toThrow();
  });
});
