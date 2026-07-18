// ─────────────────────────────────────────────────────────────────────────────
// Curated land-neighbor fallbacks (Stage 4.1)
//
// Topology can only derive land neighbors for entities that own a polygon.
// Polygonless registry entities (rendered as markers) therefore get NO derived
// neighbors. This table supplies their neighbors by hand.
//
// Values are canonical atlasIds (validated against the registry by test).
// These are MERGED with topology-derived neighbors — never a replacement — and
// the resolver flags them as `curated` so the UI/report can distinguish them.
//
// Only add an entry for an entity that genuinely lacks a usable polygon.
// ─────────────────────────────────────────────────────────────────────────────

export const CURATED_LAND_NEIGHBORS: Readonly<Record<string, readonly string[]>> = {
  tuv: [],                        // Tuvalu — island nation, no land neighbors
  'south-ossetia': ['geo', 'rus'], // borders Georgia and Russia
  abkhazia: ['geo', 'rus'],        // borders Georgia and Russia
};
