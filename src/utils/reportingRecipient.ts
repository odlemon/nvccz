/**
 * Investee reporting emails: prefer **Primary financial contact** (`contactEmail` on portfolio company),
 * else the portal login user email (spec fallback).
 */

export type ReportingRecipientResolution = {
  email: string;
  /** "Hello …" / copy */
  salutation: string;
  /** MIME To: display name */
  mailboxDisplayName: string;
  source: "PRIMARY_FINANCIAL_CONTACT" | "PORTAL_USER";
};

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function resolveReportingNotificationRecipient(args: {
  companyName: string;
  contactEmail: string | null | undefined;
  contactPerson: string | null | undefined;
  portalUserEmail: string | null | undefined;
}): ReportingRecipientResolution | null {
  const company = args.companyName?.trim() || "Portfolio company";
  const ce = args.contactEmail?.trim() || "";
  const ue = args.portalUserEmail?.trim() || "";

  if (ce && looksLikeEmail(ce)) {
    const person = args.contactPerson?.trim();
    const mailboxDisplayName = person || company;
    return {
      email: ce,
      salutation: person || company,
      mailboxDisplayName,
      source: "PRIMARY_FINANCIAL_CONTACT",
    };
  }

  if (ue && looksLikeEmail(ue)) {
    return {
      email: ue,
      salutation: company,
      mailboxDisplayName: company,
      source: "PORTAL_USER",
    };
  }

  return null;
}
