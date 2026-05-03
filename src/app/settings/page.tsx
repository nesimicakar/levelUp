'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, getSettings, getToday, updateSettings, deleteCustomTask } from '@/lib/db';
import type { UserSettings, CustomTask, StatType } from '@/types';

const SKILL_OPTIONS: StatType[] = ['STR', 'AGI', 'VIT', 'INT', 'PER'];

// Per-stat color tokens (matches design)
const STAT_COLOR: Record<StatType, string> = {
  STR: 'var(--color-stat-str)',
  AGI: 'var(--color-stat-agi)',
  VIT: 'var(--color-stat-vit)',
  INT: 'var(--color-stat-int)',
  PER: 'var(--color-stat-per)',
};

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
  const router = useRouter();
  const [settings, setSettingsState] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [newTaskSkill, setNewTaskSkill] = useState<StatType>('STR');
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [importPending, setImportPending] = useState<null | { raw: BackupFile; counts: ReturnType<typeof getBackupCounts> }>(null);
  const [confirmText, setConfirmText] = useState('');
  const [importError, setImportError] = useState('');
  const [importFileKey, setImportFileKey] = useState(0);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setSettingsState(s);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const update = async (partial: Partial<UserSettings>) => {
    if (!settings) return;
    await updateSettings(partial);
    setSettingsState({ ...settings, ...partial });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
    setShowAddTask(false);
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
    setTimeout(() => setSaved(false), 1500);
  };

  const exportBackup = async () => {
    const [strSessions, agiLogs, vitLogs, intLogs, perLogs, weeklySummaries,
      courseProgress, rankHistory, achievements, settingsArr, customTaskLogs] = await Promise.all([
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
      tables: { strSessions, agiLogs, vitLogs, intLogs, perLogs, weeklySummaries, courseProgress, rankHistory, achievements, settings: settingsArr, customTaskLogs },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `levelup-backup-${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDone(true);
    setTimeout(() => setBackupDone(false), 4000);
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
      setImportError('Failed to parse file.');
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

  const spiritualityEnabled = settings.enableSpirituality ?? false;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
        {/* Diegetic header */}
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <h1
              className="font-display text-xl font-bold leading-none glow-text"
              style={{ color: 'var(--color-glow-bright)' }}
            >
              SYSTEM CONFIG
            </h1>
            <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">// Settings &amp; Targets</p>
          </div>
        </div>

        {saved && (
          <div className="text-center text-success text-[10px] tracking-[0.16em] uppercase animate-fade-in">
            Configuration Saved
          </div>
        )}

        {/* DAILY TARGETS */}
        <SectionHeader label="Daily Targets" />

        <CompactStepperRow
          stat="STR"
          label="Sessions / week"
          value={settings.strSessionsPerWeek ?? 3}
          unit="d"
          step={1}
          min={2}
          max={5}
          onChange={v => update({ strSessionsPerWeek: v })}
        />
        <CompactStepperRow
          stat="AGI"
          label="Cardio minutes"
          value={settings.agiMinMinutes}
          unit="min"
          step={5}
          min={5}
          max={120}
          onChange={v => update({ agiMinMinutes: v })}
        />
        <CompactStepperRow
          stat="VIT"
          label="Protein target"
          value={settings.proteinGoalGrams}
          unit="g"
          step={10}
          min={50}
          max={300}
          onChange={v => update({ proteinGoalGrams: v })}
          last
        />
        <CompactStepperRow
          stat="PER"
          label="Reading minutes"
          value={settings.dailyReadingMinutesTarget ?? 5}
          unit="min"
          step={1}
          min={1}
          max={120}
          onChange={v => update({ dailyReadingMinutesTarget: v })}
          last
        />
        {spiritualityEnabled && (
          <CompactStepperRow
            stat="PER"
            label="Quran pages"
            value={settings.quranPagesPerDay}
            unit="pg"
            step={1}
            min={1}
            max={20}
            onChange={v => update({ quranPagesPerDay: v })}
            last
          />
        )}

        {/* MODES */}
        <SectionHeader label="Modes" />
        <CompactToggleRow
          stat="PER"
          label="Spirituality"
          on={spiritualityEnabled}
          onChange={v => update({ enableSpirituality: v })}
          last
        />

        {/* CUSTOM TASKS */}
        <SectionHeader label="Custom Tasks" />

        {customTasks.length === 0 && !showAddTask && (
          <CompactActionRow
            label="No custom tasks yet"
            actionLabel="+ ADD"
            onAction={() => setShowAddTask(true)}
            last
          />
        )}

        {customTasks.length > 0 && (
          <>
            {Object.entries(groupedTasks).map(([skill, tasks]) => (
              <div key={skill}>
                {tasks.map((task, idx) => (
                  <div
                    key={task.id}
                    className="grid items-center gap-2.5 py-2.5"
                    style={{
                      gridTemplateColumns: '44px 1fr auto',
                      borderBottom: idx === tasks.length - 1 ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    <span
                      className="font-mono-hud text-[9px] font-bold tracking-[0.12em] text-center"
                      style={{ color: STAT_COLOR[skill as StatType] }}
                    >
                      {skill}
                    </span>
                    <span className={`font-display text-sm ${task.enabled ? 'text-text' : 'text-text-muted line-through'}`}>
                      {task.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleCustomTask(task.id)}
                        className={`font-mono-hud text-[10px] tracking-[0.14em] px-2 py-0.5 rounded border transition-colors ${
                          task.enabled ? 'border-glow/40 text-glow' : 'border-border text-text-muted'
                        }`}
                      >
                        {task.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => removeCustomTask(task.id)}
                        className="font-mono-hud text-[10px] tracking-[0.14em] px-2 py-0.5 rounded border border-danger/30 text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        DEL
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!showAddTask && (
              <CompactActionRow
                label={`${customTasks.length} task${customTasks.length === 1 ? '' : 's'}`}
                actionLabel="+ ADD"
                onAction={() => setShowAddTask(true)}
                last
              />
            )}
          </>
        )}

        {showAddTask && (
          <div className="cut-tile p-3 space-y-2"
               style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <select
                value={newTaskSkill}
                onChange={e => setNewTaskSkill(e.target.value as StatType)}
                className="bg-surface-light border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-glow"
                style={{ color: STAT_COLOR[newTaskSkill] }}
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
                className="flex-1 bg-surface-light border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-glow"
                onKeyDown={e => { if (e.key === 'Enter') addCustomTask(); }}
                autoFocus
              />
            </div>
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={() => { setShowAddTask(false); setNewTaskLabel(''); }}
                className="font-mono-hud text-[10px] tracking-[0.14em] px-3 py-1 rounded border border-border text-text-muted hover:text-text transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={addCustomTask}
                disabled={!newTaskLabel.trim()}
                className="font-mono-hud text-[10px] tracking-[0.14em] px-3 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(96,165,250,0.15)',
                  border: '1px solid var(--color-glow-bright)',
                  color: 'var(--color-glow-bright)',
                }}
              >
                ADD
              </button>
            </div>
          </div>
        )}

        {/* DATA */}
        <SectionHeader label="Data" />
        <CompactActionRow
          label="Export all data"
          actionLabel="EXPORT"
          actionAccent="glow"
          onAction={exportBackup}
        />
        {backupDone && (
          <p className="text-[10px] text-text-muted text-center -mt-1">Saved — keep it in iCloud Drive.</p>
        )}
        <CompactActionRow
          label="Restore from file"
          actionLabel="IMPORT"
          actionAccent="muted"
          onAction={() => {
            const input = document.getElementById('import-file-input') as HTMLInputElement | null;
            input?.click();
          }}
          last
        />
        <input
          id="import-file-input"
          key={importFileKey}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onFileSelect}
        />
        {importError && (
          <p className="text-[10px] text-danger text-center -mt-1">{importError}</p>
        )}

        {/* RESTORE confirm — bracketed danger panel */}
        {importPending && (
          <div className="frame-bracketed mt-2">
            <div
              className="frame-cut p-3 space-y-2"
              style={{ background: 'rgba(239,68,68,0.04)', boxShadow: '0 0 8px rgba(239,68,68,0.12)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5"
                  style={{ background: 'var(--color-stat-str)', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }}
                />
                <span
                  className="font-display font-bold text-xs tracking-[0.18em]"
                  style={{ color: 'var(--color-stat-str)' }}
                >
                  CONFIRM RESTORE
                </span>
              </div>
              <div className="text-xs text-text space-y-0.5">
                <p><span className="text-text-muted">Exported:</span> <span className="text-glow-bright">{new Date(importPending.raw.exportedAt).toLocaleString()}</span></p>
                <p><span className="text-text-muted">Records:</span> <span className="text-glow-bright">{importPending.counts.total}</span></p>
              </div>
              <p className="text-[10px] text-danger">⚠ Erases current local data.</p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type RESTORE to confirm"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-danger/60"
              />
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={() => { setImportPending(null); setConfirmText(''); setImportFileKey(k => k + 1); }}
                  className="font-mono-hud text-[10px] tracking-[0.14em] px-3 py-1 rounded border border-border text-text-muted hover:text-text transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={doRestore}
                  disabled={confirmText !== 'RESTORE'}
                  className="font-mono-hud text-[10px] tracking-[0.14em] px-3 py-1 rounded border border-danger/50 text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  RESTORE
                </button>
              </div>
            </div>
            <span className="frame-bracket-bottom" aria-hidden />
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      className="pb-1.5 mt-4"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <span
        className="font-mono-hud text-[10px] tracking-[0.18em] uppercase"
        style={{ color: 'var(--color-glow-bright)', textShadow: '0 0 6px rgba(96,165,250,0.4)' }}
      >
        // {label}
      </span>
    </div>
  );
}

interface CompactStepperRowProps {
  stat?: StatType;
  label: string;
  value: number;
  unit: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  last?: boolean;
}

function CompactStepperRow({ stat, label, value, unit, step = 1, min = 0, max = 9999, onChange, last }: CompactStepperRowProps) {
  const c = stat ? STAT_COLOR[stat] : 'var(--color-text-dim)';
  return (
    <div
      className="grid items-center gap-2.5 py-2.5"
      style={{
        gridTemplateColumns: '44px 1fr auto',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {stat ? (
        <span
          className="font-mono-hud text-[9px] font-bold tracking-[0.12em] text-center"
          style={{ color: c }}
        >
          {stat}
        </span>
      ) : (
        <span className="font-mono-hud text-[9px] text-text-dim text-center">···</span>
      )}
      <span className="font-display text-sm text-text">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-6 h-6 grid place-items-center font-mono-hud text-sm leading-none rounded transition-colors"
          style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          aria-label="Decrease"
        >
          −
        </button>
        <span
          className="font-mono-hud font-bold text-sm min-w-[2ch] text-center"
          style={{ color: c }}
        >
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-6 h-6 grid place-items-center font-mono-hud text-sm leading-none rounded transition-colors hover:brightness-125"
          style={{ background: 'transparent', border: `1px solid ${c}`, color: c }}
          aria-label="Increase"
        >
          +
        </button>
        <span className="font-mono-hud text-[9px] text-text-muted ml-1 min-w-[2ch]">{unit}</span>
      </div>
    </div>
  );
}

interface CompactToggleRowProps {
  stat?: StatType;
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}

function CompactToggleRow({ stat, label, on, onChange, last }: CompactToggleRowProps) {
  const c = stat ? STAT_COLOR[stat] : 'var(--color-glow-bright)';
  return (
    <button
      onClick={() => onChange(!on)}
      className="grid items-center gap-2.5 py-2.5 w-full text-left"
      style={{
        gridTemplateColumns: '44px 1fr auto',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {stat ? (
        <span
          className="font-mono-hud text-[9px] font-bold tracking-[0.12em] text-center"
          style={{ color: c }}
        >
          {stat}
        </span>
      ) : (
        <span className="font-mono-hud text-[9px] text-text-dim text-center">···</span>
      )}
      <span className="font-display text-sm text-text">{label}</span>
      <span
        className="relative inline-block flex-shrink-0"
        style={{
          width: 32, height: 18, borderRadius: 999,
          background: on ? c : 'var(--color-bg)',
          border: `1px solid ${on ? c : 'var(--color-border)'}`,
          boxShadow: on ? `0 0 6px ${c}` : 'none',
          transition: 'background 0.15s',
        }}
      >
        <span
          className="absolute"
          style={{
            top: 1,
            left: on ? 15 : 1,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: on ? 'var(--color-bg)' : 'var(--color-text-muted)',
            transition: 'left 0.15s',
          }}
        />
      </span>
    </button>
  );
}

interface CompactActionRowProps {
  label: string;
  actionLabel: string;
  onAction: () => void;
  actionAccent?: 'glow' | 'muted' | 'danger';
  last?: boolean;
}

function CompactActionRow({ label, actionLabel, onAction, actionAccent = 'muted', last }: CompactActionRowProps) {
  const styles = {
    glow: { color: 'var(--color-glow-bright)', borderColor: 'var(--color-glow-bright)', background: 'rgba(96,165,250,0.10)' },
    muted: { color: 'var(--color-text-dim)', borderColor: 'var(--color-border)', background: 'transparent' },
    danger: { color: 'var(--color-stat-str)', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)' },
  };
  const style = styles[actionAccent];
  return (
    <div
      className="grid items-center gap-2.5 py-2.5"
      style={{
        gridTemplateColumns: '44px 1fr auto',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
      }}
    >
      <span className="font-mono-hud text-[9px] text-text-dim text-center">···</span>
      <span className="font-display text-sm text-text">{label}</span>
      <button
        onClick={onAction}
        className="font-mono-hud font-semibold text-[10px] tracking-[0.16em] px-3 py-1 rounded transition-colors"
        style={{
          color: style.color,
          border: `1px solid ${style.borderColor}`,
          background: style.background,
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
