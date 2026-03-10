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
  CustomTaskLog,
  StatType,
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
  customTaskLogs!: Table<CustomTaskLog, number>;

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
      strSessions: '++id, date, template, completed, isRestDay, createdAt',
      agiLogs: '++id, date, completed, createdAt',
      vitLogs: '++id, date, completed, createdAt',
      intLogs: '++id, date, completed, createdAt',
      perLogs: '++id, date, completed, createdAt',
      weeklySummaries: '++id, weekStart, createdAt',
      courseProgress: '++id, courseId',
      rankHistory: '++id, &weekStart, rank, createdAt',
      achievements: '++id, key, stat, unlockedAt',
      settings: '++id',
    });
    this.version(4).stores({
      strSessions: '++id, date, template, completed, isRestDay, createdAt',
      agiLogs: '++id, date, completed, createdAt',
      vitLogs: '++id, date, completed, createdAt',
      intLogs: '++id, date, completed, createdAt',
      perLogs: '++id, date, completed, createdAt',
      weeklySummaries: '++id, weekStart, createdAt',
      courseProgress: '++id, courseId',
      rankHistory: '++id, &weekStart, rank, createdAt',
      achievements: '++id, key, stat, unlockedAt',
      settings: '++id',
      customTaskLogs: '++id, [date+taskId], date, taskId',
    });
  }
}

export const db = new LevelUpDB();

export async function getSettings(): Promise<UserSettings> {
  const s = await db.settings.toCollection().first();
  if (s) {
    if (s.quranPagesPerDay === undefined) s.quranPagesPerDay = 1;
    if (s.learningMinutesPerDay === undefined) s.learningMinutesPerDay = 20;
    if (s.intCourseName === undefined) s.intCourseName = 'Primary Study';
    if (s.perProgramName === undefined) s.perProgramName = 'Skill Development';
    if (s.customTasks === undefined) s.customTasks = [];
    if (s.strictMode === undefined) s.strictMode = false;
    if (s.hasOnboarded === undefined) s.hasOnboarded = true; // existing users skip onboarding
    if (s.enableSpirituality === undefined) s.enableSpirituality = true; // existing users keep spirituality
    if (s.exerciseNames === undefined) s.exerciseNames = {};
    return s;
  }
  const defaults: UserSettings = {
    readingPagesPerDay: 20,
    learningMinutesPerDay: 20,
    courseUnitsPerDay: 4,
    lessonsPerDay: 2,
    quranPagesPerDay: 1,
    proteinGoalGrams: 130,
    hydrationGoalLiters: 2.0,
    agiActivityType: 'Rowing',
    agiMinMinutes: 10,
    strUpperIncrement: 5,
    strLowerIncrement: 10,
    intCourseName: 'Primary Study',
    perProgramName: 'Skill Development',
    customTasks: [],
    strictMode: false,
    hasOnboarded: false,
    enableSpirituality: false,
    exerciseNames: {},
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
    'real-estate': { courseId: 'real-estate', totalUnits: 200, completedUnits: 0, lastUpdated: Date.now() },
    'stage-academy': { courseId: 'stage-academy', totalUnits: 144, completedUnits: 0, lastUpdated: Date.now() },
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ===== Custom Task Helpers ===== //

export async function getEnabledCustomTasksForSkill(skill: StatType) {
  const settings = await getSettings();
  return (settings.customTasks ?? []).filter(t => t.skill === skill && t.enabled);
}

export async function getCustomTaskChecksForDate(date: string): Promise<CustomTaskLog[]> {
  return db.customTaskLogs.where('date').equals(date).toArray();
}

export async function setCustomTaskCheck(date: string, taskId: string, checked: boolean): Promise<void> {
  const existing = await db.customTaskLogs.where('[date+taskId]').equals([date, taskId]).first();
  if (existing?.id) {
    await db.customTaskLogs.update(existing.id, { checked, updatedAt: Date.now() });
  } else {
    await db.customTaskLogs.add({ date, taskId, checked, updatedAt: Date.now() });
  }
}

export async function deleteCustomTask(taskId: string): Promise<void> {
  const settings = await getSettings();
  const updated = (settings.customTasks ?? []).filter(t => t.id !== taskId);
  await updateSettings({ customTasks: updated });
  await db.customTaskLogs.where('taskId').equals(taskId).delete();
}
