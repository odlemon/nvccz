// @ts-nocheck
import { describe, it, expect } from "@jest/globals";
import { parseOfficialAndStreetFromHtml } from "../services/ZimrateRateService";

describe("parseOfficialAndStreetFromHtml", () => {
  it("parses official and street from labeled HTML", () => {
    const html = `
      <div>Official Rate</div><div>30.50 ZiG</div>
      <div>Street Rate</div><div>35.75 ZiG</div>
    `;
    const { official, street } = parseOfficialAndStreetFromHtml(html);
    expect(official).toBe(30.5);
    expect(street).toBe(35.75);
  });

  it("infers street when multiple distinct rates present", () => {
    const html = `Official Rate 28.00 ZiG and elsewhere 31.50 ZiG`;
    const { official, street } = parseOfficialAndStreetFromHtml(html);
    expect(official).toBe(28);
    expect(street).toBe(31.5);
  });

  it("returns null street when only official present", () => {
    const html = `Official Rate 30.00 ZiG`;
    const { official, street } = parseOfficialAndStreetFromHtml(html);
    expect(official).toBe(30);
    expect(street).toBeNull();
  });
});
