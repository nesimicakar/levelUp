'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getWeekStart, getSettings } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { getStrWeeklyStatus, canUseRestToken, getNextTemplate, getDefaultExercises, isSessionComplete, buildWeightPrefillMaps, applyWeightPrefill, applyExerciseNames } from '@/lib/logic/str';
import { computeLevel, computeStrXP } from '@/lib/logic/levels';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { Toggle } from '@/components/Toggle';
import { LogDateToggle } from '@/components/LogDateToggle';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import type { StrSession, ExerciseRecord, WorkoutTemplate, StatLevel, UserSettings } from '@/types';

export default function StrPage() {
  const { today, yesterday } = getLoggableDates();
  const [logDate, setLogDate] = useState(today);

  const [weekSessions, setWeekSessions] = useState<StrSession[]>([]);
  const [todaySession, setTodaySession] = useState<StrSession | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [totalCompletedSessions, setTotalCompletedSessions] = useState(0);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const realToday = getToday();
    const weekStart = getWeekStart(realToday);
    const sessions = await db.strSessions
      .where('date')
      .between(weekStart, realToday + '\uffff')
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

    // Prefill weights: prefer id-match (survives renames), fall back to name for old sessions
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
    await db.strSessions.update(todaySession.id, { exercises, completed });
    setTodaySession({ ...updated, exercises, completed });
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

  const cancelSession = async () => {
    if (!todaySession?.id || todaySession.completed || todaySession.isRestDay) return;
    await db.strSessions.delete(todaySession.id);
    await loadData();
  };

  if (!loaded) return null;

  const weekly = getStrWeeklyStatus(weekSessions);
  const canRest = canUseRestToken(weekSessions);
  const nameMap = settings?.exerciseNames ?? {};
  // Apply custom names for rendering — works for both new and in-progress sessions
  const displayExercises = todaySession
    ? applyExerciseNames(todaySession.exercises, nameMap)
    : [];

  return (
    <div>
      <PageHeader title="STR // STRENGTH" subtitle={`Level ${level.level}`} />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <LogDateToggle value={logDate} today={today} yesterday={yesterday} onChange={setLogDate} />

        {/* Level progress */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-dim">Level {level.level}</span>
            <span className="text-text-muted">{level.currentXP}/{level.xpToNext} XP</span>
          </div>
          <ProgressBar value={level.progressPct} />
        </div>

        {/* Weekly status */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <h3 className="text-sm font-medium text-text-dim mb-3">WEEKLY STATUS</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-2xl font-bold text-glow">{weekly.sessionsCompleted}</span>
              <span className="text-text-muted text-sm">/4 sessions</span>
            </div>
            <div>
              <span className="text-2xl font-bold text-warning">{weekly.restTokensUsed}</span>
              <span className="text-text-muted text-sm">/3 rest tokens</span>
            </div>
          </div>
          {todaySession?.completed && (
            <p className="text-text-muted text-xs mt-3">
              Next session: Workout {getNextTemplate(totalCompletedSessions)} (available tomorrow)
            </p>
          )}
        </div>

        {/* Session for selected date */}
        {!todaySession ? (
          <div className="space-y-3">
            <button
              onClick={startSession}
              className="w-full p-4 rounded-lg bg-glow/10 border border-glow/30 text-glow font-medium tracking-wider hover:bg-glow/20 transition-colors"
            >
              START SESSION ({getNextTemplate(totalCompletedSessions)})
            </button>
            {canRest && (
              <button
                onClick={useRestToken}
                className="w-full p-3 rounded-lg bg-surface border border-border text-text-muted text-sm hover:text-text transition-colors"
              >
                USE REST TOKEN ({3 - weekly.restTokensUsed} remaining)
              </button>
            )}
          </div>
        ) : todaySession.isRestDay ? (
          <div className="stat-card rounded-lg p-6 text-center glow-border">
            <p className="text-text-muted text-sm tracking-wider">REST DAY</p>
            <p className="text-text-dim text-xs mt-1">Recovery is part of the protocol</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-text-dim">
                WORKOUT {todaySession.template}
              </h3>
              {todaySession.completed && (
                <span className="text-success text-xs font-medium tracking-wider animate-pulse-glow px-2 py-1 rounded">
                  COMPLETE
                </span>
              )}
            </div>
            {displayExercises.map((exercise, eIdx) => (
              <div key={eIdx} className="stat-card rounded-lg p-3 glow-border">
                <h4 className="text-sm font-medium text-glow-bright mb-2">{exercise.name}</h4>
                <div className="space-y-2">
                  {exercise.sets.map((set, sIdx) => (
                    <div key={sIdx} className="flex items-center gap-2">
                      <Toggle
                        checked={set.completed}
                        onChange={() => toggleSet(eIdx, sIdx)}
                        label={`Set ${set.setNumber}`}
                      />
                      {!(exercise.noWeight ?? (exercise.name === 'Core' || exercise.name === 'Push-Ups' || exercise.name === 'Push-ups (100 total)')) && (
                        <input
                          type="number"
                          placeholder="lbs"
                          value={set.weight ?? ''}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) updateWeight(eIdx, sIdx, v);
                          }}
                          className="w-20 text-center text-sm bg-surface-light border border-border rounded p-2 text-glow-bright focus:outline-none focus:border-glow"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!todaySession.completed && (
              <button
                onClick={cancelSession}
                className="w-full p-3 rounded-lg bg-surface border border-border text-text-muted text-sm hover:text-text transition-colors"
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
