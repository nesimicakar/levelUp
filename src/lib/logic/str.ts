import type { ExerciseRecord, StrSession, WorkoutTemplate } from '@/types';

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

export function getNextTemplate(weekSessions: StrSession[]): WorkoutTemplate {
  const completedSessions = weekSessions.filter(s => s.completed && !s.isRestDay);
  // A/B/A/B pattern
  return completedSessions.length % 2 === 0 ? 'A' : 'B';
}

export function getDefaultExercises(template: WorkoutTemplate): ExerciseRecord[] {
  if (template === 'A') {
    return [
      {
        name: 'Back Squat',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Bench Press',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Row',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Push-ups (100 total)',
        sets: [{ setNumber: 1, completed: false }],
        isRequired: true,
      },
    ];
  }
  return [
    {
      name: 'Deadlift',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Overhead Press',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Pull-ups / Lat Pulldown',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Core',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
  ];
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
