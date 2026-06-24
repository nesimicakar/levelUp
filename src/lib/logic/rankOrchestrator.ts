import { db, getWeekStart, getSettings, updateSettings, getActiveStrWeekSessions } from '@/lib/db';
import type { UserSettings } from '@/types';
import { computeWeeklyCompletionPct, computeRankUpdate } from '@/lib/logic/rank';
import { RANK_ORDER } from '@/types';
import type { Rank, RankRecord } from '@/types';

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function weekEndDate(weekStart: string): string {
  return addDays(weekStart, 6);
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
  const strCompleted = Math.min(
    strSessions.filter(s => s.completed || s.isRestDay).length,
    strRequired,
  );

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

/**
 * Count consecutive evaluated weeks (not skipped) ending with >=80%,
 * reading backwards from the most recent rankHistory records.
 * Stops at a promoted/demoted record — the streak was consumed or reset at that point.
 */
async function getConsecutiveWeeksAbove80(): Promise<number> {
  const records = await db.rankHistory.orderBy('weekStart').reverse().toArray();
  let count = 0;
  for (const r of records) {
    if (r.reason === 'skipped') continue;
    if (r.reason === 'promoted' || r.reason === 'demoted') break;
    if (r.completionPct >= 80) {
      count++;
    } else {
      break;
    }
  }
  return count;
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

export async function evaluateRankIfNeeded(today: string): Promise<void> {
  await repairSpuriousPromotion();

  // 1. Ensure firstUseDate
  const settings = await getSettings();
  if (!settings.firstUseDate) {
    await updateSettings({ firstUseDate: today });
    settings.firstUseDate = today;
  }

  const currentWeekStart = getWeekStart(today);
  const previousWeekStart = addDays(currentWeekStart, -7);

  // 2. Already evaluated?
  const existing = await db.rankHistory
    .where('weekStart').equals(previousWeekStart)
    .first();

  const decision = evaluationDecision(today, settings.firstUseDate, !!existing);
  if (decision === null) return;

  // 3. Current rank
  const latestRank = await db.rankHistory.orderBy('weekStart').last();
  const currentRank: Rank = latestRank?.rank ?? 'E';

  if (decision === 'skip_partial') {
    await db.rankHistory.add({
      rank: currentRank,
      rankBefore: currentRank,
      weekStart: previousWeekStart,
      weekEnd: weekEndDate(previousWeekStart),
      completionPct: 0,
      reason: 'skipped',
      createdAt: Date.now(),
    });
    return;
  }

  // 4. Full week evaluation
  const strRequired = settings.strSessionsPerWeek ?? 3;
  const completions = await gatherWeekCompletions(previousWeekStart, strRequired, settings);
  const completionPct = computeWeeklyCompletionPct(completions, strRequired);
  const consecutiveWeeks = await getConsecutiveWeeksAbove80();
  const { newRank } = computeRankUpdate(currentRank, completionPct, consecutiveWeeks);

  await db.rankHistory.add({
    rank: newRank,
    rankBefore: currentRank,
    weekStart: previousWeekStart,
    weekEnd: weekEndDate(previousWeekStart),
    completionPct,
    reason: rankReason(currentRank, newRank),
    createdAt: Date.now(),
  });
}
