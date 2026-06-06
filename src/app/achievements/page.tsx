'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db, getToday, getWeekStart, getSettings } from '@/lib/db';
import { computeWeeklyCompletionPct, countConsecutiveWeeksAbove80, type WeeklyCompletionInput } from '@/lib/logic/rank';
import { checkAndUnlockAchievements } from '@/lib/logic/achievements';
import { computeAgiStreak, computeStatCompletedDays, daysBetween } from '@/lib/logic/streaks';
import { getCourseProgress } from '@/lib/db';
import type { Achievement, Rank } from '@/types';
import { RANK_ORDER } from '@/types';

const RANK_TITLES: Record<Rank, string> = {
  E: 'Weak Hunter',
  D: 'Initiate Hunter',
  C: 'Rising Hunter',
  B: 'Elite Hunter',
  A: 'Awakened Hunter',
  S: 'Ascendant Hunter',
};

type DayStatus = 'done' | 'active' | 'empty';

export default function RecordPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [weeklyPct, setWeeklyPct] = useState(0);
  const [rank, setRank] = useState<Rank>('E');
  const [promotionWeeks, setPromotionWeeks] = useState(0);
  const [weeklyStatCounts, setWeeklyStatCounts] = useState({ str: 0, agi: 0, vit: 0, int: 0, per: 0, strRequired: 3 });
  const [weekDayStatuses, setWeekDayStatuses] = useState<DayStatus[]>([]);
  const [daysCompleted, setDaysCompleted] = useState(0);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [dayCount, setDayCount] = useState(0);
  const [showCharacterVisuals, setShowCharacterVisuals] = useState(true);
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
    const settings = await getSettings();

    // Day count — same source and math as Profile: settings.firstUseDate + daysBetween()
    const firstUse = settings.firstUseDate ?? today;
    setDayCount(daysBetween(firstUse, today));
    setShowCharacterVisuals(settings.showCharacterVisuals ?? true);
    const weekStart = getWeekStart(today);

    // STR for current week
    const weekStrSessions = await db.strSessions.where('date').between(weekStart, today + '￿').toArray();
    const strCompleted = weekStrSessions.filter(s => s.completed || s.isRestDay).length;

    // All 7 days of current week
    const weekDays: string[] = [];
    const wdStart = new Date(weekStart + 'T12:00:00');
    for (let i = 0; i < 7; i++) {
      const wd = new Date(wdStart);
      wd.setDate(wd.getDate() + i);
      weekDays.push(wd.toISOString().split('T')[0]);
    }

    let agiComp = 0, vitComp = 0, intComp = 0, perComp = 0;
    const dayStatuses: DayStatus[] = [];
    let daysComp = 0;
    let daysEl = 0;

    for (const date of weekDays) {
      if (date > today) {
        dayStatuses.push('empty');
        continue;
      }
      daysEl++;
      const a = await db.agiLogs.where('date').equals(date).first();
      const v = await db.vitLogs.where('date').equals(date).first();
      const il = await db.intLogs.where('date').equals(date).first();
      const p = await db.perLogs.where('date').equals(date).first();

      // Weekly totals — unchanged, used for the % calculation
      if (a?.completed) agiComp++;
      if (v?.completed) vitComp++;
      if (il?.completed) intComp++;
      if (p?.completed) perComp++;

      // Day-square logic: AGI, VIT, INT, PER only (4 daily pillars; STR is weekly)
      const dailyDone = [a?.completed, v?.completed, il?.completed, p?.completed].filter(Boolean).length;

      if (dailyDone >= 3) {
        // ≥ 3/4 pillars → green check (3 = qualifying, 4 = full)
        daysComp++;
        dayStatuses.push('done');
      } else if (dailyDone >= 1 || date === today) {
        // 1–2 pillars done (any day) or today still in progress → partial dot
        dayStatuses.push('active');
      } else {
        // 0 pillars, past day → dim
        dayStatuses.push('empty');
      }
    }

    setWeekDayStatuses(dayStatuses);
    setDaysCompleted(daysComp);
    setDaysElapsed(daysEl);

    const strRequired = settings.strSessionsPerWeek ?? 3;
    const input: WeeklyCompletionInput = {
      strCompleted: Math.min(strCompleted, strRequired),
      agiCompleted: agiComp,
      vitCompleted: vitComp,
      intCompleted: intComp,
      perCompleted: perComp,
    };
    setWeeklyPct(computeWeeklyCompletionPct(input, strRequired));
    setWeeklyStatCounts({ str: input.strCompleted, agi: agiComp, vit: vitComp, int: intComp, per: perComp, strRequired });
    setRank(latestRank?.rank ?? 'E');

    const rankRecords = await db.rankHistory.orderBy('weekStart').reverse().toArray();
    setPromotionWeeks(countConsecutiveWeeksAbove80(rankRecords));

    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!loaded) return null;

  const unlockedCount = achievements.length;
  const currentIdx = RANK_ORDER.indexOf(rank);
  const nextIdx = currentIdx + 1;
  const nextRank: Rank | null = nextIdx < RANK_ORDER.length ? RANK_ORDER[nextIdx] : null;
  const weeksRemaining = Math.max(0, 4 - promotionWeeks);
  const rankColor = `var(--color-rank-${rank.toLowerCase()})`;
  const nextRankColor = nextRank ? `var(--color-rank-${nextRank.toLowerCase()})` : null;
  const progressPct = Math.round(Math.min(promotionWeeks / 4, 1) * 100);

  const qualifyColor = weeklyPct >= 80 ? 'var(--color-success)' : weeklyPct >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';
  const weeklyStatus = weeklyPct >= 80 ? 'QUALIFYING' : weeklyPct >= 60 ? 'BUILDING' : 'BELOW';
  const weeklyStatusColor = weeklyPct >= 80 ? 'var(--color-success)' : weeklyPct >= 60 ? 'var(--color-warning)' : 'var(--color-text-muted)';
  const weeklyStatusBorder = weeklyPct >= 80 ? 'rgba(34,197,94,0.4)' : weeklyPct >= 60 ? 'rgba(245,158,11,0.4)' : 'var(--color-border)';
  const dayQualified = daysElapsed > 0 && daysCompleted / daysElapsed >= 0.8;

  const titleWords = RANK_TITLES[rank].split(' ');

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24 space-y-3">

        {/* Header */}
        <div className="mb-1">
          <p className="text-[10px] tracking-[0.32em]" style={{ color: 'var(--color-glow-bright)' }}>‹ HUNTER RECORD ›</p>
          <h1 className="font-display text-xl font-bold glow-text leading-none mt-0.5">RECORD</h1>
        </div>

        {/* ── Hero — character image or text HUD depending on setting ───── */}
        {showCharacterVisuals ? (
          /* ── Character artwork hero ──────────────────────────────────── */
          <div className="frame-bracketed">
            <div className="frame-cut" style={{ padding: 0 }}>
              <div className="relative" style={{ height: 'clamp(480px, 62vh, 620px)' }}>
                <Image
                  src={`/${rank.toLowerCase()}-rank.png`}
                  alt={RANK_TITLES[rank]}
                  fill
                  style={{ objectFit: 'cover', objectPosition: 'top center' }}
                  priority
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(180deg, rgba(10,14,23,0.15) 0%, transparent 18%, rgba(10,14,23,0.35) 62%, rgba(10,14,23,0.97) 100%)' }}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: `radial-gradient(ellipse at center, transparent 45%, color-mix(in srgb, ${rankColor} 10%, transparent) 100%)` }}
                />
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <div
                    className="font-display text-[9px] tracking-[0.22em] px-2 py-1"
                    style={{ border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(10,14,23,0.55)', color: 'var(--color-glow-bright)', clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }}
                  >
                    CURRENT EVOLUTION
                  </div>
                  {dayCount > 0 && (
                    <div className="font-display text-[9px] tracking-[0.18em] text-text-muted">DAY {dayCount}</div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
                  <div className="flex items-end gap-3 mb-3">
                    <span
                      className="font-display font-black"
                      style={{ fontSize: 72, lineHeight: 0.85, color: rankColor, textShadow: `0 0 36px color-mix(in srgb, ${rankColor} 90%, transparent), 0 0 10px color-mix(in srgb, ${rankColor} 60%, transparent)` }}
                    >
                      {rank}
                    </span>
                    <div className="mb-1">
                      {titleWords.map(word => (
                        <div key={word} className="font-display font-black text-white leading-none" style={{ fontSize: 22, letterSpacing: '0.06em', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
                          {word.toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Link
                    href="/achievements/character"
                    className="inline-flex items-center gap-2 font-display text-[10px] tracking-[0.24em] uppercase px-4 py-1.5 hover:brightness-125 transition-all"
                    style={{ color: rankColor, border: `1px solid color-mix(in srgb, ${rankColor} 45%, transparent)`, background: `color-mix(in srgb, ${rankColor} 10%, rgba(10,14,23,0.75))`, clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
                  >
                    View Character →
                  </Link>
                </div>
              </div>
            </div>
            <span className="frame-bracket-bottom" aria-hidden />
          </div>
        ) : (
          /* ── Text-only HUD hero (character visuals disabled) ─────────── */
          <div className="frame-bracketed">
            <div
              className="frame-cut"
              style={{ padding: '28px 24px 24px', border: `1px solid color-mix(in srgb, ${rankColor} 28%, transparent)` }}
            >
              {/* Top label */}
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.26em', color: 'var(--color-glow-bright)', textTransform: 'uppercase', marginBottom: 18 }}>
                ‹ CURRENT EVOLUTION ›
              </div>

              {/* Rank letter + title */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
                <span
                  className="font-display font-black leading-none"
                  style={{ fontSize: 96, color: rankColor, textShadow: `0 0 40px color-mix(in srgb, ${rankColor} 60%, transparent)` }}
                >
                  {rank}
                </span>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.2em', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                    RANK
                  </div>
                  {titleWords.map(word => (
                    <div key={word} className="font-display font-black leading-none" style={{ fontSize: 22, letterSpacing: '0.06em', color: 'var(--color-text)', textTransform: 'uppercase' }}>
                      {word}
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: `color-mix(in srgb, ${rankColor} 20%, var(--color-border))`, marginBottom: 16 }} />

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                {dayCount > 0 && (
                  <div>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Day</div>
                    <div className="font-display font-bold" style={{ fontSize: 22, color: 'var(--color-text)' }}>{dayCount}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Promotion</div>
                  <div className="font-display font-bold" style={{ fontSize: 22, color: rankColor }}>{promotionWeeks}/4 wks</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>This week</div>
                  <div className="font-display font-bold" style={{ fontSize: 22, color: weeklyPct >= 80 ? 'var(--color-success)' : 'var(--color-text)' }}>{weeklyPct}%</div>
                </div>
              </div>

              {/* Promotion bar */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < promotionWeeks ? rankColor : 'rgba(255,255,255,0.08)', boxShadow: i < promotionWeeks ? `0 0 6px color-mix(in srgb, ${rankColor} 70%, transparent)` : 'none', transition: 'background 0.3s' }} />
                ))}
              </div>
              {nextRank && (
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.16em', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  {weeksRemaining > 0 ? `${weeksRemaining} weeks to ${RANK_TITLES[nextRank]}` : `Ready for promotion`}
                </div>
              )}
            </div>
            <span className="frame-bracket-bottom" aria-hidden />
          </div>
        )}

        {/* ── Rank Progression ────────────────────────────────────────────── */}
        <div className="frame-cut p-4">
          <div className="flex items-center justify-between">
            <div>
              {/* E → D */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-display font-bold text-2xl" style={{ color: rankColor }}>{rank}</span>
                <span className="font-display text-text-muted text-lg">→</span>
                {nextRank ? (
                  <span className="font-display font-bold text-2xl" style={{ color: nextRankColor ?? undefined }}>{nextRank}</span>
                ) : (
                  <span className="font-display font-bold text-2xl text-text-muted">—</span>
                )}
              </div>
              {nextRank ? (
                <>
                  <div className="font-display font-bold leading-none" style={{ fontSize: 30 }}>
                    {promotionWeeks}
                    <span className="font-normal text-text-muted" style={{ fontSize: 15 }}> / 4</span>
                  </div>
                  <div
                    className="font-display tracking-[0.16em] uppercase mt-1"
                    style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
                  >
                    {weeksRemaining > 0
                      ? `${weeksRemaining} WEEK${weeksRemaining === 1 ? '' : 'S'} AWAY`
                      : 'READY TO PROMOTE'}
                  </div>
                </>
              ) : (
                <div className="font-display font-semibold text-text mt-1">Peak rank achieved</div>
              )}
            </div>

            {/* Circular ring */}
            {nextRank && (
              <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
                <svg width={80} height={80}>
                  <circle cx={40} cy={40} r={32} fill="none" stroke="var(--color-border)" strokeWidth={5} />
                  <circle
                    cx={40} cy={40} r={32}
                    fill="none"
                    stroke={nextRankColor ?? 'var(--color-border)'}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - Math.min(promotionWeeks / 4, 1))}
                    transform="rotate(-90 40 40)"
                    style={{
                      filter: `drop-shadow(0 0 5px ${nextRankColor})`,
                      transition: 'stroke-dashoffset 0.6s ease',
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="font-display font-bold leading-none"
                    style={{ fontSize: 16, color: nextRankColor ?? undefined }}
                  >
                    {progressPct}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Weekly Qualifying ────────────────────────────────────────────── */}
        <div className="frame-cut p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <p className="section-heading text-text-muted">// THIS WEEK</p>
            <span
              className="hud-chip"
              style={{ color: weeklyStatusColor, borderColor: weeklyStatusBorder, background: 'transparent' }}
            >
              <span className="hud-chip__dot" />
              {weeklyStatus}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Circular ring */}
            <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
              <svg width={80} height={80}>
                <circle cx={40} cy={40} r={32} fill="none" stroke="var(--color-border)" strokeWidth={5} />
                <circle
                  cx={40} cy={40} r={32}
                  fill="none"
                  stroke={qualifyColor}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={2 * Math.PI * 32 * (1 - weeklyPct / 100)}
                  transform="rotate(-90 40 40)"
                  style={{
                    filter: `drop-shadow(0 0 5px ${qualifyColor})`,
                    transition: 'stroke-dashoffset 0.6s ease',
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display font-bold leading-none" style={{ fontSize: 18 }}>
                  {weeklyPct}<span className="text-text-muted font-normal" style={{ fontSize: 11 }}>%</span>
                </span>
              </div>
            </div>

            {/* Day boxes */}
            <div className="flex-1">
              <div className="flex gap-1 justify-between">
                {(['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const).map((day, i) => {
                  const status: DayStatus = weekDayStatuses[i] ?? 'empty';
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div
                        style={{
                          width: 30, height: 30,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid',
                          borderColor:
                            status === 'done' ? 'rgba(34,197,94,0.55)'
                            : status === 'active' ? 'rgba(96,165,250,0.5)'
                            : 'var(--color-border)',
                          background:
                            status === 'done' ? 'rgba(34,197,94,0.1)'
                            : status === 'active' ? 'rgba(96,165,250,0.06)'
                            : 'transparent',
                          clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)',
                          fontSize: 13,
                          color:
                            status === 'done' ? 'var(--color-success)'
                            : status === 'active' ? 'var(--color-glow-bright)'
                            : 'var(--color-border)',
                        }}
                      >
                        {status === 'done' ? '✓' : status === 'active' ? '•' : ''}
                      </div>
                      <span style={{ fontSize: 8, color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>{day}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 tracking-[0.14em]" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                {daysCompleted} / {daysElapsed} DAYS TO QUALIFY
                {dayQualified && <span style={{ color: 'var(--color-success)', marginLeft: 4 }}>✓</span>}
              </div>
            </div>
          </div>

          {/* Stat breakdown */}
          <div
            className="grid grid-cols-5 gap-2 text-center mt-4 pt-3"
            style={{ borderTop: '1px dashed var(--color-border)' }}
          >
            {(
              [
                { key: 'STR', val: weeklyStatCounts.str, max: weeklyStatCounts.strRequired },
                { key: 'AGI', val: weeklyStatCounts.agi, max: 7 },
                { key: 'VIT', val: weeklyStatCounts.vit, max: 7 },
                { key: 'INT', val: weeklyStatCounts.int, max: 7 },
                { key: 'PER', val: weeklyStatCounts.per, max: 7 },
              ] as const
            ).map(({ key, val, max }) => (
              <div key={key}>
                <p
                  className="font-display font-bold text-sm leading-none"
                  style={{ color: `var(--color-stat-${key.toLowerCase()})` }}
                >
                  {val}<span className="text-text-muted font-normal" style={{ fontSize: 9 }}>/{max}</span>
                </p>
                <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">{key}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Access ─────────────────────────────────────────────────── */}
        <div className="section-heading text-text-muted mt-1">// Quick Access</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: 'Character',
              sub: 'Evolution ladder',
              href: '/achievements/character',
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 2a4 4 0 0 1 4 4v2H8V6a4 4 0 0 1 4-4z" /><path d="M8 8v2a4 4 0 0 0 8 0V8" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                </svg>
              ),
            },
            {
              label: 'Achievements',
              sub: `${unlockedCount} unlocked`,
              href: '/achievements/list',
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 13h4v4h-4zM8 21h8M12 17v4" />
                </svg>
              ),
            },
            {
              label: 'Profile',
              sub: 'Identity · acquired',
              href: '/achievements/profile',
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              ),
            },
            {
              label: 'Growth',
              sub: 'Weekly history',
              href: '/growth',
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16V13" />
                </svg>
              ),
            },
          ].map(({ label, sub, href, icon }) => (
            <Link
              key={href}
              href={href}
              className="frame-cut p-4 flex flex-col gap-2 hover:brightness-110 transition-all"
            >
              <div style={{ color: 'var(--color-glow-bright)' }}>{icon}</div>
              <div>
                <div className="font-display font-semibold text-sm text-text">{label}</div>
                <div className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">{sub}</div>
              </div>
              <div className="text-text-muted text-xs">→</div>
            </Link>
          ))}
        </div>

      </main>
    </div>
  );
}
