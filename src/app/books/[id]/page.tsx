'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSettings, updateSettings } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import type { ActiveBook, FinishedBook } from '@/types';

type AnyBook = (ActiveBook | FinishedBook) & { source: 'active' | 'finished' };

export default function BookDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [book, setBook] = useState<AnyBook | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [keyIdeas, setKeyIdeas] = useState('');
  const [applyToLife, setApplyToLife] = useState('');
  const [notes, setNotes] = useState('');

  // Debounced persist
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      const active = (s.activeBooks ?? []).find(b => b.id === id);
      if (active) {
        const b: AnyBook = { ...active, source: 'active' };
        setBook(b);
        setKeyIdeas(active.keyIdeas ?? '');
        setApplyToLife(active.applyToLife ?? '');
        setNotes(active.notes ?? '');
        setLoaded(true);
        return;
      }
      const finished = (s.finishedBooks ?? []).find(b => b.id === id);
      if (finished) {
        const b: AnyBook = { ...finished, source: 'finished' };
        setBook(b);
        setKeyIdeas(finished.keyIdeas ?? '');
        setApplyToLife(finished.applyToLife ?? '');
        setNotes(finished.notes ?? '');
      }
      setLoaded(true);
    })();
  }, [id]);

  // Debounced autosave whenever any of the three fields change
  useEffect(() => {
    if (!book) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      const s = await getSettings();
      const patch = { keyIdeas, applyToLife, notes };
      if (book.source === 'active') {
        const next = (s.activeBooks ?? []).map(b => b.id === book.id ? { ...b, ...patch } : b);
        await updateSettings({ activeBooks: next });
      } else {
        const next = (s.finishedBooks ?? []).map(b => b.id === book.id ? { ...b, ...patch } : b);
        await updateSettings({ finishedBooks: next });
      }
      setSavedAt(Date.now());
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [keyIdeas, applyToLife, notes, book]);

  const savedLabel = useMemo(() => {
    if (!savedAt) return '';
    return 'Saved';
  }, [savedAt]);

  if (!loaded) {
    return (
      <div>
        <PageHeader title="BOOK" />
        <main className="max-w-lg mx-auto px-4 py-4" />
      </div>
    );
  }

  if (!book) {
    return (
      <div>
        <PageHeader title="BOOK" />
        <main className="max-w-lg mx-auto px-4 py-4">
          <p className="text-text-muted text-sm">Book not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="BOOK" subtitle={book.source === 'active' ? 'Active' : 'Finished'} />
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {/* Title block */}
        <div>
          <h2 className="text-text text-lg font-medium">{book.title}</h2>
          {book.author && <p className="text-text-muted text-sm">{book.author}</p>}
          {savedLabel && (
            <p className="text-text-dim text-xs mt-2 tracking-wider">{savedLabel.toUpperCase()}</p>
          )}
        </div>

        {/* KEY IDEAS */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-text-dim tracking-wider">KEY IDEAS</h3>
          <textarea
            value={keyIdeas}
            onChange={e => setKeyIdeas(e.target.value)}
            placeholder="List the most important ideas from this book..."
            rows={6}
            className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-glow resize-y"
          />
        </section>

        {/* APPLY TO MY LIFE */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-text-dim tracking-wider">APPLY TO MY LIFE</h3>
          <p className="text-xs text-text-muted">Keep this short. 3–5 actions max.</p>
          <textarea
            value={applyToLife}
            onChange={e => setApplyToLife(e.target.value)}
            placeholder="What will you actually do differently?"
            rows={5}
            className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-glow resize-y"
          />
        </section>

        {/* NOTES */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-text-dim tracking-wider">NOTES</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Thoughts, reflections, observations..."
            rows={8}
            className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-glow resize-y"
          />
        </section>
      </main>
    </div>
  );
}
