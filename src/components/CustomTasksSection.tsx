'use client';

import { useEffect, useState, useCallback } from 'react';
import { getToday, getEnabledCustomTasksForSkill, getCustomTaskChecksForDate, setCustomTaskCheck } from '@/lib/db';
import { Toggle } from '@/components/Toggle';
import type { CustomTask, StatType } from '@/types';

interface Props {
  skill: StatType;
}

export function CustomTasksSection({ skill }: Props) {
  const [tasks, setTasks] = useState<CustomTask[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const today = getToday();
    const enabled = await getEnabledCustomTasksForSkill(skill);
    setTasks(enabled);
    const logs = await getCustomTaskChecksForDate(today);
    const checkMap: Record<string, boolean> = {};
    for (const log of logs) {
      checkMap[log.taskId] = log.checked;
    }
    setChecks(checkMap);
    setLoaded(true);
  }, [skill]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (taskId: string) => {
    const today = getToday();
    const newVal = !checks[taskId];
    setChecks(prev => ({ ...prev, [taskId]: newVal }));
    await setCustomTaskCheck(today, taskId, newVal);
  };

  if (!loaded || tasks.length === 0) return null;

  return (
    <div className="stat-card rounded-lg p-4 glow-border space-y-3">
      <h3 className="text-sm font-medium text-text-dim">CUSTOM TASKS</h3>
      {tasks.map(task => (
        <Toggle
          key={task.id}
          checked={!!checks[task.id]}
          onChange={() => toggle(task.id)}
          label={task.label}
        />
      ))}
    </div>
  );
}
