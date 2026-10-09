import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/db';
import { matchModality, saveAgiMinutes } from '../agi';

const D = '2026-10-09';
const TARGET = 40;

describe('matchModality', () => {
  it('matches codes and legacy settings labels, case-insensitively', () => {
    expect(matchModality('RUN')).toBe('RUN');
    expect(matchModality('hiit')).toBe('HIIT');
    expect(matchModality('Running')).toBe('RUN');
    expect(matchModality('cycling')).toBe('BIKE');
    expect(matchModality('Yoga')).toBeNull();
    expect(matchModality(undefined)).toBeNull();
  });
});

describe('saveAgiMinutes', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('creates one log, then updates it in place', async () => {
    await saveAgiMinutes(D, 'RUN', 10, TARGET);
    await saveAgiMinutes(D, 'RUN', 25, TARGET);
    const rows = await db.agiLogs.where('date').equals(D).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ minutes: 25, activityType: 'RUN', completed: false });
  });

  it('marks every log on the day completed once the day total reaches target', async () => {
    await saveAgiMinutes(D, 'RUN', 30, TARGET);
    await saveAgiMinutes(D, 'BIKE', 15, TARGET);
    const rows = await db.agiLogs.where('date').equals(D).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.completed)).toBe(true);
  });

  it('minutes 0 removes the log and re-evaluates the rest of the day', async () => {
    await saveAgiMinutes(D, 'RUN', 30, TARGET);
    await saveAgiMinutes(D, 'BIKE', 15, TARGET);
    await saveAgiMinutes(D, 'RUN', 0, TARGET);
    const rows = await db.agiLogs.where('date').equals(D).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ activityType: 'BIKE', minutes: 15, completed: false });
  });

  it('removing a modality that was never logged is a no-op', async () => {
    await saveAgiMinutes(D, 'SWIM', 0, TARGET);
    expect(await db.agiLogs.count()).toBe(0);
  });

  it('updates a legacy-labelled log instead of adding a duplicate', async () => {
    await db.agiLogs.add({ date: D, minutes: 20, activityType: 'Running', completed: false, createdAt: 1 });
    await saveAgiMinutes(D, 'RUN', 45, TARGET);
    const rows = await db.agiLogs.where('date').equals(D).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ minutes: 45, activityType: 'RUN', completed: true });
  });

  it('keeps dates separate', async () => {
    await saveAgiMinutes('2026-10-08', 'RUN', 50, TARGET);
    await saveAgiMinutes(D, 'RUN', 5, TARGET);
    expect(await db.agiLogs.count()).toBe(2);
    const prev = await db.agiLogs.where('date').equals('2026-10-08').first();
    expect(prev?.completed).toBe(true);
  });
});
