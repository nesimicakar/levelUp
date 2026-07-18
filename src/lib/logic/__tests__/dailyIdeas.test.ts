import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { LevelUpDB } from '../../db';
import {
  detectIdeaBankFormat,
  parseIdeaBank,
  validateIdeaBank,
  selectExpressionState,
  IDEA_BANK_TYPE,
} from '../expressions';
import type { UserSettings, ExpressionCompletion } from '@/types';

// A well-formed structured bank used across several tests.
const structuredBank = JSON.stringify({
  type: IDEA_BANK_TYPE,
  version: 1,
  ideas: [
    {
      id: 'pyrrhic-victory',
      title: 'Pyrrhic Victory',
      category: 'History',
      topic: 'Ancient Greece',
      meaning: 'A victory so costly that it is almost equivalent to defeat.',
      context: 'From King Pyrrhus, who beat the Romans at ruinous cost.',
      example: 'Winning the lawsuit became a Pyrrhic victory after the legal costs.',
      takeaway: 'Winning and succeeding are not always the same thing.',
    },
    {
      id: 'occams-razor',
      title: "Occam's Razor",
      category: 'Philosophy',
      meaning: 'The simplest explanation is usually the best.',
    },
  ],
});

const legacyBank = [
  'Pyrrhic Victory | Roman History | A victory so costly it is almost a defeat.',
  'Carpe Diem | Latin | Seize the day.',
  'A witty remark | Oscar Wilde | Attributed wit.',
].join('\n');

describe('detectIdeaBankFormat', () => {
  it('detects structured, legacy, and empty', () => {
    expect(detectIdeaBankFormat(structuredBank)).toBe('structured');
    expect(detectIdeaBankFormat(legacyBank)).toBe('legacy');
    expect(detectIdeaBankFormat('')).toBe('empty');
    expect(detectIdeaBankFormat('   \n  ')).toBe('empty');
    expect(detectIdeaBankFormat('  {"ideas":[]}')).toBe('structured');
  });
});

describe('parseIdeaBank — structured', () => {
  it('normalizes all supported fields and preserves explicit id', () => {
    const ideas = parseIdeaBank(structuredBank);
    expect(ideas).toHaveLength(2);
    const [a, b] = ideas;
    expect(a).toMatchObject({
      index: 0,
      id: 'pyrrhic-victory',
      title: 'Pyrrhic Victory',
      category: 'history', // resolved key from explicit "History"
      topic: 'Ancient Greece',
      meaning: 'A victory so costly that it is almost equivalent to defeat.',
      context: 'From King Pyrrhus, who beat the Romans at ruinous cost.',
      example: 'Winning the lawsuit became a Pyrrhic victory after the legal costs.',
      takeaway: 'Winning and succeeding are not always the same thing.',
    });
    expect(b).toMatchObject({ index: 1, id: 'occams-razor', category: 'philosophy' });
    // Optional fields absent → undefined, not empty string
    expect(b.topic).toBeUndefined();
    expect(b.context).toBeUndefined();
  });

  it('uses valid explicit category (resolved to key)', () => {
    const ideas = parseIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [{ id: 'x', title: 'X', category: 'Science', meaning: 'm' }],
    }));
    expect(ideas[0].category).toBe('science');
  });

  it('NEVER overrides a valid explicit category via keyword inference', () => {
    // topic is full of History keywords, but explicit category is Science.
    const ideas = parseIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [{ id: 'x', title: 'X', category: 'Science', topic: 'Roman History Ancient Greece', meaning: 'm' }],
    }));
    expect(ideas[0].category).toBe('science');
  });

  it('falls back to topic inference when category is invalid, else Other', () => {
    const ideas = parseIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [
        { id: 'a', title: 'A', category: 'Sportsball', topic: 'Ancient Greece', meaning: 'm' }, // invalid → infer 'history'
        { id: 'b', title: 'B', category: 'Sportsball', topic: 'nonsense-xyz', meaning: 'm' },     // invalid, no match → 'other'
      ],
    }));
    expect(ideas[0].category).toBe('history');
    expect(ideas[1].category).toBe('other');
  });

  it('returns [] for malformed JSON (resilient consumption)', () => {
    expect(parseIdeaBank('{ not valid json ')).toEqual([]);
  });

  it('preserves array position as index even for entries missing fields', () => {
    const ideas = parseIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [
        { id: 'a', title: 'A', category: 'History', meaning: 'm' },
        { id: 'b' }, // incomplete, still occupies index 1
        { id: 'c', title: 'C', category: 'Science', meaning: 'm' },
      ],
    }));
    expect(ideas.map(i => i.index)).toEqual([0, 1, 2]);
    expect(ideas[2].id).toBe('c');
  });
});

describe('parseIdeaBank — legacy', () => {
  it('maps idea→title, source→topic/source, meaning unchanged', () => {
    const ideas = parseIdeaBank(legacyBank);
    expect(ideas).toHaveLength(3);
    expect(ideas[0]).toMatchObject({
      index: 0,
      id: 'legacy-0',
      title: 'Pyrrhic Victory',
      topic: 'Roman History',
      source: 'Roman History',
      meaning: 'A victory so costly it is almost a defeat.',
    });
  });

  it('infers category from the source field (legacy fallback)', () => {
    const ideas = parseIdeaBank(legacyBank);
    expect(ideas[0].category).toBe('history');    // "Roman History"
    expect(ideas[1].category).toBe('language');   // "Latin"
    expect(ideas[2].category).toBe('literature'); // "Oscar Wilde"
  });

  it('preserves original index assignment (completion compatibility)', () => {
    // Byte-for-byte identical indices to the pre-refactor parser: index is the
    // position among pipe-containing lines, and empty-title entries are dropped.
    const bank = [
      'First | Science | one',
      '   ',                       // blank line — ignored
      ' | Culture | no title',     // no title — dropped, but consumes an index slot
      'Third | Business | three',
    ].join('\n');
    const ideas = parseIdeaBank(bank);
    expect(ideas.map(i => i.title)).toEqual(['First', 'Third']);
    expect(ideas.map(i => i.index)).toEqual([0, 2]); // slot 1 dropped (empty title)
  });
});

describe('validateIdeaBank', () => {
  it('empty bank is valid with zero count', () => {
    expect(validateIdeaBank('')).toEqual({ format: 'empty', valid: true, count: 0, errors: [] });
  });

  it('legacy bank is lenient and reports its count', () => {
    const v = validateIdeaBank(legacyBank);
    expect(v.format).toBe('legacy');
    expect(v.valid).toBe(true);
    expect(v.count).toBe(3);
    expect(v.errors).toEqual([]);
  });

  it('accepts a well-formed structured bank', () => {
    const v = validateIdeaBank(structuredBank);
    expect(v).toMatchObject({ format: 'structured', valid: true, count: 2 });
    expect(v.errors).toEqual([]);
  });

  it('reports malformed JSON', () => {
    const v = validateIdeaBank('{ bad json');
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/Malformed JSON/);
  });

  it('reports incorrect type and unsupported version', () => {
    const v = validateIdeaBank(JSON.stringify({ type: 'wrong', version: 2, ideas: [] }));
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => /Incorrect "type"/.test(e))).toBe(true);
    expect(v.errors.some(e => /Unsupported "version"/.test(e))).toBe(true);
  });

  it('reports missing ideas array', () => {
    const v = validateIdeaBank(JSON.stringify({ type: IDEA_BANK_TYPE, version: 1 }));
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => /Missing or invalid "ideas" array/.test(e))).toBe(true);
  });

  it('reports non-object entries', () => {
    const v = validateIdeaBank(JSON.stringify({ type: IDEA_BANK_TYPE, version: 1, ideas: ['nope', 42] }));
    expect(v.errors.some(e => /not an object/.test(e))).toBe(true);
    expect(v.count).toBe(0);
  });

  it('reports missing/empty required fields without discarding others', () => {
    const v = validateIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [
        { id: 'ok', title: 'Ok', category: 'History', meaning: 'm' }, // valid
        { title: 'NoId', category: 'History', meaning: 'm' },          // missing id
        { id: '', title: 'EmptyId', category: 'History', meaning: 'm' }, // empty id
        { id: 'noTitle', category: 'History', meaning: 'm' },           // missing title
        { id: 'noMeaning', title: 'T', category: 'History' },          // missing meaning
      ],
    }));
    expect(v.valid).toBe(false);
    expect(v.count).toBe(1); // only the first is fully valid
    expect(v.errors.some(e => /missing "id"/.test(e))).toBe(true);
    expect(v.errors.some(e => /empty "id"/.test(e))).toBe(true);
    expect(v.errors.some(e => /missing "title"/.test(e))).toBe(true);
    expect(v.errors.some(e => /missing "meaning"/.test(e))).toBe(true);
  });

  it('reports invalid categories', () => {
    const v = validateIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [{ id: 'a', title: 'A', category: 'Sportsball', meaning: 'm' }],
    }));
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => /invalid category "Sportsball"/.test(e))).toBe(true);
  });

  it('reports duplicate ids', () => {
    const v = validateIdeaBank(JSON.stringify({
      type: IDEA_BANK_TYPE, version: 1,
      ideas: [
        { id: 'dup', title: 'A', category: 'History', meaning: 'm' },
        { id: 'dup', title: 'B', category: 'Science', meaning: 'm' },
      ],
    }));
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => /duplicate id "dup"/.test(e))).toBe(true);
    expect(v.count).toBe(1);
  });
});

describe('selectExpressionState — id-based scheduling', () => {
  const base: Pick<UserSettings, 'enableDailyExpressions' | 'expressionBank' | 'expressionCompletions'> = {
    enableDailyExpressions: true,
    expressionBank: structuredBank,
    expressionCompletions: [],
  };

  it('returns [] when disabled', () => {
    const s = selectExpressionState({ ...base, enableDailyExpressions: false }, '2026-07-17');
    expect(s.expressions).toEqual([]);
    expect(s.currentIndex).toBe(-1);
  });

  it('selects the first unread idea', () => {
    const s = selectExpressionState(base, '2026-07-17');
    expect(s.currentIndex).toBe(0);
    expect(s.currentExpression?.id).toBe('pyrrhic-victory');
  });

  it('skips ideas already completed by ideaId', () => {
    const completions: ExpressionCompletion[] = [
      { index: 0, ideaId: 'pyrrhic-victory', date: '2026-07-16', completedAt: 1, status: 'read' },
    ];
    const s = selectExpressionState({ ...base, expressionCompletions: completions }, '2026-07-17');
    expect(s.currentIndex).toBe(1);
    expect(s.currentExpression?.id).toBe('occams-razor');
    expect(s.todayRead).toBe(false); // completed yesterday, not today
  });

  it('ignores legacy completions without an ideaId (manual-reset path)', () => {
    // A record with only a positional index no longer marks anything complete.
    const completions: ExpressionCompletion[] = [
      { index: 0, date: '2026-07-16', completedAt: 1, status: 'read' },
    ];
    const s = selectExpressionState({ ...base, expressionCompletions: completions }, '2026-07-17');
    expect(s.currentIndex).toBe(0);
    expect(s.currentExpression?.id).toBe('pyrrhic-victory');
  });

  it('todayRead counts read/legacy-undefined but not known', () => {
    const known: ExpressionCompletion[] = [{ index: 0, date: '2026-07-17', completedAt: 1, status: 'known' }];
    expect(selectExpressionState({ ...base, expressionCompletions: known }, '2026-07-17').todayRead).toBe(false);
    const read: ExpressionCompletion[] = [{ index: 0, date: '2026-07-17', completedAt: 1, status: 'read' }];
    expect(selectExpressionState({ ...base, expressionCompletions: read }, '2026-07-17').todayRead).toBe(true);
  });
});

describe('id-based attribution — reorder / insert / removed', () => {
  const bankOrder = (ids: string[]) => JSON.stringify({
    type: IDEA_BANK_TYPE, version: 1,
    ideas: ids.map(id => ({ id, title: id, category: 'History', meaning: `${id} meaning` })),
  });

  it('reordering the bank does not change what is considered complete', () => {
    // Completed "b" by id. Whatever order the bank is in, "b" stays complete.
    const completions: ExpressionCompletion[] = [
      { index: 1, ideaId: 'b', date: '2026-07-16', completedAt: 1, status: 'read' },
    ];
    const original = selectExpressionState(
      { enableDailyExpressions: true, expressionBank: bankOrder(['a', 'b', 'c']), expressionCompletions: completions },
      '2026-07-17',
    );
    expect(original.currentExpression?.id).toBe('a'); // first unread

    // Now reorder: b moves to the front. Attribution must follow the id, not the slot.
    const reordered = selectExpressionState(
      { enableDailyExpressions: true, expressionBank: bankOrder(['b', 'c', 'a']), expressionCompletions: completions },
      '2026-07-17',
    );
    // b is still complete; first unread is now 'c' (position 1).
    expect(reordered.currentExpression?.id).toBe('c');
    expect(reordered.expressions.find(i => i.id === 'b')).toBeDefined();
  });

  it('inserting a new idea does not misattribute an existing completion', () => {
    const completions: ExpressionCompletion[] = [
      { index: 0, ideaId: 'a', date: '2026-07-16', completedAt: 1, status: 'read' },
    ];
    // Insert 'z' at the front — 'a' shifts to index 1 but stays complete.
    const s = selectExpressionState(
      { enableDailyExpressions: true, expressionBank: bankOrder(['z', 'a', 'b']), expressionCompletions: completions },
      '2026-07-17',
    );
    expect(s.currentExpression?.id).toBe('z'); // the newly inserted, unread idea
    // 'a' must NOT be re-served just because index 0 is now a different idea.
    const completedIds = new Set(completions.map(c => c.ideaId));
    expect(completedIds.has(s.currentExpression?.id ?? '')).toBe(false);
  });

  it('a completion whose idea id no longer exists is preserved (removed state)', () => {
    const completions: ExpressionCompletion[] = [
      { index: 0, ideaId: 'gone', date: '2026-07-16', completedAt: 1, status: 'known' },
      { index: 1, ideaId: 'a', date: '2026-07-16', completedAt: 2, status: 'read' },
    ];
    const s = selectExpressionState(
      { enableDailyExpressions: true, expressionBank: bankOrder(['a', 'b']), expressionCompletions: completions },
      '2026-07-17',
    );
    // The removed completion is not lost — it still lives in the completions list…
    expect(s.completions).toHaveLength(2);
    // …but resolves to no current idea (component renders the removed-item state).
    const ideaById = new Map(s.expressions.map(i => [i.id, i]));
    expect(ideaById.get('gone')).toBeUndefined();
    // and does not block selection of remaining unread ideas.
    expect(s.currentExpression?.id).toBe('b');
  });
});

describe('reset scope', () => {
  it('clearing completions leaves the bank and other data untouched', () => {
    // Mirrors the Settings reset: expressionCompletions -> [], nothing else changes.
    const settings: Pick<UserSettings, 'enableDailyExpressions' | 'expressionBank' | 'expressionCompletions'> = {
      enableDailyExpressions: true,
      expressionBank: structuredBank,
      expressionCompletions: [
        { index: 0, ideaId: 'pyrrhic-victory', date: '2026-07-17', completedAt: 1, status: 'read' },
      ],
    };
    const reset = { ...settings, expressionCompletions: [] };
    expect(reset.expressionBank).toBe(structuredBank);   // bank unchanged
    expect(reset.enableDailyExpressions).toBe(true);     // feature still enabled
    const s = selectExpressionState(reset, '2026-07-17');
    expect(s.expressions).toHaveLength(2);               // ideas still present
    expect(s.currentExpression?.id).toBe('pyrrhic-victory'); // everything unread again
  });
});

describe('settings persistence + import/export round-trips', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
  });

  const minimalSettings = (bank: string, completions: ExpressionCompletion[]): UserSettings => ({
    readingPagesPerDay: 20, learningMinutesPerDay: 20, courseUnitsPerDay: 4, lessonsPerDay: 2,
    quranPagesPerDay: 1, proteinGoalGrams: 130, hydrationGoalLiters: 2, agiActivityType: 'Rowing',
    agiMinMinutes: 10, strUpperIncrement: 5, strLowerIncrement: 10,
    enableDailyExpressions: true, expressionBank: bank, expressionCompletions: completions,
  });

  it('structured bank + completions (incl. ideaId) survive a settings write/read', async () => {
    const completions: ExpressionCompletion[] = [
      { index: 0, ideaId: 'pyrrhic-victory', date: '2026-07-17', completedAt: 1, status: 'read' },
    ];
    await db.settings.add(minimalSettings(structuredBank, completions));
    const read = await db.settings.toCollection().first();
    expect(read?.expressionBank).toBe(structuredBank);
    expect(read?.expressionCompletions).toEqual(completions);
    expect(read?.expressionCompletions?.[0].ideaId).toBe('pyrrhic-victory');
    // All structured fields recoverable by re-parsing the stored string.
    const ideas = parseIdeaBank(read!.expressionBank!);
    expect(ideas[0]).toMatchObject({
      id: 'pyrrhic-victory', title: 'Pyrrhic Victory', category: 'history',
      topic: 'Ancient Greece', context: expect.any(String), example: expect.any(String), takeaway: expect.any(String),
    });
  });

  it('round-trips through a JSON export/import cycle unchanged (ideaId preserved)', async () => {
    const completions: ExpressionCompletion[] = [
      { index: 1, ideaId: 'occams-razor', date: '2026-07-17', completedAt: 2, status: 'known' },
    ];
    await db.settings.add(minimalSettings(structuredBank, completions));

    // Export: serialize the settings table exactly as the backup does.
    const settingsArr = await db.settings.toArray();
    const backup = { exportedAt: 'x', tables: { settings: settingsArr } };
    const serialized = JSON.stringify(backup);

    // Import: parse and restore into a fresh DB.
    const parsed = JSON.parse(serialized);
    const db2 = new LevelUpDB();
    await db2.delete();
    const db3 = new LevelUpDB();
    await db3.settings.bulkPut(parsed.tables.settings);

    const restored = await db3.settings.toCollection().first();
    expect(restored?.expressionBank).toBe(structuredBank);
    expect(restored?.expressionCompletions).toEqual(completions);
    expect(restored?.expressionCompletions?.[0].ideaId).toBe('occams-razor'); // survived export/import
    // Normalized ideas identical before vs after the round trip.
    expect(parseIdeaBank(restored!.expressionBank!)).toEqual(parseIdeaBank(structuredBank));
  });

  it('legacy bank round-trips and stays legacy (no auto-conversion)', async () => {
    await db.settings.add(minimalSettings(legacyBank, []));
    const read = await db.settings.toCollection().first();
    expect(read?.expressionBank).toBe(legacyBank); // byte-for-byte unchanged
    expect(detectIdeaBankFormat(read!.expressionBank!)).toBe('legacy');
  });
});
