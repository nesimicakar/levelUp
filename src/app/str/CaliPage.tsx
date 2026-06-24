'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getWeekStart, getSettings, updateSettings, getActiveStrWeekSessions } from '@/lib/db';
import { computeLevel, computeStrXP } from '@/lib/logic/levels';
import {
  getStrWeeklyStatus,
  canUseRestToken,
  computeStrWeekStrip,
  type StrDayState,
} from '@/lib/logic/str';
import {
  CALI_EXERCISES,
  buildCaliSession,
  isCaliSessionComplete,
  computeCaliStats,
  type CaliExerciseStats,
} from '@/lib/logic/cali';
import { SystemMessage } from '@/components/SystemMessage';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import type { CaliSession, CaliExerciseRecord, StrSession, StatLevel, UserSettings } from '@/types';

// ── Week strip ────────────────────────────────────────────────────────────────

const DAY_STATE_STYLE: Record<StrDayState, { bg: string; border: string; color: string; symbol: string }> = {
  done:   { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.5)',  color: 'var(--color-stat-agi)', symbol: '✓' },
  rest:   { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.5)',  color: 'var(--color-stat-vit)', symbol: 'z' },
  cur:    { bg: 'rgba(239,68,68,0.18)',  border: 'var(--color-stat-str)', color: 'var(--color-stat-str)', symbol: '▸' },
  todo:   { bg: 'transparent',           border: 'var(--color-border)',   color: 'var(--color-text-muted)', symbol: '·' },
  missed: { bg: 'transparent',           border: 'var(--color-border)',   color: 'var(--color-text-dim)',   symbol: '–' },
};

// ── PR badge ──────────────────────────────────────────────────────────────────

function PRBadge() {
  return (
    <span
      className="font-display font-bold text-[9px] tracking-[0.16em] uppercase px-1.5 py-0.5 rounded"
      style={{ background: 'rgba(251,191,36,0.18)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.45)' }}
    >
      ★ NEW PR
    </span>
  );
}

// ── Dashboard exercise card ────────────────────────────────────────────────────

function ExerciseCard({
  def,
  stats,
}: {
  def: typeof CALI_EXERCISES[number];
  stats: CaliExerciseStats;
}) {
  const hasHistory = stats.bestSetReps > 0 || stats.bestTotalReps > 0;
  const lastTotal = stats.lastSessionSets.reduce((s, r) => s + r.reps, 0);
  const lastRepsStr = stats.lastSessionSets.map(s => s.reps).join(' / ');
  const progressPct = stats.bestTotalReps > 0
    ? Math.min(100, Math.round((lastTotal / stats.bestTotalReps) * 100))
    : 0;

  return (
    <div className="frame-cut p-3">
      {/* Title row */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-display font-semibold text-text text-sm">{def.name}</h4>
        <span
          className="text-[9px] font-semibold tracking-[0.14em] uppercase px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--color-stat-str)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          {stats.currentProgressionLabel}
        </span>
      </div>

      {hasHistory ? (
        <>
          {/* PR stat row */}
          <div className="grid mb-2" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div>
              <div className="text-[8px] tracking-[0.14em] text-text-muted uppercase mb-0.5">BEST SET</div>
              <div className="font-display font-bold text-base leading-none" style={{ color: 'var(--color-stat-str)' }}>
                {stats.bestSetReps}
              </div>
            </div>
            <div>
              <div className="text-[8px] tracking-[0.14em] text-text-muted uppercase mb-0.5">BEST TOTAL</div>
              <div className="font-display font-bold text-base leading-none" style={{ color: 'var(--color-stat-str)' }}>
                {stats.bestTotalReps}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[8px] tracking-[0.14em] text-text-muted uppercase mb-0.5">LAST SESSION</div>
              <div className="font-mono-hud text-[11px] text-text leading-none">{lastRepsStr || '—'}</div>
            </div>
          </div>
          {/* Progress bar vs best total */}
          <div className="hud-bar hud-bar--str">
            <div className="hud-bar__fill" style={{ width: `${progressPct}%` }} />
          </div>
        </>
      ) : (
        <p className="text-[10px] text-text-muted italic">No sessions yet — start your first!</p>
      )}
    </div>
  );
}

// ── Set row in active session ─────────────────────────────────────────────────

function SetRow({
  set,
  state,
  onToggle,
  onRepsChange,
}: {
  set: CaliExerciseRecord['sets'][number];
  state: 'idle' | 'active' | 'done';
  onToggle: () => void;
  onRepsChange: (reps: number) => void;
}) {
  const rowStyle = state === 'done'
    ? { background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)', boxShadow: 'none' }
    : state === 'active'
    ? { background: 'rgba(239,68,68,0.10)', border: '1px solid var(--color-stat-str)', boxShadow: '0 0 8px rgba(239,68,68,0.20)' }
    : { background: 'transparent', border: '1px solid var(--color-border)', boxShadow: 'none' };

  const labelColor = state === 'done' ? 'var(--color-stat-agi)'
    : state === 'active' ? 'var(--color-stat-str)'
    : 'var(--color-text-muted)';

  const valueColor = state === 'done' ? 'var(--color-stat-agi)' : 'var(--color-text)';

  const doneBtnStyle = state === 'done'
    ? { background: 'var(--color-stat-agi)', border: '1px solid var(--color-stat-agi)', color: 'var(--color-bg)', boxShadow: '0 0 6px rgba(34,197,94,0.4)' }
    : state === 'active'
    ? { background: 'rgba(239,68,68,0.10)', border: '1px solid var(--color-stat-str)', color: 'var(--color-stat-str)', boxShadow: 'none' }
    : { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', boxShadow: 'none' };

  return (
    <div
      className="cut-tile grid items-stretch transition-all"
      style={{ gridTemplateColumns: '44px 1fr 64px', gap: 10, padding: '8px 10px', ...rowStyle }}
    >
      {/* SET label */}
      <div className="grid place-items-center" style={{ borderRight: '1px solid var(--color-border)' }}>
        <div className="font-mono-hud text-[10px] tracking-[0.14em] text-center leading-tight" style={{ color: labelColor }}>
          SET<br />{set.setNumber}
        </div>
      </div>

      {/* Rep stepper */}
      <div className="grid items-center" style={{ gridTemplateColumns: '36px 1fr 36px' }}>
        <button
          onClick={() => onRepsChange(set.reps - 1)}
          className="h-full grid place-items-center font-mono-hud text-base leading-none transition-colors hover:brightness-125"
          style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
          aria-label={`Decrease reps for set ${set.setNumber}`}
        >
          −
        </button>
        <div className="grid place-items-center">
          <div className="flex items-baseline gap-1">
            <span className="font-mono-hud font-bold text-base" style={{ color: valueColor }}>{set.reps}</span>
            <span className="font-mono-hud text-[9px] text-text-muted">reps</span>
          </div>
        </div>
        <button
          onClick={() => onRepsChange(set.reps + 1)}
          className="h-full grid place-items-center font-mono-hud text-base leading-none transition-colors hover:brightness-125"
          style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
          aria-label={`Increase reps for set ${set.setNumber}`}
        >
          +
        </button>
      </div>

      {/* DONE pill */}
      <button
        onClick={onToggle}
        className="cut-tile grid place-items-center font-display font-bold text-[11px] tracking-[0.14em] transition-all"
        style={{ ...doneBtnStyle, padding: '6px 4px' }}
        aria-label={state === 'done' ? `Undo set ${set.setNumber}` : `Mark set ${set.setNumber} done`}
      >
        {state === 'done' ? '✓ DONE' : 'DONE'}
      </button>
    </div>
  );
}

// ── Main CaliPage ─────────────────────────────────────────────────────────────

export default function CaliPage({ onModeChange }: { onModeChange?: () => Promise<void> }) {
  const router = useRouter();
  const today = getToday();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [todaySession, setTodaySession] = useState<CaliSession | null>(null);
  const [weekSessions, setWeekSessions] = useState<StrSession[]>([]);
  const [allSessions, setAllSessions] = useState<CaliSession[]>([]);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [loaded, setLoaded] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [quickSelected, setQuickSelected] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const weekStart = getWeekStart(today);
    const [todaySess, combinedWeekSess, allSess] = await Promise.all([
      db.caliSessions.where('date').equals(today).first(),
      getActiveStrWeekSessions(weekStart, today + '￿', s),
      db.caliSessions.toArray(),
    ]);

    setTodaySession(todaySess ?? null);
    setWeekSessions(combinedWeekSess);
    setAllSessions(allSess);

    const totalCompleted = allSess.filter(sess => sess.completed && !sess.isRestDay).length;
    setLevel(computeLevel(computeStrXP(totalCompleted, 0)));
    setLoaded(true);
  }, [today]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!loaded) return null;

  const progressionLevels = settings?.caliProgressionLevels ?? {};
  const sessionsRequired = settings?.strSessionsPerWeek ?? 3;
  const weekStart = getWeekStart(today);
  const weekly = getStrWeeklyStatus(weekSessions, sessionsRequired);
  const canRest = canUseRestToken(weekSessions, sessionsRequired);
  const weekStrip = computeStrWeekStrip(weekSessions, today, weekStart);

  const lastCompleted = [...allSessions]
    .filter(s => s.completed && !s.isRestDay && s.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const stats = computeCaliStats(allSessions, progressionLevels);

  // ── Session mutations ───────────────────────────────────────────────────────

  const startSession = async (type: 'full' | 'quick' = 'full', exerciseIds?: string[]) => {
    let exercises = buildCaliSession(progressionLevels, lastCompleted);
    if (type === 'quick' && exerciseIds && exerciseIds.length > 0) {
      exercises = exercises.filter(e => exerciseIds.includes(e.id));
    }
    const session: CaliSession = { date: today, exercises, completed: false, createdAt: Date.now(), sessionType: type };
    const id = await db.caliSessions.add(session);
    setTodaySession({ ...session, id });
    setShowQuickPicker(false);
    setQuickSelected(new Set());
  };

  const updateReps = async (eIdx: number, sIdx: number, reps: number) => {
    if (!todaySession?.id) return;
    const exercises = todaySession.exercises.map((e, i) =>
      i !== eIdx ? e : { ...e, sets: e.sets.map((s, j) => j !== sIdx ? s : { ...s, reps: Math.max(0, reps) }) }
    );
    await db.caliSessions.update(todaySession.id, { exercises });
    setTodaySession({ ...todaySession, exercises });
  };

  const toggleSet = async (eIdx: number, sIdx: number) => {
    if (!todaySession?.id) return;
    const exercises = todaySession.exercises.map((e, i) =>
      i !== eIdx ? e : { ...e, sets: e.sets.map((s, j) => j !== sIdx ? s : { ...s, completed: !s.completed }) }
    );
    const completed = isCaliSessionComplete(exercises);
    const wasCompleted = todaySession.completed;
    await db.caliSessions.update(todaySession.id, { exercises, completed });
    setTodaySession({ ...todaySession, exercises, completed });
    if (completed && !wasCompleted) { setShowComplete(true); loadData(); }
  };

  const cancelSession = async () => {
    if (!todaySession?.id || todaySession.completed || todaySession.isRestDay) return;
    await db.caliSessions.delete(todaySession.id);
    setTodaySession(null);
    await loadData();
  };

  const useRestDay = async () => {
    const session: CaliSession = {
      date: today,
      exercises: [],
      completed: false,
      isRestDay: true,
      createdAt: Date.now(),
    };
    const id = await db.caliSessions.add(session);
    setTodaySession({ ...session, id });
    await loadData();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <SystemMessage
        title="SYSTEM MESSAGE"
        subtitle="CALISTHENICS SESSION LOGGED"
        variant="minor"
        visible={showComplete}
        onDismiss={() => setShowComplete(false)}
      />

      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">

        {/* Header */}
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
                STR // CALISTHENICS
              </h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Bodyweight Progression</p>
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
              aria-label="Calisthenics settings"
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

        {/* Settings panel */}
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

              {/* Training Mode */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-text-muted tracking-[0.14em] uppercase">Training Mode</p>
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-md"
                  style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)' }}
                >
                  <div className="min-w-0">
                    <span className="text-sm text-text">Mode</span>
                    <p className="text-[10px] text-text-muted mt-0.5">Bodyweight progression tracking</p>
                  </div>
                  <select
                    value={settings?.strTrainingMode ?? 'calisthenics'}
                    onChange={async e => {
                      await updateSettings({ strTrainingMode: e.target.value as 'gym' | 'calisthenics' });
                      await onModeChange?.();
                    }}
                    className="rounded px-2 py-1 text-sm focus:outline-none"
                    style={{ background: 'var(--color-bg)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--color-stat-str)' }}
                  >
                    <option value="gym">Gym</option>
                    <option value="calisthenics">Calisthenics</option>
                  </select>
                </div>
              </div>

              {/* Progression level per exercise */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-text-muted tracking-[0.14em] uppercase">
                  Progression Levels
                  <span className="ml-2 text-text-muted/70 normal-case tracking-normal">— applies to new sessions</span>
                </p>
                {CALI_EXERCISES.map(def => {
                  const currentLevel = progressionLevels[def.id] ?? def.defaultProgressionId;
                  return (
                    <div
                      key={def.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5"
                      style={{ borderBottom: '1px solid rgba(239,68,68,0.18)' }}
                    >
                      <span className="text-xs text-text-muted w-20 shrink-0">{def.name}</span>
                      <select
                        value={currentLevel}
                        onChange={async e => {
                          const updated = { ...progressionLevels, [def.id]: e.target.value };
                          await updateSettings({ caliProgressionLevels: updated });
                          await loadData();
                        }}
                        className="flex-1 min-w-0 rounded px-2 py-1 text-xs focus:outline-none text-right"
                        style={{ background: 'var(--color-bg)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-stat-str)' }}
                      >
                        {def.progressions.map(p => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
            <span className="frame-bracket-bottom" aria-hidden />
          </div>
        )}

        {/* Level / XP */}
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

        {/* Weekly directive */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-2">Weekly Directive</div>
            <div className="flex items-end justify-between gap-3 mb-3">
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
            <div className="flex gap-1">
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

        {/* Active session / rest day state */}
        {todaySession?.isRestDay ? (
          <div className="frame-cut p-6 text-center">
            <p className="text-text-muted text-sm tracking-wider">REST DAY</p>
            <p className="text-text-dim text-xs mt-1">Recovery is part of the protocol</p>
          </div>
        ) : todaySession?.completed ? (
          <div className="frame-cut p-6 text-center">
            <p className="text-success text-sm font-medium tracking-wider animate-pulse-glow">CALISTHENICS SESSION COMPLETE</p>
            <p className="text-text-muted text-xs mt-1">
              {todaySession.sessionType === 'quick' ? 'Quick Session' : 'Full Session'} · +25 XP earned
            </p>
          </div>
        ) : todaySession ? (
          /* Session in progress */
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="section-heading" style={{ color: 'var(--color-stat-str)' }}>
                // CALISTHENICS · {todaySession.sessionType === 'quick' ? 'QUICK' : 'FULL'}
              </span>
              <span className="text-[9px] tracking-[0.14em] uppercase text-text-muted">
                {todaySession.exercises.length} exercise{todaySession.exercises.length !== 1 ? 's' : ''}
              </span>
            </div>
            {todaySession.exercises.map((exercise, eIdx) => {
              const doneSets = exercise.sets.filter(s => s.completed);
              const completedCount = doneSets.length;
              const total = exercise.sets.length;
              const allDone = completedCount === total;
              const activeIdx = exercise.sets.findIndex(s => !s.completed);
              const exStats = stats[exercise.id];

              // PR computation vs historical bests (current session not yet in stats since not completed)
              const currentBestSet = doneSets.reduce((m, s) => Math.max(m, s.reps), 0);
              const currentTotal   = doneSets.reduce((a, s) => a + s.reps, 0);
              const isPRSet   = currentBestSet > 0 && currentBestSet > (exStats?.bestSetReps ?? 0);
              const isPRTotal = currentTotal   > 0 && currentTotal   > (exStats?.bestTotalReps ?? 0);
              const isAnyPR   = isPRSet || isPRTotal;

              const currentRepsStr = doneSets.map(s => s.reps).join(' / ');
              const hasHistory = (exStats?.bestSetReps ?? 0) > 0 || (exStats?.bestTotalReps ?? 0) > 0;

              return (
                <div key={eIdx} className="frame-cut p-3">
                  {/* Exercise header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <h4 className="font-display font-semibold text-text text-sm">{exercise.name}</h4>
                      <span className="text-[9px] tracking-[0.12em] uppercase" style={{ color: 'var(--color-text-muted)' }}>
                        {exStats?.currentProgressionLabel ?? exercise.progressionLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAnyPR && <PRBadge />}
                      <span
                        className="font-mono-hud text-[10px] tracking-[0.14em]"
                        style={{ color: allDone ? 'var(--color-stat-agi)' : 'var(--color-text-muted)' }}
                      >
                        {completedCount}/{total}
                      </span>
                    </div>
                  </div>

                  {/* Stats row: Current / Best Set / Best Total */}
                  <div
                    className="grid mb-2 px-1 py-1.5 rounded"
                    style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 4, background: 'rgba(255,255,255,0.025)', border: '1px solid var(--color-border)' }}
                  >
                    <div>
                      <div className="text-[8px] tracking-[0.12em] text-text-muted uppercase mb-0.5">CURRENT</div>
                      <div className="font-mono-hud text-[11px]" style={{ color: currentRepsStr ? 'var(--color-text)' : 'var(--color-text-dim)' }}>
                        {currentRepsStr || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] tracking-[0.12em] uppercase mb-0.5" style={{ color: isPRSet ? '#fbbf24' : 'var(--color-text-muted)' }}>BEST SET</div>
                      <div className="font-display font-bold text-sm leading-none" style={{ color: isPRSet ? '#fbbf24' : 'var(--color-stat-str)' }}>
                        {hasHistory ? (exStats?.bestSetReps ?? '—') : '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[8px] tracking-[0.12em] uppercase mb-0.5" style={{ color: isPRTotal ? '#fbbf24' : 'var(--color-text-muted)' }}>BEST TOTAL</div>
                      <div className="font-display font-bold text-sm leading-none" style={{ color: isPRTotal ? '#fbbf24' : 'var(--color-stat-str)' }}>
                        {hasHistory ? (exStats?.bestTotalReps ?? '—') : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Set rows */}
                  <div className="space-y-1.5">
                    {exercise.sets.map((set, sIdx) => {
                      const state: 'idle' | 'active' | 'done' =
                        set.completed ? 'done' : sIdx === activeIdx ? 'active' : 'idle';
                      return (
                        <SetRow
                          key={sIdx}
                          set={set}
                          state={state}
                          onToggle={() => toggleSet(eIdx, sIdx)}
                          onRepsChange={reps => updateReps(eIdx, sIdx, reps)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <button
              onClick={cancelSession}
              className="w-full p-2 rounded-md bg-surface border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
            >
              CANCEL SESSION
            </button>
          </div>
        ) : (
          /* Dashboard + start button */
          <div className="space-y-3">
            <div className="space-y-2">
              <span className="section-heading" style={{ color: 'var(--color-stat-str)' }}>
                // EXERCISE PROGRESSION
              </span>
              {CALI_EXERCISES.map(def => (
                <ExerciseCard
                  key={def.id}
                  def={def}
                  stats={stats[def.id] ?? {
                    exerciseId: def.id,
                    bestSetReps: 0,
                    bestTotalReps: 0,
                    lastSessionSets: [],
                    lastProgressionLabel: def.defaultProgressionId,
                    currentProgressionLabel: def.defaultProgressionId,
                  }}
                />
              ))}
            </div>
            {/* Full session */}
            <button
              onClick={() => startSession('full')}
              className="w-full p-3 rounded-md font-display font-semibold tracking-wider transition-colors"
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.45)',
                color: 'var(--color-stat-str)',
              }}
            >
              <div>START FULL SESSION →</div>
              <div className="font-normal text-[10px] tracking-[0.12em] mt-0.5 text-text-muted">
                Push-ups · Pull-ups · Dips · Squats
              </div>
            </button>

            {/* Quick session */}
            <button
              onClick={() => { setShowQuickPicker(v => !v); setQuickSelected(new Set()); }}
              className="w-full p-2.5 rounded-md font-display font-semibold tracking-wider transition-colors text-sm"
              style={{
                background: showQuickPicker ? 'rgba(239,68,68,0.08)' : 'transparent',
                border: '1px solid rgba(239,68,68,0.28)',
                color: showQuickPicker ? 'var(--color-stat-str)' : 'var(--color-text-muted)',
              }}
            >
              QUICK SESSION {showQuickPicker ? '▴' : '▾'}
            </button>

            {/* Rest day */}
            {canRest && (
              <button
                onClick={useRestDay}
                className="w-full p-2.5 rounded-md bg-surface border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
              >
                USE REST TOKEN ({weekly.restTokensTotal - weekly.restTokensUsed} REMAINING)
              </button>
            )}

            {showQuickPicker && (
              <div className="frame-cut p-3 space-y-2">
                <p className="text-[10px] tracking-[0.14em] text-text-muted uppercase">Select exercises:</p>
                <div className="space-y-1.5">
                  {CALI_EXERCISES.map(def => {
                    const selected = quickSelected.has(def.id);
                    return (
                      <button
                        key={def.id}
                        onClick={() => setQuickSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(def.id)) next.delete(def.id); else next.add(def.id);
                          return next;
                        })}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded transition-all text-left"
                        style={{
                          background: selected ? 'rgba(239,68,68,0.10)' : 'transparent',
                          border: `1px solid ${selected ? 'rgba(239,68,68,0.45)' : 'var(--color-border)'}`,
                          color: selected ? 'var(--color-stat-str)' : 'var(--color-text-muted)',
                        }}
                      >
                        <span className="font-display font-bold text-base w-4 leading-none">
                          {selected ? '■' : '□'}
                        </span>
                        <span className="font-display text-sm">{def.name}</span>
                        <span className="text-[9px] ml-auto opacity-60">
                          {stats[def.id]?.currentProgressionLabel ?? def.defaultProgressionId}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => startSession('quick', [...quickSelected])}
                  disabled={quickSelected.size === 0}
                  className="w-full p-2.5 rounded-md font-display font-semibold tracking-wider transition-colors text-sm"
                  style={{
                    background: quickSelected.size > 0 ? 'rgba(239,68,68,0.10)' : 'transparent',
                    border: `1px solid ${quickSelected.size > 0 ? 'rgba(239,68,68,0.45)' : 'var(--color-border)'}`,
                    color: quickSelected.size > 0 ? 'var(--color-stat-str)' : 'var(--color-text-dim)',
                    opacity: quickSelected.size === 0 ? 0.4 : 1,
                  }}
                >
                  START SELECTED ({quickSelected.size}) →
                </button>
              </div>
            )}
          </div>
        )}

        <CustomTasksSection skill="STR" />
      </main>
    </div>
  );
}
