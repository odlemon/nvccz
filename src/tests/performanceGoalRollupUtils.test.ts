import {
  computeAchievementPercent,
  computeKpiLineProgressPercent,
  computeParentRollupFromChildren,
  deriveGoalProgressState,
  formatProgressPercent,
  normalizedSiblingWeights,
  parseContributionWeightPercentFromActivities,
  isTargetMet,
  resolveReverseScoring,
  resolveEffectiveReverseKpi,
  resolveKpiCurrentFromGoals,
  resolveKpiSyncStatus,
  resolveKpiTargetFromGoals,
  resolveKpiCurrentFromGoalsForAnalytics,
  resolveKpiProgressPercentForAnalytics,
  parseGoalCurrentAndTargetForAnalytics,
  filterCompanyGoalsForKpiAnalytics
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

  test('resolveEffectiveReverseKpi infers expense and liability', () => {
    expect(resolveEffectiveReverseKpi({ isReverseKpi: false, accountType: 'Expense' })).toBe(true);
    expect(resolveEffectiveReverseKpi({ isReverseKpi: false, accountType: 'Liability' })).toBe(true);
    expect(resolveEffectiveReverseKpi({ isReverseKpi: false, accountType: 'Revenue' })).toBe(false);
    expect(
      resolveEffectiveReverseKpi({ isReverseKpi: false, accountType: 'Revenue' }, [{ isReverseKpi: true }])
    ).toBe(true);
  });

  test('deriveGoalProgressState: planning → in_progress when current > 0', () => {
    const s = deriveGoalProgressState({
      currentValue: 100,
      targetValue: 3000,
      targetOperator: '>=',
      isReverseKpi: false,
      previousStage: 'planning'
    });
    expect(s.stage).toBe('in_progress');
    expect(s.status).toBe('active');
    expect(s.isTargetMet).toBe(false);
    expect(s.progressPercentage).toBe('3.33');
  });

  test('deriveGoalProgressState: straight KPI completed at target', () => {
    const s = deriveGoalProgressState({
      currentValue: 3000,
      targetValue: 3000,
      targetOperator: '>=',
      isReverseKpi: false,
      previousStage: 'in_progress'
    });
    expect(s.stage).toBe('completed');
    expect(s.status).toBe('completed');
    expect(s.isTargetMet).toBe(true);
    expect(s.progressPercentage).toBe('100.00');
  });

  test('deriveGoalProgressState: reverse KPI payroll overspend stays in progress', () => {
    const s = deriveGoalProgressState({
      currentValue: 166800,
      targetValue: 30000,
      targetOperator: '<=',
      isReverseKpi: true,
      previousStage: 'planning'
    });
    expect(s.stage).toBe('in_progress');
    expect(s.isTargetMet).toBe(false);
    expect(parseFloat(s.progressPercentage)).toBeCloseTo(17.99, 1);
  });

  test('deriveGoalProgressState: reverse KPI completed at or under cap', () => {
    const s = deriveGoalProgressState({
      currentValue: 25000,
      targetValue: 30000,
      targetOperator: '<=',
      isReverseKpi: true,
      previousStage: 'in_progress'
    });
    expect(s.stage).toBe('completed');
    expect(s.isTargetMet).toBe(true);
    expect(s.progressPercentage).toBe('100.00');
  });

  test('formatProgressPercent uses 2 decimals consistently', () => {
    expect(formatProgressPercent(10.789)).toBe('10.79');
    expect(formatProgressPercent(17.991)).toBe('17.99');
    expect(formatProgressPercent(100)).toBe('100.00');
  });

  test('resolveKpiCurrentFromGoals uses company goals only when present', () => {
    const goals = [
      { type: 'company', currentValue: 166800, targetValue: 30000 },
      { type: 'department', currentValue: 166800, targetValue: 18000 },
      { type: 'individual', currentValue: 166800, targetValue: 30000 }
    ];
    expect(resolveKpiCurrentFromGoals(goals)).toBe(166800);
  });

  test('resolveKpiCurrentFromGoals falls back to department then all', () => {
    expect(
      resolveKpiCurrentFromGoals([
        { type: 'department', currentValue: 100, targetValue: 200 },
        { type: 'individual', currentValue: 50, targetValue: 100 }
      ])
    ).toBe(100);
    expect(
      resolveKpiCurrentFromGoals([{ type: 'individual', currentValue: 50, targetValue: 100 }])
    ).toBe(50);
  });

  test('resolveKpiTargetFromGoals sums company targets only', () => {
    const goals = [
      { type: 'company', currentValue: 100, targetValue: 500000 },
      { type: 'department', currentValue: 50000, targetValue: 200000 },
      { type: 'individual', currentValue: 25000, targetValue: 100000 }
    ];
    expect(resolveKpiTargetFromGoals(goals)).toBe(500000);
  });

  test('parseGoalCurrentAndTargetForAnalytics uses currentValue not stale preciseCurrentValue', () => {
    expect(
      parseGoalCurrentAndTargetForAnalytics({
        currentValue: 0,
        targetValue: 35000,
        preciseTargetValue: '35000'
      })
    ).toEqual({ current: 0, target: 35000 });
    expect(
      parseGoalCurrentAndTargetForAnalytics({
        currentValue: 0,
        targetValue: 35000,
        preciseCurrentValue: '1924830.417'
      })
    ).toEqual({ current: 0, target: 35000 });
  });

  test('resolveKpiCurrentFromGoalsForAnalytics sums company currentValue only', () => {
    expect(
      resolveKpiCurrentFromGoalsForAnalytics([
        { type: 'company', currentValue: 0, targetValue: 35000, preciseCurrentValue: '1924830' },
        { type: 'department', currentValue: 999, targetValue: 1 }
      ])
    ).toBe(0);
  });

  test('resolveKpiProgressPercentForAnalytics prefers stored progressPercentage', () => {
    expect(
      resolveKpiProgressPercentForAnalytics(
        [{ type: 'company', currentValue: 0, targetValue: 35000, progressPercentage: 12.5 }],
        null
      )
    ).toBe(12.5);
  });

  test('filterCompanyGoalsForKpiAnalytics excludes dept and individual', () => {
    const goals = [
      { type: 'company', id: 'c1' },
      { type: 'department', id: 'd1' },
      { type: 'individual', id: 'i1' }
    ];
    expect(filterCompanyGoalsForKpiAnalytics(goals).map((g) => g.id)).toEqual(['c1']);
  });

  test('additive revenue parent rollup sums child currentValue (not target × weighted %)', () => {
    const subGoals = [
      {
        id: 'ind1',
        activities: {},
        currentValue: 500,
        targetValue: 35000,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      }
    ];
    const rollup = computeParentRollupFromChildren(subGoals, 35000, {
      targetOperator: '>=',
      isReverseKpi: false,
      accountType: 'Revenue'
    });
    expect(rollup.suggestedCurrentValue).toBe(500);
    expect(rollup.progressPercentage).toBeCloseTo((500 / 35000) * 100, 2);
  });

  test('additive rollup: 500 + 200 child currents → parent 700', () => {
    const subGoals = [
      {
        id: 'ind1',
        activities: {},
        currentValue: 500,
        targetValue: 35000,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      },
      {
        id: 'ind2',
        activities: {},
        currentValue: 200,
        targetValue: 35000,
        targetOperator: '>=',
        stage: 'in_progress',
        status: 'active'
      }
    ];
    const rollup = computeParentRollupFromChildren(subGoals, 70000, {
      targetOperator: '>=',
      isReverseKpi: false,
      accountType: 'Revenue'
    });
    expect(rollup.suggestedCurrentValue).toBe(700);
    expect(rollup.progressPercentage).toBeCloseTo(1, 1);
  });

  test('resolveKpiSyncStatus detects BSC/GL sync metadata', () => {
    expect(resolveKpiSyncStatus([{ currentValue: 0, syncConfig: null }])).toBe('pending');
    expect(
      resolveKpiSyncStatus([
        { currentValue: 0, syncConfig: { glSyncedAt: '2026-05-01T00:00:00.000Z' } }
      ])
    ).toBe('synced');
    expect(
      resolveKpiSyncStatus([{ currentValue: 0, lastSyncedAt: new Date('2026-05-01') }])
    ).toBe('synced');
  });
});
