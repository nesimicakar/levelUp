'use client';

import Link from 'next/link';
import type { StatType, DayStatus } from '@/types';

interface StatCardProps {
  stat: StatType;
  level: number;
  progressPct: number;
  status: DayStatus;
  subtitle: string;
  href: string;
  highlight?: boolean;
  onClick?: () => void;
}

const STAT_HUE: Record<StatType, string> = {
  STR: 'var(--color-stat-str)',
  AGI: 'var(--color-stat-agi)',
  VIT: 'var(--color-stat-vit)',
  INT: 'var(--color-stat-int)',
  PER: 'var(--color-stat-per)',
};

export function StatCard({ stat, level, progressPct, status, subtitle, href, highlight, onClick }: StatCardProps) {
  const hue = STAT_HUE[stat];
  const isComplete = status === 'complete' || status === 'rest';
  const restLabel = status === 'rest' ? 'REST' : null;

  return (
    <Link href={href} className="block" onClick={onClick}>
      <div
        className={`frame-cut p-3 animate-fade-in ${highlight ? 'frame-cut--glow' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: stat tile + level + subtitle */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="stat-tile"
              style={{
                color: hue,
                background: `linear-gradient(135deg, color-mix(in srgb, ${hue} 14%, transparent), transparent)`,
                border: `1px solid color-mix(in srgb, ${hue} 40%, transparent)`,
              }}
            >
              {stat}
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold text-text">LVL {level}</div>
              <div className="text-[11px] text-text-muted truncate">{subtitle}</div>
            </div>
          </div>

          {/* Right: status chip + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {restLabel ? (
              <span className="hud-chip hud-chip--ok"><span className="hud-chip__dot" />{restLabel}</span>
            ) : isComplete ? (
              <span className="hud-chip hud-chip--ok"><span className="hud-chip__dot" />OK</span>
            ) : (
              <span className="hud-chip"><span className="hud-chip__dot" style={{ color: 'var(--color-text-muted)' }} />…</span>
            )}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              className="text-text-muted"
              style={{ transform: 'scaleX(-1)' }}
              aria-hidden
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </div>
        </div>

        <div className={`hud-bar hud-bar--${stat.toLowerCase()} mt-3`}>
          <div className="hud-bar__fill" style={{ width: `${Math.min(progressPct, 100)}%` }} />
        </div>
      </div>
    </Link>
  );
}
