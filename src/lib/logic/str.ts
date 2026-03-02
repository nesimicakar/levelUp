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

export function getNextTemplate(totalCompletedSessions: number): WorkoutTemplate {
  // A/B/A/B pattern based on lifetime completed sessions
  return totalCompletedSessions % 2 === 0 ? 'A' : 'B';
}

export function getDefaultExercises(template: WorkoutTemplate): ExerciseRecord[] {
  if (template === 'A') {
    return [
      {
        name: 'Goblet Squat',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Incline Dumbbell Press',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Chest-Supported Dumbbell Row',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Pull-Ups',
        sets: [
          { setNumber: 1, completed: false },
          { setNumber: 2, completed: false },
          { setNumber: 3, completed: false },
        ],
        isRequired: true,
      },
      {
        name: 'Lateral Raises',
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
  return [
    {
      name: 'Romanian Deadlift (RDL)',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Neutral-Grip Dumbbell Shoulder Press',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Cable Row',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Push-Ups',
      sets: [
        { setNumber: 1, completed: false },
        { setNumber: 2, completed: false },
        { setNumber: 3, completed: false },
      ],
      isRequired: true,
    },
    {
      name: 'Face Pulls',
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
