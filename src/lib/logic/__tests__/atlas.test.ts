import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { LevelUpDB } from '../../db';
import {
  ATLAS_ENTITIES,
  getEntityByAtlasId,
  getEntityByIso3,
  getEntityByIsoNumeric,
  resolveAtlasId,
} from '../../data/atlasEntities';
import type { AtlasCountry } from '@/types';

// A representative, fully-populated profile used across DB/backup tests.
function makeTurkey(overrides: Partial<AtlasCountry> = {}): AtlasCountry {
  const now = 1_700_000_000_000;
  return {
    atlasId: 'tur',
    iso3: 'TUR',
    name: 'Türkiye',
    summary: 'Bridge between Europe and Asia; heir to the Ottoman Empire.',
    snapshot: {
      capital: 'Ankara',
      majorCities: ['Istanbul', 'Ankara', 'Izmir'],
      currency: 'Turkish lira',
      population: { value: 85_000_000, unit: 'people', asOf: '2024', source: 'UN WPP 2024', display: '≈85 million' },
      gdpNominal: { value: 1_100_000_000_000, unit: 'USD', asOf: '2023', source: 'IMF WEO' },
    },
    geography: {
      overview: 'Anatolian peninsula plus Eastern Thrace.',
      maritimeNeighborIds: ['north-cyprus'],
    },
    economy: {
      overview: 'Diversified emerging economy.',
      keyIndustries: ['textiles', 'automotive', 'tourism'],
      naturalResources: ['boron', 'coal'],
    },
    relationships: {
      overview: 'NATO member, EU candidate.',
      alliances: ['NATO'],
      keyPartnerIds: ['aze'],
    },
    history: 'Origins in the Ottoman Empire → republic in 1923 → modern state.',
    whyItMatters: 'Controls the Bosphorus and bridges two continents.',
    rememberThese: ['Controls the straits between the Black Sea and the Mediterranean.'],
    personalNotes: 'Ask cousin about Istanbul trip.',
    relatedConceptIds: ['concept-ottoman'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('atlas entity registry', () => {
  it('has unique atlasIds', () => {
    const ids = ATLAS_ENTITIES.map(e => e.atlasId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique iso3 codes where present', () => {
    const codes = ATLAS_ENTITIES.map(e => e.iso3).filter((c): c is string => !!c);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has unique isoNumeric ids where present (so geometry maps 1:1)', () => {
    const nums = ATLAS_ENTITIES.map(e => e.isoNumeric).filter((n): n is string => !!n);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('includes microstates that the 110m dataset would drop', () => {
    for (const iso3 of ['AND', 'LIE', 'MCO', 'SMR', 'VAT']) {
      expect(getEntityByIso3(iso3)).toBeDefined();
    }
  });

  it('represents every status without forcing a sovereign binary', () => {
    const statuses = new Set(ATLAS_ENTITIES.map(e => e.status));
    expect(statuses).toEqual(new Set(['sovereign', 'partial', 'territory', 'disputed']));
  });

  it('allows entities without an official ISO alpha-3 (e.g. Kosovo)', () => {
    const kosovo = getEntityByAtlasId('kosovo');
    expect(kosovo).toBeDefined();
    expect(kosovo?.iso3).toBeUndefined();
    expect(kosovo?.status).toBe('partial');
  });

  it('resolves an identifier by atlasId, iso3, or numeric code', () => {
    expect(resolveAtlasId('tur')).toBe('tur');
    expect(resolveAtlasId('TUR')).toBe('tur');
    expect(resolveAtlasId('792')).toBe('tur');   // ISO numeric
    expect(resolveAtlasId('kosovo')).toBe('kosovo');
    expect(resolveAtlasId('ZZZ')).toBeUndefined();
  });

  it('maps world-atlas numeric feature ids to entities', () => {
    expect(getEntityByIsoNumeric('792')?.atlasId).toBe('tur');
    expect(getEntityByIsoNumeric('840')?.atlasId).toBe('usa');
  });
});

describe('atlasCountries table (DB v9)', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  it('opens at version 9 with the atlasCountries table', () => {
    expect(db.verno).toBe(9);
    expect(db.atlasCountries).toBeDefined();
  });

  it('round-trips a fully-structured profile without losing nested data', async () => {
    const tur = makeTurkey();
    await db.atlasCountries.put(tur);
    const back = await db.atlasCountries.get('tur');
    expect(back).toEqual(tur);
    // nested numeric metric survives intact
    expect(back?.snapshot.population?.value).toBe(85_000_000);
    expect(back?.snapshot.population?.asOf).toBe('2024');
  });

  it('keys by atlasId, not iso3, so codeless entities are storable', async () => {
    const kosovo: AtlasCountry = {
      atlasId: 'kosovo',
      name: 'Kosovo',
      summary: 'Partially recognized Balkan state.',
      snapshot: {},
      geography: {},
      economy: {},
      relationships: {},
      history: '',
      whyItMatters: '',
      rememberThese: [],
      relatedConceptIds: [],
      createdAt: 1,
      updatedAt: 1,
    };
    await db.atlasCountries.put(kosovo);
    expect((await db.atlasCountries.get('kosovo'))?.name).toBe('Kosovo');
  });

  it('put() replaces an existing profile (upsert by atlasId)', async () => {
    await db.atlasCountries.put(makeTurkey());
    await db.atlasCountries.put(makeTurkey({ summary: 'Updated summary.' }));
    expect(await db.atlasCountries.count()).toBe(1);
    expect((await db.atlasCountries.get('tur'))?.summary).toBe('Updated summary.');
  });
});

describe('backup round-trip and compatibility', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  // Mirrors the restore helper in settings/page.tsx: missing keys → [].
  const arr = (tables: Record<string, unknown[]>, key: string): unknown[] =>
    Array.isArray(tables[key]) ? tables[key] : [];

  it('survives a backup → wipe → restore cycle', async () => {
    await db.atlasCountries.put(makeTurkey());
    await db.atlasCountries.put(makeTurkey({ atlasId: 'jpn', iso3: 'JPN', name: 'Japan' }));

    // Export
    const exported = await db.atlasCountries.toArray();
    const backup = { exportedAt: new Date(0).toISOString(), tables: { atlasCountries: exported } };

    // Wipe
    await db.atlasCountries.clear();
    expect(await db.atlasCountries.count()).toBe(0);

    // Restore
    await db.atlasCountries.bulkPut(arr(backup.tables, 'atlasCountries') as AtlasCountry[]);

    expect(await db.atlasCountries.count()).toBe(2);
    expect((await db.atlasCountries.get('tur'))?.snapshot.population?.value).toBe(85_000_000);
  });

  it('restores an OLD backup with no atlasCountries key (no crash, empty table)', async () => {
    const oldBackup = {
      exportedAt: new Date(0).toISOString(),
      tables: { knowledgeConcepts: [], strSessions: [] }, // pre-atlas backup
    };
    await db.atlasCountries.clear();
    await db.atlasCountries.bulkPut(arr(oldBackup.tables, 'atlasCountries') as AtlasCountry[]);
    expect(await db.atlasCountries.count()).toBe(0);
  });

  it('restore replaces all rows (clear+bulkPut) rather than merging', async () => {
    await db.atlasCountries.put(makeTurkey({ atlasId: 'stale', iso3: undefined, name: 'Stale' }));
    const backup = { tables: { atlasCountries: [makeTurkey()] } };

    await db.atlasCountries.clear();
    await db.atlasCountries.bulkPut(arr(backup.tables, 'atlasCountries') as AtlasCountry[]);

    // The stale row is gone; only the backup's content remains.
    expect(await db.atlasCountries.get('stale')).toBeUndefined();
    expect(await db.atlasCountries.get('tur')).toBeDefined();
  });
});

// Documents the revised Stage-2 re-import ownership rule at the data layer:
// personalNotes + createdAt are preserved; relatedConceptIds is NOT blindly
// preserved (it is re-derived from relatedConceptTitles by the importer).
describe('re-import preservation semantics (merge rule)', () => {
  function mergeReimport(
    existing: AtlasCountry,
    incoming: AtlasCountry,
    reresolvedConceptIds: string[],
  ): AtlasCountry {
    return {
      ...incoming,                                   // reference content refreshed
      personalNotes: existing.personalNotes,         // user-owned, preserved
      relatedConceptIds: reresolvedConceptIds,       // re-resolved, replaces old
      createdAt: existing.createdAt,                 // original creation kept
      updatedAt: incoming.updatedAt,
    };
  }

  it('preserves notes + createdAt, refreshes reference, replaces concept links', () => {
    const existing = makeTurkey({
      personalNotes: 'MY private note',
      relatedConceptIds: ['concept-old'],
      createdAt: 111,
    });
    const incoming = makeTurkey({
      summary: 'Freshly authored summary.',
      personalNotes: undefined,      // incoming pack has no personal notes
      createdAt: 999,
      updatedAt: 999,
    });

    const merged = mergeReimport(existing, incoming, ['concept-new']);

    expect(merged.summary).toBe('Freshly authored summary.'); // reference updated
    expect(merged.personalNotes).toBe('MY private note');      // preserved
    expect(merged.relatedConceptIds).toEqual(['concept-new']); // replaced, not preserved
    expect(merged.createdAt).toBe(111);                        // original kept
  });
});
