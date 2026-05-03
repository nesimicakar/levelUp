'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getToday, getSettings } from '@/lib/db';
import { daysBetween, countActiveDays, computeSystemStreak } from '@/lib/logic/streaks';
import { loadIntCourses } from '@/lib/logic/intCourses';
import type { Rank, IntCourse, FinishedBook } from '@/types';
import { RANK_ORDER } from '@/types';

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDate(input: string | number): string {
  const d = typeof input === 'number' ? new Date(input) : new Date(input + 'T12:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ProfileData {
  rank: Rank;
  startedDate: string;
  daysSinceStart: number;
  currentStreak: number;
  activeDays: number;
  bestStreak: number;
  acquiredCourses: IntCourse[];
  finishedBooks: FinishedBook[];
  totals: {
    strSessions: number;
    cardioMinutes: number;
    bookMinutes: number;
    quranPages: number;
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);

  const load = useCallback(async () => {
    const today = getToday();
    const settings = await getSettings();

    // Rank
    const latestRank = await db.rankHistory.orderBy('createdAt').last();
    const rank: Rank = latestRank?.rank ?? 'E';

    // Identity
    const firstUse = settings.firstUseDate ?? today;
    const daysSinceStart = daysBetween(firstUse, today);

    // All logs
    const [allStr, allAgi, allVit, allInt, allPer] = await Promise.all([
      db.strSessions.toArray(),
      db.agiLogs.toArray(),
      db.vitLogs.toArray(),
      db.intLogs.toArray(),
      db.perLogs.toArray(),
    ]);

    // Active days = unique dates across all stat tables
    const activeDays = countActiveDays([
      allStr.map(s => s.date),
      allAgi.map(l => l.date),
      allVit.map(l => l.date),
      allInt.map(l => l.date),
      allPer.map(l => l.date),
    ]);

    // Streaks (current + best)
    const strCompletedDates = new Set(allStr.filter(s => s.completed && !s.isRestDay).map(s => s.date));
    const agiCompletedDates = new Set(allAgi.filter(l => l.completed).map(l => l.date));
    const vitCompletedDates = new Set(allVit.filter(l => l.completed).map(l => l.date));
    const intCompletedDates = new Set(allInt.filter(l => l.completed).map(l => l.date));
    const perCompletedDates = new Set(allPer.filter(l => l.completed).map(l => l.date));
    const sets = [strCompletedDates, agiCompletedDates, vitCompletedDates, intCompletedDates, perCompletedDates];
    const currentStreak = computeSystemStreak(sets, today);

    // Best streak: longest run of consecutive days where ALL 5 sets had an entry
    const allCandidateDates = new Set<string>();
    for (const s of sets) for (const d of s) allCandidateDates.add(d);
    const fullDays = [...allCandidateDates].filter(d => sets.every(s => s.has(d))).sort();
    let bestStreak = 0;
    let run = 0;
    for (let i = 0; i < fullDays.length; i++) {
      if (i === 0 || addDays(fullDays[i - 1], 1) === fullDays[i]) run++;
      else run = 1;
      if (run > bestStreak) bestStreak = run;
    }

    // Acquired
    const courses = await loadIntCourses();
    const acquiredCourses = courses
      .filter(c => c.status === 'acquired')
      .sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0));
    const finishedBooks = (settings.finishedBooks ?? [])
      .slice()
      .sort((a, b) => b.finishedAt - a.finishedAt);

    // Lifetime totals
    const strSessions = allStr.filter(s => s.completed && !s.isRestDay).length;
    const cardioMinutes = allAgi.reduce((s, l) => s + l.minutes, 0);
    // Lifetime book minutes = current PER readingMinutes + legacy INT learningMinutes
    // (pre-redesign, "book minutes" was logged on INT as learningMinutes)
    const perReading = allPer.reduce((s, l) => s + (l.readingMinutes ?? 0), 0);
    const legacyLearning = allInt.reduce((s, l) => s + (l.learningMinutes ?? 0), 0);
    const bookMinutes = perReading + legacyLearning;
    const quranPages = allPer.reduce((s, l) => s + (l.quranPages ?? 0), 0);

    setData({
      rank,
      startedDate: formatDate(firstUse),
      daysSinceStart,
      currentStreak,
      activeDays,
      bestStreak,
      acquiredCourses,
      finishedBooks,
      totals: { strSessions, cardioMinutes, bookMinutes, quranPages },
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return null;

  const rankColor = `var(--color-rank-${data.rank.toLowerCase()})`;
  const currentIdx = RANK_ORDER.indexOf(data.rank);

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
            <p className="text-glow-bright text-[10px] tracking-[0.32em]">‹ HUNTER FILE ›</p>
            <h1 className="font-display text-xl font-bold glow-text leading-none mt-1">PROFILE</h1>
          </div>
        </div>

        {/* IDENTITY */}
        <div className="frame-bracketed">
          <div className="frame-cut p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Rank</p>
                <div
                  className="font-display font-bold leading-none mt-1"
                  style={{
                    fontSize: 72,
                    color: rankColor,
                    textShadow: `0 0 18px color-mix(in srgb, ${rankColor} 60%, transparent)`,
                  }}
                >
                  {data.rank}
                </div>
                <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-2">
                  Tier {currentIdx + 1} / {RANK_ORDER.length}
                </p>
              </div>
              <div className="text-right space-y-2">
                <div>
                  <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Started</p>
                  <p className="font-display text-text text-sm">{data.startedDate}</p>
                </div>
                <div>
                  <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Days In</p>
                  <p className="font-display text-text text-sm">{data.daysSinceStart}</p>
                </div>
                <div>
                  <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase">Streak</p>
                  <p className="font-display text-glow-bright text-sm">{data.currentStreak} d</p>
                </div>
              </div>
            </div>
          </div>
          <span className="frame-bracket-bottom" aria-hidden />
        </div>

        {/* CONSISTENCY */}
        <div className="section-heading text-text-dim mt-2">// CONSISTENCY</div>
        <div className="frame-cut p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Active Days</span>
            <span className="font-display text-text">{data.activeDays} / {data.daysSinceStart}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Best Streak</span>
            <span className="font-display" style={{ color: 'var(--color-stat-vit)' }}>{data.bestStreak} d</span>
          </div>
        </div>

        {/* ACQUIRED — courses */}
        {data.acquiredCourses.length > 0 && (
          <>
            <div className="section-heading text-text-dim mt-2">// ACQUIRED · COURSES</div>
            <div className="frame-cut p-2 space-y-px">
              {data.acquiredCourses.map((c, i, arr) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-2 py-2"
                  style={{ borderBottom: i < arr.length - 1 ? '1px dashed var(--color-border)' : 'none' }}
                >
                  <div className="min-w-0">
                    <p className="text-text text-sm truncate">{c.name}</p>
                    <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">
                      {c.totalUnits} units{c.acquiredAt ? ` · ${formatDate(c.acquiredAt)}` : ''}
                    </p>
                  </div>
                  <span className="text-success text-sm flex-shrink-0">✓</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ACQUIRED — books */}
        {data.finishedBooks.length > 0 && (
          <>
            <div className="section-heading text-text-dim mt-2">// ACQUIRED · BOOKS</div>
            <div className="frame-cut p-2 space-y-px">
              {data.finishedBooks.map((b, i, arr) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-2 py-2 gap-3"
                  style={{ borderBottom: i < arr.length - 1 ? '1px dashed var(--color-border)' : 'none' }}
                >
                  <div className="min-w-0">
                    <p className="text-text text-sm truncate">{b.title}</p>
                    <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">
                      {b.author ? `${b.author} · ` : ''}{formatDate(b.finishedAt)}
                    </p>
                  </div>
                  <span className="text-success text-sm flex-shrink-0">✓</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty acquired state — only when both lists are empty */}
        {data.acquiredCourses.length === 0 && data.finishedBooks.length === 0 && (
          <>
            <div className="section-heading text-text-dim mt-2">// ACQUIRED</div>
            <div className="frame-cut p-4 text-center">
              <p className="text-text-muted text-xs">Nothing acquired yet. Finish a course or a book to populate this section.</p>
            </div>
          </>
        )}

        {/* LIFETIME TOTALS */}
        <div className="section-heading text-text-dim mt-2">// LIFETIME TOTALS</div>
        <div className="frame-cut p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">STR Sessions</span>
            <span className="font-display text-text">{data.totals.strSessions}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Cardio Minutes</span>
            <span className="font-display text-text">{data.totals.cardioMinutes.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Book Minutes</span>
            <span className="font-display text-text">{data.totals.bookMinutes.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Quran Pages</span>
            <span className="font-display text-text">{data.totals.quranPages.toLocaleString()}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
