import { describe, it, expect } from 'vitest';
import { computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP } from '../levels';
import { computeWeeklyCompletionPct, computeRankUpdate } from '../rank';
import { getStrWeeklyStatus, canUseRestToken, isSessionComplete, getNextTemplate, shouldIncreaseWeight, shouldDeload, computeDeloadWeight, getDefaultExercises } from '../str';
import type { StrSession, ExerciseRecord } from '@/types';

// ===== Levels ===== //

describe('computeLevel', () => {
  it('level 1 with 0 XP', () => {
    const result = computeLevel(0);
    expect(result.level).toBe(1);
    expect(result.currentXP).toBe(0);
    expect(result.xpToNext).toBe(100);
    expect(result.progressPct).toBe(0);
  });

  it('level 1 with 50 XP', () => {
    const result = computeLevel(50);
    expect(result.level).toBe(1);
    expect(result.currentXP).toBe(50);
    expect(result.progressPct).toBe(50);
  });

  it('level 2 with exactly 100 XP', () => {
    const result = computeLevel(100);
    expect(result.level).toBe(2);
    expect(result.currentXP).toBe(0);
    expect(result.xpToNext).toBe(200);
  });

  it('level 3 with 300 XP (100+200)', () => {
    const result = computeLevel(300);
    expect(result.level).toBe(3);
    expect(result.currentXP).toBe(0);
  });

  it('mid-level 3 with 350 XP', () => {
    const result = computeLevel(350);
    expect(result.level).toBe(3);
    expect(result.currentXP).toBe(50);
    expect(result.xpToNext).toBe(300);
    expect(result.progressPct).toBe(17);
  });
});

describe('XP computation functions', () => {
  it('computeStrXP', () => {
    expect(computeStrXP(10, 2)).toBe(270); // 10*25 + 2*10
  });

  it('computeAgiXP', () => {
    expect(computeAgiXP(100, 7)).toBe(135); // 100 + 7*5
  });

  it('computeVitXP', () => {
    expect(computeVitXP(10)).toBe(150); // 10*15
  });

  it('computeIntXP', () => {
    expect(computeIntXP(50, 10)).toBe(150); // 50*2 + 10*5
  });

  it('computePerXP', () => {
    expect(computePerXP(10)).toBe(80); // 10*8
  });
});

// ===== Rank ===== //

describe('computeWeeklyCompletionPct', () => {
  it('all complete = 100%', () => {
    const result = computeWeeklyCompletionPct({
      strCompleted: 4, agiCompleted: 7, vitCompleted: 7, intCompleted: 7, perCompleted: 7,
    });
    expect(result).toBe(100);
  });

  it('nothing done = 0%', () => {
    const result = computeWeeklyCompletionPct({
      strCompleted: 0, agiCompleted: 0, vitCompleted: 0, intCompleted: 0, perCompleted: 0,
    });
    expect(result).toBe(0);
  });

  it('partial completion', () => {
    const result = computeWeeklyCompletionPct({
      strCompleted: 2, agiCompleted: 5, vitCompleted: 3, intCompleted: 4, perCompleted: 6,
    });
    // 20/32 = 62.5 -> 63%
    expect(result).toBe(63);
  });
});

describe('computeRankUpdate', () => {
  it('drops rank when below 60%', () => {
    const result = computeRankUpdate('C', 55, 0);
    expect(result.newRank).toBe('D');
    expect(result.newConsecutiveWeeks).toBe(0);
  });

  it('E rank cannot drop below E', () => {
    const result = computeRankUpdate('E', 30, 0);
    expect(result.newRank).toBe('E');
  });

  it('rank stays between 60-79%', () => {
    const result = computeRankUpdate('C', 70, 1);
    expect(result.newRank).toBe('C');
    expect(result.newConsecutiveWeeks).toBe(0);
  });

  it('accumulates consecutive weeks at 80%+', () => {
    const result = computeRankUpdate('C', 85, 0);
    expect(result.newRank).toBe('C');
    expect(result.newConsecutiveWeeks).toBe(1);
  });

  it('promotes after 2 consecutive weeks at 80%+', () => {
    const result = computeRankUpdate('C', 85, 1);
    expect(result.newRank).toBe('B');
    expect(result.newConsecutiveWeeks).toBe(0);
  });

  it('S rank cannot promote further', () => {
    const result = computeRankUpdate('S', 90, 5);
    expect(result.newRank).toBe('S');
  });
});

// ===== STR Logic ===== //

function makeSession(overrides: Partial<StrSession> = {}): StrSession {
  return {
    date: '2025-01-06',
    template: 'A',
    exercises: [],
    completed: false,
    isRestDay: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('getStrWeeklyStatus', () => {
  it('empty week', () => {
    const result = getStrWeeklyStatus([]);
    expect(result.sessionsCompleted).toBe(0);
    expect(result.restTokensUsed).toBe(0);
  });

  it('counts completed sessions and rest days', () => {
    const sessions = [
      makeSession({ completed: true }),
      makeSession({ completed: true }),
      makeSession({ isRestDay: true }),
    ];
    const result = getStrWeeklyStatus(sessions);
    expect(result.sessionsCompleted).toBe(2);
    expect(result.restTokensUsed).toBe(1);
  });

  it('does not count rest days as completed', () => {
    const sessions = [
      makeSession({ isRestDay: true }),
      makeSession({ isRestDay: true }),
    ];
    const result = getStrWeeklyStatus(sessions);
    expect(result.sessionsCompleted).toBe(0);
    expect(result.restTokensUsed).toBe(2);
  });
});

describe('canUseRestToken', () => {
  it('can use when under 3', () => {
    expect(canUseRestToken([
      makeSession({ isRestDay: true }),
    ])).toBe(true);
  });

  it('cannot use when at 3', () => {
    expect(canUseRestToken([
      makeSession({ isRestDay: true }),
      makeSession({ isRestDay: true }),
      makeSession({ isRestDay: true }),
    ])).toBe(false);
  });
});

describe('isSessionComplete', () => {
  it('complete when all required sets are done', () => {
    const exercises: ExerciseRecord[] = [
      { name: 'Squat', isRequired: true, sets: [{ setNumber: 1, completed: true }, { setNumber: 2, completed: true }] },
    ];
    expect(isSessionComplete(exercises)).toBe(true);
  });

  it('incomplete when a required set is not done', () => {
    const exercises: ExerciseRecord[] = [
      { name: 'Squat', isRequired: true, sets: [{ setNumber: 1, completed: true }, { setNumber: 2, completed: false }] },
    ];
    expect(isSessionComplete(exercises)).toBe(false);
  });
});

describe('getNextTemplate', () => {
  it('starts with A', () => {
    expect(getNextTemplate([])).toBe('A');
  });

  it('alternates A/B', () => {
    const sessions = [makeSession({ completed: true })];
    expect(getNextTemplate(sessions)).toBe('B');
  });

  it('skips rest days', () => {
    const sessions = [makeSession({ completed: true }), makeSession({ isRestDay: true })];
    expect(getNextTemplate(sessions)).toBe('B');
  });
});

describe('getDefaultExercises', () => {
  it('Workout A has 4 exercises', () => {
    const exercises = getDefaultExercises('A');
    expect(exercises).toHaveLength(4);
    expect(exercises[0].name).toBe('Back Squat');
    expect(exercises[0].sets).toHaveLength(3);
  });

  it('Workout B has 4 exercises', () => {
    const exercises = getDefaultExercises('B');
    expect(exercises).toHaveLength(4);
    expect(exercises[0].name).toBe('Deadlift');
    expect(exercises[0].sets).toHaveLength(2);
  });
});

describe('progressive overload', () => {
  it('shouldIncreaseWeight when all sets hit top reps', () => {
    expect(shouldIncreaseWeight([{ reps: 8 }, { reps: 8 }, { reps: 8 }], 8)).toBe(true);
  });

  it('should NOT increase when not all sets at top', () => {
    expect(shouldIncreaseWeight([{ reps: 7 }, { reps: 8 }, { reps: 6 }], 8)).toBe(false);
  });

  it('shouldDeload after 2 consecutive failed weeks', () => {
    expect(shouldDeload([3, 4, 3], [4, 3, 4], 5)).toBe(true);
  });

  it('should NOT deload if only one week failed', () => {
    expect(shouldDeload([3, 4, 3], [6, 6, 6], 5)).toBe(false);
  });

  it('computeDeloadWeight reduces by ~10%', () => {
    expect(computeDeloadWeight(100)).toBe(90);
    expect(computeDeloadWeight(135)).toBe(122);
  });
});

// ===== Course progress ===== //

describe('course percentage', () => {
  it('computes correct percentage', () => {
    const pct = Math.round((41 / 200) * 100);
    expect(pct).toBe(21); // 20.5% rounds to 21%
  });

  it('StageAcademy baseline', () => {
    const pct = Math.round((26 / 144) * 100);
    expect(pct).toBe(18);
  });
});
