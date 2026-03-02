import { describe, it, expect } from 'vitest';
import { computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP, getIntDailyCap, getAgiDailyCap } from '../levels';
import { computeWeeklyCompletionPct, computeRankUpdate, countConsecutiveWeeksAbove80, getLastEvaluatedPct } from '../rank';
import { getStrWeeklyStatus, canUseRestToken, isSessionComplete, getNextTemplate, shouldIncreaseWeight, shouldDeload, computeDeloadWeight, getDefaultExercises } from '../str';
import { evaluationDecision, addDays } from '../rankOrchestrator';
import { computeStreakThroughYesterday, daysBetween, countActiveDays, computeSystemStreak } from '../streaks';
import type { StrSession, ExerciseRecord, RankRecord } from '@/types';

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
    expect(computeIntXP(50, 10)).toBe(150); // 50min*2 + 10units*5
  });

  it('computePerXP', () => {
    expect(computePerXP(10)).toBe(80); // 10*8
  });
});

describe('daily XP caps', () => {
  it('getIntDailyCap with default 20 min setting', () => {
    // clamp(20*3=60, 45, 180) = 60
    expect(getIntDailyCap(20)).toBe(60);
  });

  it('getIntDailyCap clamps high setting to 180', () => {
    // clamp(90*3=270, 45, 180) = 180
    expect(getIntDailyCap(90)).toBe(180);
  });

  it('getAgiDailyCap with default 15 min setting', () => {
    // clamp(15*3=45, 30, 120) = 45
    expect(getAgiDailyCap(15)).toBe(45);
  });

  it('getAgiDailyCap clamps high setting to 120', () => {
    // clamp(50*3=150, 30, 120) = 120
    expect(getAgiDailyCap(50)).toBe(120);
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

  it('does not promote after only 2 consecutive weeks at 80%+', () => {
    const result = computeRankUpdate('C', 85, 1);
    expect(result.newRank).toBe('C');
    expect(result.newConsecutiveWeeks).toBe(2);
  });

  it('promotes after 4 consecutive weeks at 80%+', () => {
    const result = computeRankUpdate('C', 85, 3);
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
  it('starts with A when 0 completed', () => {
    expect(getNextTemplate(0)).toBe('A');
  });

  it('returns B after 1 completed', () => {
    expect(getNextTemplate(1)).toBe('B');
  });

  it('returns A after 2 completed', () => {
    expect(getNextTemplate(2)).toBe('A');
  });

  it('returns B after 3 completed', () => {
    expect(getNextTemplate(3)).toBe('B');
  });
});

describe('getDefaultExercises', () => {
  it('Workout A has 6 exercises', () => {
    const exercises = getDefaultExercises('A');
    expect(exercises).toHaveLength(6);
    expect(exercises[0].name).toBe('Goblet Squat');
    expect(exercises[0].sets).toHaveLength(3);
  });

  it('Workout B has 6 exercises', () => {
    const exercises = getDefaultExercises('B');
    expect(exercises).toHaveLength(6);
    expect(exercises[0].name).toBe('Romanian Deadlift (RDL)');
    expect(exercises[0].sets).toHaveLength(3);
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

// ===== Rank Orchestration ===== //

describe('evaluationDecision', () => {
  // Week starts on Monday. 2025-03-01 is a Saturday.
  // getWeekStart('2025-03-01') => '2025-02-24' (Monday)
  // If today is Monday 2025-03-03, previousWeek = '2025-02-24'

  it('starting on Saturday: partial first week is skipped', () => {
    // firstUseDate = Saturday 2025-03-01
    // today = Monday 2025-03-03 (new week)
    // previousWeekStart = 2025-02-24, firstUseWeekStart = 2025-02-24
    // firstUseDate (03-01) > previousWeekStart (02-24) => partial => skip
    const result = evaluationDecision('2025-03-03', '2025-03-01', false);
    expect(result).toBe('skip_partial');
  });

  it('starting on Monday: first full week is evaluated', () => {
    // firstUseDate = Monday 2025-02-24
    // today = Monday 2025-03-03
    // previousWeekStart = 2025-02-24, firstUseWeekStart = 2025-02-24
    // firstUseDate === previousWeekStart => NOT partial => evaluate
    const result = evaluationDecision('2025-03-03', '2025-02-24', false);
    expect(result).toBe('evaluate');
  });

  it('returns null when already evaluated', () => {
    const result = evaluationDecision('2025-03-03', '2025-02-24', true);
    expect(result).toBeNull();
  });

  it('returns null when previous week is before first use', () => {
    // firstUseDate = 2025-03-03 (Monday)
    // today = 2025-03-05 (Wednesday, same week)
    // previousWeekStart = 2025-02-24, firstUseWeekStart = 2025-03-03
    // previousWeekStart < firstUseWeekStart => null
    const result = evaluationDecision('2025-03-05', '2025-03-03', false);
    expect(result).toBeNull();
  });

  it('second full week is evaluated normally', () => {
    // firstUseDate = 2025-02-24 (Monday)
    // today = 2025-03-10 (Monday, week 3)
    // previousWeekStart = 2025-03-03
    // firstUseWeekStart = 2025-02-24
    // previousWeekStart > firstUseWeekStart => evaluate
    const result = evaluationDecision('2025-03-10', '2025-02-24', false);
    expect(result).toBe('evaluate');
  });
});

describe('rank promotion via computeRankUpdate over multiple weeks', () => {
  it('4 consecutive weeks >=80% promotes E to D', () => {
    // Week 1: 85%, consecutive = 0 => stays E, consecutive becomes 1
    const week1 = computeRankUpdate('E', 85, 0);
    expect(week1.newRank).toBe('E');
    expect(week1.newConsecutiveWeeks).toBe(1);

    // Week 2: 82%, consecutive = 1 => stays E, consecutive becomes 2
    const week2 = computeRankUpdate('E', 82, week1.newConsecutiveWeeks);
    expect(week2.newRank).toBe('E');
    expect(week2.newConsecutiveWeeks).toBe(2);

    // Week 3: 90%, consecutive = 2 => stays E, consecutive becomes 3
    const week3 = computeRankUpdate('E', 90, week2.newConsecutiveWeeks);
    expect(week3.newRank).toBe('E');
    expect(week3.newConsecutiveWeeks).toBe(3);

    // Week 4: 80%, consecutive = 3 => promotes to D
    const week4 = computeRankUpdate('E', 80, week3.newConsecutiveWeeks);
    expect(week4.newRank).toBe('D');
    expect(week4.newConsecutiveWeeks).toBe(0);
  });

  it('<60% drops rank by 1 tier', () => {
    const result = computeRankUpdate('D', 45, 0);
    expect(result.newRank).toBe('E');
  });

  it('a week at 70% between two 80%+ weeks resets consecutive counter', () => {
    const week1 = computeRankUpdate('E', 85, 0);
    expect(week1.newConsecutiveWeeks).toBe(1);

    // Interrupting week at 70%
    const week2 = computeRankUpdate('E', 70, week1.newConsecutiveWeeks);
    expect(week2.newRank).toBe('E');
    expect(week2.newConsecutiveWeeks).toBe(0);

    // Back to 85% but counter reset
    const week3 = computeRankUpdate('E', 85, week2.newConsecutiveWeeks);
    expect(week3.newRank).toBe('E');
    expect(week3.newConsecutiveWeeks).toBe(1);
  });
});

describe('addDays', () => {
  it('adds 7 days correctly', () => {
    expect(addDays('2025-02-24', 7)).toBe('2025-03-03');
  });

  it('subtracts 7 days correctly', () => {
    expect(addDays('2025-03-03', -7)).toBe('2025-02-24');
  });
});

// ===== Streak (through yesterday) ===== //

describe('computeStreakThroughYesterday', () => {
  it('returns 0 when no logs exist', () => {
    expect(computeStreakThroughYesterday([], '2025-03-05')).toBe(0);
  });

  it('returns 1 when only yesterday is completed', () => {
    expect(computeStreakThroughYesterday(['2025-03-04'], '2025-03-05')).toBe(1);
  });

  it('counts consecutive days ending at yesterday', () => {
    const dates = ['2025-03-02', '2025-03-03', '2025-03-04'];
    expect(computeStreakThroughYesterday(dates, '2025-03-05')).toBe(3);
  });

  it('returns 0 when yesterday has no log even if older days do', () => {
    const dates = ['2025-03-02', '2025-03-03'];
    expect(computeStreakThroughYesterday(dates, '2025-03-05')).toBe(0);
  });

  it('gap in sequence breaks streak', () => {
    // day-1 and day-3 present, day-2 missing => streak is 1 (only yesterday counts)
    const dates = ['2025-03-02', '2025-03-04'];
    expect(computeStreakThroughYesterday(dates, '2025-03-05')).toBe(1);
  });

  it('does not count today even if completed', () => {
    const dates = ['2025-03-05'];
    expect(computeStreakThroughYesterday(dates, '2025-03-05')).toBe(0);
  });
});

// ===== Consistency helpers ===== //

describe('daysBetween', () => {
  it('same day = 1', () => {
    expect(daysBetween('2025-03-05', '2025-03-05')).toBe(1);
  });

  it('7 days apart = 8 (inclusive)', () => {
    expect(daysBetween('2025-03-01', '2025-03-08')).toBe(8);
  });

  it('multi-month span', () => {
    expect(daysBetween('2025-02-28', '2025-03-02')).toBe(3);
  });
});

describe('countActiveDays', () => {
  it('returns 0 for empty arrays', () => {
    expect(countActiveDays([])).toBe(0);
    expect(countActiveDays([[], []])).toBe(0);
  });

  it('counts unique dates from a single array', () => {
    expect(countActiveDays([['2025-03-01', '2025-03-02', '2025-03-03']])).toBe(3);
  });

  it('deduplicates overlapping dates across arrays', () => {
    expect(countActiveDays([
      ['2025-03-01', '2025-03-02'],
      ['2025-03-02', '2025-03-03'],
      ['2025-03-01'],
    ])).toBe(3);
  });
});

describe('computeSystemStreak', () => {
  it('returns 0 with no date sets', () => {
    expect(computeSystemStreak([], '2025-03-05')).toBe(0);
  });

  it('counts consecutive days when all sets present', () => {
    const dates = ['2025-03-03', '2025-03-04'];
    const sets = [new Set(dates), new Set(dates), new Set(dates), new Set(dates), new Set(dates)];
    expect(computeSystemStreak(sets, '2025-03-05')).toBe(2);
  });

  it('returns 0 when yesterday missing from all sets', () => {
    const dates = ['2025-03-02', '2025-03-03'];
    const sets = [new Set(dates), new Set(dates), new Set(dates), new Set(dates), new Set(dates)];
    expect(computeSystemStreak(sets, '2025-03-05')).toBe(0);
  });

  it('missing from one set breaks streak at that day', () => {
    const full = new Set(['2025-03-03', '2025-03-04']);
    const partial = new Set(['2025-03-04']); // missing 03-03
    const sets = [full, full, full, full, partial];
    expect(computeSystemStreak(sets, '2025-03-05')).toBe(1);
  });

  it('excludes today even if all sets have it', () => {
    const sets = [new Set(['2025-03-05']), new Set(['2025-03-05']), new Set(['2025-03-05']), new Set(['2025-03-05']), new Set(['2025-03-05'])];
    expect(computeSystemStreak(sets, '2025-03-05')).toBe(0);
  });
});

// ===== Rank progress helpers ===== //

function makeRankRecord(overrides: Partial<RankRecord> = {}): RankRecord {
  return {
    rank: 'E',
    rankBefore: 'E',
    weekStart: '2025-03-03',
    weekEnd: '2025-03-09',
    completionPct: 85,
    reason: 'maintained',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('countConsecutiveWeeksAbove80', () => {
  it('returns 0 with no records', () => {
    expect(countConsecutiveWeeksAbove80([])).toBe(0);
  });

  it('returns 1 when most recent evaluated week is >=80%', () => {
    const records = [makeRankRecord({ completionPct: 85 })];
    expect(countConsecutiveWeeksAbove80(records)).toBe(1);
  });

  it('counts consecutive >=80% weeks', () => {
    const records = [
      makeRankRecord({ completionPct: 90 }),
      makeRankRecord({ completionPct: 82 }),
      makeRankRecord({ completionPct: 80 }),
    ];
    expect(countConsecutiveWeeksAbove80(records)).toBe(3);
  });

  it('resets after a <60% week', () => {
    const records = [
      makeRankRecord({ completionPct: 85 }),
      makeRankRecord({ completionPct: 45, reason: 'demoted' }),
      makeRankRecord({ completionPct: 90 }),
    ];
    expect(countConsecutiveWeeksAbove80(records)).toBe(1);
  });

  it('resets after a 60-79% week', () => {
    const records = [
      makeRankRecord({ completionPct: 85 }),
      makeRankRecord({ completionPct: 70 }),
      makeRankRecord({ completionPct: 90 }),
    ];
    expect(countConsecutiveWeeksAbove80(records)).toBe(1);
  });

  it('skips records with reason "skipped"', () => {
    const records = [
      makeRankRecord({ completionPct: 85 }),
      makeRankRecord({ completionPct: 0, reason: 'skipped' }),
      makeRankRecord({ completionPct: 90 }),
    ];
    expect(countConsecutiveWeeksAbove80(records)).toBe(2);
  });
});

describe('getLastEvaluatedPct', () => {
  it('returns null with no records', () => {
    expect(getLastEvaluatedPct([])).toBeNull();
  });

  it('returns pct of most recent evaluated week', () => {
    const records = [
      makeRankRecord({ completionPct: 72 }),
      makeRankRecord({ completionPct: 85 }),
    ];
    expect(getLastEvaluatedPct(records)).toBe(72);
  });

  it('skips "skipped" records', () => {
    const records = [
      makeRankRecord({ completionPct: 0, reason: 'skipped' }),
      makeRankRecord({ completionPct: 88 }),
    ];
    expect(getLastEvaluatedPct(records)).toBe(88);
  });

  it('returns null when all records are skipped', () => {
    const records = [
      makeRankRecord({ completionPct: 0, reason: 'skipped' }),
      makeRankRecord({ completionPct: 0, reason: 'skipped' }),
    ];
    expect(getLastEvaluatedPct(records)).toBeNull();
  });
});
