// @ts-nocheck
import { DEP_CP_STATUSES, DEP_DOC_STATUSES, DEP_SIG_STATUSES } from "./dealExecutionPackSupport";

export type CpMetricInput = { weight: number; status: string };
export type MandatorySlotMetricInput = {
  slotCode: string;
  isMandatory: boolean;
  activeDocument: { sha256: string; verified?: boolean } | null;
};
export type SignatureMetricInput = { roleCode: string; status: string };

export class DealExecutionPackMetricsEngine {
  static round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  /** Eq. 1: I_CP = (sum w_i * C_i / sum w_i) * 100% where C_i = 1 if SATISFIED else 0 */
  static computeIcpPct(cps: CpMetricInput[]): number {
    if (!cps.length) return 100;
    const totalWeight = cps.reduce((s, c) => s + Math.max(0, Number(c.weight) || 0), 0);
    if (totalWeight <= 0) return 0;
    const satisfiedWeight = cps.reduce((s, c) => {
      const w = Math.max(0, Number(c.weight) || 0);
      return s + (c.status === DEP_CP_STATUSES.SATISFIED ? w : 0);
    }, 0);
    return DealExecutionPackMetricsEngine.round4((satisfiedWeight / totalWeight) * 100);
  }

  static mandatoryDocsComplete(slots: MandatorySlotMetricInput[]): boolean {
    const mandatory = slots.filter((s) => s.isMandatory);
    if (!mandatory.length) return true;
    return mandatory.every(
      (s) =>
        s.activeDocument &&
        Boolean(s.activeDocument.sha256) &&
        (s.activeDocument.verified === undefined || s.activeDocument.verified === true)
    );
  }

  static signaturesComplete(signatures: SignatureMetricInput[]): boolean {
    if (!signatures.length) return false;
    return signatures.every((s) => s.status === DEP_SIG_STATUSES.SIGNED);
  }

  /** Eq. 2: R_legal gate — product of mandatory docs, signatures, I_CP = 100% */
  static computeRLegal(args: {
    icpPct: number;
    slots: MandatorySlotMetricInput[];
    signatures: SignatureMetricInput[];
  }): { rLegal: boolean; icpPct: number; blockers: string[] } {
    const icpPct = DealExecutionPackMetricsEngine.round4(args.icpPct);
    const blockers: string[] = [];
    if (icpPct < 100) blockers.push("Conditions precedent incomplete (I_CP < 100%)");
    if (!DealExecutionPackMetricsEngine.mandatoryDocsComplete(args.slots)) {
      blockers.push("Mandatory documents missing or unverified");
    }
    if (!DealExecutionPackMetricsEngine.signaturesComplete(args.signatures)) {
      blockers.push("Required signatures incomplete");
    }
    return {
      rLegal: blockers.length === 0,
      icpPct,
      blockers,
    };
  }

  static isActiveDoc(doc: { status: string } | null | undefined): boolean {
    return doc?.status === DEP_DOC_STATUSES.ACTIVE;
  }
}
