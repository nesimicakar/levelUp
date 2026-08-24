'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveCharacter, createCharacter, getAllCharacters } from '@/lib/db';
import { getAvailableNextCharacters } from '@/lib/logic/characters';
import type { Character } from '@/types';
import type { CharacterDef } from '@/lib/data/characterDefs';

type Phase = 'reveal' | 'choose' | 'confirming';

export default function MasteryPage() {
  const router = useRouter();
  const [mastered, setMastered] = useState<Character | null>(null);
  const [choices, setChoices] = useState<CharacterDef[]>([]);
  const [phase, setPhase] = useState<Phase>('reveal');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const active = await getActiveCharacter();
    // This screen only means something right after a mastery — if the active
    // character isn't actually mastered (direct nav, stale link), bounce home
    // rather than let someone pick a character speculatively before reaching S.
    if (active.status !== 'mastered') {
      router.replace('/achievements');
      return;
    }
    setMastered(active);
    const all = await getAllCharacters();
    setChoices(getAvailableNextCharacters(all.map(c => c.slug)));
    setLoaded(true);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const handleChoose = async (slug: string) => {
    setPhase('confirming');
    await createCharacter(slug);
    router.replace('/achievements/character');
  };

  if (!loaded || !mastered) return null;

  const snapshot = mastered.finalStatsSnapshot;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg)',
        zIndex: 60,
        overflowY: 'auto',
      }}
    >
      <div className="max-w-lg mx-auto px-6 py-10 min-h-full flex flex-col items-center justify-center text-center">
        {phase === 'reveal' && (
          <>
            <div
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '0.3em', color: 'var(--color-rank-s)', textTransform: 'uppercase', marginBottom: 18 }}
            >
              ✦ Character Mastered ✦
            </div>

            <div
              style={{
                fontSize: 64, marginBottom: 20, lineHeight: 1,
                filter: 'drop-shadow(0 0 24px color-mix(in srgb, var(--color-rank-s) 60%, transparent))',
              }}
            >
              {mastered.icon}
            </div>

            <div className="font-display font-black uppercase" style={{ fontSize: 32, color: 'var(--color-text)', letterSpacing: '0.04em', marginBottom: 6 }}>
              {mastered.name}
            </div>
            <div
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '0.24em', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 32 }}
            >
              Reached Rank S · Monarch-Class
            </div>

            {snapshot && (
              <div className="frame-cut p-4 w-full grid grid-cols-2 gap-3 mb-10" style={{ maxWidth: 320 }}>
                <div>
                  <p className="font-display font-bold text-lg leading-none">{snapshot.weeksActive}</p>
                  <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Weeks Active</p>
                </div>
                <div>
                  <p className="font-display font-bold text-lg leading-none">{snapshot.promotions}</p>
                  <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Promotions</p>
                </div>
                <div>
                  <p className="font-display font-bold text-lg leading-none">{snapshot.bestWeekPct}%</p>
                  <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Best Week</p>
                </div>
                <div>
                  <p className="font-display font-bold text-lg leading-none">{snapshot.graceWeeksUsed}</p>
                  <p className="text-text-muted text-[9px] tracking-[0.12em] uppercase mt-1">Grace Used</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setPhase('choose')}
              className="font-display text-[11px] tracking-[0.24em] uppercase px-8 py-3 hover:brightness-125 transition-all"
              style={{
                color: 'var(--color-rank-s)',
                border: '1px solid color-mix(in srgb, var(--color-rank-s) 45%, transparent)',
                background: 'color-mix(in srgb, var(--color-rank-s) 8%, rgba(10,14,23,0.75))',
                clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
              }}
            >
              Choose Next Character →
            </button>
          </>
        )}

        {(phase === 'choose' || phase === 'confirming') && (
          <>
            <div
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '0.3em', color: 'var(--color-glow-bright)', textTransform: 'uppercase', marginBottom: 8 }}
            >
              ‹ Begin a New Journey ›
            </div>
            <div className="font-display font-bold text-lg text-text mb-8">Choose your next character</div>

            <div className="w-full space-y-3" style={{ maxWidth: 360 }}>
              {choices.map(def => (
                <button
                  key={def.slug}
                  disabled={phase === 'confirming'}
                  onClick={() => handleChoose(def.slug)}
                  className="frame-cut p-4 w-full flex items-center gap-4 hover:brightness-110 transition-all text-left"
                  style={{ opacity: phase === 'confirming' ? 0.5 : 1 }}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 48, height: 48, fontSize: 24, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8 }}
                  >
                    {def.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-sm text-text">{def.name}</div>
                    <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">Starts at Rank E</div>
                  </div>
                  <div className="text-text-muted text-xs">→</div>
                </button>
              ))}
              {choices.length === 0 && (
                <div className="text-text-muted text-sm">No new characters left in the pool.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
