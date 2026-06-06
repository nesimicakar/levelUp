'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import type { Rank } from '@/types';
import { RANK_ORDER } from '@/types';

const RANK_TITLES: Record<Rank, string> = {
  E: 'Weak Hunter',
  D: 'Initiate Hunter',
  C: 'Rising Hunter',
  B: 'Elite Hunter',
  A: 'Awakened Hunter',
  S: 'Ascendant Hunter',
};

const RANK_SUBTITLES: Record<Rank, string> = {
  E: 'Awakened · Unranked',
  D: 'Mana Signature Detected',
  C: 'Threshold Ascending',
  B: 'Combat Rank Verified',
  A: 'Domain Authority Granted',
  S: 'Monarch-Class · Apex',
};

const RANK_POWER: Record<Rank, number> = {
  E: 14,
  D: 32,
  C: 48,
  B: 66,
  A: 84,
  S: 100,
};

export default function CharacterPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rank, setRank] = useState<Rank>('E');
  const [activeIdx, setActiveIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const latestRank = await db.rankHistory.orderBy('createdAt').last();
      const r: Rank = latestRank?.rank ?? 'E';
      setRank(r);
      setActiveIdx(RANK_ORDER.indexOf(r));
      setLoaded(true);
    }
    load();
  }, []);

  // Instant-scroll to current rank after mount
  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    const idx = RANK_ORDER.indexOf(rank);
    containerRef.current.scrollLeft = idx * containerRef.current.clientWidth;
  }, [loaded, rank]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    if (w === 0) return;
    const idx = Math.round(containerRef.current.scrollLeft / w);
    setActiveIdx(Math.min(Math.max(0, idx), RANK_ORDER.length - 1));
  }, []);

  const scrollToIdx = useCallback((idx: number) => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({
      left: idx * containerRef.current.clientWidth,
      behavior: 'smooth',
    });
  }, []);

  if (!loaded) return null;

  const currentIdx = RANK_ORDER.indexOf(rank);

  return (
    /* Full-screen overlay — covers BottomNav for the immersive view */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg)',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      {/* ── Fixed header: back + rank dots + counter ────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 20px',
          background:
            'linear-gradient(180deg,rgba(10,14,23,0.82) 0%,transparent 100%)',
          pointerEvents: 'none',
        }}
      >
        {/* Back */}
        <button
          onClick={() => router.back()}
          style={{
            pointerEvents: 'auto',
            color: 'var(--color-text-muted)',
            fontSize: 22,
            lineHeight: 1,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px 4px 0',
          }}
          aria-label="Back"
        >
          ←
        </button>

        {/* Rank dots */}
        <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
          {RANK_ORDER.map((r, i) => {
            const c = `var(--color-rank-${r.toLowerCase()})`;
            const isActive = i === activeIdx;
            return (
              <button
                key={r}
                onClick={() => scrollToIdx(i)}
                aria-label={`Go to rank ${r}`}
                style={{
                  width: isActive ? 22 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: isActive ? c : 'rgba(255,255,255,0.18)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'width 0.3s ease, background 0.3s ease',
                  boxShadow: isActive ? `0 0 7px ${c}` : 'none',
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>

        {/* Page counter */}
        <div
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: 'var(--color-text-muted)',
          }}
        >
          {activeIdx + 1}&thinsp;/&thinsp;{RANK_ORDER.length}
        </div>
      </div>

      {/* ── Horizontal scroll container ──────────────────────────────── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
        {RANK_ORDER.map((r, idx) => {
          const isCurrent = idx === currentIdx;
          const isAttained = idx < currentIdx;
          const isLocked = idx > currentIdx;
          const c = `var(--color-rank-${r.toLowerCase()})`;

          return (
            <div
              key={r}
              style={{
                flexShrink: 0,
                width: '100vw',
                height: '100dvh',
                scrollSnapAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Portrait artwork */}
              <Image
                src={`/${r.toLowerCase()}-rank.png`}
                alt={RANK_TITLES[r]}
                fill
                style={{
                  objectFit: 'contain',
                  objectPosition: 'center',
                  filter: isLocked
                    ? 'brightness(0.35) grayscale(0.25)'
                    : 'none',
                }}
                priority={Math.abs(idx - currentIdx) <= 1}
                sizes="100vw"
              />

              {/* Top fade */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg,rgba(10,14,23,0.55) 0%,transparent 22%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Bottom cinematic fade */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg,transparent 40%,rgba(10,14,23,0.6) 68%,rgba(10,14,23,0.97) 100%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Rank-color radial glow at bottom */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(ellipse at center bottom,color-mix(in srgb,${c} ${isLocked ? '7%' : '18%'},transparent) 0%,transparent 62%)`,
                  pointerEvents: 'none',
                }}
              />

              {/* Classification header */}
              <div
                style={{
                  position: 'absolute',
                  top: 68,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: '0.26em',
                    textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, monospace',
                    color: `color-mix(in srgb,${c} ${isLocked ? '35%' : '85%'},white)`,
                  }}
                >
                  ‹ RANK {r} · CLASSIFICATION ›
                </span>
              </div>

              {/* Corner brackets */}
              {[
                { top: 62, left: 16, borderTop: true, borderLeft: true },
                { top: 62, right: 16, borderTop: true, borderRight: true },
                { bottom: 108, left: 16, borderBottom: true, borderLeft: true },
                { bottom: 108, right: 16, borderBottom: true, borderRight: true },
              ].map((b, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: b.top,
                    left: b.left,
                    right: b.right,
                    bottom: b.bottom,
                    width: 22,
                    height: 22,
                    borderTop: b.borderTop
                      ? `1.5px solid color-mix(in srgb,${c} ${isLocked ? '20%' : '55%'},transparent)`
                      : undefined,
                    borderBottom: b.borderBottom
                      ? `1.5px solid color-mix(in srgb,${c} ${isLocked ? '20%' : '55%'},transparent)`
                      : undefined,
                    borderLeft: b.borderLeft
                      ? `1.5px solid color-mix(in srgb,${c} ${isLocked ? '20%' : '55%'},transparent)`
                      : undefined,
                    borderRight: b.borderRight
                      ? `1.5px solid color-mix(in srgb,${c} ${isLocked ? '20%' : '55%'},transparent)`
                      : undefined,
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {/* Lock icon (centered, locked ranks only) */}
              {isLocked && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    paddingBottom: '20%',
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="1.5" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                </div>
              )}

              {/* ── Bottom content overlay ─────────────────────────── */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '0 24px 110px',
                  pointerEvents: 'none',
                }}
              >
                {/* Status chip */}
                <div style={{ marginBottom: 18 }}>
                  {isCurrent ? (
                    <span
                      className="hud-chip"
                      style={{
                        color: 'var(--color-glow-bright)',
                        borderColor: 'rgba(96,165,250,0.5)',
                        background: 'rgba(10,14,23,0.85)',
                      }}
                    >
                      <span className="hud-chip__dot" />
                      CURRENT EVOLUTION
                    </span>
                  ) : isAttained ? (
                    <span
                      className="hud-chip"
                      style={{
                        color: 'var(--color-success)',
                        borderColor: 'rgba(34,197,94,0.4)',
                        background: 'rgba(10,14,23,0.85)',
                      }}
                    >
                      <span className="hud-chip__dot" />
                      ATTAINED
                    </span>
                  ) : (
                    <span
                      className="hud-chip"
                      style={{
                        color: 'var(--color-text-muted)',
                        borderColor: 'var(--color-border)',
                        background: 'rgba(10,14,23,0.85)',
                      }}
                    >
                      <span
                        className="hud-chip__dot"
                        style={{ opacity: 0.35 }}
                      />
                      LOCKED
                    </span>
                  )}
                </div>

                {/* Rank letter + RANK label */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily:
                        'var(--font-display, system-ui, sans-serif)',
                      fontWeight: 900,
                      fontSize: 100,
                      lineHeight: 1,
                      color: isLocked ? 'rgba(255,255,255,0.15)' : c,
                      textShadow: !isLocked
                        ? `0 0 48px color-mix(in srgb,${c} 70%,transparent),0 0 96px color-mix(in srgb,${c} 30%,transparent)`
                        : 'none',
                    }}
                  >
                    {r}
                  </span>
                  <span
                    style={{
                      fontFamily:
                        'var(--font-display, system-ui, sans-serif)',
                      fontWeight: 700,
                      fontSize: 13,
                      letterSpacing: '0.18em',
                      color: isLocked ? 'rgba(255,255,255,0.15)' : c,
                      marginBottom: 14,
                      textTransform: 'uppercase',
                    }}
                  >
                    RANK
                  </span>
                </div>

                {/* Title */}
                <div
                  style={{
                    fontFamily:
                      'var(--font-display, system-ui, sans-serif)',
                    fontWeight: 900,
                    fontSize: 30,
                    color: isLocked ? 'rgba(255,255,255,0.18)' : 'white',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    lineHeight: 1.05,
                    textShadow: !isLocked
                      ? '0 2px 20px rgba(0,0,0,0.95)'
                      : 'none',
                    marginBottom: 8,
                  }}
                >
                  {RANK_TITLES[r].toUpperCase()}
                </div>

                {/* Subtitle */}
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.26em',
                    textTransform: 'uppercase',
                    color: isLocked
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.48)',
                    fontFamily: 'ui-monospace, monospace',
                    marginBottom: 22,
                  }}
                >
                  {RANK_SUBTITLES[r].toUpperCase()}
                </div>

                {/* Power level bar */}
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: '0.24em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.28)',
                      fontFamily: 'ui-monospace, monospace',
                      marginBottom: 7,
                    }}
                  >
                    POWER LEVEL
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 3,
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 2,
                      }}
                    >
                      <div
                        style={{
                          width: `${RANK_POWER[r]}%`,
                          height: '100%',
                          background: isLocked
                            ? 'rgba(255,255,255,0.12)'
                            : c,
                          borderRadius: 2,
                          boxShadow: !isLocked
                            ? `0 0 9px color-mix(in srgb,${c} 80%,transparent)`
                            : 'none',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: isLocked ? 'rgba(255,255,255,0.18)' : c,
                        fontFamily:
                          'var(--font-display, system-ui, sans-serif)',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        flexShrink: 0,
                      }}
                    >
                      {RANK_POWER[r]}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Swipe arrows ────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 72,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 20px',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        <button
          onClick={() => scrollToIdx(activeIdx - 1)}
          disabled={activeIdx === 0}
          style={{
            pointerEvents: 'auto',
            opacity: activeIdx === 0 ? 0 : 0.4,
            color: 'white',
            fontSize: 22,
            background: 'none',
            border: 'none',
            cursor: activeIdx === 0 ? 'default' : 'pointer',
            transition: 'opacity 0.2s',
            padding: '8px',
          }}
          aria-label="Previous rank"
        >
          ←
        </button>
        <button
          onClick={() => scrollToIdx(activeIdx + 1)}
          disabled={activeIdx === RANK_ORDER.length - 1}
          style={{
            pointerEvents: 'auto',
            opacity: activeIdx === RANK_ORDER.length - 1 ? 0 : 0.4,
            color: 'white',
            fontSize: 22,
            background: 'none',
            border: 'none',
            cursor:
              activeIdx === RANK_ORDER.length - 1 ? 'default' : 'pointer',
            transition: 'opacity 0.2s',
            padding: '8px',
          }}
          aria-label="Next rank"
        >
          →
        </button>
      </div>
    </div>
  );
}
