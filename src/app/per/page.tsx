'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getSettings, getCourseProgress, updateCourseProgress } from '@/lib/db';
import { computeLevel, computePerXP } from '@/lib/logic/levels';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { NumberInput } from '@/components/NumberInput';
import { CustomTasksSection } from '@/components/CustomTasksSection';
import type { PerLog, StatLevel, UserSettings, CourseProgress } from '@/types';

export default function PerPage() {
  const [todayLog, setTodayLog] = useState<PerLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [courseProgress, setCourseProgress] = useState<CourseProgress | null>(null);
  const [lessonsToday, setLessonsToday] = useState(0);
  const [prayers, setPrayers] = useState(0);
  const [quranPages, setQuranPages] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const today = getToday();
    const s = await getSettings();
    setSettings(s);

    const existing = await db.perLogs.where('date').equals(today).first();
    if (existing) {
      setTodayLog(existing);
      setLessonsToday(existing.lessonsCompleted);
      setPrayers(existing.prayersCount ?? 0);
      setQuranPages(existing.quranPages ?? 0);
    }

    const cp = await getCourseProgress('stage-academy');
    setCourseProgress(cp);

    const xp = computePerXP(cp.completedUnits);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const save = async () => {
    if (!settings) return;
    const today = getToday();
    const lessonsMet = lessonsToday >= settings.lessonsPerDay;
    const prayersMet = prayers >= 5;
    const quranMet = quranPages >= settings.quranPagesPerDay;
    const completed = lessonsMet && prayersMet && quranMet;

    if (todayLog?.id) {
      const oldLessons = todayLog.lessonsCompleted;
      const delta = lessonsToday - oldLessons;
      if (delta > 0) {
        await updateCourseProgress('stage-academy', delta);
      }
      await db.perLogs.update(todayLog.id, {
        lessonsCompleted: lessonsToday,
        prayersCount: prayers,
        quranPages,
        completed,
      });
      setTodayLog({ ...todayLog, lessonsCompleted: lessonsToday, prayersCount: prayers, quranPages, completed });
    } else {
      if (lessonsToday > 0) {
        await updateCourseProgress('stage-academy', lessonsToday);
      }
      const log: PerLog = {
        date: today,
        lessonsCompleted: lessonsToday,
        prayersCount: prayers,
        quranPages,
        completed,
        createdAt: Date.now(),
      };
      const id = await db.perLogs.add(log);
      log.id = id;
      setTodayLog(log);
    }
    await loadData();
  };

  if (!loaded || !settings || !courseProgress) return null;

  const lessonsMet = lessonsToday >= settings.lessonsPerDay;
  const prayersMet = prayers >= 5;
  const quranMet = quranPages >= settings.quranPagesPerDay;
  const allMet = lessonsMet && prayersMet && quranMet;
  const checkCount = [lessonsMet, prayersMet, quranMet].filter(Boolean).length;
  const saPct = Math.round((courseProgress.completedUnits / courseProgress.totalUnits) * 100);

  return (
    <div>
      <PageHeader title="PER // PERCEPTION" subtitle={`Level ${level.level}`} />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Level progress */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-dim">Level {level.level}</span>
            <span className="text-text-muted">{level.currentXP}/{level.xpToNext} XP</span>
          </div>
          <ProgressBar value={level.progressPct} />
        </div>

        {/* Course overall progress */}
        <div className="stat-card rounded-lg p-4 glow-border">
          <h3 className="text-sm font-medium text-text-dim mb-2">{(settings.perProgramName ?? 'Skill Development').toUpperCase()}</h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text">{courseProgress.completedUnits}/{courseProgress.totalUnits} lessons</span>
            <span className="text-glow-bright">{saPct}%</span>
          </div>
          <ProgressBar value={saPct} variant="success" />
        </div>

        {/* Today's log */}
        <div className="stat-card rounded-lg p-4 glow-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-dim">TODAY&apos;S PROTOCOL</h3>
            <span className={`text-xs font-medium tracking-wider ${allMet ? 'text-success' : 'text-warning'}`}>
              {checkCount}/3
            </span>
          </div>

          <NumberInput
            value={lessonsToday}
            onChange={setLessonsToday}
            label="Lessons completed"
            min={0}
            max={20}
            step={1}
            unit="lessons"
          />
          <div className="text-xs text-text-muted ml-1">
            {lessonsMet
              ? '\u2713 Daily target met'
              : `${settings.lessonsPerDay - lessonsToday} lessons to go`}
          </div>

          {/* Spirituality */}
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-medium text-text-dim mb-3">SPIRITUALITY</h4>
            <div className="text-[10px] text-text-muted mb-3">Daily reset.</div>

            <NumberInput
              value={prayers}
              onChange={setPrayers}
              label="Prayers"
              min={0}
              max={5}
              step={1}
              unit={`/ 5`}
            />
            <div className="text-xs text-text-muted ml-1 mb-3">
              {prayersMet ? '\u2713 All prayers completed' : `${5 - prayers} remaining`}
            </div>

            <NumberInput
              value={quranPages}
              onChange={setQuranPages}
              label="Quran pages"
              min={0}
              max={100}
              step={1}
              unit="pg"
            />
            <div className="text-xs text-text-muted ml-1">
              {quranMet
                ? '\u2713 Quran target met'
                : `${settings.quranPagesPerDay - quranPages} pages to go`}
            </div>
          </div>

          <button
            onClick={save}
            className={`w-full p-3 rounded-lg font-medium tracking-wider transition-colors ${
              allMet
                ? 'bg-glow/10 border border-glow/30 text-glow hover:bg-glow/20'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            {todayLog ? 'UPDATE' : 'LOG TODAY'}
          </button>
        </div>

        <CustomTasksSection skill="PER" />
      </main>
    </div>
  );
}
