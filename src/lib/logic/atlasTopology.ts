'use client';

import { useEffect, useState, useCallback } from 'react';
import { neighbors as topojsonNeighbors } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { matchFeatureToAtlasId } from '@/lib/logic/atlasGeo';
import { getEntityByAtlasId } from '@/lib/data/atlasEntities';
import { CURATED_LAND_NEIGHBORS } from '@/lib/data/atlasNeighbors';

// ─────────────────────────────────────────────────────────────────────────────
// Shared, cached topology loader (Stage 4)
//
// The 739 KB geometry asset is fetched and parsed ONCE per session, then reused
// by the world map, the profile locator map, and land-neighbor derivation.
// A module-level promise is the cache: concurrent callers share one in-flight
// fetch; later callers get the resolved value immediately. Never stored in Dexie.
// ─────────────────────────────────────────────────────────────────────────────

const DATASET_URL = '/data/countries-50m.json';

interface CountryGeometry {
  id?: string | number;
  properties?: { name?: string };
}

export interface AtlasTopologyData {
  topology: Topology;
  /** atlasId → sorted, deduped, canonical land-neighbor atlasIds. */
  neighborsByAtlasId: Map<string, string[]>;
}

let cache: Promise<AtlasTopologyData> | null = null;

/**
 * Derive land neighbors from shared-arc adjacency. Pure and testable.
 *  - maps every geometry to a canonical atlasId (null = excluded)
 *  - unions adjacency across ALL polygons of a multi-polygon entity (e.g. aus)
 *  - excludes self, dedupes, drops excluded neighbors, sorts
 *  - polygonless entities simply never appear as a key → no land neighbors
 */
export function computeLandNeighbors(
  geometries: CountryGeometry[],
  adjacency: number[][],
): Map<string, string[]> {
  const indexToAtlasId = geometries.map(g =>
    matchFeatureToAtlasId({ id: g.id, name: g.properties?.name }),
  );

  const atlasIdToIndices = new Map<string, number[]>();
  indexToAtlasId.forEach((atlasId, i) => {
    if (!atlasId) return;
    const list = atlasIdToIndices.get(atlasId) ?? [];
    list.push(i);
    atlasIdToIndices.set(atlasId, list);
  });

  const result = new Map<string, string[]>();
  for (const [atlasId, indices] of atlasIdToIndices) {
    const set = new Set<string>();
    for (const i of indices) {
      for (const j of adjacency[i] ?? []) {
        const nb = indexToAtlasId[j];
        if (nb && nb !== atlasId) set.add(nb);
      }
    }
    result.set(atlasId, [...set].sort());
  }
  return result;
}

async function fetchAndBuild(): Promise<AtlasTopologyData> {
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const topology = (await res.json()) as Topology;
  const countries = topology?.objects?.countries as GeometryCollection | undefined;
  if (!countries?.geometries) throw new Error('Malformed geometry dataset');

  const geometries = countries.geometries as CountryGeometry[];
  const adjacency = topojsonNeighbors(countries.geometries as never[]);
  const neighborsByAtlasId = computeLandNeighbors(geometries, adjacency);
  return { topology, neighborsByAtlasId };
}

/** Load (or reuse) the parsed topology + neighbor index. Single fetch per session. */
export function loadAtlasTopology(): Promise<AtlasTopologyData> {
  if (!cache) {
    cache = fetchAndBuild().catch(err => {
      cache = null; // allow retry after a failure
      throw err;
    });
  }
  return cache;
}

/** Clear the cache (used by retry). */
export function resetAtlasTopology(): void {
  cache = null;
}

/** Topology-derived land neighbors for one entity; [] for polygonless or unknown. */
export function getLandNeighbors(data: AtlasTopologyData | null, atlasId: string): string[] {
  return data?.neighborsByAtlasId.get(atlasId) ?? [];
}

export interface ResolvedNeighbor {
  atlasId: string;
  /** True when supplied only by the curated fallback (no polygon derivation). */
  curated: boolean;
}

/**
 * Resolve final land neighbors: topology-derived + curated fallbacks, deduped,
 * validated against the registry, sorted. A neighbor present in the topology is
 * never marked curated even if it also appears in the fallback table.
 */
export function resolveLandNeighbors(
  data: AtlasTopologyData | null,
  atlasId: string,
): ResolvedNeighbor[] {
  const derived = new Set(getLandNeighbors(data, atlasId));
  const curated = CURATED_LAND_NEIGHBORS[atlasId] ?? [];
  const all = new Set<string>([...derived, ...curated]);
  return [...all]
    .filter(id => id !== atlasId && getEntityByAtlasId(id) !== undefined)
    .sort()
    .map(id => ({ atlasId: id, curated: !derived.has(id) }));
}

// ── React hook ────────────────────────────────────────────────────────────────

export type AtlasTopologyState =
  | { status: 'loading' }
  | { status: 'ready'; data: AtlasTopologyData }
  | { status: 'error'; message: string };

/** Shared hook over the cached loader. Repeated mounts never refetch. */
export function useAtlasTopology(): AtlasTopologyState & { retry: () => void } {
  const [state, setState] = useState<AtlasTopologyState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadAtlasTopology()
      .then(data => { if (!cancelled) setState({ status: 'ready', data }); })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load map' });
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => { resetAtlasTopology(); setAttempt(a => a + 1); }, []);
  return { ...state, retry };
}
