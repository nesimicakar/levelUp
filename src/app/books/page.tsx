'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSettings, updateSettings } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import type { ActiveBook, FinishedBook } from '@/types';

function genId(): string {
  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function BooksPage() {
  const [active, setActive] = useState<ActiveBook[]>([]);
  const [finished, setFinished] = useState<FinishedBook[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newTotalPages, setNewTotalPages] = useState('');

  // Edit progress (per book)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPage, setEditPage] = useState('');

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

  async function saveProgress(id: string) {
    const page = parseInt(editPage, 10);
    if (!Number.isFinite(page) || page < 0) {
      setEditingId(null);
      return;
    }
    const next = active.map(b => {
      if (b.id !== id) return b;
      const clamped = b.totalPages ? Math.min(page, b.totalPages) : page;
      return { ...b, currentPage: clamped };
    });
    await persist(next, finished);
    setEditingId(null);
  }

  async function markFinished(id: string) {
    const book = active.find(b => b.id === id);
    if (!book) return;
    const done: FinishedBook = {
      id: book.id,
      title: book.title,
      author: book.author,
      totalPages: book.totalPages,
      finishedAt: Date.now(),
      keyIdeas: book.keyIdeas,
      applyToLife: book.applyToLife,
      notes: book.notes,
    };
    await persist(active.filter(b => b.id !== id), [done, ...finished]);
  }

  async function removeActive(id: string) {
    await persist(active.filter(b => b.id !== id), finished);
  }

  async function removeFinished(id: string) {
    await persist(active, finished.filter(b => b.id !== id));
  }

  if (!loaded) {
    return (
      <div>
        <PageHeader title="BOOKS" subtitle="Reading log" />
        <main className="max-w-lg mx-auto px-4 py-4" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="BOOKS" subtitle="Reading log" />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-8">
        {/* ACTIVE BOOKS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-dim tracking-wider">ACTIVE BOOKS</h2>
            {active.length > 0 && !showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="text-xs text-glow tracking-wider hover:opacity-80"
              >
                + ADD
              </button>
            )}
          </div>

          {active.length === 0 && !showAdd && (
            <div className="stat-card rounded-lg p-6 glow-border text-center space-y-3">
              <p className="text-text-muted text-sm">No active books</p>
              <button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 rounded-lg bg-glow/10 border border-glow/40 text-glow text-sm tracking-wider hover:bg-glow/20 transition-colors"
              >
                ADD BOOK
              </button>
            </div>
          )}

          {showAdd && (
            <div className="stat-card rounded-lg p-4 glow-border space-y-3">
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
                  className="flex-1 px-3 py-2 rounded-lg bg-glow/10 border border-glow/40 text-glow text-xs tracking-wider hover:bg-glow/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ADD
                </button>
                <button
                  onClick={() => { setShowAdd(false); setNewTitle(''); setNewAuthor(''); setNewTotalPages(''); }}
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {active.map(book => {
            const isEditing = editingId === book.id;
            const progressLabel = book.totalPages
              ? `${book.currentPage ?? 0} / ${book.totalPages}`
              : book.currentPage !== undefined && book.currentPage > 0
                ? `page ${book.currentPage}`
                : null;
            return (
              <div key={book.id} className="stat-card rounded-lg p-4 glow-border space-y-3">
                <Link href={`/books/${book.id}`} className="block group">
                  <p className="text-text font-medium group-hover:text-glow transition-colors">{book.title}</p>
                  {book.author && <p className="text-text-muted text-xs">{book.author}</p>}
                  {progressLabel && (
                    <p className="text-text-dim text-xs mt-1">{progressLabel}</p>
                  )}
                </Link>

                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editPage}
                      onChange={e => setEditPage(e.target.value)}
                      placeholder="Current page"
                      min={0}
                      max={book.totalPages}
                      className="flex-1 bg-surface-light border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-glow"
                      autoFocus
                    />
                    <button
                      onClick={() => saveProgress(book.id)}
                      className="px-3 py-2 rounded-lg bg-glow/10 border border-glow/40 text-glow text-xs tracking-wider hover:bg-glow/20 transition-colors"
                    >
                      SAVE
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 rounded-lg border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
                    >
                      CANCEL
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { setEditingId(book.id); setEditPage(String(book.currentPage ?? 0)); }}
                      className="px-2 py-2 rounded-lg border border-border text-text-muted text-xs tracking-wider hover:text-text transition-colors"
                    >
                      UPDATE
                    </button>
                    <button
                      onClick={() => markFinished(book.id)}
                      className="px-2 py-2 rounded-lg bg-success/10 border border-success/40 text-success text-xs tracking-wider hover:bg-success/20 transition-colors"
                    >
                      FINISHED
                    </button>
                    <button
                      onClick={() => removeActive(book.id)}
                      className="px-2 py-2 rounded-lg border border-danger/40 text-danger text-xs tracking-wider hover:bg-danger/10 transition-colors"
                    >
                      REMOVE
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* FINISHED BOOKS */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-dim tracking-wider">
            FINISHED BOOKS{finished.length > 0 && <span className="text-text-muted"> ({finished.length})</span>}
          </h2>

          {finished.length === 0 ? (
            <p className="text-text-muted text-xs">Nothing finished yet.</p>
          ) : (
            <div className="space-y-2">
              {finished.map(book => (
                <div key={book.id} className="stat-card rounded-lg p-3 glow-border flex items-center justify-between gap-3">
                  <Link href={`/books/${book.id}`} className="min-w-0 flex-1 group">
                    <p className="text-text text-sm truncate group-hover:text-glow transition-colors">{book.title}</p>
                    <p className="text-text-muted text-xs">
                      {book.author ? `${book.author} · ` : ''}{formatDate(book.finishedAt)}
                    </p>
                  </Link>
                  <button
                    onClick={() => removeFinished(book.id)}
                    className="text-text-dim text-xs tracking-wider hover:text-danger transition-colors flex-shrink-0"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
