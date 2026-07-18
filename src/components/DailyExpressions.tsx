'use client';

import { useEffect, useState, useCallback } from 'react';
import { getToday, getSettings, updateSettings } from '@/lib/db';
import { selectExpressionState } from '@/lib/logic/expressions';
import { EXPRESSION_CATEGORIES, OTHER_CATEGORY } from '@/lib/logic/expressionCategories';
import type { UserSettings, ExpressionCompletion } from '@/types';

/** The full Daily Expressions experience: today's expression, mark-read /
 *  already-known actions, optional extra reading, and history.
 *  Self-loading so it can be mounted standalone (its own route). */
export function DailyExpressions() {
  const today = getToday();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [showExprHistory, setShowExprHistory] = useState(false);
  const [showExtraReading, setShowExtraReading] = useState(false);
  // Knowledge Collection category filter: 'ALL' or a category key.
  const [collectionFilter, setCollectionFilter] = useState('ALL');

  const load = useCallback(async () => {
    setSettings(await getSettings());
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!settings) return null;

  const {
    enabled: exprEnabled,
    expressions: exprExpressions,
    completions: exprCompletions,
    currentIndex: exprCurrentIndex,
    currentExpression: exprCurrentExpression,
    todayRead: exprTodayRead,
  } = selectExpressionState(settings, today);

  // Display category (label + icon) for the idea currently being read.
  const currentCategory = exprCurrentExpression
    ? EXPRESSION_CATEGORIES.find(c => c.key === exprCurrentExpression.category) ?? OTHER_CATEGORY
    : null;

  const handleMarkExpression = async (status: 'read' | 'known' = 'read') => {
    if (!exprCurrentExpression) return;
    const completion: ExpressionCompletion = {
      index: exprCurrentIndex,        // legacy positional key, kept for back-compat
      ideaId: exprCurrentExpression.id, // stable attribution key
      date: today,
      completedAt: Date.now(),
      status,
    };
    const updated = [...exprCompletions, completion];
    await updateSettings({ expressionCompletions: updated });
    setSettings({ ...settings, expressionCompletions: updated });
    // No INT log update — expressions are purely optional enrichment.
  };

  if (!exprEnabled) {
    return (
      <p className="text-text-muted text-xs text-center py-4">
        Daily Ideas is disabled. Enable it in Config → Daily Ideas.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span
            className="font-mono-hud text-[11px] font-semibold tracking-[0.18em] uppercase"
            style={{ color: 'var(--color-stat-int)' }}
          >
            // TODAY&apos;S IDEA
          </span>
          {exprCompletions.length > 0 && (
            <button
              onClick={() => setShowExprHistory(true)}
              className="font-mono-hud text-[9px] tracking-[0.14em] uppercase transition-colors hover:brightness-125"
              style={{ color: 'var(--color-stat-int)', opacity: 0.7 }}
            >
              KNOWLEDGE COLLECTION ({exprCompletions.length})
            </button>
          )}
        </div>

        <div
          className="frame-cut p-4"
          style={{ borderColor: 'rgba(96,165,250,0.20)', background: 'rgba(96,165,250,0.02)' }}
        >
          {exprExpressions.length === 0 ? (
            <p className="text-text-muted text-xs text-center py-2">
              No ideas yet. Add your idea bank in Config → Daily Ideas.
            </p>
          ) : !exprCurrentExpression && !exprTodayRead ? (
            <div className="text-center py-2 space-y-1">
              <p className="font-display font-semibold text-sm" style={{ color: 'var(--color-stat-int)' }}>
                All {exprExpressions.length} ideas explored
              </p>
              <p className="text-text-muted text-xs">Add more ideas in Config to continue.</p>
            </div>
          ) : exprTodayRead && !showExtraReading ? (
            /* Expression read today — offer optional extra reading */
            <div className="space-y-3 text-center py-1">
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono-hud text-[10px] font-semibold" style={{ color: 'rgba(34,197,94,0.85)' }}>✓</span>
                <span className="font-mono-hud text-[9px] tracking-[0.14em] uppercase text-text-muted">
                  Idea saved for today
                </span>
              </div>
              {exprCurrentExpression && (
                <button
                  onClick={() => setShowExtraReading(true)}
                  className="w-full py-2 font-mono-hud text-[10px] tracking-[0.16em] uppercase transition-colors hover:brightness-125"
                  style={{
                    background: 'rgba(96,165,250,0.07)',
                    border: '1px dashed rgba(96,165,250,0.35)',
                    color: 'var(--color-stat-int)',
                  }}
                >
                  Explore Another Idea
                </button>
              )}
            </div>
          ) : !exprCurrentExpression ? (
            /* All done (reached during extra reading) */
            <div className="text-center py-2 space-y-1">
              <p className="font-display font-semibold text-sm" style={{ color: 'var(--color-stat-int)' }}>
                All {exprExpressions.length} ideas explored
              </p>
              <p className="text-text-muted text-xs">Add more ideas in Config to continue.</p>
            </div>
          ) : (
            /* Active — first read OR extra reading */
            <>
              <div className="flex items-center justify-between mb-3">
                {showExtraReading ? (
                  <>
                    <span
                      className="font-mono-hud text-[9px] tracking-[0.16em] font-semibold uppercase"
                      style={{ color: 'var(--color-stat-int)', opacity: 0.7 }}
                    >
                      // OPTIONAL LEARNING
                    </span>
                    <span className="font-mono-hud text-[9px] text-text-muted tracking-[0.10em]">
                      {exprCurrentIndex + 1} / {exprExpressions.length}
                    </span>
                  </>
                ) : (
                  <span className="font-mono-hud text-[9px] tracking-[0.14em] text-text-muted uppercase">
                    Idea {exprCurrentIndex + 1} / {exprExpressions.length}
                  </span>
                )}
              </div>

              {/* Title area: title · category · optional topic */}
              <div className="space-y-1 mb-4">
                <p className="font-display font-semibold text-base text-text leading-snug">
                  {exprCurrentExpression.title}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {currentCategory && (
                    <span
                      className="font-mono-hud text-[10px] tracking-[0.12em] uppercase"
                      style={{ color: 'var(--color-stat-int)', opacity: 0.75 }}
                    >
                      {currentCategory.icon} {currentCategory.label}
                    </span>
                  )}
                  {exprCurrentExpression.topic && (
                    <span className="font-mono-hud text-[10px] tracking-[0.10em] text-text-muted">
                      · {exprCurrentExpression.topic}
                    </span>
                  )}
                </div>
              </div>

              {/* Structured sections — each hidden when the field is absent.
                  MEANING is always present (required); the rest are optional. */}
              <div className="space-y-3 mb-4">
                {[
                  { label: 'Meaning', value: exprCurrentExpression.meaning },
                  { label: 'Context', value: exprCurrentExpression.context },
                  { label: 'Example', value: exprCurrentExpression.example },
                  { label: 'Takeaway', value: exprCurrentExpression.takeaway },
                ]
                  .filter(section => section.value)
                  .map(section => (
                    <div key={section.label}>
                      <p
                        className="font-mono-hud text-[9px] tracking-[0.16em] uppercase mb-1"
                        style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
                      >
                        {section.label}
                      </p>
                      <p className="text-text-muted text-sm leading-relaxed">
                        {section.value}
                      </p>
                    </div>
                  ))}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleMarkExpression('read')}
                  className="w-full py-2.5 font-display font-semibold text-sm tracking-[0.14em] uppercase transition-all"
                  style={{
                    background: 'rgba(96,165,250,0.10)',
                    border: '1px solid rgba(96,165,250,0.4)',
                    color: 'var(--color-stat-int)',
                    clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                  }}
                >
                  Learned
                </button>
                <button
                  onClick={() => handleMarkExpression('known')}
                  className="w-full text-center font-mono-hud text-[10px] tracking-[0.14em] uppercase transition-colors hover:text-text-dim"
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', opacity: 0.55 }}
                >
                  Already Knew This
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Knowledge Collection modal (internally still the expression history) */}
      {showExprHistory && (() => {
        // Resolve each completion to its idea by STABLE id (reorder/insert-safe).
        // Unresolvable ids (removed ideas, or legacy records without an ideaId)
        // fall through to the removed-item state and the 'other' category bucket.
        const ideaById = new Map(exprExpressions.map(idea => [idea.id, idea]));
        const ideaFor = (c: ExpressionCompletion) => (c.ideaId ? ideaById.get(c.ideaId) : undefined);

        // Chronological order by when it was completed (stable under bank reorder).
        const sorted = [...exprCompletions].sort((a, b) => a.completedAt - b.completedAt);

        // Summary — encountered always equals learned + alreadyKnew.
        const knownCount = exprCompletions.filter(c => c.status === 'known').length;
        const learnedCount = exprCompletions.length - knownCount; // 'read' + legacy undefined
        const encounteredCount = exprCompletions.length;

        // Category totals — read from each resolved idea's normalized `category`
        // key (explicit structured category, else legacy source inference, else
        // 'other'). Counted over encountered ideas; only categories with ≥1 idea
        // are shown, sorted by count desc (Other last).
        const categoryOf = (c: ExpressionCompletion) => ideaFor(c)?.category ?? OTHER_CATEGORY.key;
        const catCounts = new Map<string, number>();
        for (const c of exprCompletions) {
          const key = categoryOf(c);
          catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
        }
        const categoryTotals = [...catCounts.entries()]
          .map(([key, count]) => ({
            cat: EXPRESSION_CATEGORIES.find(c => c.key === key) ?? OTHER_CATEGORY,
            count,
          }))
          .sort((a, b) =>
            a.cat.key === 'other' ? 1 : b.cat.key === 'other' ? -1 : b.count - a.count,
          );

        // Filtered chronological list.
        const filtered = collectionFilter === 'ALL'
          ? sorted
          : sorted.filter(c => categoryOf(c) === collectionFilter);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
            style={{
              background: 'rgba(2, 4, 10, 0.78)',
              backdropFilter: 'blur(6px)',
              paddingTop: 'max(1rem, env(safe-area-inset-top))',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
            onClick={() => setShowExprHistory(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="frame-bracketed w-full max-w-sm flex flex-col"
              style={{ maxHeight: '88%' }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="frame-cut flex flex-col"
                style={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  border: '1px solid rgba(96,165,250,0.35)',
                  borderLeft: '3px solid var(--color-stat-int)',
                  boxShadow: 'inset 0 0 8px rgba(96,165,250,0.06), 0 0 18px rgba(96,165,250,0.18)',
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: '1px dashed var(--color-border)' }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono-hud text-[10px] tracking-[0.18em] font-semibold uppercase"
                      style={{ color: 'var(--color-stat-int)', textShadow: '0 0 6px rgba(96,165,250,0.4)' }}
                    >
                      KNOWLEDGE COLLECTION
                    </span>
                  </div>
                  <button
                    onClick={() => setShowExprHistory(false)}
                    className="text-text-muted hover:text-text font-mono-hud text-base leading-none px-1.5"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                {/* Scrollable body: summary → categories → filters → list */}
                <div className="overflow-y-auto px-4 py-3">
                  {/* Summary — Ideas Encountered = Learned + Already Knew */}
                  <div className="flex gap-2 mb-4">
                    {[
                      { label: 'Ideas Encountered', value: encounteredCount, accent: true },
                      { label: 'Learned', value: learnedCount, accent: false },
                      { label: 'Already Knew', value: knownCount, accent: false },
                    ].map(stat => (
                      <div
                        key={stat.label}
                        className="frame-cut flex-1 px-2 py-2.5 text-center"
                        style={{ borderColor: 'rgba(96,165,250,0.20)', background: 'rgba(96,165,250,0.03)' }}
                      >
                        <div
                          className="font-display font-bold text-xl leading-none"
                          style={{ color: stat.accent ? 'var(--color-stat-int)' : 'var(--color-text)' }}
                        >
                          {stat.value}
                        </div>
                        <div className="font-mono-hud text-[8px] tracking-[0.10em] uppercase text-text-muted mt-1.5 leading-tight">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Category totals */}
                  {categoryTotals.length > 0 && (
                    <div className="mb-4 space-y-1.5">
                      {categoryTotals.map(({ cat, count }) => (
                        <div key={cat.key} className="flex items-center justify-between">
                          <span className="text-xs text-text-dim">
                            <span className="mr-1.5">{cat.icon}</span>
                            {cat.label}
                          </span>
                          <span className="font-mono-hud text-[11px] tabular-nums" style={{ color: 'var(--color-stat-int)' }}>
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Category filters */}
                  <div className="flex flex-wrap gap-1.5 mb-4 pb-3" style={{ borderBottom: '1px dashed var(--color-border)' }}>
                    {['ALL', ...categoryTotals.map(c => c.cat.key)].map(key => {
                      const isActive = collectionFilter === key;
                      const label = key === 'ALL'
                        ? 'ALL'
                        : (categoryTotals.find(c => c.cat.key === key)?.cat.label ?? key);
                      return (
                        <button
                          key={key}
                          onClick={() => setCollectionFilter(key)}
                          className="font-mono-hud text-[9px] tracking-[0.10em] uppercase px-2 py-1 transition-colors"
                          style={{
                            border: `1px solid ${isActive ? 'var(--color-stat-int)' : 'var(--color-border)'}`,
                            background: isActive ? 'rgba(96,165,250,0.12)' : 'transparent',
                            color: isActive ? 'var(--color-stat-int)' : 'var(--color-text-muted)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* List */}
                  <div className="space-y-3">
                  {filtered.length === 0 && (
                    <p className="text-text-muted text-xs text-center py-4">
                      No ideas in this category yet.
                    </p>
                  )}
                  {filtered.map((completion, i) => {
                    const expr = ideaFor(completion);
                    return (
                      <div
                        key={`${completion.ideaId ?? 'legacy'}-${completion.completedAt}-${i}`}
                        className="space-y-1 pb-3"
                        style={{ borderBottom: '1px dashed var(--color-border)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono-hud text-[9px] tracking-[0.14em] text-text-muted uppercase">
                            #{i + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono-hud text-[8px] tracking-[0.10em] uppercase"
                              style={{
                                color: completion.status === 'known' ? 'rgba(96,165,250,0.6)' : 'rgba(34,197,94,0.6)',
                              }}
                            >
                              {completion.status === 'known' ? '● knew' : '● learned'}
                            </span>
                            <span className="font-mono-hud text-[9px] tracking-[0.10em] text-text-muted">
                              {completion.date}
                            </span>
                          </div>
                        </div>
                        {expr ? (
                          <>
                            <p className="font-display text-sm text-text leading-snug">
                              {expr.title}
                            </p>
                            {(expr.source ?? expr.topic) && (
                              <p
                                className="font-mono-hud text-[9px] tracking-[0.10em] uppercase"
                                style={{ color: 'var(--color-stat-int)', opacity: 0.65 }}
                              >
                                {expr.source ?? expr.topic}
                              </p>
                            )}
                            <p className="text-text-muted text-xs leading-relaxed">
                              {expr.meaning}
                            </p>
                          </>
                        ) : (
                          <p className="text-text-muted text-xs italic">Idea removed from bank</p>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
              <span className="frame-bracket-bottom" aria-hidden />
            </div>
          </div>
        );
      })()}
    </>
  );
}
