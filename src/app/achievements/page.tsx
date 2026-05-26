'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, getToday, getWeekStart, getSettings } from '@/lib/db';
import { computeWeeklyCompletionPct, countConsecutiveWeeksAbove80, getLastEvaluatedPct, type WeeklyCompletionInput } from '@/lib/logic/rank';
import { checkAndUnlockAchievements } from '@/lib/logic/achievements';
import { computeAgiStreak, computeStatCompletedDays } from '@/lib/logic/streaks';
import { getCourseProgress } from '@/lib/db';
import type { Achievement, Rank } from '@/types';
import { RANK_ORDER } from '@/types';

const RANK_LABELS: Record<Rank, string> = {
  E: 'Awakened · the threshold',
  D: 'Initiate · early ascent',
  C: 'Hunter · operational',
  B: 'Adept · sustained mastery',
  A: 'Master · elite tier',
  S: 'Monarch · ascended',
};

export default function AchievementsPage() {
  const router = useRouter();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [weeklyPct, setWeeklyPct] = useState(0);
  const [rank, setRank] = useState<Rank>('E');
  const [promotionWeeks, setPromotionWeeks] = useState(0);
  const [lastEvalPct, setLastEvalPct] = useState<number | null>(null);
  const [recentStats, setRecentStats] = useState<Record<string, number>>({});
  const [recent30Stats, setRecent30Stats] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const all = await db.achievements.toArray();

    const strSessions = (await db.strSessions.toArray()).filter(s => s.completed).length;
    const allAgiLogs = await db.agiLogs.toArray();
    const totalAgiMinutes = allAgiLogs.reduce((s, l) => s + l.minutes, 0);
    const agiStreak = await computeAgiStreak(getToday());
    const vitDays = await computeStatCompletedDays('vit');
    const allIntLogs = await db.intLogs.toArray();
    const totalMinutes = allIntLogs.reduce((s, l) => s + (l.learningMinutes ?? 0), 0);
    const reCourse = await getCourseProgress('real-estate');
    const saCourse = await getCourseProgress('stage-academy');
    const latestRank = await db.rankHistory.orderBy('createdAt').last();

    const ctx = {
      strSessions,
      agiMinutes: totalAgiMinutes,
      agiStreak,
      vitDays,
      intPages: totalMinutes,
      intCourseUnits: reCourse.completedUnits,
      perLessons: saCourse.completedUnits,
      totalWeeks: 0,
      currentRankIdx: latestRank ? RANK_ORDER.indexOf(latestRank.rank) : 0,
    };

    const newOnes = await checkAndUnlockAchievements(ctx);
    const updated = [...all, ...newOnes].sort((a, b) => b.unlockedAt - a.unlockedAt);
    setAchievements(updated);

    const today = getToday();
    const weekStart = getWeekStart(today);
    const weekStrSessions = await db.strSessions.where('date').between(weekStart, today + '￿').toArray();
    const strCompleted = weekStrSessions.filter(s => s.completed || s.isRestDay).length;

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

    const settings = await getSettings();
    const strRequired = settings.strSessionsPerWeek ?? 3;
    const input: WeeklyCompletionInput = {
      strCompleted: Math.min(strCompleted, strRequired),
      agiCompleted: agiComp,
      vitCompleted: vitComp,
      intCompleted: intComp,
      perCompleted: perComp,
    };
    setWeeklyPct(computeWeeklyCompletionPct(input, strRequired));
    setRank(latestRank?.rank ?? 'E');

    const rankRecords = await db.rankHistory.orderBy('weekStart').reverse().toArray();
    setPromotionWeeks(countConsecutiveWeeksAbove80(rankRecords));
    setLastEvalPct(getLastEvaluatedPct(rankRecords));

    const recent7: Record<string, number> = { STR: 0, AGI: 0, VIT: 0, INT: 0, PER: 0 };
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenStr = sevenDaysAgo.toISOString().split('T')[0];
    recent7.STR = (await db.strSessions.where('date').above(sevenStr).toArray()).filter(s => s.completed && !s.isRestDay).length;
    recent7.AGI = new Set((await db.agiLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).map(l => l.date)).size;
    recent7.VIT = (await db.vitLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    recent7.INT = (await db.intLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    recent7.PER = (await db.perLogs.where('date').above(sevenStr).toArray()).filter(l => l.completed).length;
    setRecentStats(recent7);

    const recent30: Record<string, number> = { STR: 0, AGI: 0, VIT: 0, INT: 0, PER: 0 };
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];
    recent30.STR = (await db.strSessions.where('date').above(thirtyStr).toArray()).filter(s => s.completed && !s.isRestDay).length;
    recent30.AGI = new Set((await db.agiLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).map(l => l.date)).size;
    recent30.VIT = (await db.vitLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).length;
    recent30.INT = (await db.intLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).length;
    recent30.PER = (await db.perLogs.where('date').above(thirtyStr).toArray()).filter(l => l.completed).length;
    setRecent30Stats(recent30);

    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!loaded) return null;

  const unlockedCount = achievements.length;
  const currentIdx = RANK_ORDER.indexOf(rank);
  const nextIdx = currentIdx + 1;
  const nextRank: Rank | null = nextIdx < RANK_ORDER.length ? RANK_ORDER[nextIdx] : null;
  const promotionPct = Math.min(promotionWeeks / 4, 1) * 100;
  const promotionStatus = currentIdx === RANK_ORDER.length - 1 ? 'PEAK' : promotionPct >= 100 ? 'READY' : promotionPct >= 50 ? 'RISING' : 'STEADY';
  const rankColor = `var(--color-rank-${rank.toLowerCase()})`;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
        {/* Diegetic header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <p className="text-glow-bright text-[10px] tracking-[0.32em]">‹ RANK ASSESSMENT ›</p>
            <h1 className="font-display text-xl font-bold glow-text leading-none mt-1">HUNTER CLASSIFICATION</h1>
          </div>
        </div>

        {/* Rank glyph + progress */}
        <div className="frame-bracketed">
          <div className="frame-cut p-5 text-center">
            <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Current Rank</p>
            <div
              className="font-display font-bold leading-none my-2"
              style={{
                fontSize: 96,
                color: rankColor,
                textShadow: `0 0 24px color-mix(in srgb, ${rankColor} 60%, transparent), 0 0 60px color-mix(in srgb, ${rankColor} 30%, transparent)`,
              }}
            >
              {rank}
            </div>
            <p className="font-display tracking-[0.18em] text-glow-bright text-sm">{promotionStatus}</p>
            <hr className="border-0 h-px my-3" style={{ background: 'linear-gradient(90deg, transparent, var(--color-border), transparent)' }} />
            <div className="flex items-center justify-between gap-4">
              <div className="text-left">
                <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase">
                  {nextRank ? `Progress to ${nextRank}` : 'Peak Rank'}
                </p>
                <p className="font-display font-bold text-2xl leading-none mt-1">
                  {nextRank ? `${promotionWeeks} / 4 wk` : '—'}
                </p>
                <p className="text-text-muted text-[10px] mt-1">
                  Last eval: {lastEvalPct !== null ? `${lastEvalPct}%` : '—'} · This week: {weeklyPct}%
                </p>
              </div>
              {nextRank && (
                <div className="relative" style={{ width: 64, height: 64 }}>
                  <svg width={64} height={64}>
                    <circle cx={32} cy={32} r={27} fill="none" stroke="var(--color-border)" strokeWidth={4} />
                    <circle
                      cx={32} cy={32} r={27}
                      fill="none"
                      stroke={`var(--color-rank-${nextRank.toLowerCase()})`}
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 27}
                      strokeDashoffset={2 * Math.PI * 27 - (promotionPct / 100) * 2 * Math.PI * 27}
                      transform="rotate(-90 32 32)"
                      style={{ filter: `drop-shadow(0 0 4px var(--color-rank-${nextRank.toLowerCase()}))` }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="font-display font-bold text-lg leading-none"
                      style={{ color: `var(--color-rank-${nextRank.toLowerCase()})` }}
                    >
                      {nextRank}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* Rank ladder */}
        <div className="section-heading text-glow-bright mt-3">// RANK LADDER</div>
        <div className="frame-cut p-2">
          {[...RANK_ORDER].reverse().map((r, i, arr) => {
            const idx = RANK_ORDER.indexOf(r);
            const isCurrent = idx === currentIdx;
            const isAttained = idx < currentIdx;
            const isNext = idx === nextIdx;
            const isLocked = idx > nextIdx;
            const c = `var(--color-rank-${r.toLowerCase()})`;
            const status = isCurrent ? 'CURRENT' : isNext ? 'NEXT' : isAttained ? 'ATTAINED' : 'LOCKED';
            const rowBg = isCurrent ? 'rgba(96,165,250,0.06)' : isNext ? 'rgba(34,197,94,0.04)' : 'transparent';
            return (
              <div
                key={r}
                className="flex items-center justify-between px-2 py-2.5"
                style={{
                  background: rowBg,
                  borderBottom: i < arr.length - 1 ? '1px dashed var(--color-border)' : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="cut-tile flex items-center justify-center font-display font-bold text-xl"
                    style={{
                      width: 36, height: 36,
                      color: isAttained || isNext || isCurrent ? c : 'var(--color-text-muted)',
                      border: `1px solid ${isAttained || isNext || isCurrent ? c : 'var(--color-border)'}`,
                      background: isCurrent ? `color-mix(in srgb, ${c} 14%, transparent)` : 'transparent',
                      textShadow: isCurrent ? `0 0 12px ${c}` : 'none',
                    }}
                  >
                    {r}
                  </div>
                  <div>
                    <div className="text-sm text-text">{RANK_LABELS[r]}</div>
                    <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-0.5">{status}</div>
                  </div>
                </div>
                {isCurrent ? (
                  <span className="hud-chip" style={{ color: 'var(--color-glow-bright)', borderColor: 'rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.06)' }}>
                    <span className="hud-chip__dot" />YOU
                  </span>
                ) : isAttained ? (
                  <span className="text-success text-sm">✓</span>
                ) : isLocked ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                    <rect x="5" y="11" width="14" height="10" rx="1.5" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Last 7 days */}
        <div className="section-heading text-text-dim mt-3">// LAST 7 DAYS</div>
        <div className="frame-cut p-3">
          <div className="grid grid-cols-5 gap-2 text-center">
            {Object.entries(recentStats).map(([stat, count]) => (
              <div key={stat}>
                <p className="font-display font-bold text-glow-bright text-lg leading-none">
                  {count}<span className="text-text-muted text-xs font-normal">/{stat === 'STR' ? 3 : 7}</span>
                </p>
                <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-1">{stat === 'STR' ? 'sess' : 'days'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Last 30 days */}
        <div className="section-heading text-text-dim mt-3">// LAST 30 DAYS</div>
        <div className="frame-cut p-3">
          <div className="grid grid-cols-5 gap-2 text-center">
            {Object.entries(recent30Stats).map(([stat, count]) => (
              <div key={stat}>
                <p className="font-display font-bold text-glow-bright text-lg leading-none">{count}</p>
                <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-1">{stat === 'STR' ? 'sess' : 'days'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements link */}
        <Link
          href="/achievements/list"
          className="frame-cut p-4 flex items-center justify-between gap-3 hover:brightness-110 transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36,
                clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                background: 'rgba(96,165,250,0.10)',
                border: '1px solid rgba(96,165,250,0.4)',
                boxShadow: '0 0 8px rgba(96,165,250,0.2)',
              }}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                className="text-glow-bright"
                aria-hidden
              >
                <path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 13h4v4h-4zM8 21h8M12 17v4" />
              </svg>
            </div>
            <div>
              <div className="font-display font-semibold text-sm text-text">ACHIEVEMENTS</div>
              <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-0.5">{unlockedCount} unlocked · view all →</div>
            </div>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-text-muted flex-shrink-0"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>

        {/* Profile link — identity, acquired, lifetime */}
        <Link
          href="/achievements/profile"
          className="frame-cut p-4 flex items-center justify-between gap-3 hover:brightness-110 transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36,
                clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                background: 'rgba(96,165,250,0.10)',
                border: '1px solid rgba(96,165,250,0.4)',
                boxShadow: '0 0 8px rgba(96,165,250,0.2)',
              }}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                className="text-glow-bright"
                aria-hidden
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </div>
            <div>
              <div className="font-display font-semibold text-sm text-text">PROFILE</div>
              <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-0.5">Identity · acquired · lifetime →</div>
            </div>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-text-muted flex-shrink-0"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>

        {/* Growth link — weekly history & longitudinal view */}
        <Link
          href="/growth"
          className="frame-cut p-4 flex items-center justify-between gap-3 hover:brightness-110 transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36,
                clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                background: 'rgba(96,165,250,0.10)',
                border: '1px solid rgba(96,165,250,0.4)',
                boxShadow: '0 0 8px rgba(96,165,250,0.2)',
              }}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                className="text-glow-bright"
                aria-hidden
              >
                <path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16V13" />
              </svg>
            </div>
            <div>
              <div className="font-display font-semibold text-sm text-text">GROWTH</div>
              <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-0.5">Weekly history · longitudinal →</div>
            </div>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-text-muted flex-shrink-0"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>

        {/* Recall link */}
        <Link
          href="/recall"
          className="frame-cut p-4 flex items-center justify-between gap-3 hover:brightness-110 transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36,
                clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                background: 'rgba(167,139,250,0.08)',
                border: '1px solid rgba(167,139,250,0.35)',
                boxShadow: '0 0 8px rgba(167,139,250,0.15)',
              }}
            >
              <svg
                width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'rgba(167,139,250,0.85)' }}
                aria-hidden
              >
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                <path d="M12 8v4l3 3" />
              </svg>
            </div>
            <div>
              <div className="font-display font-semibold text-sm text-text">RECALL</div>
              <div className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-0.5">Memory reinforcement →</div>
            </div>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-text-muted flex-shrink-0"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </main>
    </div>
  );
}
