import { ATLAS_ENTITIES, getEntityByIsoNumeric } from '@/lib/data/atlasEntities';
import { MARKER_ATLAS_IDS } from '@/lib/data/atlasMarkers';
import { CORE_ATLAS_IDS } from '@/lib/data/coreAtlas';
import type { AtlasEntity } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Registry ⇄ geometry matching (Stage 3, pure — no DOM / no d3)
//
// The shipped geometry asset is Natural Earth via world-atlas (public domain),
// at /data/countries-50m.json. Feature ids are ISO 3166-1 *numeric* strings.
//
// Matching is deliberately registry-first, NOT name-first:
//   1. PRIMARY — feature.id (ISO numeric) → registry entity. Reliable and 1:1.
//   2. FALLBACK — a tiny CURATED allowlist of dataset names, used ONLY for the
//      handful of entities Natural Earth ships with no numeric id (Kosovo,
//      Somaliland, Northern Cyprus). This is the single place a dataset name is
//      trusted, and only against an explicit allowlist — never a fuzzy match.
//
// Features that match nothing (dependent territories, Antarctica, disputed
// fragments) are "excluded": rendered as inert background, never interactive.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Curated overrides for dataset features that carry no ISO numeric id.
 * Keyed by the exact Natural Earth `properties.name`. Extend only for a known
 * codeless entity that also exists in the registry.
 */
export const GEOMETRY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  Somaliland: 'somaliland',
  Kosovo: 'kosovo',
  'N. Cyprus': 'north-cyprus',
};

export interface GeoFeatureLike {
  id?: string | number;
  name?: string;
}

/** Resolve one geometry feature to a canonical atlasId, or null if excluded. */
export function matchFeatureToAtlasId(feature: GeoFeatureLike): string | null {
  const idStr = feature.id != null ? String(feature.id) : '';
  if (/^[0-9]+$/.test(idStr)) {
    const entity = getEntityByIsoNumeric(idStr);
    if (entity) return entity.atlasId;
  }
  if (feature.name && Object.prototype.hasOwnProperty.call(GEOMETRY_NAME_OVERRIDES, feature.name)) {
    return GEOMETRY_NAME_OVERRIDES[feature.name];
  }
  return null;
}

export interface CoverageReport {
  totalRegistry: number;
  /** Registry entities intended to be reachable on the Atlas (polygon OR marker). */
  entitiesIntendedOnAtlas: number;
  totalGeometries: number;
  matchedGeometries: number;
  /** Distinct atlasIds that have at least one polygon. */
  matchedAtlasIds: string[];
  /** Registry entities with no polygon in the dataset. */
  entitiesWithoutPolygon: AtlasEntity[];
  /** Registry entities given a clickable point marker (polygonless + tiny). */
  pointMarkerFallbacks: AtlasEntity[];
  /** Geometry features that match no registry entity (rendered inert). */
  excludedGeometries: GeoFeatureLike[];
  /** atlasIds mapped by more than one geometry feature (multi-polygon entities). */
  duplicateMappings: { atlasId: string; names: string[] }[];
  /** Registry entities with NEITHER a polygon nor a marker. Must be empty. */
  unresolvedEntities: AtlasEntity[];
}

/** Compute a full coverage report for a set of geometry features. */
export function buildCoverageReport(features: GeoFeatureLike[]): CoverageReport {
  const namesByAtlasId = new Map<string, string[]>();
  const excluded: GeoFeatureLike[] = [];
  let matchedGeometries = 0;

  for (const f of features) {
    const atlasId = matchFeatureToAtlasId(f);
    if (atlasId) {
      matchedGeometries++;
      const list = namesByAtlasId.get(atlasId) ?? [];
      list.push(f.name ?? String(f.id ?? '?'));
      namesByAtlasId.set(atlasId, list);
    } else {
      excluded.push({ id: f.id, name: f.name });
    }
  }

  const matchedAtlasIds = [...namesByAtlasId.keys()];
  const matchedSet = new Set(matchedAtlasIds);
  const entitiesWithoutPolygon = ATLAS_ENTITIES.filter(e => !matchedSet.has(e.atlasId));
  const pointMarkerFallbacks = ATLAS_ENTITIES.filter(e => MARKER_ATLAS_IDS.has(e.atlasId));
  const unresolvedEntities = ATLAS_ENTITIES.filter(
    e => !matchedSet.has(e.atlasId) && !MARKER_ATLAS_IDS.has(e.atlasId),
  );
  const duplicateMappings = [...namesByAtlasId.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([atlasId, names]) => ({ atlasId, names }));

  return {
    totalRegistry: ATLAS_ENTITIES.length,
    entitiesIntendedOnAtlas: ATLAS_ENTITIES.length, // every entity is polygon- or marker-reachable
    totalGeometries: features.length,
    matchedGeometries,
    matchedAtlasIds,
    entitiesWithoutPolygon,
    pointMarkerFallbacks,
    excludedGeometries: excluded,
    duplicateMappings,
    unresolvedEntities,
  };
}

// ── Search & list helpers ─────────────────────────────────────────────────────

/** Fold diacritics so "Turkiye" matches "Türkiye". */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Entities sorted alphabetically by display name (locale-aware). */
export function sortedEntities(entities: AtlasEntity[] = ATLAS_ENTITIES): AtlasEntity[] {
  return [...entities].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Filter entities by a search query against name and ISO alpha-3.
 * Empty query returns all (sorted). Diacritic- and case-insensitive.
 */
export function filterEntities(query: string, entities: AtlasEntity[] = ATLAS_ENTITIES): AtlasEntity[] {
  const q = normalize(query);
  const base = sortedEntities(entities);
  if (!q) return base;
  return base.filter(e => normalize(e.name).includes(q) || (e.iso3 ? normalize(e.iso3).includes(q) : false));
}

// ── Curriculum scope filtering ────────────────────────────────────────────────

export type AtlasScope = 'core' | 'profiled' | 'all';

/**
 * Filter entities by curriculum scope. This is a VIEW concern only — every
 * entity remains a valid, navigable registry entry regardless of scope.
 *  - 'all'      → every canonical entity
 *  - 'core'     → the Core Atlas learning set (static config)
 *  - 'profiled' → entities that currently have an imported profile
 */
export function filterByScope(
  scope: AtlasScope,
  profileIds: Set<string>,
  entities: AtlasEntity[] = ATLAS_ENTITIES,
): AtlasEntity[] {
  switch (scope) {
    case 'core': return entities.filter(e => CORE_ATLAS_IDS.has(e.atlasId));
    case 'profiled': return entities.filter(e => profileIds.has(e.atlasId));
    case 'all': default: return entities;
  }
}

// ── Map classification & route resolution ─────────────────────────────────────

export type EntityMapStatus = 'profile' | 'empty';

/** Whether an entity should render as "has profile" or "empty" on the map. */
export function classifyForMap(atlasId: string, profileIds: Set<string>): EntityMapStatus {
  return profileIds.has(atlasId) ? 'profile' : 'empty';
}

export interface AtlasRouteState {
  entity: AtlasEntity | undefined;
  hasProfile: boolean;
  /** True when the atlasId is not a known registry entity. */
  notFound: boolean;
}

/** Resolve a route param to registry entity + profile presence. */
export function resolveAtlasRoute(atlasId: string, profileIds: Set<string>): AtlasRouteState {
  const entity = ATLAS_ENTITIES.find(e => e.atlasId === atlasId);
  return { entity, hasProfile: !!entity && profileIds.has(atlasId), notFound: !entity };
}
