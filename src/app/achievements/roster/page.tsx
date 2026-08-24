'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, getAllCharacters } from '@/lib/db';
import { getAvailableNextCharacters } from '@/lib/logic/characters';
import { countConsecutiveWeeksAbove80 } from '@/lib/logic/rank';
import type { Character, Rank } from '@/types';
import type { CharacterDef } from '@/lib/data/characterDefs';

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function RosterPage() {
  const router = useRouter();
  const [mastered, setMastered] = useState<Character[]>([]);
  const [current, setCurrent] = useState<Character | null>(null);
  const [currentRank, setCurrentRank] = useState<Rank>('E');
  const [promotionWeeks, setPromotionWeeks] = useState(0);
  const [locked, setLocked] = useState<CharacterDef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const all = await getAllCharacters();
    const masteredOnes = all.filter(c => c.status === 'mastered');
    const active = all.find(c => c.status === 'active') ?? null;

    setMastered(masteredOnes);
    setCurrent(active);
    setLocked(getAvailableNextCharacters(all.map(c => c.slug)));

    if (active?.id !== undefined) {
      const history = await db.rankHistory.where('characterId').equals(active.id).toArray();
      const sorted = [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      setCurrentRank(sorted.at(-1)?.rank ?? 'E');
      setPromotionWeeks(countConsecutiveWeeksAbove80([...sorted].reverse()));
    }

    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!loaded) return null;

  const currentColor = `var(--color-rank-${currentRank.toLowerCase()})`;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <p className="text-[10px] tracking-[0.32em]" style={{ color: 'var(--color-glow-bright)' }}>‹ HUNTER RECORD ›</p>
            <h1 className="font-display text-xl font-bold glow-text leading-none mt-0.5">ROSTER</h1>
          </div>
        </div>

        {/* ── Current character ────────────────────────────────────────────── */}
        {current && (
          <>
            <div className="section-heading text-text-muted">// Current</div>
            <Link
              href="/achievements/character"
              className="frame-cut p-4 flex items-center gap-3 hover:brightness-110 transition-all"
              style={{ border: `1px solid color-mix(in srgb, ${currentColor} 30%, transparent)` }}
            >
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 44, height: 44, fontSize: 22, background: `color-mix(in srgb, ${currentColor} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${currentColor} 35%, transparent)`, borderRadius: 8 }}
              >
                {current.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-sm text-text">{current.name}</div>
                <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">
                  Rank {currentRank} · {promotionWeeks}/4 wks to next
                </div>
              </div>
              <span
                className="font-display font-black flex-shrink-0"
                style={{ fontSize: 26, color: currentColor, textShadow: `0 0 12px color-mix(in srgb, ${currentColor} 55%, transparent)` }}
              >
                {currentRank}
              </span>
            </Link>
          </>
        )}

        {/* ── Mastered characters ──────────────────────────────────────────── */}
        {mastered.length > 0 && (
          <>
            <div className="section-heading text-text-muted mt-2">// Mastered</div>
            <div className="space-y-2">
              {mastered.map(c => {
                const c_ = `var(--color-rank-${(c.finalRank ?? 'S').toLowerCase()})`;
                return (
                  <Link
                    key={c.id}
                    href={`/achievements/roster/${c.id}`}
                    className="frame-cut p-4 flex items-center gap-3 hover:brightness-110 transition-all"
                  >
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 44, height: 44, fontSize: 22, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                    >
                      {c.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-display font-bold text-sm text-text">{c.name}</div>
                        <span
                          className="hud-chip"
                          style={{ color: 'var(--color-success)', borderColor: 'rgba(34,197,94,0.4)', background: 'transparent', fontSize: 8 }}
                        >
                          MASTERED
                        </span>
                      </div>
                      <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">
                        {c.masteredAt ? fmtDate(c.masteredAt) : ''}
                      </div>
                    </div>
                    <span
                      className="font-display font-black flex-shrink-0"
                      style={{ fontSize: 22, color: c_ }}
                    >
                      {c.finalRank ?? 'S'}
                    </span>
                    <span className="text-text-muted text-xs flex-shrink-0">→</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* ── Locked / future ──────────────────────────────────────────────── */}
        {locked.length > 0 && (
          <>
            <div className="section-heading text-text-muted mt-2">// Locked</div>
            <div className="space-y-2">
              {locked.map(def => (
                <div key={def.slug} className="frame-cut p-4 flex items-center gap-3" style={{ opacity: 0.45 }}>
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 44, height: 44, fontSize: 22, filter: 'grayscale(1) brightness(0.6)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                  >
                    {def.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-sm text-text-muted">{def.name}</div>
                    <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">Unlocks at next Mastery</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
