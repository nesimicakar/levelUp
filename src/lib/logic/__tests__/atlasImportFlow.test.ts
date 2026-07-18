import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { LevelUpDB } from '../../db';
import {
  parseAtlasPackText, applyOutcome, collectUnresolvedTitles, canApply,
  ATLAS_PACK_TEMPLATE, ATLAS_PACK_TEMPLATE_OBJECT,
} from '../atlasImportFlow';
import {
  planAtlasImport, applyAtlasImportPlan, exportAtlasCountry, exportAllAtlasCountries,
  type AtlasImportPreview, type AtlasPackCountry,
} from '../atlasPack';

const NOW = 1_700_000_000_000;

function packText(countries: Partial<AtlasPackCountry>[]): string {
  return JSON.stringify({ type: 'levelup-atlas-pack', version: 1, countries });
}
const tur = { atlasId: 'tur', name: 'Türkiye', summary: 'Bridge.' };
const jpn = { atlasId: 'jpn', name: 'Japan', summary: 'Islands.' };

// ── parse (pasted or uploaded — same code path) ───────────────────────────────

describe('parseAtlasPackText', () => {
  it('accepts a valid pack (paste or file both arrive as text)', () => {
    const r = parseAtlasPackText(packText([tur]));
    expect(r.ok).toBe(true);
  });
  it('rejects empty input', () => {
    expect(parseAtlasPackText('   ')).toMatchObject({ ok: false, error: expect.stringMatching(/Nothing to import/) });
  });
  it('rejects invalid JSON', () => {
    expect(parseAtlasPackText('{not json')).toMatchObject({ ok: false, error: expect.stringMatching(/Invalid JSON/) });
  });
  it('rejects a wrong envelope via the engine validator (not reimplemented)', () => {
    expect(parseAtlasPackText('{"type":"x","version":1,"countries":[]}'))
      .toMatchObject({ ok: false, error: expect.stringMatching(/wrong "type"/) });
  });
});

// ── outcome reporting ─────────────────────────────────────────────────────────

function preview(over: Partial<AtlasImportPreview> = {}): AtlasImportPreview {
  return { added: [], updated: [], unchanged: [], rejected: [], conflicts: [], ...over };
}
const row = (atlasId: string, extra = {}) => ({ index: 0, atlasId, name: atlasId.toUpperCase(), ...extra });

describe('applyOutcome', () => {
  it('full when only writes', () => {
    expect(applyOutcome(preview({ added: [row('tur')], updated: [row('jpn')] })).kind).toBe('full');
  });
  it('partial when writes + problems', () => {
    const o = applyOutcome(preview({ added: [row('tur')], rejected: [{ index: 1, identifier: 'zzz', errors: ['unknown'] }] }));
    expect(o.kind).toBe('partial');
    expect(o.headline).toMatch(/Applied 1 profile; 1 entry skipped/);
  });
  it('none when all unchanged', () => {
    expect(applyOutcome(preview({ unchanged: [row('tur')] })).kind).toBe('none');
  });
  it('none when all rejected', () => {
    const o = applyOutcome(preview({ conflicts: [{ index: 0, atlasId: 'tur', identifier: 'tur', reason: 'x' }] }));
    expect(o.kind).toBe('none');
    expect(o.headline).toMatch(/could not be imported/);
  });
});

describe('collectUnresolvedTitles', () => {
  it('dedupes across added + updated rows (case-insensitive)', () => {
    const p = preview({
      added: [row('tur', { unresolvedConceptTitles: ['NATO', 'Silk Road'] })],
      updated: [row('jpn', { unresolvedConceptTitles: ['nato'] })],
    });
    expect(collectUnresolvedTitles(p)).toEqual(['NATO', 'Silk Road']);
  });
});

describe('canApply — double-submit guard', () => {
  it('allows apply only from previewed with writes', () => {
    expect(canApply('previewed', true)).toBe(true);
    expect(canApply('previewed', false)).toBe(false); // nothing to write
    expect(canApply('applying', true)).toBe(false);    // already applying
    expect(canApply('applied', true)).toBe(false);
    expect(canApply('idle', true)).toBe(false);
  });
});

// ── authoring guidance ────────────────────────────────────────────────────────

describe('schema template', () => {
  it('parses and validates as a real pack', () => {
    expect(parseAtlasPackText(ATLAS_PACK_TEMPLATE).ok).toBe(true);
  });
  it('advertises only canonical fields, not legacy ones', () => {
    expect(ATLAS_PACK_TEMPLATE).toContain('majorIndustries');
    expect(ATLAS_PACK_TEMPLATE).toContain('majorExports');
    expect(ATLAS_PACK_TEMPLATE).toContain('geography');
    expect(ATLAS_PACK_TEMPLATE).toContain('mountains');
    // legacy names must NOT be advertised
    expect(ATLAS_PACK_TEMPLATE).not.toContain('keyIndustries');
    expect(ATLAS_PACK_TEMPLATE).not.toMatch(/"exports"/);
  });
  it('object and string forms agree', () => {
    expect(JSON.parse(ATLAS_PACK_TEMPLATE)).toEqual(ATLAS_PACK_TEMPLATE_OBJECT);
  });
});

// ── end-to-end flow against the DB ────────────────────────────────────────────

describe('import flow — confirm before write', () => {
  let db: LevelUpDB;
  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  it('planning writes nothing; applying the plan writes', async () => {
    const parsed = parseAtlasPackText(packText([tur, jpn]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = await planAtlasImport(parsed.pack, NOW);
    expect(await db.atlasCountries.count()).toBe(0); // confirm-before-write
    await applyAtlasImportPlan(plan);
    expect(await db.atlasCountries.count()).toBe(2);
  });

  it('partial success: valid applied, unknown rejected and never written', async () => {
    const plan = await planAtlasImport(
      parseAtlasPackTextOrThrow(packText([tur, { atlasId: 'zzz', name: 'Nowhere', summary: 'x' }])), NOW);
    expect(plan.toWrite.map(w => w.atlasId)).toEqual(['tur']);
    await applyAtlasImportPlan(plan);
    expect(applyOutcome(plan.preview).kind).toBe('partial');
    expect(await db.atlasCountries.get('tur')).toBeDefined();
    expect(await db.atlasCountries.get('zzz')).toBeUndefined(); // rejected never written
  });

  it('conflicting entries never write', async () => {
    const plan = await planAtlasImport(
      parseAtlasPackTextOrThrow(packText([{ atlasId: 'tur', iso3: 'JPN', name: 'Türkiye', summary: 'x' }])), NOW);
    expect(plan.toWrite).toHaveLength(0);
    await applyAtlasImportPlan(plan);
    expect(await db.atlasCountries.count()).toBe(0);
  });

  it('preserves personalNotes and createdAt across a re-import', async () => {
    await applyAtlasImportPlan(await planAtlasImport(parseAtlasPackTextOrThrow(packText([tur])), 100));
    await db.atlasCountries.update('tur', { personalNotes: 'my note' });
    const plan = await planAtlasImport(
      parseAtlasPackTextOrThrow(packText([{ ...tur, summary: 'Updated.' }])), NOW);
    await applyAtlasImportPlan(plan);
    const back = await db.atlasCountries.get('tur');
    expect(back?.personalNotes).toBe('my note');
    expect(back?.createdAt).toBe(100);
    expect(back?.summary).toBe('Updated.');
  });
});

describe('export flow', () => {
  let db: LevelUpDB;
  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  it('exports one and all', async () => {
    await applyAtlasImportPlan(await planAtlasImport(parseAtlasPackTextOrThrow(packText([tur, jpn])), NOW));
    const one = await exportAtlasCountry('tur');
    expect(one?.countries).toHaveLength(1);
    const all = await exportAllAtlasCountries();
    expect(all.countries).toHaveLength(2);
  });

  it('empty export returns a clean, valid empty pack', async () => {
    const all = await exportAllAtlasCountries('2026-01-01T00:00:00.000Z');
    expect(all.type).toBe('levelup-atlas-pack');
    expect(all.countries).toEqual([]);
    expect(parseAtlasPackText(JSON.stringify(all)).ok).toBe(true); // round-trips as valid
  });
});

function parseAtlasPackTextOrThrow(text: string) {
  const r = parseAtlasPackText(text);
  if (!r.ok) throw new Error(r.error);
  return r.pack;
}
