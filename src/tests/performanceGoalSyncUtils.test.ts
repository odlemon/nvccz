import {
  dateRangesOverlap,
  defaultLoginSyncPeriod,
  glSyncSourceRef,
  groupGoalsIntoSyncJobs,
  pickCanonicalCompanyGoal,
  intersectSyncWindow
} from "../services/performanceGoalSyncUtils";

describe("performanceGoalSyncUtils", () => {
  test("dateRangesOverlap", () => {
    const a0 = new Date("2026-05-01T00:00:00.000Z");
    const a1 = new Date("2026-05-31T23:59:59.999Z");
    const b0 = new Date("2026-05-15T00:00:00.000Z");
    const b1 = new Date("2026-06-15T00:00:00.000Z");
    expect(dateRangesOverlap(a0, a1, b0, b1)).toBe(true);
    expect(dateRangesOverlap(a0, a1, new Date("2026-06-01"), new Date("2026-06-30"))).toBe(false);
  });

  test("pickCanonicalCompanyGoal prefers company and oldest createdAt", () => {
    const g1 = { id: "g1", type: "company", createdAt: new Date("2026-01-01") };
    const g2 = { id: "g2", type: "company", createdAt: new Date("2026-02-01") };
    const dept = { id: "d1", type: "department", createdAt: new Date("2025-12-01") };
    const { canonical, duplicates } = pickCanonicalCompanyGoal([g2, dept, g1]);
    expect(canonical.id).toBe("g1");
    expect(duplicates.map((d) => d.id)).toEqual(["g2"]);
  });

  test("intersectSyncWindow clips to goal dates", () => {
    const win = intersectSyncWindow(
      {
        startDate: new Date("2026-05-10"),
        endDate: new Date("2026-12-31")
      },
      new Date("2026-05-01"),
      new Date("2026-05-31")
    );
    expect(win).not.toBeNull();
    expect(win!.windowStart.toISOString().slice(0, 10)).toBe("2026-05-10");
    expect(win!.windowEnd.toISOString().slice(0, 10)).toBe("2026-05-31");
  });

  test("glSyncSourceRef is stable per period", () => {
    const s = new Date("2026-05-01T00:00:00.000Z");
    const e = new Date("2026-05-31T23:59:59.999Z");
    expect(glSyncSourceRef(s, e)).toBe("gl_sync:2026-05-01:2026-05-31");
  });

  test("groupGoalsIntoSyncJobs groups by KPI", () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-31T23:59:59.999Z");
    const jobs = groupGoalsIntoSyncJobs(
      [
        {
          id: "g1",
          title: "Revenue A",
          type: "company",
          kpiId: "k1",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
          createdAt: new Date("2026-01-01"),
          parentGoalId: null,
          kpi: {
            id: "k1",
            code: "TOTAL_REVENUE",
            name: "Total Revenue",
            isFinancial: true,
            accountType: "Revenue"
          }
        },
        {
          id: "g2",
          title: "Revenue B",
          type: "company",
          kpiId: "k1",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
          createdAt: new Date("2026-02-01"),
          parentGoalId: null,
          kpi: {
            id: "k1",
            code: "TOTAL_REVENUE",
            name: "Total Revenue",
            isFinancial: true,
            accountType: "Revenue"
          }
        }
      ],
      periodStart,
      periodEnd
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].canonicalGoalId).toBe("g1");
    expect(jobs[0].duplicateGoalIds).toEqual(["g2"]);
  });

  test("defaultLoginSyncPeriod uses current UTC month", () => {
    const { periodStart, periodEnd } = defaultLoginSyncPeriod();
    const now = new Date();
    expect(periodStart.getUTCMonth()).toBe(now.getUTCMonth());
    expect(periodStart.getUTCDate()).toBe(1);
    expect(periodEnd.getUTCDate()).toBe(now.getUTCDate());
  });
});
