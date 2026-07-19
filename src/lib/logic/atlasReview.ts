// ─────────────────────────────────────────────────────────────────────────────
// Atlas review derivation (pure — no DB, no DOM)
//
// Review events (AtlasReview) are append-only and stored separately from country
// profiles. Everything the UI shows — latest date, total count, "reviewed X days
// ago", list filtering/sorting — is DERIVED here from the raw events, so the model
// stays a plain fact log with no spaced-repetition/streak/due-date state.
// ─────────────────────────────────────────────────────────────────────────────

import type { AtlasReview } from '@/types';

export const MS_PER_DAY = 86_400_000;

/** Review list scopes/sorts for the Profiled directory. */
export type ReviewFilter = 'all' | 'unreviewed' | 'reviewed' | 'oldest';

/** Derived per-country review state. `latestAt` is null when never reviewed. */
export interface ReviewSummary {
  count: number;
  latestAt: number | null;
}

const EMPTY: ReviewSummary = { count: 0, latestAt: null };

/** Fold one country's events into a summary (latest date + total count). */
export function summarizeReviews(events: AtlasReview[]): ReviewSummary {
  let count = 0;
  let latestAt: number | null = null;
  for (const e of events) {
    count++;
    if (latestAt === null || e.reviewedAt > latestAt) latestAt = e.reviewedAt;
  }
  return { count, latestAt };
}

/** Index ALL events by atlasId → summary, for the directory list in one pass. */
export function indexReviews(events: AtlasReview[]): Map<string, ReviewSummary> {
  const m = new Map<string, ReviewSummary>();
  for (const e of events) {
    const prev = m.get(e.atlasId);
    if (!prev) {
      m.set(e.atlasId, { count: 1, latestAt: e.reviewedAt });
    } else {
      prev.count++;
      if (prev.latestAt === null || e.reviewedAt > prev.latestAt) prev.latestAt = e.reviewedAt;
    }
  }
  return m;
}

/** Local-calendar-day difference (0 = same day as `now`). DST-safe via rounding. */
export function daysAgo(ts: number, now: number): number {
  const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  return Math.round((midnight(now) - midnight(ts)) / MS_PER_DAY);
}

/**
 * Human status for a country's review state:
 *   'Not reviewed' | 'Reviewed today' | 'Reviewed 1 day ago' | 'Reviewed N days ago'.
 */
export function reviewStatusLabel(summary: ReviewSummary | undefined, now: number): string {
  if (!summary || summary.count === 0 || summary.latestAt === null) return 'Not reviewed';
  const d = daysAgo(summary.latestAt, now);
  if (d <= 0) return 'Reviewed today';
  if (d === 1) return 'Reviewed 1 day ago';
  return `Reviewed ${d} days ago`;
}

/** Optional count badge, e.g. 'Reviewed 3×' (null when never reviewed). */
export function reviewCountLabel(summary: ReviewSummary | undefined): string | null {
  if (!summary || summary.count === 0) return null;
  return `Reviewed ${summary.count}×`;
}

function latestOf(index: Map<string, ReviewSummary>, atlasId: string): number {
  return index.get(atlasId)?.latestAt ?? 0;
}

/**
 * Apply a review filter/sort to a list of profiled entities. Pure and stable:
 *   • 'all'        → unchanged (caller's order, typically by name)
 *   • 'unreviewed' → only never-reviewed, order preserved
 *   • 'reviewed'   → only reviewed, most-recent first
 *   • 'oldest'     → only reviewed, oldest first (what to revisit next)
 */
export function applyReviewFilter<T extends { atlasId: string }>(
  entities: T[],
  index: Map<string, ReviewSummary>,
  filter: ReviewFilter,
): T[] {
  const isReviewed = (e: T) => (index.get(e.atlasId)?.count ?? 0) > 0;
  switch (filter) {
    case 'unreviewed':
      return entities.filter(e => !isReviewed(e));
    case 'reviewed':
      return entities.filter(isReviewed).sort((a, b) => latestOf(index, b.atlasId) - latestOf(index, a.atlasId));
    case 'oldest':
      return entities.filter(isReviewed).sort((a, b) => latestOf(index, a.atlasId) - latestOf(index, b.atlasId));
    case 'all':
    default:
      return entities;
  }
}

/** Count profiled countries with no reviews yet — for the "Review · N" entry label. */
export function unreviewedCount(profileIds: Iterable<string>, index: Map<string, ReviewSummary>): number {
  let n = 0;
  for (const id of profileIds) if (!(index.get(id)?.count)) n++;
  return n;
}

export const REVIEW_FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unreviewed', label: 'Not Reviewed' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'oldest', label: 'Oldest' },
];
