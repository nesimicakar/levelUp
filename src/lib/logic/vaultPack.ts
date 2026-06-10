import { getAllDomains, getAllConcepts, addDomain, addConcept, updateConcept } from '@/lib/db';
import type { KnowledgeDomain, KnowledgeConcept, KnowledgeSourceType, KeyIdea } from '@/types';

// ── Vault Pack format ─────────────────────────────────────────────────────────

export interface VaultPackDomain {
  id?: string;
  name: string;
  icon: string;
  color: string;
}

export interface VaultPackConcept {
  id?: string;
  title: string;
  domainName: string;
  summary: string;
  keyIdeas?: KeyIdea[];
  keyTakeaways?: string[];      // legacy; kept for backward compat on import
  personalNotes?: string;
  tags?: string[];
  relatedConceptTitles?: string[];
  sourceType?: string;
  sourceTitle?: string;
}

export interface VaultPack {
  type: 'levelup-vault-pack';
  version: 1;
  exportedAt: string;
  domains: VaultPackDomain[];
  concepts: VaultPackConcept[];
}

export interface ImportResult {
  domainsCreated: number;
  domainsReused: number;
  conceptsImported: number;
  conceptsSkipped: number;
  errors: string[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateVaultPack(raw: unknown): VaultPack {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file: not a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'levelup-vault-pack') {
    throw new Error('Not a LevelUp Vault Pack — missing or wrong "type" field');
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported pack version: ${obj.version}`);
  }
  if (!Array.isArray(obj.domains)) {
    throw new Error('Invalid pack: "domains" must be an array');
  }
  if (!Array.isArray(obj.concepts)) {
    throw new Error('Invalid pack: "concepts" must be an array');
  }
  for (let i = 0; i < (obj.domains as unknown[]).length; i++) {
    const d = (obj.domains as unknown[])[i];
    if (!d || typeof d !== 'object') throw new Error(`domains[${i}] is not an object`);
    if (typeof (d as Record<string, unknown>).name !== 'string') {
      throw new Error(`domains[${i}] is missing "name"`);
    }
  }
  for (let i = 0; i < (obj.concepts as unknown[]).length; i++) {
    const c = (obj.concepts as unknown[])[i];
    if (!c || typeof c !== 'object') throw new Error(`concepts[${i}] is not an object`);
    const co = c as Record<string, unknown>;
    if (typeof co.title !== 'string') throw new Error(`concepts[${i}] is missing "title"`);
    if (typeof co.domainName !== 'string') throw new Error(`concepts[${i}] is missing "domainName"`);
    if (typeof co.summary !== 'string') throw new Error(`concepts[${i}] ("${co.title}") is missing "summary"`);
  }
  return raw as VaultPack;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Accepts keyIdeas from any external source; normalizes `description` → `body`
// so hand-authored or AI-generated packs don't silently drop explanation text.
function normalizeKeyIdeas(raw: unknown[] | undefined): KeyIdea[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      title: typeof item.title === 'string' ? item.title : '',
      body: typeof item.body === 'string'
        ? item.body
        : typeof item.description === 'string'
          ? item.description
          : '',
    }))
    .filter(k => k.title || k.body);
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importVaultPack(pack: VaultPack): Promise<ImportResult> {
  const result: ImportResult = {
    domainsCreated: 0,
    domainsReused: 0,
    conceptsImported: 0,
    conceptsSkipped: 0,
    errors: [],
  };

  // Load existing state
  const existingDomains = await getAllDomains();
  const existingConcepts = await getAllConcepts();

  // Build domain name → id map (case-insensitive)
  const domainMap = new Map<string, string>();
  for (const d of existingDomains) {
    domainMap.set(d.name.toLowerCase(), d.id);
  }

  // 1. Process domains from the pack
  for (const pd of pack.domains) {
    const key = pd.name.toLowerCase();
    if (domainMap.has(key)) {
      result.domainsReused++;
    } else {
      const newDomain: KnowledgeDomain = {
        id: crypto.randomUUID(),
        name: pd.name,
        icon: pd.icon ?? '📚',
        color: pd.color ?? '#64748b',
        createdAt: Date.now(),
      };
      await addDomain(newDomain);
      domainMap.set(key, newDomain.id);
      result.domainsCreated++;
    }
  }

  // Build existing concept lookup: "domainId|titleLower" → concept id
  const existingConceptKey = (domainId: string, title: string) =>
    `${domainId}|${title.toLowerCase()}`;
  const existingMap = new Map<string, string>();
  for (const c of existingConcepts) {
    existingMap.set(existingConceptKey(c.primaryDomainId, c.title), c.id);
  }

  // Track newly imported concepts: titleLower → new concept id (for relation resolution)
  const importedByTitle = new Map<string, string>();

  // 2. Import concepts
  for (const pc of pack.concepts) {
    // Resolve domain — if not in pack domains, auto-create it
    const domainKey = pc.domainName.toLowerCase();
    let domainId = domainMap.get(domainKey);
    if (!domainId) {
      const newDomain: KnowledgeDomain = {
        id: crypto.randomUUID(),
        name: pc.domainName,
        icon: '📚',
        color: '#64748b',
        createdAt: Date.now(),
      };
      await addDomain(newDomain);
      domainMap.set(domainKey, newDomain.id);
      domainId = newDomain.id;
      result.domainsCreated++;
    }

    // Skip if concept already exists in this domain
    if (existingMap.has(existingConceptKey(domainId, pc.title))) {
      result.conceptsSkipped++;
      continue;
    }

    const now = Date.now();
    const newConcept: KnowledgeConcept = {
      id: crypto.randomUUID(),
      title: pc.title,
      summary: pc.summary,
      keyIdeas: normalizeKeyIdeas(pc.keyIdeas),
      keyTakeaways: pc.keyTakeaways && pc.keyTakeaways.length > 0 ? pc.keyTakeaways : undefined,
      personalNotes: pc.personalNotes || undefined,
      primaryDomainId: domainId,
      tags: pc.tags ?? [],
      relatedConceptIds: [], // resolved in second pass
      sourceType: (pc.sourceType as KnowledgeSourceType) ?? 'manual',
      sourceTitle: pc.sourceTitle || undefined,
      retentionScore: 0,
      reviewCount: 0,
      reviewIntervalDays: 1,
      nextReviewAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await addConcept(newConcept);
    importedByTitle.set(pc.title.toLowerCase(), newConcept.id);
    result.conceptsImported++;
  }

  // 3. Resolve relatedConceptTitles (second pass, after all concepts exist)
  if (importedByTitle.size > 0) {
    const allConcepts = await getAllConcepts();
    const allByTitle = new Map<string, string>();
    for (const c of allConcepts) {
      allByTitle.set(c.title.toLowerCase(), c.id);
    }

    for (const pc of pack.concepts) {
      if (!pc.relatedConceptTitles || pc.relatedConceptTitles.length === 0) continue;
      const ownId = importedByTitle.get(pc.title.toLowerCase());
      if (!ownId) continue; // was skipped — don't touch existing concepts' relations
      const relatedIds = pc.relatedConceptTitles
        .map(t => allByTitle.get(t.toLowerCase()))
        .filter((id): id is string => id !== undefined && id !== ownId);
      if (relatedIds.length > 0) {
        await updateConcept(ownId, { relatedConceptIds: relatedIds, updatedAt: Date.now() });
      }
    }
  }

  return result;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportVaultPack(): Promise<VaultPack> {
  const [domains, concepts] = await Promise.all([getAllDomains(), getAllConcepts()]);

  const domainIdToName = new Map<string, string>();
  for (const d of domains) domainIdToName.set(d.id, d.name);

  const conceptIdToTitle = new Map<string, string>();
  for (const c of concepts) conceptIdToTitle.set(c.id, c.title);

  return {
    type: 'levelup-vault-pack',
    version: 1,
    exportedAt: new Date().toISOString(),
    domains: domains.map(d => ({
      name: d.name,
      icon: d.icon,
      color: d.color,
    })),
    concepts: concepts.map(c => {
      const pack: VaultPackConcept = {
        title: c.title,
        domainName: domainIdToName.get(c.primaryDomainId) ?? '',
        summary: c.summary,
      };
      if (c.keyIdeas && c.keyIdeas.length > 0) pack.keyIdeas = c.keyIdeas;
      if (c.keyTakeaways && c.keyTakeaways.length > 0) pack.keyTakeaways = c.keyTakeaways;
      if (c.personalNotes) pack.personalNotes = c.personalNotes;
      if (c.tags.length > 0) pack.tags = c.tags;
      if (c.relatedConceptIds.length > 0) {
        pack.relatedConceptTitles = c.relatedConceptIds
          .map(id => conceptIdToTitle.get(id))
          .filter((t): t is string => t !== undefined);
      }
      if (c.sourceType && c.sourceType !== 'manual') pack.sourceType = c.sourceType;
      if (c.sourceTitle) pack.sourceTitle = c.sourceTitle;
      return pack;
    }),
  };
}

// ── Download helper ───────────────────────────────────────────────────────────

export function downloadVaultPack(pack: VaultPack): void {
  const json = JSON.stringify(pack, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-pack-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
