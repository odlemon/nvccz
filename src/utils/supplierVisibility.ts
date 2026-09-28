// @ts-nocheck
/**
 * What a supplier may be told about their own submission (SRD §9). Internal review states, scores and notes are never
 * disclosed; a supplier sees only these outcomes.
 */
export function supplierVisibleStatus(status: string | null | undefined): { code: string; label: string } {
  switch (String(status || "").toUpperCase()) {
    case "ACCEPTED":
      return { code: "AWARDED", label: "Awarded" };
    case "REJECTED":
      return { code: "NOT_SUCCESSFUL", label: "Not successful" };
    case "SUPERSEDED":
      return { code: "REPLACED", label: "Replaced by a later submission" };
    case "DRAFT":
      return { code: "DRAFT", label: "Draft" };
    default:
      // SUBMITTED, UNDER_REVIEW, PENDING, anything internal
      return { code: "RECEIVED", label: "Received" };
  }
}
