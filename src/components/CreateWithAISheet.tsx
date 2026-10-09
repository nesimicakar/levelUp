'use client';

import { useState } from 'react';
import { VaultSheet } from '@/components/VaultSheet';
import { importVaultPack, type ImportResult } from '@/lib/logic/vaultPack';
import { buildConceptPrompt, parsePastedPack, type ConceptSourceKind } from '@/lib/logic/vaultPrompt';
import { copyText } from '@/lib/utils/clipboard';

interface Props {
  existingDomains: string[];
  onClose: () => void;
  /** Called after a successful import so the page can reload its data. */
  onImported: () => void;
  /** Opens the manual single-concept form instead. */
  onManual?: () => void;
}

const SOURCE_OPTIONS: Array<{
  kind: ConceptSourceKind;
  label: string;
  titleLabel: string;
  titlePlaceholder: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  detailsRequired?: boolean;
}> = [
  {
    kind: 'topic', label: 'TOPIC',
    titleLabel: 'Topic', titlePlaceholder: 'e.g. The Silk Road, Stoicism',
    detailsLabel: 'Anything specific to cover? (optional)',
    detailsPlaceholder: 'e.g. focus on how it shaped trade, or what I just learned about…',
  },
  {
    kind: 'book', label: 'BOOK',
    titleLabel: 'Book title', titlePlaceholder: 'e.g. Atomic Habits by James Clear',
    detailsLabel: 'What stuck with you? (optional)',
    detailsPlaceholder: 'Ideas, chapters or takeaways that mattered to you. The AI will make sure these are covered.',
  },
  {
    kind: 'course', label: 'COURSE',
    titleLabel: 'Course title', titlePlaceholder: 'e.g. CS50, Yale: Death',
    detailsLabel: 'Lessons or themes covered (optional)',
    detailsPlaceholder: 'Lesson titles or the main things you learned.',
  },
  {
    kind: 'notes', label: 'MY NOTES',
    titleLabel: 'Title', titlePlaceholder: 'What should the card be called?',
    detailsLabel: 'Paste your notes',
    detailsPlaceholder: 'Paste what you wrote or learned. The card will be built from this.',
    detailsRequired: true,
  },
];

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span
        className="grid place-items-center font-mono-hud text-[10px] font-bold flex-shrink-0"
        style={{ width: 18, height: 18, borderRadius: 9, background: '#f59e0b22', border: '1px solid #f59e0b', color: '#f59e0b' }}
      >
        {n}
      </span>
      <span className="text-[11px] text-text uppercase tracking-widest font-bold">{text}</span>
    </div>
  );
}

export function CreateWithAISheet({ existingDomains, onClose, onImported, onManual }: Props) {
  const [kind, setKind] = useState<ConceptSourceKind>('topic');
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const opt = SOURCE_OPTIONS.find(o => o.kind === kind)!;
  const canCopy = !!topic.trim() && (!opt.detailsRequired || !!details.trim());

  const handleCopy = async () => {
    const ok = await copyText(buildConceptPrompt({ topic, kind, details, existingDomains }));
    setCopied(ok ? 'ok' : 'fail');
    if (ok) setTimeout(() => setCopied(null), 4000);
  };

  const handlePasteFromClipboard = async () => {
    try {
      setPasted(await navigator.clipboard.readText());
      setError(null);
    } catch {
      setError('Couldn’t read the clipboard. Long-press in the box below and choose Paste.');
    }
  };

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const pack = parsePastedPack(pasted);
      const res = await importVaultPack(pack);
      setResult(res);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Success view ──
  if (result) {
    const added = result.conceptsImported > 0;
    return (
      <VaultSheet
        label="// CREATE WITH AI"
        onClose={onClose}
        footer={
          <button
            onClick={onClose}
            className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-widest text-warning"
            style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
          >
            DONE
          </button>
        }
      >
        <div className="py-4 text-center">
          <p className="font-display text-lg font-bold tracking-widest mb-2" style={{ color: added ? '#22c55e' : '#fbbf24' }}>
            {added ? 'CONCEPT ADDED' : 'ALREADY IN YOUR VAULT'}
          </p>
          <p className="text-[11px] text-text-muted leading-relaxed">
            {added
              ? 'It’s due for review right away — open DAILY REVIEW to start remembering it.'
              : 'A concept with that title already exists in that domain, so nothing new was added. Try a different topic or title.'}
          </p>
          {result.errors.map((err, i) => (
            <p key={i} className="text-[10px] text-danger mt-2">{err}</p>
          ))}
        </div>
      </VaultSheet>
    );
  }

  return (
    <VaultSheet
      label="// CREATE WITH AI"
      onClose={onClose}
      footer={
        <button
          onClick={handleImport}
          disabled={busy || !pasted.trim()}
          className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-widest text-warning disabled:opacity-40"
          style={{ background: '#f59e0b22', border: '1px solid #f59e0b' }}
        >
          {busy ? 'IMPORTING…' : 'ADD TO VAULT'}
        </button>
      }
    >
      <p className="text-[11px] text-text-muted leading-relaxed mb-4">
        Writing concepts by hand is slow. Let any AI (ChatGPT, Claude, Gemini) write one, then drop it in here.
      </p>

      {/* Step 1 */}
      <StepLabel n={1} text="Tell it what to write" />
      <div className="flex gap-1.5 mb-3">
        {SOURCE_OPTIONS.map(o => (
          <button
            key={o.kind}
            onClick={() => { setKind(o.kind); setCopied(null); }}
            className="flex-1 py-1.5 rounded-md text-[9px] font-bold tracking-widest"
            style={{
              background: kind === o.kind ? '#f59e0b22' : 'transparent',
              border: `1px solid ${kind === o.kind ? '#f59e0b' : '#1e2333'}`,
              color: kind === o.kind ? '#f59e0b' : '#6b7280',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input
        value={topic}
        onChange={e => { setTopic(e.target.value); setCopied(null); }}
        aria-label={opt.titleLabel}
        placeholder={opt.titlePlaceholder}
        className="w-full mb-2 px-3 py-2.5 rounded-lg bg-bg text-text text-sm"
        style={{ border: '1px solid #1e2333' }}
      />
      <p className="text-[10px] text-text-muted mb-1">{opt.detailsLabel}</p>
      <textarea
        value={details}
        onChange={e => { setDetails(e.target.value); setCopied(null); }}
        placeholder={opt.detailsPlaceholder}
        rows={opt.detailsRequired ? 5 : 3}
        className="w-full mb-2 px-3 py-2.5 rounded-lg bg-bg text-text text-xs"
        style={{ border: '1px solid #1e2333' }}
      />
      <button
        onClick={handleCopy}
        disabled={!canCopy}
        className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest text-text disabled:opacity-40 mb-1"
        style={{ background: '#0f1623', border: '1px solid #1e2333' }}
      >
        {copied === 'ok' ? '✓ COPIED' : 'COPY PROMPT'}
      </button>
      {copied === 'fail' && (
        <p className="text-[10px] text-danger mb-1">Couldn’t copy automatically. Try again or use a different browser.</p>
      )}

      {/* Step 2 */}
      <div className="mt-5">
        <StepLabel n={2} text="Paste it into your AI chat" />
        <p className="text-[11px] text-text-muted leading-relaxed mb-5">
          Send the prompt as-is. The AI replies with one code block.
        </p>
      </div>

      {/* Step 3 */}
      <StepLabel n={3} text="Copy its reply, paste it here" />
      <textarea
        value={pasted}
        onChange={e => { setPasted(e.target.value); setError(null); }}
        placeholder="Paste the AI’s reply here…"
        rows={5}
        className="w-full px-3 py-2.5 rounded-lg bg-bg text-text text-xs font-mono-hud mb-1"
        style={{ border: `1px solid ${error ? '#ef4444' : '#1e2333'}` }}
      />
      <button
        onClick={handlePasteFromClipboard}
        className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2"
      >
        ⎘ PASTE FROM CLIPBOARD
      </button>
      {error && <p className="text-[11px] text-danger leading-relaxed mb-2">{error}</p>}

      {onManual && (
        <button
          onClick={onManual}
          className="block mx-auto mt-3 mb-1 text-[10px] uppercase tracking-widest text-text-muted underline"
        >
          Prefer to type it yourself?
        </button>
      )}
    </VaultSheet>
  );
}
