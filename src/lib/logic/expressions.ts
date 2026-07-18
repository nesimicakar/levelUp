import type { DailyIdea, ExpressionCompletion, UserSettings } from '@/types';
import { categorizeSource, categoryKeyForLabel, VALID_CATEGORY_LABELS } from './expressionCategories';

// ─────────────────────────────────────────────────────────────────────────────
// Daily Ideas bank — supports two formats, normalized into one DailyIdea shape:
//   A. Structured JSON  { type, version, ideas: [...] }   (preferred)
//   B. Legacy pipe-delimited  `idea | source | meaning`   (still supported)
//
// Consumption (parseIdeaBank / selectExpressionState) is resilient: it extracts
// whatever ideas it can and never throws. Strict reporting lives in
// validateIdeaBank, used by Config to surface problems without discarding input.
// ─────────────────────────────────────────────────────────────────────────────

export const IDEA_BANK_TYPE = 'levelup-daily-ideas-bank';
export const IDEA_BANK_VERSION = 1;

export type IdeaBankFormat = 'structured' | 'legacy' | 'empty';

/** Detect which format a bank string uses. A leading `{` (after trim) means the
 *  user is authoring structured JSON; anything else non-empty is treated as legacy. */
export function detectIdeaBankFormat(bank: string): IdeaBankFormat {
  const t = (bank ?? '').trim();
  if (!t) return 'empty';
  return t.startsWith('{') ? 'structured' : 'legacy';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Parse the legacy pipe-delimited bank. Index assignment and empty-title
 *  filtering are byte-for-byte identical to the original parseExpressionBank so
 *  existing index-based completions keep resolving to the same ideas. */
function parseLegacyBank(bank: string): DailyIdea[] {
  return bank
    .split('\n')
    .map(l => l.trim())
    .filter(l => (l.match(/\|/g) ?? []).length >= 2)
    .map((l, i): DailyIdea => {
      const parts = l.split('|').map(p => p.trim());
      const title = parts[0] ?? '';
      const source = parts[1] ?? '';
      const meaning = parts[2] ?? '';
      return {
        index: i,
        id: `legacy-${i}`,
        title,
        // Legacy: category comes from the source-based keyword mapping.
        category: categorizeSource(source).key,
        meaning,
        topic: source || undefined,
        source: source || undefined,
      };
    })
    .filter(e => e.title);
}

/** Parse the structured JSON bank for CONSUMPTION (resilient — best effort).
 *  Entries keep their array position as `index` (no reordering/dropping) so
 *  completion lookup stays stable. Category resolution honors an explicit valid
 *  category first, then infers from topic, then falls back to Other. */
function parseStructuredBank(bank: string): DailyIdea[] {
  let data: unknown;
  try {
    data = JSON.parse(bank);
  } catch {
    return [];
  }
  const ideas = (data as { ideas?: unknown } | null)?.ideas;
  if (!Array.isArray(ideas)) return [];
  return ideas.map((raw, i): DailyIdea => {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const topic = str(o.topic);
    // Category resolution order (see requirement 10):
    //   a. valid explicit structured category  b. infer from topic  c. Other
    const explicitKey = categoryKeyForLabel(str(o.category));
    const category = explicitKey ?? categorizeSource(topic).key;
    return {
      index: i,
      id: str(o.id) || `idea-${i}`,
      title: str(o.title),
      category,
      meaning: str(o.meaning),
      topic: topic || undefined,
      context: str(o.context) || undefined,
      example: str(o.example) || undefined,
      takeaway: str(o.takeaway) || undefined,
      source: undefined,
    };
  });
}

/** Normalize any bank string into DailyIdea[]. Never throws. */
export function parseIdeaBank(bank: string): DailyIdea[] {
  const format = detectIdeaBankFormat(bank);
  if (format === 'empty') return [];
  if (format === 'structured') return parseStructuredBank(bank);
  return parseLegacyBank(bank);
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface IdeaBankValidation {
  format: IdeaBankFormat;
  /** No blocking errors. Legacy and empty banks are always valid. */
  valid: boolean;
  /** Number of well-formed ideas the bank yields. */
  count: number;
  /** Human-readable problems. Never causes entries to be silently discarded. */
  errors: string[];
}

/** Validate a bank string and report every problem, without mutating input.
 *  Legacy banks are lenient (count only); structured banks are strictly checked. */
export function validateIdeaBank(bank: string): IdeaBankValidation {
  const format = detectIdeaBankFormat(bank);

  if (format === 'empty') {
    return { format, valid: true, count: 0, errors: [] };
  }

  if (format === 'legacy') {
    // Legacy has always been lenient; keep it that way for back-compat.
    return { format, valid: true, count: parseLegacyBank(bank).length, errors: [] };
  }

  // Structured — strict.
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(bank);
  } catch (e) {
    errors.push(`Malformed JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { format, valid: false, count: 0, errors };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Top-level value must be a JSON object.');
    return { format, valid: false, count: 0, errors };
  }

  const root = data as Record<string, unknown>;
  if (root.type !== IDEA_BANK_TYPE) {
    errors.push(`Incorrect "type": expected "${IDEA_BANK_TYPE}", got ${JSON.stringify(root.type)}.`);
  }
  if (root.version !== IDEA_BANK_VERSION) {
    errors.push(`Unsupported "version": expected ${IDEA_BANK_VERSION}, got ${JSON.stringify(root.version)}.`);
  }
  if (!Array.isArray(root.ideas)) {
    errors.push('Missing or invalid "ideas" array.');
    return { format, valid: false, count: 0, errors };
  }

  let count = 0;
  const seenIds = new Set<string>();
  root.ideas.forEach((raw, i) => {
    const label = `Idea #${i + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`${label}: not an object.`);
      return;
    }
    const o = raw as Record<string, unknown>;
    const id = str(o.id);
    const title = str(o.title);
    const meaning = str(o.meaning);
    const category = str(o.category);

    let ok = true;
    if (!('id' in o)) { errors.push(`${label}: missing "id".`); ok = false; }
    else if (!id) { errors.push(`${label}: empty "id".`); ok = false; }
    else if (seenIds.has(id)) { errors.push(`${label}: duplicate id "${id}".`); ok = false; }

    if (!('title' in o)) { errors.push(`${label}: missing "title".`); ok = false; }
    else if (!title) { errors.push(`${label}: empty "title".`); ok = false; }

    if (!('meaning' in o)) { errors.push(`${label}: missing "meaning".`); ok = false; }
    else if (!meaning) { errors.push(`${label}: empty "meaning".`); ok = false; }

    if (!('category' in o) || !category) {
      errors.push(`${label}: missing "category".`); ok = false;
    } else if (!categoryKeyForLabel(category)) {
      errors.push(`${label}: invalid category "${category}". Valid: ${VALID_CATEGORY_LABELS.join(', ')}.`);
      ok = false;
    }

    if (id) seenIds.add(id);
    if (ok) count += 1;
  });

  return { format, valid: errors.length === 0, count, errors };
}

// ── Selection / scheduling (unchanged semantics) ─────────────────────────────

export interface ExpressionState {
  enabled: boolean;
  /** Normalized ideas (field name kept for consumer compatibility). */
  expressions: DailyIdea[];
  completions: ExpressionCompletion[];
  /** Index of the first not-yet-processed idea, or -1 when all are done. */
  currentIndex: number;
  currentExpression: DailyIdea | undefined;
  /** True when an idea was learned (not just skipped-as-known) today. */
  todayRead: boolean;
}

/** Single source of truth for the Daily Ideas selection/scheduling logic.
 *  Shared by the Home discovery card and the full experience component so both
 *  agree on what "today's idea" is. Behavior (index-based) is unchanged. */
export function selectExpressionState(
  settings: Pick<UserSettings, 'enableDailyExpressions' | 'expressionBank' | 'expressionCompletions'>,
  today: string,
): ExpressionState {
  const enabled = settings.enableDailyExpressions ?? false;
  const expressions = enabled ? parseIdeaBank(settings.expressionBank ?? '') : [];
  const completions = settings.expressionCompletions ?? [];
  // Attribution is by stable idea id, so reordering/inserting bank entries never
  // misattributes history. Legacy records without an ideaId contribute nothing
  // here (they resolve to no idea) — the user resets those manually.
  const completedIds = new Set(completions.map(c => c.ideaId).filter(Boolean));
  const currentIndex = expressions.findIndex(idea => !completedIds.has(idea.id));
  const currentExpression = currentIndex >= 0 ? expressions[currentIndex] : undefined;
  const todayRead = completions.some(
    c => c.date === today && (c.status === 'read' || c.status === undefined),
  );
  return { enabled, expressions, completions, currentIndex, currentExpression, todayRead };
}
