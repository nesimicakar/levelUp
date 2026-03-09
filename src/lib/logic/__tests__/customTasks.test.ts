import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { LevelUpDB } from '../../db';
import type { UserSettings, CustomTask } from '@/types';

// ===== Settings Backfill ===== //

describe('settings backfill', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    // fresh DB for each test
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
  });

  async function getSettings(): Promise<UserSettings> {
    const s = await db.settings.toCollection().first();
    if (s) {
      if (s.quranPagesPerDay === undefined) s.quranPagesPerDay = 1;
      if (s.learningMinutesPerDay === undefined) s.learningMinutesPerDay = 20;
      if (s.intCourseName === undefined) s.intCourseName = 'Primary Study';
      if (s.perProgramName === undefined) s.perProgramName = 'Skill Development';
      if (s.customTasks === undefined) s.customTasks = [];
      return s;
    }
    const defaults: UserSettings = {
      readingPagesPerDay: 20,
      learningMinutesPerDay: 20,
      courseUnitsPerDay: 4,
      lessonsPerDay: 2,
      quranPagesPerDay: 1,
      proteinGoalGrams: 130,
      hydrationGoalLiters: 2.0,
      agiActivityType: 'Rowing',
      agiMinMinutes: 10,
      strUpperIncrement: 5,
      strLowerIncrement: 10,
      intCourseName: 'Primary Study',
      perProgramName: 'Skill Development',
      customTasks: [],
    };
    await db.settings.add(defaults);
    return defaults;
  }

  it('creates defaults with intCourseName and perProgramName when no settings exist', async () => {
    const s = await getSettings();
    expect(s.intCourseName).toBe('Primary Study');
    expect(s.perProgramName).toBe('Skill Development');
    expect(s.customTasks).toEqual([]);
  });

  it('backfills intCourseName when missing from existing settings', async () => {
    // Simulate old settings without new fields
    await db.settings.add({
      readingPagesPerDay: 20,
      learningMinutesPerDay: 20,
      courseUnitsPerDay: 4,
      lessonsPerDay: 2,
      quranPagesPerDay: 1,
      proteinGoalGrams: 130,
      hydrationGoalLiters: 2.0,
      agiActivityType: 'Rowing',
      agiMinMinutes: 10,
      strUpperIncrement: 5,
      strLowerIncrement: 10,
    } as UserSettings);

    const s = await getSettings();
    expect(s.intCourseName).toBe('Primary Study');
    expect(s.perProgramName).toBe('Skill Development');
    expect(s.customTasks).toEqual([]);
  });

  it('preserves custom names when already set', async () => {
    await db.settings.add({
      readingPagesPerDay: 20,
      learningMinutesPerDay: 20,
      courseUnitsPerDay: 4,
      lessonsPerDay: 2,
      quranPagesPerDay: 1,
      proteinGoalGrams: 130,
      hydrationGoalLiters: 2.0,
      agiActivityType: 'Rowing',
      agiMinMinutes: 10,
      strUpperIncrement: 5,
      strLowerIncrement: 10,
      intCourseName: 'Cybersecurity',
      perProgramName: 'Udemy Course',
      customTasks: [],
    } as UserSettings);

    const s = await getSettings();
    expect(s.intCourseName).toBe('Cybersecurity');
    expect(s.perProgramName).toBe('Udemy Course');
  });
});

// ===== Custom Tasks CRUD ===== //

describe('custom tasks', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
  });

  async function getSettings(): Promise<UserSettings> {
    const s = await db.settings.toCollection().first();
    if (s) {
      if (s.customTasks === undefined) s.customTasks = [];
      return s;
    }
    const defaults: UserSettings = {
      readingPagesPerDay: 20,
      learningMinutesPerDay: 20,
      courseUnitsPerDay: 4,
      lessonsPerDay: 2,
      quranPagesPerDay: 1,
      proteinGoalGrams: 130,
      hydrationGoalLiters: 2.0,
      agiActivityType: 'Rowing',
      agiMinMinutes: 10,
      strUpperIncrement: 5,
      strLowerIncrement: 10,
      intCourseName: 'Primary Study',
      perProgramName: 'Skill Development',
      customTasks: [],
    };
    await db.settings.add(defaults);
    return defaults;
  }

  it('adding a custom task persists to settings', async () => {
    const s = await getSettings();
    const task: CustomTask = {
      id: 'task-1',
      skill: 'STR',
      label: 'Do laundry',
      enabled: true,
      createdAt: Date.now(),
    };
    const updated = [...(s.customTasks ?? []), task];
    await db.settings.update(s.id!, { customTasks: updated });

    const after = await getSettings();
    expect(after.customTasks).toHaveLength(1);
    expect(after.customTasks![0].label).toBe('Do laundry');
    expect(after.customTasks![0].skill).toBe('STR');
  });

  it('deleting a custom task removes it from settings and cleans logs', async () => {
    const s = await getSettings();
    const task: CustomTask = {
      id: 'task-del',
      skill: 'VIT',
      label: 'Stretch',
      enabled: true,
      createdAt: Date.now(),
    };
    await db.settings.update(s.id!, { customTasks: [task] });

    // Add a log
    await db.customTaskLogs.add({ date: '2025-03-01', taskId: 'task-del', checked: true, updatedAt: Date.now() });
    expect(await db.customTaskLogs.count()).toBe(1);

    // Delete
    const current = await getSettings();
    const remaining = (current.customTasks ?? []).filter(t => t.id !== 'task-del');
    await db.settings.update(current.id!, { customTasks: remaining });
    await db.customTaskLogs.where('taskId').equals('task-del').delete();

    const after = await getSettings();
    expect(after.customTasks).toHaveLength(0);
    expect(await db.customTaskLogs.count()).toBe(0);
  });

  it('filtering enabled tasks by skill', async () => {
    const s = await getSettings();
    const tasks: CustomTask[] = [
      { id: 't1', skill: 'STR', label: 'Clean', enabled: true, createdAt: 1 },
      { id: 't2', skill: 'AGI', label: 'Walk dog', enabled: true, createdAt: 2 },
      { id: 't3', skill: 'STR', label: 'Mow lawn', enabled: false, createdAt: 3 },
      { id: 't4', skill: 'STR', label: 'Cook', enabled: true, createdAt: 4 },
    ];
    await db.settings.update(s.id!, { customTasks: tasks });

    const after = await getSettings();
    const strEnabled = (after.customTasks ?? []).filter(t => t.skill === 'STR' && t.enabled);
    expect(strEnabled).toHaveLength(2);
    expect(strEnabled.map(t => t.label)).toEqual(['Clean', 'Cook']);
  });
});

// ===== Custom Task Daily Checks ===== //

describe('custom task daily checks', () => {
  let db: LevelUpDB;

  beforeEach(async () => {
    db = new LevelUpDB();
    await db.delete();
    db = new LevelUpDB();
  });

  it('saves and retrieves a task check for a date', async () => {
    await db.customTaskLogs.add({ date: '2025-03-01', taskId: 'task-1', checked: true, updatedAt: Date.now() });

    const logs = await db.customTaskLogs.where('date').equals('2025-03-01').toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].checked).toBe(true);
    expect(logs[0].taskId).toBe('task-1');
  });

  it('updates existing check via compound index', async () => {
    await db.customTaskLogs.add({ date: '2025-03-01', taskId: 'task-1', checked: false, updatedAt: 1000 });

    const existing = await db.customTaskLogs.where('[date+taskId]').equals(['2025-03-01', 'task-1']).first();
    expect(existing).toBeDefined();
    await db.customTaskLogs.update(existing!.id!, { checked: true, updatedAt: 2000 });

    const after = await db.customTaskLogs.where('[date+taskId]').equals(['2025-03-01', 'task-1']).first();
    expect(after!.checked).toBe(true);
    expect(after!.updatedAt).toBe(2000);
  });

  it('multiple tasks on same date are independent', async () => {
    await db.customTaskLogs.add({ date: '2025-03-01', taskId: 'task-1', checked: true, updatedAt: Date.now() });
    await db.customTaskLogs.add({ date: '2025-03-01', taskId: 'task-2', checked: false, updatedAt: Date.now() });

    const logs = await db.customTaskLogs.where('date').equals('2025-03-01').toArray();
    expect(logs).toHaveLength(2);

    const t1 = logs.find(l => l.taskId === 'task-1');
    const t2 = logs.find(l => l.taskId === 'task-2');
    expect(t1!.checked).toBe(true);
    expect(t2!.checked).toBe(false);
  });

  it('same task on different dates are separate entries', async () => {
    await db.customTaskLogs.add({ date: '2025-03-01', taskId: 'task-1', checked: true, updatedAt: Date.now() });
    await db.customTaskLogs.add({ date: '2025-03-02', taskId: 'task-1', checked: false, updatedAt: Date.now() });

    const day1 = await db.customTaskLogs.where('[date+taskId]').equals(['2025-03-01', 'task-1']).first();
    const day2 = await db.customTaskLogs.where('[date+taskId]').equals(['2025-03-02', 'task-1']).first();
    expect(day1!.checked).toBe(true);
    expect(day2!.checked).toBe(false);
  });
});
