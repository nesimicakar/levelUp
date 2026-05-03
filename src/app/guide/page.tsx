'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSettings } from '@/lib/db';

type Step = {
  channel: string;       // ‹ TRANSMISSION ›
  title: string;         // YOU HAVE BEEN SELECTED
  hero: 'rank-e' | 'stat-row' | 'system-glyph';
  frameLabel: string;    // // PROTOCOL
  bullets: string[];
  button: string;
};

const STEPS: Step[] = [
  {
    channel: '‹ TRANSMISSION ›',
    title: 'YOU HAVE BEEN\nSELECTED',
    hero: 'rank-e',
    frameLabel: '// PROTOCOL',
    bullets: [
      'Complete daily objectives across 5 stats.',
      'Earn XP. Level up. Climb the rank ladder.',
      'Failure to comply has no penalty — only inertia.',
    ],
    button: 'BEGIN ASCENT →',
  },
  {
    channel: '‹ PROTOCOL · 02 ›',
    title: 'HOW IT\nWORKS',
    hero: 'stat-row',
    frameLabel: '// OBJECTIVES',
    bullets: [
      'Each section is one task. Tap it. Finish it.',
      'Daily ring fills as you log progress.',
      'Protocol resets at midnight. Show up tomorrow.',
    ],
    button: 'CONTINUE',
  },
  {
    channel: '‹ INITIATE ›',
    title: 'START\nNOW',
    hero: 'system-glyph',
    frameLabel: '// FIRST DIRECTIVE',
    bullets: [
      'Open SYSTEM.',
      'Pick any section and complete it.',
      "Don't skip the day.",
    ],
    button: 'ENTER SYSTEM →',
  },
];

const STAT_HUES: Array<{ k: string; color: string }> = [
  { k: 'STR', color: 'var(--color-stat-str)' },
  { k: 'AGI', color: 'var(--color-stat-agi)' },
  { k: 'VIT', color: 'var(--color-stat-vit)' },
  { k: 'INT', color: 'var(--color-stat-int)' },
  { k: 'PER', color: 'var(--color-stat-per)' },
];

export default function GuidePage() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const current = STEPS[step];

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      await updateSettings({ hasOnboarded: true });
      localStorage.setItem('onboardingComplete', 'true');
      router.push('/');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col px-6 py-10"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(96,165,250,0.08) 0%, transparent 60%), var(--color-bg)',
      }}
    >
      {/* Step indicator */}
      <div className="flex gap-2 justify-center mb-10">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="h-0.5 rounded-full transition-all duration-300"
            style={{
              width: i === step ? 24 : 8,
              background: i === step ? 'var(--color-glow-bright)' : 'var(--color-border)',
              boxShadow: i === step ? '0 0 6px rgba(96,165,250,0.5)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Channel label */}
      <div className="text-center mb-3">
        <p
          className="font-mono-hud text-[10px] tracking-[0.32em]"
          style={{ color: 'var(--color-glow-bright)' }}
        >
          {current.channel}
        </p>
      </div>

      {/* Title */}
      <h1
        className="text-center font-display font-bold leading-tight mb-8 glow-text"
        style={{
          fontSize: 32,
          color: 'var(--color-glow-bright)',
          whiteSpace: 'pre-line',
        }}
      >
        {current.title}
      </h1>

      {/* Hero */}
      <div className="grid place-items-center my-2 mb-8">
        {current.hero === 'rank-e' && (
          <>
            <div
              className="grid place-items-center"
              style={{
                width: 140, height: 140,
                border: '1px solid var(--color-glow-bright)',
                background: 'radial-gradient(circle, rgba(59,130,246,0.25), transparent 70%)',
                boxShadow: '0 0 32px rgba(59,130,246,0.4), inset 0 0 32px rgba(59,130,246,0.2)',
                clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
              }}
            >
              <span
                className="font-display font-bold leading-none"
                style={{
                  fontSize: 64,
                  color: 'var(--color-glow-bright)',
                  textShadow: '0 0 18px rgba(96,165,250,0.8)',
                }}
              >
                E
              </span>
            </div>
            <p
              className="font-mono-hud text-[10px] tracking-[0.18em] uppercase mt-3"
              style={{ color: 'var(--color-glow-bright)' }}
            >
              Starting Rank
            </p>
          </>
        )}

        {current.hero === 'stat-row' && (
          <div className="flex gap-1.5">
            {STAT_HUES.map(s => (
              <div
                key={s.k}
                className="cut-tile grid place-items-center font-mono-hud font-bold"
                style={{
                  width: 44, height: 44,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: s.color,
                  background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${s.color} 50%, transparent)`,
                  boxShadow: `0 0 8px color-mix(in srgb, ${s.color} 30%, transparent)`,
                }}
              >
                {s.k}
              </div>
            ))}
          </div>
        )}

        {current.hero === 'system-glyph' && (
          <>
            <div
              className="cut-tile grid place-items-center"
              style={{
                width: 100, height: 100,
                border: '1px solid var(--color-glow-bright)',
                background: 'radial-gradient(circle, rgba(96,165,250,0.20), transparent 70%)',
                boxShadow: '0 0 22px rgba(96,165,250,0.4), inset 0 0 22px rgba(96,165,250,0.15)',
              }}
            >
              <span
                className="font-display font-bold leading-none"
                style={{
                  fontSize: 56,
                  color: 'var(--color-glow-bright)',
                  textShadow: '0 0 14px rgba(96,165,250,0.8)',
                }}
              >
                ◈
              </span>
            </div>
            <p
              className="font-mono-hud text-[10px] tracking-[0.18em] uppercase mt-3"
              style={{ color: 'var(--color-glow-bright)' }}
            >
              Awaiting Input
            </p>
          </>
        )}
      </div>

      {/* Protocol frame */}
      <div className="frame-bracketed mb-6">
        <div className="frame-cut p-4">
          <div
            className="font-mono-hud text-[10px] font-semibold tracking-[0.16em] uppercase mb-2.5"
            style={{ color: 'var(--color-glow-bright)' }}
          >
            {current.frameLabel}
          </div>
          <div className="space-y-1.5 text-text-dim text-xs leading-relaxed">
            {current.bullets.map((b, i) => (
              <p key={i}>
                <span className="mr-2" style={{ color: 'var(--color-glow-bright)' }}>▸</span>
                {b}
              </p>
            ))}
          </div>
        </div>
        <span className="frame-bracket-bottom" aria-hidden />
      </div>

      <div className="flex-1" />

      {/* Button */}
      <button
        onClick={handleNext}
        className="cut-tile w-full py-3.5 font-display font-bold text-sm tracking-[0.18em] transition-all hover:brightness-125"
        style={{
          background: 'rgba(96,165,250,0.15)',
          border: '1px solid var(--color-glow-bright)',
          color: 'var(--color-glow-bright)',
          boxShadow: '0 0 12px rgba(96,165,250,0.3)',
        }}
      >
        {current.button}
      </button>
    </div>
  );
}
