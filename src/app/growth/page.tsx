'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getWeekStart, getCourseProgress, getSettings } from '@/lib/db';
import {
  computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP,
  getIntDailyCap, getAgiDailyCap,
} from '@/lib/logic/levels';
import { computeAgiStreak } from '@/lib/logic/streaks';
import type { StatLevel, StatType, RankRecord, Rank } from '@/types';

interface StatGrowthData {
  level: StatLevel;
  weeklyBreakdown: { weekStart: string; completed: number; total: number }[];
}

interface LiftHistory {
  exercise: string;
  entries: { date: string; weight: number }[];
}

interface PeriodStats {
  str: number;
  agi: number;
  vit: number;
  int: number;
  per: number;
}

const STAT_COLORS: Record<StatType, string> = {
  STR: 'var(--color-stat-str)',
  AGI: 'var(--color-stat-agi)',
  VIT: 'var(--color-stat-vit)',
  INT: 'var(--color-stat-int)',
  PER: 'var(--color-stat-per)',
};

const RANK_REASON_LABEL: Record<RankRecord['reason'], string> = {
  promoted:   'PROMOTED',
  demoted:    'DEMOTED',
  maintained: 'MAINTAINED',
  skipped:    'SKIPPED',
};

function fmtWeek(weekStart: string) {
  const d = new Date(weekStart + 'T12:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function GrowthPage() {
  const router = useRouter();

  const [stats, setStats] = useState<Record<StatType, StatGrowthData>>({
    STR: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    AGI: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    VIT: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    INT: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    PER: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
  });
  const [liftHistory, setLiftHistory] = useState<LiftHistory[]>([]);
  const [recent7, setRecent7] = useState<PeriodStats>({ str: 0, agi: 0, vit: 0, int: 0, per: 0 });
  const [recent30, setRecent30] = useState<PeriodStats>({ str: 0, agi: 0, vit: 0, int: 0, per: 0 });
  const [rankHistory, setRankHistory] = useState<RankRecord[]>([]);
  const [strRequired, setStrRequired] = useState(3);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const settings = await getSettings();
    const reqStr = settings.strSessionsPerWeek ?? 3;
    setStrRequired(reqStr);

    // ── Levels ──────────────────────────────────────────────────────────────
    const allStr = await db.strSessions.toArray();
    const strCompleted = allStr.filter(s => s.completed && !s.isRestDay).length;
    const strLevel = computeLevel(computeStrXP(strCompleted, 0));

    const allAgi = await db.agiLogs.toArray();
    const agiCap = getAgiDailyCap(settings.agiMinMinutes);
    const agiMinByDay = new Map<string, number>();
    for (const l of allAgi) agiMinByDay.set(l.date, (agiMinByDay.get(l.date) ?? 0) + l.minutes);
    const cappedAgiMin = [...agiMinByDay.values()].reduce((s, m) => s + Math.min(m, agiCap), 0);
    const agiStreak = await computeAgiStreak(getToday());
    const agiLevel = computeLevel(computeAgiXP(cappedAgiMin, agiStreak));

    const vitCount = (await db.vitLogs.toArray()).filter(l => l.completed).length;
    const vitLevel = computeLevel(computeVitXP(vitCount));

    const allInt = await db.intLogs.toArray();
    const intCap = getIntDailyCap(settings.learningMinutesPerDay);
    const cappedIntMin = allInt.reduce((s, l) => s + Math.min(l.learningMinutes ?? 0, intCap), 0);
    const reCourse = await getCourseProgress('real-estate');
    const intLevel = computeLevel(computeIntXP(cappedIntMin, reCourse.completedUnits));

    const saCourse = await getCourseProgress('stage-academy');
    const perLevel = computeLevel(computePerXP(saCourse.completedUnits));

    // ── 4-week breakdowns ────────────────────────────────────────────────────
    const weeks: string[] = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      weeks.push(getWeekStart(d.toISOString().split('T')[0]));
    }
    weeks.reverse();

    const strWeekly = [], agiWeekly = [], vitWeekly = [], intWeekly = [], perWeekly = [];
    for (const ws of weeks) {
      const weekEnd = new Date(ws + 'T12:00:00');
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weStr = weekEnd.toISOString().split('T')[0];

      strWeekly.push({ weekStart: ws, completed: allStr.filter(s => s.date >= ws && s.date < weStr && s.completed && !s.isRestDay).length, total: reqStr });
      agiWeekly.push({ weekStart: ws, completed: new Set(allAgi.filter(l => l.date >= ws && l.date < weStr && l.completed).map(l => l.date)).size, total: 7 });
      vitWeekly.push({ weekStart: ws, completed: (await db.vitLogs.where('date').between(ws, weStr).toArray()).filter(l => l.completed).length, total: 7 });
      intWeekly.push({ weekStart: ws, completed: allInt.filter(l => l.date >= ws && l.date < weStr && l.completed).length, total: 7 });
      perWeekly.push({ weekStart: ws, completed: (await db.perLogs.where('date').between(ws, weStr).toArray()).filter(l => l.completed).length, total: 7 });
    }

    setStats({
      STR: { level: strLevel, weeklyBreakdown: strWeekly },
      AGI: { level: agiLevel, weeklyBreakdown: agiWeekly },
      VIT: { level: vitLevel, weeklyBreakdown: vitWeekly },
      INT: { level: intLevel, weeklyBreakdown: intWeekly },
      PER: { level: perLevel, weeklyBreakdown: perWeekly },
    });

    // ── Lift history ─────────────────────────────────────────────────────────
    const corLifts = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];
    const liftData: LiftHistory[] = [];
    for (const lift of corLifts) {
      const entries: { date: string; weight: number }[] = [];
      for (const session of allStr) {
        if (!session.completed || session.isRestDay) continue;
        const ex = session.exercises.find(e => e.name === lift);
        if (!ex) continue;
        const maxWeight = Math.max(...ex.sets.filter(s => s.weight).map(s => s.weight!), 0);
        if (maxWeight > 0) entries.push({ date: session.date, weight: maxWeight });
      }
      if (entries.length > 0) liftData.push({ exercise: lift, entries });
    }
    setLiftHistory(liftData);

    // ── Last 7 days ──────────────────────────────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenStr = sevenDaysAgo.toISOString().split('T')[0];
    setRecent7({
      str: (await db.strSessions.where('date').above(sevenStr).toArray()).filter(s => s.completed && !s.isRestDay).length,
      agi: new Set((await db.agiLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).map(l => l.date)).size,
      vit: (await db.vitLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length,
      int: (await db.intLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length,
      per: (await db.perLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length,
    });

    // ── Last 30 days ─────────────────────────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];
    setRecent30({
      str: (await db.strSessions.where('date').above(thirtyStr).toArray()).filter(s => s.completed && !s.isRestDay).length,
      agi: new Set((await db.agiLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).map(l => l.date)).size,
      vit: (await db.vitLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).length,
      int: (await db.intLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).length,
      per: (await db.perLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).length,
    });

    // ── Rank history ─────────────────────────────────────────────────────────
    const rh = await db.rankHistory.orderBy('weekStart').reverse().toArray();
    setRankHistory(rh.slice(0, 12));

    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!loaded) return null;

  const statKeys: StatType[] = ['STR', 'AGI', 'VIT', 'INT', 'PER'];

  const period7 = [
    { key: 'STR', val: recent7.str, max: strRequired, label: 'sess' },
    { key: 'AGI', val: recent7.agi, max: 7, label: 'days' },
    { key: 'VIT', val: recent7.vit, max: 7, label: 'days' },
    { key: 'INT', val: recent7.int, max: 7, label: 'days' },
    { key: 'PER', val: recent7.per, max: 7, label: 'days' },
  ] as const;

  const period30 = [
    { key: 'STR', val: recent30.str, max: strRequired * 4, label: 'sess' },
    { key: 'AGI', val: recent30.agi, max: 30, label: 'days' },
    { key: 'VIT', val: recent30.vit, max: 30, label: 'days' },
    { key: 'INT', val: recent30.int, max: 30, label: 'days' },
    { key: 'PER', val: recent30.per, max: 30, label: 'days' },
  ] as const;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24 space-y-3">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <p className="text-[10px] tracking-[0.32em]" style={{ color: 'var(--color-glow-bright)' }}>‹ HUNTER ANALYTICS ›</p>
            <h1 className="font-display text-xl font-bold glow-text leading-none mt-0.5">GROWTH</h1>
          </div>
        </div>

        {/* ── Last 7 Days ───────────────────────────────────────────────────── */}
        <div className="section-heading text-text-muted">// LAST 7 DAYS</div>
        <div className="frame-cut p-4">
          <div className="grid grid-cols-5 gap-2 text-center">
            {period7.map(({ key, val, max, label }) => {
              const pct = Math.min(val / max, 1);
              const c = STAT_COLORS[key as StatType];
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <p
                    className="font-display font-bold text-lg leading-none"
                    style={{ color: c }}
                  >
                    {val}
                    <span className="text-text-muted font-normal" style={{ fontSize: 10 }}>/{max}</span>
                  </p>
                  {/* Mini bar */}
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct * 100}%`,
                        background: c,
                        boxShadow: pct >= 1 ? `0 0 4px ${c}` : 'none',
                      }}
                    />
                  </div>
                  <p className="text-text-muted text-[10px] tracking-[0.12em] uppercase">{key}</p>
                  <p className="text-text-muted" style={{ fontSize: 8 }}>{label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Last 30 Days ──────────────────────────────────────────────────── */}
        <div className="section-heading text-text-muted">// LAST 30 DAYS</div>
        <div className="frame-cut p-4">
          <div className="grid grid-cols-5 gap-2 text-center">
            {period30.map(({ key, val, max, label }) => {
              const pct = Math.min(val / max, 1);
              const c = STAT_COLORS[key as StatType];
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <p
                    className="font-display font-bold text-lg leading-none"
                    style={{ color: c }}
                  >
                    {val}
                    <span className="text-text-muted font-normal" style={{ fontSize: 10 }}>/{max}</span>
                  </p>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct * 100}%`,
                        background: c,
                        boxShadow: pct >= 1 ? `0 0 4px ${c}` : 'none',
                      }}
                    />
                  </div>
                  <p className="text-text-muted text-[10px] tracking-[0.12em] uppercase">{key}</p>
                  <p className="text-text-muted" style={{ fontSize: 8 }}>{label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Weekly Progression ────────────────────────────────────────────── */}
        <div className="section-heading text-text-muted">// WEEKLY PROGRESSION</div>
        {statKeys.map(key => {
          const data = stats[key];
          const wb = data.weeklyBreakdown;
          const delta = wb.length >= 2 ? wb[wb.length - 1].completed - wb[0].completed : 0;
          const c = STAT_COLORS[key];
          const trendArrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
          const trendColor = delta > 0 ? 'var(--color-success)' : delta < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)';

          return (
            <div key={key} className="frame-cut p-4">
              {/* Stat header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="font-display font-bold text-base"
                    style={{ color: c }}
                  >
                    {key}
                  </span>
                  <span className="text-text-muted text-[10px] tracking-[0.14em]">
                    LV.{data.level.level}
                  </span>
                </div>
                <span
                  className="font-display text-sm font-bold"
                  style={{ color: trendColor }}
                >
                  {delta > 0 ? '+' : ''}{delta} {trendArrow}
                </span>
              </div>

              {/* XP bar */}
              <div className="h-1 rounded-full overflow-hidden mb-3" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${data.level.progressPct}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${c} 40%, transparent), ${c})`,
                    boxShadow: `0 0 4px color-mix(in srgb, ${c} 60%, transparent)`,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>

              {/* 4-week rows */}
              <div className="space-y-2">
                {wb.map((w, i) => {
                  const pct = Math.round((w.completed / w.total) * 100);
                  const full = w.completed >= w.total;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-text-muted font-display" style={{ fontSize: 10, width: 36, flexShrink: 0 }}>
                        {fmtWeek(w.weekStart)}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: full ? 'var(--color-success)' : c,
                            boxShadow: full ? '0 0 4px var(--color-success)' : 'none',
                            transition: 'width 0.5s ease',
                          }}
                        />
                      </div>
                      <span
                        className="font-display text-[10px] text-right flex-shrink-0"
                        style={{ width: 28, color: full ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                      >
                        {w.completed}/{w.total}
                      </span>
                      {full && <span style={{ fontSize: 10, color: 'var(--color-success)', flexShrink: 0 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Rank History ──────────────────────────────────────────────────── */}
        {rankHistory.length > 0 && (
          <>
            <div className="section-heading text-text-muted">// RANK HISTORY</div>
            <div className="frame-cut p-2">
              {rankHistory.map((r, i) => {
                const c = `var(--color-rank-${r.rank.toLowerCase()})`;
                const reasonColor =
                  r.reason === 'promoted' ? 'var(--color-success)'
                  : r.reason === 'demoted' ? 'var(--color-danger)'
                  : r.reason === 'skipped' ? 'var(--color-text-muted)'
                  : 'var(--color-text-dim)';
                return (
                  <div
                    key={r.id ?? i}
                    className="flex items-center justify-between px-2 py-2"
                    style={{
                      borderBottom: i < rankHistory.length - 1 ? '1px dashed var(--color-border)' : 'none',
                    }}
                  >
                    {/* Week date */}
                    <span className="text-text-muted font-display" style={{ fontSize: 10, width: 38, flexShrink: 0 }}>
                      {fmtWeek(r.weekStart)}
                    </span>

                    {/* Rank letter */}
                    <div
                      className="flex items-center justify-center font-display font-bold flex-shrink-0"
                      style={{
                        width: 26, height: 26, fontSize: 13,
                        color: c,
                        border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
                        background: `color-mix(in srgb, ${c} 8%, transparent)`,
                        clipPath: 'polygon(0 4px,4px 0,100% 0,100% calc(100% - 4px),calc(100% - 4px) 100%,0 100%)',
                      }}
                    >
                      {r.rank}
                    </div>

                    {/* Completion % bar */}
                    <div className="flex-1 flex items-center gap-2 mx-3">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${r.completionPct}%`,
                            background: r.completionPct >= 80 ? 'var(--color-success)' : r.completionPct >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
                          }}
                        />
                      </div>
                      <span className="text-text-muted font-display" style={{ fontSize: 10, width: 28, textAlign: 'right', flexShrink: 0 }}>
                        {r.completionPct}%
                      </span>
                    </div>

                    {/* Reason chip */}
                    <span
                      className="font-display tracking-[0.12em]"
                      style={{ fontSize: 9, color: reasonColor, flexShrink: 0 }}
                    >
                      {RANK_REASON_LABEL[r.reason]}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Lift Progression ──────────────────────────────────────────────── */}
        {liftHistory.length > 0 && (
          <>
            <div className="section-heading text-text-muted">// LIFT PROGRESSION</div>
            <div className="frame-cut p-4">
              {liftHistory.map(lift => {
                const entries = lift.entries.slice(-12);
                const max = Math.max(...lift.entries.map(x => x.weight));
                const first = lift.entries[0]?.weight ?? 0;
                const last = lift.entries[lift.entries.length - 1]?.weight ?? 0;
                const improved = last > first;
                return (
                  <div key={lift.exercise} className="mb-5 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <p
                        className="font-display font-semibold text-sm"
                        style={{ color: 'var(--color-stat-str)' }}
                      >
                        {lift.exercise.toUpperCase()}
                      </p>
                      {first > 0 && last > 0 && (
                        <span
                          className="font-display text-[10px]"
                          style={{ color: improved ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                        >
                          {first} → {last} lbs {improved ? '↑' : '→'}
                        </span>
                      )}
                    </div>
                    {/* Bar chart */}
                    <div className="flex items-end gap-1" style={{ height: 56 }}>
                      {entries.map((e, i) => {
                        const pct = max > 0 ? (e.weight / max) * 100 : 0;
                        return (
                          <div
                            key={i}
                            className="flex-1 rounded-t"
                            style={{
                              height: `${Math.max(pct, 6)}%`,
                              background: `color-mix(in srgb, var(--color-stat-str) 35%, var(--color-surface-light))`,
                              boxShadow: i === entries.length - 1 ? '0 0 6px var(--color-stat-str)' : 'none',
                            }}
                            title={`${e.date}: ${e.weight} lbs`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1" style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                      <span>{entries[0]?.date.slice(5)}</span>
                      <span>{entries[entries.length - 1]?.date.slice(5)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </main>
    </div>
  );
}
