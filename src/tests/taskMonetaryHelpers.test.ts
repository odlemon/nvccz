import {
  addMonetaryAchieved,
  addPercentAchieved,
  parseMonetaryAmount,
  resolveTaskStageFromAchievement
} from '../services/TaskService';

describe('TaskService monetary helpers', () => {
  test('addMonetaryAchieved adds numbers instead of concatenating Decimal strings', () => {
    expect(addMonetaryAchieved('25000', 25000)).toBe(50000);
    expect(addMonetaryAchieved(25000, '25000')).toBe(50000);
    expect(addMonetaryAchieved('25000', '25000')).toBe(50000);
  });

  test('parseMonetaryAmount handles null, empty, and invalid values', () => {
    expect(parseMonetaryAmount(null)).toBe(0);
    expect(parseMonetaryAmount('')).toBe(0);
    expect(parseMonetaryAmount('abc')).toBe(0);
    expect(parseMonetaryAmount('500.25')).toBe(500.25);
  });

  test('addPercentAchieved uses numeric addition', () => {
    expect(addPercentAchieved('10', '5')).toBe(15);
  });

  test('resolveTaskStageFromAchievement: completed at target, in_progress when partial', () => {
    expect(resolveTaskStageFromAchievement(35000, 35000, 'todo')).toBe('completed');
    expect(resolveTaskStageFromAchievement(700, 35000, 'todo')).toBe('in_progress');
    expect(resolveTaskStageFromAchievement(0, 35000, 'todo')).toBe('todo');
  });

  test('two incremental posts of 25000 accumulate to 50000', () => {
    let achieved = 0;
    achieved = addMonetaryAchieved(achieved, 25000);
    achieved = addMonetaryAchieved(achieved, 25000);
    expect(achieved).toBe(50000);
  });
});
