'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSettings, updateSettings } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import { NumberInput } from '@/components/NumberInput';
import type { UserSettings } from '@/types';

export default function SettingsPage() {
  const [settings, setSettingsState] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setSettingsState(s);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const update = async (partial: Partial<UserSettings>) => {
    if (!settings) return;
    await updateSettings(partial);
    setSettingsState({ ...settings, ...partial });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return null;

  return (
    <div>
      <PageHeader title="SYSTEM CONFIG" subtitle="Settings & Targets" />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {saved && (
          <div className="text-center text-success text-xs tracking-wider animate-fade-in">
            CONFIGURATION SAVED
          </div>
        )}

        {/* Learning */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">INT // LEARNING</h3>
          <NumberInput
            value={settings.learningMinutesPerDay}
            onChange={v => update({ learningMinutesPerDay: v })}
            label="Minutes / day"
            min={5}
            max={120}
            step={5}
            unit="min"
          />
        </section>

        {/* Course */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">INT // REAL ESTATE COURSE</h3>
          <NumberInput
            value={settings.courseUnitsPerDay}
            onChange={v => update({ courseUnitsPerDay: v })}
            label="Units / day"
            min={1}
            max={20}
            step={1}
            unit="units"
          />
        </section>

        {/* StageAcademy */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">PER // STAGEACADEMY</h3>
          <NumberInput
            value={settings.lessonsPerDay}
            onChange={v => update({ lessonsPerDay: v })}
            label="Lessons / day"
            min={1}
            max={10}
            step={1}
            unit="lessons"
          />
        </section>

        {/* Spirituality */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">PER // SPIRITUALITY</h3>
          <NumberInput
            value={settings.quranPagesPerDay}
            onChange={v => update({ quranPagesPerDay: v })}
            label="Quran pages / day"
            min={1}
            max={20}
            step={1}
            unit="pg"
          />
        </section>

        {/* VIT */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">VIT // NUTRITION</h3>
          <NumberInput
            value={settings.proteinGoalGrams}
            onChange={v => update({ proteinGoalGrams: v })}
            label="Protein target"
            min={50}
            max={300}
            step={10}
            unit="g"
          />
        </section>

        {/* AGI */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">AGI // CARDIO</h3>
          <NumberInput
            value={settings.agiMinMinutes}
            onChange={v => update({ agiMinMinutes: v })}
            label="Minimum minutes"
            min={5}
            max={60}
            step={5}
            unit="min"
          />
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
            <span className="text-sm text-text">Activity type</span>
            <select
              value={settings.agiActivityType}
              onChange={e => update({ agiActivityType: e.target.value })}
              className="bg-surface-light border border-border rounded px-2 py-1 text-sm text-glow-bright focus:outline-none focus:border-glow"
            >
              <option value="Rowing">Rowing</option>
              <option value="Running">Running</option>
              <option value="Cycling">Cycling</option>
              <option value="Swimming">Swimming</option>
            </select>
          </div>
        </section>

        {/* STR increments */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">STR // PROGRESSION</h3>
          <NumberInput
            value={settings.strUpperIncrement}
            onChange={v => update({ strUpperIncrement: v })}
            label="Upper body increment"
            min={1}
            max={20}
            step={1}
            unit="lbs"
          />
          <NumberInput
            value={settings.strLowerIncrement}
            onChange={v => update({ strLowerIncrement: v })}
            label="Lower body increment"
            min={1}
            max={20}
            step={1}
            unit="lbs"
          />
        </section>
      </main>
    </div>
  );
}
