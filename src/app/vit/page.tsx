'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, getSettings } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { computeLevel, computeVitXP } from '@/lib/logic/levels';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import { LogDateToggle } from '@/components/LogDateToggle';
import { PostureRoutine } from '@/components/PostureRoutine';
import { POSTURE_MIN_MINUTES, saveVitLog } from '@/lib/logic/vit';
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const logDateRef = useRef(logDate);
  logDateRef.current = logDate;
  // Writes run one at a time so rapid taps can't create duplicate rows for a date.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const loadData = useCallback(async () => {
    setSaveState('idle');
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

  // Refreshes derived stats only. Never touches the tick/sleep inputs, so a reload
  // landing after a second tap can't overwrite it.
  const refreshStats = useCallback(async (date: string) => {
    const [row, all] = await Promise.all([
      db.vitLogs.where('date').equals(date).first(),
      db.vitLogs.toArray(),
    ]);
    if (date !== logDateRef.current) return; // user switched day meanwhile
    setTodayLog(row ?? null);
    setLevel(computeLevel(computeVitXP(all.filter(l => l.completed).length)));
    const sevenAgo = addDays(date, -6);
    setLast7(all.filter(l => l.date >= sevenAgo && l.date <= date));
  }, []);

  // Every change is saved immediately (no separate save step to forget).
  const persist = (next: { sleepHours: number; proteinMet: boolean; postureMet: boolean }) => {
    const date = logDate;
    setSaveState('saving');
    saveQueue.current = saveQueue.current
      .then(async () => {
        await saveVitLog(date, next);
        await refreshStats(date);
        setSaveState('saved');
      })
      .catch(err => {
        console.error('[VIT] save failed:', err);
        setSaveState('error');
      });
  };

  const adjustSleep = (delta: number) => {
    const next = Math.max(0, Math.min(24, +(sleepHours + delta).toFixed(1)));
    if (next === sleepHours) return;
    setSleepHours(next);
    persist({ sleepHours: next, proteinMet, postureMet });
  };

  const toggleProtein = () => {
    const next = !proteinMet;
    setProteinMet(next);
    persist({ sleepHours, proteinMet: next, postureMet });
  };

  const togglePosture = () => {
    const next = !postureMet;
    setPostureMet(next);
    persist({ sleepHours, proteinMet, postureMet: next });
  };

  if (!loaded || !settings) return null;

  const sleepMet = sleepHours >= 7;
  const checkCount = [sleepMet, proteinMet, postureMet].filter(Boolean).length;
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

        {/* Today summary: count, progress, how-to, and save status in one card */}
        <div className="frame-bracketed mt-2">
          <div className="frame-cut p-3 flex items-center gap-4">
            <div className="flex items-baseline flex-shrink-0 leading-none" aria-label={`${checkCount} of 3 protocols complete`}>
              <span
                className="font-display font-bold"
                style={{
                  fontSize: 44,
                  color: checkCount === 3 ? 'var(--color-stat-vit)' : 'var(--color-text)',
                  textShadow: checkCount === 3 ? '0 0 12px rgba(234,179,8,0.5)' : 'none',
                }}
              >
                {checkCount}
              </span>
              <span className="font-display font-bold text-lg text-text-muted ml-0.5">/3</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] tracking-[0.18em] uppercase font-semibold" style={{ color: 'var(--color-stat-vit)' }}>
                  Today&apos;s Protocol
                </span>
                <span
                  role="status"
                  className="text-[9px] tracking-[0.14em] uppercase"
                  style={{ color: saveState === 'error' ? 'var(--color-stat-str)' : 'var(--color-text-muted)' }}
                >
                  {saveState === 'saving' && 'Saving…'}
                  {saveState === 'saved' && '✓ Saved'}
                  {saveState === 'error' && 'Couldn’t save. Tap again'}
                  {saveState === 'idle' && (todayLog ? '✓ Saved' : '')}
                </span>
              </div>
              <div className="flex gap-1 mb-2" aria-hidden>
                {[sleepMet, proteinMet, postureMet].map((on, i) => (
                  <div
                    key={i}
                    className="flex-1 h-1.5 rounded-sm"
                    style={{
                      background: on ? 'var(--color-stat-vit)' : 'var(--color-border)',
                      boxShadow: on ? '0 0 6px rgba(234,179,8,0.45)' : 'none',
                    }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-text-muted leading-snug">
                Set last night&apos;s sleep, then tick what you&apos;ve done. Saves automatically.
              </p>
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* SLEEP */}
        <ProtocolFrame
          symbol="z"
          label="SLEEP"
          target="Last night · ≥ 7.0 hours"
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
        <ProtocolFrame
          symbol="▲"
          label="PROTEIN"
          target={`Tick once you hit ${settings.proteinGoalGrams} g`}
          met={proteinMet}
          checkbox
          onToggle={toggleProtein}
        />

        {/* POSTURE */}
        <ProtocolFrame
          symbol="↻"
          label="POSTURE"
          target={`Tick after ${POSTURE_MIN_MINUTES} min of posture work`}
          met={postureMet}
          checkbox
          onToggle={togglePosture}
          footer={<PostureRoutine settings={settings} />}
        />

        {/* Save */}
        {/* Week rolling averages */}
        <div className="frame-cut p-3 space-y-1.5 text-sm mt-2">
          <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mb-1">Week · Rolling Avg</div>
          <div className="flex justify-between"><span className="text-text-muted">Sleep</span><span className="font-display" style={{ color: sleepAvg >= 7 ? 'var(--color-stat-agi)' : 'var(--color-text)' }}>{sleepAvg.toFixed(1)} h</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Protein hit-rate</span><span className="font-display text-text">{proteinHits} / {Math.max(last7.length, 1)} d</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Posture hit-rate</span><span className="font-display" style={{ color: mobilityHits < 4 ? 'var(--color-stat-str)' : 'var(--color-text)' }}>{mobilityHits} / {Math.max(last7.length, 1)} d</span></div>
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
  /** Renders a tick box on the right instead of custom children. */
  checkbox?: boolean;
  children?: React.ReactNode;
  /** Makes the top row tappable (toggle) without making `footer` part of the tap target. */
  onToggle?: () => void;
  /** Extra content rendered inside the same frame, under the main row. */
  footer?: React.ReactNode;
}

function ProtocolFrame({ symbol, label, target, met, checkbox, children, onToggle, footer }: ProtocolFrameProps) {
  const Row = onToggle ? 'button' : 'div';
  return (
    <div className={`frame-bracketed ${met ? '' : 'opacity-90'}`}>
      <div className="frame-cut p-3">
        <Row
          {...(onToggle ? { type: 'button' as const, onClick: onToggle, 'aria-pressed': met } : {})}
          className={`flex items-center justify-between gap-3 w-full ${onToggle ? 'text-left' : ''}`}
        >
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
          {checkbox ? (
            <div
              aria-hidden
              className="cut-tile grid place-items-center font-display font-bold text-lg flex-shrink-0"
              style={{
                width: 32, height: 32,
                background: met ? 'rgba(234,179,8,0.18)' : 'transparent',
                border: `1.5px solid ${met ? 'var(--color-stat-vit)' : 'var(--color-text-muted)'}`,
                color: 'var(--color-stat-vit)',
              }}
            >
              {met ? '✓' : ''}
            </div>
          ) : (
            children
          )}
        </Row>
        {footer && <div className="mt-3 pt-1 border-t border-border">{footer}</div>}
      </div>
      <span className="frame-bracket-bottom" aria-hidden />
    </div>
  );
}
