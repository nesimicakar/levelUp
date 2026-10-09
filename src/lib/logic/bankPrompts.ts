import { IDEA_BANK_TYPE, IDEA_BANK_VERSION } from './expressions';
import { VALID_CATEGORY_LABELS } from './expressionCategories';

// Prompts a user pastes into any chat AI to fill the Settings banks, so nobody has to
// hand-write structured text. Output is checked by the existing validators on paste.

export interface IdeaBankPromptInput {
  /** Optional focus, e.g. "ancient history". Blank = a broad general-knowledge mix. */
  topic?: string;
  count?: number;
}

export function buildIdeaBankPrompt({ topic = '', count = 30 }: IdeaBankPromptInput = {}): string {
  const focus = topic.trim() ? `Focus on: ${topic.trim()}.` : 'Cover a broad mix of general knowledge.';
  const n = Math.max(1, Math.min(200, Math.round(count)));
  return `Create a bank of ${n} "daily ideas" for a self-improvement app. Each is one interesting idea, concept, term or fact worth knowing, explained in one or two clear sentences. ${focus}

RULES
- Every idea must be accurate. If you are not sure of a detail, leave it out or hedge it.
- "meaning" is 1-2 plain sentences: what it is and why it is worth knowing.
- "category" must be exactly one of: ${VALID_CATEGORY_LABELS.join(', ')}.
- "id" is a unique lowercase-with-dashes slug of the title.
- No duplicates.

OUTPUT FORMAT
Reply with ONE JSON code block and nothing else:

\`\`\`json
{
  "type": "${IDEA_BANK_TYPE}",
  "version": ${IDEA_BANK_VERSION},
  "ideas": [
    { "id": "pyrrhic-victory", "title": "Pyrrhic Victory", "category": "History", "meaning": "A victory so costly it is almost a defeat." }
  ]
}
\`\`\`

Valid JSON only: escape quotes inside text as \\" .`;
}

export interface SentenceBankPromptInput {
  /** The language being learned. */
  target: string;
  /** The learner's own language, used for the translations. */
  native: string;
  level?: string;
  count?: number;
}

export function buildSentenceBankPrompt({ target, native, level = 'beginner', count = 40 }: SentenceBankPromptInput): string {
  const t = target.trim() || '[LANGUAGE I AM LEARNING]';
  const nat = native.trim() || '[MY NATIVE LANGUAGE]';
  const n = Math.max(1, Math.min(200, Math.round(count)));
  return `Write ${n} ${level.trim() || 'beginner'}-level practice sentences in ${t}, each with a natural ${nat} translation. Order them from easiest to hardest, and make them useful in everyday life.

OUTPUT FORMAT
One sentence per line, exactly like this, with a vertical bar between the ${t} sentence and its ${nat} translation. Reply with ONLY the lines, in one code block, with no numbering or extra text:

\`\`\`
${t} sentence | ${nat} translation
\`\`\``;
}
