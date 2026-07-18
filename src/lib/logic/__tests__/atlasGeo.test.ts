import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  matchFeatureToAtlasId,
  buildCoverageReport,
  filterEntities,
  sortedEntities,
  classifyForMap,
  resolveAtlasRoute,
  GEOMETRY_NAME_OVERRIDES,
  type GeoFeatureLike,
} from '../atlasGeo';
import { ATLAS_ENTITIES, getEntityByAtlasId } from '../../data/atlasEntities';
import { MARKER_COORDS, MARKER_ATLAS_IDS } from '../../data/atlasMarkers';

// Load the SHIPPED geometry asset (not the node_modules copy) and reduce it to
// the {id, name} shape the matcher consumes.
function loadShippedFeatures(): GeoFeatureLike[] {
  const path = resolve(process.cwd(), 'public/data/countries-50m.json');
  const topo = JSON.parse(readFileSync(path, 'utf-8'));
  return topo.objects.countries.geometries.map((g: { id?: string | number; properties?: { name?: string } }) => ({
    id: g.id,
    name: g.properties?.name,
  }));
}

const FEATURES = loadShippedFeatures();

// ── Feature → registry matching ───────────────────────────────────────────────

describe('matchFeatureToAtlasId', () => {
  it('matches by ISO numeric id (primary path)', () => {
    expect(matchFeatureToAtlasId({ id: '792', name: 'Turkey' })).toBe('tur');
    expect(matchFeatureToAtlasId({ id: '840', name: 'United States of America' })).toBe('usa');
    expect(matchFeatureToAtlasId({ id: '250', name: 'France' })).toBe('fra'); // NE ISO_A3 bug avoided
  });

  it('matches codeless entities via the curated name allowlist only', () => {
    expect(matchFeatureToAtlasId({ id: undefined, name: 'Kosovo' })).toBe('kosovo');
    expect(matchFeatureToAtlasId({ id: undefined, name: 'N. Cyprus' })).toBe('north-cyprus');
    expect(matchFeatureToAtlasId({ id: undefined, name: 'Somaliland' })).toBe('somaliland');
  });

  it('returns null for features not in the registry', () => {
    expect(matchFeatureToAtlasId({ id: '316', name: 'Guam' })).toBeNull();
    expect(matchFeatureToAtlasId({ id: '010', name: 'Antarctica' })).toBeNull();
    expect(matchFeatureToAtlasId({ id: undefined, name: 'Siachen Glacier' })).toBeNull();
  });

  it('does not trust arbitrary names — only the allowlist', () => {
    // A random name with no numeric id must not match, even if plausible.
    expect(matchFeatureToAtlasId({ id: undefined, name: 'Republic of Turkey' })).toBeNull();
    expect(Object.keys(GEOMETRY_NAME_OVERRIDES)).toEqual(['Somaliland', 'Kosovo', 'N. Cyprus']);
  });
});

// ── Coverage report against the real shipped dataset ──────────────────────────

describe('coverage report (shipped 50m dataset)', () => {
  const report = buildCoverageReport(FEATURES);

  it('counts the canonical registry', () => {
    expect(report.totalRegistry).toBe(209);
    expect(report.entitiesIntendedOnAtlas).toBe(209);
  });

  it('has the expected geometry + match totals', () => {
    expect(report.totalGeometries).toBe(241);
    expect(report.matchedGeometries).toBe(207);
    expect(report.matchedAtlasIds).toHaveLength(206); // 207 features − 1 Australia duplicate
  });

  it('identifies exactly the three polygonless entities', () => {
    expect(report.entitiesWithoutPolygon.map(e => e.atlasId).sort())
      .toEqual(['abkhazia', 'south-ossetia', 'tuv']);
  });

  it('excludes 34 geometry features not in the registry', () => {
    expect(report.excludedGeometries).toHaveLength(34);
    const names = report.excludedGeometries.map(f => f.name);
    expect(names).toContain('Antarctica');
    expect(names).toContain('Guam');
  });

  it('resolves the Australia duplicate deterministically (only known duplicate)', () => {
    expect(report.duplicateMappings).toHaveLength(1);
    expect(report.duplicateMappings[0].atlasId).toBe('aus');
    expect(report.duplicateMappings[0].names).toContain('Australia');
    expect(report.duplicateMappings[0].names).toContain('Ashmore and Cartier Is.');
  });

  it('leaves ZERO unresolved entities — every entity has a polygon or a marker', () => {
    expect(report.unresolvedEntities).toEqual([]);
  });

  it('every polygonless entity has a point-marker fallback', () => {
    for (const e of report.entitiesWithoutPolygon) {
      expect(MARKER_ATLAS_IDS.has(e.atlasId)).toBe(true);
    }
  });

  it('polygon matches + polygonless entities account for the whole registry', () => {
    expect(report.matchedAtlasIds.length + report.entitiesWithoutPolygon.length).toBe(report.totalRegistry);
  });
});

// ── Marker integrity ──────────────────────────────────────────────────────────

describe('marker coordinates', () => {
  it('every marker references a real registry atlasId', () => {
    for (const atlasId of Object.keys(MARKER_COORDS)) {
      expect(getEntityByAtlasId(atlasId), `marker ${atlasId}`).toBeDefined();
    }
  });

  it('every marker has valid [lon, lat] coordinates', () => {
    for (const [atlasId, [lon, lat]] of Object.entries(MARKER_COORDS)) {
      expect(lon, `${atlasId} lon`).toBeGreaterThanOrEqual(-180);
      expect(lon, `${atlasId} lon`).toBeLessThanOrEqual(180);
      expect(lat, `${atlasId} lat`).toBeGreaterThanOrEqual(-90);
      expect(lat, `${atlasId} lat`).toBeLessThanOrEqual(90);
    }
  });

  it('microstates that would be hard to tap have a marker fallback', () => {
    for (const iso of ['and', 'lie', 'mco', 'smr', 'vat', 'mlt', 'sgp', 'bhr']) {
      expect(MARKER_ATLAS_IDS.has(iso), iso).toBe(true);
    }
  });
});

// ── Search & list ─────────────────────────────────────────────────────────────

describe('search and list', () => {
  it('empty query returns all entities, alphabetically', () => {
    const all = filterEntities('');
    expect(all).toHaveLength(ATLAS_ENTITIES.length);
    expect(all).toEqual(sortedEntities());
  });

  it('matches by name, case- and diacritic-insensitive', () => {
    expect(filterEntities('turkiye').map(e => e.atlasId)).toContain('tur');
    expect(filterEntities('JAPAN').map(e => e.atlasId)).toEqual(['jpn']);
  });

  it('matches by ISO alpha-3', () => {
    expect(filterEntities('deu').map(e => e.atlasId)).toContain('deu');
  });

  it('returns empty for no matches', () => {
    expect(filterEntities('zzzzz')).toEqual([]);
  });

  it('finds codeless entities by name', () => {
    expect(filterEntities('kosovo').map(e => e.atlasId)).toEqual(['kosovo']);
  });
});

// ── Map classification & route resolution ─────────────────────────────────────

describe('classifyForMap', () => {
  it('classifies profile presence', () => {
    const profiles = new Set(['tur']);
    expect(classifyForMap('tur', profiles)).toBe('profile');
    expect(classifyForMap('jpn', profiles)).toBe('empty');
  });
});

describe('resolveAtlasRoute', () => {
  it('resolves a known entity with a profile', () => {
    const r = resolveAtlasRoute('tur', new Set(['tur']));
    expect(r.notFound).toBe(false);
    expect(r.entity?.name).toBe('Türkiye');
    expect(r.hasProfile).toBe(true);
  });

  it('resolves a known entity without a profile', () => {
    const r = resolveAtlasRoute('jpn', new Set());
    expect(r.notFound).toBe(false);
    expect(r.hasProfile).toBe(false);
  });

  it('flags an unknown atlasId as notFound', () => {
    const r = resolveAtlasRoute('atlantis', new Set());
    expect(r.notFound).toBe(true);
    expect(r.entity).toBeUndefined();
  });
});
