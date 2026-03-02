'use client';

import { useEffect, useRef, useState } from 'react';

interface CircularProgressProps {
  percentage: number;
  completed: number;
  total: number;
}

export function CircularProgress({ percentage, completed, total }: CircularProgressProps) {
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

  // Darker emerald for the complete state
  const completeColor = '#16a34a';

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
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

          {/* Progress ring */}
          <circle
            cx={center}
            cy={center}
            r={mainRadius}
            fill="none"
            stroke={isComplete ? completeColor : 'var(--color-glow)'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            className={showCompletePulse ? 'seal-complete-pulse' : ''}
            style={{
              transition: 'stroke-dashoffset 0.6s ease-out',
            }}
          />
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
          <span className="text-text-muted text-[11px] tracking-wider">
            {completed} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}
