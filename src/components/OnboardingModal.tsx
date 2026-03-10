'use client';

import { updateSettings } from '@/lib/db';
import type { UserSettings } from '@/types';

interface Preset {
  id: string;
  name: string;
  description: string;
  icon: string;
  overrides: Partial<UserSettings>;
}

const PRESETS: Preset[] = [
  {
    id: 'fitness',
    name: 'Fitness Focus',
    description: 'Strength & cardio-first. Higher protein, shorter study blocks.',
    icon: '⚡',
    overrides: {
      proteinGoalGrams: 175,
      agiMinMinutes: 20,
      learningMinutesPerDay: 15,
      courseUnitsPerDay: 2,
      lessonsPerDay: 1,
      quranPagesPerDay: 0,
    },
  },
  {
    id: 'career',
    name: 'Career Sprint',
    description: 'Deep work sessions and accelerated course completion.',
    icon: '▲',
    overrides: {
      proteinGoalGrams: 130,
      agiMinMinutes: 10,
      learningMinutesPerDay: 45,
      courseUnitsPerDay: 8,
      lessonsPerDay: 3,
      quranPagesPerDay: 0,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Equal focus across all five domains of the protocol.',
    icon: '◈',
    overrides: {
      proteinGoalGrams: 150,
      agiMinMinutes: 15,
      learningMinutesPerDay: 30,
      courseUnitsPerDay: 4,
      lessonsPerDay: 2,
      quranPagesPerDay: 1,
    },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Skip presets and configure everything manually in Settings.',
    icon: '⚙',
    overrides: {},
  },
];

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const select = async (preset: Preset) => {
    await updateSettings({ ...preset.overrides, hasOnboarded: true });
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-bg z-50 flex flex-col overflow-y-auto">
      <div className="max-w-lg mx-auto w-full px-4 py-10 flex flex-col gap-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-widest glow-text">LEVEL UP</h1>
          <p className="text-text-muted text-sm tracking-wider uppercase">Select your protocol</p>
          <p className="text-text-dim text-xs mt-3 max-w-xs mx-auto">
            Choose a preset to configure your daily targets. You can adjust everything later in Settings.
          </p>
        </div>

        {/* Preset cards */}
        <div className="space-y-3">
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => select(preset)}
              className="w-full text-left p-4 rounded-lg border border-border bg-surface hover:border-glow/40 hover:bg-glow/5 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl text-glow mt-0.5">{preset.icon}</span>
                <div>
                  <p className="text-sm font-medium text-glow-bright tracking-wider group-hover:text-glow transition-colors">
                    {preset.name.toUpperCase()}
                  </p>
                  <p className="text-xs text-text-muted mt-1">{preset.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-text-dim">
          All presets can be changed at any time in Settings.
        </p>
      </div>
    </div>
  );
}
