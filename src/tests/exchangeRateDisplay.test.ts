// @ts-nocheck
import { describe, it, expect } from "@jest/globals";
import { parseOfficialAndStreetFromHtml, parseZimrateDateLabel } from "../services/ZimrateRateService";

describe("parseZimrateDateLabel", () => {
  it("parses a normal DD-MM-YYYY label", () => {
    const d = parseZimrateDateLabel("13-08-2026");
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-13");
  });

  it("treats a 2-digit year as 2000+y, not Date.UTC's legacy 1900+y (live incident: label '16-02-19' stored as 1919-02-16)", () => {
    const d = parseZimrateDateLabel("16-02-19");
    expect(d.toISOString().slice(0, 10)).toBe("2019-02-16");
  });

  it("returns null for a missing or malformed label", () => {
    expect(parseZimrateDateLabel(undefined)).toBeNull();
    expect(parseZimrateDateLabel("")).toBeNull();
    expect(parseZimrateDateLabel("not-a-date")).toBeNull();
  });
});

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
