import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neighbors as topojsonNeighbors } from 'topojson-client';
import { computeLandNeighbors } from '../atlasTopology';
import {
  buildAtlasProfileView,
  formatMetricValue,
  formatMetricMeta,
} from '../atlasProfile';
import { getEntityByAtlasId } from '../../data/atlasEntities';
import type { ResolvedNeighbor } from '../atlasTopology';
import type { AtlasCountry, AtlasEntity, KnowledgeConcept } from '@/types';

/** Build ResolvedNeighbor[] from atlasIds (all derived unless suffixed with '*'). */
function nb(...ids: string[]): ResolvedNeighbor[] {
  return ids.map(id => id.endsWith('*')
    ? { atlasId: id.slice(0, -1), curated: true }
    : { atlasId: id, curated: false });
}

// ── Neighbor derivation (synthetic adjacency for deterministic edge cases) ────

describe('computeLandNeighbors — logic', () => {
  // 4 features: tur(792), grc(300), bgr(100), and an excluded feature.
  const geometries = [
    { id: '792', properties: { name: 'Turkey' } },  // 0 → tur
    { id: '300', properties: { name: 'Greece' } },  // 1 → grc
    { id: '100', properties: { name: 'Bulgaria' } },// 2 → bgr
    { id: '316', properties: { name: 'Guam' } },    // 3 → excluded (null)
  ];

  it('maps adjacency to canonical atlasIds, excludes self, dedupes', () => {
    const adjacency = [
      [1, 2, 1],   // tur ↔ grc, bgr (dup grc)
      [0, 2],      // grc ↔ tur, bgr
      [0, 1],      // bgr ↔ tur, grc
      [0],         // Guam "touches" tur (excluded source)
    ];
    const map = computeLandNeighbors(geometries, adjacency);
    expect(map.get('tur')).toEqual(['bgr', 'grc']); // sorted, deduped, no self
    expect(map.get('grc')).toEqual(['bgr', 'tur']);
  });

  it('drops excluded (null-atlasId) neighbors', () => {
    const adjacency = [[3], [], [], [0]]; // tur only touches Guam(excluded)
    const map = computeLandNeighbors(geometries, adjacency);
    expect(map.get('tur')).toEqual([]); // Guam not a registry entity
  });

  it('unions adjacency across multi-polygon entities', () => {
    // Two polygons both map to aus (like Australia + Ashmore & Cartier Is.).
    const geo = [
      { id: '036', properties: { name: 'Australia' } },            // 0 → aus
      { id: '036', properties: { name: 'Ashmore and Cartier Is.' } }, // 1 → aus
      { id: '360', properties: { name: 'Indonesia' } },           // 2 → idn
      { id: '598', properties: { name: 'Papua New Guinea' } },    // 3 → png
    ];
    const adjacency = [[2], [3], [0], [1]]; // poly0↔idn, poly1↔png
    const map = computeLandNeighbors(geo, adjacency);
    expect(map.get('aus')).toEqual(['idn', 'png']); // union of both polygons
  });

  it('never lists a polygonless entity as a key', () => {
    const map = computeLandNeighbors(geometries, [[1], [0], [], []]);
    expect(map.has('tuv')).toBe(false);
    expect(map.get('abkhazia')).toBeUndefined();
  });
});

describe('computeLandNeighbors — real shipped dataset', () => {
  const path = resolve(process.cwd(), 'public/data/countries-50m.json');
  const topo = JSON.parse(readFileSync(path, 'utf-8'));
  const geometries = topo.objects.countries.geometries;
  const adjacency = topojsonNeighbors(geometries);
  const map = computeLandNeighbors(geometries, adjacency);

  it('derives plausible real land neighbors and maps them to registry links', () => {
    const fra = map.get('fra') ?? [];
    for (const nb of ['deu', 'esp', 'ita', 'bel', 'che']) expect(fra).toContain(nb);
    // Every derived neighbor resolves to a real registry entity.
    for (const nb of fra) expect(getEntityByAtlasId(nb)).toBeDefined();
  });

  it('island nations have no land neighbors', () => {
    expect(map.get('jpn') ?? []).toEqual([]);
    expect(map.get('aus') ?? []).toEqual([]); // Australia mainland touches nothing by land
  });
});

// ── Metric formatting ─────────────────────────────────────────────────────────

describe('metric formatting', () => {
  it('prefers author display string', () => {
    expect(formatMetricValue({ value: 85e6, unit: 'people', asOf: '2024', display: '≈85 million' })).toBe('≈85 million');
  });
  it('compact-formats large numbers with unit', () => {
    expect(formatMetricValue({ value: 783562, unit: 'km2', asOf: '2023' })).toBe('783,562 km²');
    expect(formatMetricValue({ value: 85_000_000, unit: 'people', asOf: '2024' })).toBe('85M');
  });
  it('formats USD with a currency prefix', () => {
    expect(formatMetricValue({ value: 1.1e12, unit: 'USD', asOf: '2023' })).toBe('$1.1T');
  });
  it('builds provenance meta, or none', () => {
    expect(formatMetricMeta({ value: 1, unit: 'x', asOf: '2024', source: 'UN WPP' })).toBe('as of 2024 · UN WPP');
    expect(formatMetricMeta({ value: 1, unit: 'x', asOf: '2024' })).toBe('as of 2024');
    expect(formatMetricMeta({ value: 1, unit: 'x', asOf: '' })).toBeUndefined();
  });
});

// ── View-model building ───────────────────────────────────────────────────────

const TUR: AtlasEntity = getEntityByAtlasId('tur')!;

function fullProfile(overrides: Partial<AtlasCountry> = {}): AtlasCountry {
  return {
    atlasId: 'tur', iso3: 'TUR', name: 'Türkiye',
    summary: 'Bridge between Europe and Asia.',
    snapshot: {
      capital: 'Ankara', majorCities: ['Istanbul', 'Izmir'], currency: 'Lira',
      population: { value: 85e6, unit: 'people', asOf: '2024', source: 'UN WPP' },
    },
    geography: { overview: 'Anatolia and Thrace.', maritimeNeighborIds: ['north-cyprus'] },
    economy: { keyIndustries: ['textiles'], exports: ['vehicles'] },
    relationships: { alliances: ['NATO'], keyPartnerIds: ['aze'], keyRivalIds: [] },
    history: 'Ottoman Empire → republic.',
    whyItMatters: 'Controls the straits.',
    rememberThese: ['Controls the Bosphorus.'],
    extraSections: [{ title: 'Mountains & Rivers', body: 'Taurus range; Euphrates source.' }],
    personalNotes: 'Ask about Istanbul.',
    relatedConceptIds: ['c-ott'],
    createdAt: 1, updatedAt: 1,
    ...overrides,
  };
}

const CONCEPTS: KnowledgeConcept[] = [{
  id: 'c-ott', title: 'The Ottoman Empire', summary: '', primaryDomainId: 'd', tags: [],
  relatedConceptIds: [], sourceType: 'manual', retentionScore: 0, reviewCount: 0,
  reviewIntervalDays: 1, nextReviewAt: 0, createdAt: 0, updatedAt: 0,
}];

describe('buildAtlasProfileView — full profile', () => {
  const v = buildAtlasProfileView(TUR, fullProfile(), nb('grc', 'bgr'), CONCEPTS);

  it('always exposes registry header info', () => {
    expect(v.header.name).toBe('Türkiye');
    expect(v.header.statusLabel).toBe('Sovereign state');
    expect(v.header.region).toBe('Asia');
  });

  it('renders derived land neighbors as registry links', () => {
    expect(v.landNeighbors.map(l => l.atlasId)).toEqual(['grc', 'bgr']);
    expect(v.landNeighbors[0].name).toBe('Greece');
  });

  it('separates dated metrics from timeless facts in the snapshot', () => {
    expect(v.snapshot?.facts.find(f => f.label === 'Capital')?.value).toBe('Ankara');
    const pop = v.snapshot?.metrics.find(m => m.label === 'Population');
    expect(pop?.value).toBe('85M');
    expect(pop?.meta).toBe('as of 2024 · UN WPP');
  });

  it('keeps maritime neighbors separate from land neighbors', () => {
    expect(v.geography?.maritimeNeighbors.map(l => l.atlasId)).toEqual(['north-cyprus']);
    expect(v.landNeighbors.map(l => l.atlasId)).not.toContain('north-cyprus');
  });

  it('resolves related Vault concepts, dropping missing ids', () => {
    expect(v.relatedConcepts).toEqual([{ atlasId: 'c-ott', name: 'The Ottoman Empire' }]);
  });

  it('surfaces extraSections and personal notes', () => {
    expect(v.extraSections[0].title).toBe('Mountains & Rivers');
    expect(v.personalNotes).toBe('Ask about Istanbul.');
  });
});

describe('buildAtlasProfileView — profileless & partial states', () => {
  it('profileless: header, neighbors present; all content sections null/empty', () => {
    const v = buildAtlasProfileView(TUR, undefined, nb('grc'), CONCEPTS);
    expect(v.hasProfile).toBe(false);
    expect(v.landNeighbors.map(l => l.atlasId)).toEqual(['grc']); // still derived
    expect(v.snapshot).toBeNull();
    expect(v.geography).toBeNull();
    expect(v.economy).toBeNull();
    expect(v.relationships).toBeNull();
    expect(v.rememberThese).toEqual([]);
    expect(v.extraSections).toEqual([]);
  });

  it('partial profile: empty sections are hidden, present ones render', () => {
    const partial = fullProfile({
      snapshot: { capital: 'Ankara' },  // no metrics
      geography: {},                     // fully empty → hidden
      economy: { keyIndustries: [] },    // empty → hidden
      relationships: {},                 // empty → hidden
      history: '',                       // empty → hidden
      whyItMatters: '   ',               // whitespace → hidden
      rememberThese: [],
      extraSections: [{ title: 'Ghost', body: '' }], // empty body → dropped
      personalNotes: undefined,
      relatedConceptIds: [],
    });
    const v = buildAtlasProfileView(TUR, partial, [], CONCEPTS);
    expect(v.snapshot?.facts).toHaveLength(1);   // capital only
    expect(v.snapshot?.metrics).toEqual([]);
    expect(v.geography).toBeNull();
    expect(v.economy).toBeNull();
    expect(v.relationships).toBeNull();
    expect(v.history).toBeUndefined();
    expect(v.whyItMatters).toBeUndefined();
    expect(v.extraSections).toEqual([]);          // ghost dropped
    expect(v.relatedConcepts).toEqual([]);
  });

  it('does not invent values for absent metrics', () => {
    const v = buildAtlasProfileView(TUR, fullProfile({ snapshot: { population: undefined } }), [], CONCEPTS);
    expect(v.snapshot?.metrics.find(m => m.label === 'Population')).toBeUndefined();
  });
});

// ── Stage 4.1: promoted geography/economy fields ──────────────────────────────

describe('promoted structured fields', () => {
  it('renders new geography fields as first-class', () => {
    const v = buildAtlasProfileView(TUR, fullProfile({
      geography: {
        overview: 'Anatolia.',
        majorRegions: ['Anatolia', 'Thrace'],
        mountains: ['Taurus'],
        rivers: ['Euphrates', 'Tigris'],
        lakes: ['Lake Van'],
        seasAndOceans: ['Black Sea', 'Mediterranean'],
        naturalResources: ['boron', 'coal'],
      },
    }), [], CONCEPTS);
    expect(v.geography?.majorRegions).toEqual(['Anatolia', 'Thrace']);
    expect(v.geography?.mountains).toEqual(['Taurus']);
    expect(v.geography?.rivers).toEqual(['Euphrates', 'Tigris']);
    expect(v.geography?.lakes).toEqual(['Lake Van']);
    expect(v.geography?.seasAndOceans).toEqual(['Black Sea', 'Mediterranean']);
    expect(v.geography?.naturalResources).toEqual(['boron', 'coal']);
  });

  it('renders new economy fields and imports/strengths/challenges', () => {
    const v = buildAtlasProfileView(TUR, fullProfile({
      economy: {
        majorIndustries: ['automotive'],
        majorExports: ['vehicles'],
        majorImports: ['energy'],
        strengths: ['young workforce'],
        challenges: ['inflation'],
      },
    }), [], CONCEPTS);
    expect(v.economy?.industries).toEqual(['automotive']);
    expect(v.economy?.exports).toEqual(['vehicles']);
    expect(v.economy?.imports).toEqual(['energy']);
    expect(v.economy?.strengths).toEqual(['young workforce']);
    expect(v.economy?.challenges).toEqual(['inflation']);
  });

  it('falls back to legacy keyIndustries/exports when major* absent (backward compat)', () => {
    const v = buildAtlasProfileView(TUR, fullProfile({
      economy: { keyIndustries: ['textiles'], exports: ['hazelnuts'] },
    }), [], CONCEPTS);
    expect(v.economy?.industries).toEqual(['textiles']);
    expect(v.economy?.exports).toEqual(['hazelnuts']);
  });

  it('prefers major* over legacy when both present', () => {
    const v = buildAtlasProfileView(TUR, fullProfile({
      economy: { keyIndustries: ['old'], majorIndustries: ['new'] },
    }), [], CONCEPTS);
    expect(v.economy?.industries).toEqual(['new']);
  });

  it('still renders legacy extraSections holding the same info (no rewrite)', () => {
    const v = buildAtlasProfileView(TUR, fullProfile({
      extraSections: [{ title: 'Mountains & Rivers', body: 'Taurus; Euphrates.' }],
    }), [], CONCEPTS);
    expect(v.extraSections[0].title).toBe('Mountains & Rivers');
  });
});

// ── Stage 4.1: curated neighbor flag ──────────────────────────────────────────

describe('curated land-neighbor flag in view', () => {
  it('marks curated neighbors and links them', () => {
    const v = buildAtlasProfileView(getEntityByAtlasId('south-ossetia')!, undefined, nb('geo*', 'rus*'), CONCEPTS);
    expect(v.landNeighbors.map(l => [l.atlasId, l.curated])).toEqual([['geo', true], ['rus', true]]);
    expect(v.landNeighbors[0].name).toBe('Georgia');
  });

  it('mixes derived and curated flags', () => {
    const v = buildAtlasProfileView(TUR, undefined, nb('grc', 'geo*'), CONCEPTS);
    expect(v.landNeighbors.find(l => l.atlasId === 'grc')?.curated).toBe(false);
    expect(v.landNeighbors.find(l => l.atlasId === 'geo')?.curated).toBe(true);
  });
});
