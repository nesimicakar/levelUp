'use client';

interface CircularProgressProps {
  percentage: number;
  completed: number;
  total: number;
}

export function CircularProgress({ percentage, completed, total }: CircularProgressProps) {
  const size = 140;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const isComplete = percentage >= 100;

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
          />
          {/* Progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isComplete ? 'var(--color-success)' : 'var(--color-glow)'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.6s ease-out',
              filter: isComplete ? 'drop-shadow(0 0 6px var(--color-success))' : undefined,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-2xl font-bold ${isComplete ? 'text-success' : 'text-glow'}`}
            style={isComplete ? { textShadow: '0 0 8px var(--color-success)' } : undefined}
          >
            {percentage}%
          </span>
          <span className="text-text-muted text-xs">
            {completed} / {total} objectives
          </span>
        </div>
      </div>
    </div>
  );
}
