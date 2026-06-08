'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getDueConcepts, getAllDomains, addReview, updateConcept, db } from '@/lib/db';
import type { KnowledgeDomain, KnowledgeConcept, ReviewRating } from '@/types';
import {
  computeNextReview, nextIntervalLabel, retentionColor, reviewStreakDays,
} from '@/lib/logic/knowledge';
import { VaultSecondaryNav } from '@/components/VaultSecondaryNav';
import { ArticleText } from '@/components/ArticleText';

// ── Rating config ─────────────────────────────────────────────────────────────

const RATINGS: Array<{ key: ReviewRating; label: string; color: string; bg: string }> = [
  { key: 'again', label: 'AGAIN', color: '#ef4444', bg: '#ef444422' },
  { key: 'hard',  label: 'HARD',  color: '#f97316', bg: '#f9731622' },
  { key: 'good',  label: 'GOOD',  color: '#22c55e', bg: '#22c55e22' },
  { key: 'easy',  label: 'EASY',  color: '#60a5fa', bg: '#60a5fa22' },
];

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-0.5 h-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-full transition-all"
          style={{ background: i < current ? '#22c55e' : '#1e293b' }}
        />
      ))}
    </div>
  );
}

// ── Session Complete screen ───────────────────────────────────────────────────

function SessionComplete({ total, streak, onDone }: { total: number; streak: number; onDone: () => void }) {
  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center">
        <div className="text-5xl mb-4">◈</div>
        <h2 className="font-display text-2xl font-bold tracking-widest text-warning mb-2">SESSION COMPLETE</h2>
        <p className="text-text-muted text-[11px] uppercase tracking-widest mb-6">
          {total} concept{total !== 1 ? 's' : ''} reviewed · streak {streak}d
        </p>
        <div
          className="rounded-xl p-4 mb-6"
          style={{ background: '#0f1623', border: '1px solid #1e293b' }}
        >
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">// VAULT STATUS</p>
          <p className="text-sm text-text-dim">Your knowledge is up to date.</p>
          <p className="text-sm text-text-dim">Come back tomorrow to continue building retention.</p>
        </div>
        <button
          onClick={onDone}
          className="w-full py-3 rounded-xl font-display text-sm font-bold tracking-widest text-warning"
          style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
        >
          RETURN TO VAULT
        </button>
      </div>
    </main>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<KnowledgeConcept[]>([]);
  const [domains, setDomains] = useState<KnowledgeDomain[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    const [due, doms, allReviews] = await Promise.all([
      getDueConcepts(),
      getAllDomains(),
      db.knowledgeReviews.toArray(),
    ]);
    // Sort: most overdue first
    const sorted = [...due].sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    setQueue(sorted);
    setDomains(doms);
    setSessionStreak(reviewStreakDays(allReviews));
    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const current = queue[currentIndex] ?? null;
  const domain = current ? domains.find(d => d.id === current.primaryDomainId) : null;
  const total = queue.length;

  const handleRate = async (rating: ReviewRating) => {
    if (!current || submitting) return;
    setSubmitting(true);

    const result = computeNextReview(current, rating);
    const today = new Date().toISOString().split('T')[0];

    const review = {
      conceptId: current.id,
      rating,
      previousRetention: current.retentionScore,
      newRetention: result.newRetention,
      previousIntervalDays: current.reviewIntervalDays,
      newIntervalDays: result.newIntervalDays,
      date: today,
      createdAt: Date.now(),
    };

    await addReview(review);
    await updateConcept(current.id, {
      retentionScore: result.newRetention,
      reviewIntervalDays: result.newIntervalDays,
      nextReviewAt: result.nextReviewAt,
      lastReviewedAt: Date.now(),
      reviewCount: current.reviewCount + 1,
    });

    setReviewed(r => r + 1);
    setRevealed(false);
    setSubmitting(false);

    if (currentIndex + 1 >= total) {
      // Refresh streak
      const allReviews = await db.knowledgeReviews.toArray();
      setSessionStreak(reviewStreakDays(allReviews));
      setDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  if (!loaded) {
    return (
      <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
        <VaultSecondaryNav />
        <p className="text-text-muted text-[10px] uppercase tracking-widest animate-pulse">Loading review queue…</p>
      </main>
    );
  }

  if (total === 0) {
    return (
      <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
        <VaultSecondaryNav />
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh' }}>
          <div className="text-center">
            <div className="text-4xl mb-4">◈</div>
            <h2 className="font-display text-xl font-bold tracking-widest text-text mb-2">ALL CAUGHT UP</h2>
            <p className="text-text-muted text-[11px] uppercase tracking-widest mb-6">No concepts due for review</p>
            <Link href="/knowledge">
              <div
                className="py-3 px-6 rounded-xl font-display text-sm font-bold tracking-widest text-warning text-center"
                style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
              >
                RETURN TO VAULT
              </div>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (done) {
    return <SessionComplete total={reviewed} streak={sessionStreak} onDone={() => router.push('/knowledge')} />;
  }

  if (!current) return null;

  const retColor = retentionColor(current.retentionScore);
  const remaining = total - currentIndex - 1;
  const nextConcepts = queue.slice(currentIndex + 1, currentIndex + 4);

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Secondary vault nav */}
      <VaultSecondaryNav />

      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-widest">// KNOWLEDGE VAULT</p>
          <h1 className="font-display text-2xl font-bold tracking-widest leading-none text-warning">
            DAILY REVIEW
          </h1>
          <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">// SPACED RECALL</p>
        </div>
        {sessionStreak > 0 && (
          <div className="flex flex-col items-end">
            <span className="font-display text-2xl font-bold text-warning leading-none">{sessionStreak}</span>
            <span className="text-[9px] text-text-muted uppercase tracking-widest">DAY STREAK</span>
          </div>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-2 mt-4">
        <span className="text-[10px] text-text-muted uppercase tracking-widest">
          REVIEWING {currentIndex + 1} / {total}
        </span>
        <span className="text-[9px] text-text-muted">+ NEAREST-FIRST</span>
      </div>
      <ProgressBar current={currentIndex + 1} total={total} />

      {/* Current concept card */}
      <div
        className="rounded-xl p-4 mt-4 mb-3"
        style={{ background: '#0f1623', border: '1px solid #1e293b' }}
      >
        {/* Tags row */}
        <div className="flex items-center gap-2 mb-3">
          {domain && (
            <span
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider"
              style={{ background: domain.color + '22', color: domain.color }}
            >
              ● {domain.name.toUpperCase()}
            </span>
          )}
          <span
            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider"
            style={{ background: retColor + '22', color: retColor }}
          >
            ● {current.retentionScore}% · {current.retentionScore === 0 ? 'NEW' : 'DUE'}
          </span>
        </div>

        {/* Concept title */}
        <h2 className="font-display text-2xl font-bold text-text leading-tight mb-3">
          {current.title}
        </h2>

        {/* Prompt */}
        <p className="text-[9px] text-text-muted uppercase tracking-widest mb-3">
          DO YOU RECALL THIS CONCEPT?
        </p>

        {/* Show/hide answer */}
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full py-3 rounded-lg text-[11px] uppercase tracking-widest font-bold text-text-muted active:scale-[0.98] transition-all"
            style={{ background: '#1a2236', border: '1px solid #1e293b' }}
          >
            SHOW ANSWER ▾
          </button>
        ) : (
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">// ANSWER</p>
            <div className="mb-3">
              <ArticleText text={current.summary} />
            </div>
            {current.keyTakeaways && current.keyTakeaways.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid #1e293b' }}>
                <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2">// KEY TAKEAWAYS</p>
                <ul className="space-y-2">
                  {current.keyTakeaways.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className="flex-shrink-0"
                        style={{ color: domain?.color ?? '#f59e0b', fontSize: 8, marginTop: 5, lineHeight: 1 }}
                      >
                        ◆
                      </span>
                      <span className="text-[12px] text-text leading-[1.65]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {current.personalNotes && (
              <div
                className="rounded-lg p-3 mb-3"
                style={{ background: '#131a25', border: '1px solid #1e293b' }}
              >
                <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">// PERSONAL NOTE</p>
                <p className="text-[11px] text-text-dim leading-relaxed">{current.personalNotes}</p>
              </div>
            )}
            {current.sourceTitle && (
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                  style={{ background: (domain?.color ?? '#64748b') + '22', color: domain?.color ?? '#64748b' }}
                >
                  {current.sourceType.toUpperCase()}
                </span>
                <span className="text-[10px] text-text-muted">· {current.sourceTitle}</span>
                {current.lastReviewedAt && (
                  <span className="text-[10px] text-text-muted ml-auto">
                    LAST · {Math.floor((Date.now() - current.lastReviewedAt) / 86400000)}D AGO
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rating buttons — only shown after answer revealed */}
      {revealed && (
        <div className="grid grid-cols-4 gap-1.5 mb-5">
          {RATINGS.map(r => (
            <button
              key={r.key}
              onClick={() => handleRate(r.key)}
              disabled={submitting}
              className="flex flex-col items-center py-3 rounded-xl active:scale-[0.95] transition-all disabled:opacity-50"
              style={{ background: r.bg, border: `1px solid ${r.color}` }}
            >
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: r.color }}>{r.label}</span>
              <span className="text-[10px] mt-0.5" style={{ color: r.color }}>
                {nextIntervalLabel(current, r.key)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Up next queue */}
      {nextConcepts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-text-muted uppercase tracking-widest">// UP NEXT IN QUEUE</p>
            <span className="text-[10px] text-text-muted">{remaining} LEFT</span>
          </div>
          <div className="space-y-1.5">
            {nextConcepts.map((nc, i) => {
              const ncDomain = domains.find(d => d.id === nc.primaryDomainId);
              const ncColor = retentionColor(nc.retentionScore);
              return (
                <div
                  key={nc.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: '#0f1623', border: '1px solid #1e293b' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted font-mono w-5">
                      {String(currentIndex + 2 + i).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-[11px] text-text font-bold">{nc.title}</p>
                      {ncDomain && (
                        <p className="text-[9px] uppercase tracking-widest" style={{ color: ncDomain.color }}>
                          {ncDomain.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full" style={{ background: ncColor }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
