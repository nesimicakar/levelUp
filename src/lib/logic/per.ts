import type { PerLog, UserSettings } from '@/types';
import { getFaithConfig } from './faith';

/**
 * Computes whether a PER log meets the daily completion bar.
 *
 * PER's daily protocol is personal refinement:
 *   - Daily book reading minutes (always required)
 *   - Prayers (when spirituality enabled; 5 for Islam, editable for other traditions)
 *   - Scripture reading, stored as quranPages (when spirituality enabled)
 *
 * Stage Academy lessons live in perLog.lessonsCompleted but their COMPLETION
 * MEANING moved to INT — see isIntCompleteFromCourses. Books in active/finished
 * lists do NOT count toward daily completion; only daily reading minutes do.
 */
export function isPerComplete(log: Partial<PerLog>, settings: UserSettings): boolean {
  const readingTarget = settings.dailyReadingMinutesTarget ?? 5;
  const readingMet = (log.readingMinutes ?? 0) >= readingTarget;
  if (!(settings.enableSpirituality ?? false)) return readingMet;
  const faith = getFaithConfig(settings);
  const prayersMet = (log.prayersCount ?? 0) >= faith.prayersPerDay;
  const quranMet = !faith.scriptureEnabled || (log.quranPages ?? 0) >= faith.scriptureTarget;
  return readingMet && prayersMet && quranMet;
}
