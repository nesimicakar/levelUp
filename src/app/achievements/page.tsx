'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getWeekStart } from '@/lib/db';
import { computeWeeklyCompletionPct, type WeeklyCompletionInput } from '@/lib/logic/rank';
import { getAllAchievementDefs, checkAndUnlockAchievements } from '@/lib/logic/achievements';
import { computeAgiStreak, computeStatCompletedDays } from '@/lib/logic/streaks';
import { getCourseProgress } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import type { Achievement, Rank } from '@/types';

const TIER_COLORS = {
  1: 'border-text-muted text-text-muted',
  2: 'border-glow text-glow',
  3: 'border-warning text-warning',
};

const TIER_LABELS = { 1: 'I', 2: 'II', 3: 'III' };

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [weeklyPct, setWeeklyPct] = useState(0);
  const [rank, setRank] = useState<Rank>('E');
  const [recentStats, setRecentStats] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    // Get achievements
    const all = await db.achievements.toArray();

    // Check for new ones
    const strSessions = await db.strSessions.where('completed').equals(1).count();
    const allAgiLogs = await db.agiLogs.toArray();
    const totalAgiMinutes = allAgiLogs.reduce((s, l) => s + l.minutes, 0);
    const agiStreak = await computeAgiStreak();
    const vitDays = await computeStatCompletedDays('vit');
    const allIntLogs = await db.intLogs.toArray();
    const totalPages = allIntLogs.reduce((s, l) => s + l.pagesRead, 0);
    const reCourse = await getCourseProgress('real-estate');
    const saCourse = await getCourseProgress('stage-academy');
    const latestRank = await db.rankHistory.orderBy('createdAt').last();

    const ctx = {
      strSessions,
      agiMinutes: totalAgiMinutes,
      agiStreak,
      vitDays,
      intPages: totalPages,
      intCourseUnits: reCourse.completedUnits,
      perLessons: saCourse.completedUnits,
      totalWeeks: 0,
      currentRankIdx: latestRank ? ['E','D','C','B','A','S'].indexOf(latestRank.rank) : 0,
    };

    const newOnes = await checkAndUnlockAchievements(ctx);
    const updated = [...all, ...newOnes].sort((a, b) => b.unlockedAt - a.unlockedAt);
    setAchievements(updated);

    // Weekly completion
    const today = getToday();
    const weekStart = getWeekStart(today);
    const weekStrSessions = await db.strSessions.where('date').between(weekStart, today + '\uffff').toArray();
    const strCompleted = weekStrSessions.filter(s => s.completed && !s.isRestDay).length;
    
    // Count completions this week for daily stats
    const allDates: string[] = [];
    const d = new Date(weekStart + 'T12:00:00');
    const todayDate = new Date(today + 'T12:00:00');
    while (d <= todayDate) {
      allDates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    let agiComp = 0, vitComp = 0, intComp = 0, perComp = 0;
    for (const date of allDates) {
      const a = await db.agiLogs.where('date').equals(date).first();
      if (a?.completed) agiComp++;
      const v = await db.vitLogs.where('date').equals(date).first();
      if (v?.completed) vitComp++;
      const i = await db.intLogs.where('date').equals(date).first();
      if (i?.completed) intComp++;
      const p = await db.perLogs.where('date').equals(date).first();
      if (p?.completed) perComp++;
    }

    const input: WeeklyCompletionInput = {
      strCompleted: Math.min(strCompleted, 4),
      agiCompleted: agiComp,
      vitCompleted: vitComp,
      intCompleted: intComp,
      perCompleted: perComp,
    };
    setWeeklyPct(computeWeeklyCompletionPct(input));
    setRank(latestRank?.rank ?? 'E');

    // Recent stats (last 7 days)
    const recent7: Record<string, number> = { STR: 0, AGI: 0, VIT: 0, INT: 0, PER: 0 };
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenStr = sevenDaysAgo.toISOString().split('T')[0];
    recent7.STR = (await db.strSessions.where('date').above(sevenStr).toArray()).filter(s => s.completed && !s.isRestDay).length;
    recent7.AGI = (await db.agiLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    recent7.VIT = (await db.vitLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    recent7.INT = (await db.intLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    recent7.PER = (await db.perLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    setRecentStats(recent7);

    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!loaded) return null;

  const allDefs = getAllAchievementDefs();
  const unlockedKeys = new Set(achievements.map(a => a.key));

  return (
    <div>
      <PageHeader title="HUNTER RECORD" subtitle="Achievements & Rank" />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Rank & Weekly */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-text-muted text-xs">GLOBAL RANK</p>
              <p
                className="text-4xl font-bold glow-text"
                style={{ color: `var(--color-rank-${rank.toLowerCase()})` }}
              >
                {rank}
              </p>
            </div>
            <div className="text-right">
              <p className="text-text-muted text-xs">WEEKLY COMPLETION</p>
              <p className="text-2xl font-bold text-glow">{weeklyPct}%</p>
            </div>
          </div>
          <ProgressBar value={weeklyPct} variant={weeklyPct >= 80 ? 'success' : 'default'} />
        </div>

        {/* Recent feats */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <h3 className="text-sm font-medium text-text-dim mb-3">LAST 7 DAYS</h3>
          <div className="grid grid-cols-5 gap-2 text-center">
            {Object.entries(recentStats).map(([stat, count]) => (
              <div key={stat}>
                <p className="text-glow text-lg font-bold">{count}</p>
                <p className="text-text-muted text-xs">{stat}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Achievement cards */}
        <h3 className="text-sm font-medium text-text-dim">ACHIEVEMENTS</h3>
        <div className="space-y-2">
          {allDefs.map(def => {
            const unlocked = unlockedKeys.has(def.key);
            const achievement = achievements.find(a => a.key === def.key);
            return (
              <div
                key={def.key}
                className={`stat-card rounded-lg p-3 border ${
                  unlocked ? TIER_COLORS[def.tier] : 'border-border opacity-40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{def.title}</span>
                    <span className={`ml-2 text-xs ${unlocked ? TIER_COLORS[def.tier] : 'text-text-muted'}`}>
                      {TIER_LABELS[def.tier]}
                    </span>
                    <p className="text-xs text-text-muted mt-0.5">{def.description}</p>
                  </div>
                  {unlocked && (
                    <span className="text-success text-xs">✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
