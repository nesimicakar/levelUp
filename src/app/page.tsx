'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getWeekStart, getSettings, getCourseProgress, getCustomTaskChecksForDate } from '@/lib/db';
import { computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP, getIntDailyCap, getAgiDailyCap, computeCustomTaskBonusPct, computePerDomainProgress, computeIntDomainProgress } from '@/lib/logic/levels';
import { getStrWeeklyStatus } from '@/lib/logic/str';
import { computeAgiStreak } from '@/lib/logic/streaks';
import { loadIntCourses, isIntCompleteFromCourses, getDailyUnitsForCourse, buildIntSubtitle, totalCompletedUnitsAcrossCourses } from '@/lib/logic/intCourses';
import { StatCard } from '@/components/StatCard';
import { CircularProgress } from '@/components/CircularProgress';
import { SystemMessage } from '@/components/SystemMessage';
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
  requiredComplete: boolean;
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
    requiredComplete: false,
    loaded: false,
  });
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const [showSystemHint, setShowSystemHint] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setShowSystemHint(localStorage.getItem('systemHintSeen') !== 'true');
  }, []);

  const loadData = useCallback(async () => {
    const today = getToday();
    const weekStart = getWeekStart(today);
    const settings = await getSettings();
    if (settings.hasOnboarded === false) {
      router.replace('/guide');
      return;
    }
    // STR
    const allStrSessions = (await db.strSessions.toArray()).filter(s => s.completed).length;
    const weekStrSessions = await db.strSessions
      .where('date')
      .between(weekStart, today + '\uffff')
      .toArray();
    const strWeekly = getStrWeeklyStatus(weekStrSessions, settings.strSessionsPerWeek ?? 3);
    const todayStr = weekStrSessions.find(s => s.date === today);
    const strStatus: DayStatus = todayStr?.isRestDay ? 'rest' : todayStr?.completed ? 'complete' : 'incomplete';
    const strXP = computeStrXP(allStrSessions, 0);
    const strLevel = computeLevel(strXP);

    // AGI — multiple logs per day allowed (one per modality), so sum across all
    const todayAgiLogs = await db.agiLogs.where('date').equals(today).toArray();
    const todayAgiMinutes = todayAgiLogs.reduce((sum, l) => sum + l.minutes, 0);
    const agiStatus: DayStatus = todayAgiMinutes >= settings.agiMinMinutes ? 'complete' : 'incomplete';
    const allAgiLogs = await db.agiLogs.toArray();
    const agiCap = getAgiDailyCap(settings.agiMinMinutes);
    // XP cap applies per day (not per log) so we sum minutes by day first, then cap
    const minutesByDay = new Map<string, number>();
    for (const l of allAgiLogs) {
      minutesByDay.set(l.date, (minutesByDay.get(l.date) ?? 0) + l.minutes);
    }
    const cappedAgiMinutes = [...minutesByDay.values()].reduce((s, m) => s + Math.min(m, agiCap), 0);
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

    // INT — multi-course system: completion = every active course meets daily target
    const todayInt = await db.intLogs.where('date').equals(today).first();
    const todayPerForInt = await db.perLogs.where('date').equals(today).first();
    const intCourses = await loadIntCourses();
    const todayUnitsByCourse: Record<string, number> = {};
    for (const c of intCourses) {
      todayUnitsByCourse[c.id] = getDailyUnitsForCourse(c, todayInt ?? null, todayPerForInt ?? null);
    }
    const intStatus: DayStatus = isIntCompleteFromCourses(intCourses, todayUnitsByCourse) ? 'complete' : 'incomplete';
    const allIntLogs = await db.intLogs.toArray();
    const intCap = getIntDailyCap(settings.learningMinutesPerDay);
    const cappedIntMinutes = allIntLogs.reduce((s, l) => s + Math.min(l.learningMinutes ?? 0, intCap), 0);
    const intXP = computeIntXP(cappedIntMinutes, totalCompletedUnitsAcrossCourses(intCourses));
    const intLevel = computeLevel(intXP);

    // PER — reading minutes (always required) + prayers/quran (if spirituality enabled)
    const spiritualityEnabled = settings.enableSpirituality ?? false;
    const readingTarget = settings.dailyReadingMinutesTarget ?? 5;
    const todayPer = await db.perLogs.where('date').equals(today).first();
    const perStatus: DayStatus = todayPer?.completed ? 'complete' : 'incomplete';
    const saCourse = await getCourseProgress('stage-academy');
    const perXP = computePerXP(saCourse.completedUnits);
    const perLevel = computeLevel(perXP);
    const perSubtitle = (() => {
      const read = `READ ${todayPer?.readingMinutes ?? 0}/${readingTarget}`;
      if (!spiritualityEnabled) return read;
      const pray = `PRAY ${todayPer?.prayersCount ?? 0}/5`;
      const quran = `QURAN ${todayPer?.quranPages ?? 0}/${settings.quranPagesPerDay}`;
      return `${read} · ${pray} · ${quran}`;
    })();

    // Rank
    const latestRank = await db.rankHistory.orderBy('createdAt').last();

    // Weighted daily progress (Model C)
    const strDomainProgress = (strStatus === 'complete' || strStatus === 'rest') ? 1 : 0;
    const agiDomainProgress = Math.min(todayAgiMinutes / settings.agiMinMinutes, 1);
    const vitDomainProgress = vitChecked / 3;
    // INT: average per-course progress across ACTIVE courses only
    const activeIntCourses = intCourses.filter(c => c.status === 'active');
    const intDomainProgress = computeIntDomainProgress(activeIntCourses, todayUnitsByCourse);
    // PER: reading minutes (always) + prayers + Quran (if spirituality on)
    const perDomainProgress = computePerDomainProgress(
      spiritualityEnabled,
      todayPer?.readingMinutes ?? 0,
      settings.dailyReadingMinutesTarget ?? 5,
      todayPer?.prayersCount ?? 0,
      todayPer?.quranPages ?? 0,
      settings.quranPagesPerDay,
    );
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
      const todayLogs = await getCustomTaskChecksForDate(today);
      const enabledIds = new Set(enabledTasks.map(t => t.id));
      const checkedEnabledCount = todayLogs.filter(l => l.checked && enabledIds.has(l.taskId)).length;
      const bonusPct = computeCustomTaskBonusPct(enabledCount, checkedEnabledCount);
      overcharge = bonusPct > 0;
      if (settings.strictMode) {
        dailyPct = basePctRaw;
      } else {
        dailyPct = Math.min(Math.min(basePctRaw, 90) + bonusPct, 100);
      }
    }

    setState({
      str: {
        level: strLevel,
        status: strStatus,
        subtitle: `${Math.min(strWeekly.sessionsCompleted, strWeekly.sessionsRequired)}/${strWeekly.sessionsRequired} sessions · Rest tokens: ${strWeekly.restTokensUsed}/${strWeekly.restTokensTotal}`,
      },
      agi: {
        level: agiLevel,
        status: agiStatus,
        subtitle: `${agiStreak}-day streak · ${todayAgiMinutes} min today`,
      },
      vit: {
        level: vitLevel,
        status: vitStatus,
        subtitle: `${vitChecked}/3 completed today`,
      },
      int: {
        level: intLevel,
        status: intStatus,
        subtitle: buildIntSubtitle(intCourses, todayInt ?? null, todayPerForInt ?? null),
      },
      per: {
        level: perLevel,
        status: perStatus,
        subtitle: perSubtitle,
      },
      rank: latestRank?.rank ?? 'E',
      dailyPct,
      overcharge,
      requiredComplete: basePctRaw >= 100,
      loaded: true,
    });
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('onboardingComplete')) {
      router.replace('/guide');
      return;
    }
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!state.loaded) return;
    const shownKey = `levelup-complete-shown-${getToday()}`;
    if (state.requiredComplete) {
      if (!localStorage.getItem(shownKey)) {
        localStorage.setItem(shownKey, '1');
        setShowDailyComplete(true);
      }
    } else {
      localStorage.removeItem(shownKey);
    }
  }, [state.requiredComplete, state.loaded]);

  if (!state.loaded) return null;

  return (
    <>
    <SystemMessage
      title="DAILY PROTOCOL"
      subtitle="Cleared"
      variant="major"
      visible={showDailyComplete}
      onDismiss={() => setShowDailyComplete(false)}
    />
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-widest glow-text leading-none">SYSTEM</h1>
          <p className="text-text-muted text-[10px] mt-1 tracking-[0.18em] uppercase">Daily Protocol Status</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">RANK</span>
          <span
            className="font-display text-3xl font-bold glow-text leading-none"
            style={{ color: `var(--color-rank-${state.rank.toLowerCase()})` }}
          >
            {state.rank}
          </span>
        </div>
      </div>

      <div className="mb-1">
        <CircularProgress
          percentage={state.dailyPct}
          overcharge={state.overcharge}
        />
      </div>

      {(() => {
        const statuses = [state.str.status, state.agi.status, state.vit.status, state.int.status, state.per.status];
        const remaining = statuses.filter(s => s === 'incomplete').length;
        return (
          <p className={`text-center text-xs mb-4 ${remaining === 0 || remaining <= 2 ? 'text-text-dim' : 'text-text-muted'}`}>
            {remaining === 0 ? 'Protocol cleared' : `${remaining} to clear`}
          </p>
        );
      })()}

      {showSystemHint && (
        <p className="text-center text-xs text-text-muted opacity-50 mb-3">
          👉 Tap any section to start
        </p>
      )}

      {(() => {
        const order = ['STR', 'AGI', 'VIT', 'INT', 'PER'] as const;
        const statuses = { STR: state.str.status, AGI: state.agi.status, VIT: state.vit.status, INT: state.int.status, PER: state.per.status };
        const next = order.find(s => statuses[s] === 'incomplete') ?? null;
        const dismissHint = () => {
          if (showSystemHint) {
            localStorage.setItem('systemHintSeen', 'true');
            setShowSystemHint(false);
          }
        };
        return (
          <div className="space-y-3">
            <StatCard stat="STR" level={state.str.level.level} progressPct={state.str.level.progressPct} status={state.str.status} subtitle={state.str.subtitle} href="/str" highlight={next === 'STR'} onClick={dismissHint} />
            <StatCard stat="AGI" level={state.agi.level.level} progressPct={state.agi.level.progressPct} status={state.agi.status} subtitle={state.agi.subtitle} href="/agi" highlight={next === 'AGI'} onClick={dismissHint} />
            <StatCard stat="VIT" level={state.vit.level.level} progressPct={state.vit.level.progressPct} status={state.vit.status} subtitle={state.vit.subtitle} href="/vit" highlight={next === 'VIT'} onClick={dismissHint} />
            <StatCard stat="INT" level={state.int.level.level} progressPct={state.int.level.progressPct} status={state.int.status} subtitle={state.int.subtitle} href="/int" highlight={next === 'INT'} onClick={dismissHint} />
            <StatCard stat="PER" level={state.per.level.level} progressPct={state.per.level.progressPct} status={state.per.status} subtitle={state.per.subtitle} href="/per" highlight={next === 'PER'} onClick={dismissHint} />
          </div>
        );
      })()}
    </main>
    </>
  );
}
