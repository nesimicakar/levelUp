export type StatType = 'STR' | 'AGI' | 'VIT' | 'INT' | 'PER';

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export type WorkoutTemplate = 'A' | 'B';

export type DayStatus = 'incomplete' | 'complete' | 'rest';

export interface SetRecord {
  setNumber: number;
  completed: boolean;
  weight?: number;
  reps?: number;
}

export interface ExerciseRecord {
  name: string;
  sets: SetRecord[];
  isRequired: boolean;
}

export interface StrSession {
  id?: number;
  date: string; // YYYY-MM-DD
  template: WorkoutTemplate;
  exercises: ExerciseRecord[];
  completed: boolean;
  isRestDay: boolean;
  createdAt: number;
}

export interface AgiLog {
  id?: number;
  date: string;
  minutes: number;
  activityType: string;
  completed: boolean;
  createdAt: number;
}

export interface VitLog {
  id?: number;
  date: string;
  sleepHours: number;
  proteinGoalMet: boolean;
  hydrationGoalMet?: boolean;
  postureMobilityMet?: boolean;
  completed: boolean;
  createdAt: number;
}

export interface IntLog {
  id?: number;
  date: string;
  pagesRead: number;
  courseUnitsCompleted: number;
  completed: boolean;
  createdAt: number;
}

export interface PerLog {
  id?: number;
  date: string;
  lessonsCompleted: number;
  completed: boolean;
  createdAt: number;
}

export interface WeeklySummary {
  id?: number;
  weekStart: string; // Monday YYYY-MM-DD
  strCompleted: number; // out of 4
  strRestTokensUsed: number;
  agiCompleted: number; // out of 7
  vitCompleted: number;
  intCompleted: number;
  perCompleted: number;
  totalOpportunities: number;
  totalCompleted: number;
  completionPct: number;
  rank: Rank;
  createdAt: number;
}

export interface CourseProgress {
  id?: number;
  courseId: string; // 'real-estate' | 'stage-academy'
  totalUnits: number;
  completedUnits: number;
  lastUpdated: number;
}

export interface RankRecord {
  id?: number;
  rank: Rank;
  rankBefore: Rank;
  weekStart: string;
  weekEnd: string;
  completionPct: number;
  reason: 'promoted' | 'demoted' | 'maintained' | 'skipped';
  createdAt: number;
}

export interface Achievement {
  id?: number;
  key: string;
  title: string;
  description: string;
  tier: 1 | 2 | 3;
  unlockedAt: number;
  stat?: StatType;
}

export interface UserSettings {
  id?: number;
  readingPagesPerDay: number;
  courseUnitsPerDay: number;
  lessonsPerDay: number;
  proteinGoalGrams: number;
  hydrationGoalLiters: number;
  agiActivityType: string;
  agiMinMinutes: number;
  strUpperIncrement: number;
  strLowerIncrement: number;
  firstUseDate?: string; // ISO date, set once on first app load
}

export interface StatLevel {
  level: number;
  currentXP: number;
  xpToNext: number;
  progressPct: number;
}

// Helper type for weekly STR tracking
export interface StrWeeklyStatus {
  sessionsCompleted: number;
  sessionsRequired: number;
  restTokensUsed: number;
  restTokensTotal: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  readingPagesPerDay: 20,
  courseUnitsPerDay: 4,
  lessonsPerDay: 2,
  proteinGoalGrams: 130,
  hydrationGoalLiters: 2.0,
  agiActivityType: 'Rowing',
  agiMinMinutes: 10,
  strUpperIncrement: 5,
  strLowerIncrement: 10,
};

export const RANK_ORDER: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];

export const STAT_LABELS: Record<StatType, string> = {
  STR: 'Strength',
  AGI: 'Agility',
  VIT: 'Vitality',
  INT: 'Intelligence',
  PER: 'Perception',
};
