import type { CaliExerciseRecord, CaliSession, CaliSetRecord } from '@/types';

export interface CaliProgression {
  id: string;
  label: string;
}

export interface CaliExerciseDef {
  id: string;
  name: string;
  progressions: CaliProgression[];
  defaultProgressionId: string;
}

export const CALI_EXERCISES: CaliExerciseDef[] = [
  {
    id: 'pushups',
    name: 'Push-ups',
    defaultProgressionId: 'regular',
    progressions: [
      { id: 'knee',    label: 'Knee Push-up' },
      { id: 'regular', label: 'Push-up' },
      { id: 'decline', label: 'Decline Push-up' },
      { id: 'diamond', label: 'Diamond Push-up' },
      { id: 'archer',  label: 'Archer Push-up' },
      { id: 'one-arm', label: 'One-Arm Push-up' },
    ],
  },
  {
    id: 'pullups',
    name: 'Pull-ups',
    defaultProgressionId: 'pullup',
    progressions: [
      { id: 'assisted', label: 'Assisted Pull-up' },
      { id: 'pullup',   label: 'Pull-up' },
      { id: 'weighted', label: 'Weighted Pull-up' },
    ],
  },
  {
    id: 'dips',
    name: 'Dips',
    defaultProgressionId: 'parallel-bar',
    progressions: [
      { id: 'bench',        label: 'Bench Dip' },
      { id: 'parallel-bar', label: 'Parallel Bar Dip' },
      { id: 'weighted',     label: 'Weighted Dip' },
    ],
  },
  {
    id: 'squats',
    name: 'Squats',
    defaultProgressionId: 'bodyweight',
    progressions: [
      { id: 'bodyweight', label: 'Bodyweight Squat' },
      { id: 'bulgarian',  label: 'Bulgarian Split Squat' },
      { id: 'jump',       label: 'Jump Squat' },
      { id: 'weighted',   label: 'Weighted Squat' },
    ],
  },
];

const SETS_PER_EXERCISE = 3;
const DEFAULT_REPS = 10;

export function getProgressionLabel(exerciseId: string, progressionId: string): string {
  const def = CALI_EXERCISES.find(e => e.id === exerciseId);
  return def?.progressions.find(p => p.id === progressionId)?.label ?? progressionId;
}

export function buildCaliSession(
  progressionLevels: Record<string, string>,
  lastSession: CaliSession | null,
): CaliExerciseRecord[] {
  return CALI_EXERCISES.map(def => {
    const progressionId = progressionLevels[def.id] ?? def.defaultProgressionId;
    const lastExercise = lastSession?.exercises.find(e => e.id === def.id);
    const lastSets = lastExercise?.sets ?? [];

    const sets: CaliSetRecord[] = Array.from({ length: SETS_PER_EXERCISE }, (_, i) => ({
      setNumber: i + 1,
      reps: lastSets[i]?.reps ?? DEFAULT_REPS,
      completed: false,
    }));

    return {
      id: def.id,
      name: def.name,
      progressionLevel: progressionId,
      sets,
    };
  });
}

export function isCaliSessionComplete(exercises: CaliExerciseRecord[]): boolean {
  return exercises.every(e => e.sets.every(s => s.completed));
}

export interface CaliExerciseStats {
  exerciseId: string;
  bestSetReps: number;
  bestTotalReps: number;
  lastSessionSets: { reps: number }[];
  lastProgressionLabel: string;
  currentProgressionLabel: string;
}

export function computeCaliStats(
  sessions: CaliSession[],
  progressionLevels: Record<string, string>,
): Record<string, CaliExerciseStats> {
  const completed = sessions
    .filter(s => s.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  const result: Record<string, CaliExerciseStats> = {};

  for (const def of CALI_EXERCISES) {
    const progressionId = progressionLevels[def.id] ?? def.defaultProgressionId;
    const currentLabel = getProgressionLabel(def.id, progressionId);

    let bestSetReps = 0;
    let bestTotalReps = 0;
    let lastSessionSets: { reps: number }[] = [];
    let lastProgressionLabel = currentLabel;
    let foundLast = false;

    for (const session of completed) {
      const ex = session.exercises.find(e => e.id === def.id);
      if (!ex) continue;

      const doneSets = ex.sets.filter(s => s.completed);
      const total = doneSets.reduce((sum, s) => sum + s.reps, 0);
      const maxSet = doneSets.reduce((m, s) => Math.max(m, s.reps), 0);

      if (maxSet > bestSetReps) bestSetReps = maxSet;
      if (total > bestTotalReps) bestTotalReps = total;

      if (!foundLast) {
        lastSessionSets = doneSets.map(s => ({ reps: s.reps }));
        lastProgressionLabel = getProgressionLabel(def.id, ex.progressionLevel);
        foundLast = true;
      }
    }

    result[def.id] = {
      exerciseId: def.id,
      bestSetReps,
      bestTotalReps,
      lastSessionSets,
      lastProgressionLabel,
      currentProgressionLabel: currentLabel,
    };
  }

  return result;
}
