import { db, getWeekStart, getSettings, updateSettings } from '@/lib/db';
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
 */
async function gatherWeekCompletions(weekStart: string) {
  const wEnd = addDays(weekStart, 7);

  const strSessions = await db.strSessions
    .where('date').between(weekStart, wEnd, true, false)
    .toArray();
  const strCompleted = Math.min(
    strSessions.filter(s => s.completed || s.isRestDay).length,
    4,
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
 */
async function getConsecutiveWeeksAbove80(): Promise<number> {
  const records = await db.rankHistory.orderBy('weekStart').reverse().toArray();
  let count = 0;
  for (const r of records) {
    if (r.reason === 'skipped') continue;
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
export async function evaluateRankIfNeeded(today: string): Promise<void> {
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
  const completions = await gatherWeekCompletions(previousWeekStart);
  const completionPct = computeWeeklyCompletionPct(completions);
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
