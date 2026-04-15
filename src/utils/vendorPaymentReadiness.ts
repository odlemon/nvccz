// @ts-nocheck

export const VENDOR_BANK_PAYMENT_READINESS_MESSAGE =
  "Vendor bank account requires Branch Code, SWIFT/BIC code, and Currency to ensure payment success.";

export function vendorBankMeetsPaymentReadiness(params: {
  branchCode?: string | null;
  swiftCode?: string | null;
  currencyCode?: string | null;
}): boolean {
  return (
    !!String(params.branchCode ?? "").trim() &&
    !!String(params.swiftCode ?? "").trim() &&
    !!String(params.currencyCode ?? "").trim()
  );
}

export function assertVendorBankPaymentReadiness(params: {
  branchCode?: string | null;
  swiftCode?: string | null;
  currencyCode?: string | null;
}): void {
  if (!vendorBankMeetsPaymentReadiness(params)) {
    throw new Error(VENDOR_BANK_PAYMENT_READINESS_MESSAGE);
  }
}
