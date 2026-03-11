'use client';

import { useEffect, useState } from 'react';

interface SystemMessageProps {
  title: string;
  subtitle: string;
  visible: boolean;
  onDismiss: () => void;
  /** 'major' = large centered card (protocol complete, level up, rank up)
   *  'minor' = small top toast (session logged, confirmations) */
  variant?: 'major' | 'minor';
}

const MAJOR_DURATION = 3500;
const MINOR_DURATION = 1400;

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
    const duration = variant === 'major' ? MAJOR_DURATION : MINOR_DURATION;
    const t = setTimeout(() => { setActive(false); onDismiss(); }, duration);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!active) return null;

  if (variant === 'major') {
    return (
      <div
        key={key}
        className="fixed left-1/2 z-50 pointer-events-none"
        style={{
          top: '236px',
          transform: 'translateX(-50%)',
          width: 'min(280px, 86vw)',
        }}
      >
        <div
          className="rounded-xl px-7 py-5 text-center"
          style={{
            background: 'rgba(17, 24, 39, 0.72)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.14), inset 0 0 12px rgba(59, 130, 246, 0.04)',
            backdropFilter: 'blur(8px)',
            animation: `system-msg-in ${MAJOR_DURATION}ms ease-out forwards`,
          }}
        >
          <p className="text-[10px] tracking-widest text-text-muted uppercase mb-1.5">{title}</p>
          <p className="text-lg font-bold tracking-wider text-glow-bright uppercase leading-tight">{subtitle}</p>
          <p className="text-[11px] text-text-muted mt-2 tracking-wide">All objectives completed</p>
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
