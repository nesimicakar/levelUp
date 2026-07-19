import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db, addAtlasReview, getAtlasReviewsFor, getAllAtlasReviews, deleteAtlasCountry,
} from '@/lib/db';
import { importAtlasPack, type AtlasPack } from '@/lib/logic/atlasPack';
import {
  summarizeReviews, indexReviews, reviewStatusLabel, reviewCountLabel,
  daysAgo, applyReviewFilter, unreviewedCount, type ReviewSummary,
} from '@/lib/logic/atlasReview';
import type { AtlasReview } from '@/types';

const ev = (atlasId: string, reviewedAt: number): AtlasReview => ({ atlasId, reviewedAt });

// Fixed local calendar days (avoid Date.now / real clock for determinism).
const TODAY = new Date(2026, 5, 15, 10, 0, 0).getTime();
const TODAY_EARLY = new Date(2026, 5, 15, 1, 0, 0).getTime();
const YESTERDAY = new Date(2026, 5, 14, 20, 0, 0).getTime();
const THREE_AGO = new Date(2026, 5, 12, 8, 0, 0).getTime();

// ── Pure derivation ───────────────────────────────────────────────────────────

describe('summarizeReviews / indexReviews (latest date + count derivation)', () => {
  it('an empty log is count 0 with no latest date', () => {
    expect(summarizeReviews([])).toEqual({ count: 0, latestAt: null });
  });

  it('derives total count and the MOST RECENT date from repeated reviews', () => {
    const s = summarizeReviews([ev('tur', THREE_AGO), ev('tur', TODAY), ev('tur', YESTERDAY)]);
    expect(s.count).toBe(3);
    expect(s.latestAt).toBe(TODAY); // latest, regardless of insertion order
  });

  it('indexes many countries in one pass', () => {
    const idx = indexReviews([ev('a', THREE_AGO), ev('a', TODAY), ev('b', YESTERDAY)]);
    expect(idx.get('a')).toEqual({ count: 2, latestAt: TODAY });
    expect(idx.get('b')).toEqual({ count: 1, latestAt: YESTERDAY });
    expect(idx.get('c')).toBeUndefined();
  });
});

describe('daysAgo / status + count labels', () => {
  it('same calendar day is 0 regardless of time of day', () => {
    expect(daysAgo(TODAY_EARLY, TODAY)).toBe(0);
  });
  it('counts whole calendar days back', () => {
    expect(daysAgo(YESTERDAY, TODAY)).toBe(1);
    expect(daysAgo(THREE_AGO, TODAY)).toBe(3);
  });
  it('labels not-reviewed / today / singular / plural', () => {
    expect(reviewStatusLabel(undefined, TODAY)).toBe('Not reviewed');
    expect(reviewStatusLabel({ count: 0, latestAt: null }, TODAY)).toBe('Not reviewed');
    expect(reviewStatusLabel({ count: 1, latestAt: TODAY_EARLY }, TODAY)).toBe('Reviewed today');
    expect(reviewStatusLabel({ count: 1, latestAt: YESTERDAY }, TODAY)).toBe('Reviewed 1 day ago');
    expect(reviewStatusLabel({ count: 2, latestAt: THREE_AGO }, TODAY)).toBe('Reviewed 3 days ago');
  });
  it('count label is null until reviewed, then N×', () => {
    expect(reviewCountLabel(undefined)).toBeNull();
    expect(reviewCountLabel({ count: 0, latestAt: null })).toBeNull();
    expect(reviewCountLabel({ count: 3, latestAt: TODAY })).toBe('Reviewed 3×');
  });
});

// ── Filtering & sorting (Profiled review list) ────────────────────────────────

describe('applyReviewFilter (list filters/sorting)', () => {
  const entities = [{ atlasId: 'a' }, { atlasId: 'b' }, { atlasId: 'c' }];
  const index = new Map<string, ReviewSummary>([
    ['a', { count: 1, latestAt: TODAY }],      // reviewed recently
    ['b', { count: 2, latestAt: THREE_AGO }],  // reviewed long ago
    // c: never reviewed
  ]);

  it('all → unchanged order', () => {
    expect(applyReviewFilter(entities, index, 'all').map(e => e.atlasId)).toEqual(['a', 'b', 'c']);
  });
  it('unreviewed → only never-reviewed', () => {
    expect(applyReviewFilter(entities, index, 'unreviewed').map(e => e.atlasId)).toEqual(['c']);
  });
  it('reviewed → only reviewed, most recent first', () => {
    expect(applyReviewFilter(entities, index, 'reviewed').map(e => e.atlasId)).toEqual(['a', 'b']);
  });
  it('oldest → only reviewed, oldest first', () => {
    expect(applyReviewFilter(entities, index, 'oldest').map(e => e.atlasId)).toEqual(['b', 'a']);
  });
});

describe('unreviewedCount (Review · N entry, profiled-only)', () => {
  it('counts only profiled ids that have no reviews yet', () => {
    const index = indexReviews([ev('a', TODAY)]);
    // Only profiled ids are passed in — a is reviewed, b & c are not.
    expect(unreviewedCount(['a', 'b', 'c'], index)).toBe(2);
    expect(unreviewedCount([], index)).toBe(0);
    expect(unreviewedCount(['a'], index)).toBe(0);
  });
});

// ── Persistence (create, repeat, backup/restore, re-import) ────────────────────

const turPack: AtlasPack = {
  type: 'levelup-atlas-pack',
  version: 1,
  countries: [{ atlasId: 'tur', name: 'Türkiye', summary: 'Bridge between two continents.' }],
};

describe('review events persistence', () => {
  beforeEach(async () => {
    await db.atlasReviews.clear();
    await db.atlasCountries.clear();
  });

  it('creates a review event', async () => {
    await addAtlasReview('tur', TODAY);
    const rows = await getAtlasReviewsFor('tur');
    expect(rows).toHaveLength(1);
    expect(rows[0].atlasId).toBe('tur');
    expect(rows[0].reviewedAt).toBe(TODAY);
    expect(rows[0].id).toBeTypeOf('number'); // auto-increment key assigned
  });

  it('allows repeated reviews of the same country (append-only)', async () => {
    await addAtlasReview('tur', THREE_AGO);
    await addAtlasReview('tur', YESTERDAY);
    await addAtlasReview('tur', TODAY);
    const rows = await getAtlasReviewsFor('tur');
    expect(rows).toHaveLength(3);
    const s = summarizeReviews(rows);
    expect(s.count).toBe(3);
    expect(s.latestAt).toBe(TODAY);
  });

  it('survives a full-DB backup → restore round-trip', async () => {
    await addAtlasReview('tur', YESTERDAY);
    await addAtlasReview('jpn', TODAY);
    // Export (mirrors settings backup): read the table out.
    const exported = await getAllAtlasReviews();
    expect(exported).toHaveLength(2);
    // Restore (mirrors settings doRestore): clear + bulkPut the exported rows.
    await db.atlasReviews.clear();
    expect(await getAllAtlasReviews()).toHaveLength(0);
    await db.atlasReviews.bulkPut(exported);
    const restored = await getAllAtlasReviews();
    expect(restored).toHaveLength(2);
    expect(restored.map(r => r.atlasId).sort()).toEqual(['jpn', 'tur']);
  });

  it('re-importing a profile does NOT erase review history', async () => {
    await addAtlasReview('tur', THREE_AGO);
    await addAtlasReview('tur', TODAY);
    await importAtlasPack(turPack, TODAY);           // writes the profile
    expect(await db.atlasCountries.get('tur')).toBeDefined();
    const rows = await getAtlasReviewsFor('tur');
    expect(rows).toHaveLength(2);                     // history untouched
    expect(summarizeReviews(rows).latestAt).toBe(TODAY);
  });

  it('deleting a profile does NOT erase review history', async () => {
    await importAtlasPack(turPack, TODAY);
    await addAtlasReview('tur', TODAY);
    await deleteAtlasCountry('tur');
    expect(await db.atlasCountries.get('tur')).toBeUndefined();
    expect(await getAtlasReviewsFor('tur')).toHaveLength(1); // review kept
  });
});
