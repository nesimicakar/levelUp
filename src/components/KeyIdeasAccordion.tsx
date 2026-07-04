'use client';
import { useState, useRef, useEffect } from 'react';
import type { KeyIdea } from '@/types';
import { ConceptBodyText } from './ConceptBodyText';

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
      {ideas.map((idea, i) => (
        <KeyIdeaCard
          key={i}
          idea={idea}
          accentColor={accentColor}
          compact={compact}
          isOpen={openIndex === i}
          onToggle={() => toggle(i)}
        />
      ))}
    </div>
  );
}

function KeyIdeaCard({
  idea,
  accentColor,
  compact,
  isOpen,
  onToggle,
}: {
  idea: KeyIdea;
  accentColor: string;
  compact: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const hasBody = !!idea.body;
  const contentRef = useRef<HTMLDivElement>(null);
  // Measured content height drives the expand animation, so the card grows to
  // fit content of any length instead of clipping at a fixed max-height.
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    const measure = () => {
      if (contentRef.current) setContentHeight(contentRef.current.scrollHeight);
    };
    measure();
    // Recalculate if content reflows (font load, viewport resize, etc.)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && contentRef.current) ro.observe(contentRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isOpen, idea.body, compact]);

  return (
    <div
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
        onClick={() => hasBody && onToggle()}
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

      {/* Body — hidden until expanded. maxHeight animates to the measured content
          height, then releases to 'none' so nothing is ever clipped. */}
      {hasBody && (
        <div
          className="overflow-hidden transition-all duration-200"
          style={{
            maxHeight: isOpen ? contentHeight : 0,
            opacity: isOpen ? 1 : 0,
          }}
        >
          <div ref={contentRef} className="pl-5 pr-4 pb-4">
            <ConceptBodyText text={idea.body} compact={compact} />
          </div>
        </div>
      )}
    </div>
  );
}
