import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, getSettings, getActiveCharacter, getAllCharacters, createCharacter, masterCharacter } from '../../db';
import { applyGraceToken, evaluateRankIfNeeded } from '../rankOrchestrator';
import { getAvailableNextCharacters, buildCharacterStatsSnapshot, masteryMomentSeen, markMasteryMomentSeen, computePeakRank } from '../characters';
import { characterArtSrc, characterHasArtwork, getRankTitle } from '@/lib/data/characterDefs';
import { RANK_ORDER } from '@/types';
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
    characterId: 1,
    ...overrides,
  };
}

describe('Character Prestige', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await getSettings(); // ensure a settings row exists before settings-mutating helpers run
  });

  describe('getActiveCharacter', () => {
    it('lazily seeds the Warrior character on a fresh install', async () => {
      const character = await getActiveCharacter();
      expect(character.slug).toBe('warrior');
      expect(character.status).toBe('active');
      expect(character.hasArtwork).toBe(true);

      const settings = await getSettings();
      expect(settings.activeCharacterId).toBe(character.id);

      // Idempotent — calling again returns the SAME character, not a second one.
      const again = await getActiveCharacter();
      expect(again.id).toBe(character.id);
      expect((await getAllCharacters()).length).toBe(1);
    });
  });

  describe('createCharacter', () => {
    it('starts a new character fresh and points activeCharacterId at it, without touching the previous one', async () => {
      const warrior = await getActiveCharacter();
      await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot([]));

      const mage = await createCharacter('mage');
      expect(mage.slug).toBe('mage');
      expect(mage.status).toBe('active');
      expect(mage.hasArtwork).toBe(false); // no art supplied yet

      const settings = await getSettings();
      expect(settings.activeCharacterId).toBe(mage.id);

      const active = await getActiveCharacter();
      expect(active.id).toBe(mage.id);

      // Warrior's row is untouched — still mastered, still there.
      const warriorRow = await db.characters.get(warrior.id!);
      expect(warriorRow?.status).toBe('mastered');
      expect(warriorRow?.finalRank).toBe('S');
    });

    it('rejects an unknown slug', async () => {
      await expect(createCharacter('nonexistent')).rejects.toThrow();
    });
  });

  describe('mastery moment gate', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
      };
    });

    it('gates the auto-presented moment per character, so it fires once and never nags', () => {
      expect(masteryMomentSeen(1)).toBe(false);
      markMasteryMomentSeen(1);
      expect(masteryMomentSeen(1)).toBe(true);
      // A different character gets its own moment.
      expect(masteryMomentSeen(2)).toBe(false);
    });

    it('reports not-seen when localStorage is unavailable (SSR/prerender safe)', () => {
      const saved = (globalThis as { localStorage?: unknown }).localStorage;
      delete (globalThis as { localStorage?: unknown }).localStorage;
      expect(() => masteryMomentSeen(1)).not.toThrow();
      expect(masteryMomentSeen(1)).toBe(false);
      expect(() => markMasteryMomentSeen(1)).not.toThrow();
      (globalThis as { localStorage?: unknown }).localStorage = saved;
    });
  });

  describe('getAvailableNextCharacters', () => {
    it('excludes slugs already used by past or current characters', () => {
      const available = getAvailableNextCharacters(['mage']);
      expect(available.map(d => d.slug)).not.toContain('mage');
      expect(available.map(d => d.slug)).toEqual(expect.arrayContaining(['samurai', 'ranger']));
    });
  });

  describe('rank-per-character scoping', () => {
    it('a fresh character never inherits history from a different character', async () => {
      const warrior = await getActiveCharacter();
      await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-06-01', weekEnd: '2026-06-07', rank: 'S', reason: 'promoted',
        completionPct: 90, characterId: warrior.id!,
      }));

      const mage = await createCharacter('mage');
      const mageHistory = await db.rankHistory.where('characterId').equals(mage.id!).toArray();
      const warriorHistory = await db.rankHistory.where('characterId').equals(warrior.id!).toArray();

      expect(mageHistory).toHaveLength(0);
      expect(warriorHistory).toHaveLength(1);
      expect(warriorHistory[0].rank).toBe('S');
    });

    it('a grace-token cascade on one character never touches another character\'s rows', async () => {
      const warrior = await getActiveCharacter();
      const mage = await createCharacter('mage');
      await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot([])); // warrior already mastered, unrelated to this check

      const warriorDemotedId = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-05-01', weekEnd: '2026-05-07', characterId: warrior.id!, reason: 'demoted' })
      );
      const mageWeekId = await db.rankHistory.add(
        makeRankRecord({ weekStart: '2026-08-03', weekEnd: '2026-08-09', characterId: mage.id!, rank: 'B', rankBefore: 'A', reason: 'demoted', completionPct: 20 })
      );

      await getSettings().then(s => s); // no-op, settings row already exists
      await db.settings.toCollection().first().then(s => s && db.settings.update(s.id!, { graceTokensAvailable: 1 }));

      await applyGraceToken(warriorDemotedId);

      const mageRecord = await db.rankHistory.get(mageWeekId);
      expect(mageRecord?.reason).toBe('demoted'); // untouched by Warrior's grace cascade
      expect(mageRecord?.rank).toBe('B');
    });
  });

  describe('mastery detection', () => {
    it('reaching S via a grace-unblocked promotion cascade masters the character, without auto-creating the next one', async () => {
      const character = await getActiveCharacter();
      const cid = character.id!;
      await db.settings.toCollection().first().then(s => s && db.settings.update(s.id!, { graceTokensAvailable: 1 }));

      // week1: a genuinely good week (counts toward the promotion streak).
      await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-01-05', weekEnd: '2026-01-11', characterId: cid,
        rank: 'A', rankBefore: 'A', completionPct: 85, reason: 'maintained',
      }));
      // week2: a bereavement week — wrongly demotes A -> B.
      const demotedId = await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-01-12', weekEnd: '2026-01-18', characterId: cid,
        rank: 'B', rankBefore: 'A', completionPct: 0, reason: 'demoted',
      }));
      // week3-5: three more good weeks, evaluated (at the time) against the wrong B rank.
      for (const weekStart of ['2026-01-19', '2026-01-26', '2026-02-02']) {
        await db.rankHistory.add(makeRankRecord({
          weekStart, weekEnd: weekStart, characterId: cid,
          rank: 'B', rankBefore: 'B', completionPct: 85, reason: 'maintained',
        }));
      }

      // Forgiving week2 restores A and lets the streak (week1 + week3-5 = 4 weeks
      // >=80%) cascade all the way to a promotion into S.
      await applyGraceToken(demotedId);

      const history = await db.rankHistory.where('characterId').equals(cid).toArray();
      const lastWeek = [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).at(-1);
      expect(lastWeek?.rank).toBe('S');
      expect(lastWeek?.reason).toBe('promoted');

      const masteredCharacter = await db.characters.get(cid);
      expect(masteredCharacter?.status).toBe('mastered');
      expect(masteredCharacter?.finalRank).toBe('S');
      expect(masteredCharacter?.finalStatsSnapshot).toBeDefined();
      expect(masteredCharacter?.finalStatsSnapshot?.promotions).toBeGreaterThanOrEqual(1);

      // No auto-created next character — activeCharacterId still points at the
      // now-mastered character until the user explicitly chooses one.
      const settings = await getSettings();
      expect(settings.activeCharacterId).toBe(cid);
      expect(await getAllCharacters()).toHaveLength(1);
    });
  });

  describe('character artwork resolution', () => {
    it('resolves each character to its own art directory, keeping Warrior on its legacy paths', () => {
      expect(characterArtSrc('warrior', 'S')).toBe('/s-rank.png');
      expect(characterArtSrc('samurai', 'S')).toBe('/characters/samurai/s.png');
      expect(characterArtSrc('mage', 'E')).toBe('/characters/mage/e.png');
    });

    it('lowercases the rank so a Rank value maps to the on-disk filename', () => {
      expect(RANK_ORDER.map(r => characterArtSrc('samurai', r))).toEqual([
        '/characters/samurai/e.png',
        '/characters/samurai/d.png',
        '/characters/samurai/c.png',
        '/characters/samurai/b.png',
        '/characters/samurai/a.png',
        '/characters/samurai/s.png',
      ]);
    });

    it('reads art availability from config, so supplying art later covers already-created characters', async () => {
      // Samurai rows created before its art existed were stamped hasArtwork: false;
      // display must follow the def, not that stale column.
      const stale = { slug: 'samurai', hasArtwork: false } as const;
      expect(stale.hasArtwork).toBe(false);
      expect(characterHasArtwork('samurai')).toBe(true);

      expect(characterHasArtwork('warrior')).toBe(true);
      expect(characterHasArtwork('mage')).toBe(false);
      expect(characterHasArtwork('nonexistent')).toBe(false);
    });
  });

  describe('rank titles', () => {
    it('gives each character its own ladder instead of one shared Hunter set', () => {
      expect(RANK_ORDER.map(r => getRankTitle('samurai', r)))
        .toEqual(['Rōnin', 'Ashigaru', 'Bushi', 'Hatamoto', 'Kensei', 'Shōgun']);
      expect(RANK_ORDER.map(r => getRankTitle('warrior', r)))
        .toEqual(['Novice', 'Squire', 'Warrior', 'Veteran', 'Champion', 'Warlord']);
      expect(getRankTitle('mage', 'S')).toBe('Archmage');
      expect(getRankTitle('ranger', 'E')).toBe('Tracker');
    });

    it('defines a distinct, non-empty title for every rank of every character', () => {
      for (const slug of ['warrior', 'mage', 'samurai', 'ranger']) {
        const titles = RANK_ORDER.map(r => getRankTitle(slug, r));
        expect(titles.every(t => t.length > 0)).toBe(true);
        expect(new Set(titles).size).toBe(RANK_ORDER.length); // no repeats within a ladder
      }
    });

    it('falls back to a real word for an unknown slug rather than rendering blank', () => {
      expect(getRankTitle('nonexistent', 'S')).toBe('Warlord');
    });
  });

  describe('computePeakRank', () => {
    it('survives a prestige reset — an E-rank current character keeps the lifetime S', async () => {
      const warrior = await getActiveCharacter();
      await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-07-06', characterId: warrior.id, rank: 'S', reason: 'promoted', completionPct: 90,
      }));
      await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot([]));
      const mage = await createCharacter('mage');
      await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-09-07', characterId: mage.id, rank: 'E', rankBefore: 'E', reason: 'maintained', completionPct: 70,
      }));

      const peak = computePeakRank(await db.rankHistory.toArray(), await getAllCharacters());
      expect(peak).toBe('S');
    });

    it('still reports a mastered finalRank even if that character owns no rank rows', () => {
      const peak = computePeakRank([], [
        { id: 1, slug: 'warrior', name: 'Warrior', icon: '⚔️', hasArtwork: true, status: 'mastered', startedAt: 1, finalRank: 'S' },
      ]);
      expect(peak).toBe('S');
    });

    it('defaults to E with no data, and never reports below the highest row', () => {
      expect(computePeakRank([], [])).toBe('E');
      expect(computePeakRank([
        makeRankRecord({ rank: 'C' }),
        makeRankRecord({ rank: 'A' }),
        makeRankRecord({ rank: 'D' }),
      ])).toBe('A');
    });
  });

  describe('mastered characters stay frozen', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
      };
    });

    it('no new rank weeks accrue while mastered, however many app loads pass', async () => {
      const character = await getActiveCharacter();
      await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-07-06', weekEnd: '2026-07-12', characterId: character.id,
        rank: 'S', rankBefore: 'A', completionPct: 90, reason: 'promoted',
      }));
      await masterCharacter(character.id!, 'S', buildCharacterStatsSnapshot([]));

      const before = await db.rankHistory.toArray();

      // Several weeks of app loads well past the last recorded week.
      for (const day of ['2026-07-20', '2026-08-03', '2026-08-17', '2026-09-07']) {
        await evaluateRankIfNeeded(day);
      }

      expect(await db.rankHistory.toArray()).toEqual(before);
      const after = await db.characters.get(character.id!);
      expect(after?.status).toBe('mastered');
      expect(after?.finalRank).toBe('S');
    });

    it('a grace token cannot rewrite a mastered ladder or desync its snapshot', async () => {
      const character = await getActiveCharacter();
      const demotedId = await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-06-01', weekEnd: '2026-06-07', characterId: character.id,
        rank: 'B', rankBefore: 'A', completionPct: 20, reason: 'demoted',
      }));
      await masterCharacter(character.id!, 'S', buildCharacterStatsSnapshot([]));
      await db.settings.toCollection().first().then(s => s && db.settings.update(s.id!, { graceTokensAvailable: 2 }));

      await applyGraceToken(demotedId);

      // Row untouched, and the token was not spent.
      const row = await db.rankHistory.get(demotedId);
      expect(row?.reason).toBe('demoted');
      expect(row?.rank).toBe('B');
      expect((await getSettings()).graceTokensAvailable).toBe(2);
    });

    it('starting the next character leaves the mastered one byte-for-byte unchanged', async () => {
      const warrior = await getActiveCharacter();
      await db.rankHistory.add(makeRankRecord({
        weekStart: '2026-07-06', weekEnd: '2026-07-12', characterId: warrior.id,
        rank: 'S', rankBefore: 'A', completionPct: 90, reason: 'promoted',
      }));
      await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot(
        await db.rankHistory.where('characterId').equals(warrior.id!).toArray()
      ));

      const frozenCharacter = await db.characters.get(warrior.id!);
      const frozenHistory = await db.rankHistory.where('characterId').equals(warrior.id!).toArray();

      const mage = await createCharacter('mage');
      await evaluateRankIfNeeded('2026-09-07'); // let the new character accrue weeks

      expect(await db.characters.get(warrior.id!)).toEqual(frozenCharacter);
      expect(await db.rankHistory.where('characterId').equals(warrior.id!).toArray()).toEqual(frozenHistory);
      // The new character starts its own ladder at E, separate from Warrior's.
      const mageRows = await db.rankHistory.where('characterId').equals(mage.id!).toArray();
      expect(mageRows.every(r => r.rank === 'E')).toBe(true);
    });
  });

  describe('lifetime stats remain untouched by a character reset', () => {
    it('Vault, Atlas, discipline, and log tables are unaffected by mastering + creating a character', async () => {
      await db.knowledgeDomains.put({ id: 'd1', name: 'Domain', icon: '📘', color: '#60a5fa', createdAt: 1 });
      await db.knowledgeConcepts.put({
        id: 'c1', title: 'Concept', summary: 's', primaryDomainId: 'd1', tags: [],
        relatedConceptIds: [], sourceType: 'book', retentionScore: 50, reviewCount: 0,
        reviewIntervalDays: 1, nextReviewAt: 0, createdAt: 1, updatedAt: 1,
      });
      await db.atlasCountries.put({ atlasId: 'tur', iso3: 'TUR', name: 'Türkiye', summary: 's', snapshot: {} as never, geography: {} as never, updatedAt: 1 } as never);
      await db.disciplineStreaks.put({ id: 'strk1', name: 'Streak', status: 'active', createdAt: 1 } as never);
      await db.agiLogs.add({ date: '2026-01-01', minutes: 10, activityType: 'Rowing', completed: true, createdAt: 1 });

      const before = {
        domains: await db.knowledgeDomains.toArray(),
        concepts: await db.knowledgeConcepts.toArray(),
        atlas: await db.atlasCountries.toArray(),
        disciplines: await db.disciplineStreaks.toArray(),
        agi: await db.agiLogs.toArray(),
      };

      const warrior = await getActiveCharacter();
      await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot([]));
      await createCharacter('mage');

      const after = {
        domains: await db.knowledgeDomains.toArray(),
        concepts: await db.knowledgeConcepts.toArray(),
        atlas: await db.atlasCountries.toArray(),
        disciplines: await db.disciplineStreaks.toArray(),
        agi: await db.agiLogs.toArray(),
      };

      expect(after).toEqual(before);
    });
  });
});
