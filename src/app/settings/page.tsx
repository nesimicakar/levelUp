'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSettings, updateSettings, deleteCustomTask } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import { NumberInput } from '@/components/NumberInput';
import type { UserSettings, CustomTask, StatType } from '@/types';

const SKILL_OPTIONS: StatType[] = ['STR', 'AGI', 'VIT', 'INT', 'PER'];

export default function SettingsPage() {
  const [settings, setSettingsState] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [newTaskSkill, setNewTaskSkill] = useState<StatType>('STR');
  const [newTaskLabel, setNewTaskLabel] = useState('');

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
      </main>
    </div>
  );
}
