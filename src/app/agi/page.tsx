'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getSettings, updateSettings } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { computeLevel, computeAgiXP, getAgiDailyCap } from '@/lib/logic/levels';
import { computeAgiStreak } from '@/lib/logic/streaks';
import { matchModality, saveAgiMinutes, syncAgiDayCompleted, type Modality } from '@/lib/logic/agi';
import { LogDateToggle } from '@/components/LogDateToggle';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import type { AgiLog, StatLevel, UserSettings } from '@/types';

const MODALITIES: { k: Modality; settingsLabel?: string; icon: React.ReactNode }[] = [
  { k: 'RUN', settingsLabel: 'Running', icon: (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="14" cy="4" r="2"/><path d="M5 21l4-7 3 2-2 5M9 14l3-4 4 1 4 4M16 8l-3 3 2 4"/></svg>) },
  { k: 'BIKE', settingsLabel: 'Cycling', icon: (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h4l4 7M10 10l1-4h3"/></svg>) },
  { k: 'SWIM', settingsLabel: 'Swimming', icon: (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="17" cy="7" r="2"/><path d="M3 14c2-1 4-1 6 0s4 1 6 0 4-1 6 0M3 19c2-1 4-1 6 0s4 1 6 0 4-1 6 0M9 11l4-2 3 3"/></svg>) },
  { k: 'ROW', settingsLabel: 'Rowing', icon: (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8M13 15l4-4M5 19l2-2"/></svg>) },
  { k: 'WALK', icon: (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2"/><path d="M9 21l3-7 2 2 2 5M12 14l-2-3 4-3 3 3"/></svg>) },
  { k: 'HIIT', icon: (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>) },
];

function inferModality(activityType: string | undefined): Modality {
  return matchModality(activityType) ?? 'RUN';
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function AgiPage() {
  const router = useRouter();
  const { today, yesterday } = getLoggableDates();
  const [logDate, setLogDate] = useState(today);

  const [todaysLogs, setTodaysLogs] = useState<AgiLog[]>([]);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [streak, setStreak] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [modality, setModality] = useState<Modality>('RUN');
  const [strip14, setStrip14] = useState<{ date: string; on: boolean }[]>([]);
  const [byModality, setByModality] = useState<{ k: Modality; minutes: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Autosave plumbing ──
  // Minutes edits are debounced, then written through a serial queue. Each pending edit
  // carries its own date + modality so switching either can never save to the wrong place.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const logDateRef = useRef(logDate);
  logDateRef.current = logDate;
  const settingsRef = useRef<UserSettings | null>(null);
  const pendingRef = useRef<{ date: string; modality: Modality; minutes: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  // True from the first unsaved edit until its save lands. While true, reloads must not
  // overwrite the minutes input with older saved data.
  const dirtyRef = useRef(false);
  const loadDataRef = useRef<() => Promise<void>>(async () => {});
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const loadData = useCallback(async () => {
    const realToday = getToday();
    const s = await getSettings();
    setSettings(s);
    settingsRef.current = s;

    const todayLogs = await db.agiLogs.where('date').equals(logDate).toArray();
    setTodaysLogs(todayLogs);
    // (minutes input is synced separately by an effect that watches modality + todaysLogs)

    const allLogs = await db.agiLogs.toArray();
    const total = allLogs.reduce((sum, l) => sum + l.minutes, 0);
    setTotalMinutes(total);
    setTotalSessions(allLogs.filter(l => l.completed).length);

    // Lifetime minutes per modality — only count logs whose activityType maps to a known modality
    const modalityTotals = new Map<Modality, number>();
    for (const log of allLogs) {
      if (log.minutes <= 0) continue;
      const k = matchModality(log.activityType);
      if (!k) continue;
      modalityTotals.set(k, (modalityTotals.get(k) ?? 0) + log.minutes);
    }
    const sortedModalities = [...modalityTotals.entries()]
      .filter(([, m]) => m > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, minutes]) => ({ k, minutes }));
    setByModality(sortedModalities);

    const currentStreak = await computeAgiStreak(realToday);
    setStreak(currentStreak);

    // Best streak: walk back through completed dates and find longest consecutive
    const completedDates = new Set(allLogs.filter(l => l.completed).map(l => l.date));
    let best = 0, run = 0;
    const sorted = [...completedDates].sort();
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i] === addDays(sorted[i - 1], 1)) {
        run++;
      } else {
        run = 1;
      }
      if (run > best) best = run;
    }
    setBestStreak(best);

    // 14-day completion strip ending today
    const strip: { date: string; on: boolean }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(realToday, -i);
      strip.push({ date: d, on: completedDates.has(d) });
    }
    setStrip14(strip);

    const agiCap = getAgiDailyCap(s.agiMinMinutes);
    // Cap applies per DAY (sum across modalities), not per individual log
    const minutesByDay = new Map<string, number>();
    for (const l of allLogs) {
      minutesByDay.set(l.date, (minutesByDay.get(l.date) ?? 0) + l.minutes);
    }
    const cappedTotal = [...minutesByDay.values()].reduce((s, m) => s + Math.min(m, agiCap), 0);
    const xp = computeAgiXP(cappedTotal, currentStreak);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, [logDate]); // eslint-disable-line react-hooks/exhaustive-deps

  loadDataRef.current = loadData;
  useEffect(() => { loadData(); }, [loadData]);

  // Set initial modality once settings is available (only first time)
  const initialModalitySet = useRef(false);
  useEffect(() => {
    if (!settings || initialModalitySet.current) return;
    initialModalitySet.current = true;
    setModality(inferModality(settings.agiActivityType));
  }, [settings]);

  // Single source of truth: input minutes always reflect the current modality's saved log.
  // Runs after save (todaysLogs changes), date switch (todaysLogs changes), or modality pick.
  // Skipped while an edit is pending/in flight so it can't clobber newer input.
  useEffect(() => {
    if (dirtyRef.current) return;
    const existing = todaysLogs.find(l => matchModality(l.activityType) === modality);
    setMinutes(existing?.minutes ?? 0);
  }, [todaysLogs, modality]);

  useEffect(() => {
    if (!yesterday) return;
    Promise.all([
      db.agiLogs.where('date').equals(today).first(),
      db.agiLogs.where('date').equals(yesterday).first(),
    ]).then(([todayEntry, yesterdayEntry]) => {
      if (!todayEntry && yesterdayEntry) setLogDate(yesterday);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSave = (p: { date: string; modality: Modality; minutes: number }) => {
    setSaveState('saving');
    saveQueue.current = saveQueue.current
      .then(async () => {
        const st = settingsRef.current;
        if (!st) return;
        await saveAgiMinutes(p.date, p.modality, p.minutes, st.agiMinMinutes);

        // Remember the modality as the default for next time if it maps to a settings option
        const settingsLabel = MODALITIES.find(m => m.k === p.modality)?.settingsLabel;
        if (p.minutes > 0 && settingsLabel && settingsLabel !== st.agiActivityType) {
          await updateSettings({ agiActivityType: settingsLabel });
        }

        // No newer edit queued behind this one → the input may follow the database again.
        if (pendingRef.current === null) dirtyRef.current = false;
        // Only repaint if the user is still looking at the day we just saved.
        if (p.date === logDateRef.current) await loadDataRef.current();
        setSaveState(pendingRef.current ? 'saving' : 'idle');
      })
      .catch(err => {
        console.error('[AGI] save failed:', err);
        // Keep the edit queued (and the input protected) so "tap to retry" can resend it.
        if (!pendingRef.current) pendingRef.current = p;
        dirtyRef.current = true;
        setSaveState('error');
      });
  };

  /** Writes any pending edit now and waits for the queue to drain. */
  const flush = async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const p = pendingRef.current;
    if (p) {
      pendingRef.current = null;
      runSave(p);
    }
    await saveQueue.current;
  };
  flushRef.current = flush;

  // Save before the page is hidden or left, so a quick edit-then-back never loses data.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flushRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flushRef.current();
    };
  }, []);

  const editMinutes = (raw: number) => {
    const next = Math.max(0, Math.min(300, raw));
    if (next === minutes) return;
    setMinutes(next);
    dirtyRef.current = true;
    pendingRef.current = { date: logDate, modality, minutes: next };
    setSaveState('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const p = pendingRef.current;
      if (p) {
        pendingRef.current = null;
        runSave(p);
      }
    }, 1000);
  };

  const pickModality = async (m: Modality) => {
    if (m === modality) return;
    await flush();
    setModality(m);
  };

  const changeDate = async (d: string) => {
    await flush();
    setLogDate(d);
  };

  const removeLog = async (id: number) => {
    const st = settingsRef.current;
    if (!st) return;
    await flush();
    await db.agiLogs.delete(id);
    await syncAgiDayCompleted(logDate, st.agiMinMinutes);
    await loadData();
  };

  const addQuick = (delta: number) => editMinutes(minutes + delta);

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
      // Under a minute isn't a session. Ignoring it keeps an accidental start/stop
      // from wiping minutes that are already logged.
      const mins = Math.floor(timerSeconds / 60);
      if (mins >= 1) editMinutes(mins);
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

  const target = settings.agiMinMinutes;
  // Compute today's committed total + delta from the in-flight input (so ring previews the save)
  const existingForCurrentMod = todaysLogs.find(l => matchModality(l.activityType) === modality);
  const committedTotal = todaysLogs.reduce((s, l) => s + l.minutes, 0);
  const projectedTotal = committedTotal - (existingForCurrentMod?.minutes ?? 0) + minutes;
  const completed = projectedTotal >= target;
  const ringPct = Math.min((projectedTotal / target) * 100, 100);
  const overcharged = projectedTotal > target;

  // Ring geometry
  const ringSize = 150;
  const ringStroke = 7;
  const ringR = (ringSize - ringStroke) / 2;
  const ringC = 2 * Math.PI * ringR;
  const ringOff = ringC - (ringPct / 100) * ringC;

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
                style={{ color: 'var(--color-stat-agi)', textShadow: '0 0 10px rgba(34,197,94,0.5)' }}
              >
                AGI // AGILITY
              </h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Domain of Motion</p>
            </div>
          </div>
          <div
            className="font-display font-bold text-3xl flex-shrink-0 leading-none"
            style={{ color: 'var(--color-stat-agi)', textShadow: '0 0 10px rgba(34,197,94,0.5)' }}
          >
            {level.level}
          </div>
        </div>

        <LogDateToggle value={logDate} today={today} yesterday={yesterday} onChange={changeDate} />

        {/* Level / XP */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">
                LEVEL {level.level} → {level.level + 1}
              </span>
              <span className="font-display font-bold text-sm" style={{ color: 'var(--color-stat-agi)' }}>
                {level.currentXP} / {level.xpToNext} XP
              </span>
            </div>
            <div className="hud-bar hud-bar--agi mt-2">
              <div className="hud-bar__fill" style={{ width: `${level.progressPct}%` }} />
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Modality picker */}
        <div className="section-heading mt-2" style={{ color: 'var(--color-stat-agi)' }}>// SELECT MODALITY</div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {MODALITIES.map(m => {
            const active = modality === m.k;
            return (
              <button
                key={m.k}
                onClick={() => pickModality(m.k)}
                className="cut-tile flex-shrink-0 flex flex-col items-center justify-center transition-all"
                style={{
                  minWidth: 58,
                  padding: '10px 6px 8px',
                  background: active ? 'rgba(34,197,94,0.15)' : 'var(--color-bg)',
                  border: `1px solid ${active ? 'var(--color-stat-agi)' : 'var(--color-border)'}`,
                  color: active ? 'var(--color-stat-agi)' : 'var(--color-text-muted)',
                  boxShadow: active ? '0 0 8px rgba(34,197,94,0.25)' : 'none',
                }}
              >
                <div className="grid place-items-center h-[22px]">{m.icon}</div>
                <div className="font-mono-hud text-[9px] tracking-[0.16em] font-semibold mt-1">{m.k}</div>
              </button>
            );
          })}
        </div>

        {/* Today's directive */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Today&apos;s Directive</span>
              <span className="hud-chip hud-chip--ok text-[9px]">
                <span className="hud-chip__dot" />{modality}
              </span>
            </div>

            {/* Ring */}
            <div className="flex justify-center mb-3">
              <div className="relative" style={{ width: ringSize, height: ringSize }}>
                <svg width={ringSize} height={ringSize}>
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="var(--color-border)" strokeWidth={ringStroke} />
                  <circle
                    cx={ringSize / 2} cy={ringSize / 2} r={ringR}
                    fill="none"
                    stroke="var(--color-stat-agi)"
                    strokeWidth={ringStroke}
                    strokeLinecap="round"
                    strokeDasharray={ringC}
                    strokeDashoffset={ringOff}
                    transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                    style={{ filter: 'drop-shadow(0 0 6px var(--color-stat-agi))', transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div
                    className="font-display font-bold text-4xl leading-none"
                    style={{ color: 'var(--color-stat-agi)', textShadow: '0 0 10px rgba(34,197,94,0.5)' }}
                  >
                    {projectedTotal}
                  </div>
                  <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">/ {target} min today</div>
                </div>
              </div>
            </div>

            {/* Today's logged sessions */}
            {todaysLogs.length > 0 && (
              <div className="mb-3">
                <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-1.5">Today&apos;s Sessions</div>
                <div className="flex flex-wrap gap-1.5">
                  {todaysLogs
                    .filter(l => l.minutes > 0)
                    .map(l => {
                      const k = matchModality(l.activityType);
                      const isCurrent = k === modality;
                      return (
                        <span
                          key={l.id}
                          className="cut-tile px-2 py-1 text-[10px] tracking-[0.14em] flex items-center gap-1.5"
                          style={{
                            background: isCurrent ? 'rgba(34,197,94,0.15)' : 'var(--color-bg)',
                            border: `1px solid ${isCurrent ? 'var(--color-stat-agi)' : 'var(--color-border)'}`,
                            color: isCurrent ? 'var(--color-stat-agi)' : 'var(--color-text-dim)',
                          }}
                        >
                          <span className="font-mono-hud font-semibold">{k ?? '·'}</span>
                          <span className="font-display">{l.minutes}m</span>
                          <button
                            onClick={() => l.id !== undefined && removeLog(l.id)}
                            className="ml-0.5 text-text-muted hover:text-text leading-none"
                            aria-label={`Remove ${k ?? 'session'} ${l.minutes} minutes`}
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Quick add */}
            <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-2">
              Quick Add <span className="lowercase tracking-normal text-text-muted">— for {modality}</span>
            </div>
            <div className="flex gap-1.5 mb-2">
              {[5, 10, 15, 30, 45].map(n => (
                <button
                  key={n}
                  onClick={() => addQuick(n)}
                  className="cut-tile flex-1 py-2.5 font-display font-semibold text-sm text-text-dim hover:text-text hover:brightness-125 transition-all"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  +{n}<span className="text-[9px] text-text-muted ml-0.5">m</span>
                </button>
              ))}
            </div>

            {/* Custom stepper — editable middle, ±5 buttons */}
            <div className="cut-tile flex items-center justify-between px-3 py-2 mb-3"
                 style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Custom</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => editMinutes(minutes - 5)}
                  className="w-7 h-7 grid place-items-center text-text-dim hover:text-text"
                  style={{ background: 'transparent', border: '1px solid var(--color-border)' }}
                  aria-label="Decrease by 5"
                >
                  −
                </button>
                <div className="flex items-baseline gap-1 min-w-[64px] justify-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={minutes}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { editMinutes(0); return; }
                      const v = parseInt(raw, 10);
                      if (Number.isFinite(v)) editMinutes(v);
                    }}
                    onFocus={e => e.target.select()}
                    className="font-display font-bold text-lg bg-transparent border-0 text-center focus:outline-none p-0 w-[3.5ch]"
                    style={{ color: 'var(--color-stat-agi)' }}
                    aria-label="Custom minutes"
                  />
                  <span className="text-text-muted text-[10px]">min</span>
                </div>
                <button
                  onClick={() => editMinutes(minutes + 5)}
                  className="w-7 h-7 grid place-items-center"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid var(--color-stat-agi)', color: 'var(--color-stat-agi)' }}
                  aria-label="Increase by 5"
                >
                  +
                </button>
              </div>
            </div>

            {/* Save + timer toggle */}
            <div className="flex gap-2">
              <div
                role="status"
                className="flex-1 p-3 rounded-md font-display font-semibold tracking-wider text-center transition-all"
                style={{
                  background: completed ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.08)',
                  border: `1px solid ${completed ? 'var(--color-stat-agi)' : 'rgba(34,197,94,0.4)'}`,
                  color: 'var(--color-stat-agi)',
                  boxShadow: completed ? '0 0 12px rgba(34,197,94,0.3)' : 'none',
                }}
              >
                {saveState === 'error' ? (
                  <button onClick={() => void flush()} className="uppercase" style={{ color: 'var(--color-stat-str)' }}>
                    Couldn&apos;t save · tap to retry
                  </button>
                ) : saveState === 'saving' ? (
                  <span className="opacity-70">SAVING…</span>
                ) : existingForCurrentMod ? (
                  <>
                    ✓ {modality} {existingForCurrentMod.minutes}M LOGGED
                    {overcharged && <span className="text-[10px] ml-2 opacity-80">+{projectedTotal - target} OVER</span>}
                  </>
                ) : (
                  <span className="opacity-70 text-sm">ADD MINUTES TO LOG {modality}</span>
                )}
              </div>
              <button
                onClick={() => setShowTimer(v => !v)}
                className="w-12 grid place-items-center rounded-md text-text-muted hover:text-text transition-colors"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                title="Use timer instead"
                aria-label="Toggle timer"
              >
                ▶
              </button>
            </div>

            {/* Timer drawer */}
            {showTimer && (
              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px dashed var(--color-border)' }}>
                <span className="font-mono-hud text-2xl tabular-nums" style={{ color: 'var(--color-stat-agi)' }}>{formatTimer(timerSeconds)}</span>
                <button
                  onClick={toggleTimer}
                  className="px-4 py-2 rounded-md text-xs font-medium tracking-wider transition-colors"
                  style={{
                    background: timerRunning ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)',
                    border: `1px solid ${timerRunning ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
                    color: timerRunning ? 'var(--color-stat-str)' : 'var(--color-stat-agi)',
                  }}
                >
                  {timerRunning ? 'STOP' : 'START'}
                </button>
              </div>
            )}
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Streak strip */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Streak</span>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--color-stat-agi)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3c2 4-2 5-2 9a4 4 0 1 0 8 0c0-3-2-5-3-7-1 2-2 2-3-2zM8 14a3 3 0 1 0 6 0c0-1-1-2-2-3-1 2-4 2-4 3z" />
                </svg>
                <span className="font-display font-bold text-base">{streak}</span>
                <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">days</span>
              </span>
            </div>
            <div className="flex gap-1">
              {strip14.map((d, i) => (
                <div
                  key={i}
                  className="cut-tile flex-1 grid place-items-center text-[9px]"
                  style={{
                    height: 28,
                    background: d.on ? 'rgba(34,197,94,0.18)' : 'var(--color-bg)',
                    border: `1px solid ${d.on ? 'var(--color-stat-agi)' : 'var(--color-border)'}`,
                    color: d.on ? 'var(--color-stat-agi)' : 'var(--color-text-muted)',
                    boxShadow: d.on ? '0 0 4px rgba(34,197,94,0.25)' : 'none',
                  }}
                >
                  {d.on ? '✓' : '·'}
                </div>
              ))}
            </div>
            <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-2">Last 14 Days</div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Lifetime totals */}
        <div className="frame-cut p-3 space-y-1.5 text-sm">
          <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-1">Total · Lifetime</div>
          <div className="flex justify-between"><span className="text-text-muted">Cardio Minutes</span><span className="font-display" style={{ color: 'var(--color-stat-agi)' }}>{totalMinutes.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Sessions</span><span className="font-display text-text">{totalSessions}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Best Streak</span><span className="font-display" style={{ color: 'var(--color-stat-vit)' }}>{bestStreak} d</span></div>
        </div>

        {/* Time by modality (only modalities you've actually logged) */}
        {byModality.length > 0 && (
          <div className="frame-cut p-3">
            <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-2">By Modality · Lifetime</div>
            <div className="space-y-2">
              {byModality.map(({ k, minutes: m }) => {
                const def = MODALITIES.find(x => x.k === k);
                const max = byModality[0].minutes;
                const pct = max > 0 ? (m / max) * 100 : 0;
                const hrs = Math.floor(m / 60);
                const min = m % 60;
                const label = hrs > 0 ? `${hrs}h ${min}m` : `${min}m`;
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-2 text-text" style={{ color: 'var(--color-stat-agi)' }}>
                        <span className="grid place-items-center w-4 h-4">{def?.icon}</span>
                        <span className="font-mono-hud text-[11px] tracking-[0.16em] font-semibold">{k}</span>
                      </span>
                      <span className="font-display text-sm" style={{ color: 'var(--color-stat-agi)' }}>{label}</span>
                    </div>
                    <div className="hud-bar hud-bar--agi">
                      <div className="hud-bar__fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <CustomTasksSection skill="AGI" />
      </main>
    </div>
  );
}
