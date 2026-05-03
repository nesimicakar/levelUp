'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, sublabel, disabled }: ToggleProps) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-md border transition-colors ${
        checked
          ? 'border-glow/40 bg-glow/[0.04]'
          : 'border-border bg-surface'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <div className="text-left">
        <span className={`text-sm ${checked ? 'text-glow-bright' : 'text-text'}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-xs text-text-muted mt-0.5">{sublabel}</span>
        )}
      </div>
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          checked
            ? 'border-glow bg-glow/20 text-glow-bright'
            : 'border-text-muted'
        }`}
      >
        {checked && <span className="text-xs">✓</span>}
      </div>
    </button>
  );
}
