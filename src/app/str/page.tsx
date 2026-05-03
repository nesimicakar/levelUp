'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getWeekStart, getSettings, updateSettings } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { getStrWeeklyStatus, canUseRestToken, getNextTemplate, getDefaultExercises, isSessionComplete, isSessionModeEntry, buildWeightPrefillMaps, applyWeightPrefill, applyExerciseNames, TEMPLATE_A, TEMPLATE_B } from '@/lib/logic/str';
import { computeLevel, computeStrXP } from '@/lib/logic/levels';
import { Toggle } from '@/components/Toggle';
import { LogDateToggle } from '@/components/LogDateToggle';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import { SystemMessage } from '@/components/SystemMessage';
import type { StrSession, StatLevel, UserSettings } from '@/types';

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

type DayState = 'done' | 'rest' | 'cur' | 'todo' | 'missed';

function computeWeekStrip(weekSessions: StrSession[], today: string, weekStart: string): { date: string; label: string; state: DayState }[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const date = d.toISOString().split('T')[0];
    const session = weekSessions.find(s => s.date === date);
    let state: DayState;
    if (session?.completed && !session.isRestDay) state = 'done';
    else if (session?.isRestDay) state = 'rest';
    else if (date === today) state = 'cur';
    else if (date < today) state = 'missed';
    else state = 'todo';
    return { date, label, state };
  });
}

const DAY_STATE_STYLE: Record<DayState, { bg: string; border: string; color: string; symbol: string }> = {
  done:   { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.5)',  color: 'var(--color-stat-agi)', symbol: '✓' },
  rest:   { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.5)',  color: 'var(--color-stat-vit)', symbol: 'z' },
  cur:    { bg: 'rgba(239,68,68,0.18)',  border: 'var(--color-stat-str)',color: 'var(--color-stat-str)', symbol: '▸' },
  todo:   { bg: 'transparent',           border: 'var(--color-border)',  color: 'var(--color-text-muted)', symbol: '·' },
  missed: { bg: 'transparent',           border: 'var(--color-border)',  color: 'var(--color-text-dim)',   symbol: '–' },
};

export default function StrPage() {
  const router = useRouter();
  const { today, yesterday } = getLoggableDates();
  const [logDate, setLogDate] = useState(today);

  const [weekSessions, setWeekSessions] = useState<StrSession[]>([]);
  const [todaySession, setTodaySession] = useState<StrSession | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [totalCompletedSessions, setTotalCompletedSessions] = useState(0);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showStrComplete, setShowStrComplete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const realToday = getToday();
    const weekStart = getWeekStart(realToday);
    const sessions = await db.strSessions
      .where('date')
      .between(weekStart, realToday + '￿')
      .toArray();
    setWeekSessions(sessions);

    const existing = sessions.find(s => s.date === logDate)
      ?? await db.strSessions.where('date').equals(logDate).first()
      ?? null;
    setTodaySession(existing ?? null);

    const allSessions = await db.strSessions.toArray();
    const totalCompleted = allSessions.filter(s => s.completed).length;
    const totalNonRest = allSessions.filter(s => s.completed && !s.isRestDay).length;
    setTotalCompletedSessions(totalNonRest);
    const xp = computeStrXP(totalCompleted, 0);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, [logDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Smart default: during grace window, prefer yesterday if today has no log
  useEffect(() => {
    if (!yesterday) return;
    Promise.all([
      db.strSessions.where('date').equals(today).first(),
      db.strSessions.where('date').equals(yesterday).first(),
    ]).then(([todayEntry, yesterdayEntry]) => {
      if (!todayEntry && yesterdayEntry) setLogDate(yesterday);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startSession = async () => {
    const template = getNextTemplate(totalCompletedSessions);
    const baseExercises = getDefaultExercises(template);

    const pastSessions = (await db.strSessions.toArray())
      .filter(s => s.completed && !s.isRestDay)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    const { byId, byName } = buildWeightPrefillMaps(pastSessions);
    const nameMap = settings?.exerciseNames ?? {};
    const exercises = applyWeightPrefill(applyExerciseNames(baseExercises, nameMap), byId, byName);

    const session: StrSession = {
      date: logDate,
      template,
      exercises,
      completed: false,
      isRestDay: false,
      createdAt: Date.now(),
    };
    const id = await db.strSessions.add(session);
    session.id = id;
    setTodaySession(session);
    setWeekSessions(prev => [...prev, session]);
  };

  const useRestToken = async () => {
    const session: StrSession = {
      date: logDate,
      template: 'A',
      exercises: [],
      completed: false,
      isRestDay: true,
      createdAt: Date.now(),
    };
    const id = await db.strSessions.add(session);
    session.id = id;
    setTodaySession(session);
    setWeekSessions(prev => [...prev, session]);
  };

  const toggleSet = async (exerciseIdx: number, setIdx: number) => {
    if (!todaySession?.id) return;
    const updated = { ...todaySession };
    const exercises = updated.exercises.map((e, i) => {
      if (i !== exerciseIdx) return e;
      const sets = e.sets.map((s, j) => {
        if (j !== setIdx) return s;
        return { ...s, completed: !s.completed };
      });
      return { ...e, sets };
    });
    const completed = isSessionComplete(exercises);
    const wasCompleted = todaySession.completed;
    await db.strSessions.update(todaySession.id, { exercises, completed });
    setTodaySession({ ...updated, exercises, completed });
    if (completed && !wasCompleted) setShowStrComplete(true);
    if (completed) loadData();
  };

  const updateWeight = async (exerciseIdx: number, setIdx: number, weight: number) => {
    if (!todaySession?.id) return;
    const exercises = todaySession.exercises.map((e, i) => {
      if (i !== exerciseIdx) return e;
      const sets = e.sets.map((s, j) => {
        if (j !== setIdx) return s;
        return { ...s, weight };
      });
      return { ...e, sets };
    });
    await db.strSessions.update(todaySession.id, { exercises });
    setTodaySession({ ...todaySession, exercises });
  };

  const markSessionComplete = async () => {
    if (todaySession?.completed || todaySession?.isRestDay) return;
    if (todaySession?.id) {
      await db.strSessions.update(todaySession.id, { completed: true });
    } else {
      const template = getNextTemplate(totalCompletedSessions);
      await db.strSessions.add({
        date: logDate,
        template,
        exercises: [],
        completed: true,
        isRestDay: false,
        entryMode: 'session',
        createdAt: Date.now(),
      });
    }
    setShowStrComplete(true);
    await loadData();
  };

  const cancelSession = async () => {
    if (!todaySession?.id || todaySession.completed || todaySession.isRestDay) return;
    await db.strSessions.delete(todaySession.id);
    await loadData();
  };

  if (!loaded) return null;

  const strMode = settings?.strMode ?? 'workout';
  const weekly = getStrWeeklyStatus(weekSessions, settings?.strSessionsPerWeek ?? 3);
  const canRest = canUseRestToken(weekSessions, settings?.strSessionsPerWeek ?? 3);
  const nameMap = settings?.exerciseNames ?? {};
  const displayExercises = todaySession
    ? applyExerciseNames(todaySession.exercises, nameMap)
    : [];
  const weekStrip = computeWeekStrip(weekSessions, today, getWeekStart(today));

  return (
    <div>
      <SystemMessage
        title="SYSTEM MESSAGE"
        subtitle="STR SESSION LOGGED"
        variant="minor"
        visible={showStrComplete}
        onDismiss={() => setShowStrComplete(false)}
      />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
        {/* Diegetic header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
              aria-label="Back"
            >
              ←
            </button>
            <div className="min-w-0">
              <h1
                className="font-display text-xl font-bold leading-none"
                style={{ color: 'var(--color-stat-str)', textShadow: '0 0 10px rgba(239,68,68,0.5)' }}
              >
                STR // STRENGTH
              </h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Domain of Force</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSettings(v => !v)}
              className="w-8 h-8 grid place-items-center rounded transition-all"
              style={{
                color: showSettings ? 'var(--color-stat-str)' : 'var(--color-text-muted)',
                textShadow: showSettings ? '0 0 8px rgba(239,68,68,0.5)' : 'none',
              }}
              aria-label="STR settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
            <div
              className="font-display font-bold text-3xl leading-none"
              style={{ color: 'var(--color-stat-str)', textShadow: '0 0 10px rgba(239,68,68,0.5)' }}
            >
              {level.level}
            </div>
          </div>
        </div>

        {showSettings && (
          <div className="frame-bracketed">
            <div className="frame-cut p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div
                  className="text-[10px] font-display font-semibold tracking-[0.18em] uppercase"
                  style={{ color: 'var(--color-stat-str)' }}
                >
                  // STR · CONFIG
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-text-muted hover:text-text text-[10px] tracking-[0.14em] uppercase"
                >
                  close
                </button>
              </div>

              {/* Tracking mode */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-text-muted tracking-[0.14em] uppercase">Tracking Mode</p>
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-md"
                  style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)' }}
                >
                  <div className="min-w-0">
                    <span className="text-sm text-text">Mode</span>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {(settings?.strMode ?? 'workout') === 'workout' ? 'Sets & weights per exercise' : 'One-tap session complete'}
                    </p>
                  </div>
                  <select
                    value={settings?.strMode ?? 'workout'}
                    onChange={async e => {
                      const next = e.target.value as 'workout' | 'session';
                      await updateSettings({ strMode: next });
                      await loadData();
                    }}
                    className="rounded px-2 py-1 text-sm focus:outline-none"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      color: 'var(--color-stat-str)',
                    }}
                  >
                    <option value="workout">Workout</option>
                    <option value="session">Session</option>
                  </select>
                </div>
              </div>

              {/* Exercise names */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-text-muted tracking-[0.14em] uppercase">
                  Exercise Names
                  <span className="ml-2 text-text-muted/70 normal-case tracking-normal">— applies next session</span>
                </p>
                {[{ label: 'Workout A', template: TEMPLATE_A }, { label: 'Workout B', template: TEMPLATE_B }].map(({ label, template }) => (
                  <div key={label} className="space-y-0.5">
                    <p
                      className="text-[10px] tracking-[0.18em] uppercase pt-1 font-display font-semibold"
                      style={{ color: 'var(--color-stat-str)' }}
                    >
                      // {label}
                    </p>
                    {template.map(t => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 last:border-b-0"
                        style={{ borderBottom: '1px solid rgba(239,68,68,0.18)' }}
                      >
                        <span className="text-xs text-text-muted w-28 shrink-0">{t.name}</span>
                        <input
                          type="text"
                          value={(settings?.exerciseNames ?? {})[t.id] ?? ''}
                          placeholder={t.name}
                          onChange={async e => {
                            if (!settings) return;
                            const names = { ...(settings.exerciseNames ?? {}) };
                            const v = e.target.value.trim();
                            if (v) names[t.id] = v; else delete names[t.id];
                            await updateSettings({ exerciseNames: names });
                            await loadData();
                          }}
                          className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none text-right px-1 py-0.5 transition-colors"
                          style={{
                            color: (settings?.exerciseNames ?? {})[t.id] ? 'var(--color-stat-str)' : 'var(--color-text-dim)',
                            borderBottom: '1px solid rgba(239,68,68,0.3)',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <span className="frame-bracket-bottom" aria-hidden />
          </div>
        )}

        <LogDateToggle value={logDate} today={today} yesterday={yesterday} onChange={setLogDate} />

        {/* Level / XP frame */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">
                LEVEL {level.level} → {level.level + 1}
              </span>
              <span className="font-display font-bold text-sm" style={{ color: 'var(--color-stat-str)' }}>
                {level.currentXP} / {level.xpToNext} XP
              </span>
            </div>
            <div className="hud-bar hud-bar--str mt-2">
              <div className="hud-bar__fill" style={{ width: `${level.progressPct}%` }} />
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Weekly directive frame */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-2">Weekly Directive</div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="font-display font-bold text-3xl leading-none" style={{ color: 'var(--color-stat-str)' }}>
                  {weekly.sessionsCompleted}
                  <span className="text-text-muted text-base font-normal"> / {weekly.sessionsRequired}</span>
                </div>
                <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Sessions</div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-3xl leading-none" style={{ color: 'var(--color-stat-vit)' }}>
                  {weekly.restTokensUsed}
                  <span className="text-text-muted text-base font-normal"> / {weekly.restTokensTotal}</span>
                </div>
                <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Rest Tokens</div>
              </div>
            </div>
            <div className="flex gap-1 mt-3">
              {weekStrip.map((d, i) => {
                const s = DAY_STATE_STYLE[d.state];
                return (
                  <div
                    key={i}
                    className="cut-tile flex-1 py-1.5 text-center"
                    style={{ background: s.bg, border: `1px solid ${s.border}` }}
                  >
                    <div className="text-[9px] tracking-[0.16em] text-text-muted">{d.label}</div>
                    <div className="font-display font-bold text-sm leading-tight" style={{ color: s.color }}>
                      {s.symbol}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Session for selected date */}
        {todaySession?.isRestDay ? (
          <div className="frame-cut p-6 text-center">
            <p className="text-text-muted text-sm tracking-wider">REST DAY</p>
            <p className="text-text-dim text-xs mt-1">Recovery is part of the protocol</p>
          </div>
        ) : todaySession && isSessionModeEntry(todaySession) ? (
          <div className="frame-cut p-6 text-center">
            <p className="text-success text-sm font-medium tracking-wider animate-pulse-glow">STRENGTH SESSION COMPLETE</p>
            <p className="text-text-muted text-xs mt-1">Completed using Session Completion mode</p>
          </div>
        ) : strMode === 'session' ? (
          <div className="space-y-3">
            <div className="frame-cut p-4 text-center">
              <p className="text-text-muted text-sm mb-3">Did you complete today&apos;s strength session?</p>
              <button
                onClick={markSessionComplete}
                className="w-full p-3 rounded-md font-display font-semibold tracking-wider transition-colors"
                style={{
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.45)',
                  color: 'var(--color-stat-str)',
                }}
              >
                MARK STR COMPLETE
              </button>
            </div>
            {canRest && (
              <button
                onClick={useRestToken}
                className="w-full p-3 rounded-md bg-surface border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
              >
                USE REST TOKEN ({weekly.restTokensTotal - weekly.restTokensUsed} REMAINING)
              </button>
            )}
          </div>
        ) : !todaySession ? (
          <div className="space-y-3">
            <button
              onClick={startSession}
              className="w-full p-3 rounded-md font-display font-semibold tracking-wider transition-colors"
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.45)',
                color: 'var(--color-stat-str)',
              }}
            >
              START SESSION ({getNextTemplate(totalCompletedSessions)}) →
            </button>
            {canRest && (
              <button
                onClick={useRestToken}
                className="w-full p-3 rounded-md bg-surface border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
              >
                USE REST TOKEN ({weekly.restTokensTotal - weekly.restTokensUsed} REMAINING)
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="section-heading" style={{ color: 'var(--color-stat-str)' }}>
                // WORKOUT {todaySession.template} · {todaySession.completed ? 'COMPLETE' : 'ACTIVE'}
              </span>
              {todaySession.completed && (
                <span className="text-success text-[10px] font-medium tracking-wider animate-pulse-glow">
                  ✓
                </span>
              )}
            </div>
            {displayExercises.map((exercise, eIdx) => {
              const completedSets = exercise.sets.filter(s => s.completed).length;
              const total = exercise.sets.length;
              const allDone = completedSets === total;
              const noWeight = exercise.noWeight ?? (exercise.name === 'Core' || exercise.name === 'Push-Ups' || exercise.name === 'Push-ups (100 total)');
              // First idle set is "active" — guides the user through the workout
              const activeIdx = exercise.sets.findIndex(s => !s.completed);
              return (
                <div key={eIdx} className="frame-cut p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display font-semibold text-text text-sm">{exercise.name}</h4>
                    <span
                      className="font-mono-hud text-[10px] tracking-[0.14em]"
                      style={{ color: allDone ? 'var(--color-stat-agi)' : 'var(--color-text-muted)' }}
                    >
                      {completedSets}/{total}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {exercise.sets.map((set, sIdx) => {
                      const state: 'idle' | 'active' | 'done' =
                        set.completed ? 'done' : (sIdx === activeIdx ? 'active' : 'idle');
                      const rowStyle = (() => {
                        if (state === 'done') return {
                          background: 'rgba(34,197,94,0.06)',
                          border: '1px solid rgba(34,197,94,0.3)',
                          boxShadow: 'none',
                        };
                        if (state === 'active') return {
                          background: 'rgba(239,68,68,0.10)',
                          border: '1px solid var(--color-stat-str)',
                          boxShadow: '0 0 8px rgba(239,68,68,0.20)',
                        };
                        return {
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          boxShadow: 'none',
                        };
                      })();
                      const setLabelColor =
                        state === 'done' ? 'var(--color-stat-agi)'
                          : state === 'active' ? 'var(--color-stat-str)'
                          : 'var(--color-text-muted)';
                      const valueColor =
                        state === 'done' ? 'var(--color-stat-agi)' : 'var(--color-text)';
                      const doneBtnStyle = (() => {
                        if (state === 'done') return {
                          background: 'var(--color-stat-agi)',
                          border: '1px solid var(--color-stat-agi)',
                          color: 'var(--color-bg)',
                          boxShadow: '0 0 6px rgba(34,197,94,0.4)',
                        };
                        if (state === 'active') return {
                          background: 'rgba(239,68,68,0.10)',
                          border: '1px solid var(--color-stat-str)',
                          color: 'var(--color-stat-str)',
                          boxShadow: 'none',
                        };
                        return {
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)',
                          boxShadow: 'none',
                        };
                      })();
                      const weight = set.weight ?? 0;

                      return (
                        <div
                          key={sIdx}
                          className="cut-tile grid items-stretch transition-all"
                          style={{
                            gridTemplateColumns: '44px 1fr 64px',
                            gap: 10,
                            padding: '8px 10px',
                            ...rowStyle,
                          }}
                        >
                          {/* Zone 1 · SET label */}
                          <div
                            className="grid place-items-center"
                            style={{ borderRight: '1px solid var(--color-border)' }}
                          >
                            <div className="font-mono-hud text-[10px] tracking-[0.14em] text-center leading-tight" style={{ color: setLabelColor }}>
                              SET<br />{set.setNumber}
                            </div>
                          </div>

                          {/* Zone 2 · Weight stepper (or empty for noWeight) */}
                          {noWeight ? (
                            <div className="grid place-items-center text-text-muted text-xs">—</div>
                          ) : (
                            <div className="grid items-center" style={{ gridTemplateColumns: '32px 1fr 32px' }}>
                              <button
                                onClick={() => updateWeight(eIdx, sIdx, Math.max(0, weight - 5))}
                                className="h-full grid place-items-center font-mono-hud text-base leading-none transition-colors hover:brightness-125"
                                style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
                                aria-label={`Decrease set ${set.setNumber} weight`}
                              >
                                −
                              </button>
                              <div className="grid place-items-center">
                                <div className="flex items-baseline gap-1">
                                  <span className="font-mono-hud font-bold text-base" style={{ color: valueColor }}>
                                    {weight}
                                  </span>
                                  <span className="font-mono-hud text-[9px] text-text-muted">lb</span>
                                </div>
                              </div>
                              <button
                                onClick={() => updateWeight(eIdx, sIdx, weight + 5)}
                                className="h-full grid place-items-center font-mono-hud text-base leading-none transition-colors hover:brightness-125"
                                style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
                                aria-label={`Increase set ${set.setNumber} weight`}
                              >
                                +
                              </button>
                            </div>
                          )}

                          {/* Zone 3 · DONE pill */}
                          <button
                            onClick={() => toggleSet(eIdx, sIdx)}
                            className="cut-tile grid place-items-center font-display font-bold text-[11px] tracking-[0.14em] transition-all"
                            style={{ ...doneBtnStyle, padding: '6px 4px' }}
                            aria-label={state === 'done' ? `Undo set ${set.setNumber}` : `Mark set ${set.setNumber} done`}
                          >
                            {state === 'done' ? '✓ DONE' : 'DONE'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {/* Toggle label fallback for accessibility — keeps "Set N" association */}
                  <div className="sr-only">
                    {exercise.sets.map((set, sIdx) => (
                      <Toggle
                        key={sIdx}
                        checked={set.completed}
                        onChange={() => toggleSet(eIdx, sIdx)}
                        label={`Set ${set.setNumber}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {!todaySession.completed && (
              <button
                onClick={cancelSession}
                className="w-full p-2 rounded-md bg-surface border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
              >
                CANCEL SESSION
              </button>
            )}
          </div>
        )}

        <CustomTasksSection skill="STR" />
      </main>
    </div>
  );
}
