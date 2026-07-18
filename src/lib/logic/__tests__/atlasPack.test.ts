import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { LevelUpDB } from '../../db';
import {
  validateAtlasPack,
  buildAtlasImportPlan,
  planAtlasImport,
  applyAtlasImportPlan,
  importAtlasPack,
  exportAtlasCountry,
  exportAllAtlasCountries,
  type AtlasPack,
  type AtlasPackCountry,
} from '../atlasPack';
import type { AtlasCountry, KnowledgeConcept } from '@/types';

const NOW = 1_700_000_000_000;

function pack(countries: Partial<AtlasPackCountry>[]): AtlasPack {
  return { type: 'levelup-atlas-pack', version: 1, countries: countries as AtlasPackCountry[] };
}

function turkeyPack(overrides: Partial<AtlasPackCountry> = {}): AtlasPackCountry {
  return {
    atlasId: 'tur',
    name: 'Türkiye',
    summary: 'Bridge between Europe and Asia.',
    snapshot: {
      capital: 'Ankara',
      population: { value: 85_000_000, unit: 'people', asOf: '2024', source: 'UN WPP' },
    },
    economy: { keyIndustries: ['textiles'] },
    history: 'Ottoman Empire → republic.',
    whyItMatters: 'Controls the straits.',
    rememberThese: ['Controls the Bosphorus.'],
    ...overrides,
  };
}

function concept(id: string, title: string): KnowledgeConcept {
  return {
    id, title, summary: '', primaryDomainId: 'd1', tags: [], relatedConceptIds: [],
    sourceType: 'manual', retentionScore: 0, reviewCount: 0, reviewIntervalDays: 1,
    nextReviewAt: 0, createdAt: 0, updatedAt: 0,
  };
}

// ── Envelope validation ───────────────────────────────────────────────────────

describe('validateAtlasPack (envelope)', () => {
  it('accepts a well-formed envelope', () => {
    expect(validateAtlasPack(pack([turkeyPack()])).type).toBe('levelup-atlas-pack');
  });
  it('rejects non-objects, wrong type, wrong version, missing countries', () => {
    expect(() => validateAtlasPack(null)).toThrow(/not a JSON object/);
    expect(() => validateAtlasPack({ type: 'x', version: 1, countries: [] })).toThrow(/wrong "type"/);
    expect(() => validateAtlasPack({ type: 'levelup-atlas-pack', version: 2, countries: [] })).toThrow(/version/);
    expect(() => validateAtlasPack({ type: 'levelup-atlas-pack', version: 1 })).toThrow(/"countries" must be an array/);
  });
});

// ── Pure planning: classification & validation ────────────────────────────────

describe('buildAtlasImportPlan — classification', () => {
  it('classifies a single valid country as added', () => {
    const plan = buildAtlasImportPlan(pack([turkeyPack()]), [], [], NOW);
    expect(plan.preview.added.map(r => r.atlasId)).toEqual(['tur']);
    expect(plan.preview.updated).toHaveLength(0);
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].createdAt).toBe(NOW);
    expect(plan.toWrite[0].updatedAt).toBe(NOW);
  });

  it('handles a batch pack with mixed classifications', () => {
    const existing: AtlasCountry = buildAtlasImportPlan(pack([turkeyPack()]), [], [], 1).toWrite[0];
    const plan = buildAtlasImportPlan(
      pack([
        turkeyPack(),                                             // unchanged
        turkeyPack({ atlasId: 'jpn', name: 'Japan', summary: 'Island nation.' }), // added
      ]),
      [existing], [], NOW,
    );
    expect(plan.preview.unchanged.map(r => r.atlasId)).toEqual(['tur']);
    expect(plan.preview.added.map(r => r.atlasId)).toEqual(['jpn']);
    expect(plan.toWrite.map(w => w.atlasId)).toEqual(['jpn']); // unchanged not written
  });

  it('classifies changed reference content as updated and bumps updatedAt', () => {
    const existing = buildAtlasImportPlan(pack([turkeyPack()]), [], [], 1).toWrite[0];
    const plan = buildAtlasImportPlan(pack([turkeyPack({ summary: 'New summary.' })]), [existing], [], NOW);
    expect(plan.preview.updated.map(r => r.atlasId)).toEqual(['tur']);
    expect(plan.toWrite[0].updatedAt).toBe(NOW);
    expect(plan.toWrite[0].createdAt).toBe(1); // preserved
  });

  it('re-importing identical content is unchanged (no write, updatedAt untouched)', () => {
    const existing = buildAtlasImportPlan(pack([turkeyPack()]), [], [], 42).toWrite[0];
    const plan = buildAtlasImportPlan(pack([turkeyPack()]), [existing], [], NOW);
    expect(plan.preview.unchanged.map(r => r.atlasId)).toEqual(['tur']);
    expect(plan.toWrite).toHaveLength(0);
  });
});

describe('buildAtlasImportPlan — rejection & conflicts', () => {
  it('rejects unknown atlasId', () => {
    const plan = buildAtlasImportPlan(pack([turkeyPack({ atlasId: 'zzz' })]), [], [], NOW);
    expect(plan.preview.rejected).toHaveLength(1);
    expect(plan.preview.rejected[0].errors[0]).toMatch(/unknown atlasId/);
  });

  it('flags an iso3 that mismatches the registry as a conflict', () => {
    const plan = buildAtlasImportPlan(pack([turkeyPack({ iso3: 'JPN' })]), [], [], NOW);
    expect(plan.preview.conflicts).toHaveLength(1);
    expect(plan.preview.conflicts[0].reason).toMatch(/does not match registry/);
    expect(plan.toWrite).toHaveLength(0); // not applied
  });

  it('flags a provided iso3 on a codeless entity as a conflict', () => {
    const plan = buildAtlasImportPlan(
      pack([{ atlasId: 'kosovo', iso3: 'XKX', name: 'Kosovo', summary: 'x' }]), [], [], NOW);
    expect(plan.preview.conflicts[0].reason).toMatch(/no ISO alpha-3/);
  });

  it('accepts a matching iso3 alongside atlasId', () => {
    const plan = buildAtlasImportPlan(pack([turkeyPack({ iso3: 'TUR' })]), [], [], NOW);
    expect(plan.preview.added).toHaveLength(1);
    expect(plan.preview.conflicts).toHaveLength(0);
  });

  it('resolves identity by iso3 alone', () => {
    const plan = buildAtlasImportPlan(
      pack([{ iso3: 'JPN', name: 'Japan', summary: 'x' }]), [], [], NOW);
    expect(plan.preview.added[0].atlasId).toBe('jpn');
  });

  it('flags status that mismatches the registry as a conflict', () => {
    const plan = buildAtlasImportPlan(
      pack([turkeyPack({ status: 'disputed' })]), [], [], NOW);
    expect(plan.preview.conflicts[0].reason).toMatch(/status/);
  });

  it('rejects duplicate atlasId within one pack (all occurrences)', () => {
    const plan = buildAtlasImportPlan(
      pack([turkeyPack(), turkeyPack({ summary: 'dupe' })]), [], [], NOW);
    expect(plan.preview.rejected).toHaveLength(2);
    expect(plan.preview.rejected[0].errors[0]).toMatch(/duplicate atlasId/);
    expect(plan.toWrite).toHaveLength(0);
  });

  it('rejects invalid metrics with an indexed, readable error', () => {
    const bad = turkeyPack({
      snapshot: { population: { value: 'lots' as unknown as number, unit: 'people', asOf: '2024' } },
    });
    const plan = buildAtlasImportPlan(pack([bad]), [], [], NOW);
    expect(plan.preview.rejected).toHaveLength(1);
    expect(plan.preview.rejected[0].errors[0]).toMatch(/countries\[0\].*population\.value must be a finite number/);
  });

  it('collects multiple field errors and reports missing name/summary', () => {
    const plan = buildAtlasImportPlan(
      pack([{ atlasId: 'tur', name: '', rememberThese: 'nope' as unknown as string[] } as AtlasPackCountry]),
      [], [], NOW);
    const errs = plan.preview.rejected[0].errors.join(' | ');
    expect(errs).toMatch(/missing "name"/);
    expect(errs).toMatch(/missing "summary"/);
    expect(errs).toMatch(/rememberThese must be an array of strings/);
  });

  it('rejects a country with neither atlasId nor iso3', () => {
    const plan = buildAtlasImportPlan(
      pack([{ name: 'Nowhere', summary: 'x' } as AtlasPackCountry]), [], [], NOW);
    expect(plan.preview.rejected[0].errors[0]).toMatch(/must have "atlasId" or "iso3"/);
  });
});

// ── Concept resolution ────────────────────────────────────────────────────────

describe('relatedConceptTitles resolution', () => {
  it('resolves titles to current Vault concept ids (case-insensitive, deduped)', () => {
    const concepts = [concept('c-ott', 'The Ottoman Empire'), concept('c-nato', 'NATO')];
    const plan = buildAtlasImportPlan(
      pack([turkeyPack({ relatedConceptTitles: ['the ottoman empire', 'NATO', 'NATO'] })]),
      [], concepts, NOW);
    expect(plan.toWrite[0].relatedConceptIds).toEqual(['c-ott', 'c-nato']);
    expect(plan.preview.added[0].unresolvedConceptTitles).toBeUndefined();
  });

  it('reports unresolved titles but still imports the profile', () => {
    const plan = buildAtlasImportPlan(
      pack([turkeyPack({ relatedConceptTitles: ['Nonexistent Concept'] })]),
      [], [], NOW);
    expect(plan.preview.added[0].unresolvedConceptTitles).toEqual(['Nonexistent Concept']);
    expect(plan.toWrite[0].relatedConceptIds).toEqual([]);
  });

  it('re-resolves against CURRENT concepts on re-import (replaces old ids)', () => {
    // First import with concept present.
    const existing = buildAtlasImportPlan(
      pack([turkeyPack({ relatedConceptTitles: ['NATO'] })]),
      [], [concept('c-nato', 'NATO')], 1).toWrite[0];
    expect(existing.relatedConceptIds).toEqual(['c-nato']);

    // Re-import; the concept 'NATO' was deleted, a new one added.
    const plan = buildAtlasImportPlan(
      pack([turkeyPack({ relatedConceptTitles: ['NATO'] })]),
      [existing], [], NOW);
    // 'NATO' no longer resolves → relatedConceptIds becomes empty (not preserved).
    expect(plan.preview.updated).toHaveLength(1);
    expect(plan.toWrite[0].relatedConceptIds).toEqual([]);
  });
});

// ── DB-backed apply, preservation, and round-trip ─────────────────────────────

describe('DB-backed import/apply', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  it('applies added + updated, skips unchanged, never deletes absent profiles', async () => {
    // Seed two profiles directly.
    await importAtlasPack(pack([
      turkeyPack(),
      turkeyPack({ atlasId: 'jpn', name: 'Japan', summary: 'Island nation.' }),
    ]), 1);
    expect(await db.atlasCountries.count()).toBe(2);

    // Import a pack that only mentions Türkiye (changed). Japan absent → untouched.
    const preview = await importAtlasPack(pack([turkeyPack({ summary: 'Updated.' })]), NOW);
    expect(preview.updated.map(r => r.atlasId)).toEqual(['tur']);
    expect(await db.atlasCountries.count()).toBe(2);                     // Japan survived
    expect((await db.atlasCountries.get('jpn'))?.name).toBe('Japan');   // untouched
    expect((await db.atlasCountries.get('tur'))?.summary).toBe('Updated.');
  });

  it('preserves personalNotes and createdAt across re-import', async () => {
    await importAtlasPack(pack([turkeyPack()]), 100);
    await db.atlasCountries.update('tur', { personalNotes: 'My private note.' });

    // Re-import reference content (pack has no personalNotes).
    await importAtlasPack(pack([turkeyPack({ summary: 'Refreshed reference.' })]), NOW);

    const back = await db.atlasCountries.get('tur');
    expect(back?.personalNotes).toBe('My private note.'); // preserved
    expect(back?.createdAt).toBe(100);                    // preserved
    expect(back?.summary).toBe('Refreshed reference.');   // updated
    expect(back?.updatedAt).toBe(NOW);                    // bumped
  });

  it('planAtlasImport does not write; applyAtlasImportPlan does', async () => {
    const plan = await planAtlasImport(pack([turkeyPack()]), NOW);
    expect(await db.atlasCountries.count()).toBe(0); // planning wrote nothing
    await applyAtlasImportPlan(plan);
    expect(await db.atlasCountries.count()).toBe(1);
  });

  it('round-trips: export all → re-import yields all unchanged', async () => {
    await db.knowledgeConcepts.put(concept('c-ott', 'The Ottoman Empire'));
    await importAtlasPack(pack([
      turkeyPack({ relatedConceptTitles: ['The Ottoman Empire'] }),
      turkeyPack({ atlasId: 'jpn', name: 'Japan', summary: 'Island nation.' }),
    ]), 500);
    await db.atlasCountries.update('tur', { personalNotes: 'note' });

    const exported = await exportAllAtlasCountries('2026-01-01T00:00:00.000Z');
    expect(exported.countries).toHaveLength(2);

    const preview = await importAtlasPack(exported, NOW);
    expect(preview.unchanged).toHaveLength(2);
    expect(preview.updated).toHaveLength(0);
    expect(preview.added).toHaveLength(0);
  });

  it('exports a single profile, or null when missing', async () => {
    await importAtlasPack(pack([turkeyPack()]), 1);
    const one = await exportAtlasCountry('tur', '2026-01-01T00:00:00.000Z');
    expect(one?.countries).toHaveLength(1);
    expect(one?.countries[0].atlasId).toBe('tur');
    expect(await exportAtlasCountry('nonexistent')).toBeNull();
  });

  it('exported single profile re-imports as unchanged (personalNotes round-trips on a fresh DB)', async () => {
    await importAtlasPack(pack([turkeyPack()]), 1);
    await db.atlasCountries.update('tur', { personalNotes: 'seeded' });
    const one = (await exportAtlasCountry('tur'))!;

    // Wipe and re-import onto an empty DB — personalNotes must survive as an "add".
    await db.atlasCountries.clear();
    const preview = await importAtlasPack(one, NOW);
    expect(preview.added.map(r => r.atlasId)).toEqual(['tur']);
    expect((await db.atlasCountries.get('tur'))?.personalNotes).toBe('seeded');
  });
});

// ── Stage 4.1: promoted geography/economy fields ──────────────────────────────

describe('promoted structured fields — import/export', () => {
  const rich = turkeyPack({
    geography: {
      overview: 'Anatolia and Thrace.',
      majorRegions: ['Anatolia', 'Thrace'],
      mountains: ['Taurus'],
      rivers: ['Euphrates'],
      lakes: ['Lake Van'],
      seasAndOceans: ['Black Sea'],
      naturalResources: ['boron'],
      maritimeNeighborIds: ['north-cyprus'],
    },
    economy: {
      majorIndustries: ['automotive'],
      majorExports: ['vehicles'],
      majorImports: ['energy'],
      strengths: ['young workforce'],
      challenges: ['inflation'],
    },
  });

  it('imports and persists the promoted geography fields', () => {
    const rec = buildAtlasImportPlan(pack([rich]), [], [], NOW).toWrite[0];
    expect(rec.geography.majorRegions).toEqual(['Anatolia', 'Thrace']);
    expect(rec.geography.mountains).toEqual(['Taurus']);
    expect(rec.geography.rivers).toEqual(['Euphrates']);
    expect(rec.geography.lakes).toEqual(['Lake Van']);
    expect(rec.geography.seasAndOceans).toEqual(['Black Sea']);
    expect(rec.geography.naturalResources).toEqual(['boron']);
  });

  it('imports and persists the promoted economy fields', () => {
    const rec = buildAtlasImportPlan(pack([rich]), [], [], NOW).toWrite[0];
    expect(rec.economy.majorIndustries).toEqual(['automotive']);
    expect(rec.economy.majorExports).toEqual(['vehicles']);
    expect(rec.economy.majorImports).toEqual(['energy']);
    expect(rec.economy.strengths).toEqual(['young workforce']);
    expect(rec.economy.challenges).toEqual(['inflation']);
  });

  it('rejects a promoted field with the wrong type, indexed', () => {
    const bad = turkeyPack({ geography: { mountains: 'Taurus' as unknown as string[] } });
    const plan = buildAtlasImportPlan(pack([bad]), [], [], NOW);
    expect(plan.preview.rejected[0].errors.join(' ')).toMatch(/geography\.mountains must be an array of strings/);
  });

  it('preserves legacy extraSections carrying the same info (no rewrite/delete)', () => {
    const legacy = turkeyPack({ extraSections: [{ title: 'Mountains & Rivers', body: 'Taurus; Euphrates.' }] });
    const rec = buildAtlasImportPlan(pack([legacy]), [], [], NOW).toWrite[0];
    expect(rec.extraSections?.[0].title).toBe('Mountains & Rivers');
  });
});

describe('DB round-trip with promoted fields', () => {
  let db: LevelUpDB;
  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  it('export all → re-import is unchanged with promoted fields present', async () => {
    await importAtlasPack(pack([turkeyPack({
      geography: { mountains: ['Taurus'], rivers: ['Euphrates'], naturalResources: ['boron'] },
      economy: { majorIndustries: ['automotive'], strengths: ['workforce'], challenges: ['inflation'] },
    })]), 500);

    const exported = await exportAllAtlasCountries('2026-01-01T00:00:00.000Z');
    expect(exported.countries[0].geography?.mountains).toEqual(['Taurus']);
    expect(exported.countries[0].economy?.majorIndustries).toEqual(['automotive']);

    const preview = await importAtlasPack(exported, 999);
    expect(preview.unchanged).toHaveLength(1);
    expect(preview.updated).toHaveLength(0);
  });
});
