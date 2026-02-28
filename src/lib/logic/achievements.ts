import type { Achievement, StatType } from '@/types';
import { db } from '@/lib/db';

interface AchievementDef {
  key: string;
  title: string;
  description: string;
  tier: 1 | 2 | 3;
  stat?: StatType;
  check: (ctx: AchievementContext) => boolean;
}

interface AchievementContext {
  strSessions: number;
  agiMinutes: number;
  agiStreak: number;
  vitDays: number;
  intPages: number;
  intCourseUnits: number;
  perLessons: number;
  totalWeeks: number;
  currentRankIdx: number;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // STR
  { key: 'str-first', title: 'First Session', description: 'Complete your first STR workout', tier: 1, stat: 'STR', check: ctx => ctx.strSessions >= 1 },
  { key: 'str-10', title: 'Iron Will', description: 'Complete 10 STR sessions', tier: 2, stat: 'STR', check: ctx => ctx.strSessions >= 10 },
  { key: 'str-50', title: 'Forged in Steel', description: 'Complete 50 STR sessions', tier: 3, stat: 'STR', check: ctx => ctx.strSessions >= 50 },
  // AGI
  { key: 'agi-100min', title: 'First Hundred', description: 'Row 100 total minutes', tier: 1, stat: 'AGI', check: ctx => ctx.agiMinutes >= 100 },
  { key: 'agi-7streak', title: 'Week Warrior', description: '7-day rowing streak', tier: 2, stat: 'AGI', check: ctx => ctx.agiStreak >= 7 },
  { key: 'agi-1000min', title: 'Relentless', description: 'Row 1000 total minutes', tier: 3, stat: 'AGI', check: ctx => ctx.agiMinutes >= 1000 },
  // VIT
  { key: 'vit-7', title: 'Week of Vitality', description: 'Complete VIT 7 days', tier: 1, stat: 'VIT', check: ctx => ctx.vitDays >= 7 },
  { key: 'vit-30', title: 'Month of Vitality', description: 'Complete VIT 30 days', tier: 2, stat: 'VIT', check: ctx => ctx.vitDays >= 30 },
  { key: 'vit-100', title: 'Living Well', description: 'Complete VIT 100 days', tier: 3, stat: 'VIT', check: ctx => ctx.vitDays >= 100 },
  // INT
  { key: 'int-100pg', title: 'Bookworm', description: 'Read 100 total pages', tier: 1, stat: 'INT', check: ctx => ctx.intPages >= 100 },
  { key: 'int-500pg', title: 'Scholar', description: 'Read 500 total pages', tier: 2, stat: 'INT', check: ctx => ctx.intPages >= 500 },
  { key: 'int-course50', title: 'Halfway There', description: 'Complete 50% of Real Estate course', tier: 2, stat: 'INT', check: ctx => ctx.intCourseUnits >= 100 },
  // PER
  { key: 'per-50', title: 'Observer', description: 'Complete 50 StageAcademy lessons', tier: 1, stat: 'PER', check: ctx => ctx.perLessons >= 50 },
  { key: 'per-100', title: 'Perceptive', description: 'Complete 100 StageAcademy lessons', tier: 2, stat: 'PER', check: ctx => ctx.perLessons >= 100 },
  { key: 'per-all', title: 'Master of Stage', description: 'Complete all 144 lessons', tier: 3, stat: 'PER', check: ctx => ctx.perLessons >= 144 },
  // Global
  { key: 'rank-c', title: 'C-Rank Hunter', description: 'Reach Rank C', tier: 1, check: ctx => ctx.currentRankIdx >= 2 },
  { key: 'rank-a', title: 'A-Rank Hunter', description: 'Reach Rank A', tier: 2, check: ctx => ctx.currentRankIdx >= 4 },
  { key: 'rank-s', title: 'S-Rank Hunter', description: 'Reach Rank S', tier: 3, check: ctx => ctx.currentRankIdx >= 5 },
];

export async function checkAndUnlockAchievements(ctx: AchievementContext): Promise<Achievement[]> {
  const existing = await db.achievements.toArray();
  const existingKeys = new Set(existing.map(a => a.key));
  const newlyUnlocked: Achievement[] = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (existingKeys.has(def.key)) continue;
    if (def.check(ctx)) {
      const achievement: Achievement = {
        key: def.key,
        title: def.title,
        description: def.description,
        tier: def.tier,
        stat: def.stat,
        unlockedAt: Date.now(),
      };
      await db.achievements.add(achievement);
      newlyUnlocked.push(achievement);
    }
  }
  return newlyUnlocked;
}

export function getAllAchievementDefs() {
  return ACHIEVEMENT_DEFS;
}
