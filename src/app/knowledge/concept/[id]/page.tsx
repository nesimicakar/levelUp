'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAllDomains, getAllConcepts, getReviewsForConcept, updateConcept, deleteConcept, db } from '@/lib/db';
import type { KnowledgeDomain, KnowledgeConcept, KnowledgeReview } from '@/types';
import {
  retentionColor, retentionLabel, SOURCE_LABELS, timeAgo, nextReviewLabel, conceptCode,
} from '@/lib/logic/knowledge';
import { VaultSecondaryNav } from '@/components/VaultSecondaryNav';
import { VaultSheet } from '@/components/VaultSheet';
import { ArticleText } from '@/components/ArticleText';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wordCount(s?: string): number {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

function MetricBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
      <span className="font-display text-xl font-bold text-text leading-none">{value}</span>
      {sub && <span className="text-[9px] text-text-muted mt-0.5">{sub}</span>}
      <span className="text-[9px] text-text-muted uppercase tracking-widest mt-1">{label}</span>
    </div>
  );
}

// ── Edit Concept Modal ────────────────────────────────────────────────────────

function EditConceptModal({
  concept,
  domains,
  onClose,
  onSave,
}: {
  concept: KnowledgeConcept;
  domains: KnowledgeDomain[];
  onClose: () => void;
  onSave: (partial: Partial<KnowledgeConcept>) => void;
}) {
  const [title, setTitle] = useState(concept.title);
  const [summary, setSummary] = useState(concept.summary);
  const [takeaways, setTakeaways] = useState((concept.keyTakeaways ?? []).join('\n'));
  const [notes, setNotes] = useState(concept.personalNotes ?? '');
  const [domainId, setDomainId] = useState(concept.primaryDomainId);
  const [sourceTitle, setSourceTitle] = useState(concept.sourceTitle ?? '');
  const [tags, setTags] = useState(concept.tags.join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <VaultSheet
      label="// EDIT CONCEPT"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSave({
              title: title.trim(),
              summary: summary.trim(),
              keyTakeaways: takeaways.split('\n').map(t => t.trim()).filter(Boolean),
              personalNotes: notes.trim() || undefined,
              primaryDomainId: domainId,
              sourceTitle: sourceTitle.trim() || undefined,
              tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            })}
            disabled={!title.trim() || !summary.trim()}
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
              Delete Concept
            </button>
          ) : (
            <button
              onClick={() => onSave({ __delete: true } as never)}
              className="w-full py-3 rounded-lg text-sm uppercase tracking-widest font-bold text-white"
              style={{ background: '#ef4444' }}
            >
              Confirm Delete
            </button>
          )}
        </div>
      }
    >
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-3 outline-none focus:border-warning"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title *"
        autoFocus
      />
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-3 outline-none resize-none"
        rows={3}
        value={summary}
        onChange={e => setSummary(e.target.value)}
        placeholder="Summary *"
      />
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-text-muted mb-3 outline-none resize-none"
        rows={3}
        value={takeaways}
        onChange={e => setTakeaways(e.target.value)}
        placeholder={"Key Takeaways (one per line)\n- ...\n- ..."}
      />
      <select
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-3 outline-none"
        value={domainId}
        onChange={e => setDomainId(e.target.value)}
      >
        {domains.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
      </select>
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-3 outline-none"
        value={sourceTitle}
        onChange={e => setSourceTitle(e.target.value)}
        placeholder="Source title"
      />
      <textarea
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-3 outline-none resize-none"
        rows={2}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Personal notes"
      />
      <input
        className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-text mb-2 outline-none"
        value={tags}
        onChange={e => setTags(e.target.value)}
        placeholder="Tags (comma-separated)"
      />
    </VaultSheet>
  );
}

// ── Rating Badge ──────────────────────────────────────────────────────────────

const RATING_COLORS: Record<string, string> = {
  again: '#ef4444',
  hard:  '#f97316',
  good:  '#22c55e',
  easy:  '#60a5fa',
};

function RatingBadge({ rating }: { rating: string }) {
  return (
    <span
      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
      style={{ background: (RATING_COLORS[rating] ?? '#64748b') + '22', color: RATING_COLORS[rating] ?? '#64748b' }}
    >
      {rating}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConceptPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params.id as string;

  const [concept, setConcept] = useState<KnowledgeConcept | null>(null);
  const [domain, setDomain] = useState<KnowledgeDomain | null>(null);
  const [relatedConcepts, setRelatedConcepts] = useState<KnowledgeConcept[]>([]);
  const [reviews, setReviews] = useState<KnowledgeReview[]>([]);
  const [allDomains, setAllDomains] = useState<KnowledgeDomain[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const loadData = useCallback(async () => {
    const [doms, concs, revs] = await Promise.all([
      getAllDomains(),
      getAllConcepts(),
      getReviewsForConcept(conceptId),
    ]);
    const c = concs.find(x => x.id === conceptId);
    if (!c) { router.replace('/knowledge'); return; }
    const d = doms.find(x => x.id === c.primaryDomainId) ?? null;
    const related = concs.filter(x => c.relatedConceptIds.includes(x.id));
    setConcept(c);
    setDomain(d);
    setRelatedConcepts(related);
    setReviews(revs.reverse()); // most recent first
    setAllDomains(doms);
    setLoaded(true);
  }, [conceptId, router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (partial: Partial<KnowledgeConcept> & { __delete?: boolean }) => {
    if (!concept) return;
    if ((partial as { __delete?: boolean }).__delete) {
      await deleteConcept(concept.id);
      router.replace(domain ? `/knowledge/domain/${domain.id}` : '/knowledge');
      return;
    }
    await updateConcept(concept.id, partial);
    setShowEdit(false);
    loadData();
  };

  if (!loaded || !concept) {
    return <main className="max-w-lg mx-auto px-4 pt-5"><p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse">Loading…</p></main>;
  }

  const retColor = retentionColor(concept.retentionScore);
  const isDue = concept.nextReviewAt <= Date.now();

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Secondary vault nav */}
      <VaultSecondaryNav />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link
            href={domain ? `/knowledge/domain/${domain.id}` : '/knowledge'}
            className="text-text-muted"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          {domain && (
            <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: domain.color }}>
              // {domain.name.toUpperCase()}
            </p>
          )}
        </div>
        <button onClick={() => setShowEdit(true)} className="text-text-muted px-1">···</button>
      </div>

      {/* Concept ID + Title */}
      <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">{conceptCode(concept.id)}</p>
      <h1 className="font-display text-3xl font-bold text-text leading-tight mb-4">
        {concept.title}
      </h1>

      {/* Metrics row */}
      <div className="flex gap-2 mb-3">
        <MetricBox
          label="RETENTION"
          value={`${concept.retentionScore}%`}
        />
        <MetricBox
          label={isDue ? 'DUE NOW' : 'NEXT REVIEW'}
          value={isDue ? 'DUE' : nextReviewLabel(concept.nextReviewAt)}
          sub={isDue ? 'OVERDUE' : undefined}
        />
        <MetricBox
          label="INTERVAL"
          value={`${concept.reviewIntervalDays}d`}
        />
      </div>

      {/* Retention bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: '#1e293b' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${concept.retentionScore}%`, background: retColor }} />
      </div>
      <div className="flex items-center justify-between mb-5">
        <span className="text-[9px] uppercase tracking-widest" style={{ color: retColor }}>
          {retentionLabel(concept.retentionScore)}
        </span>
        {concept.reviewCount > 0 && (
          <span className="text-[9px] text-text-muted">{concept.reviewCount} reviews</span>
        )}
      </div>

      {/* Summary */}
      <div className="mb-5">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">// SUMMARY</p>
        <div className="rounded-xl px-5 py-5" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          <ArticleText text={concept.summary} />
        </div>
      </div>

      {/* Key Takeaways */}
      {concept.keyTakeaways && concept.keyTakeaways.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">// KEY TAKEAWAYS</p>
          <div className="rounded-xl px-5 py-5" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
            <ul className="space-y-3">
              {concept.keyTakeaways.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="flex-shrink-0 font-bold"
                    style={{ color: domain?.color ?? '#f59e0b', fontSize: 10, marginTop: 4, lineHeight: 1 }}
                  >
                    ◆
                  </span>
                  <span className="text-sm text-text leading-[1.7]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Personal Notes */}
      <div className="mb-5">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">// PERSONAL NOTES</p>
        <div className="rounded-xl px-5 py-5" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          {concept.personalNotes ? (
            <>
              <ArticleText text={concept.personalNotes} dim />
              <p className="text-[9px] text-text-muted mt-4">
                {wordCount(concept.personalNotes)} WORDS
              </p>
            </>
          ) : (
            <p className="text-[11px] text-text-muted">No personal notes yet.</p>
          )}
        </div>
      </div>

      {/* Source */}
      <div className="mb-4">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">// SOURCE</p>
        <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
            style={{ background: (domain?.color ?? '#64748b') + '22', color: domain?.color ?? '#64748b' }}
          >
            {SOURCE_LABELS[concept.sourceType] ?? concept.sourceType}
          </span>
          <span className="text-sm text-text truncate">{concept.sourceTitle ?? '—'}</span>
        </div>
      </div>

      {/* Tags */}
      {concept.tags.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">// TAGS</p>
          <div className="flex flex-wrap gap-1.5">
            {concept.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] px-2 py-1 rounded-full"
                style={{ background: '#1a2236', border: '1px solid #1e293b', color: '#94a3b8' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related Concepts */}
      {(relatedConcepts.length > 0 || true) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-text-muted uppercase tracking-widest">// RELATED CONCEPTS</p>
            <span className="text-[10px] text-text-muted">{relatedConcepts.length} LINKS →</span>
          </div>
          {relatedConcepts.length === 0 ? (
            <p className="text-[10px] text-text-muted px-1">No related concepts linked yet.</p>
          ) : (
            relatedConcepts.map(rc => {
              const rcDomain = allDomains.find(d => d.id === rc.primaryDomainId);
              const rcColor = retentionColor(rc.retentionScore);
              return (
                <Link key={rc.id} href={`/knowledge/concept/${rc.id}`}>
                  <div
                    className="flex items-center justify-between p-3 rounded-xl mb-1.5 active:scale-[0.98] transition-transform"
                    style={{ background: '#0f1623', border: '1px solid #1e293b' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: rcDomain?.color ?? '#64748b' }}>◆</span>
                      <div>
                        <p className="text-sm text-text font-bold">{rc.title}</p>
                        {rcDomain && (
                          <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: rcDomain.color }}>{rcDomain.name}</p>
                        )}
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full" style={{ background: rcColor }} />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Review CTA */}
      {isDue && (
        <Link href={`/knowledge/review?start=${concept.id}`}>
          <div
            className="w-full rounded-xl p-4 mb-4 text-center active:scale-[0.98] transition-transform"
            style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
          >
            <p className="font-display text-sm font-bold tracking-wider text-warning">REVIEW NOW →</p>
          </div>
        </Link>
      )}

      {/* Review History */}
      <div className="mb-4">
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">
          // REVIEW HISTORY
        </p>
        {reviews.length === 0 ? (
          <p className="text-[10px] text-text-muted px-1">No reviews yet.</p>
        ) : (
          <div className="space-y-1.5">
            {reviews.slice(0, 10).map((r, i) => {
              const retBefore = r.previousRetention;
              const retAfter = r.newRetention;
              const delta = retAfter - retBefore;
              return (
                <div
                  key={r.id ?? i}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: '#0f1623', border: '1px solid #1e293b' }}
                >
                  <div className="flex items-center gap-2">
                    <RatingBadge rating={r.rating} />
                    <span className="text-[10px] text-text-muted">{r.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted">{r.previousIntervalDays}d → {r.newIntervalDays}d</span>
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: delta >= 0 ? '#22c55e' : '#ef4444' }}
                    >
                      {delta >= 0 ? '+' : ''}{delta}%
                    </span>
                  </div>
                </div>
              );
            })}
            {reviews.length > 10 && (
              <p className="text-[10px] text-text-muted text-center pt-1">
                +{reviews.length - 10} more reviews
              </p>
            )}
          </div>
        )}
      </div>

      {/* Last / Next review metadata */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">LAST REVIEWED</p>
          <p className="text-sm font-bold text-text">
            {concept.lastReviewedAt ? timeAgo(concept.lastReviewedAt) : '—'}
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">NEXT REVIEW</p>
          <p className="text-sm font-bold" style={{ color: isDue ? '#ef4444' : '#e2e8f0' }}>
            {isDue ? 'DUE NOW' : nextReviewLabel(concept.nextReviewAt)}
          </p>
        </div>
      </div>

      {showEdit && (
        <EditConceptModal
          concept={concept}
          domains={allDomains}
          onClose={() => setShowEdit(false)}
          onSave={handleSave}
        />
      )}
    </main>
  );
}
