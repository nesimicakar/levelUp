import type { ReactNode } from 'react';

// ── Label pattern ──────────────────────────────────────────────────────────────
// A label: starts uppercase, up to 49 more chars, no colon / period / comma / newline.
// Covers labels like "Type", "Why It Matters", "Position from the Sun", "Gravity compared to Earth".

const LABEL = '[A-Z][^:.,\\n]{0,49}';

// Detect any label pattern — inline ("Type: value") or multiline ("Type:\nvalue").
// If neither found the text is plain prose and we skip structured rendering.
const HAS_STRUCTURE = new RegExp(`(?:^|\\n|\\.[ \\t]+)(${LABEL}):`, 'm');

// Step 1 — Split "sentence. Label: value" into separate sections.
// Uses lookahead so the label text is not consumed.
// Only matches horizontal whitespace (space/tab), not \n, so already-multiline
// content isn't double-processed.
const SPLIT_INLINE = new RegExp(`\\.[ \\t]+(?=(${LABEL}):)`, 'g');

// Step 2 — Expand a single line "Label: Value rest" → "Label:\nValue rest".
const EXPAND_LINE = new RegExp(`^(${LABEL}):\\s+(.+)$`);

// For rendering — a standalone bare label "Label:" with nothing after.
const BARE_LABEL = new RegExp(`^(${LABEL}):\\s*$`);

function isLabel(trimmed: string): boolean {
  return BARE_LABEL.test(trimmed);
}

function expandLine(line: string): string {
  const t = line.trim();
  const m = t.match(EXPAND_LINE);
  if (!m) return line;
  return `${m[1].trim()}:\n${m[2].trim()}`;
}

// Pure display transform — never mutates stored data.
// Handles all three formats:
//   A) "Label:\nValue"             — already multiline, passthrough
//   B) "Label: Value.\nLabel: Value." — one section per line, expand each
//   C) "Label: Value. Label: Value."  — all inline, split then expand
function normalizeForDisplay(text: string): string {
  const split = text.replace(SPLIT_INLINE, '.\n\n');
  return split.split('\n').map(expandLine).join('\n');
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  text: string;
  compact?: boolean;
}

export function ConceptBodyText({ text, compact = false }: Props) {
  const valueFontSize = compact ? 'text-[11px]' : 'text-[13px]';

  if (!HAS_STRUCTURE.test(text)) {
    return (
      <p className={`text-text-dim leading-[1.7] ${valueFontSize}`}>
        {text}
      </p>
    );
  }

  const normalized = normalizeForDisplay(text);
  const nodes: ReactNode[] = [];
  let firstSection = true;
  let prevWasLabel = false;

  normalized.split('\n').forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;

    if (isLabel(t)) {
      if (!firstSection) {
        nodes.push(
          <div key={`gap-${i}`} className={compact ? 'mt-2.5' : 'mt-4'} aria-hidden />
        );
      }
      nodes.push(
        <span
          key={`label-${i}`}
          className="block font-medium uppercase tracking-[0.12em] text-text-muted text-[9px] leading-snug"
        >
          {t}
        </span>
      );
      prevWasLabel = true;
      firstSection = false;
    } else {
      nodes.push(
        <span
          key={`val-${i}`}
          className={`block text-text-dim leading-[1.7] ${valueFontSize}${prevWasLabel ? ' mt-0.5' : ''}`}
        >
          {t}
        </span>
      );
      prevWasLabel = false;
      firstSection = false;
    }
  });

  return <div>{nodes}</div>;
}
