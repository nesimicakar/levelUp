import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/db';
import { DEFAULT_POSTURE_ROUTINE, getPostureRoutine, saveVitLog, isVitComplete } from '../vit';

describe('getPostureRoutine', () => {
  it('falls back to the default routine when never customised', () => {
    expect(getPostureRoutine({})).toBe(DEFAULT_POSTURE_ROUTINE);
    expect(getPostureRoutine(null)).toBe(DEFAULT_POSTURE_ROUTINE);
  });

  it('returns the saved routine, including an intentionally empty one', () => {
    const custom = [{ id: 'a', name: 'Dead hang', duration: '30 s' }];
    expect(getPostureRoutine({ vitPostureRoutine: custom })).toBe(custom);
    expect(getPostureRoutine({ vitPostureRoutine: [] })).toEqual([]);
  });

  it('default routine has unique ids and names', () => {
    const ids = new Set(DEFAULT_POSTURE_ROUTINE.map(e => e.id));
    expect(ids.size).toBe(DEFAULT_POSTURE_ROUTINE.length);
    expect(DEFAULT_POSTURE_ROUTINE.every(e => e.name && e.duration)).toBe(true);
  });
});


describe('saveVitLog', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('isVitComplete needs 7h sleep, protein and posture', () => {
    expect(isVitComplete({ sleepHours: 7, proteinMet: true, postureMet: true })).toBe(true);
    expect(isVitComplete({ sleepHours: 6.5, proteinMet: true, postureMet: true })).toBe(false);
    expect(isVitComplete({ sleepHours: 8, proteinMet: false, postureMet: true })).toBe(false);
    expect(isVitComplete({ sleepHours: 8, proteinMet: true, postureMet: false })).toBe(false);
  });

  it('creates one row, then updates it in place across repeated saves', async () => {
    await saveVitLog('2026-10-09', { sleepHours: 0, proteinMet: true, postureMet: false });
    await saveVitLog('2026-10-09', { sleepHours: 7.5, proteinMet: true, postureMet: false });
    await saveVitLog('2026-10-09', { sleepHours: 7.5, proteinMet: true, postureMet: true });
    const rows = await db.vitLogs.where('date').equals('2026-10-09').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sleepHours: 7.5, proteinGoalMet: true, postureMobilityMet: true, completed: true });
  });

  it('un-ticking a protocol flips completed back to false', async () => {
    await saveVitLog('2026-10-09', { sleepHours: 8, proteinMet: true, postureMet: true });
    await saveVitLog('2026-10-09', { sleepHours: 8, proteinMet: true, postureMet: false });
    const row = await db.vitLogs.where('date').equals('2026-10-09').first();
    expect(row?.completed).toBe(false);
  });

  it('keeps separate rows for different dates', async () => {
    await saveVitLog('2026-10-08', { sleepHours: 8, proteinMet: true, postureMet: true });
    await saveVitLog('2026-10-09', { sleepHours: 5, proteinMet: false, postureMet: false });
    expect(await db.vitLogs.count()).toBe(2);
  });
});
