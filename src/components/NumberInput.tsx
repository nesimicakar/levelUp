'use client';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function NumberInput({ value, onChange, label, min = 0, max = 9999, step = 1, unit }: NumberInputProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
      <span className="text-sm text-text">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-8 h-8 rounded bg-surface-light border border-border text-text-dim hover:text-glow transition-colors flex items-center justify-center"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className="w-16 text-center bg-transparent border-b border-border text-glow-bright text-sm focus:outline-none focus:border-glow"
        />
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-8 h-8 rounded bg-surface-light border border-border text-text-dim hover:text-glow transition-colors flex items-center justify-center"
        >
          +
        </button>
        {unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
      </div>
    </div>
  );
}
