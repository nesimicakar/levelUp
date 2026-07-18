'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import { matchFeatureToAtlasId } from '@/lib/logic/atlasGeo';
import { MARKER_COORDS } from '@/lib/data/atlasMarkers';
import { ATLAS_ENTITIES } from '@/lib/data/atlasEntities';
import { isCoreAtlas } from '@/lib/data/coreAtlas';
import { TOUCH_MIN } from '@/lib/logic/atlasTouch';
import {
  VIEW_W, VIEW_H, WORLD_TRANSFORM,
  applyWheel, panBy, beginPinch, updatePinch, shouldPinch, fitBox,
  zoomAtPoint, clampTranslate, tweenDuration, lerpTransform,
  dragPan, exceedsTapThreshold,
  type Transform, type Point, type Box, type PinchState,
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
const CONTINENTS = ['World', ...Object.keys(CONTINENT_LONLAT)];

interface ShapePiece { atlasId: string; d: string; }
interface MarkerPiece { atlasId: string; name: string; x: number; y: number; }

function shapeStyle(hasProfile: boolean, isSelected: boolean): React.CSSProperties {
  if (isSelected) return { fill: hasProfile ? '#fbbf24' : '#3b4d6b', stroke: '#fef3c7', strokeWidth: 1.4 };
  return { fill: hasProfile ? 'rgba(245,158,11,0.62)' : '#26324a', stroke: '#0b1120', strokeWidth: 0.4 };
}

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
}

export function WorldMap({ topology, profileIds, selectedAtlasId, onSelect, interactive = true }: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [transform, setTransform] = useState<Transform>(WORLD_TRANSFORM);

  // True while the current touch has become a drag, so the click synthesized on
  // touchend does not select a country. Reset when a fresh touch/mouse press begins.
  const movedRef = useRef(false);
  const handleSelect = useCallback((atlasId: string) => {
    if (movedRef.current) { movedRef.current = false; return; }
    onSelect?.(atlasId);
  }, [onSelect]);

  // Geometry, markers, and continent boxes — computed ONCE per topology.
  const { shapes, inert, markers, continentBoxes } = useMemo(() => {
    const fc = feature(topology, topology.objects.countries) as unknown as {
      features: (Feature<Geometry> & { id?: string | number; properties?: { name?: string } })[];
    };
    const projection = geoEqualEarth().fitExtent([[6, 6], [VIEW_W - 6, VIEW_H - 6]], fc as never);
    const path = geoPath(projection);
    const interactivePieces: ShapePiece[] = [];
    const inertPieces: string[] = [];
    for (const f of fc.features) {
      const atlasId = matchFeatureToAtlasId({ id: f.id, name: f.properties?.name });
      const d = path(f as never);
      if (!d) continue;
      if (atlasId) interactivePieces.push({ atlasId, d });
      else inertPieces.push(d);
    }
    const markerPieces: MarkerPiece[] = [];
    for (const [atlasId, coord] of Object.entries(MARKER_COORDS)) {
      const p = projection(coord as [number, number]);
      if (p) markerPieces.push({ atlasId, name: ENTITY_NAME.get(atlasId) ?? atlasId, x: p[0], y: p[1] });
    }
    const boxes: Record<string, Box> = {};
    for (const [name, ll] of Object.entries(CONTINENT_LONLAT)) boxes[name] = projectedBox(projection, ll);
    return { shapes: interactivePieces, inert: inertPieces, markers: markerPieces, continentBoxes: boxes };
  }, [topology]);

  // Rendered children memoized so pan/zoom never re-renders 240+ paths — only
  // the <g> transform attribute changes per frame.
  const inertEls = useMemo(() => inert.map((d, i) => (
    <path key={`i-${i}`} d={d} fill="#121826" stroke="#0b1120" strokeWidth={0.3} />
  )), [inert]);

  const shapeEls = useMemo(() => shapes.map((piece, i) => {
    const hasProfile = profileIds.has(piece.atlasId);
    const isSelected = selectedAtlasId === piece.atlasId;
    return (
      <path
        key={`c-${piece.atlasId}-${i}`}
        d={piece.d}
        style={{ ...shapeStyle(hasProfile, isSelected), cursor: interactive ? 'pointer' : 'default' }}
        onClick={interactive && onSelect ? () => handleSelect(piece.atlasId) : undefined}
      >
        <title>{ENTITY_NAME.get(piece.atlasId) ?? piece.atlasId}</title>
      </path>
    );
  }), [shapes, profileIds, selectedAtlasId, interactive, onSelect, handleSelect]);

  // Only dot the entities worth locating: Core Atlas members, anything with a
  // profile, or the current selection. Tiny non-Core islands stay in search/list
  // rather than speckling the map. Unselected/unprofiled dots render faint.
  const markerEls = useMemo(() => markers.map(m => {
    const hasProfile = profileIds.has(m.atlasId);
    const isSelected = selectedAtlasId === m.atlasId;
    if (!hasProfile && !isSelected && !isCoreAtlas(m.atlasId)) return null;
    const r = isSelected ? 5 : hasProfile ? 3.4 : 2;
    return (
      <circle
        key={`m-${m.atlasId}`} cx={m.x} cy={m.y} r={r}
        style={{
          fill: hasProfile ? '#fbbf24' : '#0a0f1a',
          stroke: isSelected ? '#fef3c7' : hasProfile ? '#fbbf24' : '#7c93b8',
          strokeWidth: isSelected ? 1.6 : hasProfile ? 1.2 : 0.7,
          opacity: hasProfile || isSelected ? 1 : 0.5,
          cursor: interactive ? 'pointer' : 'default',
        }}
        onClick={interactive && onSelect ? () => handleSelect(m.atlasId) : undefined}
      >
        <title>{m.name}</title>
      </circle>
    );
  }), [markers, profileIds, selectedAtlasId, interactive, onSelect, handleSelect]);

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
    return { x: ((clientX - r.left) / r.width) * VIEW_W, y: ((clientY - r.top) / r.height) * VIEW_H };
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

  const focusContinent = (name: string) => {
    cancelAnim();
    animateTo(name === 'World' ? WORLD_TRANSFORM : fitBox(continentBoxes[name]));
  };

  const zoomButton = (dir: 1 | -1) => {
    const center: Point = { x: VIEW_W / 2, y: VIEW_H / 2 };
    const t = current();
    commit(clampTranslate(zoomAtPoint(t, t.k * (dir === 1 ? 1.6 : 1 / 1.6), center)));
  };

  // Native wheel + touch listeners (passive:false so we can preventDefault).
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !interactive) return;

    const vb = (t: Touch) => clientToVb(t.clientX, t.clientY);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnim();
      commit(applyWheel(current(), e.deltaY, clientToVb(e.clientX, e.clientY)));
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
        commit(updatePinch(pinchRef.current, vb(e.touches[0]), vb(e.touches[1])));
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
        commit(dragPan(current(), touchPanRef.current, p));
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
      const dx = ((e.clientX - d.x) / r.width) * VIEW_W;
      const dy = ((e.clientY - d.y) / r.height) * VIEW_H;
      dragRef.current = { x: e.clientX, y: e.clientY };
      commit(panBy(current(), dx, dy));
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
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      aria-label="World map. Use the country search and list below for keyboard and screen-reader access."
      style={{
        display: 'block', background: '#0a0f1a', borderRadius: 10,
        // Map owns all touch gestures within its bounds (one-finger pan, two-finger
        // pinch); page scroll/zoom outside the map is unaffected.
        touchAction: 'none',
        cursor: interactive ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
      }}
      onMouseDown={interactive ? (e => { if (e.button === 0) { cancelAnim(); movedRef.current = false; dragRef.current = { x: e.clientX, y: e.clientY }; } }) : undefined}
    >
      <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
        <g aria-hidden="true">{inertEls}</g>
        <g>{shapeEls}</g>
        <g>{markerEls}</g>
      </g>
    </svg>
  );

  if (!interactive) return svg;

  return (
    <div>
      {/* Continent focus — horizontally scrollable so it fits ~320px. */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1" role="group" aria-label="Focus a continent">
        {CONTINENTS.map(name => (
          <button
            key={name}
            onClick={() => focusContinent(name)}
            className="flex-shrink-0 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-text-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
            style={{ minHeight: TOUCH_MIN, background: '#0f1623', border: '1px solid #1e2333' }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="relative">
        {svg}
        {/* Zoom + reset — ≥44px touch targets with a compact inner visual. */}
        <div className="absolute right-2 bottom-2 flex flex-col gap-0.5">
          {([
            { label: 'Zoom in', on: () => zoomButton(1), node: <span className="font-bold text-lg text-text">+</span> },
            { label: 'Zoom out', on: () => zoomButton(-1), node: <span className="font-bold text-lg text-text">−</span> },
            { label: 'Reset view', on: () => focusContinent('World'), node: (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9z" /><path d="M3 3v6h6" />
              </svg>
            ) },
          ] as const).map(b => (
            <button key={b.label} onClick={b.on} aria-label={b.label}
              className="flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-warning rounded-lg"
              style={{ minWidth: TOUCH_MIN, minHeight: TOUCH_MIN }}>
              <span className="w-[34px] h-[34px] rounded-lg flex items-center justify-center" style={{ background: '#0f1623ee', border: '1px solid #1e2333' }}>
                {b.node}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Gesture hint + non-gesture alternative. */}
      <p className="text-[9px] text-text-muted mt-1.5 px-1">
        Drag to move · pinch with two fingers to zoom · tap a country to open it · or use search &amp; the list below.
      </p>
    </div>
  );
}
