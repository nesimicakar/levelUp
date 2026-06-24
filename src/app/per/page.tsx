'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, getSettings } from '@/lib/db';
import { getLoggableDates } from '@/lib/utils/dates';
import { computeLevel, computePerXP } from '@/lib/logic/levels';
import { isPerComplete } from '@/lib/logic/per';
import { LogDateToggle } from '@/components/LogDateToggle';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import { getCourseProgress } from '@/lib/db';
import type { PerLog, NafileLog, StatLevel, UserSettings, ActiveBook } from '@/types';

const NAFILE_PRAYERS = [
  { id: 'evvabin',  label: 'Evvâbin' },
  { id: 'kusluk',   label: 'Kuşluk (Duhâ)' },
  { id: 'teheccud', label: 'Teheccüd' },
] as const;

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export default function PerPage() {
  const router = useRouter();
  const { today, yesterday } = getLoggableDates();
  const [logDate, setLogDate] = useState(today);

  const [todayLog, setTodayLog] = useState<PerLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [readingMinutes, setReadingMinutes] = useState(0);
  const [prayers, setPrayers] = useState(0);
  const [quranPages, setQuranPages] = useState(0);
  const [last7, setLast7] = useState<{ date: string; on: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nafileLog, setNafileLog] = useState<NafileLog | null>(null);
  const [nafilePrayerState, setNafilePrayerState] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);

    const existing = await db.perLogs.where('date').equals(logDate).first();
    if (existing) {
      setTodayLog(existing);
      setReadingMinutes(existing.readingMinutes ?? 0);
      setPrayers(existing.prayersCount ?? 0);
      setQuranPages(existing.quranPages ?? 0);
    } else {
      setTodayLog(null);
      setReadingMinutes(0);
      setPrayers(0);
      setQuranPages(0);
    }

    const cp = await getCourseProgress('stage-academy');
    setLevel(computeLevel(computePerXP(cp.completedUnits)));

    // 7-day cadence: last 7 days ending today, mark days where reading target was met
    const target = s.dailyReadingMinutesTarget ?? 5;
    const sevenAgo = addDays(logDate, -6);
    const recent = await db.perLogs.where('date').between(sevenAgo, logDate, true, true).toArray();
    const byDate = new Map<string, PerLog>();
    for (const r of recent) byDate.set(r.date, r);
    const cadence: { date: string; on: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(logDate, -i);
      const log = byDate.get(d);
      const on = (log?.readingMinutes ?? 0) >= target;
      cadence.push({ date: d, on });
    }
    setLast7(cadence);

    const nafile = await db.nafileLogs.where('date').equals(logDate).first();
    setNafileLog(nafile ?? null);
    setNafilePrayerState(nafile?.prayers ?? {});

    setLoaded(true);
  }, [logDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!yesterday) return;
    Promise.all([
      db.perLogs.where('date').equals(today).first(),
      db.perLogs.where('date').equals(yesterday).first(),
    ]).then(([todayEntry, yesterdayEntry]) => {
      if (!todayEntry && yesterdayEntry) setLogDate(yesterday);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist a field change immediately. The reading/prayers/quran +/- and
  // quick-add buttons all flow through this — no separate save button.
  const persistFields = useCallback(async (
    next: { readingMinutes?: number; prayersCount?: number; quranPages?: number },
  ) => {
    if (!settings) return;
    const merged: Partial<PerLog> = {
      readingMinutes,
      prayersCount: prayers,
      quranPages,
      ...next,
    };
    if (todayLog?.id) {
      await db.perLogs.update(todayLog.id, {
        ...next,
        completed: isPerComplete(merged, settings),
      });
    } else {
      const log: PerLog = {
        date: logDate,
        lessonsCompleted: 0,
        readingMinutes: merged.readingMinutes ?? 0,
        prayersCount: merged.prayersCount ?? 0,
        quranPages: merged.quranPages ?? 0,
        completed: false,
        createdAt: Date.now(),
      };
      log.completed = isPerComplete(log, settings);
      await db.perLogs.add(log);
    }
    await loadData();
  }, [settings, todayLog, readingMinutes, prayers, quranPages, logDate, loadData]);

  const bumpReading = (delta: number) => {
    const next = Math.max(0, Math.min(300, readingMinutes + delta));
    setReadingMinutes(next);
    persistFields({ readingMinutes: next });
  };

  const bumpPrayers = (delta: number) => {
    const next = Math.max(0, Math.min(20, prayers + delta));
    setPrayers(next);
    persistFields({ prayersCount: next });
  };

  const bumpQuran = (delta: number) => {
    const next = Math.max(0, Math.min(100, quranPages + delta));
    setQuranPages(next);
    persistFields({ quranPages: next });
  };

  const toggleNafilePrayer = useCallback(async (id: string) => {
    const next = { ...nafilePrayerState, [id]: !nafilePrayerState[id] };
    setNafilePrayerState(next);
    if (nafileLog?.id) {
      await db.nafileLogs.update(nafileLog.id, { prayers: next });
      setNafileLog({ ...nafileLog, prayers: next });
    } else {
      const newId = await db.nafileLogs.add({ date: logDate, prayers: next, createdAt: Date.now() });
      setNafileLog({ id: newId as number, date: logDate, prayers: next, createdAt: Date.now() });
    }
  }, [nafilePrayerState, nafileLog, logDate]);

  if (!loaded || !settings) return null;

  const spiritualityEnabled = settings.enableSpirituality ?? false;
  const readingTarget = settings.dailyReadingMinutesTarget ?? 5;
  const quranTarget = settings.quranPagesPerDay;
  const readingMet = readingMinutes >= readingTarget;
  const prayersMet = prayers >= 5;
  const quranMet = quranPages >= quranTarget;
  const checkCount = spiritualityEnabled
    ? [readingMet, prayersMet, quranMet].filter(Boolean).length
    : [readingMet].filter(Boolean).length;
  const checkTotal = spiritualityEnabled ? 3 : 1;
  const allMet = checkCount === checkTotal;

  // Currently reading: pick the active book most recently engaged with (or simply the first one)
  const activeBooks = settings.activeBooks ?? [];
  const currentlyReading: ActiveBook | null = activeBooks.length > 0
    ? activeBooks.reduce((latest, b) => ((b.startedAt ?? 0) > (latest.startedAt ?? 0) ? b : latest), activeBooks[0])
    : null;
  const currentBookPct = currentlyReading?.totalPages && currentlyReading.totalPages > 0
    ? Math.min(100, Math.round(((currentlyReading.currentPage ?? 0) / currentlyReading.totalPages) * 100))
    : null;

  // Hero ring geometry (spirituality off path)
  const ringSize = 150;
  const ringStroke = 7;
  const ringR = (ringSize - ringStroke) / 2;
  const ringC = 2 * Math.PI * ringR;
  const ringPct = Math.min(100, (readingMinutes / Math.max(readingTarget, 1)) * 100);
  const ringOff = ringC - (ringPct / 100) * ringC;
  const ringColor = readingMet ? 'var(--color-stat-agi)' : 'var(--color-stat-per)';

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
                className="font-display text-xl font-bold leading-none"
                style={{ color: 'var(--color-stat-per)', textShadow: '0 0 10px rgba(167,139,250,0.5)' }}
              >
                PER // PERCEPTION
              </h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Domain of Spirit</p>
            </div>
          </div>
          <div
            className="font-display font-bold text-3xl flex-shrink-0 leading-none"
            style={{ color: 'var(--color-stat-per)', textShadow: '0 0 10px rgba(167,139,250,0.5)' }}
          >
            {level.level}
          </div>
        </div>

        <LogDateToggle value={logDate} today={today} yesterday={yesterday} onChange={setLogDate} />

        {/* Level / XP with done/total today badge */}
        <div className="frame-bracketed">
          <div className="frame-cut p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">
                LEVEL {level.level} → {level.level + 1}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm" style={{ color: 'var(--color-stat-per)' }}>
                  {level.currentXP} / {level.xpToNext} XP
                </span>
                <span
                  className="cut-tile px-2 py-0.5 font-mono-hud text-[10px] font-bold tracking-[0.14em]"
                  style={{
                    color: allMet ? 'var(--color-stat-agi)' : 'var(--color-stat-per)',
                    background: allMet ? 'rgba(34,197,94,0.10)' : 'rgba(167,139,250,0.10)',
                    border: `1px solid ${allMet ? 'var(--color-stat-agi)' : 'var(--color-stat-per)'}`,
                  }}
                >
                  {checkCount}/{checkTotal} TODAY
                </span>
              </div>
            </div>
            <div className="hud-bar hud-bar--per mt-2">
              <div className="hud-bar__fill" style={{ width: `${level.progressPct}%` }} />
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Section heading */}
        <div className="section-heading mt-2" style={{ color: 'var(--color-stat-per)' }}>
          // TODAY · {spiritualityEnabled ? `${checkCount} / 3 PROTOCOLS` : 'READING'}
        </div>

        {spiritualityEnabled ? (
          // ── SPIRITUALITY ON: Direction B vertical protocol stack ─────────────
          <>
            {/* MINUTES READ — protocol block with progress bar + quick add */}
            <ProtocolBlock
              label="MINUTES READ"
              value={readingMinutes}
              target={readingTarget}
              done={readingMet}
              sublabel={readingMet ? '✓ Target met' : `${Math.max(0, readingTarget - readingMinutes)} min remaining`}
            >
              <div className="hud-bar hud-bar--per mb-2.5">
                <div className="hud-bar__fill" style={{ width: `${Math.min(100, (readingMinutes / readingTarget) * 100)}%` }} />
              </div>
              <QuickAddRow onAdd={bumpReading} />
            </ProtocolBlock>

            {/* PRAYERS */}
            <ProtocolBlock
              label="PRAYERS"
              value={prayers}
              target={5}
              done={prayersMet}
              sublabel={prayersMet ? '✓ All completed' : `${5 - prayers} remaining`}
            >
              <div className="flex gap-1 mb-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{
                      height: 6,
                      background: i < prayers ? 'var(--color-stat-per)' : 'transparent',
                      border: `1px solid ${i < prayers ? 'var(--color-stat-per)' : 'var(--color-border)'}`,
                      boxShadow: i < prayers ? '0 0 4px rgba(167,139,250,0.5)' : 'none',
                    }}
                  />
                ))}
              </div>
              <Stepper onMinus={() => bumpPrayers(-1)} onPlus={() => bumpPrayers(1)} disabledMinus={prayers <= 0} done={prayersMet} />
            </ProtocolBlock>

            {/* QURAN */}
            <ProtocolBlock
              label="QURAN PAGES"
              value={quranPages}
              target={quranTarget}
              done={quranMet}
              sublabel={quranMet ? '✓ Target met' : `${Math.max(0, quranTarget - quranPages)} to target`}
            >
              <Stepper onMinus={() => bumpQuran(-1)} onPlus={() => bumpQuran(1)} disabledMinus={quranPages <= 0} done={quranMet} />
            </ProtocolBlock>

            <CurrentlyReading book={currentlyReading} pct={currentBookPct} />
            <RecallLink />
          </>
        ) : (
          // ── SPIRITUALITY OFF: Direction A reading hero ─────────────
          <>
            <div
              className="frame-bracketed"
              style={{ filter: 'drop-shadow(0 0 12px rgba(167,139,250,0.18))' }}
            >
              <div className="frame-cut p-4">
                <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
                  {/* Ring */}
                  <div className="relative" style={{ width: ringSize, height: ringSize }}>
                    <svg width={ringSize} height={ringSize}>
                      <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="var(--color-border)" strokeWidth={ringStroke} />
                      <circle
                        cx={ringSize / 2} cy={ringSize / 2} r={ringR}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={ringStroke}
                        strokeLinecap="round"
                        strokeDasharray={ringC}
                        strokeDashoffset={ringOff}
                        transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                        style={{ filter: `drop-shadow(0 0 6px ${ringColor})`, transition: 'stroke-dashoffset 0.4s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div
                        className="font-display font-bold text-4xl leading-none"
                        style={{ color: ringColor, textShadow: `0 0 12px ${ringColor === 'var(--color-stat-agi)' ? 'rgba(34,197,94,0.5)' : 'rgba(167,139,250,0.5)'}` }}
                      >
                        {readingMinutes}
                      </div>
                      <div className="text-text-muted text-[9px] tracking-[0.18em] uppercase mt-1">of {readingTarget} min</div>
                    </div>
                  </div>

                  {/* Side panel */}
                  <div>
                    <div className="font-display font-semibold text-text text-sm mb-1">READING</div>
                    <div className="text-text-muted text-[9px] tracking-[0.16em] uppercase mb-3">
                      {readingMet ? '✓ Target met' : `${Math.max(0, readingTarget - readingMinutes)} min to target`}
                    </div>
                    <QuickAddRow onAdd={bumpReading} compact />
                  </div>
                </div>
              </div>
              <span className="frame-bracket-bottom" aria-hidden />
            </div>

            <CurrentlyReading book={currentlyReading} pct={currentBookPct} />
            <RecallLink />

            {/* 7-day cadence */}
            <div className="frame-cut p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="section-heading text-text-dim">// 7-DAY CADENCE</span>
                <span className="font-display font-bold text-xs" style={{ color: 'var(--color-stat-per)' }}>
                  {last7.filter(d => d.on).length} / 7
                </span>
              </div>
              <div className="flex gap-1.5">
                {last7.map((d, i) => (
                  <div key={i} className="flex-1">
                    <div
                      className="cut-tile grid place-items-center transition-colors"
                      style={{
                        height: 36,
                        background: d.on ? 'rgba(167,139,250,0.18)' : 'var(--color-bg)',
                        border: `1px solid ${d.on ? 'var(--color-stat-per)' : 'var(--color-border)'}`,
                        boxShadow: d.on ? '0 0 4px rgba(167,139,250,0.25)' : 'none',
                      }}
                    >
                      {d.on && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-stat-per)' }}>
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </div>
                    <div className="text-center mt-1 font-mono-hud text-[9px] text-text-muted">
                      {DAY_LABELS[new Date(d.date + 'T12:00:00').getDay()]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {spiritualityEnabled && (
          <NafilePrayersSection prayers={nafilePrayerState} onToggle={toggleNafilePrayer} />
        )}

        <CustomTasksSection skill="PER" />
      </main>
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

interface ProtocolBlockProps {
  label: string;
  value: number;
  target: number;
  done: boolean;
  sublabel: string;
  children?: React.ReactNode;
}

function ProtocolBlock({ label, value, target, done, sublabel, children }: ProtocolBlockProps) {
  const accent = done ? 'var(--color-stat-agi)' : 'var(--color-stat-per)';
  const accentGlow = done ? 'rgba(34,197,94,0.5)' : 'rgba(167,139,250,0.5)';
  return (
    <div
      className="frame-bracketed"
      style={done ? { filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.18))' } : undefined}
    >
      <div
        className="frame-cut p-3"
        style={{ background: done ? 'rgba(34,197,94,0.04)' : undefined }}
      >
        <div className="flex items-end justify-between mb-2.5 gap-3">
          <div className="min-w-0">
            <div className="font-display font-semibold text-sm text-text tracking-[0.04em]">{label}</div>
            <div className="text-[10px] tracking-[0.14em] uppercase mt-0.5" style={{ color: done ? 'var(--color-stat-agi)' : 'var(--color-text-muted)' }}>
              {sublabel}
            </div>
          </div>
          <div
            className="font-display font-bold text-2xl leading-none flex-shrink-0"
            style={{ color: accent, textShadow: `0 0 10px ${accentGlow}` }}
          >
            {value}<span className="text-text-muted text-sm ml-1">/{target}</span>
          </div>
        </div>
        {children}
      </div>
      <span className="frame-bracket-bottom" aria-hidden />
    </div>
  );
}

interface StepperProps {
  onMinus: () => void;
  onPlus: () => void;
  disabledMinus?: boolean;
  done?: boolean;
}

function Stepper({ onMinus, onPlus, disabledMinus, done }: StepperProps) {
  const accent = done ? 'var(--color-stat-agi)' : 'var(--color-stat-per)';
  const accentBg = done ? 'rgba(34,197,94,0.15)' : 'rgba(167,139,250,0.15)';
  return (
    <div className="flex gap-1.5 justify-end">
      <button
        onClick={onMinus}
        disabled={disabledMinus}
        className="cut-tile w-8 h-8 grid place-items-center font-mono-hud text-base leading-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
        aria-label="Decrease"
      >
        −
      </button>
      <button
        onClick={onPlus}
        className="cut-tile w-8 h-8 grid place-items-center font-mono-hud text-base leading-none transition-colors hover:brightness-125"
        style={{ background: accentBg, border: `1px solid ${accent}`, color: accent }}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

interface QuickAddRowProps {
  onAdd: (m: number) => void;
  compact?: boolean;
}

function QuickAddRow({ onAdd, compact }: QuickAddRowProps) {
  const values = compact ? [5, 10, 15, 30] : [5, 10, 15, 30, 45];
  return (
    <div className="flex gap-1.5 flex-wrap items-stretch">
      {/* Subtle subtract button — for correcting overshoot */}
      <button
        onClick={() => onAdd(-5)}
        className="cut-tile font-mono-hud transition-colors hover:brightness-125"
        style={{
          flex: '0 0 auto',
          padding: compact ? '6px 8px' : '8px 10px',
          background: 'transparent',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          fontSize: compact ? 12 : 13,
        }}
        aria-label="Subtract 5 minutes"
      >
        −5
      </button>
      {values.map(m => (
        <button
          key={m}
          onClick={() => onAdd(m)}
          className="cut-tile font-display font-semibold transition-colors hover:brightness-125"
          style={{
            flex: compact ? '0 0 auto' : 1,
            padding: compact ? '6px 10px' : '8px 0',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-dim)',
            fontSize: compact ? 12 : 13,
          }}
        >
          +{m}<span className="text-[9px] text-text-muted ml-0.5">m</span>
        </button>
      ))}
    </div>
  );
}

function RecallLink() {
  return (
    <Link
      href="/recall"
      className="cut-tile grid items-center gap-3 px-3 py-3 hover:brightness-110 transition-colors"
      style={{
        gridTemplateColumns: 'auto 1fr auto',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 28, height: 38,
          background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.35)',
          boxShadow: '0 0 6px rgba(167,139,250,0.15)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(167,139,250,0.85)' }} aria-hidden>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
          <path d="M12 8v4l3 3" />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="text-[8px] tracking-[0.16em] uppercase text-text-muted mb-0.5">// MEMORY REINFORCEMENT</div>
        <div className="font-display font-semibold text-sm text-text">RECALL</div>
      </div>
      <span className="font-mono-hud text-[9px] tracking-[0.14em] text-text-muted flex-shrink-0">OPEN →</span>
    </Link>
  );
}

interface CurrentlyReadingProps {
  book: ActiveBook | null;
  pct: number | null;
}

interface NafilePrayersSectionProps {
  prayers: Record<string, boolean>;
  onToggle: (id: string) => void;
}

function NafilePrayersSection({ prayers, onToggle }: NafilePrayersSectionProps) {
  return (
    <div className="frame-cut p-3">
      <div className="section-heading text-text-dim mb-3">// NAFILE</div>
      <div className="flex flex-col gap-2.5">
        {NAFILE_PRAYERS.map(p => {
          const checked = !!prayers[p.id];
          return (
            <button
              key={p.id}
              onClick={() => onToggle(p.id)}
              className="flex items-center gap-3 w-full text-left transition-colors hover:brightness-110"
            >
              <div
                className="flex-shrink-0 w-5 h-5 grid place-items-center"
                style={{
                  border: `1px solid ${checked ? 'var(--color-stat-per)' : 'var(--color-border)'}`,
                  background: checked ? 'rgba(167,139,250,0.12)' : 'transparent',
                  boxShadow: checked ? '0 0 4px rgba(167,139,250,0.25)' : 'none',
                }}
              >
                {checked && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-stat-per)' }}>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </div>
              <span
                className="font-display text-sm"
                style={{ color: checked ? 'var(--color-stat-per)' : 'var(--color-text-dim)' }}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CurrentlyReading({ book, pct }: CurrentlyReadingProps) {
  return (
    <Link
      href="/books"
      className="cut-tile grid items-center gap-3 px-3 py-3 hover:brightness-110 transition-colors"
      style={{
        gridTemplateColumns: 'auto 1fr auto',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* book spine icon */}
      <div
        className="relative flex-shrink-0"
        style={{
          width: 28, height: 38,
          background: 'linear-gradient(180deg, rgba(167,139,250,0.3) 0%, rgba(167,139,250,0.08) 100%)',
          border: '1px solid var(--color-stat-per)',
          boxShadow: '0 0 6px rgba(167,139,250,0.25)',
        }}
      >
        <div className="absolute left-1 right-1 h-px" style={{ top: 6, background: 'var(--color-stat-per)', opacity: 0.4 }} />
        <div className="absolute left-1 right-1 h-px" style={{ bottom: 6, background: 'var(--color-stat-per)', opacity: 0.4 }} />
      </div>
      <div className="min-w-0">
        <div className="text-[8px] tracking-[0.16em] uppercase text-text-muted mb-0.5">// CURRENTLY READING</div>
        {book ? (
          <>
            <div className="font-display font-semibold text-sm text-text truncate">{book.title}</div>
            {pct !== null && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-0.5 relative" style={{ background: 'var(--color-border)' }}>
                  <div
                    className="absolute left-0 top-0 bottom-0"
                    style={{ width: `${pct}%`, background: 'var(--color-stat-per)', boxShadow: '0 0 4px rgba(167,139,250,0.6)' }}
                  />
                </div>
                <span className="font-mono-hud text-[9px]" style={{ color: 'var(--color-stat-per)' }}>{pct}%</span>
              </div>
            )}
          </>
        ) : (
          <div className="font-display text-sm text-text-muted">No active book</div>
        )}
      </div>
      <span className="font-mono-hud text-[9px] tracking-[0.14em] text-text-muted flex-shrink-0">LIBRARY →</span>
    </Link>
  );
}
