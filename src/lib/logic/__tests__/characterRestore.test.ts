import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, getSettings, getActiveCharacter, reconcileCharacterLinkage, repairCharacterStartDates, createCharacter, masterCharacter } from '../../db';
import { buildCharacterStatsSnapshot } from '../characters';
import { evaluateRankIfNeeded } from '../rankOrchestrator';
import type { RankRecord, UserSettings } from '@/types';

/** A pre-v11 rankHistory row exactly as it appears in an old backup JSON:
 *  no `characterId` field at all. */
function preV11RankRow(overrides: Partial<RankRecord> = {}): RankRecord {
  return {
    rank: 'S',
    rankBefore: 'A',
    weekStart: '2026-07-06',
    weekEnd: '2026-07-12',
    completionPct: 88,
    reason: 'promoted',
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as RankRecord;
}

/** A pre-v11 settings row: no `activeCharacterId`. */
function preV11Settings(): UserSettings {
  return {
    id: 1,
    readingPagesPerDay: 20,
    learningMinutesPerDay: 20,
    courseUnitsPerDay: 4,
    lessonsPerDay: 2,
    quranPagesPerDay: 1,
    proteinGoalGrams: 130,
    hydrationGoalLiters: 2,
    agiActivityType: 'Rowing',
    agiMinMinutes: 10,
    strUpperIncrement: 5,
    strLowerIncrement: 10,
    firstUseDate: '2026-02-28',
  };
}

/** Mirrors the clear+bulkPut restore in app/settings/page.tsx for the tables
 *  that matter here. Deliberately does NOT touch `characters` — that is the gap
 *  under test. */
async function simulateLegacyRestore(rankRows: RankRecord[], settingsRow: UserSettings) {
  await db.rankHistory.clear();
  await db.rankHistory.bulkPut(rankRows);
  await db.settings.clear();
  await db.settings.bulkPut([settingsRow]);
}

describe('restoring a pre-v11 backup (repro)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('leaves rank history orphaned and silently strands the user on a fresh E ladder', async () => {
    // Simulate the real sequence: app already migrated to v11 (Warrior seeded,
    // activeCharacterId set), then the user restores an OLD backup.
    const seeded = await getActiveCharacter();
    expect(seeded.slug).toBe('warrior');

    await simulateLegacyRestore([preV11RankRow()], preV11Settings());

    // 1. Rank rows come back with NO characterId.
    const restored = await db.rankHistory.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].rank).toBe('S');
    expect(restored[0].characterId).toBeUndefined();

    // 2. The restored settings row wiped activeCharacterId.
    const settings = await getSettings();
    expect(settings.activeCharacterId).toBeUndefined();

    // 3. getActiveCharacter() therefore lazily seeds a SECOND Warrior whose id
    //    no rank row references — two Warriors now exist.
    const active = await getActiveCharacter();
    expect(active.id).not.toBe(seeded.id);
    expect(await db.characters.count()).toBe(2);

    // 4. Net effect: the character-scoped query finds nothing → fresh E ladder,
    //    even though an S-rank week is sitting right there in the table.
    const scoped = await db.rankHistory.where('characterId').equals(active.id!).toArray();
    expect(scoped).toHaveLength(0);
  });
});

describe('reconcileCharacterLinkage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('re-links orphaned rank history and removes the duplicate stray character', async () => {
    const original = await getActiveCharacter();
    await simulateLegacyRestore([preV11RankRow()], preV11Settings());
    const stray = await getActiveCharacter(); // reproduces the duplicate
    expect(await db.characters.count()).toBe(2);

    await reconcileCharacterLinkage();

    // The stray (which owned no history) is gone; the original survives.
    expect(await db.characters.count()).toBe(1);
    const survivor = (await db.characters.toArray())[0];
    expect(survivor.id).toBe(original.id);
    expect(survivor.id).not.toBe(stray.id);

    // History is attributed to the survivor, and the pointer agrees.
    const rows = await db.rankHistory.toArray();
    expect(rows[0].characterId).toBe(survivor.id);
    expect((await getSettings()).activeCharacterId).toBe(survivor.id);

    // The S-rank week is now visible to the character-scoped query.
    const scoped = await db.rankHistory.where('characterId').equals(survivor.id!).toArray();
    expect(scoped).toHaveLength(1);
    expect(scoped[0].rank).toBe('S');
  });

  it('seeds a Warrior anchored to firstUseDate when no character row survives the restore', async () => {
    // Mirrors the fixed restore path: `characters` is cleared, and a pre-v11
    // backup has no rows to put back.
    await db.characters.clear();
    await simulateLegacyRestore([preV11RankRow()], preV11Settings());

    await reconcileCharacterLinkage();

    const characters = await db.characters.toArray();
    expect(characters).toHaveLength(1);
    expect(characters[0].slug).toBe('warrior');
    expect(characters[0].status).toBe('active');
    // Anchored to the restored firstUseDate, not "now" — the orchestrator's
    // mid-week fairness check keys off startedAt.
    expect(characters[0].startedAt).toBe(new Date('2026-02-28T12:00:00').getTime());
    expect((await db.rankHistory.toArray())[0].characterId).toBe(characters[0].id);
  });

  it('is a no-op on a healthy post-v11 install', async () => {
    const character = await getActiveCharacter();
    await db.rankHistory.add(preV11RankRow({ characterId: character.id }));

    const charsBefore = await db.characters.toArray();
    const rowsBefore = await db.rankHistory.toArray();
    const settingsBefore = await getSettings();

    await reconcileCharacterLinkage();

    expect(await db.characters.toArray()).toEqual(charsBefore);
    expect(await db.rankHistory.toArray()).toEqual(rowsBefore);
    expect((await getSettings()).activeCharacterId).toBe(settingsBefore.activeCharacterId);
  });

  it('never deletes a duplicate active character that owns real history', async () => {
    const first = await getActiveCharacter();
    const second = await createCharacter('mage');
    // Both active (an invalid state), but both own history — neither may be dropped.
    await db.rankHistory.add(preV11RankRow({ weekStart: '2026-03-02', characterId: first.id }));
    await db.rankHistory.add(preV11RankRow({ weekStart: '2026-03-09', characterId: second.id }));
    await db.rankHistory.add(preV11RankRow({ weekStart: '2026-03-16' })); // orphan, forces a repair pass

    await reconcileCharacterLinkage();

    const ids = (await db.characters.toArray()).map(c => c.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
  });

  it('preserves mastered characters restored from a post-v11 backup', async () => {
    const warrior = await getActiveCharacter();
    await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot([]));
    const mage = await createCharacter('mage');
    await db.rankHistory.add(preV11RankRow({ characterId: mage.id }));

    await reconcileCharacterLinkage();

    const warriorRow = await db.characters.get(warrior.id!);
    expect(warriorRow?.status).toBe('mastered');
    expect(warriorRow?.finalRank).toBe('S');
    expect((await getSettings()).activeCharacterId).toBe(mage.id);
  });
});

describe('repairCharacterStartDates', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('corrects a start date left stale by a restore that swapped in older settings', async () => {
    // Reproduces the real case: the pre-restore install had firstUseDate 2026-05-03,
    // so Warrior was seeded with that. The restore then brought back the REAL
    // settings (firstUseDate 2026-02-28) plus history going back to March — leaving
    // Warrior claiming to have started months after history it owns.
    const staleStart = new Date('2026-05-03T12:00:00').getTime();
    const warriorId = await db.characters.add({
      slug: 'warrior', name: 'Warrior', icon: '⚔️', hasArtwork: true,
      status: 'active', startedAt: staleStart,
    });
    await db.rankHistory.bulkPut([
      preV11RankRow({ weekStart: '2026-03-02', weekEnd: '2026-03-08', characterId: warriorId }),
      preV11RankRow({ weekStart: '2026-07-06', weekEnd: '2026-07-12', characterId: warriorId }),
    ]);
    await db.settings.clear();
    await db.settings.bulkPut([preV11Settings()]); // firstUseDate 2026-02-28

    // Linkage is already perfectly consistent here — reconcile early-returns and
    // would never touch startedAt, which is why this is a separate pass.
    await reconcileCharacterLinkage();
    expect((await db.characters.get(warriorId))?.startedAt).toBe(staleStart);

    await repairCharacterStartDates();

    // Clamped to firstUseDate (Feb 28), which precedes even the earliest rank week.
    expect((await db.characters.get(warriorId))?.startedAt)
      .toBe(new Date('2026-02-28T12:00:00').getTime());
  });

  it('clamps to the earliest owned rank week when that precedes firstUseDate', async () => {
    const warriorId = await db.characters.add({
      slug: 'warrior', name: 'Warrior', icon: '⚔️', hasArtwork: true,
      status: 'active', startedAt: new Date('2026-06-01T12:00:00').getTime(),
    });
    await db.rankHistory.put(preV11RankRow({ weekStart: '2026-01-05', characterId: warriorId }));
    await db.settings.clear();
    await db.settings.bulkPut([preV11Settings()]); // firstUseDate 2026-02-28

    await repairCharacterStartDates();

    expect((await db.characters.get(warriorId))?.startedAt)
      .toBe(new Date('2026-01-05T12:00:00').getTime());
  });

  it('never pushes a start date later, and leaves correct ones alone', async () => {
    const correct = new Date('2026-02-28T12:00:00').getTime();
    const warriorId = await db.characters.add({
      slug: 'warrior', name: 'Warrior', icon: '⚔️', hasArtwork: true,
      status: 'active', startedAt: correct,
    });
    await db.rankHistory.put(preV11RankRow({ weekStart: '2026-07-06', characterId: warriorId }));
    await db.settings.clear();
    await db.settings.bulkPut([preV11Settings()]);

    await repairCharacterStartDates();

    expect((await db.characters.get(warriorId))?.startedAt).toBe(correct);
  });

  it('does not clamp a later character to the app-wide firstUseDate', async () => {
    // Mage legitimately starts long after the app did — only the starter character
    // is bounded by firstUseDate.
    const warrior = await getActiveCharacter();
    await masterCharacter(warrior.id!, 'S', buildCharacterStatsSnapshot([]));
    const mage = await createCharacter('mage');
    const mageStart = (await db.characters.get(mage.id!))!.startedAt;
    await db.rankHistory.put(preV11RankRow({ weekStart: '2026-09-07', characterId: mage.id }));

    await repairCharacterStartDates();

    expect((await db.characters.get(mage.id!))?.startedAt).toBe(mageStart);
  });
});

describe('mastery detection after a restore', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    // evaluateRankIfNeeded runs the legacy one-shot repair helpers, which gate on
    // localStorage. Not available in the node test env — stub it per test so each
    // run starts with the repairs "not yet done".
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  });

  it('masters a character whose restored history already ends at S, with no new week evaluated', async () => {
    await db.characters.clear();
    // An S-rank history restored for a week that is already evaluated, so the
    // weekly-evaluation path early-returns and never reaches its own mastery check.
    await simulateLegacyRestore([preV11RankRow({ weekStart: '2026-07-06' })], preV11Settings());
    await reconcileCharacterLinkage();

    const before = await db.characters.toArray();
    expect(before[0].status).toBe('active');

    // 2026-07-13 is the Monday after the restored week — that week is already
    // present in rankHistory, so evaluationDecision() returns null.
    await evaluateRankIfNeeded('2026-07-15');

    const after = await db.characters.toArray();
    expect(after[0].status).toBe('mastered');
    expect(after[0].finalRank).toBe('S');
    expect(after[0].finalStatsSnapshot).toBeDefined();
    // Still no auto-created next character — the user picks it.
    expect(after).toHaveLength(1);
  });
});
