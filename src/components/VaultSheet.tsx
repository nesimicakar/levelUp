'use client';

import { useEffect, type ReactNode } from 'react';

interface VaultSheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function VaultSheet({ label, onClose, children, footer }: VaultSheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[100] flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border-t border-border rounded-t-2xl flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 80px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-none">
          <span className="text-[10px] text-text-muted uppercase tracking-widest">{label}</span>
          <button onClick={onClose} className="text-text-muted text-lg leading-none">✕</button>
        </div>

        {/* Scrollable body — min-h-0 is critical for flex overflow */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 pb-2">
          {children}
        </div>

        {/* Fixed footer with safe-area padding */}
        <div
          className="flex-none px-5 pt-3"
          style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
