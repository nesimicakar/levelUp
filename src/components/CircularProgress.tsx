'use client';

import { useEffect, useRef, useState } from 'react';

interface CircularProgressProps {
  percentage: number;
  overcharge?: boolean;
  color?: string; // rank color token, e.g. 'var(--color-rank-c)'
}

export function CircularProgress({ percentage, overcharge = false, color }: CircularProgressProps) {
  // SVG coordinate space is 176×176; the component renders at 168px via width/height.
  // The extra 8px of coordinate space gives room for the outer calibration ticks
  // without clipping — no overflow:visible hack needed.
  const displaySize = 168;
  const coordSize   = 176;
  const center      = coordSize / 2; // 88

  const strokeWidth      = 5;
  const outerRadius      = 80;   // thin reference ring
  const mainRadius       = 70;   // progress track
  const milestoneR       = mainRadius + strokeWidth / 2 + 3; // 75.5

  const circumference = 2 * Math.PI * mainRadius;
  const offset        = circumference - (percentage / 100) * circumference;
  const isComplete    = percentage >= 100;

  const prevPctRef           = useRef(percentage);
  const [pulse, setPulse]    = useState(false);

  useEffect(() => {
    if (percentage >= 100 && prevPctRef.current < 100) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      prevPctRef.current = percentage;
      return () => clearTimeout(t);
    }
    prevPctRef.current = percentage;
  }, [percentage]);

  const completeColor = '#16a34a';
  const activeColor   = isComplete ? completeColor : (color ?? 'var(--color-glow)');

  // Arc endpoint dot
  const endAngle = (percentage / 100) * 360 - 90;
  const endRad   = (endAngle * Math.PI) / 180;
  const nodeX    = center + mainRadius * Math.cos(endRad);
  const nodeY    = center + mainRadius * Math.sin(endRad);

  // 20 calibration ticks (every 18°) — major tick at every 4th (20% milestones)
  const TICK_COUNT = 20;
  const tickOuterR = outerRadius + 5; // 85 — within the 88px half-width
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const isMajor  = i % 4 === 0;
    const angleDeg = (i / TICK_COUNT) * 360 - 90;
    const rad      = (angleDeg * Math.PI) / 180;
    const innerR   = isMajor ? outerRadius : outerRadius + 3;
    return {
      x1: center + innerR   * Math.cos(rad),
      y1: center + innerR   * Math.sin(rad),
      x2: center + tickOuterR * Math.cos(rad),
      y2: center + tickOuterR * Math.sin(rad),
      isMajor,
      passed: percentage >= (i / TICK_COUNT) * 100,
    };
  });

  // 5 milestone dots at 20% intervals, just outside the main track
  const milestones = [20, 40, 60, 80, 100];

  return (
    <div className="flex justify-center" style={{ pointerEvents: 'none' }}>
      <div className="relative" style={{ width: displaySize, height: displaySize, pointerEvents: 'none' }}>
        <svg
          width={displaySize}
          height={displaySize}
          viewBox={`0 0 ${coordSize} ${coordSize}`}
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            {/* Glow applied to active arc and endpoint dot */}
            <filter id="cpArcGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── Calibration ticks ──────────────────────────────────── */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke={
                t.isMajor && t.passed && !isComplete
                  ? activeColor
                  : 'var(--color-border)'
              }
              strokeWidth={t.isMajor ? 1.2 : 0.7}
              strokeLinecap="round"
              opacity={
                t.isMajor
                  ? (t.passed && !isComplete ? 0.75 : 0.38)
                  : 0.18
              }
              style={{ transition: 'opacity 0.5s ease-out' }}
            />
          ))}

          {/* ── Outer reference ring ───────────────────────────────── */}
          <circle
            cx={center} cy={center} r={outerRadius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={0.8}
            opacity={0.22}
          />

          {/* ── Background track ───────────────────────────────────── */}
          <circle
            cx={center} cy={center} r={mainRadius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            opacity={0.32}
          />

          {/* ── Active progress arc ────────────────────────────────── */}
          <circle
            cx={center} cy={center} r={mainRadius}
            fill="none"
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            className={pulse ? 'seal-complete-pulse' : ''}
            style={{
              transition: 'stroke-dashoffset 0.8s ease-out',
              filter: percentage > 0 ? 'url(#cpArcGlow)' : 'none',
            }}
          />

          {/* ── Endpoint dot ───────────────────────────────────────── */}
          {percentage > 0 && !isComplete && (
            <circle
              cx={nodeX} cy={nodeY} r={3}
              fill={activeColor}
              filter="url(#cpArcGlow)"
              style={{ transition: 'cx 0.8s ease-out, cy 0.8s ease-out' }}
            />
          )}

          {/* ── Milestone dots ─────────────────────────────────────── */}
          {milestones.map((m) => {
            const rad = ((m / 100) * 360 - 90) * (Math.PI / 180);
            const mx  = center + milestoneR * Math.cos(rad);
            const my  = center + milestoneR * Math.sin(rad);
            const passed = percentage >= m;
            return (
              <circle
                key={m}
                cx={mx} cy={my} r={1.8}
                fill={passed ? activeColor : 'var(--color-border)'}
                opacity={passed ? 0.65 : 0.14}
                style={{ transition: 'opacity 0.5s ease-out, fill 0.5s ease-out' }}
              />
            );
          })}
        </svg>

        {/* ── Center text ────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <span
            className="font-bold tracking-tight leading-none"
            style={{
              fontSize: 34,
              color: isComplete ? '#bbf7d0' : (color ?? 'var(--color-text)'),
              textShadow: !isComplete && color
                ? `0 0 18px color-mix(in srgb, ${color} 45%, transparent)`
                : undefined,
            }}
          >
            {percentage}%
          </span>
          <span
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 7,
              letterSpacing: '0.22em',
              color: isComplete ? completeColor : 'var(--color-text-muted)',
              textTransform: 'uppercase',
              marginTop: 5,
              opacity: 0.7,
            }}
          >
            DAILY PROTOCOL
          </span>
        </div>
      </div>
    </div>
  );
}
