'use client';
import { useState } from 'react';
import type { KeyIdea } from '@/types';

interface Props {
  ideas: KeyIdea[];
  accentColor?: string;
  compact?: boolean;
}

export function KeyIdeasAccordion({ ideas, accentColor = '#f59e0b', compact = false }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(prev => (prev === i ? null : i));

  return (
    <div className="space-y-2">
      {ideas.map((idea, i) => {
        const isOpen = openIndex === i;
        const hasBody = !!idea.body;

        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl"
            style={{
              background: compact ? '#131a25' : '#0f1623',
              border: '1px solid #1e293b',
            }}
          >
            {/* Accent bar */}
            <span
              className="absolute left-0 top-0 bottom-0"
              style={{ width: 3, background: accentColor }}
            />

            {/* Header row — always visible */}
            <button
              onClick={() => hasBody && toggle(i)}
              className="w-full flex items-center justify-between pl-5 pr-4 py-3.5 text-left"
              style={{ cursor: hasBody ? 'pointer' : 'default' }}
            >
              <span
                className={`font-semibold text-text leading-snug ${compact ? 'text-[12px]' : 'text-sm'}`}
              >
                {idea.title || 'Key Idea'}
              </span>

              {/* Chevron — only shown when there's a body to expand */}
              {hasBody && (
                <svg
                  viewBox="0 0 24 24"
                  width={compact ? 13 : 15}
                  height={compact ? 13 : 15}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 ml-2 transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              )}
            </button>

            {/* Body — hidden until expanded */}
            {hasBody && (
              <div
                className="overflow-hidden transition-all duration-200"
                style={{
                  maxHeight: isOpen ? '600px' : '0px',
                  opacity: isOpen ? 1 : 0,
                }}
              >
                <p
                  className={`pl-5 pr-4 pb-4 text-text-dim leading-[1.7] ${compact ? 'text-[11px]' : 'text-[13px]'}`}
                >
                  {idea.body}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
