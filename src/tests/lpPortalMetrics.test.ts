// @ts-nocheck
import { describe, it, expect } from "@jest/globals";

describe("LP Portal metrics conventions", () => {
  it("TVPI = DPI + RVPI identity holds for sample values", () => {
    const dpi = 0.4;
    const rvpi = 1.1;
    const tvpi = dpi + rvpi;
    expect(tvpi).toBeCloseTo(1.5);
  });
});
