import {
  computeRevalidationAlertDueAt,
  isTaxClearanceValidOnDate,
  parseItf263ExpiryDate,
  shouldFireRevalidationAlert,
  utcDateOnly,
} from "../utils/itf263TaxClearance";

describe("itf263TaxClearance", () => {
  it("parses labelled Valid until DD/MM/YYYY", () => {
    const text = `ZIMRA Tax Clearance ITF263\nValid until: 31/12/2027\nTaxpayer: ACME`;
    const d = parseItf263ExpiryDate(text);
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2027);
    expect(d!.getUTCMonth()).toBe(11);
    expect(d!.getUTCDate()).toBe(31);
  });

  it("parses Expiry date pattern", () => {
    const text = "Certificate Expiry Date: 15-06-2028";
    const d = parseItf263ExpiryDate(text);
    expect(d).not.toBeNull();
    expect(d!.getUTCMonth()).toBe(5);
    expect(d!.getUTCDate()).toBe(15);
  });

  it("parses ISO date in body", () => {
    const d = parseItf263ExpiryDate("Misc 2029-03-20 end");
    expect(d).not.toBeNull();
    expect(d!.getUTCMonth()).toBe(2);
    expect(d!.getUTCDate()).toBe(20);
  });

  it("computes alert 30 days before expiry", () => {
    const expiry = new Date(Date.UTC(2027, 5, 30));
    const alert = computeRevalidationAlertDueAt(expiry);
    expect(alert.getUTCMonth()).toBe(4);
    expect(alert.getUTCDate()).toBe(31);
  });

  it("shouldFireRevalidationAlert when today is alert day and clearance valid", () => {
    const expiry = new Date(Date.UTC(2030, 0, 31));
    const alertDue = new Date(Date.UTC(2030, 0, 1));
    const now = new Date(Date.UTC(2030, 0, 1));
    expect(shouldFireRevalidationAlert(expiry, alertDue, now)).toBe(true);
  });

  it("isTaxClearanceValidOnDate inclusive on expiry day", () => {
    const expiry = new Date(Date.UTC(2026, 3, 1));
    const now = new Date(Date.UTC(2026, 3, 1));
    expect(isTaxClearanceValidOnDate(expiry, now)).toBe(true);
  });
});
