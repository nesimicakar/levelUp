import { db, getToday } from '@/lib/db';
import type { DisciplineLog, DisciplineLogStatus, DisciplineStreak } from '@/types';

interface StreakStats {
  currentStreak: number;
  bestStreak: number;
  totalClearDays: number;
  totalFailedDays: number;
  startDate: string;
}

export function computeStreakStats(allLogs: DisciplineLog[], today: string): StreakStats {
  const logMap = new Map<string, DisciplineLogStatus>(allLogs.map(l => [l.date, l.status]));

  // Current streak: walk backwards from today
  let currentStreak = 0;
  let streakStartDate = today;
  const todayDate = new Date(today + 'T12:00:00');

  for (let i = 0; i <= 730; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const status = logMap.get(dateStr) ?? 'unset';

    if (i === 0 && status === 'unset') continue; // today not yet decided — skip
    if (i === 1 && status === 'unset') continue; // yesterday grace period — don't break
    if (status === 'unset') break;
    if (status === 'failed') break;
    if (status === 'clear') { currentStreak++; streakStartDate = dateStr; }
    // skipped: transparent — no add, no break
  }

  // Best streak & totals: forward pass through all logged dates with gap detection
  const sortedDates = [...logMap.keys()].sort();
  let bestStreak = 0;
  let runStreak = 0;
  let totalClearDays = 0;
  let totalFailedDays = 0;

  for (let di = 0; di < sortedDates.length; di++) {
    const dateStr = sortedDates[di];

    if (di > 0) {
      const prevD = new Date(sortedDates[di - 1] + 'T12:00:00');
      const currD = new Date(dateStr + 'T12:00:00');
      const gap = Math.round((currD.getTime() - prevD.getTime()) / 86400000);
      if (gap > 1) runStreak = 0;
    }

    const status = logMap.get(dateStr)!;
    if (status === 'clear') {
      runStreak++;
      totalClearDays++;
      bestStreak = Math.max(bestStreak, runStreak);
    } else if (status === 'failed') {
      runStreak = 0;
      totalFailedDays++;
    } else if (status === 'unset') {
      runStreak = 0;
    }
    // skipped: no change to run
  }

  bestStreak = Math.max(bestStreak, currentStreak);

  return { currentStreak, bestStreak, totalClearDays, totalFailedDays, startDate: streakStartDate };
}

export async function recalculateStreak(streakId: string): Promise<DisciplineStreak | null> {
  const streak = await db.disciplineStreaks.get(streakId);
  if (!streak) return null;

  const logs = await db.disciplineLogs.where('streakId').equals(streakId).toArray();
  const today = getToday();
  const stats = computeStreakStats(logs, today);

  const updated: DisciplineStreak = {
    ...streak,
    currentStreak: stats.currentStreak,
    bestStreak: Math.max(streak.bestStreak, stats.bestStreak),
    totalClearDays: stats.totalClearDays,
    totalFailedDays: stats.totalFailedDays,
    startDate: stats.startDate,
    lastUpdated: Date.now(),
  };

  await db.disciplineStreaks.put(updated);
  return updated;
}

export async function setDisciplineLog(
  streakId: string,
  date: string,
  status: DisciplineLogStatus,
  note?: string,
): Promise<DisciplineStreak | null> {
  const now = Date.now();

  const existing = await db.disciplineLogs
    .where('[streakId+date]')
    .equals([streakId, date])
    .first();

  if (existing?.id !== undefined) {
    await db.disciplineLogs.update(existing.id!, {
      status,
      note: note ?? existing.note,
      updatedAt: now,
    });
  } else {
    await db.disciplineLogs.add({
      streakId,
      date,
      status,
      note,
      createdAt: now,
      updatedAt: now,
    });
  }

  return recalculateStreak(streakId);
}

export function getYesterday(today: string): string {
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function needsYesterdayReview(logs: DisciplineLog[], today: string): boolean {
  const yesterday = getYesterday(today);
  const logMap = new Map(logs.map(l => [l.date, l.status]));
  return (logMap.get(yesterday) ?? 'unset') === 'unset';
}

export function clearRatePct(totalClear: number, totalFailed: number): number {
  const total = totalClear + totalFailed;
  if (total === 0) return 100;
  return Math.round((totalClear / total) * 100);
}
