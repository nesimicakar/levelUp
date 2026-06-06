'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getWeekStart, getSettings, getCourseProgress, getCustomTaskChecksForDate } from '@/lib/db';
import { computeLevel, computeStrXP, computeAgiXP, computeVitXP, computeIntXP, computePerXP, getIntDailyCap, getAgiDailyCap, computeCustomTaskBonusPct, computePerDomainProgress, computeIntDomainProgress } from '@/lib/logic/levels';
import { getStrWeeklyStatus } from '@/lib/logic/str';
import { computeAgiStreak } from '@/lib/logic/streaks';
import { loadIntCourses, isIntCompleteFromCourses, getDailyUnitsForCourse, buildIntSubtitle, totalCompletedUnitsAcrossCourses } from '@/lib/logic/intCourses';
import Image from 'next/image';
import { StatCard } from '@/components/StatCard';
import { CircularProgress } from '@/components/CircularProgress';
import { SystemMessage } from '@/components/SystemMessage';
import { countConsecutiveWeeksAbove80 } from '@/lib/logic/rank';
import Link from 'next/link';
import { RANK_ORDER, type DayStatus, type StatLevel, type UserSettings, type DisciplineStreak, type DisciplineLogStatus } from '@/types';
import { setDisciplineLog } from '@/lib/logic/discipline';

const HUNTER_TITLES: Record<string, string> = {
  E: 'Weak Hunter',
  D: 'Initiate Hunter',
  C: 'Rising Hunter',
  B: 'Elite Hunter',
  A: 'Awakened Hunter',
  S: 'Ascendant Hunter',
};

interface DashboardState {
  str: { level: StatLevel; status: DayStatus; subtitle: string };
  agi: { level: StatLevel; status: DayStatus; subtitle: string };
  vit: { level: StatLevel; status: DayStatus; subtitle: string };
  int: { level: StatLevel; status: DayStatus; subtitle: string };
  per: { level: StatLevel; status: DayStatus; subtitle: string };
  rank: string;
  promotionWeeks: number;
  dailyPct: number;
  overcharge: boolean;
  requiredComplete: boolean;
  showCharacterVisuals: boolean;
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
    promotionWeeks: 0,
    dailyPct: 0,
    overcharge: false,
    requiredComplete: false,
    showCharacterVisuals: true,
    loaded: false,
  });
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const [showSystemHint, setShowSystemHint] = useState(false);
  const router = useRouter();

  // Discipline section state
  const [disciplines, setDisciplines] = useState<DisciplineStreak[]>([]);
  const [discLogs, setDiscLogs] = useState<Record<string, DisciplineLogStatus>>({});
  const [discFailConfirm, setDiscFailConfirm] = useState<string | null>(null); // streakId

  useEffect(() => {
    setShowSystemHint(localStorage.getItem('systemHintSeen') !== 'true');
  }, []);

  const loadDisciplineData = useCallback(async () => {
    const today = getToday();
    const active = await db.disciplineStreaks.where('status').equals('active').toArray();
    active.sort((a, b) => b.currentStreak - a.currentStreak);
    const todayLogs = await db.disciplineLogs.where('date').equals(today).toArray();
    const logMap: Record<string, DisciplineLogStatus> = {};
    for (const l of todayLogs) logMap[l.streakId] = l.status as DisciplineLogStatus;
    setDisciplines(active);
    setDiscLogs(logMap);
  }, []);

  useEffect(() => { loadDisciplineData(); }, [loadDisciplineData]);

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

    // Rank + promotion progress
    const latestRank = await db.rankHistory.orderBy('createdAt').last();
    const rankHistory = await db.rankHistory.orderBy('weekStart').reverse().toArray();
    const promotionWeeks = countConsecutiveWeeksAbove80(rankHistory);

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
      promotionWeeks: Math.min(promotionWeeks, 4),
      showCharacterVisuals: settings.showCharacterVisuals ?? true,
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

  // Rank-specific atmospheric layers (no image — pure color aura)
  const RANK_AURA: Record<string, { layers: string[]; particleRgb: string }> = {
    E: {
      layers: [
        'radial-gradient(ellipse 80% 55% at 50% 92%, rgba(148,163,184,0.10) 0%, transparent 70%)',
        'radial-gradient(ellipse 45% 38% at 22% 28%, rgba(226,232,240,0.06) 0%, transparent 60%)',
        'radial-gradient(ellipse 35% 30% at 78% 18%, rgba(203,213,225,0.05) 0%, transparent 55%)',
      ],
      particleRgb: '203,213,225',
    },
    D: {
      layers: [
        'radial-gradient(ellipse 78% 58% at 50% 95%, rgba(109,40,217,0.12) 0%, transparent 70%)',
        'radial-gradient(ellipse 48% 42% at 72% 18%, rgba(167,139,250,0.08) 0%, transparent 55%)',
        'radial-gradient(ellipse 30% 28% at 18% 40%, rgba(139,92,246,0.06) 0%, transparent 50%)',
      ],
      particleRgb: '167,139,250',
    },
    C: {
      layers: [
        'radial-gradient(ellipse 75% 55% at 50% 92%, rgba(59,130,246,0.11) 0%, transparent 68%)',
        'radial-gradient(ellipse 50% 44% at 20% 22%, rgba(147,197,253,0.07) 0%, transparent 55%)',
        'radial-gradient(ellipse 28% 26% at 82% 14%, rgba(96,165,250,0.07) 0%, transparent 48%)',
      ],
      particleRgb: '147,197,253',
    },
    B: {
      layers: [
        'radial-gradient(ellipse 80% 58% at 50% 94%, rgba(22,163,74,0.11) 0%, transparent 70%)',
        'radial-gradient(ellipse 44% 38% at 68% 20%, rgba(74,222,128,0.08) 0%, transparent 52%)',
        'radial-gradient(ellipse 32% 28% at 15% 35%, rgba(34,197,94,0.06) 0%, transparent 50%)',
      ],
      particleRgb: '74,222,128',
    },
    A: {
      layers: [
        'radial-gradient(ellipse 78% 58% at 50% 92%, rgba(217,119,6,0.11) 0%, transparent 68%)',
        'radial-gradient(ellipse 60% 50% at 50% 8%, rgba(251,191,36,0.08) 0%, transparent 55%)',
        'radial-gradient(ellipse 30% 28% at 80% 38%, rgba(245,158,11,0.07) 0%, transparent 48%)',
      ],
      particleRgb: '251,191,36',
    },
    S: {
      layers: [
        'radial-gradient(ellipse 80% 60% at 50% 96%, rgba(185,28,28,0.13) 0%, transparent 70%)',
        'radial-gradient(ellipse 50% 45% at 25% 12%, rgba(126,34,206,0.09) 0%, transparent 55%)',
        'radial-gradient(ellipse 35% 32% at 80% 42%, rgba(239,68,68,0.07) 0%, transparent 50%)',
      ],
      particleRgb: '220,38,38',
    },
  };

  const aura = RANK_AURA[state.rank] ?? RANK_AURA.E;
  const rankColor = `var(--color-rank-${state.rank.toLowerCase()})`;
  const rankIdx = RANK_ORDER.indexOf(state.rank as typeof RANK_ORDER[number]);
  const nextRank = rankIdx >= 0 && rankIdx < RANK_ORDER.length - 1 ? RANK_ORDER[rankIdx + 1] : null;

  // Particles — start just below viewport (top: 102%), rise to -120vh.
  // Negative delay pre-seeds each particle mid-animation so the screen
  // is populated immediately on load, with no hydration mismatch.
  const PARTICLES = [
    { x: 8,  size: 2.5, opacity: 0.45, dur: 14, delay: -7  },
    { x: 18, size: 2,   opacity: 0.38, dur: 18, delay: -4  },
    { x: 30, size: 3,   opacity: 0.32, dur: 11, delay: -9  },
    { x: 42, size: 2,   opacity: 0.40, dur: 16, delay: -2  },
    { x: 55, size: 1.5, opacity: 0.42, dur: 13, delay: -10 },
    { x: 66, size: 2.5, opacity: 0.36, dur: 20, delay: -14 },
    { x: 78, size: 2,   opacity: 0.38, dur: 14, delay: -6  },
    { x: 89, size: 3,   opacity: 0.28, dur: 22, delay: -16 },
    { x: 12, size: 2,   opacity: 0.35, dur: 12, delay: -5  },
    { x: 24, size: 1.5, opacity: 0.42, dur: 15, delay: -12 },
    { x: 48, size: 2.5, opacity: 0.32, dur: 19, delay: -8  },
    { x: 60, size: 2,   opacity: 0.40, dur: 13, delay: -3  },
    { x: 72, size: 1.5, opacity: 0.38, dur: 17, delay: -11 },
    { x: 85, size: 2.5, opacity: 0.35, dur: 12, delay: -4  },
    { x: 35, size: 2,   opacity: 0.36, dur: 16, delay: -9  },
  ] as const;

  return (
    <>
    {/* Rank atmospheric background — no image, pure color aura */}
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: 'var(--color-bg)',
      }}
      aria-hidden
    >
      {/* Layered radial aura gradients */}
      {aura.layers.map((layer, i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, background: layer }} />
      ))}

      {/* Rising ambient particles — positioned at bottom, drift to top */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="aura-particle"
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: '102%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `rgba(${aura.particleRgb}, ${p.opacity})`,
            animation: `particle-rise ${p.dur}s linear ${p.delay}s infinite`,
            boxShadow: `0 0 ${p.size * 2}px rgba(${aura.particleRgb}, ${p.opacity * 0.6})`,
          }}
        />
      ))}
    </div>
    <SystemMessage
      title="DAILY PROTOCOL"
      subtitle="Cleared"
      variant="major"
      visible={showDailyComplete}
      onDismiss={() => setShowDailyComplete(false)}
    />
    <main className="max-w-lg mx-auto px-4 pt-5 pb-2">
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

      {/* ── Rank Identity Card ────────────────────────────────────── */}
      <div
        className="frame-cut mb-4"
        style={{ padding: '10px 14px', border: `1px solid color-mix(in srgb, ${rankColor} 22%, transparent)` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Rank thumbnail — hidden when character visuals are off */}
          {state.showCharacterVisuals && (
            <div
              style={{
                width: 46,
                height: 58,
                position: 'relative',
                flexShrink: 0,
                overflow: 'hidden',
                clipPath: 'polygon(0 6px,6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)',
              }}
            >
              <Image
                src={`/${state.rank.toLowerCase()}-rank.png`}
                alt=""
                fill
                style={{ objectFit: 'cover', objectPosition: 'top center' }}
                sizes="46px"
              />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,14,23,0.25)' }} />
            </div>
          )}

          {/* Identity + progress */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Rank letter + label */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
              <span
                className="font-display font-black leading-none"
                style={{
                  fontSize: 26,
                  color: rankColor,
                  textShadow: `0 0 14px color-mix(in srgb, ${rankColor} 55%, transparent)`,
                }}
              >
                {state.rank}
              </span>
              <span
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                RANK
              </span>
            </div>

            {/* Hunter title */}
            <div
              className="font-display font-bold uppercase"
              style={{ fontSize: 13, letterSpacing: '0.07em', color: 'var(--color-text)', marginBottom: 8 }}
            >
              {HUNTER_TITLES[state.rank] ?? 'Hunter'}
            </div>

            {/* Promotion progress */}
            {nextRank ? (
              <div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        background: i < state.promotionWeeks
                          ? rankColor
                          : 'rgba(255,255,255,0.08)',
                        boxShadow: i < state.promotionWeeks
                          ? `0 0 5px color-mix(in srgb, ${rankColor} 70%, transparent)`
                          : 'none',
                        transition: 'background 0.3s ease',
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 9,
                    letterSpacing: '0.16em',
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {state.promotionWeeks}/4 WKS → {HUNTER_TITLES[nextRank]}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  color: rankColor,
                  textTransform: 'uppercase',
                }}
              >
                ✦ APEX CLASSIFICATION
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-1">
        <CircularProgress
          percentage={state.dailyPct}
          overcharge={state.overcharge}
          color={rankColor}
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

      {/* ── Discipline Section ──────────────────────────────────────── */}
      {disciplines.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.18em' }}>
              // DISCIPLINE
            </span>
            <Link
              href="/discipline"
              style={{ fontSize: 10, color: 'var(--color-text-dim)', letterSpacing: '0.1em', textDecoration: 'none' }}
            >
              VIEW ALL →
            </Link>
          </div>
          <div className="space-y-2">
            {disciplines.slice(0, 3).map(streak => {
              const todayStatus = discLogs[streak.id] ?? 'unset';
              const isConfirming = discFailConfirm === streak.id;

              const handleClear = async () => {
                await setDisciplineLog(streak.id, getToday(), 'clear');
                await loadDisciplineData();
              };
              const handleFail = async () => {
                await setDisciplineLog(streak.id, getToday(), 'failed');
                setDiscFailConfirm(null);
                await loadDisciplineData();
              };
              const handleUndo = async () => {
                await setDisciplineLog(streak.id, getToday(), 'unset');
                await loadDisciplineData();
              };

              return (
                <div key={streak.id} className="frame-cut" style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Name + streak */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#f9fafb', letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {streak.name}
                      </div>
                      <div style={{ fontSize: 10, color: streak.currentStreak > 0 ? '#f97316' : '#4b5563', marginTop: 1 }}>
                        {streak.currentStreak > 0 ? `🔥 ${streak.currentStreak}d` : '— 0 days'}
                      </div>
                    </div>

                    {/* Today status / actions */}
                    {todayStatus === 'unset' && !isConfirming && (
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button
                          onClick={handleClear}
                          style={{
                            padding: '4px 9px',
                            background: 'rgba(74,222,128,0.1)',
                            border: '1px solid rgba(74,222,128,0.3)',
                            borderRadius: 4,
                            color: '#4ade80',
                            fontSize: 10,
                            letterSpacing: 0.8,
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                          }}
                        >
                          CLEAR
                        </button>
                        <button
                          onClick={() => setDiscFailConfirm(streak.id)}
                          style={{
                            padding: '4px 9px',
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 4,
                            color: '#ef4444',
                            fontSize: 10,
                            letterSpacing: 0.8,
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                          }}
                        >
                          FAIL
                        </button>
                      </div>
                    )}

                    {todayStatus === 'unset' && isConfirming && (
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button
                          onClick={handleFail}
                          style={{
                            padding: '4px 9px',
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.4)',
                            borderRadius: 4,
                            color: '#ef4444',
                            fontSize: 10,
                            letterSpacing: 0.8,
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                          }}
                        >
                          CONFIRM
                        </button>
                        <button
                          onClick={() => setDiscFailConfirm(null)}
                          style={{
                            padding: '4px 9px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 4,
                            color: '#6b7280',
                            fontSize: 10,
                            letterSpacing: 0.8,
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {todayStatus !== 'unset' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: todayStatus === 'clear' ? '#4ade80' : todayStatus === 'failed' ? '#ef4444' : '#6b7280',
                        }}>
                          {todayStatus === 'clear' ? '✓' : todayStatus === 'failed' ? '✗' : '—'}
                        </span>
                        <button
                          onClick={handleUndo}
                          style={{
                            padding: '3px 7px',
                            background: 'none',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 3,
                            color: '#4b5563',
                            fontSize: 9,
                            letterSpacing: 0.8,
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                          }}
                        >
                          UNDO
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {disciplines.length > 3 && (
            <Link
              href="/discipline"
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: 8,
                fontSize: 10,
                color: 'var(--color-text-muted)',
                letterSpacing: '0.12em',
                textDecoration: 'none',
              }}
            >
              +{disciplines.length - 3} more disciplines →
            </Link>
          )}
        </div>
      )}

      {disciplines.length === 0 && (
        <div className="mt-5">
          <Link
            href="/discipline"
            style={{ display: 'block', fontSize: 10, color: 'var(--color-text-dim)', letterSpacing: '0.12em', textDecoration: 'none', textAlign: 'center', padding: '8px 0' }}
          >
            + TRACK DISCIPLINE →
          </Link>
        </div>
      )}

    </main>
    </>
  );
}
