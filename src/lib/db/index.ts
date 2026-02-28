import Dexie, { type Table } from 'dexie';
import type {
  StrSession,
  AgiLog,
  VitLog,
  IntLog,
  PerLog,
  WeeklySummary,
  CourseProgress,
  RankRecord,
  Achievement,
  UserSettings,
} from '@/types';

export class LevelUpDB extends Dexie {
  strSessions!: Table<StrSession, number>;
  agiLogs!: Table<AgiLog, number>;
  vitLogs!: Table<VitLog, number>;
  intLogs!: Table<IntLog, number>;
  perLogs!: Table<PerLog, number>;
  weeklySummaries!: Table<WeeklySummary, number>;
  courseProgress!: Table<CourseProgress, number>;
  rankHistory!: Table<RankRecord, number>;
  achievements!: Table<Achievement, number>;
  settings!: Table<UserSettings, number>;

  constructor() {
    super('LevelUpDB');
    this.version(2).stores({
      strSessions: '++id, date, template, completed, isRestDay, createdAt',
      agiLogs: '++id, date, completed, createdAt',
      vitLogs: '++id, date, completed, createdAt',
      intLogs: '++id, date, completed, createdAt',
      perLogs: '++id, date, completed, createdAt',
      weeklySummaries: '++id, weekStart, createdAt',
      courseProgress: '++id, courseId',
      rankHistory: '++id, weekStart, rank, createdAt',
      achievements: '++id, key, stat, unlockedAt',
      settings: '++id',
    });
    this.version(3).stores({
      rankHistory: '++id, &weekStart, rank, createdAt',
    });
  }
}

export const db = new LevelUpDB();

export async function getSettings(): Promise<UserSettings> {
  const s = await db.settings.toCollection().first();
  if (s) {
    if (s.quranPagesPerDay === undefined) s.quranPagesPerDay = 1;
    return s;
  }
  const defaults: UserSettings = {
    readingPagesPerDay: 20,
    courseUnitsPerDay: 4,
    lessonsPerDay: 2,
    quranPagesPerDay: 1,
    proteinGoalGrams: 130,
    hydrationGoalLiters: 2.0,
    agiActivityType: 'Rowing',
    agiMinMinutes: 10,
    strUpperIncrement: 5,
    strLowerIncrement: 10,
  };
  await db.settings.add(defaults);
  return defaults;
}

export async function updateSettings(partial: Partial<UserSettings>): Promise<void> {
  const existing = await db.settings.toCollection().first();
  if (existing && existing.id) {
    await db.settings.update(existing.id, partial);
  }
}

export async function getCourseProgress(courseId: string): Promise<CourseProgress> {
  const existing = await db.courseProgress.where('courseId').equals(courseId).first();
  if (existing) return existing;
  const defaults: Record<string, CourseProgress> = {
    'real-estate': { courseId: 'real-estate', totalUnits: 200, completedUnits: 41, lastUpdated: Date.now() },
    'stage-academy': { courseId: 'stage-academy', totalUnits: 144, completedUnits: 26, lastUpdated: Date.now() },
  };
  const d = defaults[courseId];
  if (d) {
    await db.courseProgress.add(d);
    return d;
  }
  throw new Error(`Unknown course: ${courseId}`);
}

export async function updateCourseProgress(courseId: string, additionalUnits: number): Promise<CourseProgress> {
  const cp = await getCourseProgress(courseId);
  const newCompleted = Math.min(cp.completedUnits + additionalUnits, cp.totalUnits);
  if (cp.id) {
    await db.courseProgress.update(cp.id, { completedUnits: newCompleted, lastUpdated: Date.now() });
  }
  return { ...cp, completedUnits: newCompleted, lastUpdated: Date.now() };
}

export function getToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}
