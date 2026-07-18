import { getEntityByAtlasId } from '@/lib/data/atlasEntities';
import type { AtlasCountry, KnowledgeConcept, KnowledgeDomain } from '@/types';
import type { EntityLink } from '@/lib/logic/atlasProfile';

// ─────────────────────────────────────────────────────────────────────────────
// Atlas ⇄ Vault connections (Stage 7, pure — no DOM, no writes)
//
// Relationships are authored one-directionally on Atlas profiles via
// `relatedConceptIds` (resolved from imported `relatedConceptTitles`). Both the
// forward (Atlas → concept) and reverse (concept → Atlas) views are DERIVED at
// read time — no second copy is stored, so re-import updates both automatically.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConceptLink { id: string; title: string; }

/**
 * Atlas profile → Vault concepts. Resolves ids against current concepts,
 * dropping missing/deleted ids and de-duplicating. Order preserved.
 */
export function resolveConceptLinks(
  relatedConceptIds: string[] | undefined,
  concepts: KnowledgeConcept[],
): ConceptLink[] {
  const byId = new Map(concepts.map(c => [c.id, c]));
  const out: ConceptLink[] = [];
  const seen = new Set<string>();
  for (const id of relatedConceptIds ?? []) {
    if (seen.has(id)) continue;
    const c = byId.get(id);
    if (!c) continue; // missing or deleted → ignored safely
    seen.add(id);
    out.push({ id: c.id, title: c.title });
  }
  return out;
}

/**
 * Vault concept → Atlas entities. Reverse lookup derived from all profiles:
 * every profile whose relatedConceptIds contains `conceptId`. Deduped by
 * atlasId and sorted by display name.
 */
export function atlasEntitiesForConcept(
  conceptId: string,
  profiles: AtlasCountry[],
): EntityLink[] {
  const out: EntityLink[] = [];
  const seen = new Set<string>();
  for (const p of profiles) {
    if (seen.has(p.atlasId)) continue;
    if ((p.relatedConceptIds ?? []).includes(conceptId)) {
      seen.add(p.atlasId);
      const e = getEntityByAtlasId(p.atlasId);
      out.push({ atlasId: p.atlasId, name: e?.name ?? p.name });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Concept catalog (authoring helper) ────────────────────────────────────────

export interface CatalogEntry { title: string; domain?: string; }

/**
 * A minimal catalog of exact concept titles (+ optional domain for
 * disambiguation) for use in an external content-generation chat. Deliberately
 * excludes summaries, notes, completion/review data, and concept bodies.
 */
export function buildConceptCatalog(
  concepts: KnowledgeConcept[],
  domains: KnowledgeDomain[],
): CatalogEntry[] {
  const domainName = new Map(domains.map(d => [d.id, d.name]));
  return [...concepts]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(c => {
      const domain = domainName.get(c.primaryDomainId);
      return domain ? { title: c.title, domain } : { title: c.title };
    });
}

/** Stable JSON representation of the catalog for copying/exporting. */
export function formatConceptCatalog(entries: CatalogEntry[]): string {
  return JSON.stringify({ type: 'levelup-concept-catalog', version: 1, concepts: entries }, null, 2);
}

// ── Personal-note dirty state ─────────────────────────────────────────────────

/** True when a draft note differs from the last saved value (empty-safe). */
export function isNoteDirty(draft: string, saved: string | undefined): boolean {
  return draft !== (saved ?? '');
}
