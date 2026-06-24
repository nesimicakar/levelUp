import Dexie, { type Table } from 'dexie';
import type {
  StrSession,
  AgiLog,
  VitLog,
  IntLog,
  PerLog,
  NafileLog,
  WeeklySummary,
  CourseProgress,
  RankRecord,
  Achievement,
  UserSettings,
  CustomTaskLog,
  StatType,
  DisciplineStreak,
  DisciplineLog,
  KnowledgeDomain,
  KnowledgeConcept,
  KnowledgeReview,
  CaliSession,
} from '@/types';

export class LevelUpDB extends Dexie {
  strSessions!: Table<StrSession, number>;
  caliSessions!: Table<CaliSession, number>;
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
  disciplineStreaks!: Table<DisciplineStreak, string>;
  disciplineLogs!: Table<DisciplineLog, number>;
  knowledgeDomains!: Table<KnowledgeDomain, string>;
  knowledgeConcepts!: Table<KnowledgeConcept, string>;
  knowledgeReviews!: Table<KnowledgeReview, number>;
  nafileLogs!: Table<NafileLog, number>;

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
    this.version(5).stores({
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
      disciplineStreaks: '&id, status, createdAt',
      disciplineLogs: '++id, streakId, date, [streakId+date]',
    });
    this.version(6).stores({
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
      disciplineStreaks: '&id, status, createdAt',
      disciplineLogs: '++id, streakId, date, [streakId+date]',
      knowledgeDomains: '&id, name, createdAt',
      knowledgeConcepts: '&id, primaryDomainId, nextReviewAt, createdAt',
      knowledgeReviews: '++id, conceptId, date, createdAt',
    });
    this.version(7).stores({
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
      disciplineStreaks: '&id, status, createdAt',
      disciplineLogs: '++id, streakId, date, [streakId+date]',
      knowledgeDomains: '&id, name, createdAt',
      knowledgeConcepts: '&id, primaryDomainId, nextReviewAt, createdAt',
      knowledgeReviews: '++id, conceptId, date, createdAt',
      caliSessions: '++id, date, completed, createdAt',
    });
    this.version(8).stores({
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
      disciplineStreaks: '&id, status, createdAt',
      disciplineLogs: '++id, streakId, date, [streakId+date]',
      knowledgeDomains: '&id, name, createdAt',
      knowledgeConcepts: '&id, primaryDomainId, nextReviewAt, createdAt',
      knowledgeReviews: '++id, conceptId, date, createdAt',
      caliSessions: '++id, date, completed, createdAt',
      nafileLogs: '++id, date, createdAt',
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
    if (s.activeBooks === undefined) s.activeBooks = [];
    if (s.finishedBooks === undefined) s.finishedBooks = [];
    if (s.dailyReadingMinutesTarget === undefined) s.dailyReadingMinutesTarget = 5;
    if (s.strSessionsPerWeek === undefined) s.strSessionsPerWeek = 3;
    if (s.recallItems === undefined) s.recallItems = [];
    if (s.showCharacterVisuals === undefined) s.showCharacterVisuals = true;
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
    activeBooks: [],
    finishedBooks: [],
    dailyReadingMinutesTarget: 5,
    strSessionsPerWeek: 3,
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

// ===== Knowledge Vault Helpers ===== //

export async function getAllDomains(): Promise<KnowledgeDomain[]> {
  return db.knowledgeDomains.orderBy('createdAt').toArray();
}

export async function addDomain(domain: KnowledgeDomain): Promise<void> {
  await db.knowledgeDomains.put(domain);
}

export async function updateDomain(id: string, partial: Partial<KnowledgeDomain>): Promise<void> {
  await db.knowledgeDomains.update(id, partial);
}

export async function deleteDomain(id: string): Promise<void> {
  await db.transaction('rw', [db.knowledgeDomains, db.knowledgeConcepts, db.knowledgeReviews], async () => {
    const concepts = await db.knowledgeConcepts.where('primaryDomainId').equals(id).toArray();
    for (const c of concepts) {
      await db.knowledgeReviews.where('conceptId').equals(c.id).delete();
    }
    await db.knowledgeConcepts.where('primaryDomainId').equals(id).delete();
    await db.knowledgeDomains.delete(id);
  });
}

export async function getAllConcepts(): Promise<KnowledgeConcept[]> {
  return db.knowledgeConcepts.orderBy('createdAt').toArray();
}

export async function getConceptsByDomain(domainId: string): Promise<KnowledgeConcept[]> {
  return db.knowledgeConcepts.where('primaryDomainId').equals(domainId).toArray();
}

export async function getDueConcepts(): Promise<KnowledgeConcept[]> {
  const now = Date.now();
  return db.knowledgeConcepts.filter(c => c.nextReviewAt <= now).toArray();
}

export async function addConcept(concept: KnowledgeConcept): Promise<void> {
  await db.knowledgeConcepts.put(concept);
}

export async function updateConcept(id: string, partial: Partial<KnowledgeConcept>): Promise<void> {
  await db.knowledgeConcepts.update(id, { ...partial, updatedAt: Date.now() });
}

export async function deleteConcept(id: string): Promise<void> {
  await db.transaction('rw', [db.knowledgeConcepts, db.knowledgeReviews], async () => {
    await db.knowledgeReviews.where('conceptId').equals(id).delete();
    await db.knowledgeConcepts.delete(id);
  });
}

export async function getReviewsForConcept(conceptId: string): Promise<KnowledgeReview[]> {
  return db.knowledgeReviews.where('conceptId').equals(conceptId).sortBy('createdAt');
}

export async function addReview(review: KnowledgeReview): Promise<void> {
  await db.knowledgeReviews.add(review);
}

// ===== Calisthenics Helpers ===== //

export async function getCaliSessionForDate(date: string): Promise<CaliSession | undefined> {
  return db.caliSessions.where('date').equals(date).first();
}

export async function getCaliSessionsInRange(from: string, to: string): Promise<CaliSession[]> {
  return db.caliSessions.where('date').between(from, to + '￿').toArray();
}

export async function getAllCaliSessions(): Promise<CaliSession[]> {
  return db.caliSessions.toArray();
}

// ===== Active-mode STR routing helpers ===== //
// These route to strSessions or caliSessions based on strTrainingMode,
// so dashboard and rank logic don't duplicate the branching.

function caliToStrSessions(rows: CaliSession[]): StrSession[] {
  return rows.map(s => ({
    id: s.id,
    date: s.date,
    template: 'A' as const,
    exercises: [],
    completed: s.completed,
    isRestDay: s.isRestDay ?? false,
    createdAt: s.createdAt,
  }));
}

/**
 * All STR sessions across all time (gym + cali combined), shaped as StrSession[].
 * Always combines both tables so switching modes never erases cross-mode history.
 */
export async function getActiveStrAllSessions(_settings: UserSettings): Promise<StrSession[]> {
  const [gymRows, caliRows] = await Promise.all([
    db.strSessions.toArray(),
    db.caliSessions.toArray(),
  ]);
  return [...gymRows, ...caliToStrSessions(caliRows)];
}

/** Total completed STR sessions across all time (gym + cali), for XP computation. */
export async function getActiveStrAllCompleted(_settings: UserSettings): Promise<number> {
  const [gymRows, caliRows] = await Promise.all([
    db.strSessions.toArray(),
    db.caliSessions.toArray(),
  ]);
  return [...gymRows, ...caliToStrSessions(caliRows)].filter(s => s.completed).length;
}

/**
 * STR sessions within [from, to) — gym + cali combined — for weekly status and rank.
 * Returns StrSession-shaped objects so getStrWeeklyStatus works unchanged.
 * Callers format `to` as needed (e.g. today + '￿' or next Monday).
 */
export async function getActiveStrWeekSessions(
  from: string,
  to: string,
  _settings: UserSettings,
): Promise<StrSession[]> {
  const [gymRows, caliRows] = await Promise.all([
    db.strSessions.where('date').between(from, to).toArray(),
    db.caliSessions.where('date').between(from, to).toArray(),
  ]);
  return [...gymRows, ...caliToStrSessions(caliRows)];
}
