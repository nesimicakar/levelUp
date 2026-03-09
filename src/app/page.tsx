'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getWeekStart, getSettings, getCourseProgress, getCustomTaskChecksForDate } from '@/lib/db';
import { computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP, getIntDailyCap, getAgiDailyCap, computeCustomTaskBonusPct } from '@/lib/logic/levels';
import { getStrWeeklyStatus } from '@/lib/logic/str';
import { computeAgiStreak } from '@/lib/logic/streaks';
import { StatCard } from '@/components/StatCard';
import { CircularProgress } from '@/components/CircularProgress';
import type { DayStatus, StatLevel, UserSettings } from '@/types';

interface DashboardState {
  str: { level: StatLevel; status: DayStatus; subtitle: string };
  agi: { level: StatLevel; status: DayStatus; subtitle: string };
  vit: { level: StatLevel; status: DayStatus; subtitle: string };
  int: { level: StatLevel; status: DayStatus; subtitle: string };
  per: { level: StatLevel; status: DayStatus; subtitle: string };
  rank: string;
  dailyPct: number;
  overcharge: boolean;
  loaded: boolean;
}

const defaultLevel: StatLevel = { level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 };

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>({
    str: { level: defaultLevel, status: 'incomplete', subtitle: '' },
    agi: { level: defaultLevel, status: 'incomplete', subtitle: '' },
    vit: { level: defaultLevel, status: 'incomplete', subtitle: '' },
    int: { level: defaultLevel, status: 'incomplete', subtitle: '' },
    per: { level: defaultLevel, status: 'incomplete', subtitle: '' },
    rank: 'E',
    dailyPct: 0,
    overcharge: false,
    loaded: false,
  });

  const loadData = useCallback(async () => {
    const today = getToday();
    const weekStart = getWeekStart(today);
    const settings = await getSettings();
    const intCourseAbbr = (settings.intCourseName ?? 'Primary Study').split(' ').map(w => w[0]).join('').toUpperCase();

    // STR
    const allStrSessions = (await db.strSessions.toArray()).filter(s => s.completed).length;
    const weekStrSessions = await db.strSessions
      .where('date')
      .between(weekStart, today + '\uffff')
      .toArray();
    const strWeekly = getStrWeeklyStatus(weekStrSessions);
    const todayStr = weekStrSessions.find(s => s.date === today);
    const strStatus: DayStatus = todayStr?.isRestDay ? 'rest' : todayStr?.completed ? 'complete' : 'incomplete';
    const strXP = computeStrXP(allStrSessions, 0);
    const strLevel = computeLevel(strXP);

    // AGI
    const todayAgi = await db.agiLogs.where('date').equals(today).first();
    const agiStatus: DayStatus = todayAgi?.completed ? 'complete' : 'incomplete';
    const allAgiLogs = await db.agiLogs.toArray();
    const totalAgiMinutes = allAgiLogs.reduce((sum, l) => sum + l.minutes, 0);
    const agiCap = getAgiDailyCap(settings.agiMinMinutes);
    const cappedAgiMinutes = allAgiLogs.reduce((sum, l) => sum + Math.min(l.minutes, agiCap), 0);
    const agiStreak = await computeAgiStreak(today);
    const agiXP = computeAgiXP(cappedAgiMinutes, agiStreak);
    const agiLevel = computeLevel(agiXP);

    // VIT
    const todayVit = await db.vitLogs.where('date').equals(today).first();
    const vitStatus: DayStatus = todayVit?.completed ? 'complete' : 'incomplete';
    const vitDays = (await db.vitLogs.toArray()).filter(l => l.completed).length;
    const vitXP = computeVitXP(vitDays);
    const vitLevel = computeLevel(vitXP);
    const vitChecked = todayVit ? [todayVit.sleepHours >= 7, todayVit.proteinGoalMet, todayVit.postureMobilityMet === true].filter(Boolean).length : 0;

    // INT
    const todayInt = await db.intLogs.where('date').equals(today).first();
    const intStatus: DayStatus = todayInt?.completed ? 'complete' : 'incomplete';
    const allIntLogs = await db.intLogs.toArray();
    const intCap = getIntDailyCap(settings.learningMinutesPerDay);
    const cappedIntMinutes = allIntLogs.reduce((s, l) => s + Math.min(l.learningMinutes ?? 0, intCap), 0);
    const reCourse = await getCourseProgress('real-estate');
    const intXP = computeIntXP(cappedIntMinutes, reCourse.completedUnits);
    const intLevel = computeLevel(intXP);
    const rePct = Math.round((reCourse.completedUnits / reCourse.totalUnits) * 100);

    // PER
    const todayPer = await db.perLogs.where('date').equals(today).first();
    const perLessonsMet = (todayPer?.lessonsCompleted ?? 0) >= settings.lessonsPerDay;
    const perPrayersMet = (todayPer?.prayersCount ?? 0) >= 5;
    const perQuranMet = (todayPer?.quranPages ?? 0) >= settings.quranPagesPerDay;
    const perChecked = [perLessonsMet, perPrayersMet, perQuranMet].filter(Boolean).length;
    const perStatus: DayStatus = todayPer?.completed ? 'complete' : 'incomplete';
    const saCourse = await getCourseProgress('stage-academy');
    const perXP = computePerXP(saCourse.completedUnits);
    const perLevel = computeLevel(perXP);
    const saPct = Math.round((saCourse.completedUnits / saCourse.totalUnits) * 100);

    // Rank
    const latestRank = await db.rankHistory.orderBy('createdAt').last();

    // Weighted daily progress (Model C)
    const strDomainProgress = (strStatus === 'complete' || strStatus === 'rest') ? 1 : 0;
    const agiDomainProgress = Math.min((todayAgi?.minutes ?? 0) / settings.agiMinMinutes, 1);
    const vitDomainProgress = vitChecked / 3;
    const intBookProgress = Math.min((todayInt?.learningMinutes ?? 0) / settings.learningMinutesPerDay, 1);
    const intReProgress = Math.min((todayInt?.courseUnitsCompleted ?? 0) / settings.courseUnitsPerDay, 1);
    const intDomainProgress = (intBookProgress + intReProgress) / 2;
    const perDomainProgress = perChecked / 3;
    const domainProgress = [strDomainProgress, agiDomainProgress, vitDomainProgress, intDomainProgress, perDomainProgress];
    const basePctRaw = Math.min(Math.round(domainProgress.reduce((sum, p) => sum + p * 20, 0)), 100);

    // Custom task bonus (up to +10%)
    const enabledTasks = (settings.customTasks ?? []).filter(t => t.enabled);
    const enabledCount = enabledTasks.length;
    let dailyPct: number;
    let overcharge = false;

    if (enabledCount === 0) {
      dailyPct = basePctRaw;
    } else {
      const basePct = Math.min(basePctRaw, 90);
      const todayLogs = await getCustomTaskChecksForDate(today);
      const enabledIds = new Set(enabledTasks.map(t => t.id));
      const checkedEnabledCount = todayLogs.filter(l => l.checked && enabledIds.has(l.taskId)).length;
      const bonusPct = computeCustomTaskBonusPct(enabledCount, checkedEnabledCount);
      dailyPct = Math.min(basePct + bonusPct, 100);
      overcharge = bonusPct > 0;
    }

    setState({
      str: {
        level: strLevel,
        status: strStatus,
        subtitle: `${strWeekly.sessionsCompleted}/4 sessions · Rest tokens: ${strWeekly.restTokensUsed}/3`,
      },
      agi: {
        level: agiLevel,
        status: agiStatus,
        subtitle: `${agiStreak}-day streak · ${todayAgi?.minutes ?? 0} min today`,
      },
      vit: {
        level: vitLevel,
        status: vitStatus,
        subtitle: `${vitChecked}/3 completed today`,
      },
      int: {
        level: intLevel,
        status: intStatus,
        subtitle: `${todayInt?.learningMinutes ?? 0}/${settings.learningMinutesPerDay} min · ${intCourseAbbr} ${todayInt?.courseUnitsCompleted ?? 0}/${settings.courseUnitsPerDay} units`,
      },
      per: {
        level: perLevel,
        status: perStatus,
        subtitle: `${perChecked}/3 completed today`,
      },
      rank: latestRank?.rank ?? 'E',
      dailyPct,
      overcharge,
      loaded: true,
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!state.loaded) return null;

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text">SYSTEM</h1>
          <p className="text-text-muted text-xs mt-1">Daily Protocol Status</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">RANK</span>
          <span
            className="text-2xl font-bold glow-text"
            style={{ color: `var(--color-rank-${state.rank.toLowerCase()})` }}
          >
            {state.rank}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <CircularProgress
          percentage={state.dailyPct}
          overcharge={state.overcharge}
        />
      </div>

      <div className="space-y-3">
        <StatCard
          stat="STR"
          level={state.str.level.level}
          progressPct={state.str.level.progressPct}
          status={state.str.status}
          subtitle={state.str.subtitle}
          href="/str"
        />
        <StatCard
          stat="AGI"
          level={state.agi.level.level}
          progressPct={state.agi.level.progressPct}
          status={state.agi.status}
          subtitle={state.agi.subtitle}
          href="/agi"
        />
        <StatCard
          stat="VIT"
          level={state.vit.level.level}
          progressPct={state.vit.level.progressPct}
          status={state.vit.status}
          subtitle={state.vit.subtitle}
          href="/vit"
        />
        <StatCard
          stat="INT"
          level={state.int.level.level}
          progressPct={state.int.level.progressPct}
          status={state.int.status}
          subtitle={state.int.subtitle}
          href="/int"
        />
        <StatCard
          stat="PER"
          level={state.per.level.level}
          progressPct={state.per.level.progressPct}
          status={state.per.status}
          subtitle={state.per.subtitle}
          href="/per"
        />
      </div>
    </main>
  );
}
