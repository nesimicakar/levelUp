'use client';

import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  right?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, subtitle, right, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="stat-card rounded-lg glow-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div>
          <span className="text-sm font-medium text-text-dim">{title}</span>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right && <span className="text-xs text-text-muted">{right}</span>}
          <span className="text-text-muted text-sm">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
