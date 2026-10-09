import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, getSettings, updateSettings } from '@/lib/db';
import { loadIntCourses, saveIntCourses, LEGACY_RE_ID, LEGACY_SA_ID } from '../intCourses';
import type { IntCourse } from '@/types';

const phantom = (id: string, name: string, total: number): IntCourse => ({
  id, name, totalUnits: total, completedUnits: 0, dailyTargetUnits: 2, status: 'active', createdAt: 1,
});

describe('loadIntCourses', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await getSettings(); // seed the settings row
  });

  it('gives a brand-new user NO courses (nothing auto-seeded)', async () => {
    expect(await loadIntCourses()).toEqual([]);
    expect((await getSettings()).intCourses).toEqual([]);
  });

  it('does not reseed after the user deletes every course', async () => {
    await saveIntCourses([phantom('course-1', 'Spanish', 60)]);
    await updateSettings({ intPhantomCleanupDone: true });
    await saveIntCourses([]);
    expect(await loadIntCourses()).toEqual([]);
  });

  it('migrates legacy data only when real legacy activity exists', async () => {
    await db.courseProgress.add({ courseId: 'real-estate', totalUnits: 200, completedUnits: 12, lastUpdated: 1 });
    const courses = await loadIntCourses();
    expect(courses.map(c => c.id)).toEqual([LEGACY_RE_ID, LEGACY_SA_ID]);
    expect(courses[0].completedUnits).toBe(12);
  });

  it('treats customised legacy names as real activity', async () => {
    await updateSettings({ intCourseName: 'Real Estate' });
    expect((await loadIntCourses()).length).toBe(2);
  });

  it('a zero-progress courseProgress row alone is NOT activity', async () => {
    await db.courseProgress.add({ courseId: 'stage-academy', totalUnits: 144, completedUnits: 0, lastUpdated: 1 });
    expect(await loadIntCourses()).toEqual([]);
  });
});

describe('phantom cleanup for already-seeded users', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await getSettings();
  });

  const seedPhantoms = () => updateSettings({
    intCourses: [
      phantom(LEGACY_RE_ID, 'Primary Study', 200),
      phantom(LEGACY_SA_ID, 'Skill Development', 144),
    ],
  });

  it('removes untouched auto-seeded courses once', async () => {
    await seedPhantoms();
    expect(await loadIntCourses()).toEqual([]);
    expect((await getSettings()).intPhantomCleanupDone).toBe(true);
  });

  it('keeps a seeded course that has progress', async () => {
    await updateSettings({
      intCourses: [{ ...phantom(LEGACY_RE_ID, 'Primary Study', 200), completedUnits: 5 }, phantom(LEGACY_SA_ID, 'Skill Development', 144)],
    });
    const out = await loadIntCourses();
    expect(out.map(c => c.id)).toEqual([LEGACY_RE_ID]);
  });

  it('keeps a seeded course the user renamed or resized', async () => {
    await updateSettings({
      intCourses: [phantom(LEGACY_RE_ID, 'Real Estate', 200), phantom(LEGACY_SA_ID, 'Skill Development', 100)],
    });
    expect((await loadIntCourses()).length).toBe(2);
  });

  it('keeps a seeded course that has logged units against it', async () => {
    await seedPhantoms();
    await db.intLogs.add({ date: '2026-10-01', pagesRead: 0, courseUnitsCompleted: 0, unitsByCourse: { [LEGACY_SA_ID]: 1 }, completed: false, createdAt: 1 });
    expect((await loadIntCourses()).map(c => c.id)).toEqual([LEGACY_SA_ID]);
  });

  it("never touches the user's own courses and never runs twice", async () => {
    const mine = phantom('course-abc', 'Spanish', 60);
    await updateSettings({ intCourses: [phantom(LEGACY_RE_ID, 'Primary Study', 200), mine] });
    expect(await loadIntCourses()).toEqual([mine]);
    // Re-adding an identical phantom later must NOT be removed again (flag is set).
    await saveIntCourses([phantom(LEGACY_RE_ID, 'Primary Study', 200), mine]);
    expect((await loadIntCourses()).length).toBe(2);
  });
});
