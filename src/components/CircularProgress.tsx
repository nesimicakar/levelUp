'use client';

import { useEffect, useRef, useState } from 'react';

interface CircularProgressProps {
  percentage: number;
  domainProgress: number[]; // [STR, AGI, VIT, INT, PER], each 0-1
}

export function CircularProgress({ percentage, domainProgress }: CircularProgressProps) {
  const size = 148;
  const center = size / 2;
  const strokeWidth = 5;
  const outerStrokeWidth = 1;

  const outerRadius = (size - 2) / 2;
  const mainRadius = outerRadius - 8;

  const circumference = 2 * Math.PI * mainRadius;
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

  // Segment layout: 5 domains with small gaps
  const segmentCount = 5;
  const gapAngle = 2; // degrees between segments
  const gapLength = (gapAngle / 360) * circumference;
  const segmentMaxLength = (circumference - gapLength * segmentCount) / segmentCount;

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

          {/* Background track with segment gaps */}
          <circle
            cx={center}
            cy={center}
            r={mainRadius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            opacity={0.4}
            strokeDasharray={`${segmentMaxLength} ${gapLength}`}
            transform={`rotate(-90 ${center} ${center})`}
          />

          {/* Progress segments */}
          {domainProgress.map((progress, i) => {
            const fillLength = Math.min(progress, 1) * segmentMaxLength;
            if (fillLength <= 0) return null;
            const segmentStart = i * (segmentMaxLength + gapLength);
            const isLocked = progress >= 1;

            return (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={mainRadius}
                fill="none"
                stroke={isComplete ? completeColor : 'var(--color-glow)'}
                strokeWidth={strokeWidth}
                strokeDasharray={`${fillLength} ${circumference - fillLength}`}
                strokeDashoffset={circumference - segmentStart}
                transform={`rotate(-90 ${center} ${center})`}
                className={showCompletePulse ? 'seal-complete-pulse' : ''}
                style={{
                  transition: 'stroke-dasharray 0.6s ease-out',
                  filter: isLocked && !isComplete ? 'brightness(1.3)' : undefined,
                }}
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
