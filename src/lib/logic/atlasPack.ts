import { db, getAllAtlasCountries, getAllConcepts } from '@/lib/db';
import { getEntityByAtlasId, getEntityByIso3 } from '@/lib/data/atlasEntities';
import type {
  AtlasCountry,
  AtlasEntity,
  AtlasEntityStatus,
  AtlasMetric,
  AtlasSnapshot,
  AtlasGeography,
  AtlasEconomy,
  AtlasRelationships,
  AtlasExtraSection,
  KnowledgeConcept,
} from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// World Atlas pack import/export engine (Stage 2)
//
// Merge contract on re-import:
//   • preserve `personalNotes` and `createdAt` (user-owned)
//   • refresh all reference content from the pack
//   • re-resolve `relatedConceptTitles` against CURRENT Vault concepts and
//     REPLACE `relatedConceptIds` with the result (not blindly preserved)
//   • bump `updatedAt` only when content actually changes
//   • never delete profiles absent from the pack
// ─────────────────────────────────────────────────────────────────────────────

const ATLAS_PACK_TYPE = 'levelup-atlas-pack';
const VALID_STATUSES: AtlasEntityStatus[] = ['sovereign', 'partial', 'territory', 'disputed'];

// ── Pack shapes (permissive input; validated before use) ──────────────────────

export interface AtlasPackMetric {
  value: number;
  unit: string;
  asOf: string;
  source?: string;
  display?: string;
}

export interface AtlasPackCountry {
  atlasId?: string;
  iso3?: string;
  name: string;
  status?: AtlasEntityStatus;
  summary: string;
  snapshot?: AtlasSnapshot;
  geography?: AtlasGeography;
  economy?: AtlasEconomy;
  relationships?: AtlasRelationships;
  history?: string;
  whyItMatters?: string;
  rememberThese?: string[];
  extraSections?: AtlasExtraSection[];
  relatedConceptTitles?: string[];
  personalNotes?: string;
}

export interface AtlasPack {
  type: 'levelup-atlas-pack';
  version: 1;
  exportedAt?: string;
  countries: AtlasPackCountry[];
}

// ── Preview / result shapes ───────────────────────────────────────────────────

export interface AtlasPreviewRow {
  index: number;
  atlasId: string;
  name: string;
  /** Titles in relatedConceptTitles that matched no current Vault concept. */
  unresolvedConceptTitles?: string[];
}

export interface AtlasRejection {
  index: number;
  identifier: string;   // atlasId / iso3 / name, for display
  errors: string[];
}

export interface AtlasConflict {
  index: number;
  atlasId: string;
  identifier: string;
  reason: string;
}

export interface AtlasImportPreview {
  added: AtlasPreviewRow[];
  updated: AtlasPreviewRow[];
  unchanged: AtlasPreviewRow[];
  rejected: AtlasRejection[];
  conflicts: AtlasConflict[];
}

/** A preview plus the concrete records to write (added + updated only). */
export interface AtlasImportPlan {
  preview: AtlasImportPreview;
  toWrite: AtlasCountry[];
}

// ── Envelope validation ───────────────────────────────────────────────────────

export function validateAtlasPack(raw: unknown): AtlasPack {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file: not a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.type !== ATLAS_PACK_TYPE) {
    throw new Error('Not a LevelUp Atlas Pack — missing or wrong "type" field');
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported pack version: ${String(obj.version)}`);
  }
  if (!Array.isArray(obj.countries)) {
    throw new Error('Invalid pack: "countries" must be an array');
  }
  return raw as AtlasPack;
}

// ── Field validators ──────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function checkOptString(v: unknown, path: string, errors: string[]): void {
  if (v !== undefined && typeof v !== 'string') errors.push(`${path} must be a string`);
}

function checkOptStringArray(v: unknown, path: string, errors: string[]): void {
  if (v === undefined) return;
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) {
    errors.push(`${path} must be an array of strings`);
  }
}

function checkOptMetric(v: unknown, path: string, errors: string[]): void {
  if (v === undefined) return;
  if (!isPlainObject(v)) { errors.push(`${path} must be an object`); return; }
  if (typeof v.value !== 'number' || !Number.isFinite(v.value)) {
    errors.push(`${path}.value must be a finite number`);
  }
  if (typeof v.unit !== 'string' || v.unit.trim() === '') {
    errors.push(`${path}.unit must be a non-empty string`);
  }
  if (typeof v.asOf !== 'string' || v.asOf.trim() === '') {
    errors.push(`${path}.asOf must be a non-empty string`);
  }
  if (v.source !== undefined && typeof v.source !== 'string') errors.push(`${path}.source must be a string`);
  if (v.display !== undefined && typeof v.display !== 'string') errors.push(`${path}.display must be a string`);
}

function checkOptExtraSections(v: unknown, path: string, errors: string[]): void {
  if (v === undefined) return;
  if (!Array.isArray(v)) { errors.push(`${path} must be an array`); return; }
  v.forEach((s, i) => {
    if (!isPlainObject(s) || typeof s.title !== 'string' || typeof s.body !== 'string') {
      errors.push(`${path}[${i}] must have string "title" and "body"`);
    }
  });
}

/** Structural validation of one country. Returns errors[] (empty = ok). */
function validateCountryStructure(c: Record<string, unknown>, label: string): string[] {
  const errors: string[] = [];

  const hasAtlasId = typeof c.atlasId === 'string' && c.atlasId.trim() !== '';
  const hasIso3 = typeof c.iso3 === 'string' && c.iso3.trim() !== '';
  if (!hasAtlasId && !hasIso3) errors.push(`${label} must have "atlasId" or "iso3"`);
  if (c.atlasId !== undefined && typeof c.atlasId !== 'string') errors.push(`${label}.atlasId must be a string`);
  if (c.iso3 !== undefined && typeof c.iso3 !== 'string') errors.push(`${label}.iso3 must be a string`);

  if (typeof c.name !== 'string' || c.name.trim() === '') errors.push(`${label} is missing "name"`);
  if (typeof c.summary !== 'string') errors.push(`${label} is missing "summary"`);

  if (c.status !== undefined && !VALID_STATUSES.includes(c.status as AtlasEntityStatus)) {
    errors.push(`${label}.status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  checkOptString(c.history, `${label}.history`, errors);
  checkOptString(c.whyItMatters, `${label}.whyItMatters`, errors);
  checkOptStringArray(c.rememberThese, `${label}.rememberThese`, errors);
  checkOptStringArray(c.relatedConceptTitles, `${label}.relatedConceptTitles`, errors);
  checkOptString(c.personalNotes, `${label}.personalNotes`, errors);
  checkOptExtraSections(c.extraSections, `${label}.extraSections`, errors);

  if (c.snapshot !== undefined) {
    if (!isPlainObject(c.snapshot)) errors.push(`${label}.snapshot must be an object`);
    else {
      const s = c.snapshot;
      checkOptString(s.capital, `${label}.snapshot.capital`, errors);
      checkOptString(s.largestCity, `${label}.snapshot.largestCity`, errors);
      checkOptString(s.currency, `${label}.snapshot.currency`, errors);
      checkOptString(s.government, `${label}.snapshot.government`, errors);
      checkOptStringArray(s.majorCities, `${label}.snapshot.majorCities`, errors);
      checkOptStringArray(s.officialLanguages, `${label}.snapshot.officialLanguages`, errors);
      checkOptMetric(s.population, `${label}.snapshot.population`, errors);
      checkOptMetric(s.area, `${label}.snapshot.area`, errors);
      checkOptMetric(s.gdpNominal, `${label}.snapshot.gdpNominal`, errors);
      checkOptMetric(s.gdpPerCapita, `${label}.snapshot.gdpPerCapita`, errors);
    }
  }
  if (c.geography !== undefined) {
    if (!isPlainObject(c.geography)) errors.push(`${label}.geography must be an object`);
    else {
      const g = c.geography;
      checkOptString(g.overview, `${label}.geography.overview`, errors);
      checkOptString(g.terrain, `${label}.geography.terrain`, errors);
      checkOptString(g.climate, `${label}.geography.climate`, errors);
      checkOptStringArray(g.majorRegions, `${label}.geography.majorRegions`, errors);
      checkOptStringArray(g.mountains, `${label}.geography.mountains`, errors);
      checkOptStringArray(g.rivers, `${label}.geography.rivers`, errors);
      checkOptStringArray(g.lakes, `${label}.geography.lakes`, errors);
      checkOptStringArray(g.seasAndOceans, `${label}.geography.seasAndOceans`, errors);
      checkOptStringArray(g.naturalResources, `${label}.geography.naturalResources`, errors);
      checkOptStringArray(g.maritimeNeighborIds, `${label}.geography.maritimeNeighborIds`, errors);
    }
  }
  if (c.economy !== undefined) {
    if (!isPlainObject(c.economy)) errors.push(`${label}.economy must be an object`);
    else {
      const e = c.economy;
      checkOptString(e.overview, `${label}.economy.overview`, errors);
      checkOptStringArray(e.keyIndustries, `${label}.economy.keyIndustries`, errors);
      checkOptStringArray(e.naturalResources, `${label}.economy.naturalResources`, errors);
      checkOptStringArray(e.exports, `${label}.economy.exports`, errors);
      checkOptStringArray(e.majorIndustries, `${label}.economy.majorIndustries`, errors);
      checkOptStringArray(e.majorExports, `${label}.economy.majorExports`, errors);
      checkOptStringArray(e.majorImports, `${label}.economy.majorImports`, errors);
      checkOptStringArray(e.strengths, `${label}.economy.strengths`, errors);
      checkOptStringArray(e.challenges, `${label}.economy.challenges`, errors);
    }
  }
  if (c.relationships !== undefined) {
    if (!isPlainObject(c.relationships)) errors.push(`${label}.relationships must be an object`);
    else {
      const r = c.relationships;
      checkOptString(r.overview, `${label}.relationships.overview`, errors);
      checkOptStringArray(r.alliances, `${label}.relationships.alliances`, errors);
      checkOptStringArray(r.keyPartnerIds, `${label}.relationships.keyPartnerIds`, errors);
      checkOptStringArray(r.keyRivalIds, `${label}.relationships.keyRivalIds`, errors);
    }
  }

  return errors;
}

// ── Normalizers (build clean reference content, omitting empty optionals) ──────

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

function normalizeMetric(m: AtlasPackMetric | undefined): AtlasMetric | undefined {
  if (!m) return undefined;
  return pruneUndefined({
    value: m.value,
    unit: m.unit,
    asOf: m.asOf,
    source: m.source,
    display: m.display,
  }) as AtlasMetric;
}

function normalizeSnapshot(s: AtlasSnapshot | undefined): AtlasSnapshot {
  if (!s) return {};
  return pruneUndefined({
    capital: s.capital,
    largestCity: s.largestCity,
    majorCities: s.majorCities,
    officialLanguages: s.officialLanguages,
    currency: s.currency,
    government: s.government,
    population: normalizeMetric(s.population as AtlasPackMetric | undefined),
    area: normalizeMetric(s.area as AtlasPackMetric | undefined),
    gdpNominal: normalizeMetric(s.gdpNominal as AtlasPackMetric | undefined),
    gdpPerCapita: normalizeMetric(s.gdpPerCapita as AtlasPackMetric | undefined),
  });
}

function normalizeGeography(g: AtlasGeography | undefined): AtlasGeography {
  if (!g) return {};
  return pruneUndefined({
    overview: g.overview,
    terrain: g.terrain,
    climate: g.climate,
    majorRegions: g.majorRegions,
    mountains: g.mountains,
    rivers: g.rivers,
    lakes: g.lakes,
    seasAndOceans: g.seasAndOceans,
    naturalResources: g.naturalResources,
    maritimeNeighborIds: g.maritimeNeighborIds,
  });
}

function normalizeEconomy(e: AtlasEconomy | undefined): AtlasEconomy {
  if (!e) return {};
  return pruneUndefined({
    overview: e.overview,
    keyIndustries: e.keyIndustries,
    naturalResources: e.naturalResources,
    exports: e.exports,
    majorIndustries: e.majorIndustries,
    majorExports: e.majorExports,
    majorImports: e.majorImports,
    strengths: e.strengths,
    challenges: e.challenges,
  });
}

function normalizeRelationships(r: AtlasRelationships | undefined): AtlasRelationships {
  if (!r) return {};
  return pruneUndefined({
    overview: r.overview,
    alliances: r.alliances,
    keyPartnerIds: r.keyPartnerIds,
    keyRivalIds: r.keyRivalIds,
  });
}

// ── Canonical content comparison (excludes updatedAt) ─────────────────────────

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`).join(',')}}`;
}

function sameContent(a: AtlasCountry, b: AtlasCountry): boolean {
  const strip = (c: AtlasCountry) => {
    const { updatedAt: _omit, ...rest } = c;
    return rest;
  };
  return stableStringify(strip(a)) === stableStringify(strip(b));
}

// ── Concept title resolution ──────────────────────────────────────────────────

function buildTitleIndex(concepts: KnowledgeConcept[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of concepts) {
    const key = c.title.toLowerCase();
    if (!map.has(key)) map.set(key, c.id); // first occurrence wins (deterministic)
  }
  return map;
}

/** Resolve titles → concept ids (deduped, ordered). Returns ids + unresolved titles. */
function resolveConceptTitles(
  titles: string[] | undefined,
  titleIndex: Map<string, string>,
): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const t of titles ?? []) {
    const id = titleIndex.get(t.toLowerCase());
    if (!id) { unresolved.push(t); continue; }
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return { ids, unresolved };
}

// ── Core planning (pure: no DB access) ────────────────────────────────────────

interface ValidEntry {
  index: number;
  atlasId: string;
  entity: AtlasEntity;
  pack: AtlasPackCountry;
}

/**
 * Build a full import plan from a validated pack and current DB state.
 * Pure and deterministic — `now` is injected so callers/tests control timestamps.
 */
export function buildAtlasImportPlan(
  pack: AtlasPack,
  existingProfiles: AtlasCountry[],
  concepts: KnowledgeConcept[],
  now: number,
): AtlasImportPlan {
  const preview: AtlasImportPreview = { added: [], updated: [], unchanged: [], rejected: [], conflicts: [] };
  const existingMap = new Map(existingProfiles.map(p => [p.atlasId, p]));
  const titleIndex = buildTitleIndex(concepts);

  // Pass 1: structural validation + identity resolution.
  const valid: ValidEntry[] = [];
  pack.countries.forEach((raw, index) => {
    const c = (isPlainObject(raw) ? raw : {}) as Record<string, unknown>;
    const displayName = typeof c.name === 'string' && c.name.trim() ? c.name : `#${index}`;
    const identifier =
      (typeof c.atlasId === 'string' && c.atlasId) ||
      (typeof c.iso3 === 'string' && c.iso3) ||
      displayName;
    const label = `countries[${index}] ("${displayName}")`;

    if (!isPlainObject(raw)) {
      preview.rejected.push({ index, identifier: `#${index}`, errors: [`countries[${index}] is not an object`] });
      return;
    }

    const structErrors = validateCountryStructure(c, label);
    if (structErrors.length > 0) {
      preview.rejected.push({ index, identifier, errors: structErrors });
      return;
    }

    const pc = c as unknown as AtlasPackCountry;
    const rawAtlasId = pc.atlasId?.trim();
    const rawIso3 = pc.iso3?.trim().toUpperCase();

    // Resolve entity — atlasId takes precedence, else iso3.
    let entity: AtlasEntity | undefined;
    if (rawAtlasId) {
      entity = getEntityByAtlasId(rawAtlasId) ?? getEntityByAtlasId(rawAtlasId.toLowerCase());
      if (!entity) {
        preview.rejected.push({ index, identifier, errors: [`${label}: unknown atlasId "${rawAtlasId}" (not in registry)`] });
        return;
      }
    } else if (rawIso3) {
      entity = getEntityByIso3(rawIso3);
      if (!entity) {
        preview.rejected.push({ index, identifier, errors: [`${label}: unknown iso3 "${rawIso3}" (not in registry)`] });
        return;
      }
    }
    if (!entity) {
      preview.rejected.push({ index, identifier, errors: [`${label}: could not resolve identity`] });
      return;
    }

    // Identity conflicts: iso3 provided must match the registry entry.
    if (rawIso3) {
      const registryIso3 = entity.iso3?.toUpperCase();
      if (registryIso3 !== rawIso3) {
        preview.conflicts.push({
          index, atlasId: entity.atlasId, identifier,
          reason: `iso3 "${rawIso3}" does not match registry (${registryIso3 ? `expected "${registryIso3}"` : 'entity has no ISO alpha-3'}) for atlasId "${entity.atlasId}"`,
        });
        return;
      }
    }
    // Status, if provided, must match the registry classification.
    if (pc.status && pc.status !== entity.status) {
      preview.conflicts.push({
        index, atlasId: entity.atlasId, identifier,
        reason: `status "${pc.status}" does not match registry status "${entity.status}"`,
      });
      return;
    }

    valid.push({ index, atlasId: entity.atlasId, entity, pack: pc });
  });

  // Duplicate atlasId within the pack → reject every occurrence.
  const counts = new Map<string, number>();
  for (const v of valid) counts.set(v.atlasId, (counts.get(v.atlasId) ?? 0) + 1);
  const deduped: ValidEntry[] = [];
  for (const v of valid) {
    if ((counts.get(v.atlasId) ?? 0) > 1) {
      preview.rejected.push({
        index: v.index,
        identifier: v.atlasId,
        errors: [`duplicate atlasId "${v.atlasId}" appears ${counts.get(v.atlasId)} times in this pack`],
      });
    } else {
      deduped.push(v);
    }
  }

  // Pass 2: build records, resolve concept titles, classify, and stage writes.
  const toWrite: AtlasCountry[] = [];
  for (const v of deduped) {
    const existing = existingMap.get(v.atlasId);
    const { ids: relatedConceptIds, unresolved } = resolveConceptTitles(v.pack.relatedConceptTitles, titleIndex);

    const base: AtlasCountry = pruneUndefined({
      atlasId: v.atlasId,
      iso3: v.entity.iso3,                       // canonical, from registry
      name: v.pack.name,
      summary: v.pack.summary,
      snapshot: normalizeSnapshot(v.pack.snapshot),
      geography: normalizeGeography(v.pack.geography),
      economy: normalizeEconomy(v.pack.economy),
      relationships: normalizeRelationships(v.pack.relationships),
      history: v.pack.history ?? '',
      whyItMatters: v.pack.whyItMatters ?? '',
      rememberThese: v.pack.rememberThese ?? [],
      extraSections: v.pack.extraSections && v.pack.extraSections.length > 0 ? v.pack.extraSections : undefined,
      relatedConceptIds,
      // user-owned fields:
      personalNotes: existing ? existing.personalNotes : (v.pack.personalNotes || undefined),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: existing ? existing.updatedAt : now,
    }) as AtlasCountry;

    const row: AtlasPreviewRow = { index: v.index, atlasId: v.atlasId, name: v.pack.name };
    if (unresolved.length > 0) row.unresolvedConceptTitles = unresolved;

    if (!existing) {
      preview.added.push(row);
      toWrite.push(base);
    } else if (!sameContent(existing, base)) {
      const updated = { ...base, updatedAt: now };
      preview.updated.push(row);
      toWrite.push(updated);
    } else {
      preview.unchanged.push(row); // no write, updatedAt untouched
    }
  }

  return { preview, toWrite };
}

// ── DB-backed orchestration ───────────────────────────────────────────────────

/** Compute a plan against current DB state without writing anything. */
export async function planAtlasImport(pack: AtlasPack, now: number = Date.now()): Promise<AtlasImportPlan> {
  const [existing, concepts] = await Promise.all([getAllAtlasCountries(), getAllConcepts()]);
  return buildAtlasImportPlan(pack, existing, concepts, now);
}

/** Apply a plan: writes only added + updated. Absent profiles are never touched. */
export async function applyAtlasImportPlan(plan: AtlasImportPlan): Promise<AtlasImportPreview> {
  if (plan.toWrite.length > 0) {
    await db.transaction('rw', db.atlasCountries, async () => {
      await db.atlasCountries.bulkPut(plan.toWrite);
    });
  }
  return plan.preview;
}

/** Convenience: plan against current DB state and apply in one call. */
export async function importAtlasPack(pack: AtlasPack, now: number = Date.now()): Promise<AtlasImportPreview> {
  const plan = await planAtlasImport(pack, now);
  return applyAtlasImportPlan(plan);
}

// ── Export ────────────────────────────────────────────────────────────────────

function toPackCountry(profile: AtlasCountry, conceptIdToTitle: Map<string, string>): AtlasPackCountry {
  const entity = getEntityByAtlasId(profile.atlasId);
  const relatedConceptTitles = profile.relatedConceptIds
    .map(id => conceptIdToTitle.get(id))
    .filter((t): t is string => t !== undefined);

  return pruneUndefined({
    atlasId: profile.atlasId,
    iso3: profile.iso3,
    name: profile.name,
    status: entity?.status,
    summary: profile.summary,
    snapshot: Object.keys(profile.snapshot).length ? profile.snapshot : undefined,
    geography: Object.keys(profile.geography).length ? profile.geography : undefined,
    economy: Object.keys(profile.economy).length ? profile.economy : undefined,
    relationships: Object.keys(profile.relationships).length ? profile.relationships : undefined,
    history: profile.history || undefined,
    whyItMatters: profile.whyItMatters || undefined,
    rememberThese: profile.rememberThese.length ? profile.rememberThese : undefined,
    extraSections: profile.extraSections && profile.extraSections.length ? profile.extraSections : undefined,
    relatedConceptTitles: relatedConceptTitles.length ? relatedConceptTitles : undefined,
    personalNotes: profile.personalNotes || undefined,
  }) as AtlasPackCountry;
}

function packEnvelope(countries: AtlasPackCountry[], exportedAt: string): AtlasPack {
  return { type: ATLAS_PACK_TYPE, version: 1, exportedAt, countries };
}

/** Export a single profile as a one-country pack (null if it doesn't exist). */
export async function exportAtlasCountry(atlasId: string, exportedAt: string = new Date().toISOString()): Promise<AtlasPack | null> {
  const [profile, concepts] = await Promise.all([db.atlasCountries.get(atlasId), getAllConcepts()]);
  if (!profile) return null;
  const idToTitle = new Map(concepts.map(c => [c.id, c.title]));
  return packEnvelope([toPackCountry(profile, idToTitle)], exportedAt);
}

/** Export every profile as a batch pack. */
export async function exportAllAtlasCountries(exportedAt: string = new Date().toISOString()): Promise<AtlasPack> {
  const [profiles, concepts] = await Promise.all([getAllAtlasCountries(), getAllConcepts()]);
  const idToTitle = new Map(concepts.map(c => [c.id, c.title]));
  return packEnvelope(profiles.map(p => toPackCountry(p, idToTitle)), exportedAt);
}

// ── Download helper (mirrors vaultPack) ───────────────────────────────────────

export function downloadAtlasPack(pack: AtlasPack, filename?: string): void {
  const json = JSON.stringify(pack, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `atlas-pack-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
