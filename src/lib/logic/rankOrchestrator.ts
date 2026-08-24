import { db, getWeekStart, getSettings, updateSettings, getActiveStrWeekSessions, getActiveCharacter, masterCharacter } from '@/lib/db';
import type { UserSettings } from '@/types';
import { computeWeeklyCompletionPct, computeRankUpdate, countConsecutiveWeeksAbove80, computeStrWeekCredit } from '@/lib/logic/rank';
import { buildCharacterStatsSnapshot } from '@/lib/logic/characters';
import { RANK_ORDER } from '@/types';
import type { Rank, RankRecord } from '@/types';

/** Ascending by weekStart — the canonical ordering rank cascades rely on. */
function byWeekStartAsc(records: RankRecord[]): RankRecord[] {
  return [...records].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

async function getCharacterRankHistory(characterId: number): Promise<RankRecord[]> {
  return db.rankHistory.where('characterId').equals(characterId).toArray();
}

/**
 * If this character's most recent evaluated week is now S-rank and they aren't
 * already mastered, freeze them: mark mastered, snapshot final stats. Does NOT
 * create or select a next character — that only happens once the user chooses
 * one at the mastery moment.
 */
async function checkAndMasterIfReachedS(characterId: number): Promise<void> {
  const character = await db.characters.get(characterId);
  if (!character || character.status === 'mastered') return;

  const records = byWeekStartAsc(await getCharacterRankHistory(characterId));
  const latest = records.at(-1);
  if (latest?.rank !== 'S') return;

  await masterCharacter(characterId, 'S', buildCharacterStatsSnapshot(records));
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function weekEndDate(weekStart: string): string {
  return addDays(weekStart, 6);
}

function toDateStr(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function rankReason(oldRank: Rank, newRank: Rank): RankRecord['reason'] {
  const oldIdx = RANK_ORDER.indexOf(oldRank);
  const newIdx = RANK_ORDER.indexOf(newRank);
  if (newIdx > oldIdx) return 'promoted';
  if (newIdx < oldIdx) return 'demoted';
  return 'maintained';
}

/**
 * Pure decision: should we evaluate, skip, or do nothing for the previous week?
 * Returns null if no action needed (already evaluated, or previous week is before first use).
 */
export function evaluationDecision(
  today: string,
  firstUseDate: string,
  alreadyEvaluated: boolean,
): 'skip_partial' | 'evaluate' | null {
  const currentWeekStart = getWeekStart(today);
  const previousWeekStart = addDays(currentWeekStart, -7);

  if (alreadyEvaluated) return null;

  const firstUseWeekStart = getWeekStart(firstUseDate);

  // Previous week ended before user started
  if (previousWeekStart < firstUseWeekStart) return null;

  // Partial first week: user started mid-week
  if (firstUseWeekStart === previousWeekStart && firstUseDate > previousWeekStart) {
    return 'skip_partial';
  }

  return 'evaluate';
}

/**
 * Gather completion counts for a Mon–Sun week from daily log tables.
 * Routes STR to the active training mode (gym or calisthenics).
 */
async function gatherWeekCompletions(weekStart: string, strRequired: number, settings: UserSettings) {
  const wEnd = addDays(weekStart, 7);

  const strSessions = await getActiveStrWeekSessions(weekStart, wEnd, settings);
  const strCompleted = computeStrWeekCredit(strSessions, strRequired);

  let agiCompleted = 0;
  let vitCompleted = 0;
  let intCompleted = 0;
  let perCompleted = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const agi = await db.agiLogs.where('date').equals(date).first();
    if (agi?.completed) agiCompleted++;
    const vit = await db.vitLogs.where('date').equals(date).first();
    if (vit?.completed) vitCompleted++;
    const int = await db.intLogs.where('date').equals(date).first();
    if (int?.completed) intCompleted++;
    const per = await db.perLogs.where('date').equals(date).first();
    if (per?.completed) perCompleted++;
  }

  return { strCompleted, agiCompleted, vitCompleted, intCompleted, perCompleted };
}

async function getConsecutiveWeeksAbove80(characterId: number): Promise<number> {
  const records = byWeekStartAsc(await getCharacterRankHistory(characterId)).reverse();
  return countConsecutiveWeeksAbove80(records);
}

/**
 * Run on every app load. Evaluates the previous week's rank exactly once
 * when a new calendar week is detected.
 *
 * Fairness: if firstUseDate falls mid-week in the previous week,
 * the evaluation is skipped — no rank change.
 */
/**
 * One-time repair: removes any rankHistory record where the promotion to a higher rank
 * was caused by the pre-fix bug (streak counter didn't stop at previous promotion).
 * Safe to run repeatedly — idempotent. Deletes only records flagged as 'promoted'
 * that follow immediately after another 'promoted' record with fewer than 4 intervening
 * maintained weeks.
 */
async function repairSpuriousPromotion(): Promise<void> {
  const repairKey = 'rankRepair_v1';
  if (localStorage.getItem(repairKey) === 'done') return;

  const records = await db.rankHistory.orderBy('weekStart').toArray(); // oldest first
  const toDelete: number[] = [];

  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    if (r.reason !== 'promoted') continue;

    // Count maintained weeks between the previous promotion/demotion and this record
    let maintainedSince = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (records[j].reason === 'skipped') continue;
      if (records[j].reason === 'promoted' || records[j].reason === 'demoted') break;
      if (records[j].completionPct >= 80) maintainedSince++;
      else break;
    }

    // A legitimate promotion requires exactly 3 maintained weeks before it
    // (the 4th week triggers the promotion itself). Anything fewer is spurious.
    if (maintainedSince < 3 && r.id !== undefined) {
      toDelete.push(r.id);
    }
  }

  if (toDelete.length > 0) {
    await db.rankHistory.bulkDelete(toDelete);
  }

  localStorage.setItem(repairKey, 'done');
}

export const MAX_GRACE_TOKENS = 2;

/**
 * One-time compensating credit: an early version of applyGraceToken's forward-recompute
 * treated a later already-'grace' week like any other record, silently re-deriving it
 * from raw completionPct and re-demoting it — burning the token that had been spent on
 * it for nothing. Refunds exactly one token, once, so affected users aren't out a token
 * for a bug that ate its own effect. Safe no-op for anyone who never hit it (their count
 * was never below cap, so this just tops them back up).
 */
async function refundGraceTokenClobberedByCascadeBug(): Promise<void> {
  const repairKey = 'graceClobberRefund_v1';
  if (localStorage.getItem(repairKey) === 'done') return;

  const settings = await getSettings();
  const available = settings.graceTokensAvailable ?? 0;
  await updateSettings({ graceTokensAvailable: Math.min(available + 1, MAX_GRACE_TOKENS) });

  localStorage.setItem(repairKey, 'done');
}

/** Calendar-quarter key for a date, e.g. "2026-Q3". Used to grant at most one grace token per quarter. */
export function getQuarterKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

/**
 * Grants at most one grace token per calendar quarter, capped at MAX_GRACE_TOKENS.
 * Idempotent — tracks which quarters have already been checked so re-running
 * (e.g. multiple app loads within the same quarter) never double-grants.
 */
export async function ensureGraceTokenGrant(today: string): Promise<void> {
  const settings = await getSettings();
  const available = settings.graceTokensAvailable ?? 1;
  const granted = settings.graceTokensGrantedQuarters ?? [];
  const quarterKey = getQuarterKey(today);

  if (granted.includes(quarterKey)) return;

  if (available >= MAX_GRACE_TOKENS) {
    await updateSettings({ graceTokensGrantedQuarters: [...granted, quarterKey] });
    return;
  }

  await updateSettings({
    graceTokensAvailable: available + 1,
    graceTokensGrantedQuarters: [...granted, quarterKey],
  });
}

/**
 * Spends one grace token to reverse a single 'demoted' week (life-happens exemption —
 * illness, bereavement, etc.). The week is marked 'grace' at its pre-demotion rank, and
 * every later rankHistory record is recomputed forward from there so the whole chain
 * (rank, rankBefore, reason, promotion streak) stays internally consistent. The graced
 * week itself is streak-neutral (like a skipped week): it doesn't count toward the next
 * promotion, but doesn't break a streak in progress either.
 */
export async function applyGraceToken(recordId: number): Promise<void> {
  const settings = await getSettings();
  const available = settings.graceTokensAvailable ?? 0;
  if (available <= 0) return;

  const target = await db.rankHistory.get(recordId);
  if (!target || target.reason !== 'demoted' || target.characterId === undefined) return;

  // A mastered character's ladder is frozen and its finalRank/finalStatsSnapshot are
  // already committed. Recomputing its history here would silently desync those
  // stored values from the underlying rows, so the freeze is enforced at the write
  // itself rather than relying on the UI never offering the button.
  const owner = await db.characters.get(target.characterId);
  if (owner?.status === 'mastered') return;

  // Scope the cascade to the SAME character as the graced record — rankHistory now
  // holds rows from every character's ladder, and a fix to one character's history
  // (past or present) must never bleed into another's.
  const records = byWeekStartAsc(await getCharacterRankHistory(target.characterId));
  const idx = records.findIndex(r => r.id === recordId);
  if (idx === -1) return;

  const updated = [...records];
  updated[idx] = { ...updated[idx], rank: updated[idx].rankBefore, reason: 'grace' };

  let currentRank = updated[idx].rank;
  // Grace is streak-neutral, like a skipped week: it doesn't count toward the next
  // promotion, but it doesn't break an existing streak either — carry forward whatever
  // promotion progress existed immediately before this week, unbroken.
  let consecWeeks = countConsecutiveWeeksAbove80([...updated.slice(0, idx)].reverse());

  for (let i = idx + 1; i < updated.length; i++) {
    const rec = updated[i];
    if (rec.reason === 'skipped' || rec.reason === 'grace') {
      // A later week already skipped/graced — carry rank and streak through it
      // unchanged. (For 'grace' specifically: re-deriving from raw completionPct
      // here would silently re-demote it, wasting the token already spent on it.)
      updated[i] = { ...rec, rankBefore: currentRank, rank: currentRank };
      continue;
    }
    const { newRank, newConsecutiveWeeks } = computeRankUpdate(currentRank, rec.completionPct, consecWeeks);
    updated[i] = { ...rec, rankBefore: currentRank, rank: newRank, reason: rankReason(currentRank, newRank) };
    currentRank = newRank;
    consecWeeks = newConsecutiveWeeks;
  }

  await db.rankHistory.bulkPut(updated);
  await updateSettings({ graceTokensAvailable: available - 1 });

  // The cascade could newly reach S for this character (e.g. forgiving a demotion
  // unblocks a promotion further down the chain). No-ops for an already-mastered
  // character since checkAndMasterIfReachedS bails out on status first.
  await checkAndMasterIfReachedS(target.characterId);
}

export async function evaluateRankIfNeeded(today: string): Promise<void> {
  await repairSpuriousPromotion();
  await refundGraceTokenClobberedByCascadeBug();
  await ensureGraceTokenGrant(today);

  // 1. Ensure firstUseDate
  const settings = await getSettings();
  if (!settings.firstUseDate) {
    await updateSettings({ firstUseDate: today });
    settings.firstUseDate = today;
  }

  const character = await getActiveCharacter();
  if (character.id === undefined) return;

  // Self-healing mastery: run on every load, not just after a freshly evaluated
  // week. Any path can land an S-rank row without going through the weekly
  // evaluation — a backup restore most notably — and that must still trigger the
  // mastery moment rather than silently sitting at a static "apex" state.
  await checkAndMasterIfReachedS(character.id);

  // Re-read: the check above may have just mastered this character. A mastered
  // character's ladder is frozen — no further weeks accrue until the user chooses
  // their next character at the mastery moment (which starts a fresh, empty
  // rankHistory for the new character and resumes evaluation naturally).
  const currentStatus = (await db.characters.get(character.id))?.status;
  if (currentStatus === 'mastered') return;

  const currentWeekStart = getWeekStart(today);
  const previousWeekStart = addDays(currentWeekStart, -7);

  // 2. Already evaluated? weekStart is globally unique across all characters (they
  // run strictly sequentially in time), so this check needs no character filter.
  const existing = await db.rankHistory
    .where('weekStart').equals(previousWeekStart)
    .first();

  // Fairness boundary is THIS character's startedAt, not the app's lifetime
  // firstUseDate — otherwise a character created mid-week (right after the
  // previous one is mastered) would get evaluated over a full Mon-Sun week it
  // wasn't around for. settings.firstUseDate stays untouched for lifetime day-count
  // display elsewhere; it's unrelated to per-character rank fairness.
  const decision = evaluationDecision(today, toDateStr(character.startedAt), !!existing);
  if (decision === null) return;

  // 3. Current rank — scoped to this character only, so a freshly started character
  // never inherits a previous character's rank from the global rankHistory table.
  const characterHistory = byWeekStartAsc(await getCharacterRankHistory(character.id));
  const currentRank: Rank = characterHistory.at(-1)?.rank ?? 'E';

  if (decision === 'skip_partial') {
    await db.rankHistory.add({
      rank: currentRank,
      rankBefore: currentRank,
      weekStart: previousWeekStart,
      weekEnd: weekEndDate(previousWeekStart),
      completionPct: 0,
      reason: 'skipped',
      createdAt: Date.now(),
      characterId: character.id,
    });
    return;
  }

  // 4. Full week evaluation
  const strRequired = settings.strSessionsPerWeek ?? 3;
  const completions = await gatherWeekCompletions(previousWeekStart, strRequired, settings);
  const completionPct = computeWeeklyCompletionPct(completions);
  const consecutiveWeeks = await getConsecutiveWeeksAbove80(character.id);
  const { newRank } = computeRankUpdate(currentRank, completionPct, consecutiveWeeks);

  await db.rankHistory.add({
    rank: newRank,
    rankBefore: currentRank,
    weekStart: previousWeekStart,
    weekEnd: weekEndDate(previousWeekStart),
    completionPct,
    reason: rankReason(currentRank, newRank),
    characterId: character.id,
    createdAt: Date.now(),
  });

  if (newRank === 'S') {
    await checkAndMasterIfReachedS(character.id);
  }
}
