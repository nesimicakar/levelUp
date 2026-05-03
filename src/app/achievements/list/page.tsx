'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday } from '@/lib/db';
import { getCourseProgress } from '@/lib/db';
import { getAllAchievementDefs, checkAndUnlockAchievements } from '@/lib/logic/achievements';
import { computeAgiStreak, computeStatCompletedDays } from '@/lib/logic/streaks';
import { RANK_ORDER } from '@/types';
import type { Achievement, StatType } from '@/types';

const STAT_HUE: Record<StatType, string> = {
  STR: 'var(--color-stat-str)',
  AGI: 'var(--color-stat-agi)',
  VIT: 'var(--color-stat-vit)',
  INT: 'var(--color-stat-int)',
  PER: 'var(--color-stat-per)',
};

const TIER_GLYPH = { 1: 'I', 2: 'II', 3: 'III' };

export default function AchievementsListPage() {
  const router = useRouter();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
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
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;

  const allDefs = getAllAchievementDefs();
  const unlockedKeys = new Set(achievements.map(a => a.key));
  const unlockedCount = unlockedKeys.size;
  const totalCount = allDefs.length;
  const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-4">
        {/* Diegetic header */}
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
              aria-label="Back"
            >
              ←
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold glow-text leading-none">ACHIEVEMENTS</h1>
              <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">
                {unlockedCount} / {totalCount} Unlocked
              </p>
            </div>
          </div>
          <span
            className="hud-chip"
            style={{ color: 'var(--color-glow-bright)', borderColor: 'rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.06)' }}
          >
            <span className="hud-chip__dot" />{pct}%
          </span>
        </div>

        {/* Hex badge grid */}
        <div className="grid grid-cols-2 gap-2">
          {allDefs.map(def => {
            const unlocked = unlockedKeys.has(def.key);
            const hue = def.stat ? STAT_HUE[def.stat] : 'var(--color-glow-bright)';
            return (
              <div
                key={def.key}
                className={`frame-cut p-3 ${unlocked ? '' : 'opacity-55'}`}
              >
                {/* Hex badge */}
                <div
                  className="mx-auto mb-2 flex items-center justify-center"
                  style={{
                    width: 44,
                    height: 44,
                    clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                    background: unlocked ? `color-mix(in srgb, ${hue} 12%, transparent)` : 'var(--color-bg)',
                    border: `1px solid ${unlocked ? hue : 'var(--color-border)'}`,
                    boxShadow: unlocked ? `0 0 12px color-mix(in srgb, ${hue} 35%, transparent)` : 'none',
                  }}
                >
                  {unlocked ? (
                    <svg
                      width="20" height="20" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: hue }}
                      aria-hidden
                    >
                      <path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 13h4v4h-4zM8 21h8M12 17v4" />
                    </svg>
                  ) : (
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      className="text-text-muted"
                      aria-hidden
                    >
                      <rect x="5" y="11" width="14" height="10" rx="1.5" />
                      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                    </svg>
                  )}
                </div>

                {/* Title */}
                <div
                  className="font-display font-semibold text-center text-[13px] leading-tight"
                  style={{ color: unlocked ? hue : 'var(--color-text-dim)' }}
                >
                  {def.title}
                </div>

                {/* Description */}
                <div className="text-center text-[10px] text-text-muted mt-1 leading-snug">
                  {def.description}
                </div>

                {/* Tier badge */}
                <div className="text-center text-[9px] text-text-muted tracking-[0.18em] mt-1.5">
                  TIER {TIER_GLYPH[def.tier]}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
