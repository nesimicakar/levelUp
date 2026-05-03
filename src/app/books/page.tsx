'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSettings, updateSettings } from '@/lib/db';
import type { ActiveBook, FinishedBook } from '@/types';

function genId(): string {
  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFinished(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }).toUpperCase();
}

function countNoteItems(book: ActiveBook | FinishedBook): number {
  const fields = [book.keyIdeas, book.applyToLife, book.notes];
  return fields.reduce((sum, f) => sum + (f ? f.split(/\n\n+/).filter(s => s.trim().length > 0).length : 0), 0);
}

// Book spine SVG used in list rows
function BookSpine({ width = 32, height = 46, dim = false }: { width?: number; height?: number; dim?: boolean }) {
  const accent = dim ? 'var(--color-text-muted)' : 'var(--color-stat-per)';
  const grad = dim
    ? 'linear-gradient(180deg, rgba(120,120,140,0.18) 0%, rgba(120,120,140,0.04) 100%)'
    : 'linear-gradient(180deg, rgba(167,139,250,0.30) 0%, rgba(167,139,250,0.08) 100%)';
  return (
    <div
      className="cut-tile relative flex-shrink-0"
      style={{
        width, height,
        background: grad,
        border: `1px solid ${accent}`,
        boxShadow: dim ? 'none' : '0 0 6px rgba(167,139,250,0.25)',
      }}
    >
      <div className="absolute left-1 right-1 h-px" style={{ top: 7, background: accent, opacity: 0.4 }} />
      <div className="absolute left-1 right-1 h-px" style={{ bottom: 7, background: accent, opacity: 0.4 }} />
    </div>
  );
}

export default function BooksPage() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveBook[]>([]);
  const [finished, setFinished] = useState<FinishedBook[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newTotalPages, setNewTotalPages] = useState('');

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setActive(s.activeBooks ?? []);
      setFinished(s.finishedBooks ?? []);
      setLoaded(true);
    })();
  }, []);

  async function persist(nextActive: ActiveBook[], nextFinished: FinishedBook[]) {
    setActive(nextActive);
    setFinished(nextFinished);
    await updateSettings({ activeBooks: nextActive, finishedBooks: nextFinished });
  }

  async function addBook() {
    const title = newTitle.trim();
    if (!title) return;
    const totalPages = newTotalPages.trim() ? parseInt(newTotalPages, 10) : undefined;
    const book: ActiveBook = {
      id: genId(),
      title,
      author: newAuthor.trim() || undefined,
      totalPages: Number.isFinite(totalPages) && totalPages! > 0 ? totalPages : undefined,
      currentPage: 0,
      startedAt: Date.now(),
    };
    await persist([...active, book], finished);
    setNewTitle('');
    setNewAuthor('');
    setNewTotalPages('');
    setShowAdd(false);
  }

  if (!loaded) {
    return (
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4" />
    );
  }

  // Sort active by most recently started/touched (recent first)
  const sortedActive = [...active].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const sortedFinished = [...finished].sort((a, b) => b.finishedAt - a.finishedAt);

  return (
    <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
      {/* Diegetic header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1
              className="font-display text-xl font-bold leading-none"
              style={{ color: 'var(--color-stat-per)', textShadow: '0 0 10px rgba(167,139,250,0.5)' }}
            >
              LIBRARY
            </h1>
            <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">// Personal Archive</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="cut-tile w-9 h-9 grid place-items-center font-mono-hud text-lg font-bold leading-none transition-colors hover:brightness-125"
          style={{
            background: 'rgba(167,139,250,0.10)',
            border: '1px solid var(--color-stat-per)',
            color: 'var(--color-stat-per)',
          }}
          aria-label="Add book"
        >
          +
        </button>
      </div>

      {/* READING section */}
      <div
        className="flex items-center justify-between pb-1.5"
        style={{ borderBottom: '1px solid rgba(167,139,250,0.45)' }}
      >
        <span
          className="text-[11px] tracking-[0.18em] uppercase font-mono-hud font-semibold"
          style={{ color: 'var(--color-stat-per)', textShadow: '0 0 8px rgba(167,139,250,0.5)' }}
        >
          // READING
        </span>
        <span className="font-mono-hud text-[10px] font-bold" style={{ color: 'var(--color-stat-per)' }}>
          {sortedActive.length}
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="frame-cut p-3 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Title (required)"
            className="w-full bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
            autoFocus
          />
          <input
            type="text"
            value={newAuthor}
            onChange={e => setNewAuthor(e.target.value)}
            placeholder="Author (optional)"
            className="w-full bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
          />
          <input
            type="number"
            inputMode="numeric"
            value={newTotalPages}
            onChange={e => setNewTotalPages(e.target.value)}
            placeholder="Total pages (optional)"
            min={1}
            className="w-full bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
          />
          <div className="flex gap-2">
            <button
              onClick={addBook}
              disabled={!newTitle.trim()}
              className="flex-1 px-3 py-2 rounded font-mono-hud text-[11px] font-semibold tracking-[0.16em] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{
                background: 'rgba(167,139,250,0.15)',
                border: '1px solid var(--color-stat-per)',
                color: 'var(--color-stat-per)',
              }}
            >
              ADD
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewTitle(''); setNewAuthor(''); setNewTotalPages(''); }}
              className="flex-1 px-3 py-2 rounded border border-border text-text-muted font-mono-hud text-[11px] tracking-[0.16em] hover:text-text transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Reading rows */}
      {sortedActive.map(book => {
        const pct = book.totalPages && book.totalPages > 0
          ? Math.min(100, Math.round(((book.currentPage ?? 0) / book.totalPages) * 100))
          : null;
        return (
          <Link
            key={book.id}
            href={`/books/${book.id}`}
            className="cut-tile grid items-center gap-3 px-3 py-3 hover:brightness-110 transition-colors"
            style={{
              gridTemplateColumns: 'auto 1fr',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <BookSpine width={32} height={46} />
            <div className="min-w-0">
              <div className="font-display font-semibold text-sm text-text truncate">{book.title}</div>
              {book.author && (
                <div className="text-[10px] tracking-[0.14em] uppercase text-text-muted mt-0.5 truncate">{book.author}</div>
              )}
              {pct !== null && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-0.5 relative" style={{ background: 'var(--color-border)' }}>
                    <div
                      className="absolute left-0 top-0 bottom-0"
                      style={{ width: `${pct}%`, background: 'var(--color-stat-per)', boxShadow: '0 0 4px rgba(167,139,250,0.5)' }}
                    />
                  </div>
                  <span className="font-mono-hud text-[9px] min-w-[2.5ch] text-right" style={{ color: 'var(--color-stat-per)' }}>{pct}%</span>
                </div>
              )}
            </div>
          </Link>
        );
      })}

      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="cut-tile w-full py-2.5 font-display font-semibold text-xs tracking-[0.16em] transition-colors"
          style={{
            background: 'transparent',
            border: '1px dashed rgba(167,139,250,0.45)',
            color: 'var(--color-stat-per)',
          }}
        >
          + ADD A BOOK
        </button>
      )}

      {/* COMPLETED section */}
      {sortedFinished.length > 0 && (
        <>
          <div
            className="flex items-center justify-between pb-1.5 mt-5"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span className="text-[11px] tracking-[0.18em] uppercase font-mono-hud font-semibold text-text-muted">
              // COMPLETED
            </span>
            <span className="font-mono-hud text-[10px] font-bold text-text-muted">
              {sortedFinished.length}
            </span>
          </div>

          <div style={{ opacity: 0.85 }} className="space-y-1.5">
            {sortedFinished.map(book => {
              const noteCount = countNoteItems(book);
              return (
                <Link
                  key={book.id}
                  href={`/books/${book.id}`}
                  className="cut-tile grid items-center gap-3 px-3 py-2.5 hover:brightness-110 transition-colors"
                  style={{
                    gridTemplateColumns: 'auto 1fr auto',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <BookSpine width={26} height={36} dim />
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-[13px] text-text truncate">{book.title}</div>
                    {book.author && (
                      <div className="text-[10px] tracking-[0.14em] uppercase text-text-muted mt-0.5 truncate">{book.author}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono-hud text-[9px] tracking-[0.10em]" style={{ color: 'var(--color-stat-agi)' }}>
                      ✓ {formatFinished(book.finishedAt)}
                    </div>
                    <div className="font-mono-hud text-[9px] text-text-muted mt-0.5">
                      {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
