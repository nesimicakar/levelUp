import type { ReactNode } from 'react';

// ── Inline formatter ──────────────────────────────────────────────────────────
// Supports: **bold**, *italic*, `code`

function renderInline(text: string): ReactNode {
  const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="font-mono text-[12px] px-1.5 py-0.5 rounded"
          style={{ background: '#1a2236', color: '#f59e0b' }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// ── Block parser ──────────────────────────────────────────────────────────────
// - `# Heading` → h1
// - `## Heading` → h2
// - `### Heading` → h3
// - `- item` or `* item` → bullet list
// - blank line → paragraph break
// - everything else → paragraph

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

function parseBlocks(raw: string): Block[] {
  const lines = raw.split('\n');
  const blocks: Block[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'ul', items: [...listItems] });
      listItems = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();

    if (!t) {
      flushList();
      continue;
    }

    if (t.startsWith('### ')) {
      flushList();
      blocks.push({ type: 'h3', text: t.slice(4) });
    } else if (t.startsWith('## ')) {
      flushList();
      blocks.push({ type: 'h2', text: t.slice(3) });
    } else if (t.startsWith('# ')) {
      flushList();
      blocks.push({ type: 'h1', text: t.slice(2) });
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      listItems.push(t.slice(2));
    } else {
      flushList();
      blocks.push({ type: 'p', text: t });
    }
  }

  flushList();
  return blocks;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

interface ArticleTextProps {
  text: string;
  dim?: boolean;
}

export function ArticleText({ text, dim = false }: ArticleTextProps) {
  const blocks = parseBlocks(text);
  const bodyColor = dim ? 'text-text-dim' : 'text-text';

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return (
              <h3
                key={i}
                className="font-display text-[15px] font-bold text-text leading-snug tracking-wide"
              >
                {renderInline(block.text)}
              </h3>
            );
          case 'h2':
            return (
              <h4
                key={i}
                className="font-display text-[13px] font-bold text-text-dim leading-snug tracking-wide"
              >
                {renderInline(block.text)}
              </h4>
            );
          case 'h3':
            return (
              <p
                key={i}
                className="text-[10px] text-text-muted uppercase tracking-widest font-bold"
              >
                {block.text}
              </p>
            );
          case 'ul':
            return (
              <ul key={i} className="space-y-2">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5">
                    <span
                      className="flex-shrink-0 text-text-muted"
                      style={{ fontSize: 7, marginTop: 7, lineHeight: 1 }}
                    >
                      ◆
                    </span>
                    <span className={`text-sm ${bodyColor} leading-[1.75]`}>
                      {renderInline(item)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className={`text-sm ${bodyColor} leading-[1.75]`}>
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
