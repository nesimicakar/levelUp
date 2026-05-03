'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getSettings } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { computeLevel, computeVitXP } from '@/lib/logic/levels';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import { LogDateToggle } from '@/components/LogDateToggle';
import type { VitLog, StatLevel, UserSettings } from '@/types';

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function VitPage() {
  const router = useRouter();
  const { today, yesterday } = getLoggableDates();
  const [logDate, setLogDate] = useState(today);

  const [todayLog, setTodayLog] = useState<VitLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sleepHours, setSleepHours] = useState(0);
  const [proteinMet, setProteinMet] = useState(false);
  const [postureMet, setPostureMet] = useState(false);
  const [last7, setLast7] = useState<VitLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const existing = await db.vitLogs.where('date').equals(logDate).first();
    if (existing) {
      setTodayLog(existing);
      setSleepHours(existing.sleepHours);
      setProteinMet(existing.proteinGoalMet);
      setPostureMet(existing.postureMobilityMet ?? false);
    } else {
      setTodayLog(null);
      setSleepHours(0);
      setProteinMet(false);
      setPostureMet(false);
    }

    const all = await db.vitLogs.toArray();
    const completedDays = all.filter(l => l.completed).length;
    setLevel(computeLevel(computeVitXP(completedDays)));

    const sevenAgo = addDays(logDate, -6); // inclusive 7-day window ending at logDate
    setLast7(all.filter(l => l.date >= sevenAgo && l.date <= logDate));
    setLoaded(true);
  }, [logDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Smart default: during grace window, prefer yesterday if today has no log
  useEffect(() => {
    if (!yesterday) return;
    Promise.all([
      db.vitLogs.where('date').equals(today).first(),
      db.vitLogs.where('date').equals(yesterday).first(),
    ]).then(([todayEntry, yesterdayEntry]) => {
      if (!todayEntry && yesterdayEntry) setLogDate(yesterday);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const completed = sleepHours >= 7 && proteinMet && postureMet;
    if (todayLog?.id) {
      await db.vitLogs.update(todayLog.id, {
        sleepHours,
        proteinGoalMet: proteinMet,
        postureMobilityMet: postureMet,
        completed,
      });
    } else {
      const log: VitLog = {
        date: logDate,
        sleepHours,
        proteinGoalMet: proteinMet,
        postureMobilityMet: postureMet,
        completed,
        createdAt: Date.now(),
      };
      await db.vitLogs.add(log);
    }
    await loadData();
  };

  const adjustSleep = (delta: number) => {
    setSleepHours(s => Math.max(0, Math.min(24, +(s + delta).toFixed(1))));
  };

  if (!loaded || !settings) return null;

  const sleepMet = sleepHours >= 7;
  const checkCount = [sleepMet, proteinMet, postureMet].filter(Boolean).length;
  const allMet = checkCount === 3;

  // Week rolling
  const sleepAvg = last7.length > 0
    ? (last7.reduce((s, l) => s + l.sleepHours, 0) / last7.length)
    : 0;
  const proteinHits = last7.filter(l => l.proteinGoalMet).length;
  const mobilityHits = last7.filter(l => l.postureMobilityMet).length;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
        {/* Diegetic header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.back()} className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0" aria-label="Back">←</button>
            <div className="min-w-0">
              <h1
                className="font-display text-xl font-bold leading-none"
                style={{ color: 'var(--color-stat-vit)', textShadow: '0 0 10px rgba(234,179,8,0.5)' }}
              >
                VIT // VITALITY
              </h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Domain of Recovery</p>
            </div>
          </div>
          <div
            className="font-display font-bold text-3xl flex-shrink-0 leading-none"
            style={{ color: 'var(--color-stat-vit)', textShadow: '0 0 10px rgba(234,179,8,0.5)' }}
          >
            {level.level}
          </div>
        </div>

        <LogDateToggle value={logDate} today={today} yesterday={yesterday} onChange={setLogDate} />

        {/* Level / XP */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">
                LEVEL {level.level} → {level.level + 1}
              </span>
              <span className="font-display font-bold text-sm" style={{ color: 'var(--color-stat-vit)' }}>
                {level.currentXP} / {level.xpToNext} XP
              </span>
            </div>
            <div className="hud-bar hud-bar--vit mt-2">
              <div className="hud-bar__fill" style={{ width: `${level.progressPct}%` }} />
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Today section heading */}
        <div className="section-heading mt-2" style={{ color: 'var(--color-stat-vit)' }}>
          // TODAY · {checkCount} / 3 PROTOCOLS
        </div>

        {/* SLEEP */}
        <ProtocolFrame
          symbol="z"
          label="SLEEP"
          target="≥ 7.0 hours"
          met={sleepMet}
        >
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => adjustSleep(-0.5)}
              className="w-8 h-8 grid place-items-center rounded border border-border text-text-dim hover:text-text"
              aria-label="Decrease sleep"
            >
              −
            </button>
            <div className="font-display font-bold text-2xl min-w-[3.5ch] text-center leading-none"
              style={{ color: sleepMet ? 'var(--color-stat-vit)' : 'var(--color-text-dim)', textShadow: sleepMet ? '0 0 8px rgba(234,179,8,0.4)' : 'none' }}
            >
              {sleepHours.toFixed(1)}
              <span className="text-[10px] text-text-muted ml-0.5">H</span>
            </div>
            <button
              onClick={() => adjustSleep(0.5)}
              className="w-8 h-8 grid place-items-center rounded transition-colors"
              style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid var(--color-stat-vit)', color: 'var(--color-stat-vit)' }}
              aria-label="Increase sleep"
            >
              +
            </button>
          </div>
        </ProtocolFrame>

        {/* PROTEIN */}
        <button onClick={() => setProteinMet(v => !v)} className="block w-full text-left">
          <ProtocolFrame
            symbol="▲"
            label="PROTEIN"
            target={`${settings.proteinGoalGrams} g goal`}
            met={proteinMet}
            valueLabel={proteinMet ? 'MET' : 'PENDING'}
          />
        </button>

        {/* MOBILITY */}
        <button onClick={() => setPostureMet(v => !v)} className="block w-full text-left">
          <ProtocolFrame
            symbol="↻"
            label="MOBILITY"
            target="Posture & mobility block"
            met={postureMet}
            valueLabel={postureMet ? 'MET' : 'PENDING'}
          />
        </button>

        {/* Save */}
        <button
          onClick={save}
          className="w-full p-3 rounded-md font-display font-semibold tracking-wider transition-colors"
          style={{
            background: allMet ? 'rgba(234,179,8,0.15)' : 'rgba(234,179,8,0.06)',
            border: `1px solid ${allMet ? 'var(--color-stat-vit)' : 'rgba(234,179,8,0.4)'}`,
            color: 'var(--color-stat-vit)',
            boxShadow: allMet ? '0 0 12px rgba(234,179,8,0.3)' : 'none',
          }}
        >
          {todayLog ? 'UPDATE' : 'LOG TODAY'}
        </button>

        {/* Week rolling averages */}
        <div className="frame-cut p-3 space-y-1.5 text-sm mt-2">
          <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-1">Week · Rolling Avg</div>
          <div className="flex justify-between"><span className="text-text-muted">Sleep</span><span className="font-display" style={{ color: sleepAvg >= 7 ? 'var(--color-stat-agi)' : 'var(--color-text)' }}>{sleepAvg.toFixed(1)} h</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Protein hit-rate</span><span className="font-display text-text">{proteinHits} / {Math.max(last7.length, 1)} d</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Mobility hit-rate</span><span className="font-display" style={{ color: mobilityHits < 4 ? 'var(--color-stat-str)' : 'var(--color-text)' }}>{mobilityHits} / {Math.max(last7.length, 1)} d</span></div>
        </div>

        <CustomTasksSection skill="VIT" />
      </main>
    </div>
  );
}

interface ProtocolFrameProps {
  symbol: string;
  label: string;
  target: string;
  met: boolean;
  valueLabel?: string;
  children?: React.ReactNode;
}

function ProtocolFrame({ symbol, label, target, met, valueLabel, children }: ProtocolFrameProps) {
  return (
    <div className={`frame-bracketed ${met ? '' : 'opacity-90'}`}>
      <div className="frame-cut p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="cut-tile grid place-items-center font-display font-bold text-lg flex-shrink-0"
              style={{
                width: 40, height: 40,
                background: met ? 'rgba(234,179,8,0.18)' : 'var(--color-bg)',
                border: `1px solid ${met ? 'var(--color-stat-vit)' : 'var(--color-border)'}`,
                color: met ? 'var(--color-stat-vit)' : 'var(--color-text-muted)',
              }}
            >
              {symbol}
            </div>
            <div className="min-w-0">
              <div className="font-display font-semibold text-text">{label}</div>
              <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase">{target}</div>
            </div>
          </div>
          {valueLabel ? (
            <div className="font-display font-bold text-lg flex-shrink-0" style={{ color: met ? 'var(--color-stat-agi)' : 'var(--color-text-dim)' }}>
              {valueLabel}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
      <span className="frame-bracket-bottom" aria-hidden />
    </div>
  );
}
