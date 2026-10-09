'use client';

interface CourseFieldsProps {
  name: string;
  total: string;
  daily: string;
  onName: (v: string) => void;
  onTotal: (v: string) => void;
  onDaily: (v: string) => void;
  autoFocus?: boolean;
}

const inputClass =
  'w-full bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow';
const labelClass = 'block text-[10px] tracking-[0.16em] uppercase text-text-muted mb-1';

/** Name / total units / units per day, with plain-language labels so nobody has to
 *  guess what a "unit" is. Used by the INT add form, edit form and onboarding. */
export function CourseFields({ name, total, daily, onName, onTotal, onDaily, autoFocus }: CourseFieldsProps) {
  return (
    <div className="space-y-2.5">
      <div>
        <label className={labelClass} htmlFor="course-name">What are you studying?</label>
        <input
          id="course-name"
          type="text"
          value={name}
          onChange={e => onName(e.target.value)}
          placeholder="e.g. Spanish, CS50, Guitar"
          className={inputClass}
          autoFocus={autoFocus}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={labelClass} htmlFor="course-total">Total units</label>
          <input
            id="course-total"
            type="number"
            inputMode="numeric"
            min={1}
            value={total}
            onChange={e => onTotal(e.target.value)}
            placeholder="e.g. 60"
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className={labelClass} htmlFor="course-daily">Units per day</label>
          <input
            id="course-daily"
            type="number"
            inputMode="numeric"
            min={1}
            value={daily}
            onChange={e => onDaily(e.target.value)}
            placeholder="e.g. 1"
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-[10px] text-text-muted leading-relaxed">
        A unit is one lesson, chapter or video. Total units is how many there are in all; units per day is how many you&apos;ll finish each day to count as done.
      </p>
    </div>
  );
}
