'use client';

import { useRouter } from 'next/navigation';
import { DailyExpressions } from '@/components/DailyExpressions';

export default function ExpressionsPage() {
  const router = useRouter();

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-4">
        {/* Diegetic header */}
        <div className="flex items-center gap-3 min-w-0 mb-2">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1
              className="font-display text-xl font-bold leading-none glow-text"
              style={{ color: 'var(--color-stat-int)' }}
            >
              DAILY IDEAS
            </h1>
            <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Optional Enrichment</p>
          </div>
        </div>

        <DailyExpressions />
      </main>
    </div>
  );
}
