'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllConcepts, getAllDomains } from '@/lib/db';
import {
  planAtlasImport, applyAtlasImportPlan, exportAllAtlasCountries, downloadAtlasPack,
  type AtlasImportPlan,
} from '@/lib/logic/atlasPack';
import {
  parseAtlasPackText, applyOutcome, collectUnresolvedTitles, canApply,
  ATLAS_PACK_TEMPLATE, type FlowPhase, type ApplyOutcome,
} from '@/lib/logic/atlasImportFlow';
import { buildConceptCatalog, formatConceptCatalog } from '@/lib/logic/atlasLinks';
import { touchTargetStyle } from '@/lib/logic/atlasTouch';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2">{children}</p>;
}

// ── Preview buckets ───────────────────────────────────────────────────────────

const BUCKET_COLOR: Record<string, string> = {
  Added: '#22c55e', Updated: '#38bdf8', Unchanged: '#64748b', Rejected: '#ef4444', Conflicts: '#f59e0b',
};

function Bucket({ label, count, children }: { label: string; count: number; children?: React.ReactNode }) {
  const color = BUCKET_COLOR[label];
  return (
    <div style={{ background: '#0f1623', border: '1px solid #1a2236', borderRadius: 8, padding: '10px 12px' }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>{label}</span>
        <span className="font-display text-sm font-bold" style={{ color }}>{count}</span>
      </div>
      {count > 0 && children && <div className="mt-2 flex flex-col gap-1.5">{children}</div>}
    </div>
  );
}

function PreviewPanel({ plan }: { plan: AtlasImportPlan }) {
  const p = plan.preview;
  const unresolved = collectUnresolvedTitles(p);
  return (
    <div className="flex flex-col gap-2">
      <Bucket label="Added" count={p.added.length}>
        {p.added.map(r => <p key={r.atlasId} className="text-[11px] text-text-dim">{r.name}</p>)}
      </Bucket>
      <Bucket label="Updated" count={p.updated.length}>
        {p.updated.map(r => <p key={r.atlasId} className="text-[11px] text-text-dim">{r.name}</p>)}
      </Bucket>
      <Bucket label="Unchanged" count={p.unchanged.length}>
        {p.unchanged.map(r => <p key={r.atlasId} className="text-[11px] text-text-muted">{r.name}</p>)}
      </Bucket>
      <Bucket label="Rejected" count={p.rejected.length}>
        {p.rejected.map((r, i) => (
          <div key={i} className="text-[11px]">
            <span className="text-danger font-medium">{r.identifier}</span>
            {r.errors.map((e, j) => <p key={j} className="text-text-muted pl-2">• {e}</p>)}
          </div>
        ))}
      </Bucket>
      <Bucket label="Conflicts" count={p.conflicts.length}>
        {p.conflicts.map((c, i) => (
          <div key={i} className="text-[11px]">
            <span className="text-warning font-medium">{c.identifier}</span>
            <p className="text-text-muted pl-2">• {c.reason}</p>
          </div>
        ))}
      </Bucket>
      {unresolved.length > 0 && (
        <div style={{ background: '#1a150b', border: '1px solid #f59e0b44', borderRadius: 8, padding: '10px 12px' }}>
          <SectionLabel>Unresolved Vault concept titles</SectionLabel>
          <p className="text-[11px] text-text-muted">
            {unresolved.join(', ')} — these will import but stay unlinked until a matching concept exists.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AtlasManagePage() {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [parseError, setParseError] = useState('');
  const [plan, setPlan] = useState<AtlasImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const [exportMsg, setExportMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  const [catalogMsg, setCatalogMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getAllConcepts().then(c => setCatalogCount(c.length)).catch(() => {}); }, []);

  const copyCatalog = async () => {
    try {
      const [concepts, domains] = await Promise.all([getAllConcepts(), getAllDomains()]);
      const text = formatConceptCatalog(buildConceptCatalog(concepts, domains));
      await navigator.clipboard.writeText(text);
      setCatalogMsg({ ok: true, text: `Copied ${concepts.length} concept ${concepts.length === 1 ? 'title' : 'titles'} to clipboard.` });
    } catch {
      setCatalogMsg({ ok: false, text: 'Could not copy — clipboard unavailable.' });
    }
    setTimeout(() => setCatalogMsg(null), 4000);
  };

  const resetPreview = () => { setPlan(null); setPhase('idle'); setOutcome(null); };

  const runPreview = async (raw: string) => {
    setParseError(''); setOutcome(null);
    const parsed = parseAtlasPackText(raw);
    if (!parsed.ok) { setParseError(parsed.error); setPlan(null); setPhase('idle'); return; }
    const p = await planAtlasImport(parsed.pack);
    setPlan(p); setPhase('previewed');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const content = await file.text();
    setText(content);
    runPreview(content);
  };

  const hasWrites = !!plan && plan.toWrite.length > 0;

  const apply = async () => {
    if (!plan || !canApply(phase, hasWrites)) return; // guards double-submit
    setPhase('applying');
    await applyAtlasImportPlan(plan);
    setOutcome(applyOutcome(plan.preview));
    setPhase('applied');
  };

  const exportAll = async () => {
    const pack = await exportAllAtlasCountries();
    downloadAtlasPack(pack);
    setExportMsg(pack.countries.length === 0
      ? 'Exported an empty pack (no profiles yet).'
      : `Exported ${pack.countries.length} ${pack.countries.length === 1 ? 'profile' : 'profiles'}.`);
    setTimeout(() => setExportMsg(''), 4000);
  };

  const copyTemplate = async () => {
    try { await navigator.clipboard.writeText(ATLAS_PACK_TEMPLATE); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/knowledge/atlas" className="text-text-muted hover:text-text transition-colors text-lg" aria-label="Back to Atlas">←</Link>
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-0.5">// ATLAS · MANAGE</p>
          <h1 className="font-display text-[20px] font-bold tracking-widest leading-none" style={{ color: '#f59e0b' }}>IMPORT PROFILES</h1>
        </div>
      </div>

      {/* IMPORT */}
      <SectionLabel>Import a levelup-atlas-pack (one country or batch)</SectionLabel>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); if (phase !== 'idle') resetPreview(); }}
        placeholder="Paste pack JSON here…"
        rows={6}
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-[12px] font-mono text-text placeholder-text-muted outline-none resize-y focus:border-warning mb-2"
      />
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => runPreview(text)}
          className="flex-1 rounded-lg text-[11px] font-bold uppercase tracking-widest text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
          style={{ minHeight: 44, background: '#f59e0b22', border: '1px solid #f59e0b' }}
        >
          Preview
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-lg text-[11px] font-bold uppercase tracking-widest text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
          style={{ minHeight: 44, background: '#0f1623', border: '1px solid #1e2333' }}
        >
          Upload .json
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
      </div>

      {parseError && (
        <div role="alert" aria-live="assertive" className="mb-3 px-3 py-2.5 rounded-lg text-[11px] text-danger" style={{ background: '#ef444411', border: '1px solid #ef4444' }}>
          {parseError}
        </div>
      )}

      {/* PREVIEW */}
      {plan && (
        <div className="mb-3">
          <SectionLabel>Preview — nothing is written until you confirm</SectionLabel>
          <PreviewPanel plan={plan} />

          {outcome ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 px-3 py-3 rounded-lg text-[12px]"
              style={{
                background: outcome.kind === 'none' ? '#0f1623' : outcome.kind === 'partial' ? '#1a150b' : '#0b1f14',
                border: `1px solid ${outcome.kind === 'none' ? '#1e2333' : outcome.kind === 'partial' ? '#f59e0b' : '#22c55e'}`,
                color: outcome.kind === 'partial' ? '#f59e0b' : outcome.kind === 'full' ? '#22c55e' : '#94a3b8',
              }}
            >
              {outcome.headline}
              <button onClick={() => { setText(''); resetPreview(); }} className="block mt-2 text-[10px] uppercase tracking-widest text-text-muted underline">
                Import another
              </button>
            </div>
          ) : (
            <button
              onClick={apply}
              disabled={!canApply(phase, hasWrites)}
              className="w-full mt-3 rounded-lg text-[12px] font-bold uppercase tracking-widest transition-all disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-success"
              style={{ minHeight: 48, background: '#22c55e22', border: '1px solid #22c55e', color: '#22c55e' }}
            >
              {phase === 'applying'
                ? 'Applying…'
                : hasWrites
                  ? `Confirm & Apply (${plan.toWrite.length})`
                  : 'Nothing to apply'}
            </button>
          )}
        </div>
      )}

      {/* EXPORT */}
      <div style={{ height: 1, background: '#1a2236' }} className="my-5" />
      <SectionLabel>Export</SectionLabel>
      <button
        onClick={exportAll}
        className="w-full rounded-lg text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        style={{ minHeight: 44, background: '#0f1623', border: '1px solid #1e2333' }}
      >
        Export all profiles
      </button>
      {exportMsg && <p role="status" aria-live="polite" className="text-[10px] text-success mb-2">{exportMsg}</p>}
      <p className="text-[10px] text-text-muted">Export a single country from its profile page.</p>

      {/* CONCEPT CATALOG — for choosing exact relatedConceptTitles elsewhere */}
      <div style={{ height: 1, background: '#1a2236' }} className="my-5" />
      <SectionLabel>Vault concept catalog</SectionLabel>
      <p className="text-[10px] text-text-muted mb-2">
        Copy the exact titles of your {catalogCount} Vault {catalogCount === 1 ? 'concept' : 'concepts'} (title + domain only) to paste into a content-generation chat, so it can pick valid <span className="font-mono">relatedConceptTitles</span>.
      </p>
      <button
        onClick={copyCatalog}
        className="w-full rounded-lg text-[11px] font-bold uppercase tracking-widest text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        style={{ ...touchTargetStyle(), width: '100%', background: '#f59e0b18', border: '1px solid #f59e0b44' }}
      >
        Copy concept catalog
      </button>
      {catalogMsg && (
        <p role="status" aria-live="polite" className="text-[10px] mt-2" style={{ color: catalogMsg.ok ? '#22c55e' : '#ef4444' }}>
          {catalogMsg.text}
        </p>
      )}

      {/* AUTHORING GUIDANCE */}
      <div style={{ height: 1, background: '#1a2236' }} className="my-5" />
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Pack format — copy & edit</SectionLabel>
        <button onClick={copyTemplate} className="px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-warning" style={touchTargetStyle()}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre
        className="text-[10px] font-mono text-text-dim overflow-x-auto p-3 rounded-lg"
        style={{ background: '#0b1120', border: '1px solid #1a2236', maxHeight: 260 }}
      >
        {ATLAS_PACK_TEMPLATE}
      </pre>
    </main>
  );
}
