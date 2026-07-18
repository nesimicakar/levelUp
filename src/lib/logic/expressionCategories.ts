// Lightweight, UI-only categorization for the Knowledge Collection view.
//
// The stored Daily Expressions data has no category field — only a free-form
// `source` attribution (e.g. "Oscar Wilde", "Roman History", "Julius Caesar / Latin").
// This layer derives a top-level category from that text at render time; it never
// mutates or persists anything. To refine classification, edit the KEYWORDS table.

export interface ExpressionCategory {
  key: string;
  label: string;
  icon: string;
}

/** Top-level categories, in a stable canonical order. */
export const EXPRESSION_CATEGORIES: ExpressionCategory[] = [
  { key: 'history', label: 'History', icon: '🏛' },
  { key: 'literature', label: 'Literature', icon: '📚' },
  { key: 'psychology', label: 'Psychology', icon: '🧠' },
  { key: 'business', label: 'Business', icon: '💼' },
  { key: 'language', label: 'Language', icon: '🗣' },
  { key: 'philosophy', label: 'Philosophy', icon: '⚖' },
  { key: 'science', label: 'Science', icon: '🔬' },
  { key: 'culture', label: 'Culture', icon: '🌍' },
];

/** Fallback bucket for sources that match no keyword (or removed expressions). */
export const OTHER_CATEGORY: ExpressionCategory = { key: 'other', label: 'Other', icon: '◇' };

// Keyword table — matched (substring, case-insensitive) against the source text.
// Narrow topics collapse into their top-level category here (e.g. "Roman History",
// "Ancient Greece", "Greek Mythology" → History) so the totals stay high-level.
// Categories are tested in EXPRESSION_CATEGORIES order; first match wins, which
// also resolves overlaps (e.g. "Caesar / Latin" → History before Language).
const KEYWORDS: Record<string, string[]> = {
  history: ['history', 'roman', 'rome', 'greece', 'greek', 'ancient', 'ottoman', 'egypt', 'war', 'empire', 'medieval', 'byzantine', 'mythology', 'dynasty', 'revolution', 'civilization', 'napoleon', 'caesar', 'ww1', 'ww2'],
  literature: ['literature', 'novel', 'poet', 'poem', 'author', 'writer', 'wilde', 'shakespeare', 'tolstoy', 'dostoevsky', 'hemingway', 'austen', 'fiction', 'prose', 'playwright'],
  psychology: ['psycholog', 'cognitive', 'bias', 'behavior', 'behaviour', 'freud', 'jung', 'emotion', 'mental', 'memory', 'perception', 'motivation'],
  business: ['business', 'econom', 'finance', 'market', 'management', 'startup', 'money', 'invest', 'trade', 'entrepreneur', 'company', 'leadership'],
  language: ['language', 'latin', 'etymolog', 'linguist', 'grammar', 'idiom', 'proverb', 'vocabulary', 'french', 'spanish', 'german', 'turkish', 'phrase'],
  philosophy: ['philosoph', 'stoic', 'ethics', 'socrates', 'plato', 'aristotle', 'nietzsche', 'kant', 'existential', 'metaphysic', 'epistem', 'seneca', 'aurelius', 'logic'],
  science: ['science', 'physics', 'biolog', 'chemistr', 'math', 'astronom', 'evolution', 'quantum', 'geolog', 'neuro', 'genetic', 'theorem', 'ecolog'],
  culture: ['culture', 'art', 'music', 'film', 'cinema', 'religion', 'society', 'tradition', 'ritual', 'anthropolog', 'folklore', 'custom'],
};

/** Classify a source string into a top-level category. Never throws; unknown /
 *  empty sources return OTHER_CATEGORY. */
export function categorizeSource(source: string | undefined | null): ExpressionCategory {
  const s = (source ?? '').toLowerCase();
  if (!s) return OTHER_CATEGORY;
  for (const cat of EXPRESSION_CATEGORIES) {
    if (KEYWORDS[cat.key].some(kw => s.includes(kw))) return cat;
  }
  return OTHER_CATEGORY;
}

/** The valid authorable category labels (title-case), e.g. "History".
 *  Excludes the "Other" runtime fallback — it is not a recommended author choice. */
export const VALID_CATEGORY_LABELS: string[] = EXPRESSION_CATEGORIES.map(c => c.label);

/** Resolve an explicit structured `category` label to its canonical key.
 *  Case-insensitive. Returns undefined for unknown / empty labels so callers can
 *  distinguish "valid explicit category" from "needs inference / invalid". */
export function categoryKeyForLabel(label: string | undefined | null): string | undefined {
  const l = (label ?? '').trim().toLowerCase();
  if (!l) return undefined;
  return EXPRESSION_CATEGORIES.find(c => c.label.toLowerCase() === l)?.key;
}
