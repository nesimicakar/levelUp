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
  AtlasCountry,
  AtlasReview,
  Character,
  CharacterStatsSnapshot,
  Rank,
} from '@/types';
import { STARTER_CHARACTER, CHARACTER_DEFS } from '@/lib/data/characterDefs';

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
  atlasCountries!: Table<AtlasCountry, string>;
  atlasReviews!: Table<AtlasReview, number>;
  characters!: Table<Character, number>;

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
    this.version(9).stores({
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
      // World Atlas: user-owned country profiles keyed by internal atlasId.
      // iso3 is optional/non-unique here (entities without an official code
      // store nothing in it), so it is a plain secondary index, not unique.
      atlasCountries: '&atlasId, iso3, name, updatedAt',
    });
    this.version(10).stores({
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
      atlasCountries: '&atlasId, iso3, name, updatedAt',
      // Self-directed Atlas review events. Kept in a SEPARATE store from the
      // profile so review history survives profile delete/re-import. Multiple
      // rows per atlasId are allowed; latest date + count are derived, not stored.
      atlasReviews: '++id, atlasId, reviewedAt',
    });
    // Character Prestige: rank progression becomes per-character instead of a single
    // lifetime ladder. Additive only — adds the `characters` table and a `characterId`
    // index on rankHistory; no existing Vault/Atlas/discipline/log data is touched.
    this.version(11).stores({
      strSessions: '++id, date, template, completed, isRestDay, createdAt',
      agiLogs: '++id, date, completed, createdAt',
      vitLogs: '++id, date, completed, createdAt',
      intLogs: '++id, date, completed, createdAt',
      perLogs: '++id, date, completed, createdAt',
      weeklySummaries: '++id, weekStart, createdAt',
      courseProgress: '++id, courseId',
      rankHistory: '++id, &weekStart, rank, createdAt, characterId',
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
      atlasCountries: '&atlasId, iso3, name, updatedAt',
      atlasReviews: '++id, atlasId, reviewedAt',
      characters: '++id, status, startedAt',
    }).upgrade(async tx => {
      const settingsRow = await tx.table('settings').toCollection().first();
      const startedAt = settingsRow?.firstUseDate
        ? new Date(settingsRow.firstUseDate + 'T12:00:00').getTime()
        : Date.now();

      const warriorId = await tx.table('characters').add({
        ...STARTER_CHARACTER,
        status: 'active',
        startedAt,
      });

      // Every rankHistory row so far belongs to the seeded Warrior character.
      await tx.table('rankHistory').toCollection().modify({ characterId: warriorId });

      if (settingsRow?.id !== undefined) {
        await tx.table('settings').update(settingsRow.id, { activeCharacterId: warriorId });
      }
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
    if (s.langCompletions === undefined) s.langCompletions = [];
    if (s.expressionCompletions === undefined) s.expressionCompletions = [];
    if (s.graceTokensAvailable === undefined) s.graceTokensAvailable = 1;
    if (s.graceTokensGrantedQuarters === undefined) s.graceTokensGrantedQuarters = [];
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
    graceTokensAvailable: 1,
    graceTokensGrantedQuarters: [],
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

// ===== Character Prestige Helpers ===== //

/** The character currently in progress. Self-healing: a fresh install (or a DB that
 *  somehow lost its pointer) gets the Warrior seeded lazily, same pattern as getSettings(). */
export async function getActiveCharacter(): Promise<Character> {
  const settings = await getSettings();
  if (settings.activeCharacterId !== undefined) {
    const existing = await db.characters.get(settings.activeCharacterId);
    if (existing) return existing;
  }
  const warrior: Character = { ...STARTER_CHARACTER, status: 'active', startedAt: Date.now() };
  const id = await db.characters.add(warrior);
  await updateSettings({ activeCharacterId: id });
  return { ...warrior, id };
}

export async function getAllCharacters(): Promise<Character[]> {
  return db.characters.orderBy('startedAt').toArray();
}

/** Starts a new character from the mastery pool and makes it the active one.
 *  Does NOT touch the previous (mastered) character's row. */
export async function createCharacter(slug: string): Promise<Character> {
  const def = CHARACTER_DEFS.find(d => d.slug === slug);
  if (!def) throw new Error(`Unknown character slug: ${slug}`);
  const character: Character = { ...def, status: 'active', startedAt: Date.now() };
  const id = await db.characters.add(character);
  await updateSettings({ activeCharacterId: id });
  return { ...character, id };
}

/** Marks a character as mastered. Does not create or select the next character —
 *  that only happens once the user chooses one at the mastery moment. Takes an
 *  explicit characterId (rather than reading "active" from settings) so it's safe
 *  to call from contexts that may touch a past, already-mastered character's
 *  records (e.g. a grace-token cascade) without accidentally mastering whichever
 *  character happens to be active right now. */
export async function masterCharacter(characterId: number, finalRank: Rank, snapshot: CharacterStatsSnapshot): Promise<void> {
  await db.characters.update(characterId, {
    status: 'mastered',
    masteredAt: Date.now(),
    finalRank,
    finalStatsSnapshot: snapshot,
  });
}

/**
 * Repairs character↔rankHistory linkage. Safe and idempotent — returns immediately
 * when everything is already consistent, so it's cheap to run on every app load.
 *
 * Why this exists separately from the v11 migration: a backup restore writes rows
 * DIRECTLY into tables at the current schema version, so Dexie's upgrade function
 * never fires. Restoring a pre-v11 backup therefore lands rankHistory rows with no
 * `characterId` and a settings row with no `activeCharacterId` — which silently
 * strands the user on a fresh E ladder while their real history sits unreferenced.
 * This re-applies the same linkage the migration would have, and additionally
 * cleans up the duplicate characters that a wiped `activeCharacterId` causes
 * getActiveCharacter() to lazily seed.
 */
export async function reconcileCharacterLinkage(): Promise<void> {
  const settings = await getSettings();
  const characters = await db.characters.orderBy('startedAt').toArray();
  const orphans = await db.rankHistory.filter(r => r.characterId === undefined).toArray();
  const actives = characters.filter(c => c.status === 'active');

  const pointerValid = settings.activeCharacterId !== undefined
    && characters.some(c => c.id === settings.activeCharacterId);

  // Healthy: nothing unattributed, pointer resolves, no duplicate active rows.
  if (orphans.length === 0 && pointerValid && actives.length <= 1) return;

  // Owner of unattributed history — the earliest active character, else the
  // earliest of any (covers "all mastered, awaiting next pick"), else a freshly
  // seeded Warrior anchored to the restored firstUseDate so the orchestrator's
  // mid-week fairness check still lines up with the real history.
  let owner = actives[0] ?? characters[0];
  if (!owner) {
    const startedAt = settings.firstUseDate
      ? new Date(settings.firstUseDate + 'T12:00:00').getTime()
      : Date.now();
    const seeded: Character = { ...STARTER_CHARACTER, status: 'active', startedAt };
    const id = await db.characters.add(seeded);
    owner = { ...seeded, id };
  }

  if (orphans.length > 0) {
    await db.rankHistory.bulkPut(orphans.map(r => ({ ...r, characterId: owner.id })));
  }

  // Drop stray duplicate active characters that own no history. Guarded on the
  // owned-row count so a character with real history is never deleted.
  for (const c of actives) {
    if (c.id === owner.id || c.id === undefined) continue;
    const owned = await db.rankHistory.where('characterId').equals(c.id).count();
    if (owned === 0) await db.characters.delete(c.id);
  }

  await updateSettings({ activeCharacterId: owner.id });
}

/**
 * Enforces the invariant that a character cannot have started AFTER evidence of its
 * own activity — i.e. `startedAt` must not be later than the earliest rank week it
 * owns, nor (for the starter character) later than the app's firstUseDate.
 *
 * Why this is separate from the linkage repair: `startedAt` is only ever assigned
 * when a character is SEEDED. If a restore swaps in a different settings row, an
 * already-seeded character keeps a start date derived from the pre-restore
 * firstUseDate — leaving it claiming to have started months after its own history.
 * Linkage can be perfectly consistent in that state, so this must not sit behind
 * the linkage early-return.
 *
 * Only ever moves a date EARLIER, to a value the data itself proves.
 */
export async function repairCharacterStartDates(): Promise<void> {
  const settings = await getSettings();
  const characters = await db.characters.toArray();

  for (const c of characters) {
    if (c.id === undefined) continue;

    const owned = await db.rankHistory.where('characterId').equals(c.id).toArray();
    const candidates: number[] = [];

    if (owned.length > 0) {
      const earliestWeek = owned
        .map(r => r.weekStart)
        .reduce((min, w) => (w < min ? w : min));
      candidates.push(new Date(earliestWeek + 'T12:00:00').getTime());
    }

    // The starter character is the one the app began with, so it can never post-date
    // firstUseDate. Later characters legitimately start long after it.
    if (c.slug === STARTER_CHARACTER.slug && settings.firstUseDate) {
      candidates.push(new Date(settings.firstUseDate + 'T12:00:00').getTime());
    }

    if (candidates.length === 0) continue;
    const earliest = Math.min(...candidates);
    if (c.startedAt > earliest) {
      await db.characters.update(c.id, { startedAt: earliest });
    }
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

// ===== World Atlas Helpers ===== //
//
// Country PROFILES only. Geometry and the entity registry are static app data
// (src/lib/data/atlasEntities.ts) and are never persisted here.

export async function getAllAtlasCountries(): Promise<AtlasCountry[]> {
  return db.atlasCountries.orderBy('name').toArray();
}

export async function getAtlasCountry(atlasId: string): Promise<AtlasCountry | undefined> {
  return db.atlasCountries.get(atlasId);
}

/** Set of atlasIds that currently have a profile — for map "has profile" styling. */
export async function getAtlasCountryIds(): Promise<Set<string>> {
  const keys = await db.atlasCountries.toCollection().keys();
  return new Set(keys as string[]);
}

/** Insert or fully replace a profile (caller supplies the complete record). */
export async function putAtlasCountry(country: AtlasCountry): Promise<void> {
  await db.atlasCountries.put(country);
}

export async function updateAtlasCountry(
  atlasId: string,
  partial: Partial<AtlasCountry>,
): Promise<void> {
  await db.atlasCountries.update(atlasId, { ...partial, updatedAt: Date.now() });
}

export async function deleteAtlasCountry(atlasId: string): Promise<void> {
  // Only the profile is removed — review history in atlasReviews is intentionally
  // left intact so it is never silently erased by deleting/re-importing a profile.
  await db.atlasCountries.delete(atlasId);
}

// ===== World Atlas Review Helpers =====
//
// Review events are append-only and stored separately from profiles. Latest date
// and total count are DERIVED from the events (see src/lib/logic/atlasReview.ts),
// never persisted, so multiple reviews of the same country compose naturally.

export async function getAllAtlasReviews(): Promise<AtlasReview[]> {
  return db.atlasReviews.toArray();
}

export async function getAtlasReviewsFor(atlasId: string): Promise<AtlasReview[]> {
  return db.atlasReviews.where('atlasId').equals(atlasId).toArray();
}

/** Append one review event. Returns the new row id. `reviewedAt` is injectable for tests. */
export async function addAtlasReview(atlasId: string, reviewedAt: number = Date.now()): Promise<number> {
  return db.atlasReviews.add({ atlasId, reviewedAt });
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
