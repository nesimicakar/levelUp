'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getSettings } from '@/lib/db';
import { computeLevel, computeVitXP } from '@/lib/logic/levels';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { Toggle } from '@/components/Toggle';
import { NumberInput } from '@/components/NumberInput';
import type { VitLog, StatLevel, UserSettings } from '@/types';

export default function VitPage() {
  const [todayLog, setTodayLog] = useState<VitLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sleepHours, setSleepHours] = useState(0);
  const [proteinMet, setProteinMet] = useState(false);
  const [postureMet, setPostureMet] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const today = getToday();
    const s = await getSettings();
    setSettings(s);

    const existing = await db.vitLogs.where('date').equals(today).first();
    if (existing) {
      setTodayLog(existing);
      setSleepHours(existing.sleepHours);
      setProteinMet(existing.proteinGoalMet);
      setPostureMet(existing.postureMobilityMet ?? false);
    }

    const completedDays = (await db.vitLogs.toArray()).filter(l => l.completed).length;
    const xp = computeVitXP(completedDays);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const save = async () => {
    const today = getToday();
    const completed = sleepHours >= 7 && proteinMet && postureMet;

    if (todayLog?.id) {
      await db.vitLogs.update(todayLog.id, {
        sleepHours,
        proteinGoalMet: proteinMet,
        postureMobilityMet: postureMet,
        completed,
      });
      setTodayLog({ ...todayLog, sleepHours, proteinGoalMet: proteinMet, postureMobilityMet: postureMet, completed });
    } else {
      const log: VitLog = {
        date: today,
        sleepHours,
        proteinGoalMet: proteinMet,
        postureMobilityMet: postureMet,
        completed,
        createdAt: Date.now(),
      };
      const id = await db.vitLogs.add(log);
      log.id = id;
      setTodayLog(log);
    }
    await loadData();
  };

  if (!loaded || !settings) return null;

  const allMet = sleepHours >= 7 && proteinMet && postureMet;
  const checkCount = [sleepHours >= 7, proteinMet, postureMet].filter(Boolean).length;

  return (
    <div>
      <PageHeader title="VIT // VITALITY" subtitle={`Level ${level.level}`} />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Level progress */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-dim">Level {level.level}</span>
            <span className="text-text-muted">{level.currentXP}/{level.xpToNext} XP</span>
          </div>
          <ProgressBar value={level.progressPct} />
        </div>

        {/* Today's checklist */}
        <div className="stat-card rounded-lg p-4 glow-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-dim">TODAY&apos;S PROTOCOL</h3>
            <span className={`text-xs font-medium tracking-wider ${allMet ? 'text-success' : 'text-warning'}`}>
              {checkCount}/3
            </span>
          </div>

          <NumberInput
            value={sleepHours}
            onChange={setSleepHours}
            label="Sleep"
            min={0}
            max={24}
            step={0.5}
            unit="hrs"
          />
          <div className="text-xs text-text-muted -mt-2 ml-1">
            {sleepHours >= 7 ? '✓ Goal met (≥7h)' : `Need ${(7 - sleepHours).toFixed(1)}h more`}
          </div>

          <Toggle
            checked={proteinMet}
            onChange={setProteinMet}
            label={`Protein goal (${settings.proteinGoalGrams}g)`}
            sublabel="Did you hit your protein target?"
          />

          <Toggle
            checked={postureMet}
            onChange={setPostureMet}
            label="Posture & Mobility Block"
            sublabel="Did you complete your mobility work?"
          />

          <button
            onClick={save}
            className={`w-full p-3 rounded-lg font-medium tracking-wider transition-colors ${
              allMet
                ? 'bg-glow/10 border border-glow/30 text-glow hover:bg-glow/20'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            {todayLog ? 'UPDATE' : 'LOG TODAY'}
          </button>
        </div>
      </main>
    </div>
  );
}
