/** Application document type for RBZ Exchange Control approval (legal/compliance upload). */
export const RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE = "RBZ_EXCHANGE_CONTROL";

/**
 * Who uploads: **Legal** or **Compliance** staff (see `RBZ_EXCHANGE_CONTROL_UPLOADER_ROLE_CODES`), plus **admin**.
 * After upload, the same team (or process) sets `kycVerified` via `PATCH .../statutory-compliance` to clear compliance for disbursement.
 */
export const RBZ_EXCHANGE_CONTROL_UPLOADER_ROLE_CODES = [
  "LEGAL_MGR",
  "LEGAL_OFF",
  "COMPLIANCE_OFF",
  "COMPLIANCE_OFF_INV",
  "LEGAL_ADVISOR",
  "LEGAL_MEM"
] as const;

export const FUND_DISBURSEMENT_COMPLIANCE_BLOCKED_MESSAGE =
  "Fund disbursement is blocked until statutory compliance is cleared: upload RBZ Exchange Control approval and set KYC verified.";

export function userCanUploadRbzExchangeControlDocument(user: {
  role?: { name?: string } | null;
  roleCode?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role?.name === "admin") return true;
  const code = user.roleCode;
  if (!code) return false;
  return (RBZ_EXCHANGE_CONTROL_UPLOADER_ROLE_CODES as readonly string[]).includes(code);
}
