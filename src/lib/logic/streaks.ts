import { db } from '@/lib/db';

/** Format a Date to YYYY-MM-DD using local date parts (no UTC drift). */
function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Count consecutive completed AGI days ending at yesterday.
 * Today is excluded — streak only grows once today becomes yesterday.
 */
export async function computeAgiStreak(todayStr: string): Promise<number> {
  const logs = (await db.agiLogs.toArray()).filter(l => l.completed);
  return computeStreakThroughYesterday(logs.map(l => l.date), todayStr);
}

/** Pure helper: count consecutive dates ending at (todayStr - 1 day). */
export function computeStreakThroughYesterday(completedDates: string[], todayStr: string): number {
  if (completedDates.length === 0) return 0;

  const dateSet = new Set(completedDates);
  const checkDate = new Date(todayStr + 'T12:00:00');
  checkDate.setDate(checkDate.getDate() - 1); // start at yesterday

  let streak = 0;
  for (let i = 0; i < 1000; i++) {
    const dateStr = formatLocalDate(checkDate);
    if (dateSet.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function computeStatCompletedDays(
  stat: 'agi' | 'vit' | 'int' | 'per'
): Promise<number> {
  const table = stat === 'agi' ? db.agiLogs
    : stat === 'vit' ? db.vitLogs
    : stat === 'int' ? db.intLogs
    : db.perLogs;
  return (await table.toArray()).filter(l => l.completed).length;
}

/** Number of days between two YYYY-MM-DD date strings (inclusive). */
export function daysBetween(startStr: string, endStr: string): number {
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(endStr + 'T12:00:00');
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Count unique date strings across multiple arrays. */
export function countActiveDays(dateArrays: string[][]): number {
  const all = new Set<string>();
  for (const arr of dateArrays) {
    for (const d of arr) all.add(d);
  }
  return all.size;
}

/** Consecutive days ending at yesterday where ALL provided date-sets have an entry. */
export function computeSystemStreak(
  completedDateSets: Set<string>[],
  todayStr: string
): number {
  if (completedDateSets.length === 0) return 0;

  const checkDate = new Date(todayStr + 'T12:00:00');
  checkDate.setDate(checkDate.getDate() - 1); // start at yesterday

  let streak = 0;
  for (let i = 0; i < 1000; i++) {
    const dateStr = formatLocalDate(checkDate);
    const allPresent = completedDateSets.every(set => set.has(dateStr));
    if (allPresent) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
