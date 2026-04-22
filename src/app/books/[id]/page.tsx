'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSettings, updateSettings } from '@/lib/db';
import { PageHeader } from '@/components/PageHeader';
import type { ActiveBook, FinishedBook } from '@/types';

type AnyBook = (ActiveBook | FinishedBook) & { source: 'active' | 'finished' };
type SectionKey = 'keyIdeas' | 'applyToLife' | 'notes';

export default function BookDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [book, setBook] = useState<AnyBook | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [keyIdeas, setKeyIdeas] = useState('');
  const [applyToLife, setApplyToLife] = useState('');
  const [notes, setNotes] = useState('');

  const [editing, setEditing] = useState<SectionKey | null>(null);

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-sizing textareas: grow with content, no inner scrollbar
  const keyIdeasRef = useRef<HTMLTextAreaElement | null>(null);
  const applyRef = useRef<HTMLTextAreaElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  function autoSize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  useLayoutEffect(() => { autoSize(keyIdeasRef.current); }, [keyIdeas, editing]);
  useLayoutEffect(() => { autoSize(applyRef.current); }, [applyToLife, editing]);
  useLayoutEffect(() => { autoSize(notesRef.current); }, [notes, editing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (!editing) return;
    const target =
      editing === 'keyIdeas' ? keyIdeasRef.current :
      editing === 'applyToLife' ? applyRef.current :
      notesRef.current;
    target?.focus();
  }, [editing]);

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

  const savedLabel = useMemo(() => (savedAt ? 'Saved' : ''), [savedAt]);

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

  function SectionHeader({ title, sectionKey, hasContent }: { title: string; sectionKey: SectionKey; hasContent: boolean }) {
    const isEditing = editing === sectionKey;
    return (
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-dim tracking-wider">{title}</h3>
        {hasContent && (
          <button
            onClick={() => setEditing(isEditing ? null : sectionKey)}
            className="text-xs text-text-muted tracking-wider hover:text-glow transition-colors"
          >
            {isEditing ? 'DONE' : 'EDIT'}
          </button>
        )}
      </div>
    );
  }

  function DisplayCard({ text }: { text: string }) {
    return (
      <div className="bg-surface/60 border border-border/60 rounded-lg px-4 py-3">
        <p className="text-sm text-text leading-relaxed whitespace-pre-line">{text}</p>
      </div>
    );
  }

  function EmptyAdd({ label, onClick }: { label: string; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className="w-full border border-dashed border-border/70 rounded-lg px-4 py-3 text-left text-sm text-text-dim hover:text-glow hover:border-glow/40 transition-colors"
      >
        + {label}
      </button>
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
          <SectionHeader title="KEY IDEAS" sectionKey="keyIdeas" hasContent={keyIdeas.trim().length > 0} />
          {editing === 'keyIdeas' ? (
            <textarea
              ref={keyIdeasRef}
              value={keyIdeas}
              onChange={e => setKeyIdeas(e.target.value)}
              placeholder="List the most important ideas from this book..."
              rows={6}
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-glow resize-none overflow-hidden leading-relaxed"
            />
          ) : keyIdeas.trim().length > 0 ? (
            <DisplayCard text={keyIdeas} />
          ) : (
            <EmptyAdd label="Add key ideas" onClick={() => setEditing('keyIdeas')} />
          )}
        </section>

        {/* APPLY TO MY LIFE */}
        <section className="space-y-2">
          <SectionHeader title="APPLY TO MY LIFE" sectionKey="applyToLife" hasContent={applyToLife.trim().length > 0} />
          {editing === 'applyToLife' ? (
            <>
              <p className="text-xs text-text-muted">Keep this short. 3–5 actions max.</p>
              <textarea
                ref={applyRef}
                value={applyToLife}
                onChange={e => setApplyToLife(e.target.value)}
                placeholder="What will you actually do differently?"
                rows={5}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-glow resize-none overflow-hidden leading-relaxed"
              />
            </>
          ) : applyToLife.trim().length > 0 ? (
            <DisplayCard text={applyToLife} />
          ) : (
            <EmptyAdd label="Add actions" onClick={() => setEditing('applyToLife')} />
          )}
        </section>

        {/* NOTES */}
        <section className="space-y-2">
          <SectionHeader title="NOTES" sectionKey="notes" hasContent={notes.trim().length > 0} />
          {editing === 'notes' ? (
            <textarea
              ref={notesRef}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Thoughts, reflections, observations..."
              rows={8}
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-glow resize-none overflow-hidden leading-relaxed"
            />
          ) : notes.trim().length > 0 ? (
            <DisplayCard text={notes} />
          ) : (
            <EmptyAdd label="Add notes" onClick={() => setEditing('notes')} />
          )}
        </section>
      </main>
    </div>
  );
}
