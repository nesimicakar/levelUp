// ─────────────────────────────────────────────────────────────────────────────
// Canonical point-marker coordinates [longitude, latitude]
//
// Two jobs:
//   1. REQUIRED — give a geographic location to registry entities that have no
//      usable polygon in the 50m dataset (Tuvalu, South Ossetia, Abkhazia).
//      Without this they'd be reachable only by list, and the Atlas is meant to
//      TEACH where things are.
//   2. FALLBACK — give a large, easy click target to microstates and small
//      island states whose polygon is too small to tap reliably on a phone.
//
// Coordinates are approximate capital/centroid positions — precise enough to
// place the marker in the right part of the world, which is all a locator dot
// needs. atlasIds must exist in the registry (enforced by test).
// ─────────────────────────────────────────────────────────────────────────────

export const MARKER_COORDS: Readonly<Record<string, readonly [number, number]>> = {
  // ── Polygonless in the dataset (REQUIRED to be geographically visible) ──
  tuv: [179.2, -8.52],           // Tuvalu — Funafuti
  'south-ossetia': [43.97, 42.22], // Tskhinvali (within Georgia in NE 50m)
  abkhazia: [41.02, 43.0],        // Sukhumi (within Georgia in NE 50m)

  // ── European microstates (polygon too small to tap) ──
  and: [1.52, 42.51],            // Andorra
  lie: [9.55, 47.16],            // Liechtenstein — Vaduz
  mco: [7.42, 43.74],            // Monaco
  smr: [12.46, 43.94],           // San Marino
  vat: [12.45, 41.9],            // Vatican City
  mlt: [14.38, 35.9],            // Malta — Valletta

  // ── Caribbean small island states ──
  atg: [-61.8, 17.06],           // Antigua and Barbuda
  brb: [-59.54, 13.19],          // Barbados
  dma: [-61.37, 15.41],          // Dominica
  grd: [-61.68, 12.11],          // Grenada
  kna: [-62.73, 17.3],           // Saint Kitts and Nevis
  lca: [-60.98, 13.91],          // Saint Lucia
  vct: [-61.2, 13.16],           // Saint Vincent and the Grenadines

  // ── Small island / city states (Atlantic, Indian Ocean, Gulf) ──
  bhr: [50.55, 26.07],           // Bahrain
  sgp: [103.82, 1.35],           // Singapore
  mdv: [73.51, 4.17],            // Maldives — Malé
  syc: [55.49, -4.62],           // Seychelles
  mus: [57.55, -20.35],          // Mauritius
  com: [43.33, -11.7],           // Comoros
  cpv: [-23.51, 14.93],          // Cabo Verde
  stp: [6.61, 0.19],             // São Tomé and Príncipe

  // ── Pacific small island states ──
  mhl: [171.14, 7.09],           // Marshall Islands
  fsm: [158.16, 6.92],           // Micronesia
  nru: [166.93, -0.52],          // Nauru
  plw: [134.58, 7.34],           // Palau
  kir: [173.03, 1.33],           // Kiribati — Tarawa
  ton: [-175.2, -21.18],         // Tonga
  wsm: [-171.77, -13.83],        // Samoa — Apia
};

/** atlasIds that have a point-marker fallback. */
export const MARKER_ATLAS_IDS: ReadonlySet<string> = new Set(Object.keys(MARKER_COORDS));
