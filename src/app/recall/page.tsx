'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSettings, updateSettings, getToday } from '@/lib/db';
import type { RecallItem } from '@/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toLocalDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecallPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecallItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const settings = await getSettings();
    setItems(settings.recallItems ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = getToday();

  const todayItem = useMemo(() => {
    return items.find(item => toLocalDateStr(item.createdAt) === today) ?? null;
  }, [items, today]);

  const handleAdd = async () => {
    if (!title.trim() || !summary.trim()) return;
    setSaving(true);
    const newItem: RecallItem = {
      id: generateId(),
      title: title.trim(),
      summary: summary.trim(),
      source: source.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newItem, ...items];
    await updateSettings({ recallItems: updated });
    setItems(updated);
    setTitle('');
    setSummary('');
    setSource('');
    setSaving(false);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this recall item?')) return;
    const updated = items.filter(i => i.id !== id);
    await updateSettings({ recallItems: updated });
    setItems(updated);
    if (expandedId === id) setExpandedId(null);
  };

  if (!loaded) return null;

  const accentColor = 'rgba(167,139,250,0.9)';
  const accentBorder = 'rgba(167,139,250,0.3)';
  const accentBg = 'rgba(167,139,250,0.05)';

  const inputStyle: React.CSSProperties = {
    clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
  };

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24 space-y-3">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <p className="text-glow-bright text-[10px] tracking-[0.32em]">‹ KNOWLEDGE SYSTEM ›</p>
            <h1 className="font-display text-xl font-bold glow-text leading-none mt-1">RECALL</h1>
          </div>
        </div>

        {/* TODAY'S RECALL */}
        {todayItem && (
          <>
            <div className="section-heading text-text-dim">// TODAY&apos;S RECALL</div>
            <div
              className="frame-cut p-4"
              style={{ borderColor: accentBorder, background: accentBg }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display font-semibold text-sm text-text leading-tight">{todayItem.title}</p>
                {todayItem.source && (
                  <span
                    className="text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 flex-shrink-0"
                    style={{ color: accentColor, border: `1px solid ${accentBorder}` }}
                  >
                    {todayItem.source}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* RECALL ITEMS */}
        <div className="section-heading text-text-dim mt-2">// RECALL ITEMS</div>
        {items.length === 0 ? (
          <div className="frame-cut p-4 text-center">
            <p className="text-text-muted text-xs">No recall items yet. Add one below to start reinforcing your knowledge.</p>
          </div>
        ) : (
          <div className="frame-cut p-2 space-y-px">
            {items.map((item, i, arr) => {
              const isExpanded = expandedId === item.id;
              const isToday = todayItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  style={{ borderBottom: i < arr.length - 1 ? '1px dashed var(--color-border)' : 'none' }}
                >
                  <button
                    className="w-full text-left px-2 py-2.5 hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className="flex items-start gap-2 justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-display font-semibold text-sm text-text truncate">{item.title}</p>
                          {isToday && (
                            <span
                              className="text-[9px] tracking-[0.18em] uppercase flex-shrink-0"
                              style={{ color: accentColor }}
                            >
                              today
                            </span>
                          )}
                        </div>
                        {item.source && (
                          <p className="text-text-muted text-[10px] tracking-[0.14em] uppercase mt-0.5">{item.source}</p>
                        )}
                      </div>
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="text-text-muted flex-shrink-0 mt-1 transition-transform"
                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                        aria-hidden
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-2 pb-3">
                      <p className="text-text-muted text-xs leading-relaxed whitespace-pre-wrap">{item.summary}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-[10px] tracking-[0.18em] uppercase text-text-muted hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ADD NEW toggle */}
        <button
          onClick={() => setShowForm(v => !v)}
          className="w-full py-2.5 font-display font-semibold text-sm tracking-[0.14em] uppercase transition-all flex items-center justify-center gap-2"
          style={{
            background: showForm ? accentBg : 'transparent',
            border: `1px solid ${accentBorder}`,
            color: accentColor,
            clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{showForm ? '−' : '+'}</span>
          NEW RECALL
        </button>

        {showForm && (
          <div className="frame-cut p-4 space-y-3">
            <div>
              <label className="text-text-muted text-[10px] tracking-[0.18em] uppercase block mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Stoicism, Roman Empire, Diogenes"
                className="w-full bg-transparent border border-border text-text text-sm px-3 py-2 outline-none focus:border-glow-bright placeholder:text-text-muted/40 transition-colors"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-text-muted text-[10px] tracking-[0.18em] uppercase block mb-1">
                Quick Recall Summary
              </label>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Key ideas to remember — keep it short and punchy"
                rows={4}
                className="w-full bg-transparent border border-border text-text text-sm px-3 py-2 outline-none focus:border-glow-bright placeholder:text-text-muted/40 transition-colors resize-none leading-relaxed"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-text-muted text-[10px] tracking-[0.18em] uppercase block mb-1">
                Source <span className="normal-case tracking-normal text-text-muted/60">(optional)</span>
              </label>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="e.g. Yuno, Philosophy, History"
                className="w-full bg-transparent border border-border text-text text-sm px-3 py-2 outline-none focus:border-glow-bright placeholder:text-text-muted/40 transition-colors"
                style={inputStyle}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!title.trim() || !summary.trim() || saving}
              className="w-full py-2.5 font-display font-semibold text-sm tracking-[0.14em] uppercase transition-all disabled:opacity-40"
              style={{
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                color: accentColor,
                clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
              }}
            >
              {saving ? 'SAVING…' : 'ADD RECALL'}
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
