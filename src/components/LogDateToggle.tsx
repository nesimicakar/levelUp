'use client';

interface LogDateToggleProps {
  value: string;
  today: string;
  yesterday?: string;
  onChange: (date: string) => void;
}

export function LogDateToggle({ value, today, yesterday, onChange }: LogDateToggleProps) {
  if (!yesterday) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">Log for</span>
      <div className="flex rounded-lg overflow-hidden border border-border">
        <button
          onClick={() => onChange(today)}
          className={`px-3 py-1 text-xs font-medium tracking-wider transition-colors border-r border-border ${
            value === today
              ? 'bg-glow/20 text-glow'
              : 'bg-surface text-text-muted hover:text-text'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => onChange(yesterday)}
          className={`px-3 py-1 text-xs font-medium tracking-wider transition-colors ${
            value === yesterday
              ? 'bg-glow/20 text-glow'
              : 'bg-surface text-text-muted hover:text-text'
          }`}
        >
          Yesterday
        </button>
      </div>
    </div>
  );
}
