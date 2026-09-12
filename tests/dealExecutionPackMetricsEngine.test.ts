import { DealExecutionPackMetricsEngine } from "../src/services/dealExecutionPack/DealExecutionPackMetricsEngine";
import { DEP_CP_STATUSES, DEP_SIG_STATUSES } from "../src/services/dealExecutionPack/dealExecutionPackSupport";

describe("DealExecutionPackMetricsEngine", () => {
  test("I_CP weighted completion", () => {
    const icp = DealExecutionPackMetricsEngine.computeIcpPct([
      { weight: 50, status: DEP_CP_STATUSES.SATISFIED },
      { weight: 50, status: DEP_CP_STATUSES.PENDING },
    ]);
    expect(icp).toBe(50);
  });

  test("I_CP returns 100 when no CPs", () => {
    expect(DealExecutionPackMetricsEngine.computeIcpPct([])).toBe(100);
  });

  test("R_legal gate blocks incomplete pack", () => {
    const gate = DealExecutionPackMetricsEngine.computeRLegal({
      icpPct: 50,
      slots: [
        { slotCode: "SPA", isMandatory: true, activeDocument: null },
        { slotCode: "SHA", isMandatory: true, activeDocument: { sha256: "abc" } },
      ],
      signatures: [{ roleCode: "CCO", status: DEP_SIG_STATUSES.PENDING }],
    });
    expect(gate.rLegal).toBe(false);
    expect(gate.blockers.length).toBeGreaterThan(0);
  });

  test("R_legal gate passes when complete", () => {
    const gate = DealExecutionPackMetricsEngine.computeRLegal({
      icpPct: 100,
      slots: [
        { slotCode: "SPA", isMandatory: true, activeDocument: { sha256: "abc" } },
        { slotCode: "SHA", isMandatory: true, activeDocument: { sha256: "def" } },
      ],
      signatures: [
        { roleCode: "LEGAL_COORDINATOR", status: DEP_SIG_STATUSES.SIGNED },
        { roleCode: "CCO", status: DEP_SIG_STATUSES.SIGNED },
      ],
    });
    expect(gate.rLegal).toBe(true);
    expect(gate.blockers).toEqual([]);
  });
});
