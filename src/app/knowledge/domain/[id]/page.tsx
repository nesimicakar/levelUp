'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAllDomains, getConceptsByDomain, getDueConcepts, db, addConcept } from '@/lib/db';
import type { KnowledgeDomain, KnowledgeConcept, KnowledgeSourceType } from '@/types';
import {
  retentionColor, retentionLabel, avgRetention, getDueCount,
  SOURCE_LABELS, timeAgo, DOMAIN_ICONS, DOMAIN_COLORS,
} from '@/lib/logic/knowledge';
import { VaultSecondaryNav } from '@/components/VaultSecondaryNav';
import { VaultSheet } from '@/components/VaultSheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }

// ── Mini sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <div className="w-full h-8" />;
  const max = Math.max(...values, 1);
  const w = 100 / values.length;
  return (
    <svg viewBox={`0 0 100 32`} className="w-full h-8" preserveAspectRatio="none">
      {values.map((v, i) => {
        const barH = Math.max(2, (v / max) * 28);
        return (
          <rect
            key={i}
            x={i * w + 0.5}
            y={32 - barH}
            width={w - 1}
            height={barH}
            rx="1"
            fill="#22c55e44"
          />
        );
      })}
    </svg>
  );
}

// ── Add Concept Modal ─────────────────────────────────────────────────────────

function AddConceptModal({
  domain,
  onClose,
  onSave,
}: {
  domain: KnowledgeDomain;
  onClose: () => void;
  onSave: (c: KnowledgeConcept) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [takeaways, setTakeaways] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>('manual');
  const [sourceTitle, setSourceTitle] = useState('');
  const [tags, setTags] = useState('');

  const save = () => {
    if (!title.trim() || !summary.trim()) return;
    const now = Date.now();
    onSave({
      id: uuid(),
      title: title.trim(),
      summary: summary.trim(),
      keyTakeaways: takeaways.split('\n').map(t => t.trim()).filter(Boolean),
      personalNotes: notes.trim() || undefined,
      primaryDomainId: domain.id,
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
          disabled={!title.trim() || !summary.trim()}
          className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold transition-all disabled:opacity-40 text-warning"
          style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
        >
          Add to Vault
        </button>
      }
    >
      <p className="text-[10px] mb-3" style={{ color: domain.color }}>
        {domain.icon} {domain.name}
      </p>
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none focus:border-warning"
        placeholder="Concept title *"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none resize-none"
        placeholder="Summary *"
        rows={3}
        value={summary}
        onChange={e => setSummary(e.target.value)}
      />
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none resize-none"
        placeholder={"Key Takeaways (one per line)\n- ...\n- ..."}
        rows={3}
        value={takeaways}
        onChange={e => setTakeaways(e.target.value)}
      />
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
          placeholder="Source title"
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
        placeholder="Tags (comma-separated)"
        value={tags}
        onChange={e => setTags(e.target.value)}
      />
    </VaultSheet>
  );
}

// ── Edit Domain Modal ─────────────────────────────────────────────────────────

function EditDomainModal({
  domain,
  onClose,
  onSave,
  onDelete,
}: {
  domain: KnowledgeDomain;
  onClose: () => void;
  onSave: (partial: Partial<KnowledgeDomain>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(domain.name);
  const [icon, setIcon] = useState(domain.icon);
  const [color, setColor] = useState(domain.color);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <VaultSheet
      label="// EDIT DOMAIN"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSave({ name: name.trim(), icon, color })}
            disabled={!name.trim()}
            className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold disabled:opacity-40 text-warning"
            style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
          >
            Save Changes
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold text-danger"
              style={{ background: '#ef444411', border: '1px solid #ef4444' }}
            >
              Delete Domain
            </button>
          ) : (
            <button
              onClick={onDelete}
              className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold text-white"
              style={{ background: '#ef4444' }}
            >
              Confirm Delete (all concepts removed)
            </button>
          )}
        </div>
      }
    >
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-4 outline-none focus:border-warning"
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
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ background: icon === ic ? color + '33' : '#1a2236', border: `1px solid ${icon === ic ? color : '#1e293b'}` }}
          >
            {ic}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Color</p>
      <div className="flex gap-2 flex-wrap mb-2">
        {DOMAIN_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-7 h-7 rounded-full border-2"
            style={{ background: c, borderColor: color === c ? '#fff' : 'transparent' }}
          />
        ))}
      </div>
    </VaultSheet>
  );
}

// ── Concept Row ───────────────────────────────────────────────────────────────

function ConceptRow({ concept, domainColor }: { concept: KnowledgeConcept; domainColor: string }) {
  const retColor = retentionColor(concept.retentionScore);
  const isDue = concept.nextReviewAt <= Date.now();

  return (
    <Link href={`/knowledge/concept/${concept.id}`}>
      <div
        className="rounded-xl p-3 mb-2 active:scale-[0.98] transition-transform"
        style={{ background: '#0f1623', border: '1px solid #1e293b' }}
      >
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm flex-shrink-0" style={{ color: domainColor }}>◆</span>
            <span className="font-display text-sm font-bold text-text truncate">{concept.title}</span>
          </div>
          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            {isDue && <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />}
            <span className="font-mono text-xs font-bold" style={{ color: retColor }}>
              {concept.retentionScore}
            </span>
          </div>
        </div>
        {/* Retention bar */}
        <div className="h-0.5 rounded-full overflow-hidden mb-2" style={{ background: '#1e293b' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${concept.retentionScore}%`, background: retColor }}
          />
        </div>
        <p className="text-[11px] text-text-dim line-clamp-2 mb-2">{concept.summary}</p>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ background: domainColor + '22', color: domainColor }}
          >
            {SOURCE_LABELS[concept.sourceType] ?? concept.sourceType}
          </span>
          {concept.sourceTitle && (
            <span className="text-[10px] text-text-muted truncate">· {concept.sourceTitle}</span>
          )}
          {concept.relatedConceptIds.length > 0 && (
            <span className="text-[10px] text-text-muted ml-auto">∞ {concept.relatedConceptIds.length}</span>
          )}
          {concept.lastReviewedAt && (
            <span className="text-[10px] text-text-muted ml-auto">{timeAgo(concept.lastReviewedAt)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DomainPage() {
  const params = useParams();
  const router = useRouter();
  const domainId = params.id as string;

  const [domain, setDomain] = useState<KnowledgeDomain | null>(null);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [reviewHistory, setReviewHistory] = useState<number[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showAddConcept, setShowAddConcept] = useState(false);
  const [showEditDomain, setShowEditDomain] = useState(false);

  const loadData = useCallback(async () => {
    const [doms, concs] = await Promise.all([
      getAllDomains(),
      getConceptsByDomain(domainId),
    ]);
    const d = doms.find(d => d.id === domainId);
    if (!d) { router.replace('/knowledge'); return; }
    setDomain(d);
    setConcepts(concs);

    // Load review history for all concepts in this domain
    const conceptIds = concs.map(c => c.id);
    const allReviews = await db.knowledgeReviews.toArray();
    const domainReviews = allReviews.filter(r => conceptIds.includes(r.conceptId));
    setTotalReviews(domainReviews.length);

    // Aggregate reviews by day for the sparkline (last 14 days)
    const today = new Date();
    const sparkData: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      sparkData.push(domainReviews.filter(r => r.date === dateStr).length);
    }
    setReviewHistory(sparkData);
    setLoaded(true);
  }, [domainId, router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddConcept = async (c: KnowledgeConcept) => {
    await addConcept(c);
    setShowAddConcept(false);
    loadData();
  };

  const handleEditDomain = async (partial: Partial<KnowledgeDomain>) => {
    if (!domain) return;
    await db.knowledgeDomains.update(domain.id, partial);
    setShowEditDomain(false);
    loadData();
  };

  const handleDeleteDomain = async () => {
    if (!domain) return;
    const { deleteDomain } = await import('@/lib/db');
    await deleteDomain(domain.id);
    router.replace('/knowledge');
  };

  if (!loaded || !domain) {
    return <main className="max-w-lg mx-auto px-4 pt-5"><p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse">Loading…</p></main>;
  }

  const ret = avgRetention(concepts);
  const retColor = retentionColor(ret);
  const due = getDueCount(concepts);

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Secondary vault nav */}
      <VaultSecondaryNav />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/knowledge" className="text-text-muted">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <p className="text-[9px] text-text-muted uppercase tracking-widest">// KNOWLEDGE VAULT</p>
            <h1 className="font-display text-xl font-bold tracking-widest leading-none flex items-center gap-2" style={{ color: domain.color }}>
              <span>{domain.icon}</span> {domain.name.toUpperCase()}
            </h1>
          </div>
        </div>
        <button onClick={() => setShowEditDomain(true)} className="text-text-muted px-1">···</button>
      </div>

      {/* Stat panels */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {/* Domain Recall */}
        <div className="rounded-xl p-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">DOMAIN RECALL</p>
          <div className="font-display text-3xl font-bold leading-none mb-2" style={{ color: retColor }}>
            {ret}<span className="text-lg">%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: '#1e293b' }}>
            <div className="h-full rounded-full" style={{ width: `${ret}%`, background: retColor }} />
          </div>
          <p className="text-[10px] text-text-muted">
            {concepts.length} held{due > 0 ? ` · ` : ''}
            {due > 0 && <span className="text-danger font-bold">{due} due</span>}
          </p>
        </div>
        {/* Review History */}
        <div className="rounded-xl p-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">REVIEW HISTORY</p>
          <div className="font-display text-3xl font-bold text-text leading-none mb-1">{totalReviews}</div>
          <Sparkline values={reviewHistory} />
          <p className="text-[10px] text-text-muted">{totalReviews} reviews</p>
        </div>
      </div>

      {/* Concepts section */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-text-muted uppercase tracking-widest">
          // CONCEPTS · {concepts.length}
        </p>
        <button
          onClick={() => setShowAddConcept(true)}
          className="text-[10px] uppercase tracking-widest font-bold"
          style={{ color: domain.color }}
        >
          + ADD
        </button>
      </div>

      {concepts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-muted text-[11px] mb-3">No concepts in this domain yet.</p>
          <button
            onClick={() => setShowAddConcept(true)}
            className="text-[11px] uppercase tracking-widest font-bold"
            style={{ color: domain.color }}
          >
            Add the first concept →
          </button>
        </div>
      ) : (
        concepts.map(c => (
          <ConceptRow key={c.id} concept={c} domainColor={domain.color} />
        ))
      )}

      {/* Modals */}
      {showAddConcept && (
        <AddConceptModal domain={domain} onClose={() => setShowAddConcept(false)} onSave={handleAddConcept} />
      )}
      {showEditDomain && (
        <EditDomainModal
          domain={domain}
          onClose={() => setShowEditDomain(false)}
          onSave={handleEditDomain}
          onDelete={handleDeleteDomain}
        />
      )}
    </main>
  );
}
