import type { ExerciseRecord, StrSession, StrTemplateExercise, WorkoutTemplate } from '@/types';

export interface StrWeekData {
  sessions: StrSession[];
  restTokensUsed: number;
}

export function getStrWeeklyStatus(weekSessions: StrSession[]) {
  const completed = weekSessions.filter(s => s.completed && !s.isRestDay).length;
  const restDays = weekSessions.filter(s => s.isRestDay).length;
  return {
    sessionsCompleted: completed,
    sessionsRequired: 4,
    restTokensUsed: restDays,
    restTokensTotal: 3,
  };
}

export function canUseRestToken(weekSessions: StrSession[]): boolean {
  const status = getStrWeeklyStatus(weekSessions);
  return status.restTokensUsed < 3;
}

export function isSessionComplete(exercises: ExerciseRecord[]): boolean {
  return exercises.filter(e => e.isRequired).every(e =>
    e.sets.every(s => s.completed)
  );
}

export function getNextTemplate(totalCompletedSessions: number): WorkoutTemplate {
  // A/B/A/B pattern based on lifetime completed sessions
  return totalCompletedSessions % 2 === 0 ? 'A' : 'B';
}

/** Stable template definitions — IDs never change, names can be edited in the future. */
export const TEMPLATE_A: StrTemplateExercise[] = [
  { id: 'goblet-squat',     name: 'Goblet Squat',                        sets: 3 },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press',              sets: 3 },
  { id: 'cs-row',           name: 'Chest-Supported Dumbbell Row',        sets: 3 },
  { id: 'pull-ups',         name: 'Pull-Ups',                            sets: 3 },
  { id: 'lateral-raises',   name: 'Lateral Raises',                      sets: 3 },
  { id: 'core',             name: 'Core',                                sets: 3, noWeight: true },
];

export const TEMPLATE_B: StrTemplateExercise[] = [
  { id: 'rdl',              name: 'Romanian Deadlift (RDL)',             sets: 3 },
  { id: 'ng-shoulder-press',name: 'Neutral-Grip Dumbbell Shoulder Press',sets: 3 },
  { id: 'cable-row',        name: 'Cable Row',                           sets: 3 },
  { id: 'push-ups',         name: 'Push-Ups',                            sets: 3, noWeight: true },
  { id: 'face-pulls',       name: 'Face Pulls',                          sets: 3 },
  { id: 'core',             name: 'Core',                                sets: 3, noWeight: true },
];

function templateToExerciseRecords(template: StrTemplateExercise[]): ExerciseRecord[] {
  return template.map(t => ({
    id: t.id,
    name: t.name,
    noWeight: t.noWeight,
    sets: Array.from({ length: t.sets }, (_, i) => ({ setNumber: i + 1, completed: false })),
    isRequired: true,
  }));
}

export function getDefaultExercises(template: WorkoutTemplate): ExerciseRecord[] {
  return templateToExerciseRecords(template === 'A' ? TEMPLATE_A : TEMPLATE_B);
}

/**
 * Build two lookup maps from past completed sessions (sorted newest-first already).
 * byId:   keyed by exercise.id  (preferred — survives renames)
 * byName: keyed by exercise.name (fallback for old sessions without id)
 */
export function buildWeightPrefillMaps(
  pastSessions: StrSession[],
): { byId: Record<string, number>; byName: Record<string, number> } {
  const byId: Record<string, number> = {};
  const byName: Record<string, number> = {};
  for (const session of pastSessions) {
    for (const ex of session.exercises) {
      const weight = ex.sets.find(s => s.weight != null)?.weight;
      if (weight == null) continue;
      if (ex.id !== undefined && byId[ex.id] === undefined) byId[ex.id] = weight;
      if (byName[ex.name] === undefined) byName[ex.name] = weight;
    }
  }
  return { byId, byName };
}

/**
 * Return a new exercises array with weights pre-filled.
 * Prefers id-match; falls back to name-match for old sessions.
 */
export function applyWeightPrefill(
  exercises: ExerciseRecord[],
  byId: Record<string, number>,
  byName: Record<string, number>,
): ExerciseRecord[] {
  return exercises.map(ex => {
    const weight =
      (ex.id !== undefined ? byId[ex.id] : undefined) ??
      byName[ex.name];
    if (weight == null) return ex;
    return { ...ex, sets: ex.sets.map(s => ({ ...s, weight })) };
  });
}

/**
 * Overlay custom display names onto an exercises array.
 * Only affects exercises that have an id present in nameMap.
 * Names in stored sessions are not mutated — call this only for rendering or before creating a new session.
 */
export function applyExerciseNames(
  exercises: ExerciseRecord[],
  nameMap: Record<string, string>,
): ExerciseRecord[] {
  if (Object.keys(nameMap).length === 0) return exercises;
  return exercises.map(ex =>
    ex.id !== undefined && nameMap[ex.id] ? { ...ex, name: nameMap[ex.id] } : ex
  );
}

// Progressive overload: check if user hit top of rep range for all sets
export function shouldIncreaseWeight(sets: { reps?: number }[], topReps: number): boolean {
  return sets.every(s => s.reps !== undefined && s.reps >= topReps);
}

// Check if a lift failed two consecutive weeks
export function shouldDeload(
  currentWeekReps: (number | undefined)[],
  lastWeekReps: (number | undefined)[],
  minReps: number
): boolean {
  const failedThisWeek = currentWeekReps.some(r => r !== undefined && r < minReps);
  const failedLastWeek = lastWeekReps.some(r => r !== undefined && r < minReps);
  return failedThisWeek && failedLastWeek;
}

export function computeDeloadWeight(currentWeight: number): number {
  return Math.round(currentWeight * 0.9);
}
