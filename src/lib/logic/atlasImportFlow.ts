import { validateAtlasPack, type AtlasPack, type AtlasImportPreview } from '@/lib/logic/atlasPack';

// ─────────────────────────────────────────────────────────────────────────────
// Atlas import-flow helpers (Stage 5, UI orchestration only)
//
// These are thin, pure helpers around the Stage-2 engine. NO validation or merge
// logic is reimplemented here — parsing delegates to validateAtlasPack, and the
// preview/apply come straight from planAtlasImport / applyAtlasImportPlan.
// ─────────────────────────────────────────────────────────────────────────────

export type FlowPhase = 'idle' | 'previewed' | 'applying' | 'applied';

/** Apply is allowed only from a previewed plan that actually has writes. */
export function canApply(phase: FlowPhase, hasWrites: boolean): boolean {
  return phase === 'previewed' && hasWrites;
}

export type ParseResult =
  | { ok: true; pack: AtlasPack }
  | { ok: false; error: string };

/** Parse pasted/uploaded text into a validated pack envelope (single code path). */
export function parseAtlasPackText(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Nothing to import — paste or upload a pack first.' };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Invalid JSON — the text could not be parsed.' };
  }
  try {
    return { ok: true, pack: validateAtlasPack(raw) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid Atlas pack.' };
  }
}

export interface ApplyOutcome {
  kind: 'full' | 'partial' | 'none';
  headline: string;
  written: number;
  problems: number;
}

/** Report full / partial / no-change success from a preview. */
export function applyOutcome(preview: AtlasImportPreview): ApplyOutcome {
  const written = preview.added.length + preview.updated.length;
  const problems = preview.rejected.length + preview.conflicts.length;
  const noun = (n: number) => (n === 1 ? 'profile' : 'profiles');

  if (written === 0) {
    const headline = problems > 0
      ? `No changes applied — ${problems} ${problems === 1 ? 'entry' : 'entries'} could not be imported.`
      : 'No changes — everything in the pack was already up to date.';
    return { kind: 'none', headline, written, problems };
  }
  if (problems > 0) {
    return {
      kind: 'partial',
      headline: `Applied ${written} ${noun(written)}; ${problems} ${problems === 1 ? 'entry' : 'entries'} skipped.`,
      written, problems,
    };
  }
  return { kind: 'full', headline: `Applied ${written} ${noun(written)}.`, written, problems };
}

/** All unresolved Vault concept titles across added + updated rows, deduped. */
export function collectUnresolvedTitles(preview: AtlasImportPreview): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...preview.added, ...preview.updated]) {
    for (const t of row.unresolvedConceptTitles ?? []) {
      const key = t.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(t); }
    }
  }
  return out;
}

// ── Authoring guidance ────────────────────────────────────────────────────────
//
// Canonical-fields-only template. Placeholder values (not authored country
// content) — users replace them. Legacy fields are intentionally NOT shown.

export const ATLAS_PACK_TEMPLATE_OBJECT = {
  type: 'levelup-atlas-pack',
  version: 1,
  countries: [
    {
      atlasId: 'fra',
      name: 'Country name',
      summary: 'One-paragraph orientation to the country.',
      snapshot: {
        capital: 'Capital city',
        majorCities: ['City A', 'City B'],
        officialLanguages: ['Language'],
        currency: 'Currency',
        government: 'Government type',
        population: { value: 0, unit: 'people', asOf: '2024', source: 'Source' },
        area: { value: 0, unit: 'km2', asOf: '2024', source: 'Source' },
        gdpNominal: { value: 0, unit: 'USD', asOf: '2023', source: 'Source' },
      },
      geography: {
        overview: 'Physical setting.',
        climate: 'Climate summary.',
        majorRegions: ['Region A', 'Region B'],
        mountains: ['Range A'],
        rivers: ['River A'],
        lakes: ['Lake A'],
        seasAndOceans: ['Sea A'],
        naturalResources: ['Resource A'],
      },
      economy: {
        overview: 'How the economy works.',
        majorIndustries: ['Industry A'],
        majorExports: ['Export A'],
        majorImports: ['Import A'],
        strengths: ['Strength A'],
        challenges: ['Challenge A'],
      },
      relationships: {
        overview: 'Strategic posture.',
        alliances: ['Organization'],
        keyPartnerIds: ['deu'],
        keyRivalIds: [],
      },
      history: 'Origins → turning points → legacy.',
      whyItMatters: 'Why this country matters in the world.',
      rememberThese: ['A durable takeaway or conversation hook.'],
      relatedConceptTitles: ['A Vault concept title'],
    },
  ],
};

export const ATLAS_PACK_TEMPLATE = JSON.stringify(ATLAS_PACK_TEMPLATE_OBJECT, null, 2);
