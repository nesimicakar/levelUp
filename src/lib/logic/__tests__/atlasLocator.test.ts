import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { feature } from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import { matchFeatureToAtlasId } from '../atlasGeo';
import { fitLocator, VIEW_SIZE, type Box } from '../atlasViewport';

type NEFeature = Feature<Geometry> & { id?: string | number; properties?: { name?: string } };

function loadFeatures(): NEFeature[] {
  const path = resolve(process.cwd(), 'public/data/countries-50m.json');
  const topo = JSON.parse(readFileSync(path, 'utf-8'));
  return (feature(topo, topo.objects.countries) as unknown as { features: NEFeature[] }).features;
}
const FEATURES = loadFeatures();

const featuresFor = (atlasId: string) =>
  FEATURES.filter(f => matchFeatureToAtlasId({ id: f.id, name: f.properties?.name }) === atlasId);

// Mirror WorldMap's resolution: when an id is shared, the largest-area feature wins.
function canonical(atlasId: string) {
  const feats = featuresFor(atlasId);
  if (!feats.length) return null;
  const best = feats.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  return { count: feats.length, name: best.properties?.name, centroid: geoCentroid(best) };
}

// ── Australia duplicate-geometry regression ───────────────────────────────────

describe('duplicate-geometry focus resolution (Australia)', () => {
  it('the aus id (036) is shared by mainland Australia + a tiny external territory', () => {
    expect(featuresFor('aus').length).toBeGreaterThan(1);
  });

  it('resolves aus to MAINLAND Australia — centre in the Australia region, not SE Asia', () => {
    const r = canonical('aus');
    expect(r).not.toBeNull();
    const [lon, lat] = r!.centroid;
    expect(lon).toBeGreaterThan(110);
    expect(lon).toBeLessThan(160);
    expect(lat).toBeLessThan(-20); // mainland (~-25°), NOT the territory near Timor (~-12°)
  });

  it('the old last-feature pick would land near SE Asia — proving the fix matters', () => {
    const feats = featuresFor('aus');
    const naive = geoCentroid(feats[feats.length - 1]); // pre-fix: last write wins
    expect(naive[1]).toBeGreaterThan(-15); // far north, near Timor / SE Asia
  });

  it('France (id 250) resolves to a single canonical feature in the France region', () => {
    const r = canonical('fra');
    expect(r).not.toBeNull();
    expect(r!.count).toBe(1); // no external-territory duplicate to disambiguate
    const [lon, lat] = r!.centroid;
    expect(lon).toBeGreaterThan(-15);
    expect(lon).toBeLessThan(15);
    expect(lat).toBeGreaterThan(38);
    expect(lat).toBeLessThan(52);
  });
});

// ── Profile locator framing ───────────────────────────────────────────────────

describe('fitLocator (profile locator framing)', () => {
  const size = VIEW_SIZE;

  it('a tiny entity/marker clamps to the max zoom (shows context, not a bare dot)', () => {
    const tiny: Box = { x: size.width / 2 - 4, y: size.height / 2 - 4, w: 8, h: 8 };
    const t = fitLocator(tiny, size);
    expect(t.k).toBeLessThanOrEqual(5);
    expect(t.k).toBeGreaterThanOrEqual(1.15);
  });

  it('a very large country clamps to the min zoom and stays in pan bounds', () => {
    const huge: Box = { x: 20, y: 20, w: size.width - 40, h: size.height - 40 };
    const t = fitLocator(huge, size);
    expect(t.k).toBeGreaterThanOrEqual(1.15);
    expect(t.x).toBeLessThanOrEqual(0);
    expect(t.y).toBeLessThanOrEqual(0);
  });

  it('centres a mid-size entity within the view', () => {
    const box: Box = { x: 400, y: 200, w: 120, h: 90 };
    const t = fitLocator(box, size, { growth: 2 });
    expect(t.k * (box.x + box.w / 2) + t.x).toBeCloseTo(size.width / 2, 3);
    expect(t.k * (box.y + box.h / 2) + t.y).toBeCloseTo(size.height / 2, 3);
  });
});
