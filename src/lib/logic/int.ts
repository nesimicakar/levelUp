import type { IntLog, PerLog, UserSettings } from '@/types';

/**
 * Computes whether INT completion is met for a given day.
 *
 * INT now owns three structured-learning protocols:
 *   1. Daily learning minutes (from intLog)
 *   2. Real Estate course units (from intLog)
 *   3. Stage Academy lessons (still stored in perLog.lessonsCompleted to avoid a
 *      schema/migration; the COMPLETION MEANING moved to INT)
 *
 * Pass the latest snapshot of both logs and current settings.
 */
export function isIntComplete(
  intLog: Partial<IntLog>,
  perLog: Partial<PerLog>,
  settings: UserSettings,
): boolean {
  const minutesMet = (intLog.learningMinutes ?? 0) >= settings.learningMinutesPerDay;
  const reUnitsMet = (intLog.courseUnitsCompleted ?? 0) >= settings.courseUnitsPerDay;
  const stageLessonsMet = (perLog.lessonsCompleted ?? 0) >= settings.lessonsPerDay;
  return minutesMet && reUnitsMet && stageLessonsMet;
}
