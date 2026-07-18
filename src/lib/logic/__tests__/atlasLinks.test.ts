import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { LevelUpDB, updateAtlasCountry } from '../../db';
import {
  resolveConceptLinks, atlasEntitiesForConcept,
  buildConceptCatalog, formatConceptCatalog, isNoteDirty,
} from '../atlasLinks';
import { importAtlasPack, exportAllAtlasCountries, type AtlasPackCountry, type AtlasPack } from '../atlasPack';
import type { AtlasCountry, KnowledgeConcept, KnowledgeDomain } from '@/types';

const NOW = 1_700_000_000_000;

function concept(id: string, title: string, domainId = 'd1'): KnowledgeConcept {
  return {
    id, title, summary: '', primaryDomainId: domainId, tags: [], relatedConceptIds: [],
    sourceType: 'manual', retentionScore: 0, reviewCount: 0, reviewIntervalDays: 1,
    nextReviewAt: 0, createdAt: 0, updatedAt: 0,
  };
}
function profile(atlasId: string, name: string, relatedConceptIds: string[] = []): AtlasCountry {
  return {
    atlasId, name, summary: '', snapshot: {}, geography: {}, economy: {}, relationships: {},
    history: '', whyItMatters: '', rememberThese: [], relatedConceptIds, createdAt: 1, updatedAt: 1,
  };
}
function pack(countries: Partial<AtlasPackCountry>[]): AtlasPack {
  return { type: 'levelup-atlas-pack', version: 1, countries: countries as AtlasPackCountry[] };
}

// ── Atlas → Vault ─────────────────────────────────────────────────────────────

describe('resolveConceptLinks (Atlas → Vault)', () => {
  const concepts = [concept('c1', 'Ottoman Empire'), concept('c2', 'NATO')];

  it('resolves ids to concept links', () => {
    expect(resolveConceptLinks(['c1', 'c2'], concepts)).toEqual([
      { id: 'c1', title: 'Ottoman Empire' }, { id: 'c2', title: 'NATO' },
    ]);
  });
  it('ignores missing/deleted ids safely', () => {
    expect(resolveConceptLinks(['c1', 'gone'], concepts)).toEqual([{ id: 'c1', title: 'Ottoman Empire' }]);
  });
  it('removes duplicate links', () => {
    expect(resolveConceptLinks(['c1', 'c1', 'c2'], concepts)).toEqual([
      { id: 'c1', title: 'Ottoman Empire' }, { id: 'c2', title: 'NATO' },
    ]);
  });
  it('empty when no ids', () => {
    expect(resolveConceptLinks(undefined, concepts)).toEqual([]);
  });
});

// ── Vault → Atlas reverse ─────────────────────────────────────────────────────

describe('atlasEntitiesForConcept (Vault → Atlas)', () => {
  const profiles = [
    profile('tur', 'Türkiye', ['c1', 'c2']),
    profile('grc', 'Greece', ['c1']),
    profile('jpn', 'Japan', ['c9']),
  ];

  it('finds entities whose relatedConceptIds include the concept, sorted by name', () => {
    expect(atlasEntitiesForConcept('c1', profiles).map(e => e.atlasId)).toEqual(['grc', 'tur']);
  });
  it('returns empty when no entity links the concept (section hides)', () => {
    expect(atlasEntitiesForConcept('c-none', profiles)).toEqual([]);
  });
  it('dedupes and uses registry display name', () => {
    const dup = [profile('tur', 'TUR-import-name', ['c1']), profile('tur', 'again', ['c1'])];
    const r = atlasEntitiesForConcept('c1', dup);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Türkiye'); // registry name, not import name
  });
});

// ── Reverse links update after re-import ──────────────────────────────────────

describe('reverse links reflect Atlas re-import', () => {
  let db: LevelUpDB;
  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
    await db.knowledgeConcepts.bulkPut([concept('c1', 'Ottoman Empire'), concept('c2', 'NATO')]);
  });

  it('recomputes reverse links when a profile changes its concept titles', async () => {
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'x', relatedConceptTitles: ['Ottoman Empire'] }]), NOW);
    let profiles = await db.atlasCountries.toArray();
    expect(atlasEntitiesForConcept('c1', profiles).map(e => e.atlasId)).toEqual(['tur']);
    expect(atlasEntitiesForConcept('c2', profiles)).toEqual([]);

    // Re-import with a different concept link.
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'x', relatedConceptTitles: ['NATO'] }]), NOW + 1);
    profiles = await db.atlasCountries.toArray();
    expect(atlasEntitiesForConcept('c1', profiles)).toEqual([]);      // dropped
    expect(atlasEntitiesForConcept('c2', profiles).map(e => e.atlasId)).toEqual(['tur']); // added
  });
});

// ── Concept catalog ───────────────────────────────────────────────────────────

describe('concept catalog', () => {
  const concepts = [concept('c2', 'NATO', 'd2'), concept('c1', 'Ottoman Empire', 'd1')];
  const domains: KnowledgeDomain[] = [
    { id: 'd1', name: 'History', icon: '📜', color: '#000', createdAt: 0 },
    { id: 'd2', name: 'Geopolitics', icon: '🌍', color: '#000', createdAt: 0 },
  ];

  it('contains only exact titles + optional domain, sorted by title', () => {
    expect(buildConceptCatalog(concepts, domains)).toEqual([
      { title: 'NATO', domain: 'Geopolitics' },
      { title: 'Ottoman Empire', domain: 'History' },
    ]);
  });
  it('omits domain when unknown; never includes summaries/notes/review data', () => {
    const entry = buildConceptCatalog([concept('c3', 'Orphan', 'missing')], domains);
    expect(entry).toEqual([{ title: 'Orphan' }]);
    const json = formatConceptCatalog(entry);
    expect(json).not.toMatch(/summary|retention|review|personalNotes/i);
  });
  it('formats as stable JSON with exact titles', () => {
    const json = formatConceptCatalog(buildConceptCatalog(concepts, domains));
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('levelup-concept-catalog');
    expect(parsed.concepts.map((c: { title: string }) => c.title)).toEqual(['NATO', 'Ottoman Empire']);
  });
});

// ── Personal notes ────────────────────────────────────────────────────────────

describe('isNoteDirty', () => {
  it('detects changes (empty-safe)', () => {
    expect(isNoteDirty('hello', undefined)).toBe(true);
    expect(isNoteDirty('', undefined)).toBe(false);
    expect(isNoteDirty('a', 'a')).toBe(false);
    expect(isNoteDirty('a', 'b')).toBe(true);
    expect(isNoteDirty('', 'x')).toBe(true); // clearing is dirty
  });
});

describe('personal note persistence', () => {
  let db: LevelUpDB;
  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
    await db.open();
  });

  it('saves a note updating only the note + timestamp', async () => {
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'Bridge.' }]), 100);
    await updateAtlasCountry('tur', { personalNotes: 'my note' });
    const rec = await db.atlasCountries.get('tur');
    expect(rec?.personalNotes).toBe('my note');
    expect(rec?.summary).toBe('Bridge.');       // reference untouched
    expect(rec?.createdAt).toBe(100);           // createdAt untouched
    expect(rec?.updatedAt).toBeGreaterThan(100); // timestamp bumped
  });

  it('cancel semantics: draft resets to saved (modeled by isNoteDirty)', () => {
    const saved = 'original';
    let draft = 'edited';
    expect(isNoteDirty(draft, saved)).toBe(true);
    draft = saved; // cancel restores
    expect(isNoteDirty(draft, saved)).toBe(false);
  });

  it('re-import never overwrites personalNotes', async () => {
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'v1' }]), 100);
    await updateAtlasCountry('tur', { personalNotes: 'keep me' });
    // Re-import with a personalNotes in the pack — must be ignored.
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'v2', personalNotes: 'from pack' } as AtlasPackCountry]), 200);
    expect((await db.atlasCountries.get('tur'))?.personalNotes).toBe('keep me');
  });

  it('survives Atlas export → wipe → re-import', async () => {
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'x' }]), 1);
    await updateAtlasCountry('tur', { personalNotes: 'exported note' });
    const exported: AtlasPack = await exportAllAtlasCountries('2026-01-01T00:00:00.000Z');
    await db.atlasCountries.clear();
    await importAtlasPack(exported, 2);
    expect((await db.atlasCountries.get('tur'))?.personalNotes).toBe('exported note');
  });

  it('survives LevelUp backup → restore (bulkPut round-trip)', async () => {
    await importAtlasPack(pack([{ atlasId: 'tur', name: 'Türkiye', summary: 'x' }]), 1);
    await updateAtlasCountry('tur', { personalNotes: 'backup note' });
    const rows = await db.atlasCountries.toArray();          // backup
    await db.atlasCountries.clear();
    await db.atlasCountries.bulkPut(rows);                   // restore
    expect((await db.atlasCountries.get('tur'))?.personalNotes).toBe('backup note');
  });

  it('profileless entities store nothing (no fake profile is created)', async () => {
    // No import for "jpn": there must be no record to edit.
    expect(await db.atlasCountries.get('jpn')).toBeUndefined();
  });
});
