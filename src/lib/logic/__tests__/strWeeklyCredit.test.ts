import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, getSettings, updateSettings, getActiveCharacter } from '../../db';
import { evaluateRankIfNeeded } from '../rankOrchestrator';
import { computeStrWeekCredit } from '../rank';
import type { StrSession } from '@/types';

const WEEK_START = '2026-01-05'; // Monday
const NEXT_MONDAY = '2026-01-12';
const DAYS = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];

function strRow(date: string, kind: 'workout' | 'rest'): StrSession {
  return {
    date,
    template: 'A',
    exercises: [],
    completed: kind === 'workout',
    isRestDay: kind === 'rest',
    createdAt: 1,
  };
}

/** `w` workouts then `r` rest days, on consecutive days of the test week. */
function week(w: number, r: number): StrSession[] {
  return [
    ...DAYS.slice(0, w).map(d => strRow(d, 'workout')),
    ...DAYS.slice(w, w + r).map(d => strRow(d, 'rest')),
  ];
}

async function fillOtherPillarsForWeek() {
  for (const date of DAYS) {
    await db.agiLogs.add({ date, minutes: 30, activityType: 'Rowing', completed: true, createdAt: 1 });
    await db.vitLogs.add({ date, completed: true, createdAt: 1 } as never);
    await db.intLogs.add({ date, completed: true, createdAt: 1 } as never);
    await db.perLogs.add({ date, completed: true, createdAt: 1 } as never);
  }
}

async function evaluateWeek(strSessionsPerWeek: number) {
  await updateSettings({ firstUseDate: '2025-12-01', strSessionsPerWeek });
  const character = await getActiveCharacter();
  // The active character's startedAt bounds evaluation, so anchor it before the
  // week under test or no record is written at all.
  await db.characters.update(character.id!, { startedAt: new Date('2025-12-01T12:00:00').getTime() });
  await evaluateRankIfNeeded(NEXT_MONDAY);
  return db.rankHistory.where('weekStart').equals(WEEK_START).first();
}

describe('computeStrWeekCredit', () => {
  it('credits a rest day exactly as much as a workout', () => {
    expect(computeStrWeekCredit(week(3, 0), 3)).toBe(3);
    expect(computeStrWeekCredit(week(0, 3), 3)).toBe(3);
    expect(computeStrWeekCredit(week(1, 2), 3)).toBe(3);
  });

  it('lets a fully logged week reach 7/7', () => {
    // 3 workouts + 4 rest tokens = every day of the week logged.
    expect(computeStrWeekCredit(week(3, 4), 3)).toBe(7);
  });

  it('caps rest credit at the rest-token allowance, so 7/7 is unreachable without the workouts', () => {
    // target 3 -> 4 rest tokens. Even if 7 rest days somehow exist, only 4 count.
    expect(computeStrWeekCredit(week(0, 7), 3)).toBe(4);
    // target 5 -> 2 rest tokens.
    expect(computeStrWeekCredit(week(0, 7), 5)).toBe(2);
    // Doing the workouts is the only way to the top.
    expect(computeStrWeekCredit(week(5, 2), 5)).toBe(7);
  });

  it('never exceeds 7 even with more logged days than exist', () => {
    expect(computeStrWeekCredit(week(7, 0), 3)).toBe(7);
  });

  it('counts one credit per calendar day when gym and calisthenics rows overlap', () => {
    // getActiveStrWeekSessions merges both tables; the same date must not double-count.
    const overlapping = [strRow('2026-01-05', 'workout'), strRow('2026-01-05', 'rest')];
    expect(computeStrWeekCredit(overlapping, 3)).toBe(1);
  });
});

describe('STR weekly credit — end to end through evaluateRankIfNeeded', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await getSettings();
    await getActiveCharacter();
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  });

  it('a fully logged week (workouts + every rest token) scores 100%', async () => {
    await fillOtherPillarsForWeek();
    await db.strSessions.bulkAdd(week(3, 4));
    expect((await evaluateWeek(3))?.completionPct).toBe(100);
  });

  it('each additional logged day moves the score by ~3%', async () => {
    await fillOtherPillarsForWeek();
    await db.strSessions.bulkAdd(week(3, 2)); // 5 of 7 STR days
    // (5 + 28) / 35 = 94.3 -> 94%
    expect((await evaluateWeek(3))?.completionPct).toBe(94);
  });

  it('a rest day counts the same as a workout for the weekly score', async () => {
    await fillOtherPillarsForWeek();
    await db.strSessions.bulkAdd(week(2, 3)); // 5 STR days, 2 of them workouts
    expect((await evaluateWeek(3))?.completionPct).toBe(94); // identical to 3 workouts + 2 rest
  });

  it('cannot reach 100% on rest days alone', async () => {
    await fillOtherPillarsForWeek();
    await db.strSessions.bulkAdd(week(0, 7)); // only 4 rest tokens are credited
    // (4 + 28) / 35 = 91.4 -> 91%
    expect((await evaluateWeek(3))?.completionPct).toBe(91);
  });

  it('does not re-weight the formula when the weekly target changes', async () => {
    await fillOtherPillarsForWeek();
    // 7 STR days logged either way, so the score is identical at any target —
    // previously the denominator moved with strSessionsPerWeek.
    await db.strSessions.bulkAdd(week(2, 5));
    expect((await evaluateWeek(2))?.completionPct).toBe(100);
  });
});
