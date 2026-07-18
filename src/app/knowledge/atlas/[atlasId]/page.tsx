'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getAtlasCountry, getAllConcepts, updateAtlasCountry } from '@/lib/db';
import { exportAtlasCountry, downloadAtlasPack } from '@/lib/logic/atlasPack';
import { isNoteDirty } from '@/lib/logic/atlasLinks';
import { touchTargetStyle } from '@/lib/logic/atlasTouch';
import { getEntityByAtlasId } from '@/lib/data/atlasEntities';
import { useAtlasTopology, resolveLandNeighbors } from '@/lib/logic/atlasTopology';
import { buildAtlasProfileView, type AtlasProfileView, type EntityLink, type NeighborLink } from '@/lib/logic/atlasProfile';
import { WorldMap } from '@/components/WorldMap';
import { ArticleText } from '@/components/ArticleText';
import type { AtlasCountry, AtlasEntityStatus, KnowledgeConcept } from '@/types';

const STATUS_COLOR: Record<AtlasEntityStatus, string> = {
  sovereign: '#64748b',
  partial: '#a78bfa',
  territory: '#38bdf8',
  disputed: '#f59e0b',
};

// ── Small primitives ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#0f1623', border: '1px solid #1e2333', borderRadius: 10, padding: 14 }}>{children}</div>;
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className="text-[11px] text-text-dim px-2 py-1 rounded" style={{ background: '#1a2236' }}>{t}</span>
      ))}
    </div>
  );
}

function LinkChips({ links }: { links: EntityLink[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map(l => (
        <Link
          key={l.atlasId}
          href={`/knowledge/atlas/${l.atlasId}`}
          className="text-[11px] px-2 py-1 rounded transition-colors"
          style={{ background: '#13233a', color: '#7dd3fc', border: '1px solid #1e3a52' }}
        >
          {l.name}
        </Link>
      ))}
    </div>
  );
}

function NeighborChips({ links }: { links: NeighborLink[] }) {
  // `curated` is retained in the data for diagnostics/testing but not shown.
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map(l => (
        <Link
          key={l.atlasId}
          href={`/knowledge/atlas/${l.atlasId}`}
          className="text-[11px] px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
          style={{ background: '#13233a', color: '#7dd3fc', border: '1px solid #1e3a52' }}
        >
          {l.name}
        </Link>
      ))}
    </div>
  );
}

function SubList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return <div className="mt-3"><SectionLabel>{label}</SectionLabel><Chips items={items} /></div>;
}

// ── Sections (each returns null when empty, so no empty headings render) ───────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function ProfileBody({ view }: { view: AtlasProfileView }) {
  const v = view;
  return (
    <div className="flex flex-col gap-4">
      {v.summary && <Card><p className="text-sm text-text-dim leading-relaxed">{v.summary}</p></Card>}

      {v.snapshot && (
        <Section label="Snapshot">
          <Card>
            {v.snapshot.facts.length > 0 && (
              <div className="flex flex-col gap-2 mb-3 last:mb-0">
                {v.snapshot.facts.map(f => (
                  <div key={f.label} className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] text-text-muted uppercase tracking-widest flex-shrink-0">{f.label}</span>
                    <span className="text-sm text-text text-right">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
            {v.snapshot.metrics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {v.snapshot.metrics.map(m => (
                  <div key={m.label} style={{ background: '#0b1120', border: '1px solid #1a2236', borderRadius: 8, padding: '8px 10px' }}>
                    <p className="text-[9px] text-text-muted uppercase tracking-widest">{m.label}</p>
                    <p className="text-base font-display font-bold text-text leading-tight mt-0.5">{m.value}</p>
                    {m.meta && <p className="text-[9px] text-text-muted mt-0.5">{m.meta}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Section>
      )}

      {v.landNeighbors.length > 0 && (
        <Section label={`Land neighbors · ${v.landNeighbors.length}`}>
          <NeighborChips links={v.landNeighbors} />
        </Section>
      )}

      {v.geography && (
        <Section label="Geography">
          <Card>
            {v.geography.overview && <ArticleText text={v.geography.overview} />}
            {v.geography.terrain && <div className="mt-2"><span className="text-[10px] text-text-muted uppercase tracking-widest">Terrain · </span><span className="text-sm text-text-dim">{v.geography.terrain}</span></div>}
            {v.geography.climate && <div className="mt-1.5"><span className="text-[10px] text-text-muted uppercase tracking-widest">Climate · </span><span className="text-sm text-text-dim">{v.geography.climate}</span></div>}
            <SubList label="Major regions" items={v.geography.majorRegions} />
            <SubList label="Mountains" items={v.geography.mountains} />
            <SubList label="Rivers" items={v.geography.rivers} />
            <SubList label="Lakes" items={v.geography.lakes} />
            <SubList label="Seas & oceans" items={v.geography.seasAndOceans} />
            <SubList label="Natural resources" items={v.geography.naturalResources} />
            {v.geography.maritimeNeighbors.length > 0 && (
              <div className="mt-3">
                <SectionLabel>Maritime neighbors</SectionLabel>
                <LinkChips links={v.geography.maritimeNeighbors} />
              </div>
            )}
          </Card>
        </Section>
      )}

      {v.economy && (
        <Section label="Economy">
          <Card>
            {v.economy.overview && <ArticleText text={v.economy.overview} />}
            <SubList label="Major industries" items={v.economy.industries} />
            <SubList label="Major exports" items={v.economy.exports} />
            <SubList label="Major imports" items={v.economy.imports} />
            <SubList label="Natural resources" items={v.economy.naturalResources} />
            <SubList label="Strengths" items={v.economy.strengths} />
            <SubList label="Challenges" items={v.economy.challenges} />
          </Card>
        </Section>
      )}

      {v.relationships && (
        <Section label="Relationships">
          <Card>
            {v.relationships.overview && <ArticleText text={v.relationships.overview} />}
            {v.relationships.alliances.length > 0 && <div className="mt-3"><SectionLabel>Organizations</SectionLabel><Chips items={v.relationships.alliances} /></div>}
            {v.relationships.partners.length > 0 && <div className="mt-3"><SectionLabel>Key partners</SectionLabel><LinkChips links={v.relationships.partners} /></div>}
            {v.relationships.rivals.length > 0 && <div className="mt-3"><SectionLabel>Tensions</SectionLabel><LinkChips links={v.relationships.rivals} /></div>}
          </Card>
        </Section>
      )}

      {v.history && <Section label="History"><Card><ArticleText text={v.history} /></Card></Section>}
      {v.whyItMatters && <Section label="Why it matters"><Card><ArticleText text={v.whyItMatters} /></Card></Section>}

      {v.rememberThese.length > 0 && (
        <Section label="Remember these">
          <Card>
            <ul className="flex flex-col gap-2">
              {v.rememberThese.map((t, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-dim leading-relaxed">
                  <span style={{ color: '#f59e0b' }}>▹</span><span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {v.extraSections.map((sec, i) => (
        <Section key={i} label={sec.title}><Card><ArticleText text={sec.body} /></Card></Section>
      ))}

      {v.relatedConcepts.length > 0 && (
        <Section label="Related Vault concepts">
          <div className="flex flex-wrap gap-1.5">
            {v.relatedConcepts.map(c => (
              <Link
                key={c.atlasId}
                href={`/knowledge/concept/${c.atlasId}`}
                className="text-[11px] px-2 py-1 rounded transition-colors"
                style={{ background: '#f59e0b18', color: '#f59e0b', border: '1px solid #f59e0b44' }}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Personal note editor (user-owned; separate from imported reference) ───────

function NoteEditor({ atlasId, saved, onSaved }: { atlasId: string; saved: string | undefined; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved ?? '');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(saved ?? ''); }, [saved]); // resync when the record reloads

  const dirty = isNoteDirty(draft, saved);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    // Empty allowed → store undefined. Only the note + updatedAt change.
    await updateAtlasCountry(atlasId, { personalNotes: draft.trim() ? draft : undefined });
    setBusy(false);
    setEditing(false);
    setConfirmDiscard(false);
    onSaved();
  };
  const requestCancel = () => { if (dirty) { setConfirmDiscard(true); } else { setEditing(false); } };
  const discard = () => { setDraft(saved ?? ''); setEditing(false); setConfirmDiscard(false); };

  return (
    <Section label="Personal notes">
      <Card>
        {!editing ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-text-dim leading-relaxed whitespace-pre-wrap flex-1">
              {saved ? saved : <span className="text-text-muted italic">No notes yet.</span>}
            </p>
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit personal notes"
              className="flex-shrink-0 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
              style={{ ...touchTargetStyle(), background: '#f59e0b18', border: '1px solid #f59e0b44' }}
            >
              {saved ? 'Edit' : 'Add'}
            </button>
          </div>
        ) : (
          <div>
            <label htmlFor="atlas-note" className="text-[9px] text-text-muted uppercase tracking-widest">Your note (private, not exported reference)</label>
            <textarea
              id="atlas-note"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={4}
              autoFocus
              className="w-full mt-1 bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted outline-none resize-y focus:border-warning"
              placeholder="Conversation hooks, personal connections, reminders…"
            />
            {confirmDiscard ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-danger flex-1">Discard unsaved changes?</span>
                <button onClick={discard} className="px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger" style={{ ...touchTargetStyle(), border: '1px solid #ef4444' }}>Discard</button>
                <button onClick={() => setConfirmDiscard(false)} className="px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-warning" style={{ ...touchTargetStyle(), border: '1px solid #1e2333' }}>Keep editing</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <button onClick={save} disabled={busy} className="flex-1 rounded-lg text-[11px] font-bold uppercase tracking-widest text-success disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-success" style={{ ...touchTargetStyle(), background: '#22c55e18', border: '1px solid #22c55e' }}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button onClick={requestCancel} className="flex-1 rounded-lg text-[11px] font-bold uppercase tracking-widest text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-warning" style={{ ...touchTargetStyle(), background: '#0f1623', border: '1px solid #1e2333' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </Section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AtlasCountryPage() {
  const params = useParams<{ atlasId: string }>();
  const atlasId = params.atlasId;
  const entity = getEntityByAtlasId(atlasId);
  const topo = useAtlasTopology();

  const [profile, setProfile] = useState<AtlasCountry | undefined>(undefined);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    return Promise.all([getAtlasCountry(atlasId), getAllConcepts()])
      .then(([p, c]) => { setProfile(p); setConcepts(c); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [atlasId]);

  useEffect(() => { reload(); }, [reload]);

  // Unknown region — atlasId not in the registry.
  if (!entity) {
    return (
      <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
        <Link href="/knowledge/atlas" className="text-text-muted hover:text-text transition-colors text-lg" aria-label="Back to Atlas">←</Link>
        <div className="text-center py-16 px-6">
          <p className="font-display text-sm font-bold text-text uppercase tracking-widest mb-1.5">Unknown region</p>
          <p className="text-[11px] text-text-muted">“{atlasId}” is not a recognized Atlas entity.</p>
        </div>
      </main>
    );
  }

  const landNeighbors = topo.status === 'ready' ? resolveLandNeighbors(topo.data, atlasId) : [];
  const view = buildAtlasProfileView(entity, profile, landNeighbors, concepts);

  const exportOne = async () => {
    const pack = await exportAtlasCountry(atlasId);
    if (pack) downloadAtlasPack(pack, `atlas-${atlasId}.json`);
  };

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Header — registry info, always available */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/knowledge/atlas" className="text-text-muted hover:text-text transition-colors text-lg" aria-label="Back to Atlas">←</Link>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: STATUS_COLOR[entity.status] }}>
            {view.header.statusLabel}{entity.iso3 ? ` · ${entity.iso3}` : ''} · {entity.region}
          </p>
          <h1 className="font-display text-[22px] font-bold tracking-wide leading-none text-text truncate">
            {view.header.name}
          </h1>
        </div>
        {view.hasProfile && (
          <button
            onClick={exportOne}
            className="flex items-center gap-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-text-muted flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
            style={{ ...touchTargetStyle(), background: '#0f1623', border: '1px solid #1e2333' }}
            aria-label={`Export ${view.header.name} profile`}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        )}
      </div>

      {/* Non-interactive locator map — always shown */}
      <div className="mb-4" style={{ background: '#0b1120', border: '1px solid #1e2333', borderRadius: 12, overflow: 'hidden' }}>
        {topo.status === 'loading' && (
          <div className="flex items-center justify-center" style={{ height: 150 }}>
            <p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse">Locating…</p>
          </div>
        )}
        {topo.status === 'error' && (
          <div className="flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ height: 150 }}>
            <p className="text-[10px] text-danger uppercase tracking-widest">Map unavailable</p>
            <button onClick={topo.retry} className="text-[10px] text-warning underline">Retry</button>
          </div>
        )}
        {topo.status === 'ready' && (
          <div style={{ maxHeight: 240 }}>
            <WorldMap topology={topo.data.topology} profileIds={new Set()} selectedAtlasId={atlasId} interactive={false} />
          </div>
        )}
      </div>

      {/* Body */}
      {!loaded ? (
        <p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse">Loading profile…</p>
      ) : view.hasProfile ? (
        <div className="flex flex-col gap-4">
          <ProfileBody view={view} />
          <NoteEditor atlasId={atlasId} saved={profile?.personalNotes} onSaved={reload} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Even without a profile: derived land neighbors are shown. */}
          {view.landNeighbors.length > 0 && (
            <Section label={`Land neighbors · ${view.landNeighbors.length}`}>
              <NeighborChips links={view.landNeighbors} />
            </Section>
          )}
          <div className="text-center py-12 px-6" style={{ background: '#0b1120', border: '1px dashed #1e2333', borderRadius: 12 }}>
            <span className="font-display text-4xl mb-3 block" style={{ color: '#1e2a3a' }}>◍</span>
            <p className="font-display text-sm font-bold text-text uppercase tracking-widest mb-1.5">No profile imported yet</p>
            <p className="text-[11px] text-text-muted leading-relaxed max-w-[250px] mx-auto">
              {entity.name} is on the map with its location, status, and neighbors. Import a country profile to add its full story.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
