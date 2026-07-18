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
  id?: string; // stable template id; absent on sessions created before this change
  name: string;
  sets: SetRecord[];
  isRequired: boolean;
  noWeight?: boolean;
}

/** A template slot definition (not stored in DB — used only to build new sessions). */
export interface StrTemplateExercise {
  id: string;
  name: string;
  sets: number;
  noWeight?: boolean;
}

export interface StrSession {
  id?: number;
  date: string; // YYYY-MM-DD
  template: WorkoutTemplate;
  exercises: ExerciseRecord[];
  completed: boolean;
  isRestDay: boolean;
  createdAt: number;
  /** Present on entries created via Session Completion mode. Absent on all legacy rows. */
  entryMode?: 'workout' | 'session';
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
  learningMinutes?: number;
  courseUnitsCompleted: number;
  /** Per-course daily units. Keys are IntCourse.id. New system; old reads fall back
   *  to courseUnitsCompleted (for legacy-real-estate) or perLog.lessonsCompleted
   *  (for legacy-stage-academy). */
  unitsByCourse?: Record<string, number>;
  completed: boolean;
  createdAt: number;
}

export interface IntCourse {
  id: string;
  name: string;
  totalUnits: number;
  completedUnits: number;
  dailyTargetUnits: number;
  status: 'active' | 'acquired';
  createdAt: number;
  acquiredAt?: number;
}

export interface PerLog {
  id?: number;
  date: string;
  lessonsCompleted: number;
  prayersCount?: number;
  quranPages?: number;
  /** Daily book/personal reading minutes — counts toward PER completion when set
   *  ≥ settings.dailyReadingMinutesTarget. Optional (legacy logs may lack it). */
  readingMinutes?: number;
  completed: boolean;
  createdAt: number;
}

/** Optional nafile (voluntary) prayer tracking — purely informational, no XP/rank effect. */
export interface NafileLog {
  id?: number;
  date: string;       // YYYY-MM-DD
  prayers: Record<string, boolean>; // keyed by prayer id, e.g. { evvabin: true }
  createdAt: number;
}

export interface WeeklySummary {
  id?: number;
  weekStart: string; // Monday YYYY-MM-DD
  strCompleted: number; // out of 3
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

export interface CustomTask {
  id: string;
  skill: StatType;
  label: string;
  enabled: boolean;
  createdAt: number;
}

export interface CustomTaskLog {
  id?: number;
  date: string;
  taskId: string;
  checked: boolean;
  updatedAt: number;
}

export interface LangSentence {
  index: number;
  target: string;
  native: string;
}

export interface ExpressionItem {
  index: number;
  expression: string;
  source: string;
  meaning: string;
}

/** The eight authorable top-level Daily Idea categories. "Other" is a runtime
 *  fallback only (for legacy/invalid data) and is intentionally NOT listed here. */
export type DailyIdeaCategory =
  | 'History' | 'Literature' | 'Psychology' | 'Business'
  | 'Language' | 'Philosophy' | 'Science' | 'Culture';

/** Normalized Daily Idea — the single internal shape both the structured JSON
 *  bank and the legacy pipe-delimited bank are parsed into. Field derivation:
 *  structured entries keep their explicit values; legacy entries map
 *  idea→title, source→topic/source, and infer category from source. */
export interface DailyIdea {
  /** Position in the parsed bank. Drives index-based completion lookup (kept for
   *  backward compatibility with existing ExpressionCompletion records). */
  index: number;
  /** Explicit id (structured) or generated fallback (legacy: `legacy-<index>`). */
  id: string;
  /** Structured `title`, or the legacy `idea` field. */
  title: string;
  /** Resolved category KEY (lowercase, e.g. 'history') or 'other' fallback.
   *  Not the raw label — display label/icon are looked up from the key. */
  category: string;
  meaning: string;
  topic?: string;
  context?: string;
  example?: string;
  takeaway?: string;
  /** Legacy source attribution, retained internally for display + category fallback. */
  source?: string;
}

export interface ExpressionCompletion {
  /** Legacy positional key. Still written for back-compat, but attribution now
   *  resolves by `ideaId`. Legacy records may predate `ideaId`. */
  index: number;
  /** Stable id of the completed Daily Idea. Present on all new completions;
   *  absent on legacy records (which the user resets manually). */
  ideaId?: string;
  date: string;
  completedAt: number;
  status?: 'read' | 'known';
}

export interface LangCompletion {
  index: number;
  date: string;
  completedAt: number;
  status?: 'learned' | 'known';
}

export interface RecallItem {
  id: string;
  title: string;
  summary: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveBook {
  id: string;
  title: string;
  author?: string;
  currentPage?: number;
  totalPages?: number;
  startedAt?: number;
  keyIdeas?: string;
  applyToLife?: string;
  notes?: string;
}

export interface FinishedBook {
  id: string;
  title: string;
  author?: string;
  totalPages?: number;
  finishedAt: number;
  keyIdeas?: string;
  applyToLife?: string;
  notes?: string;
}

export interface UserSettings {
  id?: number;
  readingPagesPerDay: number;
  learningMinutesPerDay: number;
  courseUnitsPerDay: number;
  lessonsPerDay: number;
  quranPagesPerDay: number;
  proteinGoalGrams: number;
  hydrationGoalLiters: number;
  agiActivityType: string;
  agiMinMinutes: number;
  strUpperIncrement: number;
  strLowerIncrement: number;
  firstUseDate?: string; // ISO date, set once on first app load
  intCourseName?: string;
  perProgramName?: string;
  customTasks?: CustomTask[];
  strictMode?: boolean;
  hasOnboarded?: boolean;
  enableSpirituality?: boolean;
  /** Daily book reading target (minutes). Drives PER completion. Default 5. */
  dailyReadingMinutesTarget?: number;
  /** STR sessions per week target. Range 2–5. Default 3. */
  strSessionsPerWeek?: number;
  exerciseNames?: Record<string, string>; // exercise id → custom display name
  strMode?: 'workout' | 'session';
  /** Gym vs Calisthenics STR training mode. Default 'gym'. */
  strTrainingMode?: 'gym' | 'calisthenics';
  /** Per-exercise progression level selections. Keys are CALI_EXERCISES ids. */
  caliProgressionLevels?: Record<string, string>;
  activeBooks?: ActiveBook[];
  finishedBooks?: FinishedBook[];
  /** Course list for INT (active + acquired). Seeded from legacy Real Estate +
   *  Stage Academy courseProgress on first load. */
  intCourses?: IntCourse[];
  recallItems?: RecallItem[];
  /** Show anime/character artwork on SYSTEM, RECORD, and Character pages. Default true. */
  showCharacterVisuals?: boolean;
  enableLanguageLearning?: boolean;
  langNative?: string;
  langTarget?: string;
  langSentenceBank?: string;
  langCompletions?: LangCompletion[];
  enableDailyExpressions?: boolean;
  expressionBank?: string;
  expressionCompletions?: ExpressionCompletion[];
}

// ── Discipline System ────────────────────────────────────────────────────────

export type DisciplineLogStatus = 'clear' | 'failed' | 'skipped' | 'unset';
export type DisciplineStreakType = 'anti-habit' | 'positive-habit';
export type DisciplineStreakStatus = 'active' | 'paused' | 'archived';

export interface DisciplineStreak {
  id: string;                        // UUID — caller-assigned
  name: string;
  description?: string;
  type: DisciplineStreakType;
  status: DisciplineStreakStatus;
  createdAt: number;
  startDate: string;                 // ISO date of first day of current streak
  currentStreak: number;             // recalculated from logs
  bestStreak: number;                // persisted across resets
  totalClearDays: number;
  totalFailedDays: number;
  lastUpdated: number;
}

export interface DisciplineLog {
  id?: number;                       // auto-increment PK
  streakId: string;
  date: string;                      // ISO date YYYY-MM-DD
  status: DisciplineLogStatus;
  note?: string;
  createdAt: number;
  updatedAt: number;
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
};

export const RANK_ORDER: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];

// ── Calisthenics (STR Calisthenics Mode) ─────────────────────────────────────

export interface CaliSetRecord {
  setNumber: number;
  reps: number;
  completed: boolean;
}

export interface CaliExerciseRecord {
  id: string;               // stable exercise id from CALI_EXERCISES
  name: string;             // display name
  progressionLevel: string; // progression id e.g. 'regular', 'pullup'
  sets: CaliSetRecord[];
}

export interface CaliSession {
  id?: number;
  date: string;             // YYYY-MM-DD
  exercises: CaliExerciseRecord[];
  completed: boolean;
  isRestDay?: boolean;
  createdAt: number;
  /** 'full' = all 4 exercises; 'quick' = user-selected subset. Absent on legacy rows = full. */
  sessionType?: 'full' | 'quick';
}

// ── Knowledge Vault ──────────────────────────────────────────────────────────

export type KnowledgeSourceType = 'book' | 'course' | 'recall' | 'yuno' | 'memoryos' | 'note' | 'manual';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface KnowledgeDomain {
  id: string;           // UUID — caller-assigned
  name: string;
  icon: string;         // emoji
  color: string;        // hex color
  createdAt: number;
}

export interface KeyIdea {
  title: string;
  body: string;
}

export interface KnowledgeConcept {
  id: string;           // UUID — caller-assigned
  title: string;
  summary: string;
  keyIdeas?: KeyIdea[];         // structured idea cards (title + explanation)
  keyTakeaways?: string[];      // legacy bullet format; kept for backward compat
  personalNotes?: string;
  primaryDomainId: string;
  tags: string[];
  relatedConceptIds: string[];
  sourceType: KnowledgeSourceType;
  sourceTitle?: string;
  retentionScore: number;       // 0–100
  reviewCount: number;
  reviewIntervalDays: number;   // current interval
  nextReviewAt: number;         // timestamp ms
  lastReviewedAt?: number;      // timestamp ms
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeReview {
  id?: number;          // auto-increment
  conceptId: string;
  rating: ReviewRating;
  previousRetention: number;
  newRetention: number;
  previousIntervalDays: number;
  newIntervalDays: number;
  date: string;         // YYYY-MM-DD
  createdAt: number;
}

// ── World Atlas ──────────────────────────────────────────────────────────────
//
// Design split (Stage 1):
//   • GEOMETRY is a built-in app asset (Natural Earth / world-atlas TopoJSON).
//     It is never stored in the database and never included in backups.
//   • The ENTITY REGISTRY (src/lib/data/atlasEntities.ts) is a static, canonical
//     list of geographic entities the map can render. It is app data, not user
//     data — also never stored in the database.
//   • A COUNTRY PROFILE (AtlasCountry) is the only user-owned, imported/edited
//     record. It decorates a registry entity by `atlasId`. Absence of a profile
//     is normal: the map still renders the entity from geometry + registry.

/**
 * Political/geographic classification. Lets partially recognized states,
 * territories, and disputed areas appear on the map without forcing a
 * misleading "sovereign or nothing" binary.
 */
export type AtlasEntityStatus =
  | 'sovereign'       // widely recognized sovereign state
  | 'partial'         // partially recognized state (e.g. Kosovo, Taiwan)
  | 'territory'       // dependency / territory of another state
  | 'disputed';       // disputed area without settled control

/**
 * One row of the canonical geographic entity registry. Static app data —
 * the stable bridge between map geometry and (optional) user profiles.
 */
export interface AtlasEntity {
  /** Internal stable primary key. Never changes, even if ISO codes do. */
  atlasId: string;
  /** ISO 3166-1 alpha-3. Optional: some entities have no official code. */
  iso3?: string;
  /** ISO 3166-1 numeric, as strings match world-atlas feature ids. Optional. */
  isoNumeric?: string;
  /** Display name. */
  name: string;
  /** Political/geographic classification. */
  status: AtlasEntityStatus;
  /** Continent / region grouping, for list navigation and future map layers. */
  region: string;
}

/** A quantitative, time-stamped, sourced numeric fact (population, GDP, area…). */
export interface AtlasMetric {
  /** Numeric value — enables future comparison, sorting, and map layers. */
  value: number;
  /** Unit, e.g. 'people', 'USD', 'km2', 'USD/capita'. */
  unit: string;
  /** The year/date the figure describes, e.g. '2024' or '2023-Q4'. */
  asOf: string;
  /** Where the figure came from, e.g. 'UN WPP 2024', 'IMF WEO Oct 2023'. */
  source?: string;
  /** Optional pre-formatted display string, e.g. '≈85 million'. */
  display?: string;
}

/** Free-form section outside the standard structured fields. */
export interface AtlasExtraSection {
  title: string;
  body: string;
}

/**
 * Structured "at a glance" snapshot. Quantitative facts are AtlasMetric
 * (numeric + asOf + source); descriptive facts are plain strings.
 */
export interface AtlasSnapshot {
  capital?: string;
  largestCity?: string;
  majorCities?: string[];
  officialLanguages?: string[];
  currency?: string;
  government?: string;
  population?: AtlasMetric;
  area?: AtlasMetric;
  gdpNominal?: AtlasMetric;
  gdpPerCapita?: AtlasMetric;
}

/** Geography: physical setting. Neighbors here are AUTHORED maritime/strategic. */
export interface AtlasGeography {
  overview?: string;
  terrain?: string;
  climate?: string;
  // Standard structured geography (promoted from extraSections in Stage 4.1).
  majorRegions?: string[];
  mountains?: string[];
  rivers?: string[];
  lakes?: string[];
  seasAndOceans?: string[];
  /** Canonically a geography field as of Stage 4.1 (economy.naturalResources kept for back-compat). */
  naturalResources?: string[];
  /**
   * Maritime neighbors (across water) — authored, since they cannot be derived
   * from shared land borders. Values are `atlasId`s. Land neighbors are derived
   * from map topology at render time and are NOT stored here.
   */
  maritimeNeighborIds?: string[];
}

/** Economy: how the country makes its living. */
export interface AtlasEconomy {
  overview?: string;
  // Legacy fields (Stage 1) — retained for backward compatibility.
  keyIndustries?: string[];
  naturalResources?: string[];
  exports?: string[];
  // Standard structured economy (promoted from extraSections in Stage 4.1).
  majorIndustries?: string[];
  majorExports?: string[];
  majorImports?: string[];
  strengths?: string[];
  challenges?: string[];
}

/** Relationships: strategic posture. Authored, not derived. */
export interface AtlasRelationships {
  overview?: string;
  alliances?: string[];       // e.g. 'NATO', 'EU', 'BRICS'
  /** Strategic partners/rivals as `atlasId`s, authored (not land adjacency). */
  keyPartnerIds?: string[];
  keyRivalIds?: string[];
}

/**
 * A user-owned country profile. Decorates a registry entity by `atlasId`.
 * Primary key is `atlasId` (internal, stable) — NOT iso3, which is optional.
 *
 * Ownership boundary for re-import (Stage 2 contract):
 *   • `personalNotes` and `createdAt` are user-owned — preserved across re-import.
 *   • Everything else is reference content — refreshed from the pack.
 *   • `relatedConceptIds` is NOT blindly preserved. It is import-derived: the
 *     pack carries `relatedConceptTitles`, which are re-resolved against the
 *     CURRENT Vault concepts on every import, and the result REPLACES this
 *     field. (There is no separate user-curated relationship field; if one is
 *     added later, only that field would be preserved.)
 */
export interface AtlasCountry {
  atlasId: string;              // primary key — matches AtlasEntity.atlasId
  iso3?: string;                // denormalized for convenience; optional
  name: string;                 // snapshot of display name at import time

  summary: string;              // one-paragraph orientation

  snapshot: AtlasSnapshot;
  geography: AtlasGeography;
  economy: AtlasEconomy;
  relationships: AtlasRelationships;
  history: string;              // narrative: origins → turning points → legacy
  whyItMatters: string;         // narrative: significance in the world
  rememberThese: string[];      // durable takeaways / conversation hooks

  extraSections?: AtlasExtraSection[];  // only for info outside the standard shape

  // ── User-owned (preserved across re-import) ──
  personalNotes?: string;
  relatedConceptIds: string[];  // bridges into the Knowledge Vault graph

  createdAt: number;
  updatedAt: number;
}

export const STAT_LABELS: Record<StatType, string> = {
  STR: 'Strength',
  AGI: 'Agility',
  VIT: 'Vitality',
  INT: 'Intelligence',
  PER: 'Perception',
};
