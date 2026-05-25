import { periodsOverlap } from "../services/CeoPerformanceContractLinkService";

describe("CEO performance contract ↔ company goal linking", () => {
  test("periodsOverlap detects intersecting date ranges", () => {
    const y2026Start = new Date("2026-01-01T00:00:00.000Z");
    const y2026End = new Date("2026-12-31T23:59:59.999Z");
    const goalMid = new Date("2026-06-15T12:00:00.000Z");

    expect(periodsOverlap(y2026Start, y2026End, goalMid, goalMid)).toBe(true);
    expect(periodsOverlap(y2026Start, y2026End, y2026Start, y2026End)).toBe(true);
    expect(
      periodsOverlap(
        new Date("2025-01-01T00:00:00.000Z"),
        new Date("2025-12-31T23:59:59.999Z"),
        y2026Start,
        y2026End
      )
    ).toBe(false);
  });

  test("edge: goal ends when contract starts — still overlaps if same instant window", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    expect(periodsOverlap(t, t, t, t)).toBe(true);
  });
});
