'use client';

import { useState } from 'react';
import { updateSettings } from '@/lib/db';
import { DEFAULT_POSTURE_ROUTINE, POSTURE_MIN_MINUTES, getPostureRoutine } from '@/lib/logic/vit';
import type { PostureExercise, UserSettings } from '@/types';

const inputStyle = { border: '1px solid var(--color-border)' } as const;

/** Collapsible "what to do" list for the posture protocol: shows a default
 *  ~5 minute routine and lets the user edit, add, remove or reset it. */
export function PostureRoutine({ settings }: { settings: UserSettings }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PostureExercise[]>(() => getPostureRoutine(settings));

  const persist = async (next: PostureExercise[]) => {
    setItems(next);
    await updateSettings({ vitPostureRoutine: next });
  };

  const patch = (id: string, change: Partial<PostureExercise>) =>
    persist(items.map(e => (e.id === id ? { ...e, ...change } : e)));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between pt-2 pb-1 text-[10px] tracking-[0.18em] uppercase text-text-muted hover:text-text transition-colors"
      >
        <span>{open ? '▾' : '▸'} What to do · {POSTURE_MIN_MINUTES} min minimum</span>
        <span>{items.length} moves</span>
      </button>

      {open && (
        <div className="pt-2 pb-1 space-y-2.5">
          <p className="text-[11px] text-text-muted leading-relaxed">
            Do at least {POSTURE_MIN_MINUTES} minutes of posture work, then tick POSTURE above. This is a starter routine. Change it to whatever works for you.
          </p>

          {items.map(e => (
            <div key={e.id} className="flex items-start gap-2">
              {editing ? (
                <>
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      value={e.name}
                      onChange={ev => patch(e.id, { name: ev.target.value })}
                      aria-label="Exercise name"
                      className="w-full px-2 py-1.5 rounded bg-bg text-text text-xs"
                      style={inputStyle}
                    />
                    <input
                      value={e.duration}
                      onChange={ev => patch(e.id, { duration: ev.target.value })}
                      aria-label="Duration"
                      placeholder="e.g. 1 min, 10 reps"
                      className="w-full px-2 py-1.5 rounded bg-bg text-text-dim text-xs"
                      style={inputStyle}
                    />
                  </div>
                  <button
                    onClick={() => persist(items.filter(x => x.id !== e.id))}
                    className="text-text-muted hover:text-text px-1 pt-1.5 leading-none"
                    aria-label={`Remove ${e.name || 'exercise'}`}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-text font-semibold">{e.name}</span>
                    <span className="text-[10px] font-mono-hud text-text-dim flex-shrink-0">{e.duration}</span>
                  </div>
                  {e.tip && <p className="text-[10px] text-text-muted leading-relaxed mt-0.5">{e.tip}</p>}
                </div>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-[11px] text-text-muted">No exercises yet. Add one or reset to the default routine.</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-3">
              <button
                onClick={() => setEditing(v => !v)}
                className="text-[10px] font-bold tracking-[0.18em] uppercase"
                style={{ color: 'var(--color-stat-vit)' }}
              >
                {editing ? 'DONE' : 'EDIT'}
              </button>
              {editing && (
                <button
                  onClick={() => persist([...items, { id: crypto.randomUUID(), name: '', duration: '1 min' }])}
                  className="text-[10px] font-bold tracking-[0.18em] uppercase text-text-dim"
                >
                  + ADD
                </button>
              )}
            </div>
            {editing && (
              <button
                onClick={() => persist(DEFAULT_POSTURE_ROUTINE)}
                className="text-[10px] tracking-[0.18em] uppercase text-text-muted"
              >
                RESET
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
