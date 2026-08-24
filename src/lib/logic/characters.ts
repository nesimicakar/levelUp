import type { RankRecord, CharacterStatsSnapshot, Rank, Character } from '@/types';
import { RANK_ORDER } from '@/types';
import { CHARACTER_DEFS, type CharacterDef } from '@/lib/data/characterDefs';

/** Pool entries not yet used by any past or current character, in fixed config order. */
export function getAvailableNextCharacters(existingSlugs: string[]): CharacterDef[] {
  return CHARACTER_DEFS.filter(d => !existingSlugs.includes(d.slug));
}

/**
 * Highest rank ever reached across ALL characters — a lifetime stat, deliberately
 * NOT scoped to the active character. Prestiging resets the ladder but must never
 * retract a peak that was genuinely earned, so anything lifetime-flavoured
 * (achievements, Profile's peak badge) reads this instead of the current rank.
 *
 * Takes every rank row plus the character rows so a mastered character's committed
 * finalRank still counts even if its rows were somehow trimmed.
 */
export function computePeakRank(records: RankRecord[], characters: Character[] = []): Rank {
  const ranks: Rank[] = [
    ...records.map(r => r.rank),
    ...characters.map(c => c.finalRank).filter((r): r is Rank => r !== undefined),
  ];
  return ranks.reduce<Rank>(
    (peak, r) => (RANK_ORDER.indexOf(r) > RANK_ORDER.indexOf(peak) ? r : peak),
    'E',
  );
}

/** Whether the full-screen Mastery moment has already been auto-presented for this
 *  character. Presentation state only — deliberately localStorage, not the DB, so it
 *  never rides along in a backup (restoring an S-rank character should replay the
 *  moment rather than silently swallow it). Safe during SSR/prerender. */
export function masteryMomentSeen(characterId: number): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(`masteryMomentSeen_${characterId}`) === 'true';
}

export function markMasteryMomentSeen(characterId: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`masteryMomentSeen_${characterId}`, 'true');
}

/** Frozen, minimal summary of a character's rank-relevant history at the moment of
 *  mastery. Derived entirely from that character's rankHistory rows — not a duplicate
 *  ledger, just a snapshot so the Roster can show final numbers after the underlying
 *  rows are no longer "current." */
export function buildCharacterStatsSnapshot(records: RankRecord[]): CharacterStatsSnapshot {
  return {
    weeksActive: records.filter(r => r.reason !== 'skipped').length,
    promotions: records.filter(r => r.reason === 'promoted').length,
    demotions: records.filter(r => r.reason === 'demoted').length,
    graceWeeksUsed: records.filter(r => r.reason === 'grace').length,
    bestWeekPct: records.reduce((max, r) => Math.max(max, r.completionPct), 0),
  };
}
