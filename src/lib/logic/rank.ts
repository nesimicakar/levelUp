import type { Rank, RankRecord, StrSession } from '@/types';
import { RANK_ORDER } from '@/types';
import { computeRestTokensTotal } from '@/lib/logic/str';

export interface WeeklyCompletionInput {
  strCompleted: number; // out of 7 — days logged as a workout OR a rest day
  agiCompleted: number; // out of 7
  vitCompleted: number; // out of 7
  intCompleted: number; // out of 7
  perCompleted: number; // out of 7
}

/** 5 pillars × 7 days. STR is a full-weight pillar like every other one, so
 *  changing strSessionsPerWeek no longer re-weights the whole formula. */
export const WEEKLY_TOTAL_UNITS = 35;

export function computeWeeklyCompletionPct(input: WeeklyCompletionInput): number {
  const completed = input.strCompleted + input.agiCompleted + input.vitCompleted + input.intCompleted + input.perCompleted;
  return Math.round((completed / WEEKLY_TOTAL_UNITS) * 100);
}

/**
 * STR days credited for one week, out of 7.
 *
 * Rest is part of the process, so a day logged as a rest day is worth exactly as
 * much as a day logged as a workout — every logged day moves the weekly score.
 * What keeps this honest is the rest-token allowance (7 − strSessionsPerWeek):
 * rest credit is capped at it, so reaching 7/7 is impossible without actually
 * completing your workout target.
 *
 * Credit is per calendar DAY. Callers pass rows merged from the gym and
 * calisthenics tables, so a date present in both must not be counted twice.
 */
export function computeStrWeekCredit(sessions: StrSession[], strRequired: number): number {
  const byDate = new Map<string, StrSession>();
  for (const s of sessions) {
    const existing = byDate.get(s.date);
    // A real workout on a date always wins over a rest row for the same date.
    if (!existing || (s.completed && !s.isRestDay)) byDate.set(s.date, s);
  }
  const days = [...byDate.values()];

  const workouts = days.filter(s => s.completed && !s.isRestDay).length;
  const restDays = days.filter(s => s.isRestDay).length;
  const creditedRest = Math.min(restDays, computeRestTokensTotal(strRequired));

  return Math.min(workouts + creditedRest, 7);
}

export function computeRankUpdate(
  currentRank: Rank,
  completionPct: number,
  consecutiveWeeksAbove80: number
): { newRank: Rank; newConsecutiveWeeks: number } {
  const idx = RANK_ORDER.indexOf(currentRank);

  if (completionPct < 60) {
    // Drop by 1 tier
    const newIdx = Math.max(0, idx - 1);
    return { newRank: RANK_ORDER[newIdx], newConsecutiveWeeks: 0 };
  }

  if (completionPct >= 80) {
    const newConsec = consecutiveWeeksAbove80 + 1;
    if (newConsec >= 4 && idx < RANK_ORDER.length - 1) {
      return { newRank: RANK_ORDER[idx + 1], newConsecutiveWeeks: 0 };
    }
    return { newRank: currentRank, newConsecutiveWeeks: newConsec };
  }

  // 60-79%: rank stays
  return { newRank: currentRank, newConsecutiveWeeks: 0 };
}

export function getRankColor(rank: Rank): string {
  const colors: Record<Rank, string> = {
    E: 'var(--color-rank-e)',
    D: 'var(--color-rank-d)',
    C: 'var(--color-rank-c)',
    B: 'var(--color-rank-b)',
    A: 'var(--color-rank-a)',
    S: 'var(--color-rank-s)',
  };
  return colors[rank];
}

/** Count consecutive evaluated (non-skipped, non-grace) weeks with >=80%, newest first.
 *  Skipped and graced weeks are streak-neutral — they don't count, but don't break it either.
 *  Stops at a promoted/demoted record — the streak was consumed or reset at that point. */
export function countConsecutiveWeeksAbove80(records: RankRecord[]): number {
  let count = 0;
  for (const r of records) {
    if (r.reason === 'skipped' || r.reason === 'grace') continue;
    if (r.reason === 'promoted' || r.reason === 'demoted') break;
    if (r.completionPct >= 80) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/** Get the completion % of the most recent evaluated (non-skipped) week, or null. */
export function getLastEvaluatedPct(records: RankRecord[]): number | null {
  for (const r of records) {
    if (r.reason !== 'skipped') return r.completionPct;
  }
  return null;
}
