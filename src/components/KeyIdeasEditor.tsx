'use client';

import type { KeyIdea } from '@/types';

interface Props {
  value: KeyIdea[];
  onChange: (v: KeyIdea[]) => void;
  accentColor?: string;
}

export function KeyIdeasEditor({ value, onChange, accentColor = '#f59e0b' }: Props) {
  const update = (i: number, field: keyof KeyIdea, text: string) => {
    onChange(value.map((idea, j) => (j === i ? { ...idea, [field]: text } : idea)));
  };

  return (
    <div>
      {value.map((idea, i) => (
        <div
          key={i}
          className="mb-2.5 rounded-lg overflow-hidden"
          style={{ background: '#0b1120', border: '1px solid #1e293b', borderLeft: `3px solid ${accentColor}` }}
        >
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-[9px] text-text-muted uppercase tracking-widest">Idea {i + 1}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-text-muted leading-none text-sm hover:text-danger transition-colors"
            >
              ✕
            </button>
          </div>
          <input
            className="w-full bg-transparent px-3 pt-1.5 pb-1 text-sm font-semibold text-text placeholder-text-muted outline-none"
            placeholder="Title"
            value={idea.title}
            onChange={e => update(i, 'title', e.target.value)}
          />
          <div style={{ height: 1, background: '#1e293b', margin: '0 12px' }} />
          <textarea
            className="w-full bg-transparent px-3 py-2 text-sm text-text-dim placeholder-text-muted outline-none resize-none"
            placeholder="Explanation"
            rows={2}
            value={idea.body}
            onChange={e => update(i, 'body', e.target.value)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { title: '', body: '' }])}
        className="w-full py-2 rounded-lg text-[11px] uppercase tracking-widest font-bold text-text-muted transition-colors"
        style={{ border: '1px dashed #1e2a38' }}
      >
        + Add Key Idea
      </button>
    </div>
  );
}
