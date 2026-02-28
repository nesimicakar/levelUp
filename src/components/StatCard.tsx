'use client';

import Link from 'next/link';
import type { StatType, DayStatus } from '@/types';
import { ProgressBar } from './ProgressBar';

interface StatCardProps {
  stat: StatType;
  level: number;
  progressPct: number;
  status: DayStatus;
  subtitle: string;
  href: string;
}

const STATUS_DISPLAY: Record<DayStatus, { label: string; className: string }> = {
  incomplete: { label: 'INCOMPLETE', className: 'text-warning' },
  complete: { label: 'COMPLETE', className: 'text-success' },
  rest: { label: 'REST DAY', className: 'text-text-muted' },
};

export function StatCard({ stat, level, progressPct, status, subtitle, href }: StatCardProps) {
  const statusInfo = STATUS_DISPLAY[status];

  return (
    <Link href={href} className="block">
      <div className="stat-card rounded-lg p-4 glow-border animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-glow text-lg font-bold glow-text">{stat}</span>
            <span className="text-text-dim text-sm">Lv.{level}</span>
          </div>
          <span className={`text-xs font-medium tracking-wider ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>
        <ProgressBar value={progressPct} className="mb-2" />
        <p className="text-text-muted text-xs">{subtitle}</p>
      </div>
    </Link>
  );
}
