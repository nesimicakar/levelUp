'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllConcepts, getAllDomains } from '@/lib/db';
import type { KnowledgeConcept, KnowledgeDomain } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type RetStatus = 'healthy' | 'upcoming' | 'due';
type RetFilter = 'all' | RetStatus;

interface GNode {
  id: string;
  name: string;
  summary: string;
  domainId: string;
  reviews: number;
  status: RetStatus;
  retentionScore: number;
  isDue: boolean;
  sourceTitle?: string;
  sourceType: string;
  tags: string[];
  relatedConceptIds: string[];
  lastReviewedAt?: number;
  r: number;
  x: number;
  y: number;
  related: GNode[];
}

interface GLink {
  a: GNode;
  b: GNode;
  kind: 'related' | 'tag' | 'source' | 'spoke' | 'bridge';
}

interface GGroup {
  domainId: string;
  color: string;
  name: string;
  items: GNode[];
  hub: GNode;
  cx: number;
  cy: number;
  clusterR: number;
}

interface Graph {
  nodes: GNode[];
  links: GLink[];
  groups: GGroup[];
}

interface Camera { x: number; y: number; scale: number; }

interface NodeElRef {
  wrap: HTMLDivElement;
  orb: HTMLDivElement;
  ring: HTMLDivElement;
  label: HTMLDivElement;
  n: GNode;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GOLDEN = 2.399963;
const CLUSTER_PAD = 44;   // tighter spiral — small vaults feel denser
const TAU = Math.PI * 2;

const STATUS_COLOR: Record<RetStatus, string> = {
  healthy: '#22c55e',
  upcoming: '#f59e0b',
  due: '#ef4444',
};

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(h: string, a: number) {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(h: string) {
  const [r, g, b] = hexToRgb(h);
  return `rgb(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 70)})`;
}
function darken(h: string) {
  const [r, g, b] = hexToRgb(h);
  return `rgb(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)})`;
}
function nodeRadius(reviews: number) {
  // Wider range (11–34) + steeper growth so reviewed concepts visibly stand out.
  return Math.max(11, Math.min(34, 10 + Math.sqrt(Math.max(0, reviews)) * 3.8));
}
function conceptStatus(c: KnowledgeConcept): RetStatus {
  if (c.nextReviewAt <= Date.now()) return 'due';
  if (c.retentionScore < 70) return 'upcoming';
  return 'healthy';
}

// ── Graph builder ─────────────────────────────────────────────────────────────

function buildGraph(concepts: KnowledgeConcept[], domains: KnowledgeDomain[]): Graph {
  if (!concepts.length) return { nodes: [], links: [], groups: [] };

  const domMap = new Map(domains.map(d => [d.id, d]));

  const nodes: GNode[] = concepts.map(c => ({
    id: c.id,
    name: c.title,
    summary: c.summary,
    domainId: c.primaryDomainId,
    reviews: c.reviewCount,
    status: conceptStatus(c),
    retentionScore: c.retentionScore,
    isDue: c.nextReviewAt <= Date.now(),
    sourceTitle: c.sourceTitle,
    sourceType: c.sourceType,
    tags: c.tags,
    relatedConceptIds: c.relatedConceptIds,
    lastReviewedAt: c.lastReviewedAt,
    r: nodeRadius(c.reviewCount),
    x: 0, y: 0,
    related: [],
  }));

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Group by domain
  const byDomain = new Map<string, GNode[]>();
  for (const n of nodes) {
    const a = byDomain.get(n.domainId) ?? [];
    a.push(n);
    byDomain.set(n.domainId, a);
  }

  const groups: GGroup[] = [...byDomain.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([domainId, items]) => {
      const d = domMap.get(domainId);
      items.sort((a, b) => b.reviews - a.reviews);
      return {
        domainId, color: d?.color ?? '#64748b',
        name: d?.name ?? domainId,
        items, hub: items[0], cx: 0, cy: 0, clusterR: 60,
      };
    });

  // Intra-cluster spiral
  let maxR = 0;
  const lpos = new Map<string, [number, number]>();
  for (const g of groups) {
    g.items.forEach((n, k) => {
      const ang = k * GOLDEN;
      const rad = k === 0 ? 0 : CLUSTER_PAD * Math.sqrt(k + 0.55);
      lpos.set(n.id, [Math.cos(ang) * rad, Math.sin(ang) * rad]);
      maxR = Math.max(maxR, rad + n.r);
    });
    g.clusterR = Math.max(
      ...g.items.map(n => { const [lx, ly] = lpos.get(n.id)!; return Math.hypot(lx, ly) + n.r; }),
      60,
    );
  }

  // Place clusters on ring — radius scales with concept count so small vaults stay tight
  const Dp = groups.length;
  const ringR = Dp <= 1 ? 0 : maxR * 1.25 + 60 + Dp * 14;
  groups.forEach((g, gi) => {
    const ang = -Math.PI / 2 + (gi / Dp) * TAU;
    g.cx = Dp <= 1 ? 0 : Math.cos(ang) * ringR;
    g.cy = Dp <= 1 ? 0 : Math.sin(ang) * ringR;
    g.items.forEach(n => {
      const [lx, ly] = lpos.get(n.id)!;
      n.x = g.cx + lx;
      n.y = g.cy + ly;
    });
  });

  // Links
  const seen = new Set<string>();
  const links: GLink[] = [];
  const addLink = (a: GNode, b: GNode, kind: GLink['kind']) => {
    if (a === b) return;
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    links.push({ a, b, kind });
  };

  for (const n of nodes)
    for (const id of n.relatedConceptIds) { const o = nodeMap.get(id); if (o) addLink(n, o, 'related'); }

  const tagMap = new Map<string, GNode[]>();
  for (const n of nodes)
    for (const t of n.tags) { const a = tagMap.get(t) ?? []; a.push(n); tagMap.set(t, a); }
  for (const tn of tagMap.values()) {
    if (tn.length < 2) continue;
    const hub = tn.reduce((a, b) => b.reviews > a.reviews ? b : a);
    for (const n of tn) if (n !== hub) addLink(hub, n, 'tag');
  }

  const srcMap = new Map<string, GNode[]>();
  for (const n of nodes)
    if (n.sourceTitle) { const a = srcMap.get(n.sourceTitle) ?? []; a.push(n); srcMap.set(n.sourceTitle, a); }
  for (const sn of srcMap.values()) {
    if (sn.length < 2) continue;
    const hub = sn.reduce((a, b) => b.reviews > a.reviews ? b : a);
    for (const n of sn) if (n !== hub) addLink(hub, n, 'source');
  }

  for (const g of groups)
    for (let k = 1; k < g.items.length; k++) addLink(g.hub, g.items[k], 'spoke');

  if (Dp > 1)
    for (let gi = 0; gi < Dp; gi++) addLink(groups[gi].hub, groups[(gi + 1) % Dp].hub, 'bridge');

  // Related nodes for sheet — explicit relatedConceptIds only, never graph edges
  for (const n of nodes)
    n.related = n.relatedConceptIds
      .map(id => nodeMap.get(id))
      .filter((o): o is GNode => o !== undefined);

  return { nodes, links, groups };
}

// ── Data loader ───────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [data, setData] = useState<{ concepts: KnowledgeConcept[]; domains: KnowledgeDomain[] } | null>(null);

  useEffect(() => {
    Promise.all([getAllConcepts(), getAllDomains()])
      .then(([concepts, domains]) => setData({ concepts, domains }));
  }, []);

  if (!data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#04060c', zIndex: 55 }}>
        <p className="text-[10px] uppercase tracking-widest animate-pulse" style={{ color: '#60a5fa', fontFamily: 'var(--font-mono, ui-monospace)' }}>
          Loading constellation…
        </p>
      </div>
    );
  }

  if (!data.concepts.length) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ background: '#04060c', zIndex: 55 }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: '#60a5fa' }}>No concepts in vault yet</p>
        <Link href="/knowledge" className="text-[10px] uppercase tracking-widest" style={{ color: '#f59e0b' }}>← Return to Vault</Link>
      </div>
    );
  }

  return <Constellation concepts={data.concepts} domains={data.domains} />;
}

// ── Constellation ─────────────────────────────────────────────────────────────

function Constellation({ concepts, domains }: { concepts: KnowledgeConcept[]; domains: KnowledgeDomain[] }) {
  const router = useRouter();

  // DOM refs
  const stageRef  = useRef<HTMLDivElement>(null);
  const svgRef    = useRef<SVGSVGElement>(null);
  const halosRef  = useRef<HTMLDivElement>(null);
  const nodesRef  = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  // Imperative state (no re-renders)
  const graphRef   = useRef<Graph | null>(null);
  const camRef     = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const dimsRef    = useRef({ w: 0, h: 0 });
  const nodeElsRef = useRef<Map<string, NodeElRef>>(new Map());
  const linkElsRef = useRef<Array<{ ln: SVGLineElement; lk: GLink }>>([]);
  const haloElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const domLblsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const filterRef  = useRef<RetFilter>('all');
  const focusRef   = useRef<string | null>(null);
  const selRef     = useRef<string | null>(null);
  const camAnimRef = useRef<number | null>(null);
  const rafRef     = useRef(0);
  const domMapRef  = useRef<Map<string, KnowledgeDomain>>(new Map());

  // React state (HUD + sheet)
  const [retFilter, setRetFilter]         = useState<RetFilter>('all');
  const [focusDomain, setFocusDomain]     = useState<string | null>(null);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [hudStats, setHudStats]           = useState({ total: 0, domains: 0, due: 0, healthy: 0, upcoming: 0 });
  const [hudGroups, setHudGroups]         = useState<GGroup[]>([]);
  const [showLegend, setShowLegend]       = useState(false);

  // ── render frame ──────────────────────────────────────────────────────────

  const renderFrame = useCallback(() => {
    rafRef.current = 0;
    const G = graphRef.current;
    if (!G) return;

    const { w: dw, h: dh } = dimsRef.current;
    const w = dw || window.innerWidth;
    const h = dh || window.innerHeight;
    const cam = camRef.current;
    const retF = filterRef.current;
    const focD = focusRef.current;
    const selId = selRef.current;
    const labelAll = G.nodes.length <= 15;

    const px = (wx: number) => (wx - cam.x) * cam.scale + w / 2;
    const py = (wy: number) => (wy - cam.y) * cam.scale + h / 2;

    // O(1) group lookup instead of O(n) find per halo/label
    const groupMap = new Map(G.groups.map(g => [g.domainId, g]));

    // Precompute selected node's related set (O(1) map lookup instead of O(n) find)
    let selRelIds: Set<string> | null = null;
    if (selId) {
      const selN = nodeElsRef.current.get(selId)?.n;
      if (selN) selRelIds = new Set(selN.related.map(r => r.id));
    }

    // Off-screen visibility check — cull elements fully outside the viewport
    const ov = (nx: number, ny: number, nr: number) => {
      const sx = px(nx), sy = py(ny);
      return sx > -nr - 60 && sx < w + nr + 60 && sy > -nr - 60 && sy < h + nr + 60;
    };

    for (const [domId, halo] of haloElsRef.current) {
      const g = groupMap.get(domId);
      if (!g) continue;
      if (!ov(g.cx, g.cy, g.clusterR * cam.scale + 80)) { halo.style.opacity = '0'; continue; }
      const size = Math.max(60, g.clusterR * 2.8 * cam.scale + 80);
      halo.style.width = halo.style.height = `${size}px`;
      halo.style.transform = `translate(${px(g.cx)}px,${py(g.cy)}px) translate(-50%,-50%)`;
      halo.style.opacity = (!!focD && focD !== domId) ? '0.04' : '1';
    }

    for (const [domId, lbl] of domLblsRef.current) {
      const g = groupMap.get(domId);
      if (!g) continue;
      const dim = !!focD && focD !== domId;
      // Keep label at least 28px above cluster center regardless of zoom scale
      const lblY = py(g.cy) - Math.max(g.clusterR * cam.scale + 12, 28);
      lbl.style.transform = `translate(${px(g.cx)}px,${lblY}px) translate(-50%,-100%)`;
      lbl.style.opacity = dim ? '0.22' : '1';
    }

    for (const { ln, lk } of linkElsRef.current) {
      // Skip links where both endpoints are off-screen (big win for large vaults)
      if (!ov(lk.a.x, lk.a.y, lk.a.r) && !ov(lk.b.x, lk.b.y, lk.b.r)) {
        ln.style.opacity = '0'; continue;
      }
      ln.setAttribute('x1', String(px(lk.a.x)));
      ln.setAttribute('y1', String(py(lk.a.y)));
      ln.setAttribute('x2', String(px(lk.b.x)));
      ln.setAttribute('y2', String(py(lk.b.y)));
      const dimL = (!!focD && lk.a.domainId !== focD && lk.b.domainId !== focD)
        || (retF !== 'all' && lk.a.status !== retF && lk.b.status !== retF);
      const isConnToSel = !!selId && (lk.a.id === selId || lk.b.id === selId);
      // Opacity hierarchy mirrors the semantic weight: explicit > inferred > layout
      ln.style.opacity = dimL ? '0.03'
        : isConnToSel ? '0.92'
        : lk.kind === 'related' ? '0.58'
        : lk.kind === 'tag'     ? '0.40'
        : lk.kind === 'source'  ? '0.28'
        : lk.kind === 'spoke'   ? '0.14'
        : '0.07';  // bridge
      // Preserve per-kind stroke widths; bump selected connections
      ln.style.strokeWidth = isConnToSel ? '2.5'
        : lk.kind === 'related' ? '2'
        : lk.kind === 'tag'     ? '1.5'
        : lk.kind === 'source'  ? '1'
        : '0.75';
    }

    for (const [id, ref] of nodeElsRef.current) {
      const { wrap, orb, label, n } = ref;
      wrap.style.transform = `translate(${px(n.x)}px,${py(n.y)}px) translate(-50%,-50%)`;
      const matchR = retF === 'all' || n.status === retF;
      const matchD = !focD || n.domainId === focD;
      const dim = !matchR || !matchD;
      const isSelected = selId === id;
      const isRelated  = !dim && !!selRelIds?.has(id);
      const isUnrelated = !dim && !!selId && !isSelected && !isRelated;
      wrap.style.opacity = dim ? '0.12' : isUnrelated ? '0.22' : '1';
      wrap.style.filter  = dim ? 'grayscale(0.7)' : isUnrelated ? 'saturate(0.25)' : '';
      wrap.style.zIndex  = isSelected ? '30' : '';
      orb.style.transform = isSelected ? 'scale(1.15)' : isRelated ? 'scale(1.06)' : '';
      const showLbl = !dim && (isSelected || isRelated || labelAll || n.r >= 17 || cam.scale >= 1.0 || focD === n.domainId);
      label.style.opacity = showLbl ? '1' : '0';
    }
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(renderFrame);
  }, [renderFrame]);

  // ── camera ────────────────────────────────────────────────────────────────

  const animateTo = useCallback((target: Camera, dur: number) => {
    if (dur <= 0) { camRef.current = { ...target }; schedule(); return; }
    const from = { ...camRef.current };
    const t0 = performance.now();
    if (camAnimRef.current) cancelAnimationFrame(camAnimRef.current);
    const step = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      camRef.current = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        scale: from.scale + (target.scale - from.scale) * e,
      };
      schedule();
      if (t < 1) camAnimRef.current = requestAnimationFrame(step);
      else camAnimRef.current = null;
    };
    camAnimRef.current = requestAnimationFrame(step);
  }, [schedule]);

  const fitView = useCallback((animate: boolean) => {
    const G = graphRef.current;
    if (!G?.nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of G.nodes) {
      minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.r);
    }
    if (!isFinite(minX)) return;
    // Always use real viewport size (canvas is fixed inset-0)
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    // Reserve space for top HUD and bottom domain rail
    const padH = 220, padB = 88, padS = 40;
    const availW = Math.max(w - padS * 2, 100);
    const availH = Math.max(h - padH - padB, 100);
    const s = Math.max(0.15, Math.min(1.3, Math.min(availW / bw, availH / bh) * 0.88));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Shift camera so graph center appears in the middle of the available area, not the full screen center
    const screenCY = padH + availH / 2;
    const camY = cy - (screenCY - h / 2) / s;
    animateTo({ x: cx, y: camY, scale: s }, animate ? 600 : 0);
  }, [animateTo]);

  const zoomAround = useCallback((px: number, py: number, factor: number) => {
    const { w: dw, h: dh } = dimsRef.current;
    const w = dw || window.innerWidth;
    const h = dh || window.innerHeight;
    const cam = camRef.current;
    const wx = (px - w / 2) / cam.scale + cam.x;
    const wy = (py - h / 2) / cam.scale + cam.y;
    const ns = Math.max(0.25, Math.min(3, cam.scale * factor));
    camRef.current = { x: wx - (px - w / 2) / ns, y: wy - (py - h / 2) / ns, scale: ns };
    schedule();
  }, [schedule]);

  const measure = useCallback(() => {
    // Canvas is always position:fixed;inset:0 — window dimensions are authoritative.
    const w = window.innerWidth;
    const h = window.innerHeight;
    dimsRef.current = { w, h };
    const svg = svgRef.current;
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width',  String(w));
      svg.setAttribute('height', String(h));
    }
  }, []);

  const focusOnDomain = useCallback((domainId: string) => {
    const G = graphRef.current;
    if (!G) return;
    const newFocus = focusRef.current === domainId ? null : domainId;
    focusRef.current = newFocus;
    setFocusDomain(newFocus);
    if (newFocus) {
      const g = G.groups.find(x => x.domainId === newFocus);
      if (g) {
        const w = dimsRef.current.w || window.innerWidth;
        const h = dimsRef.current.h || window.innerHeight;
        const s = Math.max(0.6, Math.min(1.7, Math.min(w, h) / (g.clusterR * 2.6 + 80)));
        animateTo({ x: g.cx, y: g.cy, scale: s }, 600);
      }
    } else {
      fitView(true);
    }
    schedule();
  }, [animateTo, fitView, schedule]);

  // ── build DOM ─────────────────────────────────────────────────────────────

  const buildDOM = useCallback((G: Graph) => {
    const svg    = svgRef.current;
    const halos  = halosRef.current;
    const nodes  = nodesRef.current;
    const labels = labelsRef.current;
    if (!svg || !halos || !nodes || !labels) return;

    svg.innerHTML = '';
    halos.innerHTML = '';
    nodes.innerHTML = '';
    labels.innerHTML = '';
    nodeElsRef.current.clear();
    linkElsRef.current = [];
    haloElsRef.current.clear();
    domLblsRef.current.clear();

    const NS = 'http://www.w3.org/2000/svg';

    for (const lk of G.links) {
      const ln = document.createElementNS(NS, 'line');
      const c = domMapRef.current.get(lk.a.domainId)?.color ?? '#64748b';

      // Visual encoding: solid = explicit knowledge link, dashed = inferred/thematic,
      // near-invisible = pure layout structure with no semantic meaning.
      if (lk.kind === 'related') {
        // Explicit relatedConceptIds — solid, thickest, domain-colored
        ln.style.stroke = c;
        ln.style.strokeWidth = '2';
      } else if (lk.kind === 'tag') {
        // Shared tag — short dashes, domain-colored, clearly inferred
        ln.style.stroke = c;
        ln.style.strokeWidth = '1.5';
        ln.style.strokeDasharray = '5 4';
      } else if (lk.kind === 'source') {
        // Same source material — dot-dash, domain-colored, background info
        ln.style.stroke = c;
        ln.style.strokeWidth = '1';
        ln.style.strokeDasharray = '1.5 5';
      } else if (lk.kind === 'spoke') {
        // Intra-domain layout helper — hairline, domain-colored, nearly invisible
        ln.style.stroke = c;
        ln.style.strokeWidth = '0.75';
      } else {
        // Bridge: inter-domain layout skeleton — long dash, neutral, barely visible
        ln.style.stroke = 'rgba(140,170,220,0.6)';
        ln.style.strokeWidth = '0.75';
        ln.style.strokeDasharray = '2 10';
      }

      svg.appendChild(ln);
      linkElsRef.current.push({ ln, lk });
    }

    for (const g of G.groups) {
      const halo = document.createElement('div');
      halo.style.cssText = 'position:absolute;left:0;top:0;border-radius:50%;filter:blur(18px);pointer-events:none;transition:opacity .35s;will-change:transform;';
      halo.style.background = `radial-gradient(circle, ${hexA(g.color, 0.65)} 0%, ${hexA(g.color, 0.22)} 48%, transparent 74%)`;
      halos.appendChild(halo);
      haloElsRef.current.set(g.domainId, halo);

      const lbl = document.createElement('div');
      lbl.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.18em;display:flex;align-items:center;gap:6px;transition:opacity .3s;user-select:none;';
      lbl.style.color = g.color;
      lbl.style.textShadow = `0 0 16px ${g.color}, 0 0 6px ${g.color}, 0 1px 4px #000`;

      const dot = document.createElement('span');
      dot.style.cssText = `flex-shrink:0;width:5px;height:5px;border-radius:50%;box-shadow:0 0 8px ${g.color};`;
      dot.style.background = g.color;

      const nameSp = document.createElement('span');
      nameSp.textContent = g.name.toUpperCase();

      const cntSp = document.createElement('span');
      cntSp.style.cssText = 'color:#5b6885;font-weight:700;letter-spacing:0;text-shadow:none;';
      cntSp.textContent = String(g.items.length);

      lbl.append(dot, nameSp, cntSp);
      lbl.addEventListener('click', () => focusOnDomain(g.domainId));
      labels.appendChild(lbl);
      domLblsRef.current.set(g.domainId, lbl);
    }

    for (const n of G.nodes) {
      const d = n.r * 2;
      const c = domMapRef.current.get(n.domainId)?.color ?? '#64748b';
      const sc = STATUS_COLOR[n.status];

      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;left:0;top:0;will-change:transform;cursor:pointer;width:${d}px;height:${d}px;`;
      wrap.dataset.nid = n.id;

      const orb = document.createElement('div');
      orb.style.cssText = 'position:absolute;inset:0;border-radius:50%;transition:transform .2s;';
      orb.style.background = `radial-gradient(circle at 34% 30%, ${lighten(c)} 0%, ${c} 52%, ${darken(c)} 100%)`;
      orb.style.boxShadow = `0 0 ${Math.round(n.r * 0.9)}px ${hexA(c, 0.55)}, inset 0 0 ${Math.round(n.r * 0.5)}px ${hexA(lighten(c), 0.5)}`;

      const ring = document.createElement('div');
      const ringBorder = n.status === 'due' ? '3px' : n.status === 'upcoming' ? '2.5px' : '2px';
      const ringInset  = n.status === 'due' ? '-7px' : '-5px';
      const ringGlow   = n.status === 'due' ? 16 : n.status === 'upcoming' ? 10 : 6;
      ring.style.cssText = `position:absolute;inset:${ringInset};border:${ringBorder} solid ${sc};border-radius:50%;opacity:.96;transition:.25s;box-shadow:0 0 ${ringGlow}px ${hexA(sc, 0.9)},0 0 ${ringGlow * 2}px ${hexA(sc, 0.35)};`;
      if (n.status === 'due') ring.className = 'kg-pulse';

      const label = document.createElement('div');
      // top offset clears the ring's extended inset (-7px for due, -5px for others) + breathing room
      const labelTop = n.status === 'due' ? 'calc(100% + 12px)' : 'calc(100% + 10px)';
      label.style.cssText = `position:absolute;left:50%;top:${labelTop};transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:600;color:#f0f6ff;letter-spacing:.025em;padding:2px 8px;border-radius:5px;background:rgba(4,7,18,.88);border:1px solid rgba(130,165,230,.24);text-shadow:0 1px 6px #000,0 0 10px rgba(0,0,0,.9);transition:opacity .2s;pointer-events:none;backdrop-filter:blur(3px);opacity:0;`;
      label.textContent = n.name;

      wrap.append(orb, ring, label);
      nodes.appendChild(wrap);
      nodeElsRef.current.set(n.id, { wrap, orb, ring, label, n });
    }
  }, [focusOnDomain]);

  // ── pointer events ────────────────────────────────────────────────────────

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let panLast: { x: number; y: number } | null = null;
    let moved = 0;
    let downId: string | null = null;
    const ptrs = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    const onDown = (e: PointerEvent) => {
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      const wrap = (e.target as HTMLElement).closest('[data-nid]') as HTMLElement | null;
      downId = wrap?.dataset.nid ?? null;
      if (ptrs.size === 1) panLast = { x: e.clientX, y: e.clientY };
      else if (ptrs.size === 2) {
        const p = [...ptrs.values()];
        pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const p = [...ptrs.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        // Stage is position:absolute;inset:0 — clientX/Y are already stage coords.
        if (pinchDist) zoomAround((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, d / pinchDist);
        pinchDist = d; moved += 20; return;
      }
      if (panLast) {
        const dx = e.clientX - panLast.x, dy = e.clientY - panLast.y;
        moved += Math.abs(dx) + Math.abs(dy);
        const cam = camRef.current;
        camRef.current = { ...cam, x: cam.x - dx / cam.scale, y: cam.y - dy / cam.scale };
        panLast = { x: e.clientX, y: e.clientY };
        schedule();
      }
    };

    const onUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchDist = 0;
      if (ptrs.size === 0) {
        if (moved < 7 && downId) {
          selRef.current = downId;
          setSelectedId(downId);
          schedule();
        } else if (moved < 7 && !downId) {
          selRef.current = null;
          setSelectedId(null);
          schedule();
        }
        panLast = null; downId = null;
      } else if (ptrs.size === 1) {
        panLast = { ...[...ptrs.values()][0] };
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAround(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('wheel', onWheel);
    };
  }, [schedule, zoomAround]);

  // ── init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    domMapRef.current = new Map(domains.map(d => [d.id, d]));
    const G = buildGraph(concepts, domains);
    graphRef.current = G;

    const due      = G.nodes.filter(n => n.status === 'due').length;
    const healthy  = G.nodes.filter(n => n.status === 'healthy').length;
    const upcoming = G.nodes.filter(n => n.status === 'upcoming').length;
    setHudStats({ total: G.nodes.length, domains: G.groups.length, due, healthy, upcoming });
    setHudGroups(G.groups);

    filterRef.current = 'all'; focusRef.current = null; selRef.current = null;
    setRetFilter('all'); setFocusDomain(null); setSelectedId(null);

    buildDOM(G);
    // Defer measure+fit one frame so the browser has committed the fixed-position layout.
    const raf = requestAnimationFrame(() => {
      measure();
      fitView(false);
      schedule();
    });
    return () => cancelAnimationFrame(raf);
  }, [concepts, domains, buildDOM, measure, fitView, schedule]);

  useEffect(() => {
    const onResize = () => { measure(); schedule(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure, schedule]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (camAnimRef.current) cancelAnimationFrame(camAnimRef.current);
  }, []);

  // ── derived ───────────────────────────────────────────────────────────────

  const selectedNode = selectedId
    ? graphRef.current?.nodes.find(n => n.id === selectedId) ?? null
    : null;

  const handleFilter = (f: RetFilter) => {
    filterRef.current = f; setRetFilter(f); schedule();
  };

  const closeSheet = () => {
    selRef.current = null; setSelectedId(null); schedule();
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .kg-pulse { animation: kgRingPulse 1.7s ease-in-out infinite; }
        @keyframes kgRingPulse { 0%,100%{ transform:scale(1); opacity:.9; } 50%{ transform:scale(1.18); opacity:.45; } }
        @media (prefers-reduced-motion:reduce) { .kg-pulse { animation:none; } }
        .kg-domain-rail { scrollbar-width: none; -ms-overflow-style: none; }
        .kg-domain-rail::-webkit-scrollbar { display: none; }
        .kg-sheet { max-height: 46vh; }
        @media (max-width: 768px) { .kg-sheet { max-height: 78vh; } }
      `}</style>

      <div
        className="fixed inset-0"
        style={{
          zIndex: 55, overflow: 'hidden',
          background: 'radial-gradient(ellipse 90% 55% at 28% 8%, rgba(96,165,250,.10), transparent 60%), radial-gradient(ellipse 80% 50% at 82% 88%, rgba(167,139,250,.10), transparent 60%), #04060c',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        }}
      >
        {/* Stars */}
        <div style={{ position: 'absolute', inset: '-20%', zIndex: 0, pointerEvents: 'none', opacity: 0.8, backgroundImage: 'radial-gradient(1px 1px at 20% 30%,rgba(255,255,255,.7),transparent),radial-gradient(1px 1px at 70% 60%,rgba(180,210,255,.6),transparent),radial-gradient(1px 1px at 40% 80%,rgba(255,255,255,.5),transparent),radial-gradient(1px 1px at 88% 18%,rgba(200,220,255,.6),transparent),radial-gradient(1.5px 1.5px at 55% 42%,rgba(255,255,255,.5),transparent),radial-gradient(1px 1px at 12% 66%,rgba(255,255,255,.45),transparent)' }} />
        {/* Scanlines */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(to bottom, rgba(96,165,250,.025) 0 1px, transparent 1px 3px)', mixBlendMode: 'screen' as const }} />
        {/* Vignette */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 59, pointerEvents: 'none', background: 'radial-gradient(ellipse 85% 78% at 50% 42%, transparent 58%, rgba(0,0,0,.4) 100%)' }} />

        {/* Canvas */}
        <div ref={stageRef} style={{ position: 'absolute', inset: 0, zIndex: 10, touchAction: 'none', cursor: 'grab' }}>
          <div ref={halosRef}  style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
          <svg  ref={svgRef}   style={{ position: 'absolute', inset: 0, zIndex: 11, pointerEvents: 'none' }} />
          <div ref={labelsRef} style={{ position: 'absolute', inset: 0, zIndex: 13 }} />
          <div ref={nodesRef}  style={{ position: 'absolute', inset: 0, zIndex: 14 }} />
        </div>

        {/* Top HUD */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 62, padding: '12px 16px 10px', background: 'linear-gradient(180deg, rgba(4,6,12,.92) 40%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button onClick={() => router.push('/knowledge')} style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div>
              <div style={{ fontSize: 9.5, letterSpacing: '0.34em', color: '#60a5fa', textShadow: '0 0 10px rgba(59,130,246,.4)' }}>VAULT // KNOWLEDGE OS</div>
              <h1 style={{ fontFamily: 'var(--font-display, system-ui)', fontWeight: 700, fontSize: 21, letterSpacing: '0.06em', margin: '1px 0 0', lineHeight: 1, background: 'linear-gradient(180deg,#fff,#9db8e8 70%,#5b86d8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                CONSTELLATION
              </h1>
            </div>
            <button
              onClick={() => setShowLegend(s => !s)}
              style={{
                marginLeft: 'auto', flexShrink: 0,
                color: showLegend ? '#60a5fa' : '#5b6885',
                background: showLegend ? 'rgba(96,165,250,.12)' : 'rgba(12,19,34,.6)',
                border: `1px solid ${showLegend ? 'rgba(96,165,250,.35)' : '#1b2438'}`,
                cursor: 'pointer', padding: '5px 9px', borderRadius: 7,
                fontSize: 14, lineHeight: 1, backdropFilter: 'blur(4px)',
                transition: 'color .18s,background .18s,border-color .18s',
                fontFamily: 'var(--font-mono, ui-monospace)',
              }}
              title="Connection legend"
            >
              ⓘ
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
            {([
              { n: hudStats.total,   k: 'CONCEPTS',  color: '#e9eef7' },
              { n: hudStats.domains, k: 'DOMAINS',   color: '#e9eef7' },
              { n: hudStats.due,     k: 'DUE TODAY', color: hudStats.due > 0 ? '#ef4444' : '#e9eef7' },
            ] as const).map(s => (
              <div key={s.k} style={{ flex: 1, border: '1px solid #1b2438', background: 'rgba(12,19,34,.55)', borderRadius: 6, padding: '6px 9px', backdropFilter: 'blur(4px)' }}>
                <div style={{ fontFamily: 'var(--font-display, system-ui)', fontWeight: 700, fontSize: 18, lineHeight: 1, color: s.color, textShadow: s.color === '#ef4444' ? '0 0 10px rgba(239,68,68,.5)' : 'none' }}>{s.n}</div>
                <div style={{ fontSize: 8.5, letterSpacing: '0.2em', color: '#9aa7c2', marginTop: 3 }}>{s.k}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { key: 'all'      as RetFilter, n: hudStats.total,    c: '#60a5fa', label: 'ALL' },
              { key: 'healthy'  as RetFilter, n: hudStats.healthy,  c: '#22c55e', label: '' },
              { key: 'upcoming' as RetFilter, n: hudStats.upcoming, c: '#f59e0b', label: '' },
              { key: 'due'      as RetFilter, n: hudStats.due,      c: '#ef4444', label: '' },
            ]).map(f => {
              const active = retFilter === f.key;
              return (
                <button key={f.key} onClick={() => handleFilter(f.key)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 9, letterSpacing: '0.12em', fontWeight: 600, color: f.c,
                  background: active ? 'rgba(255,255,255,.06)' : 'rgba(12,19,34,.5)',
                  border: `1px solid ${active ? f.c : '#1b2438'}`,
                  borderRadius: 999, padding: '6px 4px', cursor: 'pointer',
                  fontFamily: 'var(--font-mono, ui-monospace)',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.c, boxShadow: `0 0 6px ${f.c}`, flexShrink: 0 }} />
                  {f.label && <span>{f.label}</span>}
                  <span style={{ fontFamily: 'var(--font-display, system-ui)', fontWeight: 700, fontSize: 11 }}>{f.n}</span>
                </button>
              );
            })}
          </div>

          {/* Legend panel — appears below HUD when ⓘ is active */}
          {showLegend && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: '100%', right: 16, marginTop: 6, zIndex: 63,
                background: 'rgba(7,12,24,.97)', border: '1px solid #1b2438',
                borderRadius: 10, padding: '11px 14px', backdropFilter: 'blur(10px)',
                minWidth: 196, boxShadow: '0 8px 32px rgba(0,0,0,.55)',
                fontFamily: 'var(--font-mono, ui-monospace)',
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: '0.22em', color: '#4a5a78', marginBottom: 10 }}>// CONNECTIONS</div>
              {([
                { label: 'Related Concept', color: '#7eb8f7', width: 2,    dash: ''      },
                { label: 'Shared Tag',      color: '#7eb8f7', width: 1.5,  dash: '5 4'   },
                { label: 'Same Source',     color: '#7eb8f7', width: 1,    dash: '1.5 5' },
                { label: 'Layout Structure',color: '#3d5272', width: 0.75, dash: ''      },
              ] as const).map(e => (
                <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <svg width="40" height="12" viewBox="0 0 40 12" style={{ flexShrink: 0 }}>
                    <line x1="2" y1="6" x2="38" y2="6"
                      stroke={e.color} strokeWidth={e.width}
                      strokeDasharray={e.dash || undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span style={{ fontSize: 11, color: '#8a9ab8', letterSpacing: '0.02em' }}>{e.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zoom controls — positioned above domain rail with safe-area clearance */}
        <div style={{ position: 'absolute', bottom: 'calc(72px + env(safe-area-inset-bottom))', right: 16, zIndex: 62, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            { icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>, fn: () => zoomAround((dimsRef.current.w || window.innerWidth) / 2, (dimsRef.current.h || window.innerHeight) / 2, 1.3) },
            { icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14"/></svg>, fn: () => zoomAround((dimsRef.current.w || window.innerWidth) / 2, (dimsRef.current.h || window.innerHeight) / 2, 1 / 1.3) },
            { icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>, fn: () => { focusRef.current = null; filterRef.current = 'all'; setFocusDomain(null); setRetFilter('all'); fitView(true); } },
          ]).map((btn, i) => (
            <button key={i} onClick={btn.fn} style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,16,30,.85)', border: '1px solid #1b2438', color: '#9aa7c2', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
              {btn.icon}
            </button>
          ))}
        </div>

        {/* Domain rail — horizontal scroll, no visible scrollbar */}
        {!selectedId && (
          <div className="kg-domain-rail" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 62, display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', background: 'linear-gradient(0deg, rgba(4,6,12,.95) 0%, rgba(4,6,12,0) 100%)' }}>
            {hudGroups.map(g => {
              const active = focusDomain === g.domainId;
              return (
                <button key={g.domainId} onClick={() => focusOnDomain(g.domainId)} style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                  color: active ? g.color : '#9aa7c2',
                  background: active ? hexA(g.color, 0.12) : 'rgba(10,16,30,.75)',
                  border: `1px solid ${active ? g.color : '#1b2438'}`,
                  borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
                  fontFamily: 'var(--font-mono, ui-monospace)',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, boxShadow: `0 0 5px ${g.color}`, flexShrink: 0 }} />
                  {g.name}
                  <span style={{ fontFamily: 'var(--font-display, system-ui)', fontWeight: 700 }}>{g.items.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Sheet */}
        {selectedNode && (
          <>
            <div onClick={closeSheet} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.4)' }} />
            <ConceptSheet
              node={selectedNode}
              domainColor={domMapRef.current.get(selectedNode.domainId)?.color ?? '#64748b'}
              domainName={domMapRef.current.get(selectedNode.domainId)?.name ?? ''}
              allGroups={hudGroups}
              onClose={closeSheet}
              onSelectNode={id => { selRef.current = id; setSelectedId(id); schedule(); }}
              onOpenConcept={() => router.push(`/knowledge/concept/${selectedNode.id}`)}
              onReview={() => router.push('/knowledge/review')}
            />
          </>
        )}
      </div>
    </>
  );
}

// ── Concept sheet ─────────────────────────────────────────────────────────────

function ConceptSheet({ node, domainColor, domainName, allGroups, onClose, onSelectNode, onOpenConcept, onReview }: {
  node: GNode;
  domainColor: string;
  domainName: string;
  allGroups: GGroup[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onOpenConcept: () => void;
  onReview: () => void;
}) {
  const sc = STATUS_COLOR[node.status];
  const statusGlyph = node.status === 'due' ? '‼' : node.status === 'upcoming' ? '◷' : '✓';
  const lastSeenStr = node.lastReviewedAt
    ? (() => { const d = Math.floor((Date.now() - node.lastReviewedAt) / 86400000); return d === 0 ? 'Today' : `${d}d ago`; })()
    : '—';

  return (
    <div onClick={e => e.stopPropagation()} className="kg-sheet" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 75,
      background: '#0c1322', borderTop: '1px solid #1b2438', borderRadius: '18px 18px 0 0',
      padding: '16px 20px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))',
      overflowY: 'auto',
      // Prevent scroll chaining — reaching end of sheet content must not pan the canvas
      overscrollBehavior: 'contain',
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    }}>
      <div style={{ width: 36, height: 3, borderRadius: 99, background: '#1b2438', margin: '0 auto 14px' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: domainColor, background: hexA(domainColor, 0.12), border: `1px solid ${hexA(domainColor, 0.4)}`, borderRadius: 999, padding: '4px 10px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: domainColor, boxShadow: `0 0 6px ${domainColor}` }} />
          {domainName.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: sc }}>
          {statusGlyph} {node.status.toUpperCase()}
        </span>
      </div>

      <h2 style={{ fontFamily: 'var(--font-display, system-ui)', fontWeight: 700, fontSize: 22, color: '#e9eef7', margin: '0 0 8px', lineHeight: 1.2, wordBreak: 'break-word' }}>
        {node.name}
      </h2>

      <p style={{ fontSize: 14, color: '#9aa7c2', lineHeight: 1.65, margin: '0 0 14px' }}>{node.summary}</p>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.2em', color: '#5b6885' }}>RETENTION</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: sc }}>{node.retentionScore}%</span>
        </div>
        <div style={{ height: 4, borderRadius: 99, background: '#1b2438', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${node.retentionScore}%`, borderRadius: 99, background: `linear-gradient(90deg, ${darken(sc)}, ${sc})`, boxShadow: `0 0 8px ${hexA(sc, 0.6)}` }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([{ n: String(node.reviews), k: 'REVIEWS' }, { n: lastSeenStr, k: 'LAST SEEN' }, { n: String(node.related.length), k: 'LINKS' }] as const).map(s => (
          <div key={s.k} style={{ flex: 1, border: '1px solid #1b2438', background: 'rgba(12,19,34,.7)', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display, system-ui)', fontWeight: 700, fontSize: 18, lineHeight: 1, color: '#e9eef7' }}>{s.n}</div>
            <div style={{ fontSize: 8.5, letterSpacing: '0.2em', color: '#5b6885', marginTop: 4 }}>{s.k}</div>
          </div>
        ))}
      </div>

      {node.sourceTitle && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', marginBottom: 12, borderTop: '1px dashed #1b2438', borderBottom: '1px dashed #1b2438' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.2em', color: '#5b6885' }}>SOURCE</span>
          <span style={{ fontSize: 12, color: '#9aa7c2', fontFamily: 'var(--font-display, system-ui)', fontWeight: 600 }}>{node.sourceTitle}</span>
        </div>
      )}

      <div style={{ fontSize: 9, letterSpacing: '0.22em', color: '#5b6885', margin: '12px 0 8px' }}>RELATED CONCEPTS</div>
      {node.related.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
          {node.related.map(rel => {
            const rc = allGroups.find(g => g.domainId === rel.domainId)?.color ?? '#64748b';
            return (
              <button key={rel.id} onClick={() => onSelectNode(rel.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9aa7c2', background: 'rgba(12,19,34,.7)', border: '1px solid #1b2438', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', fontFamily: 'var(--font-mono, ui-monospace)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, boxShadow: `0 0 5px ${rc}`, flexShrink: 0 }} />
                {rel.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: '#4a5a78', fontStyle: 'italic', marginBottom: 18 }}>No explicit related concepts.</p>
      )}

      <div style={{ display: 'flex', gap: 9 }}>
        <button onClick={onOpenConcept} style={{ flex: 1, padding: '14px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', color: '#60a5fa', background: 'rgba(59,130,246,.08)', border: '1px solid rgba(96,165,250,.4)', fontFamily: 'var(--font-mono, ui-monospace)' }}>
          OPEN CONCEPT
        </button>
        {node.isDue && (
          <button onClick={onReview} style={{ flex: 1.1, padding: '14px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', color: '#fff', background: 'linear-gradient(180deg,#ef4444,#b91c1c)', border: '1px solid #ef4444', boxShadow: '0 0 18px rgba(239,68,68,.5),inset 0 1px 0 rgba(255,255,255,.25)', fontFamily: 'var(--font-mono, ui-monospace)' }}>
            REVIEW NOW
          </button>
        )}
      </div>
    </div>
  );
}
