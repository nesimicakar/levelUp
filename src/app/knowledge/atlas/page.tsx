'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAtlasCountryIds } from '@/lib/db';
import { filterEntities, filterByScope, type AtlasScope } from '@/lib/logic/atlasGeo';
import { getEntityByAtlasId } from '@/lib/data/atlasEntities';
import { WorldMap } from '@/components/WorldMap';
import { useAtlasTopology } from '@/lib/logic/atlasTopology';
import { touchTargetStyle } from '@/lib/logic/atlasTouch';
import type { AtlasEntityStatus } from '@/types';

const STATUS_LABEL: Record<AtlasEntityStatus, string> = {
  sovereign: 'Sovereign state',
  partial: 'Partially recognized',
  territory: 'Territory',
  disputed: 'Disputed area',
};

const STATUS_COLOR: Record<AtlasEntityStatus, string> = {
  sovereign: '#64748b',
  partial: '#a78bfa',
  territory: '#38bdf8',
  disputed: '#f59e0b',
};

export default function AtlasPage() {
  const router = useRouter();
  const topo = useAtlasTopology();
  const [profileIds, setProfileIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<AtlasScope>('all');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { getAtlasCountryIds().then(setProfileIds).catch(() => {}); }, []);

  const results = useMemo(
    () => filterEntities(query, filterByScope(scope, profileIds)),
    [query, scope, profileIds],
  );
  const selectedEntity = selected ? getEntityByAtlasId(selected) : undefined;

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/knowledge" className="text-text-muted hover:text-text transition-colors text-lg" aria-label="Back to Vault">←</Link>
        <div className="flex-1">
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-0.5">// VAULT · ATLAS</p>
          <h1 className="font-display text-[22px] font-bold tracking-widest leading-none" style={{ color: '#f59e0b' }}>
            WORLD ATLAS
          </h1>
        </div>
        <Link
          href="/knowledge/atlas/manage"
          className="flex items-center gap-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-warning flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
          style={{ ...touchTargetStyle(), background: '#f59e0b18', border: '1px solid #f59e0b44' }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Manage
        </Link>
      </div>

      {/* Map with loading / error / ready states. The ready map renders its own
          controls/row, so it is not wrapped in a clipping box. */}
      <div className="mb-3">
        {topo.status === 'loading' && (
          <div className="flex items-center justify-center" style={{ height: 200, background: '#0b1120', border: '1px solid #1e2333', borderRadius: 12 }}>
            <p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse">Loading map…</p>
          </div>
        )}
        {topo.status === 'error' && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ height: 200, background: '#0b1120', border: '1px solid #1e2333', borderRadius: 12 }}>
            <p className="text-[11px] text-danger uppercase tracking-widest font-bold">Map failed to load</p>
            <p className="text-[10px] text-text-muted">{topo.message}</p>
            <button
              onClick={topo.retry}
              className="py-2 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest text-warning"
              style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
            >
              Retry
            </button>
          </div>
        )}
        {topo.status === 'ready' && (
          <WorldMap topology={topo.data.topology} profileIds={profileIds} selectedAtlasId={selected} onSelect={setSelected} />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <span className="flex items-center gap-1.5 text-[9px] text-text-muted uppercase tracking-widest">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(245,158,11,0.62)' }} /> Profile
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-text-muted uppercase tracking-widest">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#26324a' }} /> No profile
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-text-muted uppercase tracking-widest">
          <span style={{ width: 8, height: 8, borderRadius: 999, border: '1.4px solid #7c93b8' }} /> Marker
        </span>
      </div>

      {/* Selection panel — a compact stacked panel below the map (never obscures
          it). Sticky to the viewport bottom on small screens for one-handed reach. */}
      {selectedEntity && (
        <div
          className="mb-4 px-4 py-3 flex items-center justify-between gap-3 sticky bottom-2 z-10 sm:static"
          style={{ background: '#0f1623', border: '1px solid #1e2333', borderLeft: '3px solid #f59e0b', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}
        >
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-text leading-tight truncate">{selectedEntity.name}</p>
            <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: STATUS_COLOR[selectedEntity.status] }}>
              {STATUS_LABEL[selectedEntity.status]}
              {selectedEntity.iso3 ? ` · ${selectedEntity.iso3}` : ''}
            </p>
            <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: profileIds.has(selectedEntity.atlasId) ? '#22c55e' : '#64748b' }}>
              {profileIds.has(selectedEntity.atlasId) ? '● Profile available' : '○ No profile yet'}
            </p>
          </div>
          <button
            onClick={() => router.push(`/knowledge/atlas/${selectedEntity.atlasId}`)}
            className="flex-shrink-0 px-3.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
            style={{ ...touchTargetStyle(), background: '#f59e0b22', border: '1px solid #f59e0b' }}
          >
            Open →
          </button>
        </div>
      )}

      {/* Scope filter — map always shows all entities; this filters the list only. */}
      <div className="flex gap-1.5 mb-3">
        {(['core', 'profiled', 'all'] as AtlasScope[]).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className="flex-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
            style={{
              minHeight: 44,
              background: scope === s ? '#f59e0b22' : '#0f1623',
              border: `1px solid ${scope === s ? '#f59e0b' : '#1a2236'}`,
              color: scope === s ? '#f59e0b' : '#64748b',
            }}
          >
            {s === 'core' ? 'Core Atlas' : s === 'profiled' ? 'Profiled' : 'All'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search countries & territories…"
          className="w-full bg-surface-light border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-warning"
        />
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      {/* Alphabetical list — the keyboard/AT-accessible path and the way to reach
          entities too small to tap on the map. */}
      <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2 px-1">
        {results.length} {results.length === 1 ? 'entity' : 'entities'}
      </p>

      {results.length === 0 ? (
        <div className="text-center py-10 px-6" style={{ background: '#0b1120', border: '1px dashed #1e2333', borderRadius: 12 }}>
          <p className="text-[11px] text-text-muted">No matching countries or territories.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {results.map(e => {
            const hasProfile = profileIds.has(e.atlasId);
            const isSelected = selected === e.atlasId;
            return (
              <li key={e.atlasId}>
                <button
                  onClick={() => setSelected(e.atlasId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    background: isSelected ? '#f59e0b18' : '#0f1623',
                    border: `1px solid ${isSelected ? '#f59e0b66' : '#1a2236'}`,
                  }}
                >
                  <span
                    className="flex-shrink-0"
                    style={{ width: 8, height: 8, borderRadius: 999, background: hasProfile ? '#f59e0b' : 'transparent', border: hasProfile ? 'none' : '1.4px solid #33415c' }}
                    aria-hidden
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-text truncate">{e.name}</span>
                    <span className="block text-[9px] uppercase tracking-widest" style={{ color: STATUS_COLOR[e.status] }}>
                      {e.iso3 ?? 'no ISO'} · {e.region}
                    </span>
                  </span>
                  <Link
                    href={`/knowledge/atlas/${e.atlasId}`}
                    onClick={ev => ev.stopPropagation()}
                    className="flex-shrink-0 text-text-muted hover:text-warning transition-colors text-xs px-1"
                    aria-label={`Open ${e.name} profile`}
                  >
                    →
                  </Link>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
