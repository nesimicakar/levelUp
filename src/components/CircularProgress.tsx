'use client';

import { useEffect, useRef, useState } from 'react';

interface CircularProgressProps {
  percentage: number;
}

export function CircularProgress({ percentage }: CircularProgressProps) {
  const size = 148;
  const center = size / 2;
  const strokeWidth = 5;
  const outerStrokeWidth = 1;

  const outerRadius = (size - 2) / 2;
  const mainRadius = outerRadius - 8;

  const circumference = 2 * Math.PI * mainRadius;
  const offset = circumference - (percentage / 100) * circumference;
  const isComplete = percentage >= 100;

  const prevPctRef = useRef(percentage);
  const [showCompletePulse, setShowCompletePulse] = useState(false);

  useEffect(() => {
    if (percentage >= 100 && prevPctRef.current < 100) {
      setShowCompletePulse(true);
      const timer = setTimeout(() => setShowCompletePulse(false), 1200);
      prevPctRef.current = percentage;
      return () => clearTimeout(timer);
    }
    prevPctRef.current = percentage;
  }, [percentage]);

  const completeColor = '#16a34a';
  const arcColor = isComplete ? completeColor : 'var(--color-glow)';

  // Milestone nodes at 20% intervals
  const milestones = [20, 40, 60, 80, 100];
  const milestoneRadius = mainRadius + strokeWidth / 2 + 4;

  // Endpoint node position
  const endAngle = (percentage / 100) * 360 - 90;
  const endRad = (endAngle * Math.PI) / 180;
  const nodeX = center + mainRadius * Math.cos(endRad);
  const nodeY = center + mainRadius * Math.sin(endRad);

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer ultra-thin static ring */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={outerStrokeWidth}
            opacity={0.2}
          />

          {/* Background track ring */}
          <circle
            cx={center}
            cy={center}
            r={mainRadius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            opacity={0.4}
          />

          {/* Continuous progress arc */}
          <circle
            cx={center}
            cy={center}
            r={mainRadius}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            className={showCompletePulse ? 'seal-complete-pulse' : ''}
            style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
          />

          {/* Endpoint node */}
          {percentage > 0 && (
            <circle
              cx={nodeX}
              cy={nodeY}
              r={2.5}
              fill={arcColor}
              opacity={0.9}
              filter="url(#nodeGlow)"
              style={{ transition: 'cx 0.6s ease-out, cy 0.6s ease-out' }}
            />
          )}

          {/* Milestone nodes */}
          {milestones.map((m) => {
            const angle = (m / 100) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const mx = center + milestoneRadius * Math.cos(rad);
            const my = center + milestoneRadius * Math.sin(rad);
            const passed = percentage >= m;
            return (
              <circle
                key={m}
                cx={mx}
                cy={my}
                r={1.8}
                fill={arcColor}
                opacity={passed ? 0.55 : 0.12}
                style={{ transition: 'opacity 0.4s ease-out' }}
              />
            );
          })}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold tracking-tight"
            style={{ color: isComplete ? '#bbf7d0' : undefined }}
          >
            {!isComplete && <span className="text-glow">{percentage}%</span>}
            {isComplete && `${percentage}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
