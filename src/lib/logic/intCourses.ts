import { getSettings, getCourseProgress, updateSettings } from '@/lib/db';
import type { IntCourse, IntLog, PerLog, UserSettings } from '@/types';

export const LEGACY_RE_ID = 'legacy-real-estate';
export const LEGACY_SA_ID = 'legacy-stage-academy';

/**
 * Returns the user's IntCourses, seeding from legacy data the first time only.
 * Migration: pulls Real Estate + Stage Academy from courseProgress + settings into
 * UserSettings.intCourses. No schema change, fully reversible (delete settings.intCourses
 * to reseed).
 */
export async function loadIntCourses(): Promise<IntCourse[]> {
  const settings = await getSettings();
  if (settings.intCourses && settings.intCourses.length > 0) {
    return settings.intCourses;
  }

  const re = await getCourseProgress('real-estate');
  const sa = await getCourseProgress('stage-academy');
  const now = Date.now();

  const seeded: IntCourse[] = [
    {
      id: LEGACY_RE_ID,
      name: settings.intCourseName ?? 'Real Estate',
      totalUnits: re.totalUnits,
      completedUnits: re.completedUnits,
      dailyTargetUnits: settings.courseUnitsPerDay,
      status: re.completedUnits >= re.totalUnits ? 'acquired' : 'active',
      createdAt: now,
      acquiredAt: re.completedUnits >= re.totalUnits ? now : undefined,
    },
    {
      id: LEGACY_SA_ID,
      name: settings.perProgramName ?? 'Stage Academy',
      totalUnits: sa.totalUnits,
      completedUnits: sa.completedUnits,
      dailyTargetUnits: settings.lessonsPerDay,
      status: sa.completedUnits >= sa.totalUnits ? 'acquired' : 'active',
      createdAt: now,
      acquiredAt: sa.completedUnits >= sa.totalUnits ? now : undefined,
    },
  ];

  await updateSettings({ intCourses: seeded });
  return seeded;
}

export async function saveIntCourses(courses: IntCourse[]): Promise<void> {
  await updateSettings({ intCourses: courses });
}

/** Reads today's units for a given course, falling back to legacy fields if the
 *  new unitsByCourse map hasn't been written yet. */
export function getDailyUnitsForCourse(
  course: IntCourse,
  intLog: IntLog | null | undefined,
  perLog: PerLog | null | undefined,
): number {
  const fromMap = intLog?.unitsByCourse?.[course.id];
  if (fromMap !== undefined) return fromMap;
  if (course.id === LEGACY_RE_ID) return intLog?.courseUnitsCompleted ?? 0;
  if (course.id === LEGACY_SA_ID) return perLog?.lessonsCompleted ?? 0;
  return 0;
}

/** INT is complete iff EVERY active course has met its daily target today.
 *  Zero active courses → not complete (page shows empty state). */
export function isIntCompleteFromCourses(
  courses: IntCourse[],
  unitsToday: Record<string, number>,
): boolean {
  const active = courses.filter(c => c.status === 'active');
  if (active.length === 0) return false;
  return active.every(c => (unitsToday[c.id] ?? 0) >= c.dailyTargetUnits);
}

/** Apply auto-acquire: when completedUnits >= totalUnits, status flips to acquired. */
export function autoAcquire(course: IntCourse): IntCourse {
  if (course.status === 'acquired') return course;
  if (course.completedUnits >= course.totalUnits && course.totalUnits > 0) {
    return { ...course, status: 'acquired', acquiredAt: Date.now() };
  }
  return course;
}

export function genCourseId(): string {
  return `course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Resolve display values for the dashboard subtitle:
 *  abbreviation for each active course → "RE 1/2 · SA 1/1 · FX 0/1" */
export function buildIntSubtitle(
  courses: IntCourse[],
  intLog: IntLog | null | undefined,
  perLog: PerLog | null | undefined,
): string {
  const active = courses.filter(c => c.status === 'active');
  if (active.length === 0) return 'No active courses';
  return active
    .map(c => {
      const todays = getDailyUnitsForCourse(c, intLog, perLog);
      const abbr = abbreviateCourseName(c.name);
      return `${abbr} ${todays}/${c.dailyTargetUnits}`;
    })
    .join(' · ');
}

export function abbreviateCourseName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 3).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export function totalCompletedUnitsAcrossCourses(courses: IntCourse[]): number {
  return courses.reduce((s, c) => s + c.completedUnits, 0);
}

/** Helper for INT save: given the user's intent (today's per-course unit count
 *  edits) and the current course list + current intLog, returns:
 *   - new IntCourse[] with completedUnits bumped by deltas + auto-acquire
 *   - new unitsByCourse map for the intLog
 *  Caller is responsible for persisting these. */
export function applyDailyEdits(
  courses: IntCourse[],
  prevUnitsByCourse: Record<string, number>,
  newUnitsByCourse: Record<string, number>,
): { courses: IntCourse[]; unitsByCourse: Record<string, number> } {
  const updatedCourses = courses.map(c => {
    const prev = prevUnitsByCourse[c.id] ?? 0;
    const next = newUnitsByCourse[c.id] ?? prev;
    const delta = next - prev;
    if (delta === 0) return c;
    const bumped: IntCourse = {
      ...c,
      completedUnits: Math.max(0, Math.min(c.completedUnits + delta, c.totalUnits)),
    };
    return autoAcquire(bumped);
  });
  return { courses: updatedCourses, unitsByCourse: newUnitsByCourse };
}

/** Used by the IntCourse editing UI to update a single course in place. */
export function upsertCourse(courses: IntCourse[], updated: IntCourse): IntCourse[] {
  const exists = courses.some(c => c.id === updated.id);
  if (exists) return courses.map(c => (c.id === updated.id ? updated : c));
  return [...courses, updated];
}

export function removeCourse(courses: IntCourse[], id: string): IntCourse[] {
  return courses.filter(c => c.id !== id);
}

/** For backwards compat: keep legacy courseProgress rows in sync with the
 *  migrated IntCourses so achievements/growth pages keep showing the right
 *  totals. New (non-migrated) courses don't need this. */
export function legacyCourseProgressId(course: IntCourse): 'real-estate' | 'stage-academy' | null {
  if (course.id === LEGACY_RE_ID) return 'real-estate';
  if (course.id === LEGACY_SA_ID) return 'stage-academy';
  return null;
}

/** Settings override for the migrated daily targets (kept in sync so rank
 *  orchestrator and other readers stay correct). */
export function settingsKeyForLegacyTarget(course: IntCourse): keyof UserSettings | null {
  if (course.id === LEGACY_RE_ID) return 'courseUnitsPerDay';
  if (course.id === LEGACY_SA_ID) return 'lessonsPerDay';
  return null;
}
