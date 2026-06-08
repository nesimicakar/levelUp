'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getAllDomains, getAllConcepts } from '@/lib/db';
import type { KnowledgeDomain, KnowledgeConcept } from '@/types';
import { retentionColor, SOURCE_LABELS } from '@/lib/logic/knowledge';
import { VaultSecondaryNav } from '@/components/VaultSecondaryNav';

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchScore(query: string, text: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

interface SearchResults {
  domains: KnowledgeDomain[];
  concepts: KnowledgeConcept[];
  bySource: KnowledgeConcept[];
}

function search(query: string, domains: KnowledgeDomain[], concepts: KnowledgeConcept[]): SearchResults {
  if (!query.trim()) return { domains: [], concepts: [], bySource: [] };
  const q = query.toLowerCase().trim();

  const matchedDomains = domains.filter(d =>
    d.name.toLowerCase().includes(q)
  );

  const matchedConcepts = concepts.filter(c =>
    c.title.toLowerCase().includes(q) ||
    c.summary.toLowerCase().includes(q) ||
    (c.personalNotes ?? '').toLowerCase().includes(q) ||
    c.tags.some(t => t.toLowerCase().includes(q)) ||
    c.primaryDomainId && domains.find(d => d.id === c.primaryDomainId)?.name.toLowerCase().includes(q)
  );

  const matchedBySource = concepts.filter(c =>
    (c.sourceTitle ?? '').toLowerCase().includes(q) ||
    c.sourceType.toLowerCase().includes(q)
  ).filter(c => !matchedConcepts.includes(c));

  return { domains: matchedDomains, concepts: matchedConcepts, bySource: matchedBySource };
}

// ── Result rows ───────────────────────────────────────────────────────────────

function DomainResult({ domain, concepts }: { domain: KnowledgeDomain; concepts: KnowledgeConcept[] }) {
  const count = concepts.filter(c => c.primaryDomainId === domain.id).length;
  return (
    <Link href={`/knowledge/domain/${domain.id}`}>
      <div
        className="flex items-center gap-3 p-3 rounded-xl mb-2 active:scale-[0.98] transition-transform"
        style={{ background: '#0f1623', border: '1px solid #1e293b' }}
      >
        <span className="text-xl">{domain.icon}</span>
        <div className="flex-1">
          <p className="font-display text-sm font-bold" style={{ color: domain.color }}>{domain.name}</p>
          <p className="text-[10px] text-text-muted">{count} concepts</p>
        </div>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}

function ConceptResult({ concept, domain }: { concept: KnowledgeConcept; domain?: KnowledgeDomain }) {
  const retColor = retentionColor(concept.retentionScore);
  const isDue = concept.nextReviewAt <= Date.now();
  return (
    <Link href={`/knowledge/concept/${concept.id}`}>
      <div
        className="p-3 rounded-xl mb-2 active:scale-[0.98] transition-transform"
        style={{ background: '#0f1623', border: '1px solid #1e293b' }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {domain && <span className="text-[10px]" style={{ color: domain.color }}>◆</span>}
            <span className="font-display text-sm font-bold text-text">{concept.title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isDue && <span className="w-1.5 h-1.5 rounded-full bg-danger" />}
            <span className="font-mono text-[11px] font-bold" style={{ color: retColor }}>{concept.retentionScore}%</span>
          </div>
        </div>
        <p className="text-[11px] text-text-dim line-clamp-2 mb-2">{concept.summary}</p>
        <div className="flex items-center gap-1.5">
          {domain && (
            <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: domain.color }}>
              {domain.name}
            </span>
          )}
          {concept.sourceTitle && (
            <>
              <span className="text-[9px] text-text-muted">·</span>
              <span
                className="text-[9px] font-mono px-1 py-0.5 rounded"
                style={{ background: (domain?.color ?? '#64748b') + '22', color: domain?.color ?? '#64748b' }}
              >
                {SOURCE_LABELS[concept.sourceType] ?? concept.sourceType}
              </span>
              <span className="text-[9px] text-text-muted truncate">{concept.sourceTitle}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [domains, setDomains] = useState<KnowledgeDomain[]>([]);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [results, setResults] = useState<SearchResults>({ domains: [], concepts: [], bySource: [] });
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [doms, concs] = await Promise.all([getAllDomains(), getAllConcepts()]);
    setDomains(doms);
    setConcepts(concs);
    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setResults(search(query, domains, concepts));
  }, [query, domains, concepts]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const totalResults = results.domains.length + results.concepts.length + results.bySource.length;
  const hasQuery = query.trim().length > 0;

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Secondary vault nav */}
      <VaultSecondaryNav />

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/knowledge" className="text-text-muted">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-widest">// KNOWLEDGE VAULT</p>
          <h1 className="font-display text-xl font-bold tracking-widest leading-none text-warning">SEARCH</h1>
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-5">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <input
          ref={inputRef}
          className="w-full bg-surface-light border border-border rounded-xl pl-10 pr-10 py-3 text-sm text-text placeholder-text-muted outline-none focus:border-warning transition-colors"
          placeholder="Search concepts, domains, sources…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-lg leading-none"
          >
            ✕
          </button>
        )}
      </div>

      {/* Empty state / no query */}
      {!hasQuery && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">// VAULT OVERVIEW</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
              <span className="font-display text-2xl font-bold text-text">{concepts.length}</span>
              <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">CONCEPTS</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#0f1623', border: '1px solid #1e293b' }}>
              <span className="font-display text-2xl font-bold text-text">{domains.length}</span>
              <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">DOMAINS</p>
            </div>
          </div>
          {domains.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">// ALL DOMAINS</p>
              {domains.map(d => (
                <DomainResult key={d.id} domain={d} concepts={concepts} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {hasQuery && loaded && (
        <div>
          {totalResults === 0 && (
            <div className="text-center py-12">
              <p className="text-text-muted text-sm mb-1">No results for</p>
              <p className="font-display text-lg font-bold text-text">"{query}"</p>
            </div>
          )}

          {results.domains.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">
                // DOMAINS · {results.domains.length}
              </p>
              {results.domains.map(d => (
                <DomainResult key={d.id} domain={d} concepts={concepts} />
              ))}
            </div>
          )}

          {results.concepts.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">
                // CONCEPTS · {results.concepts.length}
              </p>
              {results.concepts.map(c => (
                <ConceptResult
                  key={c.id}
                  concept={c}
                  domain={domains.find(d => d.id === c.primaryDomainId)}
                />
              ))}
            </div>
          )}

          {results.bySource.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">
                // BY SOURCE · {results.bySource.length}
              </p>
              {results.bySource.map(c => (
                <ConceptResult
                  key={c.id}
                  concept={c}
                  domain={domains.find(d => d.id === c.primaryDomainId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
