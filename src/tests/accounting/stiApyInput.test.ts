import { normalizeApyInputToDecimal } from "../../utils/stiApyInput";

describe("normalizeApyInputToDecimal", () => {
  const prev = process.env.STI_APY_STRICT_DECIMAL_ONLY;

  afterEach(() => {
    if (prev === undefined) delete process.env.STI_APY_STRICT_DECIMAL_ONLY;
    else process.env.STI_APY_STRICT_DECIMAL_ONLY = prev;
  });

  it("treats |x| <= 1 as decimal annual rate", () => {
    expect(normalizeApyInputToDecimal(0.05).toString()).toBe("0.05");
    expect(normalizeApyInputToDecimal("-0.005").toString()).toBe("-0.005");
  });

  it("treats |x| > 1 as whole percent when not strict", () => {
    delete process.env.STI_APY_STRICT_DECIMAL_ONLY;
    expect(normalizeApyInputToDecimal(8).toString()).toBe("0.08");
    expect(normalizeApyInputToDecimal(80).toString()).toBe("0.8");
    expect(normalizeApyInputToDecimal(1500).toString()).toBe("15");
  });

  it("strict mode stores input as-is", () => {
    process.env.STI_APY_STRICT_DECIMAL_ONLY = "true";
    expect(normalizeApyInputToDecimal(0.08).toString()).toBe("0.08");
    expect(normalizeApyInputToDecimal(80).toString()).toBe("80");
  });
});
