'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getSettings, getCourseProgress, updateCourseProgress } from '@/lib/db';
import { computeLevel, computePerXP } from '@/lib/logic/levels';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { NumberInput } from '@/components/NumberInput';
import type { PerLog, StatLevel, UserSettings, CourseProgress } from '@/types';

export default function PerPage() {
  const [todayLog, setTodayLog] = useState<PerLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [courseProgress, setCourseProgress] = useState<CourseProgress | null>(null);
  const [lessonsToday, setLessonsToday] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const today = getToday();
    const s = await getSettings();
    setSettings(s);

    const existing = await db.perLogs.where('date').equals(today).first();
    if (existing) {
      setTodayLog(existing);
      setLessonsToday(existing.lessonsCompleted);
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
    const completed = lessonsToday >= settings.lessonsPerDay;

    if (todayLog?.id) {
      const oldLessons = todayLog.lessonsCompleted;
      const delta = lessonsToday - oldLessons;
      if (delta > 0) {
        await updateCourseProgress('stage-academy', delta);
      }
      await db.perLogs.update(todayLog.id, {
        lessonsCompleted: lessonsToday,
        completed,
      });
      setTodayLog({ ...todayLog, lessonsCompleted: lessonsToday, completed });
    } else {
      if (lessonsToday > 0) {
        await updateCourseProgress('stage-academy', lessonsToday);
      }
      const log: PerLog = {
        date: today,
        lessonsCompleted: lessonsToday,
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

  const targetMet = lessonsToday >= settings.lessonsPerDay;
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
          <h3 className="text-sm font-medium text-text-dim mb-2">STAGEACADEMY</h3>
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
            {targetMet && (
              <span className="text-success text-xs font-medium tracking-wider">COMPLETE</span>
            )}
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
            {targetMet
              ? '✓ Daily target met'
              : `${settings.lessonsPerDay - lessonsToday} lessons to go`}
          </div>

          <button
            onClick={save}
            className={`w-full p-3 rounded-lg font-medium tracking-wider transition-colors ${
              targetMet
                ? 'bg-glow/10 border border-glow/30 text-glow hover:bg-glow/20'
                : 'bg-surface border border-border text-text-dim'
            }`}
          >
            {todayLog ? 'UPDATE' : 'LOG TODAY'}
          </button>
        </div>
      </main>
    </div>
  );
}
