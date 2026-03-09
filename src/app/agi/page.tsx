'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { db, getToday, getSettings } from '@/lib/db';
import { computeLevel, computeAgiXP, getAgiDailyCap } from '@/lib/logic/levels';
import { computeAgiStreak } from '@/lib/logic/streaks';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { NumberInput } from '@/components/NumberInput';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import type { AgiLog, StatLevel, UserSettings } from '@/types';

export default function AgiPage() {
  const [todayLog, setTodayLog] = useState<AgiLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [streak, setStreak] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    const today = getToday();
    const s = await getSettings();
    setSettings(s);

    const existing = await db.agiLogs.where('date').equals(today).first();
    setTodayLog(existing ?? null);
    if (existing) setMinutes(existing.minutes);

    const allLogs = await db.agiLogs.toArray();
    const total = allLogs.reduce((sum, l) => sum + l.minutes, 0);
    setTotalMinutes(total);

    const currentStreak = await computeAgiStreak(today);
    setStreak(currentStreak);

    const agiCap = getAgiDailyCap(s.agiMinMinutes);
    const cappedTotal = allLogs.reduce((sum, l) => sum + Math.min(l.minutes, agiCap), 0);
    const xp = computeAgiXP(cappedTotal, currentStreak);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveLog = async () => {
    if (!settings) return;
    const today = getToday();
    const completed = minutes >= settings.agiMinMinutes;

    if (todayLog?.id) {
      await db.agiLogs.update(todayLog.id, { minutes, completed });
      setTodayLog({ ...todayLog, minutes, completed });
    } else {
      const log: AgiLog = {
        date: today,
        minutes,
        activityType: settings.agiActivityType,
        completed,
        createdAt: Date.now(),
      };
      const id = await db.agiLogs.add(log);
      log.id = id;
      setTodayLog(log);
    }
    await loadData();
  };

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const toggleTimer = () => {
    if (timerRunning) {
      setTimerRunning(false);
      setMinutes(Math.floor(timerSeconds / 60));
    } else {
      setTimerSeconds(0);
      setTimerRunning(true);
    }
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  if (!loaded || !settings) return null;

  const completed = todayLog?.completed ?? false;

  return (
    <div>
      <PageHeader title="AGI // AGILITY" subtitle={`Level ${level.level}`} />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Level progress */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-dim">Level {level.level}</span>
            <span className="text-text-muted">{level.currentXP}/{level.xpToNext} XP</span>
          </div>
          <ProgressBar value={level.progressPct} />
        </div>

        {/* Stats */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-text-muted text-xs">STREAK</p>
              <p className="text-2xl font-bold text-glow">{streak} <span className="text-sm text-text-muted">days</span></p>
            </div>
            <div>
              <p className="text-text-muted text-xs">TOTAL</p>
              <p className="text-2xl font-bold text-glow-bright">{totalMinutes} <span className="text-sm text-text-muted">min</span></p>
            </div>
          </div>
        </div>

        {/* Today's log */}
        <div className="stat-card rounded-lg p-4 glow-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-dim">TODAY&apos;S {settings.agiActivityType.toUpperCase()}</h3>
            {completed && (
              <span className="text-success text-xs font-medium tracking-wider">COMPLETE</span>
            )}
          </div>

          <NumberInput
            value={minutes}
            onChange={setMinutes}
            label="Minutes"
            min={0}
            max={300}
            step={1}
            unit="min"
          />

          <div className="text-xs text-text-muted">
            Target: {settings.agiMinMinutes} minutes minimum
          </div>

          {/* Stopwatch */}
          <div className="flex items-center justify-between">
            <span className="text-2xl font-mono text-glow tabular-nums">{formatTimer(timerSeconds)}</span>
            <button
              onClick={toggleTimer}
              className={`px-4 py-2 rounded-lg text-sm font-medium tracking-wider transition-colors ${
                timerRunning
                  ? 'bg-danger/10 border border-danger/30 text-danger'
                  : 'bg-glow/10 border border-glow/30 text-glow'
              }`}
            >
              {timerRunning ? 'STOP' : 'START'}
            </button>
          </div>

          <button
            onClick={saveLog}
            className={`w-full p-3 rounded-lg font-medium tracking-wider transition-colors ${
              minutes >= settings.agiMinMinutes
                ? 'bg-glow/10 border border-glow/30 text-glow hover:bg-glow/20'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            {todayLog ? 'UPDATE LOG' : 'LOG SESSION'}
          </button>
        </div>

        <CustomTasksSection skill="AGI" />
      </main>
    </div>
  );
}
