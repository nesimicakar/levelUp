'use client';

import { useEffect, useState } from 'react';
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

// Fixed power thresholds per rank (display only, no logic change)
const RANK_POWER: Record<Rank, number> = {
  E: 14,
  D: 32,
  C: 48,
  B: 66,
  A: 84,
  S: 100,
};

const CARD_W = 240;
const CARD_H = 380;

export default function CharacterPage() {
  const router = useRouter();
  const [rank, setRank] = useState<Rank>('E');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const latestRank = await db.rankHistory.orderBy('createdAt').last();
      setRank(latestRank?.rank ?? 'E');
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return null;

  const currentIdx = RANK_ORDER.indexOf(rank);

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100dvh' }}>

      {/* Header */}
      <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <p className="text-[9px] tracking-[0.32em]" style={{ color: 'var(--color-glow-bright)' }}>
              SYSTEM // HUNTER ASCENSION
            </p>
            <h1 className="font-display text-2xl font-black glow-text leading-none mt-0.5">
              RANK EVOLUTION
            </h1>
          </div>
        </div>
        <p className="text-text-muted text-[10px] tracking-[0.2em] mt-2 ml-9 uppercase">
          One Hunter · Six Thresholds · E → S
        </p>

        {/* Rank dot-nav */}
        <div className="flex gap-3 mt-3 ml-9">
          {RANK_ORDER.map((r, i) => {
            const c = `var(--color-rank-${r.toLowerCase()})`;
            const isCurr = i === currentIdx;
            return (
              <span
                key={r}
                className="font-display font-bold text-sm"
                style={{
                  color: c,
                  opacity: i <= currentIdx ? 1 : 0.3,
                  textShadow: isCurr ? `0 0 10px ${c}` : 'none',
                  paddingBottom: 2,
                  borderBottom: isCurr ? `2px solid ${c}` : '2px solid transparent',
                }}
              >
                {r}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Horizontal card strip ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          padding: '8px 16px 100px 16px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          /* hide scrollbar cross-browser */
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}
      >
        {RANK_ORDER.map((r, idx) => {
          const isCurrent = idx === currentIdx;
          const isAttained = idx < currentIdx;
          const isLocked = idx > currentIdx;
          const c = `var(--color-rank-${r.toLowerCase()})`;

          return (
            /*
             * Outer wrapper handles:
             *   - flex sizing & scroll-snap
             *   - drop-shadow glow (works through clip-path on child)
             */
            <div
              key={r}
              style={{
                flexShrink: 0,
                width: CARD_W,
                scrollSnapAlign: 'start',
                filter: isCurrent
                  ? `drop-shadow(0 0 22px color-mix(in srgb, ${c} 45%, transparent))`
                  : isAttained
                  ? `drop-shadow(0 0 8px color-mix(in srgb, ${c} 18%, transparent))`
                  : 'none',
              }}
            >
              {/* Inner card — clip-path gives the cut-corner HUD shape */}
              <div
                style={{
                  width: '100%',
                  height: CARD_H,
                  position: 'relative',
                  overflow: 'hidden',
                  clipPath:
                    'polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px))',
                  border: `1px solid color-mix(in srgb, ${c} ${isCurrent ? '60%' : '20%'}, transparent)`,
                  opacity: isLocked ? 0.58 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Portrait art */}
                <Image
                  src={`/${r.toLowerCase()}-rank.png`}
                  alt={`${RANK_TITLES[r]} portrait`}
                  fill
                  style={{ objectFit: 'cover', objectPosition: 'top center' }}
                  sizes={`${CARD_W}px`}
                  priority={idx < 2}
                />

                {/* Gradient: cinematic bottom fade */}
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    background:
                      'linear-gradient(180deg,rgba(10,14,23,0.35) 0%,transparent 38%,rgba(10,14,23,0.55) 62%,rgba(10,14,23,0.97) 100%)',
                  }}
                />
                {/* Rank-color bottom vignette */}
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    background: `radial-gradient(ellipse at center bottom,color-mix(in srgb,${c} 14%,transparent) 0%,transparent 65%)`,
                  }}
                />

                {/* Corner brackets */}
                {[
                  { top: 10, left: 10, bt: true, bl: true },
                  { top: 10, right: 10, bt: true, br: true },
                  { bottom: 10, left: 10, bb: true, bl: true },
                  { bottom: 10, right: 10, bb: true, br: true },
                ].map((b, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: b.top,
                      left: b.left,
                      right: b.right,
                      bottom: b.bottom,
                      width: 18,
                      height: 18,
                      borderTop: b.bt ? `1.5px solid color-mix(in srgb,${c} 65%,transparent)` : undefined,
                      borderBottom: b.bb ? `1.5px solid color-mix(in srgb,${c} 65%,transparent)` : undefined,
                      borderLeft: b.bl ? `1.5px solid color-mix(in srgb,${c} 65%,transparent)` : undefined,
                      borderRight: b.br ? `1.5px solid color-mix(in srgb,${c} 65%,transparent)` : undefined,
                    }}
                  />
                ))}

                {/* Top classification text */}
                <div
                  style={{
                    position: 'absolute', top: 14,
                    left: 0, right: 0,
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 8,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      fontFamily: 'ui-monospace,monospace',
                      color: `color-mix(in srgb,${c} 80%,white)`,
                    }}
                  >
                    ‹ RANK {r} · CLASSIFICATION ›
                  </span>
                </div>

                {/* Status badge (YOU / ✓) */}
                {isCurrent ? (
                  <div style={{ position: 'absolute', top: 28, right: 14 }}>
                    <span
                      className="hud-chip"
                      style={{
                        color: 'var(--color-glow-bright)',
                        borderColor: 'rgba(96,165,250,0.5)',
                        background: 'rgba(10,14,23,0.8)',
                        fontSize: 9,
                      }}
                    >
                      <span className="hud-chip__dot" />YOU
                    </span>
                  </div>
                ) : isAttained ? (
                  <div
                    style={{
                      position: 'absolute', top: 28, right: 14,
                      color: 'var(--color-success)', fontSize: 16,
                    }}
                  >
                    ✓
                  </div>
                ) : null}

                {/* Bottom content */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 13px 13px' }}>

                  {/* Large rank letter + RANK label */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-display,system-ui,sans-serif)',
                        fontWeight: 900,
                        fontSize: 58,
                        lineHeight: 1,
                        color: c,
                        opacity: 0.88,
                        textShadow: `0 0 28px color-mix(in srgb,${c} 90%,transparent)`,
                      }}
                    >
                      {r}
                    </span>
                    <span
                      style={{
                        color: c,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        marginBottom: 9,
                        fontFamily: 'var(--font-display,system-ui,sans-serif)',
                        textTransform: 'uppercase',
                      }}
                    >
                      RANK
                    </span>
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontFamily: 'var(--font-display,system-ui,sans-serif)',
                      fontWeight: 900,
                      fontSize: 18,
                      color: 'white',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      lineHeight: 1.1,
                      textShadow: '0 2px 10px rgba(0,0,0,0.9)',
                    }}
                  >
                    {RANK_TITLES[r].toUpperCase()}
                  </div>

                  {/* Subtitle */}
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: '0.22em',
                      color: 'rgba(255,255,255,0.42)',
                      textTransform: 'uppercase',
                      marginTop: 4,
                      fontFamily: 'ui-monospace,monospace',
                    }}
                  >
                    {RANK_SUBTITLES[r].toUpperCase()}
                  </div>

                  {/* Power level bar */}
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        fontSize: 8,
                        letterSpacing: '0.2em',
                        color: 'rgba(255,255,255,0.28)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                        fontFamily: 'ui-monospace,monospace',
                      }}
                    >
                      POWER LEVEL
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 2,
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: 1,
                        }}
                      >
                        <div
                          style={{
                            width: `${RANK_POWER[r]}%`,
                            height: '100%',
                            background: c,
                            borderRadius: 1,
                            boxShadow: `0 0 6px color-mix(in srgb,${c} 80%,transparent)`,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 9,
                          color: c,
                          letterSpacing: '0.1em',
                          fontFamily: 'var(--font-display,system-ui,sans-serif)',
                          fontWeight: 700,
                        }}
                      >
                        {RANK_POWER[r]}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll hint */}
      <p
        className="text-center text-text-muted pb-4"
        style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' }}
      >
        ← swipe the sequence →
      </p>
    </div>
  );
}
