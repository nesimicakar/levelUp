'use client';

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  variant?: 'default' | 'success';
  height?: string;
}

export function ProgressBar({ value, className = '', variant = 'default', height = 'h-2' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress-bar ${height} ${className}`}>
      <div
        className={`h-full ${variant === 'success' ? 'progress-fill-success' : 'progress-fill'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
