import { validateVaultPack, type VaultPack } from './vaultPack';

// ── AI prompt for a single Vault concept ──────────────────────────────────────
//
// Self-contained: the user pastes this into any chat AI (ChatGPT, Claude, Gemini…)
// and gets back a pack that `validateVaultPack` accepts. Mirrors the rules in
// .claude/skills/create-levelup-concept (schema, sourceType enum, no ids).

export type ConceptSourceKind = 'topic' | 'book' | 'course' | 'notes';

export interface ConceptPromptInput {
  /** Topic, or the book / course title when `kind` is book / course. */
  topic: string;
  /** What the concept is based on. Defaults to a plain topic. */
  kind?: ConceptSourceKind;
  /** Optional: what the user learned or wants covered. Must-cover; for `notes` it is the primary source. */
  details?: string;
  /** Names of domains already in the Vault; the AI is told to reuse one if it fits. */
  existingDomains?: string[];
  /** ISO date used for exportedAt. Injectable for tests. */
  now?: Date;
}

const SOURCE_TYPE: Record<ConceptSourceKind, string> = {
  topic: 'manual',
  book: 'book',
  course: 'course',
  notes: 'note',
};

function headerBlock(kind: ConceptSourceKind, topic: string): string {
  switch (kind) {
    case 'book':
      return `BASED ON THE BOOK: ${topic}\nCapture this book's lasting ideas. Use the book's title as the concept title.`;
    case 'course':
      return `BASED ON THE COURSE: ${topic}\nCapture what this course teaches.`;
    case 'notes':
      return `TOPIC: ${topic}\nBase the card on MY NOTES below.`;
    default:
      return `TOPIC: ${topic}`;
  }
}

function detailsBlock(kind: ConceptSourceKind, details: string): string {
  if (kind === 'notes') {
    return details
      ? `\nMY NOTES (primary source: stay faithful to them and add only brief, well-known context):\n"""\n${details}\n"""\n`
      : '';
  }
  const honesty = kind === 'topic'
    ? ''
    : 'If you do not know this source well, rely on my notes and widely documented ideas. Do NOT invent chapters, quotes or claims.';
  if (details) {
    return `\nWHAT I WANT COVERED (must-cover, and the angle that matters most to me):\n"""\n${details}\n"""\n${honesty ? honesty + '\n' : ''}`;
  }
  return honesty ? `\n${honesty}\n` : '';
}

export function buildConceptPrompt({
  topic, kind = 'topic', details = '', existingDomains = [], now = new Date(),
}: ConceptPromptInput): string {
  const cleanTopic = topic.trim() || '[TYPE YOUR TOPIC HERE]';
  const sourceType = SOURCE_TYPE[kind];
  const withTitle = kind !== 'topic';
  const domainLine = existingDomains.length > 0
    ? `Use one of my existing domains if it fits: ${existingDomains.join(', ')}. Otherwise invent a fitting one-word domain.`
    : 'Pick a fitting one-word domain (for example History, Science, Psychology, Business, Philosophy).';

  return `You are helping me build a personal knowledge vault. Write ONE concept card.

${headerBlock(kind, cleanTopic)}
${detailsBlock(kind, details.trim())}
Goal: after reading it, I should be able to hold this in conversation, not just recite trivia.

CONTENT RULES
- Summary: 1-2 tight paragraphs. What it is and why it matters. No teaser, no table of contents.
- 4-6 key ideas. Cover the foundations first (what it is, why it matters, main works/events/mechanisms, broader context), then one nuance or controversy and one or two memorable hooks.
- Each key idea has a meaningful, memorable title (never "Background" or "Conclusion") and a body that explains causes and gives concrete examples instead of listing facts.
- Be careful with facts. Hedge exact numbers, dates, quotes and "first/only/greatest" claims you are not sure of ("an estimated", "by most accounts").
- 4-8 lowercase tags useful for searching.
- Avoid generic conclusions, hype and repeating the summary in the last idea.
- ${domainLine}

OUTPUT FORMAT
Reply with ONE JSON code block and nothing else (no text before or after it). Use exactly this shape:

\`\`\`json
{
  "type": "levelup-vault-pack",
  "version": 1,
  "exportedAt": "${now.toISOString()}",
  "domains": [{ "name": "History", "icon": "🏛️", "color": "#38bdf8" }],
  "concepts": [
    {
      "title": "Concept title",
      "domainName": "History",
      "summary": "…",
      "keyIdeas": [{ "title": "…", "body": "…" }],
      "tags": ["…"],
      "sourceType": "${sourceType}"${withTitle ? `,\n      "sourceTitle": "${cleanTopic}"` : ''}
    }
  ]
}
\`\`\`

HARD RULES
- Exactly one concept. The domain must appear in "domains" with an emoji icon and a hex color.
- Do NOT add an "id", "personalNotes", "relatedConceptTitles" or any field not shown above.
- "sourceType" must be "${sourceType}"${withTitle ? ` and "sourceTitle" must be "${cleanTopic}"` : ''}.
- Valid JSON only: escape quotes inside text as \\" and use \\n for line breaks.`;
}

// ── Reading the AI's reply back in ────────────────────────────────────────────

/** Pulls the JSON object out of pasted chat text: tolerates code fences, chatter
 *  before/after the block, and smart quotes. Throws a plain-language Error. */
export function parsePastedPack(text: string): VaultPack {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to import — paste the AI’s reply first.');

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1] : trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1) {
    throw new Error('No JSON found. Copy the whole code block the AI gave you, starting at { and ending at }.');
  }
  if (end <= start) {
    throw new Error('The JSON looks cut off. Ask the AI to “continue” or re-send the full code block, then paste it again.');
  }
  candidate = candidate.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    try {
      // Chat apps sometimes swap straight quotes for curly ones.
      parsed = JSON.parse(candidate.replace(/[“”]/g, '"'));
    } catch {
      throw new Error('That isn’t valid JSON — part of it may be missing. Ask the AI to re-send the full code block and paste it again.');
    }
  }
  return validateVaultPack(parsed);
}
