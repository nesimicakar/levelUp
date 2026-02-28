import type { Rank } from '@/types';
import { RANK_ORDER } from '@/types';

export interface WeeklyCompletionInput {
  strCompleted: number; // out of 4
  agiCompleted: number; // out of 7
  vitCompleted: number; // out of 7
  intCompleted: number; // out of 7
  perCompleted: number; // out of 7
}

export function computeWeeklyCompletionPct(input: WeeklyCompletionInput): number {
  const total = 4 + 7 + 7 + 7 + 7; // 32
  const completed = input.strCompleted + input.agiCompleted + input.vitCompleted + input.intCompleted + input.perCompleted;
  return Math.round((completed / total) * 100);
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
    if (newConsec >= 2 && idx < RANK_ORDER.length - 1) {
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
