'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getSettings, updateSettings, getCourseProgress, updateCourseProgress } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { computeLevel, computeIntXP, getIntDailyCap } from '@/lib/logic/levels';
import {
  loadIntCourses,
  saveIntCourses,
  getDailyUnitsForCourse,
  isIntCompleteFromCourses,
  applyDailyEdits,
  upsertCourse,
  removeCourse,
  genCourseId,
  legacyCourseProgressId,
  settingsKeyForLegacyTarget,
  totalCompletedUnitsAcrossCourses,
  LEGACY_RE_ID,
  LEGACY_SA_ID,
} from '@/lib/logic/intCourses';
import { LogDateToggle } from '@/components/LogDateToggle';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import type { IntLog, PerLog, StatLevel, UserSettings, IntCourse } from '@/types';

function formatAcquiredDate(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function projectETA(course: IntCourse): { eta: string; daysLeft: number } | null {
  const remaining = course.totalUnits - course.completedUnits;
  if (remaining <= 0 || course.dailyTargetUnits <= 0) return null;
  const daysLeft = Math.ceil(remaining / course.dailyTargetUnits);
  const d = new Date();
  d.setDate(d.getDate() + daysLeft);
  const eta = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { eta, daysLeft };
}

export default function IntPage() {
  const router = useRouter();
  const { today, yesterday } = getLoggableDates();
  const [logDate, setLogDate] = useState(today);

  const [todayLog, setTodayLog] = useState<IntLog | null>(null);
  const [todayPerLog, setTodayPerLog] = useState<PerLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [courses, setCourses] = useState<IntCourse[]>([]);
  const [unitsToday, setUnitsToday] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTotal, setNewTotal] = useState('');
  const [newDaily, setNewDaily] = useState('1');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editDaily, setEditDaily] = useState('');

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const c = await loadIntCourses();
    setCourses(c);

    const intLog = await db.intLogs.where('date').equals(logDate).first();
    setTodayLog(intLog ?? null);
    const perLog = await db.perLogs.where('date').equals(logDate).first();
    setTodayPerLog(perLog ?? null);

    const map: Record<string, number> = {};
    for (const course of c) {
      map[course.id] = getDailyUnitsForCourse(course, intLog ?? null, perLog ?? null);
    }
    setUnitsToday(map);

    const allLogs = await db.intLogs.toArray();
    const intCap = getIntDailyCap(s.learningMinutesPerDay);
    const cappedLegacyMinutes = allLogs.reduce((sum, l) => sum + Math.min(l.learningMinutes ?? 0, intCap), 0);
    const totalUnits = totalCompletedUnitsAcrossCourses(c);
    const xp = computeIntXP(cappedLegacyMinutes, totalUnits);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, [logDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!yesterday) return;
    Promise.all([
      db.intLogs.where('date').equals(today).first(),
      db.intLogs.where('date').equals(yesterday).first(),
    ]).then(([todayEntry, yesterdayEntry]) => {
      if (!todayEntry && yesterdayEntry) setLogDate(yesterday);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist a daily edit immediately (chip taps drive this — no separate save button).
  const persistUnits = useCallback(async (nextUnits: Record<string, number>) => {
    if (!settings) return;
    const prevUnits: Record<string, number> = {};
    for (const c of courses) {
      prevUnits[c.id] = getDailyUnitsForCourse(c, todayLog, todayPerLog);
    }
    const { courses: updatedCourses, unitsByCourse } = applyDailyEdits(courses, prevUnits, nextUnits);

    await saveIntCourses(updatedCourses);

    for (const c of updatedCourses) {
      const legacyId = legacyCourseProgressId(c);
      if (!legacyId) continue;
      const cp = await getCourseProgress(legacyId);
      const delta = c.completedUnits - cp.completedUnits;
      if (delta > 0) await updateCourseProgress(legacyId, delta);
    }

    const reUnits = unitsByCourse[LEGACY_RE_ID] ?? 0;
    const intCompleted = isIntCompleteFromCourses(updatedCourses, unitsByCourse);
    if (todayLog?.id) {
      await db.intLogs.update(todayLog.id, {
        unitsByCourse,
        courseUnitsCompleted: reUnits,
        completed: intCompleted,
      });
    } else {
      const newLog: IntLog = {
        date: logDate,
        pagesRead: 0,
        learningMinutes: 0,
        courseUnitsCompleted: reUnits,
        unitsByCourse,
        completed: intCompleted,
        createdAt: Date.now(),
      };
      await db.intLogs.add(newLog);
    }

    const saUnits = unitsByCourse[LEGACY_SA_ID] ?? 0;
    if (todayPerLog?.id) {
      const oldSa = todayPerLog.lessonsCompleted ?? 0;
      if (oldSa !== saUnits) {
        await db.perLogs.update(todayPerLog.id, { lessonsCompleted: saUnits });
      }
    } else if (saUnits > 0) {
      await db.perLogs.add({
        date: logDate,
        lessonsCompleted: saUnits,
        prayersCount: 0,
        quranPages: 0,
        completed: false,
        createdAt: Date.now(),
      });
    }

    await loadData();
  }, [settings, courses, todayLog, todayPerLog, logDate, loadData]);

  const bumpUnit = (courseId: string) => {
    const next = { ...unitsToday, [courseId]: (unitsToday[courseId] ?? 0) + 1 };
    setUnitsToday(next);
    persistUnits(next);
  };

  const decUnit = (courseId: string) => {
    const cur = unitsToday[courseId] ?? 0;
    if (cur <= 0) return;
    const next = { ...unitsToday, [courseId]: cur - 1 };
    setUnitsToday(next);
    persistUnits(next);
  };

  const addCourse = async () => {
    const name = newName.trim();
    const total = parseInt(newTotal, 10);
    const daily = parseInt(newDaily, 10);
    if (!name || !Number.isFinite(total) || total <= 0 || !Number.isFinite(daily) || daily <= 0) return;
    const c: IntCourse = {
      id: genCourseId(),
      name,
      totalUnits: total,
      completedUnits: 0,
      dailyTargetUnits: daily,
      status: 'active',
      createdAt: Date.now(),
    };
    const next = upsertCourse(courses, c);
    await saveIntCourses(next);
    setCourses(next);
    setUnitsToday(prev => ({ ...prev, [c.id]: 0 }));
    setNewName('');
    setNewTotal('');
    setNewDaily('1');
    setShowAdd(false);
  };

  const startEdit = (c: IntCourse) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditTotal(String(c.totalUnits));
    setEditDaily(String(c.dailyTargetUnits));
  };

  const saveEdit = async () => {
    if (!settings || !editingId) return;
    const c = courses.find(x => x.id === editingId);
    if (!c) return;
    const name = editName.trim() || c.name;
    const total = Math.max(1, parseInt(editTotal, 10) || c.totalUnits);
    const daily = Math.max(1, parseInt(editDaily, 10) || c.dailyTargetUnits);
    const updated: IntCourse = {
      ...c,
      name,
      totalUnits: total,
      dailyTargetUnits: daily,
      completedUnits: Math.min(c.completedUnits, total),
    };
    const next = upsertCourse(courses, updated);
    await saveIntCourses(next);
    setCourses(next);

    const settingsKey = settingsKeyForLegacyTarget(updated);
    if (settingsKey) {
      await updateSettings({ [settingsKey]: daily } as Partial<UserSettings>);
    }

    setEditingId(null);
  };

  const acquireManually = async (id: string) => {
    const c = courses.find(x => x.id === id);
    if (!c) return;
    const updated: IntCourse = { ...c, status: 'acquired', acquiredAt: Date.now() };
    const next = upsertCourse(courses, updated);
    await saveIntCourses(next);
    setCourses(next);
    setEditingId(null);
  };

  const reactivate = async (id: string) => {
    const c = courses.find(x => x.id === id);
    if (!c) return;
    const updated: IntCourse = { ...c, status: 'active', acquiredAt: undefined };
    const next = upsertCourse(courses, updated);
    await saveIntCourses(next);
    setCourses(next);
  };

  const deleteCourseEntry = async (id: string) => {
    const next = removeCourse(courses, id);
    await saveIntCourses(next);
    setCourses(next);
    setUnitsToday(prev => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
    setEditingId(null);
  };

  if (!loaded || !settings) return null;

  const activeCourses = courses.filter(c => c.status === 'active');
  const acquiredCourses = courses
    .filter(c => c.status === 'acquired')
    .sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0));
  const completedToday = activeCourses.filter(c => (unitsToday[c.id] ?? 0) >= c.dailyTargetUnits).length;
  const totalToday = activeCourses.length;
  const todayPct = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;

  // Ring geometry for hero card
  const ringSize = 88;
  const ringStroke = 6;
  const ringR = (ringSize - ringStroke) / 2;
  const ringC = 2 * Math.PI * ringR;
  const ringOff = ringC - (todayPct / 100) * ringC;

  return (
    <div>
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
                className="font-display text-xl font-bold leading-none glow-text"
                style={{ color: 'var(--color-stat-int)' }}
              >
                INT // INTELLECT
              </h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Domain of Knowledge</p>
            </div>
          </div>
          <div
            className="font-display font-bold text-3xl flex-shrink-0 leading-none"
            style={{ color: 'var(--color-stat-int)', textShadow: '0 0 10px rgba(96,165,250,0.5)' }}
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
              <span className="font-display font-bold text-sm" style={{ color: 'var(--color-stat-int)' }}>
                {level.currentXP} / {level.xpToNext} XP
              </span>
            </div>
            <div className="hud-bar hud-bar--int mt-2">
              <div className="hud-bar__fill" style={{ width: `${level.progressPct}%` }} />
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Empty state when no active courses */}
        {activeCourses.length === 0 && !showAdd && (
          <div
            className="frame-cut p-6 text-center mt-4"
            style={{ boxShadow: 'inset 0 0 30px rgba(96,165,250,0.08)' }}
          >
            <div
              className="cut-tile mx-auto mb-4 grid place-items-center"
              style={{
                width: 72, height: 72,
                border: '1px solid var(--color-stat-int)',
                background: 'rgba(96,165,250,0.06)',
                boxShadow: '0 0 14px rgba(96,165,250,0.3)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-stat-int)' }}>
                <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM18 17H6" />
              </svg>
            </div>
            <div
              className="font-display text-lg font-bold mb-2 glow-text"
              style={{ color: 'var(--color-stat-int)' }}
            >
              NO ACTIVE COURSES
            </div>
            <p className="text-text-dim text-xs leading-relaxed mb-4">
              The intellect grows through<br />
              structured study. Acquire a course<br />
              to begin daily protocols.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="px-6 py-3 rounded-md font-mono-hud font-semibold text-xs tracking-[0.16em] transition-all"
              style={{
                background: 'rgba(96,165,250,0.15)',
                border: '1px solid var(--color-stat-int)',
                color: 'var(--color-stat-int)',
                boxShadow: '0 0 10px rgba(96,165,250,0.3)',
              }}
            >
              + ACQUIRE COURSE
            </button>
          </div>
        )}

        {/* HERO TODAY's PROTOCOL — only when at least one active course */}
        {activeCourses.length > 0 && (
          <div className="frame-bracketed" style={{ filter: 'drop-shadow(0 0 12px rgba(96,165,250,0.18))' }}>
            <div className="frame-cut p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="section-heading" style={{ color: 'var(--color-stat-int)' }}>
                  // TODAY&apos;S PROTOCOL
                </span>
                <span className="font-display font-bold text-sm" style={{ color: 'var(--color-stat-int)' }}>
                  {completedToday} / {totalToday}
                </span>
              </div>

              <div className="flex items-center gap-3.5">
                {/* Ring */}
                <div className="relative flex-shrink-0" style={{ width: ringSize, height: ringSize }}>
                  <svg width={ringSize} height={ringSize}>
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="var(--color-border)" strokeWidth={ringStroke} />
                    <circle
                      cx={ringSize / 2} cy={ringSize / 2} r={ringR}
                      fill="none"
                      stroke="var(--color-stat-int)"
                      strokeWidth={ringStroke}
                      strokeLinecap="round"
                      strokeDasharray={ringC}
                      strokeDashoffset={ringOff}
                      transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                      style={{ filter: 'drop-shadow(0 0 6px var(--color-stat-int))', transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="font-display font-bold text-xl leading-none" style={{ color: 'var(--color-stat-int)' }}>{completedToday}</div>
                    <div className="text-text-muted text-[8px] tracking-[0.18em] uppercase mt-0.5">of {totalToday}</div>
                  </div>
                </div>

                {/* Today chips */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  {activeCourses.map(c => {
                    const todayUnits = unitsToday[c.id] ?? 0;
                    const done = todayUnits >= c.dailyTargetUnits;
                    const accent = done ? 'var(--color-stat-agi)' : 'var(--color-stat-int)';
                    const accentBg = done ? 'rgba(34,197,94,0.15)' : 'rgba(96,165,250,0.15)';
                    const over = Math.max(0, todayUnits - c.dailyTargetUnits);
                    return (
                      <div
                        key={c.id}
                        className="cut-tile px-3 py-2 grid items-center gap-2"
                        style={{
                          gridTemplateColumns: '1fr auto',
                          background: done ? 'rgba(34,197,94,0.10)' : 'var(--color-bg)',
                          border: `1px solid ${done ? 'var(--color-stat-agi)' : 'var(--color-border)'}`,
                          boxShadow: done ? '0 0 8px rgba(34,197,94,0.18)' : 'none',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="font-display text-xs text-text truncate flex items-center gap-1.5">
                            <span className="truncate">{c.name}</span>
                            {done && <span className="font-mono-hud text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--color-stat-agi)' }}>✓</span>}
                          </div>
                          <div className="flex gap-0.5 mt-1 items-center">
                            {Array.from({ length: c.dailyTargetUnits }).map((_, i) => (
                              <div
                                key={i}
                                style={{
                                  width: 14, height: 4,
                                  background: i < todayUnits ? 'var(--color-stat-int)' : 'transparent',
                                  border: `1px solid ${i < todayUnits ? 'var(--color-stat-int)' : 'var(--color-border)'}`,
                                  boxShadow: i < todayUnits ? '0 0 4px var(--color-stat-int)' : 'none',
                                }}
                              />
                            ))}
                            {over > 0 && (
                              <span className="font-mono-hud text-[9px] tracking-[0.1em] ml-1" style={{ color: 'var(--color-stat-agi)' }}>
                                +{over}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Stepper — always available so user can log past target */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => decUnit(c.id)}
                            disabled={todayUnits <= 0}
                            className="cut-tile w-7 h-7 grid place-items-center font-mono-hud text-sm leading-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
                            aria-label={`Decrease ${c.name}`}
                          >
                            −
                          </button>
                          <span
                            className="font-display font-bold text-sm min-w-[1.5ch] text-center leading-none"
                            style={{ color: accent }}
                          >
                            {todayUnits}
                          </span>
                          <button
                            onClick={() => bumpUnit(c.id)}
                            className="cut-tile w-7 h-7 grid place-items-center font-mono-hud text-sm leading-none transition-colors hover:brightness-125"
                            style={{ background: accentBg, border: `1px solid ${accent}`, color: accent }}
                            aria-label={`Increase ${c.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <span className="frame-bracket-bottom" aria-hidden />
          </div>
        )}

        {/* ACTIVE COURSES — context only (tap card to edit) */}
        {activeCourses.length > 0 && (
          <>
            <div className="flex items-center justify-between px-0.5 mt-2">
              <span className="section-heading text-text-dim">// ACTIVE COURSES</span>
              <span className="text-text-muted text-[9px] tracking-[0.16em] uppercase">{activeCourses.length} ACTIVE</span>
            </div>

            <div className="space-y-1.5">
              {activeCourses.map(c => {
                const pct = c.totalUnits > 0 ? Math.round((c.completedUnits / c.totalUnits) * 100) : 0;
                const isEditing = editingId === c.id;
                const eta = projectETA(c);

                if (isEditing) {
                  return (
                    <div key={c.id} className="frame-cut p-3 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="Course name"
                        className="w-full bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editTotal}
                          onChange={e => setEditTotal(e.target.value)}
                          placeholder="Total units"
                          min={1}
                          className="flex-1 bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editDaily}
                          onChange={e => setEditDaily(e.target.value)}
                          placeholder="Daily target"
                          min={1}
                          className="flex-1 bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-2 py-2 rounded text-[10px] tracking-[0.16em] font-semibold transition-colors"
                          style={{
                            background: 'rgba(96,165,250,0.15)',
                            border: '1px solid var(--color-stat-int)',
                            color: 'var(--color-stat-int)',
                          }}
                        >
                          SAVE
                        </button>
                        <button
                          onClick={() => acquireManually(c.id)}
                          className="px-2 py-2 rounded bg-success/10 border border-success/40 text-success text-[10px] tracking-[0.16em] font-semibold hover:bg-success/20 transition-colors"
                        >
                          ACQUIRE
                        </button>
                        <button
                          onClick={() => deleteCourseEntry(c.id)}
                          className="px-2 py-2 rounded border border-danger/40 text-danger text-[10px] tracking-[0.16em] font-semibold hover:bg-danger/10 transition-colors"
                        >
                          DELETE
                        </button>
                      </div>
                      <button
                        onClick={() => setEditingId(null)}
                        className="w-full px-2 py-2 rounded border border-border text-text-muted text-[10px] tracking-[0.16em] hover:text-text transition-colors"
                      >
                        CANCEL
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={c.id}
                    onClick={() => startEdit(c)}
                    className="frame-cut p-3 w-full text-left transition-colors hover:brightness-110"
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="font-display font-semibold text-text text-sm truncate">{c.name}</div>
                      <span className="font-display font-bold text-xs flex-shrink-0" style={{ color: 'var(--color-stat-int)' }}>
                        {c.completedUnits}<span className="text-text-muted text-[10px] ml-0.5">/ {c.totalUnits}</span>
                      </span>
                    </div>
                    <div className="hud-bar hud-bar--int mb-1.5">
                      <div className="hud-bar__fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] tracking-[0.14em] uppercase">
                      <span className="text-text-muted">{pct}% Complete</span>
                      {eta && <span className="text-text-dim">~ {eta.eta} · {eta.daysLeft}d</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ADD COURSE button (or form) */}
        {showAdd ? (
          <div className="frame-cut p-3 space-y-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Course name"
              className="w-full bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={newTotal}
                onChange={e => setNewTotal(e.target.value)}
                placeholder="Total units"
                min={1}
                className="flex-1 bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
              />
              <input
                type="number"
                inputMode="numeric"
                value={newDaily}
                onChange={e => setNewDaily(e.target.value)}
                placeholder="Daily target"
                min={1}
                className="flex-1 bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addCourse}
                disabled={!newName.trim() || !parseInt(newTotal, 10) || !parseInt(newDaily, 10)}
                className="flex-1 px-3 py-2 rounded text-[10px] tracking-[0.16em] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(96,165,250,0.15)',
                  border: '1px solid var(--color-stat-int)',
                  color: 'var(--color-stat-int)',
                }}
              >
                ADD
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewName(''); setNewTotal(''); setNewDaily('1'); }}
                className="flex-1 px-3 py-2 rounded border border-border text-text-muted text-[10px] tracking-[0.16em] hover:text-text transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : activeCourses.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="cut-tile w-full px-3 py-3 text-text-muted hover:text-text font-mono-hud text-[11px] font-semibold tracking-[0.14em] transition-colors"
            style={{ background: 'transparent', border: '1px dashed var(--color-border)' }}
          >
            + ADD COURSE
          </button>
        )}

        {/* TROPHY STRIP — acquired courses */}
        {acquiredCourses.length > 0 && (
          <div className="space-y-1.5 mt-2">
            <div className="text-text-muted text-[10px] tracking-[0.16em] uppercase">// ACQUIRED · {acquiredCourses.length}</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {acquiredCourses.map(c => (
                <button
                  key={c.id}
                  onClick={() => reactivate(c.id)}
                  className="cut-tile flex-shrink-0 px-3 py-2 flex items-center gap-2 transition-colors hover:brightness-110"
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.4)',
                    color: 'var(--color-rank-a)',
                  }}
                  title="Tap to reactivate"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 13h4v4h-4zM8 21h8M12 17v4" />
                  </svg>
                  <div className="flex flex-col leading-tight text-left">
                    <span className="font-display font-semibold text-[11px] text-text tracking-[0.04em]">{c.name}</span>
                    <span className="font-mono-hud text-[8px] tracking-[0.12em] opacity-80">
                      ACQUIRED{c.acquiredAt ? ` · ${formatAcquiredDate(c.acquiredAt)}` : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <CustomTasksSection skill="INT" />
      </main>
    </div>
  );
}
