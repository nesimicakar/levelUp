import { getEntityByAtlasId } from '@/lib/data/atlasEntities';
import { resolveConceptLinks } from '@/lib/logic/atlasLinks';
import type { ResolvedNeighbor } from '@/lib/logic/atlasTopology';
import type {
  AtlasCountry,
  AtlasEntity,
  AtlasEntityStatus,
  AtlasMetric,
  KnowledgeConcept,
} from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Profile view-model (Stage 4)
//
// Pure transform of (registry entity + optional profile + derived land neighbors
// + Vault concepts) into a render-ready view. All "hide empty section" and
// metric-formatting decisions live here so the page is a thin renderer and the
// behavior is unit-testable without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<AtlasEntityStatus, string> = {
  sovereign: 'Sovereign state',
  partial: 'Partially recognized state',
  territory: 'Territory',
  disputed: 'Disputed area',
};

export interface EntityLink { atlasId: string; name: string; }
export interface NeighborLink extends EntityLink { curated: boolean; }

export interface FormattedMetric {
  label: string;
  /** Clean value + unit, e.g. "85M people", "$1.1T". */
  value: string;
  /** Provenance, e.g. "as of 2024 · UN WPP". Omitted when neither present. */
  meta?: string;
}

export interface SnapshotVM {
  facts: { label: string; value: string }[];   // timeless descriptors
  metrics: FormattedMetric[];                    // dated/sourced figures
}

export interface GeographyVM {
  overview?: string;
  terrain?: string;
  climate?: string;
  majorRegions: string[];
  mountains: string[];
  rivers: string[];
  lakes: string[];
  seasAndOceans: string[];
  naturalResources: string[];
  maritimeNeighbors: EntityLink[];
}

export interface EconomyVM {
  overview?: string;
  industries: string[];        // majorIndustries, falling back to legacy keyIndustries
  exports: string[];           // majorExports, falling back to legacy exports
  imports: string[];           // majorImports
  naturalResources: string[];  // legacy economy.naturalResources
  strengths: string[];
  challenges: string[];
}

export interface RelationshipsVM {
  overview?: string;
  alliances: string[];
  partners: EntityLink[];
  rivals: EntityLink[];
}

export interface AtlasProfileView {
  header: { name: string; statusLabel: string; status: AtlasEntityStatus; iso3?: string; region: string };
  hasProfile: boolean;
  landNeighbors: NeighborLink[];
  summary?: string;
  snapshot: SnapshotVM | null;
  geography: GeographyVM | null;
  economy: EconomyVM | null;
  relationships: RelationshipsVM | null;
  history?: string;
  whyItMatters?: string;
  rememberThese: string[];
  extraSections: { title: string; body: string }[];
  relatedConcepts: EntityLink[]; // {atlasId} reused as concept id
  personalNotes?: string;
}

// ── Number & metric formatting ────────────────────────────────────────────────

const UNIT_DISPLAY: Record<string, string> = { km2: 'km²', 'USD/capita': 'per capita' };
const SILENT_UNITS = new Set(['people', 'persons']);

function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('en-US').format(value);
}

/** Format a metric's value + unit. Prefers author-supplied `display`. */
export function formatMetricValue(m: AtlasMetric): string {
  if (m.display && m.display.trim()) return m.display.trim();
  if (m.unit === 'USD') return `$${formatNumber(m.value)}`;
  const num = formatNumber(m.value);
  if (!m.unit || SILENT_UNITS.has(m.unit)) return num;
  return `${num} ${UNIT_DISPLAY[m.unit] ?? m.unit}`;
}

/** Build provenance meta ("as of 2024 · UN WPP"), or undefined if none. */
export function formatMetricMeta(m: AtlasMetric): string | undefined {
  const parts: string[] = [];
  if (m.asOf && m.asOf.trim()) parts.push(`as of ${m.asOf.trim()}`);
  if (m.source && m.source.trim()) parts.push(m.source.trim());
  return parts.length ? parts.join(' · ') : undefined;
}

function formatMetric(label: string, m: AtlasMetric | undefined): FormattedMetric | null {
  if (!m) return null;
  return { label, value: formatMetricValue(m), meta: formatMetricMeta(m) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toEntityLinks(ids: string[] | undefined): EntityLink[] {
  if (!ids) return [];
  const out: EntityLink[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const e = getEntityByAtlasId(id);
    if (e) { out.push({ atlasId: e.atlasId, name: e.name }); seen.add(id); }
  }
  return out;
}

function nonEmptyStr(s: string | undefined): string | undefined {
  return s && s.trim() ? s : undefined;
}

function arr(a: string[] | undefined): string[] {
  return (a ?? []).filter(x => x && x.trim());
}

// ── Builder ───────────────────────────────────────────────────────────────────

function toNeighborLinks(neighbors: ResolvedNeighbor[]): NeighborLink[] {
  const out: NeighborLink[] = [];
  for (const n of neighbors) {
    const e = getEntityByAtlasId(n.atlasId);
    if (e) out.push({ atlasId: e.atlasId, name: e.name, curated: n.curated });
  }
  return out;
}

export function buildAtlasProfileView(
  entity: AtlasEntity,
  profile: AtlasCountry | undefined,
  landNeighbors: ResolvedNeighbor[],
  concepts: KnowledgeConcept[],
): AtlasProfileView {
  const header = {
    name: profile?.name ?? entity.name,
    statusLabel: STATUS_LABEL[entity.status],
    status: entity.status,
    iso3: entity.iso3,
    region: entity.region,
  };
  const neighborLinks = toNeighborLinks(landNeighbors);

  if (!profile) {
    return {
      header, hasProfile: false, landNeighbors: neighborLinks,
      snapshot: null, geography: null, economy: null, relationships: null,
      rememberThese: [], extraSections: [], relatedConcepts: [],
    };
  }

  // Snapshot: split timeless descriptors from dated/sourced metrics.
  const s = profile.snapshot ?? {};
  const facts: { label: string; value: string }[] = [];
  if (nonEmptyStr(s.capital)) facts.push({ label: 'Capital', value: s.capital! });
  if (nonEmptyStr(s.largestCity)) facts.push({ label: 'Largest city', value: s.largestCity! });
  if (arr(s.majorCities).length) facts.push({ label: 'Major cities', value: arr(s.majorCities).join(', ') });
  if (arr(s.officialLanguages).length) facts.push({ label: 'Languages', value: arr(s.officialLanguages).join(', ') });
  if (nonEmptyStr(s.currency)) facts.push({ label: 'Currency', value: s.currency! });
  if (nonEmptyStr(s.government)) facts.push({ label: 'Government', value: s.government! });

  const metrics = [
    formatMetric('Population', s.population),
    formatMetric('Area', s.area),
    formatMetric('GDP (nominal)', s.gdpNominal),
    formatMetric('GDP per capita', s.gdpPerCapita),
  ].filter((m): m is FormattedMetric => m !== null);

  const snapshot: SnapshotVM | null = facts.length || metrics.length ? { facts, metrics } : null;

  const g = profile.geography ?? {};
  const maritimeNeighbors = toEntityLinks(g.maritimeNeighborIds);
  const geo: GeographyVM = {
    overview: nonEmptyStr(g.overview),
    terrain: nonEmptyStr(g.terrain),
    climate: nonEmptyStr(g.climate),
    majorRegions: arr(g.majorRegions),
    mountains: arr(g.mountains),
    rivers: arr(g.rivers),
    lakes: arr(g.lakes),
    seasAndOceans: arr(g.seasAndOceans),
    naturalResources: arr(g.naturalResources),
    maritimeNeighbors,
  };
  const geographyHasContent =
    geo.overview || geo.terrain || geo.climate ||
    geo.majorRegions.length || geo.mountains.length || geo.rivers.length ||
    geo.lakes.length || geo.seasAndOceans.length || geo.naturalResources.length ||
    maritimeNeighbors.length;
  const geography: GeographyVM | null = geographyHasContent ? geo : null;

  const e = profile.economy ?? {};
  // Prefer the promoted "major*" fields; fall back to legacy names.
  const industries = arr(e.majorIndustries).length ? arr(e.majorIndustries) : arr(e.keyIndustries);
  const econExports = arr(e.majorExports).length ? arr(e.majorExports) : arr(e.exports);
  const eco: EconomyVM = {
    overview: nonEmptyStr(e.overview),
    industries,
    exports: econExports,
    imports: arr(e.majorImports),
    naturalResources: arr(e.naturalResources),
    strengths: arr(e.strengths),
    challenges: arr(e.challenges),
  };
  const economyHasContent =
    eco.overview || eco.industries.length || eco.exports.length || eco.imports.length ||
    eco.naturalResources.length || eco.strengths.length || eco.challenges.length;
  const economy: EconomyVM | null = economyHasContent ? eco : null;

  const r = profile.relationships ?? {};
  const partners = toEntityLinks(r.keyPartnerIds);
  const rivals = toEntityLinks(r.keyRivalIds);
  const relationships: RelationshipsVM | null =
    nonEmptyStr(r.overview) || arr(r.alliances).length || partners.length || rivals.length
      ? { overview: nonEmptyStr(r.overview), alliances: arr(r.alliances), partners, rivals }
      : null;

  // Resolve + dedupe + drop missing/deleted ids (atlasId field reused as id).
  const relatedConcepts: EntityLink[] = resolveConceptLinks(profile.relatedConceptIds, concepts)
    .map(l => ({ atlasId: l.id, name: l.title }));

  return {
    header,
    hasProfile: true,
    landNeighbors: neighborLinks,
    summary: nonEmptyStr(profile.summary),
    snapshot,
    geography,
    economy,
    relationships,
    history: nonEmptyStr(profile.history),
    whyItMatters: nonEmptyStr(profile.whyItMatters),
    rememberThese: arr(profile.rememberThese),
    extraSections: (profile.extraSections ?? []).filter(x => nonEmptyStr(x.title) && nonEmptyStr(x.body)),
    relatedConcepts,
    personalNotes: nonEmptyStr(profile.personalNotes),
  };
}
