// ─────────────────────────────────────────────────────────────────────────────
// Core Atlas — the focused learning curriculum (Stage 4.1)
//
// A learning layer kept SEPARATE from geographic identity:
//   • Every canonical entity stays on the map and searchable regardless.
//   • Membership here is NOT persisted into country profiles — it's static
//     config, editable in one place, decoupled from imported data.
//   • Being "Core" does not require a profile, and having a profile does not
//     make an entity Core.
//
// This is the curated 100-entity curriculum: a practical foundation in world
// geography and global affairs, balanced across regions and subregions. Edit
// this array to change the curriculum — nothing else needs to move.
// ─────────────────────────────────────────────────────────────────────────────

export const CORE_ATLAS_IDS: ReadonlySet<string> = new Set<string>([
  // Americas (18)
  'usa', 'can', 'mex', 'cub', 'pan', 'gtm', 'dom', 'cri', 'hti', 'bra', 'arg', 'col', 'chl', 'ven', 'per', 'ecu', 'bol', 'ury',
  // Europe (25)
  'gbr', 'fra', 'deu', 'ita', 'esp', 'nld', 'che', 'bel', 'swe', 'nor', 'dnk', 'fin', 'irl', 'isl', 'grc', 'prt', 'hrv', 'rus', 'ukr', 'pol', 'srb', 'cze', 'rou', 'hun', 'aut',
  // Asia (33)
  'chn', 'jpn', 'kor', 'prk', 'twn', 'idn', 'vnm', 'tha', 'phl', 'sgp', 'mys', 'mmr', 'ind', 'pak', 'bgd', 'afg', 'lka', 'npl', 'kaz', 'uzb', 'aze', 'geo', 'sau', 'irn', 'isr', 'tur', 'irq', 'are', 'pse', 'syr', 'jor', 'lbn', 'yem',
  // Africa (20)
  'egy', 'mar', 'dza', 'tun', 'nga', 'gha', 'sen', 'civ', 'eth', 'ken', 'tza', 'uga', 'sdn', 'cod', 'cmr', 'zaf', 'ago', 'zwe', 'moz', 'zmb',
  // Oceania (4)
  'aus', 'nzl', 'png', 'fji',
]);

export function isCoreAtlas(atlasId: string): boolean {
  return CORE_ATLAS_IDS.has(atlasId);
}
