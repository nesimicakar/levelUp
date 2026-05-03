'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSettings } from '@/lib/db';

// ── Step 1 & 2: message cards (existing transmission style) ─────────────────

type MessageStep = {
  channel: string;
  title: string;
  hero: 'rank-e' | 'stat-row';
  frameLabel: string;
  bullets: string[];
  button: string;
};

const MESSAGE_STEPS: MessageStep[] = [
  {
    channel: '‹ TRANSMISSION ›',
    title: 'HOW IT\nWORKS',
    hero: 'stat-row',
    frameLabel: '// OBJECTIVES',
    bullets: [
      'Daily protocol across 5 stats. Earn XP, climb ranks.',
      'Each section is one task. Tap it. Finish it.',
      'Protocol resets at midnight. Show up tomorrow.',
    ],
    button: 'CONTINUE',
  },
];

const STAT_HUES: Array<{ k: string; color: string }> = [
  { k: 'STR', color: 'var(--color-stat-str)' },
  { k: 'AGI', color: 'var(--color-stat-agi)' },
  { k: 'VIT', color: 'var(--color-stat-vit)' },
  { k: 'INT', color: 'var(--color-stat-int)' },
  { k: 'PER', color: 'var(--color-stat-per)' },
];

// ── Step 3: preset selector ─────────────────────────────────────────────────

type PresetTargets = {
  strSessionsPerWeek: number;
  agiMinMinutes: number;
  proteinGoalGrams: number;
  dailyReadingMinutesTarget: number;
  courseUnitsPerDay: number;
  lessonsPerDay: number;
};

type Preset = {
  id: 'fitness' | 'career' | 'balanced' | 'custom';
  name: string;
  tag: string;
  blurb: string;
  tint: string;
  glow: string;
  soft: string;
  border: string;
  icon: React.ReactNode;
  targets: PresetTargets | null;
};

function FitnessIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c2 4-2 5-2 9a4 4 0 1 0 8 0c0-3-2-5-3-7-1 2-2 2-3-2zM8 14a3 3 0 1 0 6 0c0-1-1-2-2-3-1 2-4 2-4 3z" />
    </svg>
  );
}
function CareerIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM18 17H6" />
    </svg>
  );
}
function BalancedIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16V13" />
    </svg>
  );
}
function CustomIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

const PRESETS: Preset[] = [
  {
    id: 'fitness',
    name: 'FITNESS FOCUS',
    tag: '// PRESET_01',
    blurb: 'Heavy on movement. High protein, longer cardio, lighter learning.',
    tint: 'var(--color-stat-str)',
    glow: 'rgba(239,68,68,0.5)',
    soft: 'rgba(239,68,68,0.06)',
    border: 'rgba(239,68,68,0.35)',
    icon: <FitnessIcon />,
    targets: { strSessionsPerWeek: 4, agiMinMinutes: 30, proteinGoalGrams: 160, dailyReadingMinutesTarget: 5, courseUnitsPerDay: 1, lessonsPerDay: 1 },
  },
  {
    id: 'career',
    name: 'CAREER SPRINT',
    tag: '// PRESET_02',
    blurb: 'Maximum learning. Daily course units, deep reading, lean fitness.',
    tint: 'var(--color-stat-int)',
    glow: 'rgba(96,165,250,0.5)',
    soft: 'rgba(96,165,250,0.06)',
    border: 'rgba(96,165,250,0.35)',
    icon: <CareerIcon />,
    targets: { strSessionsPerWeek: 3, agiMinMinutes: 10, proteinGoalGrams: 100, dailyReadingMinutesTarget: 30, courseUnitsPerDay: 3, lessonsPerDay: 2 },
  },
  {
    id: 'balanced',
    name: 'BALANCED',
    tag: '// PRESET_03',
    blurb: 'Equal focus across all five domains of the protocol.',
    tint: 'var(--color-stat-agi)',
    glow: 'rgba(34,197,94,0.5)',
    soft: 'rgba(34,197,94,0.06)',
    border: 'rgba(34,197,94,0.35)',
    icon: <BalancedIcon />,
    targets: { strSessionsPerWeek: 3, agiMinMinutes: 15, proteinGoalGrams: 130, dailyReadingMinutesTarget: 15, courseUnitsPerDay: 2, lessonsPerDay: 1 },
  },
  {
    id: 'custom',
    name: 'CUSTOM',
    tag: '// PRESET_04',
    blurb: 'Skip the presets. Configure your own targets in settings.',
    tint: 'var(--color-text-dim)',
    glow: 'rgba(155,179,208,0.4)',
    soft: 'rgba(155,179,208,0.04)',
    border: 'rgba(155,179,208,0.30)',
    icon: <CustomIcon />,
    targets: null,
  },
];

const STAT_TINTS: Record<string, string> = {
  STR: 'var(--color-stat-str)',
  AGI: 'var(--color-stat-agi)',
  VIT: 'var(--color-stat-vit)',
  INT: 'var(--color-stat-int)',
  PER: 'var(--color-stat-per)',
};

function buildStatCells(t: PresetTargets) {
  return [
    { stat: 'STR', value: `${t.strSessionsPerWeek}×/wk` },
    { stat: 'AGI', value: `${t.agiMinMinutes}m` },
    { stat: 'VIT', value: `${t.proteinGoalGrams}g` },
    { stat: 'INT', value: `${t.courseUnitsPerDay}/d` },
    { stat: 'PER', value: `${t.dailyReadingMinutesTarget}m` },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = MESSAGE_STEPS.length + 1; // +1 for preset selector

export default function GuidePage() {
  const [step, setStep] = useState(0);
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(2); // BALANCED default
  const router = useRouter();

  const isPresetStep = step === MESSAGE_STEPS.length; // last step
  const messageStep = !isPresetStep ? MESSAGE_STEPS[step] : null;
  const sel = PRESETS[selectedPresetIdx];

  const handleNext = async () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
      return;
    }
    // Last step — apply preset
    if (sel.targets) {
      await updateSettings({
        strSessionsPerWeek: sel.targets.strSessionsPerWeek,
        agiMinMinutes: sel.targets.agiMinMinutes,
        proteinGoalGrams: sel.targets.proteinGoalGrams,
        dailyReadingMinutesTarget: sel.targets.dailyReadingMinutesTarget,
        courseUnitsPerDay: sel.targets.courseUnitsPerDay,
        lessonsPerDay: sel.targets.lessonsPerDay,
        hasOnboarded: true,
      });
      localStorage.setItem('onboardingComplete', 'true');
      router.push('/');
    } else {
      // Custom: mark onboarded, send to settings
      await updateSettings({ hasOnboarded: true });
      localStorage.setItem('onboardingComplete', 'true');
      router.push('/settings');
    }
  };

  return (
    <div
      className="min-h-svh flex flex-col px-6 pt-10"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(96,165,250,0.08) 0%, transparent 60%), var(--color-bg)',
        paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* Step indicator */}
      <div className="flex gap-2 justify-center mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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

      {isPresetStep ? (
        // ── Preset selector ───────────────────────────────────────────
        <>
          <div className="text-center mb-2">
            <p
              className="font-mono-hud text-[10px] tracking-[0.32em]"
              style={{ color: 'var(--color-glow-bright)' }}
            >
              ‹ INITIALIZATION ›
            </p>
          </div>
          <h1
            className="text-center font-display font-bold leading-tight mb-6 glow-text"
            style={{ fontSize: 30, color: 'var(--color-glow-bright)' }}
          >
            SELECT PROTOCOL
          </h1>

          {/* Hero panel */}
          <div
            className="cut-tile p-4 mb-5"
            style={{
              background: sel.soft,
              border: `1px solid ${sel.border}`,
              boxShadow: `0 0 24px ${sel.glow.replace('0.5', '0.18').replace('0.4', '0.16')}`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="font-mono-hud text-[10px] tracking-[0.18em] font-semibold"
                style={{ color: sel.tint, textShadow: `0 0 6px ${sel.glow}` }}
              >
                {sel.tag}
              </span>
              <span
                className="font-mono-hud text-[9px] tracking-[0.18em] flex items-center gap-1.5"
                style={{ color: sel.tint }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: sel.tint, boxShadow: `0 0 4px ${sel.glow}` }}
                />
                ACTIVE
              </span>
            </div>

            {/* Hex icon */}
            <div className="grid place-items-center">
              <div
                className="grid place-items-center"
                style={{
                  width: 72, height: 72,
                  background: 'var(--color-bg)',
                  border: `1px solid ${sel.tint}`,
                  boxShadow: `0 0 12px ${sel.glow}, inset 0 0 8px ${sel.glow.replace('0.5', '0.2').replace('0.4', '0.16')}`,
                  clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                  color: sel.tint,
                  filter: `drop-shadow(0 0 4px ${sel.glow})`,
                }}
              >
                {sel.icon}
              </div>
            </div>

            {/* Name + blurb */}
            <div className="text-center mt-3">
              <div
                className="font-display font-bold text-text"
                style={{ fontSize: 18, letterSpacing: '0.06em' }}
              >
                {sel.name}
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed mt-1.5 px-2">
                {sel.blurb}
              </p>
            </div>

            {/* Targets row */}
            {sel.targets && (
              <div className="flex gap-1 mt-3.5">
                {buildStatCells(sel.targets).map(cell => (
                  <div
                    key={cell.stat}
                    className="flex-1 text-center py-1.5 px-1"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div
                      className="font-mono-hud text-[9px] font-bold tracking-[0.14em]"
                      style={{ color: STAT_TINTS[cell.stat] }}
                    >
                      {cell.stat}
                    </div>
                    <div className="font-mono-hud text-[11px] font-bold text-text-dim mt-0.5">
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other presets (chips) */}
          <div className="font-mono-hud text-[9px] tracking-[0.18em] uppercase text-text-muted mb-2">
            // Other Presets
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {PRESETS.map((p, i) => {
              if (i === selectedPresetIdx) return null;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPresetIdx(i)}
                  className="cut-tile flex items-center gap-2 transition-colors hover:brightness-125"
                  style={{
                    flex: '1 1 calc(50% - 4px)',
                    minWidth: 0,
                    padding: '8px 10px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderLeft: `3px solid ${p.tint}`,
                  }}
                >
                  <span
                    className="grid place-items-center flex-shrink-0"
                    style={{ width: 14, height: 14, color: p.tint }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      {p.id === 'fitness' && <path d="M12 3c2 4-2 5-2 9a4 4 0 1 0 8 0c0-3-2-5-3-7-1 2-2 2-3-2zM8 14a3 3 0 1 0 6 0c0-1-1-2-2-3-1 2-4 2-4 3z" />}
                      {p.id === 'career' && <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM18 17H6" />}
                      {p.id === 'balanced' && <path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16V13" />}
                      {p.id === 'custom' && <><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>}
                    </svg>
                  </span>
                  <span
                    className="font-display font-semibold text-text truncate"
                    style={{ fontSize: 11, letterSpacing: '0.04em' }}
                  >
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* CTA */}
          <button
            onClick={handleNext}
            className="cut-tile w-full py-3.5 font-display font-bold text-sm tracking-[0.20em] transition-all hover:brightness-125"
            style={{
              background: 'rgba(96,165,250,0.10)',
              border: '1px solid var(--color-glow-bright)',
              color: 'var(--color-glow-bright)',
              boxShadow: '0 0 12px rgba(96,165,250,0.3)',
            }}
          >
            BEGIN ASCENT →
          </button>
          <p className="text-[9px] text-text-dim text-center mt-2 tracking-[0.12em] uppercase">
            All presets can be changed later in settings
          </p>
        </>
      ) : messageStep ? (
        // ── Message step ──────────────────────────────────────────────
        <>
          <div className="text-center mb-3">
            <p
              className="font-mono-hud text-[10px] tracking-[0.32em]"
              style={{ color: 'var(--color-glow-bright)' }}
            >
              {messageStep.channel}
            </p>
          </div>

          <h1
            className="text-center font-display font-bold leading-tight mb-8 glow-text"
            style={{
              fontSize: 32,
              color: 'var(--color-glow-bright)',
              whiteSpace: 'pre-line',
            }}
          >
            {messageStep.title}
          </h1>

          {/* Hero */}
          <div className="grid place-items-center my-2 mb-8">
            {messageStep.hero === 'rank-e' && (
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

            {messageStep.hero === 'stat-row' && (
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
          </div>

          {/* Protocol frame */}
          <div className="frame-bracketed mb-6">
            <div className="frame-cut p-4">
              <div
                className="font-mono-hud text-[10px] font-semibold tracking-[0.16em] uppercase mb-2.5"
                style={{ color: 'var(--color-glow-bright)' }}
              >
                {messageStep.frameLabel}
              </div>
              <div className="space-y-1.5 text-text-dim text-xs leading-relaxed">
                {messageStep.bullets.map((b, i) => (
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
            {messageStep.button}
          </button>
        </>
      ) : null}
    </div>
  );
}
