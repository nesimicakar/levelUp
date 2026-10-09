import { db } from '@/lib/db';

export type Modality = 'RUN' | 'BIKE' | 'SWIM' | 'ROW' | 'WALK' | 'HIIT';

// Labels used by the Settings "activity type" option for older logs.
const LEGACY_LABELS: Partial<Record<Modality, string>> = {
  RUN: 'Running',
  BIKE: 'Cycling',
  SWIM: 'Swimming',
  ROW: 'Rowing',
};

export function matchModality(activityType: string | undefined): Modality | null {
  if (!activityType) return null;
  const upper = activityType.toUpperCase();
  if (upper === 'RUN' || upper === 'BIKE' || upper === 'SWIM' || upper === 'ROW' || upper === 'WALK' || upper === 'HIIT') return upper;
  const lower = activityType.toLowerCase();
  for (const [k, label] of Object.entries(LEGACY_LABELS) as [Modality, string][]) {
    if (label.toLowerCase() === lower) return k;
  }
  return null;
}

/** A day is completed iff total minutes across all its logs >= target. Streak and
 *  dashboard logic filter on `.completed`, so every log on the date carries the flag. */
export async function syncAgiDayCompleted(date: string, target: number): Promise<void> {
  const dayLogs = await db.agiLogs.where('date').equals(date).toArray();
  const dayTotal = dayLogs.reduce((sum, l) => sum + l.minutes, 0);
  const dayCompleted = dayTotal >= target;
  await Promise.all(
    dayLogs
      .filter(l => l.id !== undefined && l.completed !== dayCompleted)
      .map(l => db.agiLogs.update(l.id!, { completed: dayCompleted }))
  );
}

/** Sets the minutes for one (date, modality). One log per pair: updates in place,
 *  creates if missing, and removes the log when minutes <= 0. */
export async function saveAgiMinutes(date: string, modality: Modality, minutes: number, target: number): Promise<void> {
  const dayLogs = await db.agiLogs.where('date').equals(date).toArray();
  const existing = dayLogs.find(l => matchModality(l.activityType) === modality);

  if (minutes <= 0) {
    if (existing?.id !== undefined) await db.agiLogs.delete(existing.id);
  } else if (existing?.id !== undefined) {
    await db.agiLogs.update(existing.id, { minutes, activityType: modality });
  } else {
    await db.agiLogs.add({ date, minutes, activityType: modality, completed: false, createdAt: Date.now() });
  }
  await syncAgiDayCompleted(date, target);
}
