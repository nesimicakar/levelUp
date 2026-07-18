'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAtlasCountryIds, getAtlasCountry } from '@/lib/db';
import { filterEntities, filterByScope, type AtlasScope } from '@/lib/logic/atlasGeo';
import { getEntityByAtlasId } from '@/lib/data/atlasEntities';
import { isCoreAtlas } from '@/lib/data/coreAtlas';
import { WorldMap, type WorldMapHandle } from '@/components/WorldMap';
import { useAtlasTopology } from '@/lib/logic/atlasTopology';
import type { AtlasCountry, AtlasEntity, AtlasEntityStatus } from '@/types';

const STATUS_LABEL: Record<AtlasEntityStatus, string> = {
  sovereign: 'Sovereign state',
  partial: 'Partially recognized',
  territory: 'Territory',
  disputed: 'Disputed area',
};

const CONTINENTS = ['World', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

// World fit inset (viewBox px). Mobile leaves room for the HUD + bottom sheet;
// desktop only clears the top pills (directory/card live in the side rail).
const FIT_MOBILE = { top: 128, bottom: 176, x: 16 };
const FIT_DESKTOP = { top: 96, bottom: 40, x: 30 };

type CardTier = 'core' | 'profiled' | 'none';
function tierOf(atlasId: string, hasProfile: boolean): CardTier {
  return isCoreAtlas(atlasId) ? 'core' : hasProfile ? 'profiled' : 'none';
}

// SSR-safe: run before paint on the client (no flash), skip on the server (no warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ── icons ─────────────────────────────────────────────────────────────────────
const Search = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
const ManageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 21h14" /></svg>
);

export default function AtlasPage() {
  const router = useRouter();
  const topo = useAtlasTopology();
  const mapRef = useRef<WorldMapHandle>(null);

  const [profileIds, setProfileIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<AtlasScope>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [activeContinent, setActiveContinent] = useState('World');
  const [browseAll, setBrowseAll] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [profile, setProfile] = useState<AtlasCountry | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => { getAtlasCountryIds().then(setProfileIds).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 5200);
    return () => clearTimeout(t);
  }, []);

  // Rail at ≥1024px; bottom sheet below (tablet portrait 640–1023 uses the sheet).
  useIsoLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Lazy-load the imported profile only when the selected entity has one.
  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    if (selected && profileIds.has(selected)) {
      getAtlasCountry(selected).then(p => { if (!cancelled) setProfile(p ?? null); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [selected, profileIds]);

  const results = useMemo(
    () => filterEntities(query, filterByScope(scope, profileIds)),
    [query, scope, profileIds],
  );
  const selectedEntity = selected ? getEntityByAtlasId(selected) : undefined;
  const activeProfile = profile && selectedEntity && profile.atlasId === selectedEntity.atlasId ? profile : null;
  const ready = topo.status === 'ready';

  // Directory/search selection selects AND flies the map; direct map taps don't refocus.
  const selectAndFocus = (atlasId: string) => {
    setSelected(atlasId);
    mapRef.current?.focusEntity(atlasId);
  };
  const focusContinent = (name: string) => {
    setActiveContinent(name);
    mapRef.current?.focusContinent(name);
  };

  const card = selectedEntity ? (
    <SelectedCard
      entity={selectedEntity}
      hasProfile={profileIds.has(selectedEntity.atlasId)}
      profile={activeProfile}
      showClose={!isDesktop}
      onOpen={() => router.push(`/knowledge/atlas/${selectedEntity.atlasId}`)}
      onImport={() => router.push('/knowledge/atlas/manage')}
      onClose={() => setSelected(null)}
    />
  ) : null;

  const searchField = (
    <label className="atlas-search">
      <Search />
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search countries & territories…"
        aria-label="Search countries and territories"
      />
    </label>
  );

  const directoryList = (
    <DirectoryList
      results={results}
      query={query}
      browseAll={browseAll}
      onBrowseAll={() => setBrowseAll(v => !v)}
      onSelectRow={selectAndFocus}
      profileIds={profileIds}
      full={isDesktop}
    />
  );

  const legend = (
    <div className="map-legend" aria-hidden="true">
      <b><span className="lg-sw lg-sw--core" />Core</b>
      <b><span className="lg-sw lg-sw--prof" />Profiled</b>
      <b><span className="lg-sw lg-sw--none" />None</b>
      <b><span className="lg-sw lg-sw--mk" />Marker</b>
    </div>
  );

  return (
    <main className={`atlas-immersive${isDesktop ? ' is-desktop' : ''}`}>
      <style>{CSS}</style>

      <div className="ai-map-col">
        {/* Map surface (atmospheric full-bleed background) */}
        <div className="ai-map">
          {topo.status === 'loading' && (
            <div className="ai-map-state" role="status" aria-live="polite"><p className="ai-loading">Loading map…</p></div>
          )}
          {topo.status === 'error' && (
            <div className="ai-map-state" role="alert">
              <p className="ai-err">Map failed to load</p>
              <p className="ai-err-sub">{topo.message}</p>
              <button className="ai-retry" onClick={topo.retry}>Retry</button>
            </div>
          )}
          {ready && (
            <WorldMap
              ref={mapRef}
              topology={topo.data.topology}
              profileIds={profileIds}
              selectedAtlasId={selected}
              onSelect={setSelected}
              scope={scope}
              fitPadding={isDesktop ? FIT_DESKTOP : FIT_MOBILE}
            />
          )}
        </div>

        <div className="map-scrim" />

        {/* Over-map HUD: pills always; header + scope/review only on mobile (rail owns them on desktop) */}
        <div className="hud-top">
          {!isDesktop && (
            <div className="hud-r1">
              <Link href="/knowledge" className="icn-btn" aria-label="Back to Vault">‹</Link>
              <div className="hud-title">
                <span className="eb">// VAULT · ATLAS</span>
                <span className="tt">World Atlas</span>
              </div>
              <Link href="/knowledge/atlas/manage" className="icn-btn hud-manage" aria-label="Manage Atlas access">
                <ManageIcon /><span>Manage</span>
              </Link>
            </div>
          )}

          <div className="pill-row" role="group" aria-label="Focus a continent">
            {CONTINENTS.map(name => (
              <button
                key={name}
                className={`pill${activeContinent === name ? ' is-active' : ''}`}
                aria-pressed={activeContinent === name}
                onClick={() => focusContinent(name)}
              >
                {name}
              </button>
            ))}
          </div>

          {!isDesktop && (
            <div className="hud-r3">
              <ScopeSeg scope={scope} onScope={setScope} />
              <ReviewPlaceholder variant="pill" />
            </div>
          )}
        </div>

        {/* Map tools */}
        <div className="map-tools">
          <button aria-label="Zoom in" disabled={!ready} onClick={() => mapRef.current?.zoomIn()}>+</button>
          <button aria-label="Zoom out" disabled={!ready} onClick={() => mapRef.current?.zoomOut()}>−</button>
          <button aria-label="Recenter" disabled={!ready} onClick={() => { setActiveContinent('World'); mapRef.current?.recenter(); }}>⟳</button>
        </div>

        {hintVisible && ready && (
          <div className="gesture-hint" role="status">Drag to pan · pinch to zoom · tap a country</div>
        )}

        {isDesktop && legend}
      </div>

      {/* ── Desktop rail ── */}
      {isDesktop ? (
        <aside className="rail" aria-label="Atlas directory">
          <div className="rail-hd">
            <div>
              <span className="rh-e">// VAULT · ATLAS</span>
              <span className="rh-t">World Atlas</span>
            </div>
            <Link href="/knowledge/atlas/manage" className="icn-btn hud-manage" aria-label="Manage Atlas access">
              <ManageIcon /><span>Manage</span>
            </Link>
          </div>

          <ReviewPlaceholder variant="banner" />

          <div className="rail-scope">
            <ScopeSeg scope={scope} onScope={setScope} />
            {searchField}
          </div>

          {card}
          <div className="divider" />
          {directoryList}
        </aside>
      ) : (
        /* ── Mobile bottom sheet ── */
        <section className={`sheet${selectedEntity ? ' is-open' : ''}`} aria-label="Atlas directory">
          <div className="sheet-grab" aria-hidden="true" />
          {legend}
          {selectedEntity ? card : (
            <div className="dir-wrap">
              {searchField}
              {directoryList}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// ── shared pieces ───────────────────────────────────────────────────────────────
function ScopeSeg({ scope, onScope }: { scope: AtlasScope; onScope: (s: AtlasScope) => void }) {
  return (
    <div className="seg" role="group" aria-label="Scope">
      {(['core', 'profiled', 'all'] as AtlasScope[]).map(s => (
        <button key={s} className={scope === s ? 'is-active' : ''} aria-pressed={scope === s} onClick={() => onScope(s)}>
          {s === 'core' ? 'Core' : s === 'profiled' ? 'Profiled' : 'All'}
        </button>
      ))}
    </div>
  );
}

// Non-functional Review entry point — no fake count, no navigation, clearly "Soon".
function ReviewPlaceholder({ variant }: { variant: 'pill' | 'banner' }) {
  if (variant === 'banner') {
    return (
      <div className="review-banner" role="button" aria-disabled="true" title="Atlas review — coming soon">
        <div className="review-banner__ic">▶</div>
        <div className="review-banner__t"><b>Map review</b><span>Coming soon</span></div>
        <span className="review-banner__soon">Soon</span>
      </div>
    );
  }
  return (
    <span className="review-pill" role="button" aria-disabled="true" title="Atlas review — coming soon">
      <span className="rp-play">▶</span> Review <span className="rp-soon">Soon</span>
    </span>
  );
}

function DirectoryList({
  results, query, browseAll, onBrowseAll, onSelectRow, profileIds, full,
}: {
  results: AtlasEntity[]; query: string; browseAll: boolean; onBrowseAll: () => void;
  onSelectRow: (atlasId: string) => void; profileIds: Set<string>; full: boolean;
}) {
  const showAll = full || browseAll || query.trim().length > 0;
  const visible = showAll ? results : results.slice(0, 4);
  return (
    <>
      <div className="dir-head">
        <span className="dir-count" role="status" aria-live="polite">{results.length} {results.length === 1 ? 'ENTITY' : 'ENTITIES'}</span>
        {!full && query.trim() === '' && results.length > 4 && (
          <button className="browse-toggle" onClick={onBrowseAll}>
            {browseAll ? 'Show less' : `Browse all ${results.length}…`}
          </button>
        )}
      </div>
      {results.length === 0 ? (
        <p className="dir-empty">No matching countries or territories.</p>
      ) : (
        <div className="dir-list">
          {visible.map(e => {
            const tier = tierOf(e.atlasId, profileIds.has(e.atlasId));
            return (
              <button key={e.atlasId} className="dir-row" onClick={() => onSelectRow(e.atlasId)}>
                <span className={`dir-row__dot dir-row__dot--${tier === 'core' ? 'core' : tier === 'profiled' ? 'prof' : 'none'}`} aria-hidden="true" />
                <span className="dir-row__txt">
                  <span className="dir-row__name">{e.name}</span>
                  <span className="dir-row__sub">
                    {tier === 'core' && <span className="dir-row__tag dir-row__tag--core">Core</span>}
                    {tier === 'profiled' && <span className="dir-row__tag dir-row__tag--prof">Profiled</span>}
                    {e.iso3 ?? 'no ISO'} · {e.region}
                  </span>
                </span>
                <span className="dir-row__arr" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Selected-country card. Registry data renders instantly; Capital + a clamped
// why-it-matters preview fill in from the imported profile when one exists.
// Nothing is fabricated for profileless entities. Open works for every entity. ──
function SelectedCard({
  entity, hasProfile, profile, showClose, onOpen, onImport, onClose,
}: {
  entity: AtlasEntity; hasProfile: boolean; profile: AtlasCountry | null; showClose: boolean;
  onOpen: () => void; onImport: () => void; onClose: () => void;
}) {
  const tier = tierOf(entity.atlasId, hasProfile);
  const chip = tier === 'core'
    ? { cls: 'chip--core', label: '◆ Core Atlas' }
    : tier === 'profiled'
      ? { cls: 'chip--prof', label: 'Profiled' }
      : { cls: 'chip--none', label: 'No profile' };

  const capital = profile?.snapshot?.capital?.trim();
  const why = profile?.whyItMatters?.trim();

  return (
    <div className="sheet-body">
      {showClose && <button className="sheet-close" onClick={onClose} aria-label="Close and return to directory">‹</button>}
      <div className="sheet__head">
        <div>
          <div className="sheet__region">{entity.region}</div>
          <h2 className="sheet__name">{entity.name}</h2>
        </div>
        <span className={`chip ${chip.cls}`}>{chip.label}</span>
      </div>

      <div className="sheet__kv">
        {capital
          ? <div className="kvc"><span className="kvc__k">Capital</span><span className="kvc__v">{capital}</span></div>
          : <div className="kvc"><span className="kvc__k">Code</span><span className="kvc__v">{entity.iso3 ?? '—'}</span></div>}
        <div className="kvc"><span className="kvc__k">Region</span><span className="kvc__v">{entity.region}</span></div>
        <div className="kvc"><span className="kvc__k">Status</span><span className="kvc__v">{STATUS_LABEL[entity.status]}</span></div>
      </div>

      {why && (
        <div className="sheet__why-wrap">
          <span className="sheet__why-k">Why it matters</span>
          <p className="sheet__why">{why}</p>
        </div>
      )}

      {!hasProfile && (
        <p className="sheet__note">○ No profile yet — Open shows the map location; import a profile to add facts.</p>
      )}

      <div className="sheet__actions">
        <button className="btn-amber" onClick={onOpen}>Open →</button>
        {!hasProfile && (
          <button className="btn-amber btn-amber--ghost" onClick={onImport}>Import +</button>
        )}
      </div>
    </div>
  );
}

// ── Scoped styles (ported from the Claude Design; namespaced under .atlas-immersive) ──
const CSS = `
.atlas-immersive{
  --amber:#f5a623;--amber-br:#ffc24d;--amber-glow:rgba(245,166,35,.5);--amber-soft:rgba(245,166,35,.12);
  --ink:#e7ecf6;--ink-dim:#9aa7be;--ink-mute:#657089;--ink-faint:#414c66;
  --line:#1b2233;--line-bright:#2a3346;--bg-2:#0b1120;--surface:#0f1623;--surface-2:#141c2c;
  --blue-bright:#60a5fa;--blue-soft:rgba(59,130,246,.12);
  --mono:var(--font-mono);--display:var(--font-display);
  position:relative;overflow:hidden;isolation:isolate;
  height:calc(100svh - 4rem - env(safe-area-inset-bottom));
  font-family:var(--mono);color:var(--ink);
  background:radial-gradient(ellipse 120% 90% at 50% 30%,#0a1120 0%,#060a12 60%,#04060c 100%);
}
.atlas-immersive.is-desktop{display:flex}
.atlas-immersive .ai-map-col{position:absolute;inset:0;z-index:1}
.atlas-immersive.is-desktop .ai-map-col{position:relative;inset:auto;flex:1 1 auto;min-width:0}
.atlas-immersive .ai-map{position:absolute;inset:0}
.atlas-immersive .ai-map-state{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:0 32px}
.atlas-immersive .ai-loading{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink-mute);animation:aipulse 1.4s ease-in-out infinite}
@keyframes aipulse{0%,100%{opacity:.4}50%{opacity:.9}}
.atlas-immersive .ai-err{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#ef4444;font-weight:700}
.atlas-immersive .ai-err-sub{font-size:10px;color:var(--ink-mute)}
.atlas-immersive .ai-retry{min-height:40px;padding:0 16px;border-radius:9px;border:1px solid var(--amber);background:var(--amber-soft);color:var(--amber-br);font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}

.atlas-immersive .map-scrim{position:absolute;left:0;right:0;top:0;height:200px;z-index:8;pointer-events:none;background:linear-gradient(180deg,rgba(4,7,14,.92) 0%,rgba(4,7,14,.66) 46%,transparent 100%)}
.atlas-immersive.is-desktop .map-scrim{height:140px}

.atlas-immersive .hud-top{position:absolute;left:0;right:0;top:0;z-index:12;padding:14px 14px 0;display:flex;flex-direction:column;gap:10px;padding-top:calc(14px + env(safe-area-inset-top))}
.atlas-immersive.is-desktop .hud-top{padding:16px 18px 0}
.atlas-immersive .hud-r1{display:flex;align-items:center;gap:10px}
.atlas-immersive .icn-btn{width:36px;height:36px;flex:none;display:inline-grid;place-items:center;border:1px solid var(--line-bright);background:rgba(15,22,38,.7);color:var(--ink-dim);border-radius:9px;font-size:18px;cursor:pointer;backdrop-filter:blur(6px);text-decoration:none}
.atlas-immersive .icn-btn:hover{color:var(--ink);border-color:var(--amber)}
.atlas-immersive .icn-btn:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.atlas-immersive .hud-title{flex:1;line-height:1.1;min-width:0}
.atlas-immersive .hud-title .eb{display:block;font-size:9px;letter-spacing:.24em;color:var(--ink-mute)}
.atlas-immersive .hud-title .tt{font-family:var(--display);font-weight:700;letter-spacing:.05em;font-size:20px;color:var(--ink)}
.atlas-immersive .hud-manage{width:auto;padding:0 12px;gap:6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-mute)}
.atlas-immersive .hud-manage svg{width:14px;height:14px}

.atlas-immersive .pill-row{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;-webkit-overflow-scrolling:touch}
.atlas-immersive .pill-row::-webkit-scrollbar{display:none}
.atlas-immersive .pill{flex:none;min-height:32px;padding:6px 14px;border-radius:999px;border:1px solid var(--line-bright);background:rgba(15,22,38,.6);color:var(--ink-dim);font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;backdrop-filter:blur(6px);white-space:nowrap}
.atlas-immersive .pill:hover{color:var(--ink)}
.atlas-immersive .pill:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.atlas-immersive .pill.is-active{color:#0b0a05;background:var(--amber);border-color:var(--amber);font-weight:600;box-shadow:0 0 14px var(--amber-glow)}

.atlas-immersive .hud-r3{display:flex;align-items:center;gap:10px;overflow-x:auto;scrollbar-width:none}
.atlas-immersive .hud-r3::-webkit-scrollbar{display:none}
.atlas-immersive .hud-r3 > *{flex:none}
.atlas-immersive .seg{display:flex;flex:none;border:1px solid var(--line-bright);border-radius:9px;overflow:hidden;background:rgba(10,15,26,.7);backdrop-filter:blur(6px)}
.atlas-immersive .seg button{min-height:34px;padding:0 12px;border:none;background:transparent;color:var(--ink-mute);font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.atlas-immersive .seg button+button{border-left:1px solid var(--line)}
.atlas-immersive .seg button:focus-visible{outline:2px solid var(--amber);outline-offset:-2px}
.atlas-immersive .seg button.is-active{background:var(--amber-soft);color:var(--amber-br)}
.atlas-immersive .review-pill{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line-bright);background:rgba(15,22,38,.6);color:var(--ink-mute);font-size:11px;letter-spacing:.1em;cursor:default;backdrop-filter:blur(6px)}
.atlas-immersive .review-pill .rp-play{font-size:8px;color:var(--amber-br)}
.atlas-immersive .review-pill .rp-soon{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line-bright);border-radius:999px;padding:2px 6px}

.atlas-immersive .map-tools{position:absolute;right:12px;top:164px;z-index:11;display:flex;flex-direction:column;gap:6px}
.atlas-immersive.is-desktop .map-tools{top:96px}
.atlas-immersive .map-tools button{width:44px;height:44px;display:grid;place-items:center;border:1px solid var(--line-bright);background:rgba(15,22,38,.75);color:var(--ink-dim);border-radius:10px;font-size:18px;cursor:pointer;backdrop-filter:blur(6px)}
.atlas-immersive .map-tools button:hover{color:var(--ink);border-color:var(--amber)}
.atlas-immersive .map-tools button:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.atlas-immersive .map-tools button:disabled{opacity:.4;cursor:default}

.atlas-immersive .gesture-hint{position:absolute;left:50%;bottom:calc(46% + 16px);transform:translateX(-50%);z-index:11;font-size:10px;letter-spacing:.14em;color:var(--ink-mute);background:rgba(6,10,18,.7);border:1px solid var(--line);padding:6px 13px;border-radius:999px;backdrop-filter:blur(4px);white-space:nowrap;pointer-events:none;animation:ghint .5s ease}
.atlas-immersive.is-desktop .gesture-hint{bottom:18px}
@keyframes ghint{from{opacity:0}to{opacity:.9}}

/* ── mobile bottom sheet ── */
.atlas-immersive .sheet{position:absolute;left:0;right:0;bottom:0;z-index:20;background:linear-gradient(180deg,rgba(13,19,33,.98),rgba(9,13,23,.99));border-top:1px solid var(--line-bright);border-radius:16px 16px 0 0;box-shadow:0 -18px 50px -20px rgba(0,0,0,.85);padding:8px 16px 16px;display:flex;flex-direction:column;gap:9px;max-height:46%}
.atlas-immersive .sheet.is-open{max-height:70%}
.atlas-immersive .sheet-grab{width:38px;height:4px;border-radius:999px;background:var(--line-bright);margin:2px auto 4px;flex:none}

/* ── desktop rail ── */
.atlas-immersive .rail{position:relative;z-index:20;width:380px;flex:none;background:linear-gradient(180deg,#0c1223,#080c17);border-left:1px solid var(--line-bright);display:flex;flex-direction:column;padding:20px 20px calc(20px + env(safe-area-inset-bottom));gap:14px;overflow-y:auto}
.atlas-immersive .rail-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.atlas-immersive .rail-hd .rh-e{font-size:9px;letter-spacing:.24em;color:var(--amber);display:block}
.atlas-immersive .rail-hd .rh-t{font-family:var(--display);font-weight:700;font-size:22px;letter-spacing:.04em;color:var(--ink)}
.atlas-immersive .review-banner{display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid var(--line-bright);background:linear-gradient(180deg,rgba(245,166,35,.08),rgba(245,166,35,.02));border-radius:11px;cursor:default}
.atlas-immersive .review-banner__ic{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:9px;background:var(--amber-soft);color:var(--amber-br);font-size:13px}
.atlas-immersive .review-banner__t{flex:1;line-height:1.3}
.atlas-immersive .review-banner__t b{display:block;font-family:var(--display);font-weight:700;font-size:15px;color:var(--ink)}
.atlas-immersive .review-banner__t span{font-size:10.5px;letter-spacing:.08em;color:var(--ink-dim)}
.atlas-immersive .review-banner__soon{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line-bright);border-radius:999px;padding:3px 8px}
.atlas-immersive .rail-scope{display:flex;flex-direction:column;gap:8px}
.atlas-immersive .rail .seg{width:100%}
.atlas-immersive .rail .seg button{flex:1}
.atlas-immersive .divider{height:1px;background:var(--line);margin:2px 0;flex:none}
.atlas-immersive .rail .dir-list{max-height:none}
.atlas-immersive .rail .sheet-body{padding:0}

.atlas-immersive .map-legend{display:flex;flex-wrap:wrap;gap:5px 12px;font-size:9.5px;letter-spacing:.1em;color:var(--ink-mute);text-transform:uppercase;padding:0 2px 2px}
.atlas-immersive.is-desktop .map-legend{position:absolute;left:16px;bottom:16px;z-index:11;padding:6px 10px;background:rgba(6,10,18,.62);border:1px solid var(--line);border-radius:8px;backdrop-filter:blur(4px)}
.atlas-immersive .map-legend b{display:inline-flex;align-items:center;gap:5px;font-weight:400}
.atlas-immersive .lg-sw{width:11px;height:11px;border-radius:3px;border:1px solid}
.atlas-immersive .lg-sw--core{background:rgba(245,166,35,.3);border-color:var(--amber)}
.atlas-immersive .lg-sw--prof{background:rgba(59,130,246,.22);border-color:rgba(96,165,250,.6)}
.atlas-immersive .lg-sw--none{background:#0f1930;border-color:#33425f}
.atlas-immersive .lg-sw--mk{border-radius:999px;background:var(--amber-br);border-color:var(--amber);width:9px;height:9px}

.atlas-immersive .dir-wrap{display:flex;flex-direction:column;gap:9px;min-height:0}
.atlas-immersive .atlas-search{display:flex;align-items:center;gap:9px;min-height:44px;padding:0 13px;border:1px solid var(--line-bright);border-radius:10px;background:var(--bg-2);flex:none}
.atlas-immersive .atlas-search svg{width:16px;height:16px;color:var(--ink-mute);flex:none}
.atlas-immersive .atlas-search input{flex:1;background:none;border:none;outline:none;color:var(--ink);font-family:var(--mono);font-size:14px;min-width:0}
.atlas-immersive .atlas-search input::placeholder{color:var(--ink-mute)}
.atlas-immersive .atlas-search:focus-within{border-color:var(--amber)}
.atlas-immersive .dir-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.atlas-immersive .dir-count{font-size:10px;letter-spacing:.16em;color:var(--ink-mute);text-transform:uppercase}
.atlas-immersive .browse-toggle{background:none;border:none;color:var(--amber-br);font-family:var(--mono);font-size:11px;letter-spacing:.06em;cursor:pointer;min-height:32px}
.atlas-immersive .browse-toggle:focus-visible{outline:2px solid var(--amber);outline-offset:2px;border-radius:6px}
.atlas-immersive .dir-empty{font-size:11px;color:var(--ink-mute);padding:12px 2px}
.atlas-immersive .dir-list{display:flex;flex-direction:column;gap:6px;overflow-y:auto;scrollbar-width:thin;min-height:0}
.atlas-immersive .dir-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer;text-align:left;font-family:var(--mono);transition:border-color .15s,background .15s}
.atlas-immersive .dir-row:hover{border-color:var(--line-bright);background:var(--surface-2)}
.atlas-immersive .dir-row:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.atlas-immersive .dir-row__dot{width:9px;height:9px;border-radius:999px;flex:none;border:1px solid}
.atlas-immersive .dir-row__dot--core{background:var(--amber);border-color:var(--amber);box-shadow:0 0 6px var(--amber-glow)}
.atlas-immersive .dir-row__dot--prof{background:rgba(96,165,250,.9);border-color:var(--blue-bright)}
.atlas-immersive .dir-row__dot--none{background:transparent;border-color:var(--ink-faint)}
.atlas-immersive .dir-row__txt{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.atlas-immersive .dir-row__name{font-family:var(--display);font-weight:600;font-size:16px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.atlas-immersive .dir-row__sub{font-size:9.5px;letter-spacing:.12em;color:var(--ink-mute);text-transform:uppercase;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.atlas-immersive .dir-row__tag{font-size:8.5px;letter-spacing:.1em;padding:1px 5px;border-radius:4px;border:1px solid}
.atlas-immersive .dir-row__tag--core{color:var(--amber-br);border-color:rgba(245,166,35,.5);background:var(--amber-soft)}
.atlas-immersive .dir-row__tag--prof{color:var(--blue-bright);border-color:rgba(96,165,250,.45);background:var(--blue-soft)}
.atlas-immersive .dir-row__arr{color:var(--ink-faint);font-size:16px;flex:none}

.atlas-immersive .sheet-body{display:flex;flex-direction:column;gap:12px;overflow-y:auto;position:relative;min-height:0}
.atlas-immersive .sheet-close{position:absolute;top:-2px;right:0;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line-bright);background:var(--surface);color:var(--ink-dim);border-radius:8px;font-size:16px;cursor:pointer;z-index:2}
.atlas-immersive .sheet-close:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.atlas-immersive .sheet__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-right:38px}
.atlas-immersive .rail .sheet__head{padding-right:0}
.atlas-immersive .sheet__region{font-size:10px;letter-spacing:.2em;color:var(--amber);text-transform:uppercase}
.atlas-immersive .sheet__name{font-family:var(--display);font-weight:700;letter-spacing:.02em;font-size:26px;margin:3px 0 0;color:var(--ink)}
.atlas-immersive .chip{flex:none;font-size:10px;letter-spacing:.1em;padding:5px 10px;border-radius:999px;border:1px solid;white-space:nowrap;align-self:flex-start}
.atlas-immersive .chip--core{color:var(--amber-br);border-color:var(--amber);background:var(--amber-soft)}
.atlas-immersive .chip--prof{color:var(--blue-bright);border-color:rgba(96,165,250,.5);background:var(--blue-soft)}
.atlas-immersive .chip--none{color:var(--ink-mute);border-color:var(--line-bright);background:var(--bg-2)}
.atlas-immersive .sheet__kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.atlas-immersive .kvc{display:flex;flex-direction:column;gap:3px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg-2);min-width:0}
.atlas-immersive .kvc__k{font-size:9px;letter-spacing:.14em;color:var(--ink-mute);text-transform:uppercase}
.atlas-immersive .kvc__v{font-family:var(--display);font-weight:600;font-size:13.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.atlas-immersive .sheet__why-wrap{border-left:2px solid var(--amber);padding-left:12px}
.atlas-immersive .sheet__why-k{display:block;font-size:9px;letter-spacing:.16em;color:var(--amber);text-transform:uppercase;margin-bottom:4px}
.atlas-immersive .sheet__why{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-dim);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden}
.atlas-immersive .sheet__note{margin:0;font-size:12px;line-height:1.6;color:var(--ink-mute)}
.atlas-immersive .sheet__actions{display:flex;gap:10px}
.atlas-immersive .btn-amber{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:10px;border:1px solid var(--amber);background:var(--amber);color:#0b0a05;font-family:var(--mono);font-weight:600;font-size:13px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.atlas-immersive .btn-amber:hover{background:var(--amber-br)}
.atlas-immersive .btn-amber:focus-visible{outline:2px solid var(--amber-br);outline-offset:2px}
.atlas-immersive .btn-amber--ghost{background:var(--amber-soft);color:var(--amber-br)}
.atlas-immersive .btn-amber--ghost:hover{background:rgba(245,166,35,.2)}

@media (prefers-reduced-motion:reduce){
  .atlas-immersive .ai-loading,.atlas-immersive .gesture-hint{animation:none}
}

/* On touch devices, guarantee ≥44px hit areas even where the visual chip is
   compact (the design's 32–36px controls stay compact on pointer devices). */
@media (pointer:coarse){
  .atlas-immersive .pill{min-height:44px}
  .atlas-immersive .seg button{min-height:44px}
  .atlas-immersive .icn-btn{width:44px;height:44px}
  .atlas-immersive .browse-toggle{min-height:44px}
  .atlas-immersive .sheet-close{width:44px;height:44px}
  .atlas-immersive .review-pill,.atlas-immersive .review-banner{min-height:44px}
}
`;
