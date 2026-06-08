'use client';

import Link from 'next/link';
import { VaultSecondaryNav } from '@/components/VaultSecondaryNav';

export default function GraphPage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Secondary vault nav */}
      <VaultSecondaryNav />

      {/* Header */}
      <div className="w-full flex items-center gap-2 mb-8">
        <Link href="/knowledge" className="text-text-muted">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-widest">// KNOWLEDGE VAULT</p>
          <h1 className="font-display text-xl font-bold tracking-widest leading-none text-warning">GRAPH VIEW</h1>
        </div>
      </div>

      {/* Placeholder */}
      <div
        className="w-full rounded-2xl p-8 flex flex-col items-center justify-center"
        style={{ background: '#0f1623', border: '1px dashed #1e293b', minHeight: 320 }}
      >
        {/* Decorative node graph */}
        <svg viewBox="0 0 160 120" width="160" height="120" className="mb-6 opacity-30">
          <circle cx="80" cy="60" r="10" fill="#f59e0b" />
          <circle cx="30" cy="25" r="7" fill="#a78bfa" />
          <circle cx="130" cy="25" r="7" fill="#60a5fa" />
          <circle cx="20" cy="95" r="7" fill="#22c55e" />
          <circle cx="140" cy="95" r="7" fill="#f97316" />
          <circle cx="80" cy="110" r="5" fill="#e879f9" />
          <line x1="80" y1="60" x2="30" y2="25" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="80" y1="60" x2="130" y2="25" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="80" y1="60" x2="20" y2="95" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="80" y1="60" x2="140" y2="95" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="80" y1="60" x2="80" y2="110" stroke="#1e293b" strokeWidth="1.5" />
          <line x1="30" y1="25" x2="130" y2="25" stroke="#1e293b" strokeWidth="1" />
          <line x1="20" y1="95" x2="80" y2="110" stroke="#1e293b" strokeWidth="1" />
        </svg>

        <h2 className="font-display text-lg font-bold tracking-widest text-text mb-2 text-center">
          CONCEPT GRAPH
        </h2>
        <p className="text-[11px] text-text-muted text-center leading-relaxed max-w-xs">
          Visual map of all concepts and their connections across domains.
        </p>
        <p className="text-[10px] text-warning uppercase tracking-widest mt-4">Coming Soon</p>
      </div>
    </main>
  );
}
