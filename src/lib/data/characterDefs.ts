import type { Rank } from '@/types';

/** The character offered by default on a fresh install — seeded automatically, never
 *  offered as a mastery "next character" choice. Keeps its rank-tier artwork
 *  (e/d/c/b/a/s-rank.png) since that art was made for it. */
export const STARTER_CHARACTER = {
  slug: 'warrior',
  name: 'Warrior',
  icon: '⚔️',
  hasArtwork: true,
  rankTitles: {
    E: 'Novice',
    D: 'Squire',
    C: 'Warrior',
    B: 'Veteran',
    A: 'Champion',
    S: 'Warlord',
  },
} as const;

/** Pool of characters offered at a Character Mastered moment, once their slot is
 *  unlocked (i.e. not already used by a past or current character). Data-driven so
 *  more can be added later without touching the mastery/roster UI. New characters
 *  default to text-only display (hasArtwork: false) until real art is supplied. */
export const CHARACTER_DEFS = [
  {
    slug: 'mage', name: 'Mage', icon: '🔮', hasArtwork: false,
    rankTitles: {
      E: 'Apprentice', D: 'Adept', C: 'Conjurer', B: 'Magus', A: 'Sorcerer', S: 'Archmage',
    },
  },
  {
    slug: 'samurai', name: 'Samurai', icon: '🗡️', hasArtwork: true,
    rankTitles: {
      E: 'Rōnin', D: 'Ashigaru', C: 'Bushi', B: 'Hatamoto', A: 'Kensei', S: 'Shōgun',
    },
  },
  {
    slug: 'ranger', name: 'Ranger', icon: '🏹', hasArtwork: false,
    rankTitles: {
      E: 'Tracker', D: 'Scout', C: 'Warden', B: 'Pathfinder', A: 'Beastmaster', S: 'Wildlord',
    },
  },
] as const;

export type CharacterDef = (typeof CHARACTER_DEFS)[number] | typeof STARTER_CHARACTER;

const ALL_DEFS: readonly CharacterDef[] = [STARTER_CHARACTER, ...CHARACTER_DEFS];

export function getCharacterDef(slug: string): CharacterDef | undefined {
  return ALL_DEFS.find(d => d.slug === slug);
}

/**
 * Whether this character has rank-tier artwork. Read from static CONFIG, not from
 * the persisted `Character.hasArtwork` column — that column is stamped at creation
 * time, so a character created before its art existed would stay text-only forever.
 * Supplying art is therefore a one-line change to the def above, and it applies to
 * already-created characters too.
 */
export function characterHasArtwork(slug: string): boolean {
  return getCharacterDef(slug)?.hasArtwork ?? false;
}

/**
 * Path to a character's artwork for a given rank.
 *
 * Warrior's art predates the per-character layout and sits at the /public root, so
 * it keeps its original filenames rather than churning ~10MB of committed binaries.
 * Every other character uses /characters/<slug>/<rank>.png.
 */
export function characterArtSrc(slug: string, rank: string): string {
  const r = rank.toLowerCase();
  if (slug === STARTER_CHARACTER.slug) return `/${r}-rank.png`;
  return `/characters/${slug}/${r}.png`;
}

/**
 * The rank-tier title for a character, e.g. samurai + S -> "Shōgun".
 *
 * Single source of truth: this table used to be copy-pasted into three page files
 * as a fixed "Weak Hunter … Ascendant Hunter" ladder, which meant every character
 * shared one identity. Falls back to the starter's ladder for an unknown slug so
 * the UI always has a real word to render.
 */
export function getRankTitle(slug: string, rank: Rank): string {
  return (getCharacterDef(slug) ?? STARTER_CHARACTER).rankTitles[rank];
}
