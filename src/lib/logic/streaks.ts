import { db } from '@/lib/db';

export async function computeAgiStreak(): Promise<number> {
  const logs = await db.agiLogs.where('completed').equals(1).sortBy('date');
  if (logs.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(today);

  // Walk backwards from today
  for (let i = 0; i < 1000; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
    const hasLog = logs.some(l => l.date === dateStr);
    if (hasLog) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function computeStatCompletedDays(
  stat: 'agi' | 'vit' | 'int' | 'per'
): Promise<number> {
  const table = stat === 'agi' ? db.agiLogs
    : stat === 'vit' ? db.vitLogs
    : stat === 'int' ? db.intLogs
    : db.perLogs;
  return table.where('completed').equals(1).count();
}
