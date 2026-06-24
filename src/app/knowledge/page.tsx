'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  db, getAllDomains, getAllConcepts, getDueConcepts,
  addDomain, addConcept,
} from '@/lib/db';
import type { KnowledgeDomain, KnowledgeConcept, KnowledgeSourceType, KeyIdea } from '@/types';
import { KeyIdeasEditor } from '@/components/KeyIdeasEditor';
import {
  avgRetention, getDueCount, uniqueSources, retentionColor, retentionLabel,
  estMinutes, reviewStreakDays, DOMAIN_COLORS, DOMAIN_ICONS, SOURCE_LABELS,
} from '@/lib/logic/knowledge';
import { VaultSecondaryNav } from '@/components/VaultSecondaryNav';
import { VaultSheet } from '@/components/VaultSheet';
import {
  validateVaultPack, importVaultPack, exportVaultPack, downloadVaultPack,
  type ImportResult,
} from '@/lib/logic/vaultPack';
import { runNormalizeVaultBodies } from '@/lib/migrations/normalizeVaultBodies';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }

// ── Visual primitives ─────────────────────────────────────────────────────────

/** Segmented battery-style bar matching the design */
function SegmentedBar({ pct, color, segments = 28 }: { pct: number; color: string; segments?: number }) {
  const filled = Math.round((pct / 100) * segments);
  return (
    <div className="flex gap-[2px]" style={{ height: 5 }}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="flex-1"
          style={{ background: i < filled ? color : '#1a2236', borderRadius: 1 }}
        />
      ))}
    </div>
  );
}

/** Thin solid retention bar for domain cards */
function RetentionBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 3, background: '#1a2236', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

/** Corner-bracket HUD frame */
function HudFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const bracket = 14;
  const c = '#f59e0b55'; // amber, semi-transparent
  const t = 2;
  return (
    <div className={`relative ${className}`} style={{ background: '#0b1120', border: '1px solid #1e2333', borderRadius: 12 }}>
      {/* TL */ }<span className="absolute" style={{ top: -1, left: -1, width: bracket, height: bracket, borderTop: `${t}px solid ${c}`, borderLeft: `${t}px solid ${c}`, borderRadius: '10px 0 0 0' }} />
      {/* TR */ }<span className="absolute" style={{ top: -1, right: -1, width: bracket, height: bracket, borderTop: `${t}px solid ${c}`, borderRight: `${t}px solid ${c}`, borderRadius: '0 10px 0 0' }} />
      {/* BL */ }<span className="absolute" style={{ bottom: -1, left: -1, width: bracket, height: bracket, borderBottom: `${t}px solid ${c}`, borderLeft: `${t}px solid ${c}`, borderRadius: '0 0 0 10px' }} />
      {/* BR */ }<span className="absolute" style={{ bottom: -1, right: -1, width: bracket, height: bracket, borderBottom: `${t}px solid ${c}`, borderRight: `${t}px solid ${c}`, borderRadius: '0 0 10px 0' }} />
      {children}
    </div>
  );
}

// ── Add Domain Modal ──────────────────────────────────────────────────────────

function AddDomainModal({ onClose, onSave }: { onClose: () => void; onSave: (d: KnowledgeDomain) => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DOMAIN_ICONS[0]);
  const [color, setColor] = useState(DOMAIN_COLORS[0]);

  const save = () => {
    if (!name.trim()) return;
    onSave({ id: uuid(), name: name.trim(), icon, color, createdAt: Date.now() });
  };

  return (
    <VaultSheet
      label="// NEW DOMAIN"
      onClose={onClose}
      footer={
        <button
          onClick={save}
          disabled={!name.trim()}
          className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold transition-all disabled:opacity-40"
          style={{ background: color + '22', border: `1px solid ${color}`, color }}
        >
          Create Domain
        </button>
      }
    >
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-4 outline-none focus:border-warning"
        placeholder="Domain name (e.g. Psychology)"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Icon</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {DOMAIN_ICONS.map(ic => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all"
            style={{ background: icon === ic ? color + '33' : '#1a2236', border: `1px solid ${icon === ic ? color : '#1e293b'}` }}
          >
            {ic}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Color</p>
      <div className="flex gap-2 flex-wrap">
        {DOMAIN_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-7 h-7 rounded-full border-2 transition-all"
            style={{ background: c, borderColor: color === c ? '#fff' : 'transparent' }}
          />
        ))}
      </div>
    </VaultSheet>
  );
}

// ── Add Concept Modal ─────────────────────────────────────────────────────────

function AddConceptModal({
  domains,
  onClose,
  onSave,
}: {
  domains: KnowledgeDomain[];
  onClose: () => void;
  onSave: (c: KnowledgeConcept) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [keyIdeas, setKeyIdeas] = useState<KeyIdea[]>([]);
  const [notes, setNotes] = useState('');
  const [domainId, setDomainId] = useState(domains[0]?.id ?? '');
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>('manual');
  const [sourceTitle, setSourceTitle] = useState('');
  const [tags, setTags] = useState('');

  const save = () => {
    if (!title.trim() || !summary.trim() || !domainId) return;
    const now = Date.now();
    onSave({
      id: uuid(),
      title: title.trim(),
      summary: summary.trim(),
      keyIdeas: keyIdeas.filter(k => k.title.trim() || k.body.trim()),
      personalNotes: notes.trim() || undefined,
      primaryDomainId: domainId,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      relatedConceptIds: [],
      sourceType,
      sourceTitle: sourceTitle.trim() || undefined,
      retentionScore: 0,
      reviewCount: 0,
      reviewIntervalDays: 1,
      nextReviewAt: now,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <VaultSheet
      label="// ADD CONCEPT"
      onClose={onClose}
      footer={
        <button
          onClick={save}
          disabled={!title.trim() || !summary.trim() || !domainId}
          className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold transition-all disabled:opacity-40 text-warning"
          style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
        >
          Add to Vault
        </button>
      }
    >
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none focus:border-warning"
        placeholder="Concept title *"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none resize-none"
        placeholder="Summary (what this concept means) *"
        rows={3}
        value={summary}
        onChange={e => setSummary(e.target.value)}
      />
      <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2">Key Ideas</p>
      <div className="mb-3">
        <KeyIdeasEditor value={keyIdeas} onChange={setKeyIdeas} />
      </div>
      <select
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-3 outline-none"
        value={domainId}
        onChange={e => setDomainId(e.target.value)}
      >
        {domains.map(d => (
          <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
        ))}
      </select>
      <div className="flex gap-2 mb-3">
        <select
          className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text outline-none"
          value={sourceType}
          onChange={e => setSourceType(e.target.value as KnowledgeSourceType)}
        >
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          className="flex-[2] bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted outline-none"
          placeholder="Source title (optional)"
          value={sourceTitle}
          onChange={e => setSourceTitle(e.target.value)}
        />
      </div>
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none resize-none"
        placeholder="Personal notes (optional)"
        rows={2}
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-2 outline-none"
        placeholder="Tags (comma-separated, optional)"
        value={tags}
        onChange={e => setTags(e.target.value)}
      />
    </VaultSheet>
  );
}

// ── Domain Card ───────────────────────────────────────────────────────────────

function DomainCard({ domain, concepts }: { domain: KnowledgeDomain; concepts: KnowledgeConcept[] }) {
  const due = getDueCount(concepts);
  const ret = avgRetention(concepts);
  const retColor = retentionColor(ret);

  return (
    <Link href={`/knowledge/domain/${domain.id}`} className="block active:scale-[0.97] transition-transform">
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: '#0f1623',
          border: '1px solid #1e2333',
          borderRadius: 10,
          borderTop: `2px solid ${domain.color}`,
        }}
      >
        <div className="p-3 flex flex-col gap-2">
          {/* Icon + name */}
          <div className="flex items-center gap-2">
            <span className="text-[15px] leading-none">{domain.icon}</span>
            <span
              className="font-display text-sm font-bold tracking-wide truncate leading-none"
              style={{ color: domain.color }}
            >
              {domain.name}
            </span>
          </div>

          {/* Counts */}
          <div className="flex items-center justify-between min-h-[14px]">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">
              {concepts.length} CONCEPTS
            </span>
            {due > 0 && (
              <span className="text-[9px] font-bold" style={{ color: '#ef4444' }}>
                ● {due} DUE
              </span>
            )}
          </div>

          {/* Retention bar */}
          <RetentionBar pct={ret} color={retColor} />

          {/* Retention % */}
          <span className="font-mono text-[11px] font-bold leading-none" style={{ color: retColor }}>
            {ret}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const router = useRouter();
  const [domains, setDomains] = useState<KnowledgeDomain[]>([]);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [reviewStreak, setReviewStreak] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddConcept, setShowAddConcept] = useState(false);
  const [showPackMenu, setShowPackMenu] = useState(false);
  const [packState, setPackState] = useState<
    | { status: 'importing' }
    | { status: 'exporting' }
    | { status: 'success'; result: ImportResult }
    | { status: 'error'; message: string }
    | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [doms, concs, due, reviews] = await Promise.all([
      getAllDomains(),
      getAllConcepts(),
      getDueConcepts(),
      db.knowledgeReviews.toArray(),
    ]);
    setDomains(doms);
    setConcepts(concs);
    setDueCount(due.length);
    setReviewStreak(reviewStreakDays(reviews));
    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // One-time migration: normalize inline "Label: Value" → "Label:\nValue" in key idea bodies
  useEffect(() => { runNormalizeVaultBodies().catch(console.error); }, []);

  const handleAddDomain = async (d: KnowledgeDomain) => {
    await addDomain(d);
    setShowAddDomain(false);
    loadData();
  };

  const handleAddConcept = async (c: KnowledgeConcept) => {
    await addConcept(c);
    setShowAddConcept(false);
    loadData();
  };

  const handleExport = async () => {
    setPackState({ status: 'exporting' });
    try {
      const pack = await exportVaultPack();
      downloadVaultPack(pack);
      setPackState(null);
    } catch (e) {
      setPackState({ status: 'error', message: (e as Error).message });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-imported if needed
    e.target.value = '';
    setPackState({ status: 'importing' });
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const pack = validateVaultPack(raw);
      const result = await importVaultPack(pack);
      setPackState({ status: 'success', result });
      loadData();
    } catch (e) {
      setPackState({ status: 'error', message: (e as Error).message });
    }
  };

  const totalRet = avgRetention(concepts);
  const retColor = retentionColor(totalRet);
  const sources = uniqueSources(concepts);
  const conceptsByDomain = (domainId: string) => concepts.filter(c => c.primaryDomainId === domainId);

  if (!loaded) {
    return (
      <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
        <VaultSecondaryNav />
        <p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse mt-4">Loading Vault…</p>
      </main>
    );
  }

  return (
    <main
      className="max-w-lg mx-auto px-4 pt-5 pb-24"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.013) 3px, rgba(255,255,255,0.013) 4px)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-0.5">// SYSTEM · PILLAR 5</p>
          <h1
            className="font-display text-[26px] font-bold tracking-widest leading-none"
            style={{ color: '#f59e0b' }}
          >
            KNOWLEDGE VAULT
          </h1>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">// REMEMBER</p>
        </div>

        {/* Right icon cluster */}
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => router.push('/knowledge/search')}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Search"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
          </button>

          {/* ⋯ overflow menu */}
          <div className="relative">
            <button
              onClick={() => setShowPackMenu(v => !v)}
              className="text-text-muted hover:text-text transition-colors flex items-center"
              aria-label="More options"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
              </svg>
            </button>

            {showPackMenu && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setShowPackMenu(false)} />
                {/* Dropdown */}
                <div
                  className="absolute right-0 z-50 flex flex-col overflow-hidden"
                  style={{ top: 26, width: 152, background: '#0f1623', border: '1px solid #1e293b', borderRadius: 10 }}
                >
                  <button
                    onClick={() => { fileInputRef.current?.click(); setShowPackMenu(false); }}
                    disabled={packState?.status === 'importing'}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-text-muted uppercase tracking-widest font-bold hover:bg-white/5 transition-colors disabled:opacity-40 text-left"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {packState?.status === 'importing' ? 'Importing…' : 'Import Pack'}
                  </button>
                  <div style={{ height: 1, background: '#1e293b' }} />
                  <button
                    onClick={() => { handleExport(); setShowPackMenu(false); }}
                    disabled={packState?.status === 'exporting' || concepts.length === 0}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-text-muted uppercase tracking-widest font-bold hover:bg-white/5 transition-colors disabled:opacity-40 text-left"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {packState?.status === 'exporting' ? 'Exporting…' : 'Export Pack'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      {/* ── Secondary vault nav ─────────────────────────────────────────── */}
      <VaultSecondaryNav />

      {/* ── HUD Integrity Panel (Stats Card) ──────────────────────────── */}
      <HudFrame className="mb-3">
        <div className="p-4">
          {/* Top row: large % + right stats */}
          <div className="flex items-start justify-between mb-4">
            {/* Left: big recall % */}
            <div>
              <div className="flex items-end gap-1 leading-none">
                <span
                  className="font-display font-bold leading-none"
                  style={{ fontSize: 52, color: '#f59e0b' }}
                >
                  {totalRet}
                </span>
                <span
                  className="font-display font-bold pb-1"
                  style={{ fontSize: 22, color: '#f59e0b' }}
                >
                  %
                </span>
              </div>
              <p className="text-[9px] text-text-muted uppercase tracking-widest mt-1">TOTAL RECALL</p>
            </div>

            {/* Right: stat rows */}
            <div className="flex flex-col items-end gap-2.5 pt-1">
              {[
                { label: 'CONCEPTS HELD', value: concepts.length },
                { label: 'DOMAINS',        value: domains.length },
                { label: 'SOURCES LINKED', value: sources },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="text-[9px] text-text-muted uppercase tracking-widest">{label}</span>
                  <span className="font-display text-base font-bold text-text leading-none">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#1a2236', marginBottom: 10 }} />

          {/* Retention segmented bar */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-text-muted uppercase tracking-widest">RETENTION</span>
            <span className="text-[9px] font-bold font-mono" style={{ color: retColor }}>
              {totalRet}% · {retentionLabel(totalRet)}
            </span>
          </div>
          <SegmentedBar pct={totalRet} color={retColor} segments={28} />
        </div>
      </HudFrame>

      {/* ── Daily Review CTA ────────────────────────────────────────────── */}
      <button
        onClick={() => dueCount > 0 && router.push('/knowledge/review')}
        disabled={dueCount === 0}
        className="w-full mb-5 active:scale-[0.98] transition-transform disabled:opacity-50"
        style={{
          background: '#0f1623',
          border: '1px solid #1e2333',
          borderLeft: '3px solid #f59e0b',
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Refresh icon in amber box */}
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 36, height: 36, background: '#f59e0b22', borderRadius: 8, border: '1px solid #f59e0b44' }}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </div>

          <div className="text-left">
            <p className="font-display text-sm font-bold tracking-wider text-text leading-none mb-1">
              DAILY REVIEW
            </p>
            <p className="text-[10px] text-text-muted leading-none">
              {dueCount > 0
                ? `${dueCount} due · est. ${estMinutes(dueCount)} min${reviewStreak > 0 ? ` · streak ${reviewStreak}d` : ''}`
                : 'All caught up — no concepts due'}
            </p>
          </div>
        </div>

        {/* Arrow */}
        {dueCount > 0 && (
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 28, height: 28, background: '#f59e0b22', borderRadius: 6 }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        )}
      </button>

      {/* Import result card */}
      {packState && packState.status !== 'importing' && packState.status !== 'exporting' && (
        <div
          className="rounded-xl px-4 py-3 mb-4 flex flex-col gap-1"
          style={{
            background: packState.status === 'error' ? '#ef444411' : '#22c55e11',
            border: `1px solid ${packState.status === 'error' ? '#ef4444' : '#22c55e'}`,
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: packState.status === 'error' ? '#ef4444' : '#22c55e' }}
            >
              {packState.status === 'error' ? '// IMPORT FAILED' : '// IMPORT COMPLETE'}
            </span>
            <button
              onClick={() => setPackState(null)}
              className="text-text-muted text-sm leading-none"
            >
              ✕
            </button>
          </div>

          {packState.status === 'error' && (
            <p className="text-[11px] text-text-dim leading-relaxed">{packState.message}</p>
          )}

          {packState.status === 'success' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
              {[
                { label: 'Domains created',   value: packState.result.domainsCreated },
                { label: 'Domains reused',    value: packState.result.domainsReused },
                { label: 'Concepts imported', value: packState.result.conceptsImported },
                { label: 'Concepts skipped',  value: packState.result.conceptsSkipped },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">{label}</span>
                  <span className="text-[10px] font-bold text-text font-mono">{value}</span>
                </div>
              ))}
              {packState.result.errors.length > 0 && (
                <div className="col-span-2 mt-1">
                  {packState.result.errors.map((err, i) => (
                    <p key={i} className="text-[10px] text-danger">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Domains section ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted uppercase tracking-widest">// DOMAINS</span>
          <span className="font-display text-sm font-bold text-text">{domains.length}</span>
        </div>
        {domains.length > 0 && (
          <button
            onClick={() => setShowAddConcept(true)}
            className="text-[10px] font-bold uppercase tracking-widest text-warning"
          >
            + ADD CONCEPT
          </button>
        )}
      </div>

      {/* Domain grid */}
      {domains.length === 0 ? (
        /* ── Empty state ── */
        <div
          className="flex flex-col items-center justify-center text-center py-14 px-6"
          style={{
            background: '#0b1120',
            border: '1px dashed #1e2333',
            borderRadius: 12,
          }}
        >
          <span className="font-display text-4xl mb-3" style={{ color: '#1e2a3a' }}>◈</span>
          <p className="font-display text-sm font-bold text-text uppercase tracking-widest mb-1.5">
            Vault Empty
          </p>
          <p className="text-[11px] text-text-muted leading-relaxed mb-5 max-w-[220px]">
            Create your first domain to begin building your personal knowledge archive.
          </p>
          <button
            onClick={() => setShowAddDomain(true)}
            className="py-2.5 px-5 rounded-lg text-[11px] font-bold uppercase tracking-widest text-warning"
            style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
          >
            + Create First Domain
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 mb-2">
          {domains.map(d => (
            <DomainCard key={d.id} domain={d} concepts={conceptsByDomain(d.id)} />
          ))}

          {/* New Domain card */}
          <button
            onClick={() => setShowAddDomain(true)}
            className="flex flex-col items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"
            style={{
              background: 'transparent',
              border: '1px dashed #1e2333',
              borderRadius: 10,
              minHeight: 100,
            }}
          >
            <span className="font-display text-xl text-text-muted">+</span>
            <span className="text-[9px] text-text-muted uppercase tracking-widest">NEW DOMAIN</span>
          </button>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showAddDomain && (
        <AddDomainModal onClose={() => setShowAddDomain(false)} onSave={handleAddDomain} />
      )}
      {showAddConcept && domains.length > 0 && (
        <AddConceptModal domains={domains} onClose={() => setShowAddConcept(false)} onSave={handleAddConcept} />
      )}
    </main>
  );
}
