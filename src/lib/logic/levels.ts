import type { StatLevel } from '@/types';

// XP required per level: level N requires N*100 XP
function xpForLevel(level: number): number {
  return level * 100;
}

export function computeLevel(totalXP: number): StatLevel {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const needed = xpForLevel(level);
  return {
    level,
    currentXP: remaining,
    xpToNext: needed,
    progressPct: Math.round((remaining / needed) * 100),
  };
}

// STR: 25 XP per completed session, +10 XP per overload event
export function computeStrXP(sessionsCompleted: number, overloadEvents: number): number {
  return sessionsCompleted * 25 + overloadEvents * 10;
}

// AGI: 1 XP per minute rowed, +5 XP per day streak (bonus)
export function computeAgiXP(totalMinutes: number, currentStreak: number): number {
  return totalMinutes + currentStreak * 5;
}

// VIT: 15 XP per completed day
export function computeVitXP(completedDays: number): number {
  return completedDays * 15;
}

// INT: 2 XP per page read, 5 XP per course unit
export function computeIntXP(totalPages: number, courseUnits: number): number {
  return totalPages * 2 + courseUnits * 5;
}

// PER: 8 XP per lesson completed
export function computePerXP(totalLessons: number): number {
  return totalLessons * 8;
}
