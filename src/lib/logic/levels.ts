import type { StatLevel } from '@/types';

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function getIntDailyCap(learningMinutesPerDay: number): number {
  return clamp(learningMinutesPerDay * 3, 45, 180);
}

export function getAgiDailyCap(agiMinMinutes: number): number {
  return clamp(agiMinMinutes * 3, 30, 120);
}

// XP required per level: level N requires N*100 XP
function xpForLevel(level: number): number {
  return level * 100;
}

export function computeLevel(totalXP: number): StatLevel {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const needed = xpForLevel(level);
  return {
    level,
    currentXP: remaining,
    xpToNext: needed,
    progressPct: Math.round((remaining / needed) * 100),
  };
}

// STR: 25 XP per completed session, +10 XP per overload event
export function computeStrXP(sessionsCompleted: number, overloadEvents: number): number {
  return sessionsCompleted * 25 + overloadEvents * 10;
}

// AGI: 1 XP per minute rowed, +5 XP per day streak (bonus)
export function computeAgiXP(totalMinutes: number, currentStreak: number): number {
  return totalMinutes + currentStreak * 5;
}

// VIT: 15 XP per completed day
export function computeVitXP(completedDays: number): number {
  return completedDays * 15;
}

// INT: 2 XP per learning minute, 5 XP per course unit
export function computeIntXP(totalMinutes: number, courseUnits: number): number {
  return totalMinutes * 2 + courseUnits * 5;
}

// PER: 8 XP per lesson completed
export function computePerXP(totalLessons: number): number {
  return totalLessons * 8;
}

// Custom task bonus: up to +10% daily based on proportion of enabled tasks checked
export function computeCustomTaskBonusPct(enabledCount: number, checkedCount: number): number {
  if (enabledCount <= 0) return 0;
  return clamp(Math.round((checkedCount / enabledCount) * 10), 0, 10);
}

/**
 * PER domain progress [0..1] for the daily ring.
 *
 * PER protocol now keys off:
 *   - readingMinutes (always)
 *   - prayersCount + quranPages (when spirituality enabled)
 *
 * Stage Academy lessons moved to INT and are NOT part of PER progress anymore.
 *
 * - spiritualityEnabled=false: progress = reading / readingTarget
 * - spiritualityEnabled=true:  progress = avg(reading, prayers/5, quran/quranTarget)
 */
export function computePerDomainProgress(
  enableSpirituality: boolean,
  readingMinutes: number,
  readingTarget: number,
  prayersCount: number,
  quranPages: number,
  quranTarget: number,
): number {
  const readingProgress = clamp(readingMinutes / Math.max(readingTarget, 1), 0, 1);
  if (!enableSpirituality) return readingProgress;
  const prayerProgress = clamp(prayersCount / 5, 0, 1);
  const quranProgress = clamp(quranPages / Math.max(quranTarget, 1), 0, 1);
  return (readingProgress + prayerProgress + quranProgress) / 3;
}

/**
 * INT domain progress [0..1] for the daily ring.
 *
 * Averages today's units / dailyTargetUnits across active courses (Real Estate,
 * Stage Academy, and any user-added IntCourses). Acquired courses don't count.
 * Returns 0 when there are no active courses (matches isIntCompleteFromCourses).
 *
 * Each course's per-target ratio is clamped to [0, 1] so a course logged 4x its
 * target still contributes max 1.0 (doesn't drown out partially-done others).
 */
export function computeIntDomainProgress(
  activeCourses: { id: string; dailyTargetUnits: number }[],
  unitsByCourseToday: Record<string, number>,
): number {
  if (activeCourses.length === 0) return 0;
  const sum = activeCourses.reduce((s, c) => {
    const today = unitsByCourseToday[c.id] ?? 0;
    return s + clamp(today / Math.max(c.dailyTargetUnits, 1), 0, 1);
  }, 0);
  return sum / activeCourses.length;
}
