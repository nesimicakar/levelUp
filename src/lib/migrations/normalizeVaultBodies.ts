import { db } from '@/lib/db';

const MIGRATION_KEY = 'vault_migration_normalize_bodies_v1';

// Matches "Label: Value" inline format where the label:
//   - starts with uppercase
//   - is ≤50 chars with no period or comma (prose sentences usually have these)
//   - is followed by ": " and a non-empty value
const INLINE_LABEL = /^([A-Z][^:.,\n]{0,48}):\s+(.+)$/;

function normalizeLine(line: string): string {
  const t = line.trim();
  if (!t) return line;
  // Already a standalone label line (ends with ':' and nothing after) — skip
  if (/^[^:]+:\s*$/.test(t)) return line;
  const m = t.match(INLINE_LABEL);
  if (!m) return line;
  return `${m[1].trim()}:\n${m[2].trim()}`;
}

function normalizeBody(body: string): string {
  return body.split('\n').map(normalizeLine).join('\n');
}

export async function runNormalizeVaultBodies(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  const concepts = await db.knowledgeConcepts.toArray();

  for (const concept of concepts) {
    if (!concept.keyIdeas?.length) continue;

    let changed = false;
    const normalizedIdeas = concept.keyIdeas.map(idea => {
      if (!idea.body) return idea;
      const next = normalizeBody(idea.body);
      if (next === idea.body) return idea;
      changed = true;
      return { ...idea, body: next };
    });

    if (changed) {
      await db.knowledgeConcepts.update(concept.id, { keyIdeas: normalizedIdeas });
    }
  }

  localStorage.setItem(MIGRATION_KEY, '1');
}
