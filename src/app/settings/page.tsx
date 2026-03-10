'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, getSettings, getToday, updateSettings, deleteCustomTask } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import { NumberInput } from '@/components/NumberInput';
import type { UserSettings, CustomTask, StatType } from '@/types';

const SKILL_OPTIONS: StatType[] = ['STR', 'AGI', 'VIT', 'INT', 'PER'];

// --- Backup helpers ---
interface BackupFile {
  appVersion?: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

function isValidBackup(obj: unknown): obj is BackupFile {
  if (!obj || typeof obj !== 'object') return false;
  const b = obj as Record<string, unknown>;
  return typeof b.exportedAt === 'string' && b.tables !== null && typeof b.tables === 'object' && !Array.isArray(b.tables);
}

function getBackupCounts(b: BackupFile): { perTable: Record<string, number>; total: number } {
  const perTable: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(b.tables)) {
    const count = Array.isArray(v) ? v.length : 0;
    perTable[k] = count;
    total += count;
  }
  return { perTable, total };
}

export default function SettingsPage() {
  const [settings, setSettingsState] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [newTaskSkill, setNewTaskSkill] = useState<StatType>('STR');
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [backupDone, setBackupDone] = useState(false);
  const [importPending, setImportPending] = useState<null | { raw: BackupFile; counts: ReturnType<typeof getBackupCounts> }>(null);
  const [confirmText, setConfirmText] = useState('');
  const [importError, setImportError] = useState('');
  const [importFileKey, setImportFileKey] = useState(0);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setSettingsState(s);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const update = async (partial: Partial<UserSettings>) => {
    if (!settings) return;
    await updateSettings(partial);
    setSettingsState({ ...settings, ...partial });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addCustomTask = async () => {
    if (!settings || !newTaskLabel.trim()) return;
    const task: CustomTask = {
      id: crypto.randomUUID(),
      skill: newTaskSkill,
      label: newTaskLabel.trim(),
      enabled: true,
      createdAt: Date.now(),
    };
    const updated = [...(settings.customTasks ?? []), task];
    await update({ customTasks: updated });
    setNewTaskLabel('');
  };

  const toggleCustomTask = async (taskId: string) => {
    if (!settings) return;
    const updated = (settings.customTasks ?? []).map(t =>
      t.id === taskId ? { ...t, enabled: !t.enabled } : t
    );
    await update({ customTasks: updated });
  };

  const removeCustomTask = async (taskId: string) => {
    if (!settings) return;
    await deleteCustomTask(taskId);
    setSettingsState({
      ...settings,
      customTasks: (settings.customTasks ?? []).filter(t => t.id !== taskId),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exportBackup = async () => {
    const [strSessions, agiLogs, vitLogs, intLogs, perLogs, weeklySummaries,
      courseProgress, rankHistory, achievements, settings, customTaskLogs] = await Promise.all([
      db.strSessions.toArray(),
      db.agiLogs.toArray(),
      db.vitLogs.toArray(),
      db.intLogs.toArray(),
      db.perLogs.toArray(),
      db.weeklySummaries.toArray(),
      db.courseProgress.toArray(),
      db.rankHistory.toArray(),
      db.achievements.toArray(),
      db.settings.toArray(),
      db.customTaskLogs.toArray(),
    ]);
    const data = {
      appVersion: 'dev',
      exportedAt: new Date().toISOString(),
      tables: { strSessions, agiLogs, vitLogs, intLogs, perLogs, weeklySummaries, courseProgress, rankHistory, achievements, settings, customTaskLogs },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `levelup-backup-${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDone(true);
  };

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (!isValidBackup(obj)) { setImportError('Invalid backup file.'); return; }
      setImportPending({ raw: obj, counts: getBackupCounts(obj) });
      setConfirmText('');
    } catch {
      setImportError('Failed to parse file. Is it a valid JSON backup?');
    }
  };

  const doRestore = async () => {
    if (!importPending) return;
    const t = importPending.raw.tables;
    const arr = (key: string): unknown[] => (Array.isArray(t[key]) ? t[key] : []);
    try {
      await db.transaction('rw',
        [db.strSessions, db.agiLogs, db.vitLogs, db.intLogs, db.perLogs,
        db.weeklySummaries, db.courseProgress, db.rankHistory,
        db.achievements, db.settings, db.customTaskLogs],
        async () => {
          await db.strSessions.clear();    await db.strSessions.bulkPut(arr('strSessions') as never[]);
          await db.agiLogs.clear();        await db.agiLogs.bulkPut(arr('agiLogs') as never[]);
          await db.vitLogs.clear();        await db.vitLogs.bulkPut(arr('vitLogs') as never[]);
          await db.intLogs.clear();        await db.intLogs.bulkPut(arr('intLogs') as never[]);
          await db.perLogs.clear();        await db.perLogs.bulkPut(arr('perLogs') as never[]);
          await db.weeklySummaries.clear();await db.weeklySummaries.bulkPut(arr('weeklySummaries') as never[]);
          await db.courseProgress.clear(); await db.courseProgress.bulkPut(arr('courseProgress') as never[]);
          await db.rankHistory.clear();    await db.rankHistory.bulkPut(arr('rankHistory') as never[]);
          await db.achievements.clear();   await db.achievements.bulkPut(arr('achievements') as never[]);
          await db.settings.clear();       await db.settings.bulkPut(arr('settings') as never[]);
          await db.customTaskLogs.clear(); await db.customTaskLogs.bulkPut(arr('customTaskLogs') as never[]);
        }
      );
      window.location.reload();
    } catch (err) {
      setImportError(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
      setImportPending(null);
      setImportFileKey(k => k + 1);
    }
  };

  if (!settings) return null;

  const customTasks = settings.customTasks ?? [];
  const groupedTasks = SKILL_OPTIONS.reduce((acc, skill) => {
    const tasks = customTasks.filter(t => t.skill === skill);
    if (tasks.length > 0) acc[skill] = tasks;
    return acc;
  }, {} as Record<StatType, CustomTask[]>);

  return (
    <div>
      <PageHeader title="SYSTEM CONFIG" subtitle="Settings & Targets" />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {saved && (
          <div className="text-center text-success text-xs tracking-wider animate-fade-in">
            CONFIGURATION SAVED
          </div>
        )}

        {/* Program Names */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">PROGRAM NAMES</h3>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
            <span className="text-sm text-text">INT Course Name</span>
            <input
              type="text"
              value={settings.intCourseName ?? 'Primary Study'}
              onChange={e => update({ intCourseName: e.target.value })}
              className="bg-surface-light border border-border rounded px-2 py-1 text-sm text-glow-bright focus:outline-none focus:border-glow w-40 text-right"
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
            <span className="text-sm text-text">PER Program Name</span>
            <input
              type="text"
              value={settings.perProgramName ?? 'Skill Development'}
              onChange={e => update({ perProgramName: e.target.value })}
              className="bg-surface-light border border-border rounded px-2 py-1 text-sm text-glow-bright focus:outline-none focus:border-glow w-40 text-right"
            />
          </div>
        </section>

        {/* Learning */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">INT // LEARNING</h3>
          <NumberInput
            value={settings.learningMinutesPerDay}
            onChange={v => update({ learningMinutesPerDay: v })}
            label="Minutes / day"
            min={5}
            max={120}
            step={5}
            unit="min"
          />
        </section>

        {/* Course */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">INT // {(settings.intCourseName ?? 'Primary Study').toUpperCase()} COURSE</h3>
          <NumberInput
            value={settings.courseUnitsPerDay}
            onChange={v => update({ courseUnitsPerDay: v })}
            label="Units / day"
            min={1}
            max={20}
            step={1}
            unit="units"
          />
        </section>

        {/* Skill Development */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">PER // {(settings.perProgramName ?? 'Skill Development').toUpperCase()}</h3>
          <NumberInput
            value={settings.lessonsPerDay}
            onChange={v => update({ lessonsPerDay: v })}
            label="Lessons / day"
            min={1}
            max={10}
            step={1}
            unit="lessons"
          />
        </section>

        {/* Spirituality */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">PER // SPIRITUALITY</h3>
          <NumberInput
            value={settings.quranPagesPerDay}
            onChange={v => update({ quranPagesPerDay: v })}
            label="Quran pages / day"
            min={1}
            max={20}
            step={1}
            unit="pg"
          />
        </section>

        {/* VIT */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">VIT // NUTRITION</h3>
          <NumberInput
            value={settings.proteinGoalGrams}
            onChange={v => update({ proteinGoalGrams: v })}
            label="Protein target"
            min={50}
            max={300}
            step={10}
            unit="g"
          />
        </section>

        {/* AGI */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">AGI // CARDIO</h3>
          <NumberInput
            value={settings.agiMinMinutes}
            onChange={v => update({ agiMinMinutes: v })}
            label="Minimum minutes"
            min={5}
            max={60}
            step={5}
            unit="min"
          />
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
            <span className="text-sm text-text">Activity type</span>
            <select
              value={settings.agiActivityType}
              onChange={e => update({ agiActivityType: e.target.value })}
              className="bg-surface-light border border-border rounded px-2 py-1 text-sm text-glow-bright focus:outline-none focus:border-glow"
            >
              <option value="Rowing">Rowing</option>
              <option value="Running">Running</option>
              <option value="Cycling">Cycling</option>
              <option value="Swimming">Swimming</option>
            </select>
          </div>
        </section>

        {/* STR increments */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">STR // PROGRESSION</h3>
          <NumberInput
            value={settings.strUpperIncrement}
            onChange={v => update({ strUpperIncrement: v })}
            label="Upper body increment"
            min={1}
            max={20}
            step={1}
            unit="lbs"
          />
          <NumberInput
            value={settings.strLowerIncrement}
            onChange={v => update({ strLowerIncrement: v })}
            label="Lower body increment"
            min={1}
            max={20}
            step={1}
            unit="lbs"
          />
        </section>

        {/* Custom Tasks */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">CUSTOM TASKS</h3>

          {/* Add new task */}
          <div className="p-3 rounded-lg border border-border bg-surface space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={newTaskSkill}
                onChange={e => setNewTaskSkill(e.target.value as StatType)}
                className="bg-surface-light border border-border rounded px-2 py-1 text-sm text-glow-bright focus:outline-none focus:border-glow"
              >
                {SKILL_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                value={newTaskLabel}
                onChange={e => setNewTaskLabel(e.target.value)}
                placeholder="Task label"
                className="flex-1 bg-surface-light border border-border rounded px-2 py-1 text-sm text-text focus:outline-none focus:border-glow"
                onKeyDown={e => { if (e.key === 'Enter') addCustomTask(); }}
              />
              <button
                onClick={addCustomTask}
                disabled={!newTaskLabel.trim()}
                className="px-3 py-1 rounded text-sm font-medium tracking-wider bg-glow/10 border border-glow/30 text-glow hover:bg-glow/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ADD
              </button>
            </div>
          </div>

          {/* Task list grouped by skill */}
          {Object.entries(groupedTasks).map(([skill, tasks]) => (
            <div key={skill} className="space-y-1">
              <p className="text-xs text-text-muted">{skill}</p>
              {tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-surface">
                  <span className={`text-sm ${task.enabled ? 'text-text' : 'text-text-muted line-through'}`}>
                    {task.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCustomTask(task.id)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        task.enabled
                          ? 'border-glow/30 text-glow'
                          : 'border-border text-text-muted'
                      }`}
                    >
                      {task.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => removeCustomTask(task.id)}
                      className="text-xs px-2 py-0.5 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                    >
                      DEL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {customTasks.length === 0 && (
            <p className="text-xs text-text-muted text-center py-2">No custom tasks yet</p>
          )}
        </section>

        {/* Backup */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">BACKUP</h3>

          {/* Export */}
          <div className="p-3 rounded-lg border border-border bg-surface flex items-center justify-between">
            <span className="text-sm text-text">Export all data to JSON</span>
            <button
              onClick={exportBackup}
              className="px-3 py-1 rounded text-sm font-medium tracking-wider bg-glow/10 border border-glow/30 text-glow hover:bg-glow/20 transition-colors"
            >
              Export Backup
            </button>
          </div>
          {backupDone && (
            <p className="text-xs text-text-muted text-center">Backup downloaded — save it to iCloud Drive.</p>
          )}

          {/* Import */}
          <div className="p-3 rounded-lg border border-border bg-surface flex items-center justify-between">
            <span className="text-sm text-text">Restore from backup file</span>
            <label className="px-3 py-1 rounded text-sm font-medium tracking-wider bg-surface-light border border-border text-text-dim hover:border-glow/30 hover:text-text transition-colors cursor-pointer">
              Import Backup
              <input
                key={importFileKey}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={onFileSelect}
              />
            </label>
          </div>

          {importError && (
            <p className="text-xs text-danger text-center">{importError}</p>
          )}

          {/* Confirmation panel */}
          {importPending && (
            <div className="p-4 rounded-lg border border-danger/40 bg-surface space-y-3">
              <p className="text-xs font-medium text-text-dim uppercase tracking-wider">Confirm Restore</p>
              <div className="text-xs text-text space-y-1">
                <p>Exported: <span className="text-glow-bright">{new Date(importPending.raw.exportedAt).toLocaleString()}</span></p>
                <p>Total records: <span className="text-glow-bright">{importPending.counts.total}</span></p>
              </div>
              <p className="text-xs text-danger">⚠ This will ERASE your current local data and replace it with the backup.</p>
              <p className="text-xs text-text-muted">Export your current data first if you want to keep it.</p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type RESTORE to confirm"
                className="w-full bg-surface-light border border-border rounded px-2 py-1 text-sm text-text focus:outline-none focus:border-danger/60"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setImportPending(null); setConfirmText(''); setImportFileKey(k => k + 1); }}
                  className="px-3 py-1 rounded text-sm border border-border text-text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={doRestore}
                  disabled={confirmText !== 'RESTORE'}
                  className="px-3 py-1 rounded text-sm font-medium border border-danger/50 text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Restore
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
