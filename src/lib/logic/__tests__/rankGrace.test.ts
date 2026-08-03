import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, getSettings, updateSettings } from '../../db';
import { getQuarterKey, ensureGraceTokenGrant, applyGraceToken, MAX_GRACE_TOKENS } from '../rankOrchestrator';
import { countConsecutiveWeeksAbove80 } from '../rank';
import type { RankRecord } from '@/types';

function makeRankRecord(overrides: Partial<RankRecord> = {}): RankRecord {
  return {
    rank: 'B',
    rankBefore: 'A',
    weekStart: '2026-07-13',
    weekEnd: '2026-07-19',
    completionPct: 40,
    reason: 'demoted',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('grace token system', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await getSettings(); // ensure a settings row exists before updateSettings() calls in tests
  });

  describe('getQuarterKey', () => {
    it('buckets dates into calendar quarters', () => {
      expect(getQuarterKey('2026-01-15')).toBe('2026-Q1');
      expect(getQuarterKey('2026-04-01')).toBe('2026-Q2');
      expect(getQuarterKey('2026-08-03')).toBe('2026-Q3');
      expect(getQuarterKey('2026-12-31')).toBe('2026-Q4');
    });
  });

  describe('ensureGraceTokenGrant', () => {
    it('grants a token the first time a new quarter is seen, up to the cap', async () => {
      await updateSettings({ graceTokensAvailable: 0, graceTokensGrantedQuarters: [] });
      await ensureGraceTokenGrant('2026-08-03');
      let s = await getSettings();
      expect(s.graceTokensAvailable).toBe(1);
      expect(s.graceTokensGrantedQuarters).toEqual(['2026-Q3']);

      // Same quarter again: no double-grant
      await ensureGraceTokenGrant('2026-08-20');
      s = await getSettings();
      expect(s.graceTokensAvailable).toBe(1);
    });

    it('never grants past MAX_GRACE_TOKENS', async () => {
      await updateSettings({ graceTokensAvailable: MAX_GRACE_TOKENS, graceTokensGrantedQuarters: [] });
      await ensureGraceTokenGrant('2026-08-03');
      const s = await getSettings();
      expect(s.graceTokensAvailable).toBe(MAX_GRACE_TOKENS);
      expect(s.graceTokensGrantedQuarters).toEqual(['2026-Q3']);
    });
  });

  describe('applyGraceToken', () => {
    it('reverses a demoted week back to its pre-demotion rank and spends a token', async () => {
      await updateSettings({ graceTokensAvailable: 1 });
      const id = await db.rankHistory.add(makeRankRecord());

      await applyGraceToken(id);

      const rec = await db.rankHistory.get(id);
      expect(rec?.rank).toBe('A');
      expect(rec?.reason).toBe('grace');
      const s = await getSettings();
      expect(s.graceTokensAvailable).toBe(0);
    });

    it('does nothing if no tokens are available', async () => {
      await updateSettings({ graceTokensAvailable: 0 });
      const id = await db.rankHistory.add(makeRankRecord());

      await applyGraceToken(id);

      const rec = await db.rankHistory.get(id);
      expect(rec?.rank).toBe('B');
      expect(rec?.reason).toBe('demoted');
    });

    it('does nothing if the target record is not a demotion', async () => {
      await updateSettings({ graceTokensAvailable: 1 });
      const id = await db.rankHistory.add(makeRankRecord({ reason: 'maintained', rank: 'A', rankBefore: 'A' }));

      await applyGraceToken(id);

      const rec = await db.rankHistory.get(id);
      expect(rec?.reason).toBe('maintained');
      const s = await getSettings();
      expect(s.graceTokensAvailable).toBe(1);
    });

    it('recomputes every later week forward so the chain stays consistent', async () => {
      await updateSettings({ graceTokensAvailable: 1 });
      const demotedId = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-07-13', weekEnd: '2026-07-19', rank: 'B', rankBefore: 'A', completionPct: 30, reason: 'demoted' })
      );
      // Following week was evaluated against the (wrongly) demoted B rank.
      const nextId = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-07-20', weekEnd: '2026-07-26', rank: 'B', rankBefore: 'B', completionPct: 85, reason: 'maintained' })
      );

      await applyGraceToken(demotedId);

      const demoted = await db.rankHistory.get(demotedId);
      const next = await db.rankHistory.get(nextId);
      expect(demoted?.rank).toBe('A');
      expect(demoted?.reason).toBe('grace');
      // Recomputed against the restored A rank: still A, rankBefore corrected to A.
      expect(next?.rankBefore).toBe('A');
      expect(next?.rank).toBe('A');
      expect(next?.reason).toBe('maintained');
    });

    it('is streak-neutral: a pre-existing promotion streak survives the graced week', async () => {
      await updateSettings({ graceTokensAvailable: 1 });
      await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-07-06', weekEnd: '2026-07-12', rank: 'A', rankBefore: 'A', completionPct: 85, reason: 'maintained' })
      );
      const demotedId = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-07-13', weekEnd: '2026-07-19', rank: 'B', rankBefore: 'A', completionPct: 0, reason: 'demoted' })
      );

      await applyGraceToken(demotedId);

      const all = await db.rankHistory.orderBy('weekStart').reverse().toArray();
      // The 85% week before the bereavement week still counts toward the next promotion —
      // grace didn't erase that progress, only the earlier bug's raw-recompute would have.
      expect(countConsecutiveWeeksAbove80(all)).toBe(1);
    });

    it('does not clobber a later week that was already graced when an earlier week is graced afterward', async () => {
      // Reproduces the reported bug: two consecutive bad weeks, both demoted.
      // User graces the LATER week first, then the EARLIER week — the earlier
      // fix's forward recompute must not undo the later week's grace.
      await updateSettings({ graceTokensAvailable: 2 });
      const week1Id = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-07-20', weekEnd: '2026-07-26', rank: 'B', rankBefore: 'A', completionPct: 0, reason: 'demoted' })
      );
      const week2Id = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-07-27', weekEnd: '2026-08-02', rank: 'C', rankBefore: 'B', completionPct: 0, reason: 'demoted' })
      );

      // Grace the later week first.
      await applyGraceToken(week2Id);
      let week2 = await db.rankHistory.get(week2Id);
      expect(week2?.reason).toBe('grace');

      // Then grace the earlier week — its cascade must preserve week2's grace.
      await applyGraceToken(week1Id);
      const week1 = await db.rankHistory.get(week1Id);
      week2 = await db.rankHistory.get(week2Id);

      expect(week1?.rank).toBe('A');
      expect(week1?.reason).toBe('grace');
      // week2 must still be graced, carried forward at the restored A rank —
      // not silently re-demoted back to B/'demoted'.
      expect(week2?.reason).toBe('grace');
      expect(week2?.rankBefore).toBe('A');
      expect(week2?.rank).toBe('A');

      const s = await getSettings();
      expect(s.graceTokensAvailable).toBe(0);
    });
  });
});
