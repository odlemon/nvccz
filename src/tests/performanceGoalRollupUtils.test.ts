import {
  computeAchievementPercent,
  computeKpiLineProgressPercent,
  computeParentRollupFromChildren,
  normalizedSiblingWeights,
  parseContributionWeightPercentFromActivities,
  isTargetMet,
  resolveReverseScoring
} from '../services/performanceGoalRollupUtils';

describe('performanceGoalRollupUtils', () => {
  test('>= achievement scales with current/target', () => {
    expect(
      computeAchievementPercent({
        currentValue: 50,
        targetValue: 100,
        targetOperator: '>='
      })
    ).toBe(50);
    expect(
      computeAchievementPercent({
        currentValue: 120,
        targetValue: 100,
        targetOperator: '>='
      })
    ).toBe(100);
  });

  test('reverse KPI (Operating Expenses style): $10k target, $20k actual => 50% achievement', () => {
    expect(
      computeAchievementPercent({
        currentValue: 20_000,
        targetValue: 10_000,
        targetOperator: '<=',
        isReverseKpi: true
      })
    ).toBe(50);
    expect(
      computeAchievementPercent({
        currentValue: 10_000,
        targetValue: 10_000,
        targetOperator: '<=',
        isReverseKpi: true
      })
    ).toBe(100);
  });

  test('<= cap: at or under target is 100%', () => {
    expect(
      computeAchievementPercent({
        currentValue: 4000,
        targetValue: 5000,
        targetOperator: '<='
      })
    ).toBe(100);
    expect(
      computeAchievementPercent({
        currentValue: 6000,
        targetValue: 5000,
        targetOperator: '<='
      })
    ).toBeCloseTo((5000 / 6000) * 100, 5);
  });

  test('isTargetMet respects operator', () => {
    expect(isTargetMet(4000, 5000, '<=')).toBe(true);
    expect(isTargetMet(6000, 5000, '<=')).toBe(false);
    expect(isTargetMet(6000, 5000, '>=')).toBe(true);
  });

  test('isReverseKpi aligns with scorecard when operator is >=', () => {
    expect(resolveReverseScoring({ targetOperator: '>=', isReverseKpi: true })).toBe(true);
    expect(isTargetMet(4000, 5000, '>=', true)).toBe(true);
    expect(isTargetMet(6000, 5000, '>=', true)).toBe(false);
  });

  test('normalizedSiblingWeights uses scorecardWeight when activities empty', () => {
    const sibs = [
      { id: 'a', activities: {}, scorecardWeight: 80 },
      { id: 'b', activities: {}, scorecardWeight: 20 }
    ];
    const w = normalizedSiblingWeights(sibs);
    expect(w.get('a')).toBeCloseTo(0.8, 5);
    expect(w.get('b')).toBeCloseTo(0.2, 5);
  });

  test('equal weights when no contributionWeightPercent', () => {
    const sibs = [
      { id: 'a', activities: null },
      { id: 'b', activities: {} }
    ];
    const w = normalizedSiblingWeights(sibs);
    expect(w.get('a')).toBeCloseTo(0.5, 5);
    expect(w.get('b')).toBeCloseTo(0.5, 5);
  });

  test('weighted parent: 100% achievement × 80% weight + 0% × 20% = 80%', () => {
    const subGoals = [
      {
        id: 'sales',
        activities: { contributionWeightPercent: 80 },
        currentValue: 100,
        targetValue: 100,
        targetOperator: '>=',
        stage: 'completed',
        status: 'completed'
      },
      {
        id: 'ops',
        activities: { contributionWeightPercent: 20 },
        currentValue: 0,
        targetValue: 2000,
        targetOperator: '>=',
        stage: 'planning',
        status: 'active'
      }
    ];
    const rollup = computeParentRollupFromChildren(subGoals, 4000);
    expect(rollup.progressPercentage).toBeCloseTo(80, 5);
    expect(Number.isNaN(rollup.progressPercentage)).toBe(false);
    expect(Number.isNaN(rollup.suggestedCurrentValue)).toBe(false);
    expect(Number.isFinite(rollup.progressPercentage)).toBe(true);
    expect(Number.isFinite(rollup.suggestedCurrentValue)).toBe(true);
  });

  test('UAT: Individual → Dept — 3 children at 50% with ~33.3% weight each → parent 50%', () => {
    const w = 100 / 3;
    const subGoals = [
      {
        id: 'i1',
        activities: { contributionWeightPercent: w },
        currentValue: 50,
        targetValue: 100,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      },
      {
        id: 'i2',
        activities: { contributionWeightPercent: w },
        currentValue: 50,
        targetValue: 100,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      },
      {
        id: 'i3',
        activities: { contributionWeightPercent: w },
        currentValue: 50,
        targetValue: 100,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      }
    ];
    const rollup = computeParentRollupFromChildren(subGoals, 100);
    expect(rollup.progressPercentage).toBeCloseTo(50, 5);
    expect(rollup.suggestedCurrentValue).toBeCloseTo(50, 5);
  });

  test('C.07: one child at 0% achievement does not produce NaN in roll-up', () => {
    const subGoals = [
      {
        id: 'a',
        activities: {},
        currentValue: 0,
        targetValue: 100,
        targetOperator: '>=',
        stage: 'planning',
        status: 'active'
      },
      {
        id: 'b',
        activities: {},
        currentValue: 50,
        targetValue: 100,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      }
    ];
    const rollup = computeParentRollupFromChildren(subGoals, 1000);
    expect(rollup.progressPercentage).toBeCloseTo(25, 5);
    expect(Number.isNaN(rollup.progressPercentage)).toBe(false);
    expect(Number.isNaN(rollup.suggestedCurrentValue)).toBe(false);
    expect(rollup.suggestedCurrentValue).toBeCloseTo(250, 5);
  });

  test('null/empty roll-up: no sub-goals → 0% and finite (no NaN)', () => {
    const rollup = computeParentRollupFromChildren([], 1000);
    expect(rollup.progressPercentage).toBe(0);
    expect(rollup.suggestedCurrentValue).toBe(0);
    expect(Number.isNaN(rollup.progressPercentage)).toBe(false);
    expect(Number.isNaN(rollup.suggestedCurrentValue)).toBe(false);
  });

  test('KPI line analytics: empty goal list → 0 (not NaN)', () => {
    expect(computeKpiLineProgressPercent([], null)).toBe(0);
  });

  test('parseContributionWeightPercentFromActivities', () => {
    expect(parseContributionWeightPercentFromActivities({ contributionWeightPercent: 30 })).toBe(30);
    expect(parseContributionWeightPercentFromActivities([])).toBeNull();
  });
});
