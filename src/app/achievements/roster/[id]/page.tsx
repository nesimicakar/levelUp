'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/db';
import type { Character, RankRecord } from '@/types';

const RANK_REASON_LABEL: Record<RankRecord['reason'], string> = {
  promoted:   'PROMOTED',
  demoted:    'DEMOTED',
  maintained: 'MAINTAINED',
  skipped:    'SKIPPED',
  grace:      'GRACE',
};

function fmtWeek(weekStart: string) {
  const d = new Date(weekStart + 'T12:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Read-only archive view of a single character's completed journey. Renders from the
 * frozen finalStatsSnapshot plus that character's own rankHistory rows — strictly
 * scoped by characterId, and with no mutating actions anywhere on the page, so
 * viewing a past character can never touch the active character's progression.
 */
export default function CharacterArchivePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [history, setHistory] = useState<RankRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const id = Number(params.id);
    if (!Number.isFinite(id)) { router.replace('/achievements/roster'); return; }

    const c = await db.characters.get(id);
    if (!c) { router.replace('/achievements/roster'); return; }

    const rows = await db.rankHistory.where('characterId').equals(id).toArray();
    rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart)); // newest first

    setCharacter(c);
    setHistory(rows);
    setLoaded(true);
  }, [params.id, router]);

  useEffect(() => { load(); }, [load]);

  if (!loaded || !character) return null;

  const isMastered = character.status === 'mastered';
  const displayRank = character.finalRank ?? history[0]?.rank ?? 'E';
  const rankColor = `var(--color-rank-${displayRank.toLowerCase()})`;
  const snapshot = character.finalStatsSnapshot;

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
            <p className="text-[10px] tracking-[0.32em]" style={{ color: 'var(--color-glow-bright)' }}>
              ‹ {isMastered ? 'ARCHIVED JOURNEY' : 'CURRENT JOURNEY'} ›
            </p>
            <h1 className="font-display text-xl font-bold glow-text leading-none mt-0.5">
              {character.name.toUpperCase()}
            </h1>
          </div>
        </div>

        {/* ── Identity card ────────────────────────────────────────────────── */}
        <div
          className="frame-cut p-4 flex items-center gap-4"
          style={{ border: `1px solid color-mix(in srgb, ${rankColor} 28%, transparent)` }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 56, height: 56, fontSize: 28,
              background: `color-mix(in srgb, ${rankColor} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${rankColor} 35%, transparent)`,
              borderRadius: 8,
            }}
          >
            {character.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display font-bold text-sm text-text">{character.name}</span>
              {isMastered && (
                <span
                  className="hud-chip"
                  style={{ color: 'var(--color-success)', borderColor: 'rgba(34,197,94,0.4)', background: 'transparent', fontSize: 8 }}
                >
                  MASTERED
                </span>
              )}
            </div>
            <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase">
              Started {fmtDate(character.startedAt)}
              {character.masteredAt ? ` · Mastered ${fmtDate(character.masteredAt)}` : ''}
            </div>
          </div>
          <span
            className="font-display font-black flex-shrink-0"
            style={{ fontSize: 34, color: rankColor, textShadow: `0 0 16px color-mix(in srgb, ${rankColor} 55%, transparent)` }}
          >
            {displayRank}
          </span>
        </div>

        {/* ── Final snapshot ───────────────────────────────────────────────── */}
        {snapshot && (
          <>
            <div className="section-heading text-text-muted">// Final Record</div>
            <div className="frame-cut p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-display font-bold text-lg leading-none">{snapshot.weeksActive}</p>
                <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Weeks</p>
              </div>
              <div>
                <p className="font-display font-bold text-lg leading-none">{snapshot.promotions}</p>
                <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Promotions</p>
              </div>
              <div>
                <p className="font-display font-bold text-lg leading-none">{snapshot.demotions}</p>
                <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Demotions</p>
              </div>
              <div>
                <p className="font-display font-bold text-lg leading-none">{snapshot.bestWeekPct}%</p>
                <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Best Week</p>
              </div>
              <div>
                <p className="font-display font-bold text-lg leading-none">{snapshot.graceWeeksUsed}</p>
                <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Grace Used</p>
              </div>
            </div>
          </>
        )}

        {/* ── Frozen rank history ──────────────────────────────────────────── */}
        {history.length > 0 && (
          <>
            <div className="section-heading text-text-muted">
              // Rank History{isMastered ? ' · Frozen' : ''}
            </div>
            <div className="frame-cut p-2">
              {history.map((r, i) => {
                const c = `var(--color-rank-${r.rank.toLowerCase()})`;
                const reasonColor =
                  r.reason === 'promoted' ? 'var(--color-success)'
                  : r.reason === 'demoted' ? 'var(--color-danger)'
                  : r.reason === 'skipped' ? 'var(--color-text-muted)'
                  : r.reason === 'grace' ? 'var(--color-grace)'
                  : 'var(--color-text-dim)';
                return (
                  <div
                    key={r.id ?? i}
                    className="flex items-center justify-between px-2 py-2"
                    style={{ borderBottom: i < history.length - 1 ? '1px dashed var(--color-border)' : 'none' }}
                  >
                    <span className="text-text-muted font-display" style={{ fontSize: 10, width: 38, flexShrink: 0 }}>
                      {fmtWeek(r.weekStart)}
                    </span>
                    <div
                      className="flex items-center justify-center font-display font-bold flex-shrink-0"
                      style={{
                        width: 26, height: 26, fontSize: 13, color: c,
                        border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
                        background: `color-mix(in srgb, ${c} 8%, transparent)`,
                        clipPath: 'polygon(0 4px,4px 0,100% 0,100% calc(100% - 4px),calc(100% - 4px) 100%,0 100%)',
                      }}
                    >
                      {r.rank}
                    </div>
                    <div className="flex-1 flex items-center gap-2 mx-3">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${r.completionPct}%`,
                            background: r.completionPct >= 80 ? 'var(--color-success)' : r.completionPct >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
                          }}
                        />
                      </div>
                      <span className="text-text-muted font-display" style={{ fontSize: 10, width: 28, textAlign: 'right', flexShrink: 0 }}>
                        {r.completionPct}%
                      </span>
                    </div>
                    <span
                      className="font-display tracking-[0.12em]"
                      style={{ fontSize: 9, color: reasonColor, flexShrink: 0 }}
                    >
                      {RANK_REASON_LABEL[r.reason]}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {isMastered && (
          <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase text-center pt-2">
            Archived · read-only
          </p>
        )}
      </main>
    </div>
  );
}
