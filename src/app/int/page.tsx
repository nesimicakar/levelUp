'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getToday, getSettings, getCourseProgress, updateCourseProgress } from '@/lib/db';
import { computeLevel, computeIntXP, getIntDailyCap } from '@/lib/logic/levels';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { NumberInput } from '@/components/NumberInput';
import type { IntLog, StatLevel, UserSettings, CourseProgress } from '@/types';

export default function IntPage() {
  const [todayLog, setTodayLog] = useState<IntLog | null>(null);
  const [level, setLevel] = useState<StatLevel>({ level: 1, currentXP: 0, xpToNext: 100, progressPct: 0 });
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [courseProgress, setCourseProgress] = useState<CourseProgress | null>(null);
  const [learningMinutes, setLearningMinutes] = useState(0);
  const [unitsToday, setUnitsToday] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const today = getToday();
    const s = await getSettings();
    setSettings(s);

    const existing = await db.intLogs.where('date').equals(today).first();
    if (existing) {
      setTodayLog(existing);
      setLearningMinutes(existing.learningMinutes ?? 0);
      setUnitsToday(existing.courseUnitsCompleted);
    }

    const cp = await getCourseProgress('real-estate');
    setCourseProgress(cp);

    const allLogs = await db.intLogs.toArray();
    const intCap = getIntDailyCap(s.learningMinutesPerDay);
    const cappedMinutes = allLogs.reduce((sum, l) => sum + Math.min(l.learningMinutes ?? 0, intCap), 0);
    const xp = computeIntXP(cappedMinutes, cp.completedUnits);
    setLevel(computeLevel(xp));
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const save = async () => {
    if (!settings) return;
    const today = getToday();
    const completed = learningMinutes >= settings.learningMinutesPerDay && unitsToday >= settings.courseUnitsPerDay;

    if (todayLog?.id) {
      const oldUnits = todayLog.courseUnitsCompleted;
      const delta = unitsToday - oldUnits;
      if (delta > 0) {
        await updateCourseProgress('real-estate', delta);
      }
      await db.intLogs.update(todayLog.id, {
        learningMinutes,
        courseUnitsCompleted: unitsToday,
        completed,
      });
      setTodayLog({ ...todayLog, learningMinutes, courseUnitsCompleted: unitsToday, completed });
    } else {
      if (unitsToday > 0) {
        await updateCourseProgress('real-estate', unitsToday);
      }
      const log: IntLog = {
        date: today,
        pagesRead: 0,
        learningMinutes,
        courseUnitsCompleted: unitsToday,
        completed,
        createdAt: Date.now(),
      };
      const id = await db.intLogs.add(log);
      log.id = id;
      setTodayLog(log);
    }
    await loadData();
  };

  if (!loaded || !settings || !courseProgress) return null;

  const minutesMet = learningMinutes >= settings.learningMinutesPerDay;
  const unitsMet = unitsToday >= settings.courseUnitsPerDay;
  const rePct = Math.round((courseProgress.completedUnits / courseProgress.totalUnits) * 100);

  return (
    <div>
      <PageHeader title="INT // INTELLIGENCE" subtitle={`Level ${level.level}`} />
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
          <h3 className="text-sm font-medium text-text-dim mb-2">REAL ESTATE COURSE</h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text">{courseProgress.completedUnits}/{courseProgress.totalUnits} units</span>
            <span className="text-glow-bright">{rePct}%</span>
          </div>
          <ProgressBar value={rePct} variant="success" />
        </div>

        {/* Today's log */}
        <div className="stat-card rounded-lg p-4 glow-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-dim">TODAY&apos;S PROTOCOL</h3>
            {minutesMet && unitsMet && (
              <span className="text-success text-xs font-medium tracking-wider">COMPLETE</span>
            )}
          </div>

          <div>
            <NumberInput
              value={learningMinutes}
              onChange={setLearningMinutes}
              label="Learning minutes"
              min={0}
              max={600}
              step={5}
              unit="min"
            />
            <div className="text-xs text-text-muted mt-1 ml-1">
              {minutesMet ? '\u2713 Target met' : `${settings.learningMinutesPerDay - learningMinutes} min to go`}
            </div>
          </div>

          <div>
            <NumberInput
              value={unitsToday}
              onChange={setUnitsToday}
              label="Course units"
              min={0}
              max={50}
              step={1}
              unit="units"
            />
            <div className="text-xs text-text-muted mt-1 ml-1">
              {unitsMet ? '\u2713 Target met' : `${settings.courseUnitsPerDay - unitsToday} units to go`}
            </div>
          </div>

          <button
            onClick={save}
            className={`w-full p-3 rounded-lg font-medium tracking-wider transition-colors ${
              minutesMet && unitsMet
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
