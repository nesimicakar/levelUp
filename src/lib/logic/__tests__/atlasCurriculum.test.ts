import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neighbors as topojsonNeighbors } from 'topojson-client';
import { filterByScope } from '../atlasGeo';
import { computeLandNeighbors, resolveLandNeighbors, type AtlasTopologyData } from '../atlasTopology';
import { CORE_ATLAS_IDS, isCoreAtlas } from '../../data/coreAtlas';
import { CURATED_LAND_NEIGHBORS } from '../../data/atlasNeighbors';
import { ATLAS_ENTITIES, getEntityByAtlasId } from '../../data/atlasEntities';

// Build a real topology data object once for resolver tests.
function loadTopologyData(): AtlasTopologyData {
  const path = resolve(process.cwd(), 'public/data/countries-50m.json');
  const topo = JSON.parse(readFileSync(path, 'utf-8'));
  const geometries = topo.objects.countries.geometries;
  const adjacency = topojsonNeighbors(geometries);
  return { topology: topo, neighborsByAtlasId: computeLandNeighbors(geometries, adjacency) };
}
const DATA = loadTopologyData();

// ── Core Atlas curriculum ─────────────────────────────────────────────────────

describe('Core Atlas set', () => {
  it('every Core id is a real registry entity (no stale ids)', () => {
    for (const id of CORE_ATLAS_IDS) expect(getEntityByAtlasId(id), id).toBeDefined();
  });

  it('is a focused subset, not the whole registry', () => {
    expect(CORE_ATLAS_IDS.size).toBeGreaterThan(10);
    expect(CORE_ATLAS_IDS.size).toBeLessThan(ATLAS_ENTITIES.length);
  });

  it('isCoreAtlas reflects membership', () => {
    expect(isCoreAtlas('usa')).toBe(true);
    expect(isCoreAtlas('tuv')).toBe(false);
  });
});

describe('filterByScope', () => {
  const profiles = new Set(['tur', 'tuv']); // tuv is NOT core; tur IS core

  it('all → every entity', () => {
    expect(filterByScope('all', profiles)).toHaveLength(ATLAS_ENTITIES.length);
  });

  it('core → only Core Atlas members', () => {
    const core = filterByScope('core', profiles);
    expect(core.every(e => CORE_ATLAS_IDS.has(e.atlasId))).toBe(true);
    expect(core).toHaveLength(CORE_ATLAS_IDS.size);
  });

  it('profiled → only entities with a profile, regardless of core membership', () => {
    const prof = filterByScope('profiled', profiles);
    expect(prof.map(e => e.atlasId).sort()).toEqual(['tur', 'tuv']);
  });

  it('scope is independent of profiles: a Core entity need not have a profile', () => {
    // usa is Core but has no profile in this set — still appears under core.
    expect(filterByScope('core', profiles).some(e => e.atlasId === 'usa')).toBe(true);
    expect(filterByScope('profiled', profiles).some(e => e.atlasId === 'usa')).toBe(false);
  });
});

// ── Curated neighbor fallbacks ────────────────────────────────────────────────

describe('curated land-neighbor fallbacks', () => {
  it('every curated neighbor id is a real registry entity', () => {
    for (const [entity, neighbors] of Object.entries(CURATED_LAND_NEIGHBORS)) {
      expect(getEntityByAtlasId(entity), entity).toBeDefined();
      for (const n of neighbors) expect(getEntityByAtlasId(n), `${entity}→${n}`).toBeDefined();
    }
  });

  it('supplies neighbors for polygonless entities the topology cannot derive', () => {
    // These have no polygon, so topology yields nothing; fallbacks fill in.
    const so = resolveLandNeighbors(DATA, 'south-ossetia');
    expect(so.map(n => n.atlasId)).toEqual(['geo', 'rus']);
    expect(so.every(n => n.curated)).toBe(true); // all curated (no derivation)

    const ab = resolveLandNeighbors(DATA, 'abkhazia');
    expect(ab.map(n => n.atlasId)).toEqual(['geo', 'rus']);
  });

  it('Tuvalu has no land neighbors (island)', () => {
    expect(resolveLandNeighbors(DATA, 'tuv')).toEqual([]);
  });
});

describe('resolveLandNeighbors — merge behavior', () => {
  it('derived neighbors are not marked curated', () => {
    const fra = resolveLandNeighbors(DATA, 'fra');
    const deu = fra.find(n => n.atlasId === 'deu');
    expect(deu?.curated).toBe(false);
  });

  it('deduplicates and validates: all results are real, sorted, self-excluded', () => {
    const fra = resolveLandNeighbors(DATA, 'fra');
    const ids = fra.map(n => n.atlasId);
    expect(ids).not.toContain('fra');
    expect([...ids]).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of fra) expect(getEntityByAtlasId(n.atlasId)).toBeDefined();
  });
});

// ── Multi-part geometry behavior (documented & pinned) ────────────────────────

describe('multi-part geometry neighbor behavior', () => {
  it('France (MultiPolygon incl. French Guiana) correctly borders Brazil & Suriname', () => {
    const ids = resolveLandNeighbors(DATA, 'fra').map(n => n.atlasId);
    // French Guiana is part of France's geometry → these are real land borders.
    expect(ids).toContain('bra');
    expect(ids).toContain('sur');
    // and the European borders too
    expect(ids).toContain('deu');
    expect(ids).toContain('esp');
  });

  it('Australia (2 features incl. Ashmore & Cartier Is.) yields no spurious neighbors', () => {
    expect(resolveLandNeighbors(DATA, 'aus')).toEqual([]);
  });
});
