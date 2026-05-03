'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSettings, updateSettings } from '@/lib/db';
import type { ActiveBook, FinishedBook } from '@/types';

type AnyBook = (ActiveBook | FinishedBook) & { source: 'active' | 'finished' };
type SectionKey = 'keyIdeas' | 'applyToLife' | 'notes';

const SECTION_META: Record<SectionKey, { label: string; addLabel: string; accent: string; accentRgb: string }> = {
  keyIdeas: { label: 'KEY IDEAS', addLabel: 'ADD KEY IDEA', accent: 'var(--color-stat-per)', accentRgb: '167,139,250' },
  applyToLife: { label: 'APPLY TO MY LIFE', addLabel: 'ADD ACTION', accent: 'var(--color-stat-agi)', accentRgb: '34,197,94' },
  notes: { label: 'NOTES', addLabel: 'ADD NOTE', accent: 'var(--color-stat-int)', accentRgb: '96,165,250' },
};

function splitItems(text: string | undefined): string[] {
  if (!text) return [];
  return text.split(/\n\n+/).map(s => s.trim()).filter(s => s.length > 0);
}

function joinItems(items: string[]): string {
  return items.join('\n\n');
}

function formatStarted(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase();
}

function formatLastRead(ts?: number): string {
  if (!ts) return '—';
  const now = Date.now();
  const diffDays = Math.floor((now - ts) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'TODAY';
  if (diffDays === 1) return '1D AGO';
  if (diffDays < 30) return `${diffDays}D AGO`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase();
}

function BookSpine({ width = 60, height = 84 }: { width?: number; height?: number }) {
  return (
    <div
      className="cut-tile relative flex-shrink-0"
      style={{
        width, height,
        background: 'linear-gradient(180deg, rgba(167,139,250,0.30) 0%, rgba(167,139,250,0.08) 100%)',
        border: '1px solid var(--color-stat-per)',
        boxShadow: '0 0 6px rgba(167,139,250,0.25)',
      }}
    >
      <div className="absolute left-1.5 right-1.5 h-px" style={{ top: 10, background: 'var(--color-stat-per)', opacity: 0.4 }} />
      <div className="absolute left-1.5 right-1.5 h-px" style={{ bottom: 10, background: 'var(--color-stat-per)', opacity: 0.4 }} />
    </div>
  );
}

export default function BookDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [book, setBook] = useState<AnyBook | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [keyIdeas, setKeyIdeas] = useState<string[]>([]);
  const [applyToLife, setApplyToLife] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  // Per-section in-progress add/edit state
  const [adding, setAdding] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ section: SectionKey; index: number } | null>(null);
  const [editText, setEditText] = useState('');

  // Inline edit progress (current page)
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');

  // ⋯ menu
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await getSettings();
    const active = (s.activeBooks ?? []).find(b => b.id === id);
    if (active) {
      const b: AnyBook = { ...active, source: 'active' };
      setBook(b);
      setKeyIdeas(splitItems(active.keyIdeas));
      setApplyToLife(splitItems(active.applyToLife));
      setNotes(splitItems(active.notes));
      setLoaded(true);
      return;
    }
    const finished = (s.finishedBooks ?? []).find(b => b.id === id);
    if (finished) {
      const b: AnyBook = { ...finished, source: 'finished' };
      setBook(b);
      setKeyIdeas(splitItems(finished.keyIdeas));
      setApplyToLife(splitItems(finished.applyToLife));
      setNotes(splitItems(finished.notes));
    }
    setLoaded(true);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (
    nextKeyIdeas: string[],
    nextApply: string[],
    nextNotes: string[],
    extras: Partial<ActiveBook & FinishedBook> = {},
  ) => {
    if (!book) return;
    const s = await getSettings();
    const patch: Partial<ActiveBook & FinishedBook> = {
      keyIdeas: joinItems(nextKeyIdeas),
      applyToLife: joinItems(nextApply),
      notes: joinItems(nextNotes),
      ...extras,
    };
    if (book.source === 'active') {
      const next = (s.activeBooks ?? []).map(b => b.id === book.id ? { ...b, ...patch } : b);
      await updateSettings({ activeBooks: next });
    } else {
      const next = (s.finishedBooks ?? []).map(b => b.id === book.id ? { ...b, ...patch } : b);
      await updateSettings({ finishedBooks: next });
    }
    await load();
  }, [book, load]);

  const itemsFor = (key: SectionKey): string[] =>
    key === 'keyIdeas' ? keyIdeas : key === 'applyToLife' ? applyToLife : notes;

  const setItemsFor = (key: SectionKey, next: string[]) => {
    if (key === 'keyIdeas') setKeyIdeas(next);
    else if (key === 'applyToLife') setApplyToLife(next);
    else setNotes(next);
  };

  const addItem = async (key: SectionKey) => {
    const text = draft.trim();
    if (!text) {
      setAdding(null);
      setDraft('');
      return;
    }
    const next = [...itemsFor(key), text];
    setItemsFor(key, next);
    const nextK = key === 'keyIdeas' ? next : keyIdeas;
    const nextA = key === 'applyToLife' ? next : applyToLife;
    const nextN = key === 'notes' ? next : notes;
    setAdding(null);
    setDraft('');
    await persist(nextK, nextA, nextN);
  };

  const saveItemEdit = async () => {
    if (!editing) return;
    const text = editText.trim();
    const cur = itemsFor(editing.section);
    let next: string[];
    if (!text) {
      next = cur.filter((_, i) => i !== editing.index);
    } else {
      next = cur.map((it, i) => (i === editing.index ? text : it));
    }
    setItemsFor(editing.section, next);
    const nextK = editing.section === 'keyIdeas' ? next : keyIdeas;
    const nextA = editing.section === 'applyToLife' ? next : applyToLife;
    const nextN = editing.section === 'notes' ? next : notes;
    setEditing(null);
    setEditText('');
    await persist(nextK, nextA, nextN);
  };

  const deleteItemEdit = async () => {
    if (!editing) return;
    const cur = itemsFor(editing.section);
    const next = cur.filter((_, i) => i !== editing.index);
    setItemsFor(editing.section, next);
    const nextK = editing.section === 'keyIdeas' ? next : keyIdeas;
    const nextA = editing.section === 'applyToLife' ? next : applyToLife;
    const nextN = editing.section === 'notes' ? next : notes;
    setEditing(null);
    setEditText('');
    await persist(nextK, nextA, nextN);
  };

  const savePage = async () => {
    if (!book || book.source !== 'active') {
      setEditingPage(false);
      return;
    }
    const v = parseInt(pageInput, 10);
    if (!Number.isFinite(v) || v < 0) {
      setEditingPage(false);
      return;
    }
    const totalPages = book.totalPages;
    const clamped = totalPages ? Math.min(v, totalPages) : v;
    await persist(keyIdeas, applyToLife, notes, { currentPage: clamped });
    setEditingPage(false);
  };

  const markFinished = async () => {
    if (!book || book.source !== 'active') return;
    const s = await getSettings();
    const active = s.activeBooks ?? [];
    const finished = s.finishedBooks ?? [];
    const matched = active.find(b => b.id === book.id);
    if (!matched) return;
    const done: FinishedBook = {
      id: matched.id,
      title: matched.title,
      author: matched.author,
      totalPages: matched.totalPages,
      finishedAt: Date.now(),
      keyIdeas: matched.keyIdeas,
      applyToLife: matched.applyToLife,
      notes: matched.notes,
    };
    await updateSettings({
      activeBooks: active.filter(b => b.id !== matched.id),
      finishedBooks: [done, ...finished],
    });
    router.push('/books');
  };

  const reactivateBook = async () => {
    if (!book || book.source !== 'finished') return;
    const s = await getSettings();
    const active = s.activeBooks ?? [];
    const finished = s.finishedBooks ?? [];
    const matched = finished.find(b => b.id === book.id);
    if (!matched) return;
    const reborn: ActiveBook = {
      id: matched.id,
      title: matched.title,
      author: matched.author,
      totalPages: matched.totalPages,
      currentPage: 0,
      startedAt: Date.now(),
      keyIdeas: matched.keyIdeas,
      applyToLife: matched.applyToLife,
      notes: matched.notes,
    };
    await updateSettings({
      finishedBooks: finished.filter(b => b.id !== matched.id),
      activeBooks: [reborn, ...active],
    });
    router.push('/books');
  };

  const removeBook = async () => {
    if (!book) return;
    const s = await getSettings();
    if (book.source === 'active') {
      await updateSettings({ activeBooks: (s.activeBooks ?? []).filter(b => b.id !== book.id) });
    } else {
      await updateSettings({ finishedBooks: (s.finishedBooks ?? []).filter(b => b.id !== book.id) });
    }
    router.push('/books');
  };

  if (!loaded) return <main className="max-w-lg mx-auto px-4 pt-4 pb-4" />;

  if (!book) {
    return (
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4">
        <p className="text-text-muted text-sm">Book not found.</p>
      </main>
    );
  }

  const pct = (book.source === 'active' && book.totalPages && book.totalPages > 0)
    ? Math.min(100, Math.round((((book as ActiveBook).currentPage ?? 0) / book.totalPages) * 100))
    : null;

  return (
    <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-text-muted hover:text-text transition-colors"
          aria-label="Back to library"
        >
          <span className="text-lg">←</span>
          <span className="font-mono-hud text-[10px] tracking-[0.18em] uppercase">
            Library / {book.source === 'active' ? 'Reading' : 'Completed'}
          </span>
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="cut-tile w-8 h-8 grid place-items-center font-mono-hud text-base leading-none"
            style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
            aria-label="Book options"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-10 cut-tile py-1 min-w-[140px]"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              {book.source === 'finished' && (
                <button
                  onClick={() => { setMenuOpen(false); reactivateBook(); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-text hover:bg-glow/5"
                >
                  Reactivate
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); removeBook(); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Book hero */}
      <div className="frame-bracketed">
        <div
          className="frame-cut p-3.5"
          style={{ filter: 'drop-shadow(0 0 0 transparent)' }}
        >
          <div className="grid grid-cols-[auto_1fr] gap-3.5 items-center">
            <BookSpine width={60} height={84} />
            <div className="min-w-0">
              <div className="font-display text-lg font-bold text-text leading-tight mb-1 truncate">{book.title}</div>
              {book.author && (
                <div className="text-[10px] tracking-[0.16em] uppercase text-text-muted mb-2 truncate">{book.author}</div>
              )}
              {book.source === 'active' && pct !== null && !editingPage && (
                <button
                  onClick={() => { setEditingPage(true); setPageInput(String((book as ActiveBook).currentPage ?? 0)); }}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 relative" style={{ background: 'var(--color-border)' }}>
                      <div
                        className="absolute left-0 top-0 bottom-0"
                        style={{ width: `${pct}%`, background: 'var(--color-stat-per)', boxShadow: '0 0 6px rgba(167,139,250,0.5)' }}
                      />
                    </div>
                    <span className="font-mono-hud text-[11px] font-bold" style={{ color: 'var(--color-stat-per)' }}>{pct}%</span>
                  </div>
                </button>
              )}
              {book.source === 'active' && editingPage && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={pageInput}
                    onChange={e => setPageInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePage(); if (e.key === 'Escape') setEditingPage(false); }}
                    placeholder="Current page"
                    min={0}
                    max={(book as ActiveBook).totalPages}
                    autoFocus
                    className="flex-1 bg-surface-light border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-glow"
                  />
                  <button
                    onClick={savePage}
                    className="font-mono-hud text-[10px] px-2 py-1 rounded transition-colors"
                    style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid var(--color-stat-per)', color: 'var(--color-stat-per)' }}
                  >
                    SAVE
                  </button>
                  <button
                    onClick={() => setEditingPage(false)}
                    className="font-mono-hud text-[10px] px-2 py-1 rounded border border-border text-text-muted"
                  >
                    ✕
                  </button>
                </div>
              )}
              {book.source === 'active' && pct === null && !editingPage && (
                <button
                  onClick={() => { setEditingPage(true); setPageInput(String((book as ActiveBook).currentPage ?? 0)); }}
                  className="font-mono-hud text-[10px] tracking-[0.14em] uppercase text-text-muted hover:text-text"
                >
                  + Set current page
                </button>
              )}
              {book.source === 'active' && (book as ActiveBook).startedAt && (
                <div className="text-[9px] tracking-[0.14em] uppercase text-text-dim mt-1.5">
                  Started {formatStarted((book as ActiveBook).startedAt)} · Last read {formatLastRead((book as ActiveBook).startedAt)}
                </div>
              )}
              {book.source === 'finished' && (
                <div className="text-[9px] tracking-[0.14em] uppercase mt-1.5" style={{ color: 'var(--color-stat-agi)' }}>
                  ✓ Finished {new Date((book as FinishedBook).finishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                </div>
              )}
            </div>
          </div>
        </div>
        <span className="frame-bracket-bottom" aria-hidden />
      </div>

      {/* Note sections */}
      {(['keyIdeas', 'applyToLife', 'notes'] as SectionKey[]).map(section => {
        const meta = SECTION_META[section];
        const items = itemsFor(section);
        return (
          <div key={section} className="space-y-1.5 mt-3">
            <div className="flex items-center justify-between">
              <span
                className="font-mono-hud text-[10px] font-semibold tracking-[0.16em] uppercase"
                style={{ color: meta.accent }}
              >
                // {meta.label}
              </span>
              <span className="font-mono-hud text-[9px] text-text-muted">{items.length}</span>
            </div>

            {items.map((it, i) => {
              const isEditing = editing?.section === section && editing.index === i;
              if (isEditing) {
                return (
                  <div key={i} className="cut-tile p-3 space-y-2"
                       style={{ background: 'var(--color-surface)', border: `1px solid ${meta.accent}` }}>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full bg-surface-light border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-glow leading-relaxed resize-y"
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={deleteItemEdit}
                        className="font-mono-hud text-[10px] tracking-[0.14em] px-2 py-1 rounded border border-danger/40 text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        DELETE
                      </button>
                      <button
                        onClick={() => { setEditing(null); setEditText(''); }}
                        className="font-mono-hud text-[10px] tracking-[0.14em] px-2 py-1 rounded border border-border text-text-muted hover:text-text transition-colors"
                      >
                        CANCEL
                      </button>
                      <button
                        onClick={saveItemEdit}
                        className="font-mono-hud text-[10px] tracking-[0.14em] px-2 py-1 rounded transition-colors"
                        style={{ background: `rgba(${meta.accentRgb},0.15)`, border: `1px solid ${meta.accent}`, color: meta.accent }}
                      >
                        SAVE
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => { setEditing({ section, index: i }); setEditText(it); }}
                  className="cut-tile relative w-full text-left px-3 py-2.5 hover:brightness-110 transition-colors"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <span
                    className="absolute top-2.5 left-0 w-0.5"
                    style={{ height: 14, background: meta.accent, boxShadow: `0 0 4px ${meta.accent}` }}
                  />
                  <p className="text-sm text-text leading-relaxed pl-2 whitespace-pre-line">{it}</p>
                </button>
              );
            })}

            {/* Add row */}
            {adding === section ? (
              <div className="cut-tile p-3 space-y-2"
                   style={{ background: 'var(--color-surface)', border: `1px dashed ${meta.accent}` }}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={`Type a ${section === 'keyIdeas' ? 'key idea' : section === 'applyToLife' ? 'concrete action' : 'note'}...`}
                  rows={3}
                  autoFocus
                  className="w-full bg-surface-light border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-glow leading-relaxed resize-y"
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => { setAdding(null); setDraft(''); }}
                    className="font-mono-hud text-[10px] tracking-[0.14em] px-2 py-1 rounded border border-border text-text-muted hover:text-text transition-colors"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={() => addItem(section)}
                    disabled={!draft.trim()}
                    className="font-mono-hud text-[10px] tracking-[0.14em] px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: `rgba(${meta.accentRgb},0.15)`, border: `1px solid ${meta.accent}`, color: meta.accent }}
                  >
                    SAVE
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAdding(section); setDraft(''); }}
                className="cut-tile w-full text-left px-3 py-2.5 font-display font-semibold text-xs tracking-[0.12em] transition-colors hover:brightness-125"
                style={{
                  background: 'transparent',
                  border: `1px dashed rgba(${meta.accentRgb},0.45)`,
                  color: meta.accent,
                }}
              >
                + {meta.addLabel}
              </button>
            )}
          </div>
        );
      })}

      {/* Mark Finished (active books only) */}
      {book.source === 'active' && (
        <button
          onClick={markFinished}
          className="cut-tile w-full py-3 mt-2 font-display font-bold text-xs tracking-[0.18em] transition-all hover:brightness-125"
          style={{
            background: 'rgba(167,139,250,0.10)',
            border: '1px solid var(--color-stat-per)',
            color: 'var(--color-stat-per)',
          }}
        >
          ✓ MARK AS FINISHED
        </button>
      )}
    </main>
  );
}
