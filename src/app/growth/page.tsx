'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getWeekStart, getCourseProgress, getSettings } from '@/lib/db';
import { computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP, getIntDailyCap, getAgiDailyCap } from '@/lib/logic/levels';
import { computeAgiStreak } from '@/lib/logic/streaks';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import type { StatLevel, StatType } from '@/types';

interface StatGrowthData {
  level: StatLevel;
  weeklyBreakdown: { weekStart: string; completed: number; total: number }[];
}

interface LiftHistory {
  exercise: string;
  entries: { date: string; weight: number }[];
}

export default function GrowthPage() {
  const [stats, setStats] = useState<Record<StatType, StatGrowthData>>({
    STR: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    AGI: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    VIT: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    INT: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
    PER: { level: { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 }, weeklyBreakdown: [] },
  });
  const [liftHistory, setLiftHistory] = useState<LiftHistory[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const settings = await getSettings();

    // Compute levels
    const allStr = await db.strSessions.toArray();
    const strCompleted = allStr.filter(s => s.completed && !s.isRestDay).length;
    const strLevel = computeLevel(computeStrXP(strCompleted, 0));

    const allAgi = await db.agiLogs.toArray();
    const agiCap = getAgiDailyCap(settings.agiMinMinutes);
    const cappedAgiMin = allAgi.reduce((s, l) => s + Math.min(l.minutes, agiCap), 0);
    const agiStreak = await computeAgiStreak();
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

    // Build weekly breakdowns (last 4 weeks)
    const weeks: string[] = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      weeks.push(getWeekStart(d.toISOString().split('T')[0]));
    }
    weeks.reverse();

    const strWeekly = [];
    const agiWeekly = [];
    const vitWeekly = [];
    const intWeekly = [];
    const perWeekly = [];

    for (const ws of weeks) {
      const weekEnd = new Date(ws + 'T12:00:00');
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weStr = weekEnd.toISOString().split('T')[0];

      const sCount = allStr.filter(s => s.date >= ws && s.date < weStr && s.completed && !s.isRestDay).length;
      strWeekly.push({ weekStart: ws, completed: sCount, total: 4 });

      const aDays = allAgi.filter(l => l.date >= ws && l.date < weStr && l.completed).length;
      agiWeekly.push({ weekStart: ws, completed: aDays, total: 7 });

      const vDays = (await db.vitLogs.where('date').between(ws, weStr).toArray()).filter(l => l.completed).length;
      vitWeekly.push({ weekStart: ws, completed: vDays, total: 7 });

      const iDays = allInt.filter(l => l.date >= ws && l.date < weStr && l.completed).length;
      intWeekly.push({ weekStart: ws, completed: iDays, total: 7 });

      const pDays = (await db.perLogs.where('date').between(ws, weStr).toArray()).filter(l => l.completed).length;
      perWeekly.push({ weekStart: ws, completed: pDays, total: 7 });
    }

    setStats({
      STR: { level: strLevel, weeklyBreakdown: strWeekly },
      AGI: { level: agiLevel, weeklyBreakdown: agiWeekly },
      VIT: { level: vitLevel, weeklyBreakdown: vitWeekly },
      INT: { level: intLevel, weeklyBreakdown: intWeekly },
      PER: { level: perLevel, weeklyBreakdown: perWeekly },
    });

    // Lift history for STR
    const corLifts = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];
    const liftData: LiftHistory[] = [];
    for (const lift of corLifts) {
      const entries: { date: string; weight: number }[] = [];
      for (const session of allStr) {
        if (!session.completed || session.isRestDay) continue;
        const ex = session.exercises.find(e => e.name === lift);
        if (!ex) continue;
        const maxWeight = Math.max(...ex.sets.filter(s => s.weight).map(s => s.weight!), 0);
        if (maxWeight > 0) {
          entries.push({ date: session.date, weight: maxWeight });
        }
      }
      if (entries.length > 0) {
        liftData.push({ exercise: lift, entries });
      }
    }
    setLiftHistory(liftData);

    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!loaded) return null;

  const statKeys: StatType[] = ['STR', 'AGI', 'VIT', 'INT', 'PER'];

  return (
    <div>
      <PageHeader title="STATUS HISTORY" subtitle="Growth & Trends" />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {statKeys.map(key => {
          const data = stats[key];
          const wb = data.weeklyBreakdown;
          const delta = wb.length >= 2 ? wb[wb.length - 1].completed - wb[0].completed : 0;
          const trend = delta > 0 ? { arrow: '\u2191', color: 'text-success' }
            : delta < 0 ? { arrow: '\u2193', color: 'text-danger' }
            : { arrow: '\u2192', color: 'text-text-muted' };
          return (
            <div key={key} className="stat-card rounded-lg p-4 glow-border animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-glow font-bold">{key}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${trend.color}`}>
                    {delta > 0 ? '+' : ''}{delta} {trend.arrow}
                  </span>
                  <span className="text-text-dim text-sm">Lv.{data.level.level}</span>
                </div>
              </div>
              <ProgressBar value={data.level.progressPct} className="mb-3" />
              <div className="space-y-1">
                {data.weeklyBreakdown.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted w-20">{w.weekStart.slice(5)}</span>
                    <div className="flex-1">
                      <ProgressBar
                        value={Math.round((w.completed / w.total) * 100)}
                        height="h-1.5"
                        variant={w.completed === w.total ? 'success' : 'default'}
                      />
                    </div>
                    <span className="text-text-dim w-8 text-right">{w.completed}/{w.total}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Lift chart for STR */}
        {liftHistory.length > 0 && (
          <div className="stat-card rounded-lg p-4 glow-border">
            <h3 className="text-sm font-medium text-text-dim mb-3">LIFT PROGRESSION</h3>
            {liftHistory.map(lift => (
              <div key={lift.exercise} className="mb-4 last:mb-0">
                <p className="text-xs text-glow-bright mb-1">{lift.exercise}</p>
                <div className="flex items-end gap-1 h-16">
                  {lift.entries.slice(-12).map((e, i) => {
                    const max = Math.max(...lift.entries.map(x => x.weight));
                    const pct = max > 0 ? (e.weight / max) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-glow/20 rounded-t"
                        style={{ height: `${Math.max(pct, 5)}%` }}
                        title={`${e.date}: ${e.weight} lbs`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-text-muted mt-1">
                  <span>{lift.entries[0]?.weight ?? 0} lbs</span>
                  <span>{lift.entries[lift.entries.length - 1]?.weight ?? 0} lbs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
