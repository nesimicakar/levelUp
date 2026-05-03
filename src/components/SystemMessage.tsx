'use client';

import { useEffect, useState } from 'react';

interface SystemMessageProps {
  title: string;
  subtitle: string;
  visible: boolean;
  onDismiss: () => void;
  /** 'major' = full-screen Daily Protocol Cleared overlay (big ring + CONTINUE)
   *  'minor' = small top toast (session logged, confirmations) */
  variant?: 'major' | 'minor';
}

const MINOR_DURATION = 1400;
const MAJOR_AUTO_DISMISS_MS = 8000; // safety net — user normally taps CONTINUE

export function SystemMessage({
  title,
  subtitle,
  visible,
  onDismiss,
  variant = 'minor',
}: SystemMessageProps) {
  const [key, setKey] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKey(k => k + 1);
    setActive(true);
    if (variant === 'minor') {
      const t = setTimeout(() => { setActive(false); onDismiss(); }, MINOR_DURATION);
      return () => clearTimeout(t);
    }
    // major: long auto-dismiss as a safety net only
    const t = setTimeout(() => { setActive(false); onDismiss(); }, MAJOR_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!active) return null;

  if (variant === 'major') {
    // Ring geometry
    const size = 240;
    const stroke = 3;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
      <div
        key={key}
        className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-fade-in"
        style={{
          background: 'rgba(3, 5, 10, 0.92)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="text-center w-full max-w-sm">
          {/* Channel */}
          <p
            className="font-mono-hud text-[10px] tracking-[0.32em] mb-7"
            style={{ color: 'var(--color-glow-bright)' }}
          >
            ‹ {title} ›
          </p>

          {/* Big dashed ring */}
          <div className="relative mx-auto" style={{ width: size, height: size }}>
            <svg width={size} height={size}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="rgba(96,165,250,0.15)"
                strokeWidth={stroke}
                strokeDasharray="4 6"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--color-glow-bright)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={0}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ filter: 'drop-shadow(0 0 8px var(--color-glow-bright))' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-display font-bold tracking-[0.04em] glow-text"
                style={{
                  fontSize: 24,
                  color: 'var(--color-glow-bright)',
                }}
              >
                {subtitle.toUpperCase()}
              </span>
              <span
                className="font-display font-bold leading-none my-1"
                style={{
                  fontSize: 80,
                  color: 'var(--color-text)',
                  textShadow: '0 0 24px rgba(96,165,250,0.6)',
                }}
              >
                100<span className="text-text-muted" style={{ fontSize: 32 }}>%</span>
              </span>
              <span className="font-mono-hud text-[10px] tracking-[0.18em] uppercase text-text-muted">
                5 / 5 STATS
              </span>
            </div>
          </div>

          {/* System acknowledgement */}
          <p
            className="text-text-dim text-xs leading-relaxed mt-7 max-w-[280px] mx-auto"
          >
            The system acknowledges your effort.
          </p>

          {/* Continue */}
          <button
            onClick={() => { setActive(false); onDismiss(); }}
            className="cut-tile mt-7 px-12 py-3 font-display font-bold text-sm tracking-[0.18em] transition-all hover:brightness-125"
            style={{
              background: 'rgba(96,165,250,0.15)',
              border: '1px solid var(--color-glow-bright)',
              color: 'var(--color-glow-bright)',
              boxShadow: '0 0 12px rgba(96,165,250,0.3)',
            }}
          >
            CONTINUE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      key={key}
      className="fixed top-5 left-1/2 z-50 pointer-events-none"
      style={{
        animation: `system-msg-minor-in ${MINOR_DURATION}ms ease-out forwards`,
        transform: 'translateX(-50%)',
        whiteSpace: 'nowrap',
      }}
    >
      <div className="px-4 py-2 rounded-lg border border-glow/30 bg-surface text-center">
        <p className="text-[10px] tracking-widest text-text-muted uppercase">{title}</p>
        <p className="text-xs font-medium text-glow-bright mt-0.5 uppercase">{subtitle}</p>
      </div>
    </div>
  );
}
