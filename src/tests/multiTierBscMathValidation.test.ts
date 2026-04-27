import {
  BSC_WEIGHTED_AGGREGATION_DECIMALS,
  redistributeWeights,
  getContributionWeight,
  round
} from "../services/performanceScorecardSupport";
import { computeParentRollupFromChildren } from "../services/performanceGoalRollupUtils";

const DP = 4;
const expectClose4 = (a: number, b: number) => {
  expect(a).toBeCloseTo(b, DP);
};

describe("Multi-tier BSC math validation (Excel-style, 4dp)", () => {
  test("parent goal roll-up: 12.5% / 37.5% / 50% weights, varied child achievement", () => {
    const w = (n: number) => ({ contributionWeightPercent: n } as const);
    const subGoals = [
      {
        id: "a",
        activities: w(12.5),
        currentValue: 80,
        targetValue: 100,
        targetOperator: ">=",
        stage: "in_progress",
        status: "active"
      },
      {
        id: "b",
        activities: w(37.5),
        currentValue: 90,
        targetValue: 100,
        targetOperator: ">=",
        stage: "in_progress",
        status: "active"
      },
      {
        id: "c",
        activities: w(50),
        currentValue: 60,
        targetValue: 100,
        targetOperator: ">=",
        stage: "in_progress",
        status: "active"
      }
    ];
    const expected =
      0.125 * 80 +
      0.375 * 90 +
      0.5 * 60;
    const rollup = computeParentRollupFromChildren(subGoals, 1000);
    expectClose4(rollup.progressPercentage, expected);
    expect(rollup.progressPercentage).toBe(round(rollup.progressPercentage, BSC_WEIGHTED_AGGREGATION_DECIMALS));
  });

  test("org dashboard pillar: three company goal lines, weights 12.5 / 37.5 / 50, varied progress %", () => {
    const rows = redistributeWeights([
      { id: "g1", weight: 12.5, progressPct: 100, isPendingApproval: false, excludedFromScoring: false },
      { id: "g2", weight: 37.5, progressPct: 33, isPendingApproval: false, excludedFromScoring: false },
      { id: "g3", weight: 50, progressPct: 18.5, isPendingApproval: false, excludedFromScoring: false }
    ]);
    const active = rows.filter((r) => !r.isPendingApproval && !r.excludedFromScoring);
    const pillarRaw = active.reduce(
      (sum, row) => sum + (row.effectiveWeight * (row as { progressPct: number }).progressPct) / 100,
      0
    );
    const expected =
      0.125 * 100 +
      0.375 * 33 +
      0.5 * 18.5;
    const pillarScore = round(pillarRaw, BSC_WEIGHTED_AGGREGATION_DECIMALS);
    expectClose4(pillarScore, expected);
  });

  test("final org BSC: three pillars × weights 12.5 / 37.5 / 50, pillar scores 100 / 0 / 50", () => {
    const pillars = [
      { pillarWeight: 12.5, pillarScore: 100 },
      { pillarWeight: 37.5, pillarScore: 0 },
      { pillarWeight: 50, pillarScore: 50 }
    ];
    const orgRaw = pillars.reduce((s, p) => s + (p.pillarWeight * p.pillarScore) / 100, 0);
    const expected = 0.125 * 100 + 0.375 * 0 + 0.5 * 50;
    const orgBscScore = round(orgRaw, BSC_WEIGHTED_AGGREGATION_DECIMALS);
    expectClose4(orgBscScore, expected);
    expectClose4(expected, 37.5);
  });

  test("dept sub-goal roll-up: same weight split as getOrgBSCDashboard (getContributionWeight)", () => {
    const fin = 100;
    const hr = 0;
    const ops = 50;
    const w1 = getContributionWeight({ activities: { contributionWeightPercent: 12.5 } }, 0);
    const w2 = getContributionWeight({ activities: { contributionWeightPercent: 37.5 } }, 0);
    const w3 = getContributionWeight({ activities: { contributionWeightPercent: 50 } }, 0);
    const t = w1 + w2 + w3;
    const raw = (fin * w1 + hr * w2 + ops * w3) / t;
    const rollup = round(raw, BSC_WEIGHTED_AGGREGATION_DECIMALS);
    const expected = 0.125 * 100 + 0.375 * 0 + 0.5 * 50;
    expectClose4(rollup, expected);
  });
});
