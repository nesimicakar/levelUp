'use client';

import {
  useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef,
} from 'react';
import { geoEqualEarth, geoPath, geoGraticule10, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import { matchFeatureToAtlasId, type AtlasScope } from '@/lib/logic/atlasGeo';
import { MARKER_COORDS } from '@/lib/data/atlasMarkers';
import { ATLAS_ENTITIES } from '@/lib/data/atlasEntities';
import { isCoreAtlas } from '@/lib/data/coreAtlas';
import {
  VIEW_SIZE, WORLD_TRANSFORM,
  applyWheel, panBy, beginPinch, updatePinch, shouldPinch, fitBox,
  zoomAtPoint, clampTranslate, tweenDuration, lerpTransform,
  dragPan, exceedsTapThreshold, boundsToBox, pointBox, fitBoxInset,
  type Transform, type Point, type Box, type PinchState, type ViewportSize, type ViewInset,
} from '@/lib/logic/atlasViewport';

const ENTITY_NAME = new Map(ATLAS_ENTITIES.map(e => [e.atlasId, e.name]));

// Continent extents in [lonMin, latMin, lonMax, latMax]. Used to fit-focus.
const CONTINENT_LONLAT: Record<string, [number, number, number, number]> = {
  Africa: [-20, -37, 52, 38],
  Americas: [-168, -56, -34, 72],
  Asia: [26, -11, 150, 78],
  Europe: [-25, 34, 45, 71],
  Oceania: [110, -50, 179, 10],
};
interface ShapePiece { atlasId: string; d: string; }
interface MarkerPiece { atlasId: string; name: string; x: number; y: number; }

/**
 * Land state class. Visual priority (per approved design): selected > Core >
 * Profiled-non-Core > unprofiled. A Core country stays amber even when it also
 * has a profile — the card, not the map, surfaces that the profile exists.
 */
function landClass(atlasId: string, hasProfile: boolean, isSelected: boolean): string {
  const state = isCoreAtlas(atlasId) ? 'cty--core' : hasProfile ? 'cty--profiled' : 'cty--unprofiled';
  return `cty ${state}${isSelected ? ' is-selected' : ''}`;
}

// Deep-space ocean wash behind the projected world (from the Claude Design).
const MAP_RADIAL = 'radial-gradient(ellipse 120% 90% at 50% 30%,#0a1120 0%,#060a12 60%,#04060c 100%)';

// Map state styling ported from the Claude Design (amber Core / blue Profiled /
// navy unprofiled, hover brighten, selected glow+raise, pulsing markers). Scoped
// under `.atlas-layer` so nothing leaks into the rest of the app. Scope dimming
// lowers opacity of non-matching entities — it never removes geometry.
const MAP_CSS = `
.atlas-sphere{fill:rgba(24,40,70,.22);stroke:rgba(90,130,200,.18);stroke-width:1px;vector-effect:non-scaling-stroke}
.atlas-grat{fill:none;stroke:rgba(120,160,220,.06);stroke-width:.5px;vector-effect:non-scaling-stroke}
.atlas-layer .cty{fill:#0f1930;stroke:#26334e;stroke-width:.8px;vector-effect:non-scaling-stroke;transition:fill .18s,stroke .18s,opacity .25s}
.atlas-layer .cty--profiled{fill:rgba(59,130,246,.16);stroke:rgba(96,165,250,.5)}
.atlas-layer .cty--core{fill:rgba(245,166,35,.15);stroke:rgba(245,166,35,.58)}
.atlas-layer:not(.is-static) .cty{cursor:pointer}
.atlas-layer:not(.is-static) .cty:hover{fill:rgba(150,180,230,.28);stroke:rgba(180,205,255,.85)}
.atlas-layer:not(.is-static) .cty--core:hover{fill:rgba(245,166,35,.3);stroke:#ffc24d}
.atlas-layer.is-static .cty{pointer-events:none}
.atlas-layer .cty.is-selected{fill:rgba(245,166,35,.4)!important;stroke:#ffc24d!important;stroke-width:1.8px!important;opacity:1!important;filter:drop-shadow(0 0 5px rgba(245,166,35,.5))}
.atlas-layer.scope--core .cty--profiled,.atlas-layer.scope--core .cty--unprofiled{opacity:.28}
.atlas-layer.scope--core .atlas-mk{opacity:.35}
.atlas-layer.scope--profiled .cty--unprofiled{opacity:.4}
.atlas-layer .atlas-mk__halo{fill:none;stroke:#f5a623;opacity:.5}
.atlas-layer .atlas-mk__dot{fill:#ffc24d;stroke:#2a1a00;stroke-width:.6px;vector-effect:non-scaling-stroke}
.atlas-layer:not(.is-static) .atlas-mk{cursor:pointer}
.atlas-layer .atlas-mk.is-selected .atlas-mk__dot{stroke:#fef3c7;stroke-width:1.4px}
.atlas-layer .atlas-mk.is-selected .atlas-mk__halo{opacity:.85}
@media (prefers-reduced-motion:no-preference){.atlas-layer .atlas-mk__halo{animation:atlasmkp 2.6s ease-in-out infinite}}
@keyframes atlasmkp{0%,100%{opacity:.12}50%{opacity:.6}}
`;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);

/** Projected bounding box (viewBox units) of a lon/lat rectangle, sampled. */
function projectedBox(projection: GeoProjection, [lonMin, latMin, lonMax, latMax]: [number, number, number, number]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const N = 8;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const lon = lonMin + ((lonMax - lonMin) * i) / N;
      const lat = latMin + ((latMax - latMin) * j) / N;
      const p = projection([lon, lat]);
      if (!p) continue;
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

interface WorldMapProps {
  topology: Topology;
  profileIds: Set<string>;
  selectedAtlasId: string | null;
  onSelect?: (atlasId: string) => void;
  /** When false, the map is a static locator: no controls, gestures, or cursor. */
  interactive?: boolean;
  /** Dims non-matching entities (never hides geometry). 'all' = no dimming. */
  scope?: AtlasScope;
  /** Inset (viewBox px) the world is fit into, so it stays centered/dominant in
   *  the band left by the floating HUD and bottom sheet. Proportions are preserved. */
  fitPadding?: { top: number; bottom: number; x: number };
}

/** Imperative controls exposed to a parent HUD/rail (Stage 3+). */
export interface WorldMapHandle {
  focusContinent: (name: string) => void;
  /** Fly to an entity. With `inset`, it is centered in the band above the sheet. */
  focusEntity: (atlasId: string, inset?: ViewInset) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
}

export const WorldMap = forwardRef<WorldMapHandle, WorldMapProps>(function WorldMap(
  { topology, profileIds, selectedAtlasId, onSelect, interactive = true, scope = 'all', fitPadding },
  ref,
) {
  const fp = fitPadding ?? { top: 6, bottom: 6, x: 6 };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>(WORLD_TRANSFORM);

  // Responsive size: the interactive map fills its container and re-projects on
  // resize (never during pan/zoom). The static locator keeps a fixed 2:1 viewBox.
  const [size, setSize] = useState<ViewportSize>(VIEW_SIZE);
  const projSize = interactive ? size : VIEW_SIZE;
  const sizeRef = useRef(projSize); sizeRef.current = projSize;

  useLayoutEffect(() => {
    if (!interactive) return;
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      setSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [interactive]);

  // True while the current touch has become a drag, so the click synthesized on
  // touchend does not select a country. Reset when a fresh touch/mouse press begins.
  const movedRef = useRef(false);
  const handleSelect = useCallback((atlasId: string) => {
    if (movedRef.current) { movedRef.current = false; return; }
    onSelect?.(atlasId);
  }, [onSelect]);

  // Geometry, markers, continent + entity boxes — recomputed only when the
  // topology or the container size changes (never during pan/zoom).
  const { shapes, inert, markers, continentBoxes, entityBoxes, spherePath, gratPath } = useMemo(() => {
    const fc = feature(topology, topology.objects.countries) as unknown as {
      features: (Feature<Geometry> & { id?: string | number; properties?: { name?: string } })[];
    };
    const projection = geoEqualEarth().fitExtent(
      [[fp.x, fp.top], [projSize.width - fp.x, projSize.height - fp.bottom]],
      fc as never,
    );
    const path = geoPath(projection);
    const interactivePieces: ShapePiece[] = [];
    const inertPieces: string[] = [];
    const boxesById: Record<string, Box> = {};
    for (const f of fc.features) {
      const atlasId = matchFeatureToAtlasId({ id: f.id, name: f.properties?.name });
      const d = path(f as never);
      if (!d) continue;
      if (atlasId) {
        interactivePieces.push({ atlasId, d });
        boxesById[atlasId] = boundsToBox(path.bounds(f as never) as [[number, number], [number, number]]);
      } else {
        inertPieces.push(d);
      }
    }
    const markerPieces: MarkerPiece[] = [];
    for (const [atlasId, coord] of Object.entries(MARKER_COORDS)) {
      const p = projection(coord as [number, number]);
      if (p) {
        markerPieces.push({ atlasId, name: ENTITY_NAME.get(atlasId) ?? atlasId, x: p[0], y: p[1] });
        if (!boxesById[atlasId]) boxesById[atlasId] = pointBox({ x: p[0], y: p[1] }); // polygonless → fly to a point
      }
    }
    const boxes: Record<string, Box> = {};
    for (const [name, ll] of Object.entries(CONTINENT_LONLAT)) boxes[name] = projectedBox(projection, ll);
    return {
      shapes: interactivePieces, inert: inertPieces, markers: markerPieces,
      continentBoxes: boxes, entityBoxes: boxesById,
      spherePath: path({ type: 'Sphere' } as never) ?? '',
      gratPath: path(geoGraticule10() as never) ?? '',
    };
  }, [topology, projSize.width, projSize.height, fp.top, fp.bottom, fp.x]);

  // Rendered children memoized so pan/zoom never re-renders 240+ paths — only
  // the <g> transform attribute changes per frame.
  const inertEls = useMemo(() => inert.map((d, i) => (
    <path key={`i-${i}`} d={d} fill="#121826" stroke="#0b1120" strokeWidth={0.3} />
  )), [inert]);

  // The selected shape is painted LAST so its glow raises above its neighbors.
  const shapeEls = useMemo(() => {
    const out: React.ReactNode[] = [];
    let selectedEl: React.ReactNode = null;
    shapes.forEach((piece, i) => {
      const hasProfile = profileIds.has(piece.atlasId);
      const isSelected = selectedAtlasId === piece.atlasId;
      const el = (
        <path
          key={`c-${piece.atlasId}-${i}`}
          className={landClass(piece.atlasId, hasProfile, isSelected)}
          d={piece.d}
          onClick={interactive && onSelect ? () => handleSelect(piece.atlasId) : undefined}
        >
          <title>{ENTITY_NAME.get(piece.atlasId) ?? piece.atlasId}</title>
        </path>
      );
      if (isSelected) selectedEl = el; else out.push(el);
    });
    if (selectedEl) out.push(selectedEl);
    return out;
  }, [shapes, profileIds, selectedAtlasId, interactive, onSelect, handleSelect]);

  // Only dot the entities worth locating: Core Atlas members, anything with a
  // profile, or the current selection. Tiny non-Core islands stay in search/list
  // rather than speckling the map. Each marker is an amber dot + pulsing halo.
  const markerEls = useMemo(() => {
    const out: React.ReactNode[] = [];
    let selectedEl: React.ReactNode = null;
    markers.forEach(m => {
      const hasProfile = profileIds.has(m.atlasId);
      const isSelected = selectedAtlasId === m.atlasId;
      if (!hasProfile && !isSelected && !isCoreAtlas(m.atlasId)) return;
      const dot = isSelected ? 3.6 : 2.6;
      const halo = isSelected ? 7 : 5.5;
      const el = (
        <g
          key={`m-${m.atlasId}`}
          className={`atlas-mk${isSelected ? ' is-selected' : ''}`}
          onClick={interactive && onSelect ? () => handleSelect(m.atlasId) : undefined}
        >
          <circle className="atlas-mk__halo" cx={m.x} cy={m.y} r={halo} />
          <circle className="atlas-mk__dot" cx={m.x} cy={m.y} r={dot} />
          <title>{m.name}</title>
        </g>
      );
      if (isSelected) selectedEl = el; else out.push(el);
    });
    if (selectedEl) out.push(selectedEl);
    return out;
  }, [markers, profileIds, selectedAtlasId, interactive, onSelect, handleSelect]);

  // ── Gesture plumbing ────────────────────────────────────────────────────────
  const tRef = useRef(transform); tRef.current = transform;
  const pendingRef = useRef<Transform | null>(null);
  const rafRef = useRef(0);
  const animRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const touchPanRef = useRef<Point | null>(null);   // one-finger pan anchor (viewBox units)
  const tapStartRef = useRef<Point | null>(null);   // initial touch position (client px) for tap/drag

  const current = useCallback(() => pendingRef.current ?? tRef.current, []);

  const commit = useCallback((next: Transform) => {
    pendingRef.current = next;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (pendingRef.current) { setTransform(pendingRef.current); pendingRef.current = null; }
      });
    }
  }, []);

  const clientToVb = useCallback((clientX: number, clientY: number): Point => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const s = sizeRef.current;
    return { x: ((clientX - r.left) / r.width) * s.width, y: ((clientY - r.top) / r.height) * s.height };
  }, []);

  const cancelAnim = () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = 0; } };

  const animateTo = useCallback((target: Transform) => {
    cancelAnim();
    const dur = tweenDuration(prefersReducedMotion());
    if (dur === 0) { setTransform(target); return; }
    const start = current();
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / dur);
      setTransform(lerpTransform(start, target, easeOutCubic(u)));
      if (u < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = 0;
    };
    animRef.current = requestAnimationFrame(step);
  }, [current]);

  const focusContinent = useCallback((name: string) => {
    cancelAnim();
    animateTo(name === 'World' ? WORLD_TRANSFORM : fitBox(continentBoxes[name], sizeRef.current));
  }, [animateTo, continentBoxes]);

  const focusEntity = useCallback((atlasId: string, inset?: ViewInset) => {
    const box = entityBoxes[atlasId];
    if (!box) return;
    cancelAnim();
    // With an inset, center the entity in the visible band above the sheet;
    // otherwise center it in the whole viewport. Both preserve proportions.
    animateTo(inset ? fitBoxInset(box, sizeRef.current, inset) : fitBox(box, sizeRef.current, 0.55));
  }, [animateTo, entityBoxes]);

  const zoomButton = useCallback((dir: 1 | -1) => {
    const s = sizeRef.current;
    const center: Point = { x: s.width / 2, y: s.height / 2 };
    const t = current();
    commit(clampTranslate(zoomAtPoint(t, t.k * (dir === 1 ? 1.6 : 1 / 1.6), center), s));
  }, [commit, current]);

  const recenter = useCallback(() => { cancelAnim(); animateTo(WORLD_TRANSFORM); }, [animateTo]);

  useImperativeHandle(ref, (): WorldMapHandle => ({
    focusContinent,
    focusEntity,
    zoomIn: () => zoomButton(1),
    zoomOut: () => zoomButton(-1),
    recenter,
  }), [focusContinent, focusEntity, zoomButton, recenter]);

  // Native wheel + touch listeners (passive:false so we can preventDefault).
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !interactive) return;

    const vb = (t: Touch) => clientToVb(t.clientX, t.clientY);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnim();
      commit(applyWheel(current(), e.deltaY, clientToVb(e.clientX, e.clientY), sizeRef.current));
    };

    const onTouchStart = (e: TouchEvent) => {
      cancelAnim();
      if (shouldPinch(e.touches.length)) {
        // Two fingers → pinch, anchored at the current transform so adding the
        // second finger never jumps the map. A multi-touch gesture is not a tap.
        e.preventDefault();
        movedRef.current = true;
        touchPanRef.current = null;
        pinchRef.current = beginPinch(vb(e.touches[0]), vb(e.touches[1]), current());
      } else if (e.touches.length === 1) {
        // One finger → potential tap or pan. Do NOT preventDefault yet, so a tap
        // still produces the click that selects a country.
        const t0 = e.touches[0];
        touchPanRef.current = vb(t0);
        tapStartRef.current = { x: t0.clientX, y: t0.clientY };
        movedRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (shouldPinch(e.touches.length) && pinchRef.current) {
        e.preventDefault();
        commit(updatePinch(pinchRef.current, vb(e.touches[0]), vb(e.touches[1]), sizeRef.current));
        return;
      }
      if (e.touches.length === 1 && touchPanRef.current) {
        const t0 = e.touches[0];
        if (!movedRef.current) {
          // Still within tap slop → not yet a pan (protects taps from panning).
          const start = tapStartRef.current;
          if (!start || !exceedsTapThreshold(start, { x: t0.clientX, y: t0.clientY })) return;
          movedRef.current = true;
          touchPanRef.current = vb(t0); // re-anchor so the pan starts without a jump
        }
        e.preventDefault(); // active pan → own the gesture (page will not scroll)
        const p = vb(t0);
        commit(dragPan(current(), touchPanRef.current, p, sizeRef.current));
        touchPanRef.current = p;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // A finger lifted after a pinch → keep panning with the finger that
        // remains, re-anchored to it so movement does not jump.
        pinchRef.current = null;
        touchPanRef.current = vb(e.touches[0]);
        movedRef.current = true;
      } else if (e.touches.length === 0) {
        pinchRef.current = null;
        touchPanRef.current = null;
        tapStartRef.current = null;
        // movedRef persists so the synthesized click is suppressed after a drag;
        // the next one-finger touchstart resets it for the next tap.
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [interactive, clientToVb, commit, current]);

  // Desktop click-drag panning via window listeners while a drag is active.
  useEffect(() => {
    if (!interactive) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const el = svgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = sizeRef.current;
      const dx = ((e.clientX - d.x) / r.width) * s.width;
      const dy = ((e.clientY - d.y) / r.height) * s.height;
      dragRef.current = { x: e.clientX, y: e.clientY };
      commit(panBy(current(), dx, dy, s));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [interactive, commit, current]);

  // Cleanup any pending frames on unmount.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  const svg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${projSize.width} ${projSize.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="World map. Use the country search and list for keyboard and screen-reader access."
      style={{
        display: 'block', background: MAP_RADIAL,
        // Map owns all touch gestures within its bounds (one-finger pan, two-finger
        // pinch); page scroll/zoom outside the map is unaffected.
        touchAction: 'none',
        ...(interactive
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: dragRef.current ? 'grabbing' : 'grab' }
          : { width: '100%', height: 'auto', borderRadius: 10, cursor: 'default' }),
      }}
      onMouseDown={interactive ? (e => { if (e.button === 0) { cancelAnim(); movedRef.current = false; dragRef.current = { x: e.clientX, y: e.clientY }; } }) : undefined}
    >
      <style>{MAP_CSS}</style>
      <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
        <path className="atlas-sphere" d={spherePath} />
        <path className="atlas-grat" d={gratPath} aria-hidden="true" />
        <g aria-hidden="true">{inertEls}</g>
        <g className={`atlas-layer scope--${scope}${interactive ? '' : ' is-static'}`}>
          <g>{shapeEls}</g>
          <g>{markerEls}</g>
        </g>
      </g>
    </svg>
  );

  // Static locator: bare 2:1 SVG (profile page sizes it).
  if (!interactive) return svg;

  // Interactive: a headless surface that fills its positioned parent; the page
  // HUD/rail drives continent focus, zoom, and recenter via the imperative handle.
  return <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }}>{svg}</div>;
});
