'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db, getToday } from '@/lib/db';
import type { DisciplineStreak, DisciplineLog, DisciplineLogStatus, DisciplineStreakType } from '@/types';
import { computeStreakStats, setDisciplineLog, clearRatePct, recalculateStreak, getYesterday } from '@/lib/logic/discipline';

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function last30Days(today: string): string[] {
  const result: string[] = [];
  const base = new Date(today + 'T12:00:00');
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function dayOfWeekMon(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7; // Mon=0 … Sun=6
}

// ── Status display helpers ────────────────────────────────────────────────────

const STATUS_COLORS: Record<DisciplineLogStatus, string> = {
  clear: '#4ade80',
  failed: '#ef4444',
  skipped: '#6b7280',
  unset: '#1f2937',
};

const STATUS_TEXT: Record<DisciplineLogStatus, string> = {
  clear: 'CLEAR',
  failed: 'FAIL',
  skipped: 'SKIP',
  unset: '—',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface LoadedStreak {
  streak: DisciplineStreak;
  logs: DisciplineLog[];
  todayLog: DisciplineLogStatus;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DisciplinePage() {
  const router = useRouter();
  const today = getToday();

  const [loaded, setLoaded] = useState(false);
  const [streaks, setStreaks] = useState<LoadedStreak[]>([]);
  const [archivedStreaks, setArchivedStreaks] = useState<LoadedStreak[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<DisciplineStreak | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<DisciplineStreakType>('anti-habit');
  const [formDescription, setFormDescription] = useState('');

  // failure confirmation — streakId + which date (today or yesterday)
  const [failConfirming, setFailConfirming] = useState<string | null>(null);
  const [failConfirmingDate, setFailConfirmingDate] = useState<string>('');
  const [failNote, setFailNote] = useState('');

  // archive confirmation
  const [archiveConfirming, setArchiveConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const allStreaks = await db.disciplineStreaks.toArray();
    const todayLogs = await db.disciplineLogs.where('date').equals(today).toArray();
    const todayLogMap = new Map(todayLogs.map(l => [l.streakId, l.status as DisciplineLogStatus]));

    const active: LoadedStreak[] = [];
    const archived: LoadedStreak[] = [];

    for (const streak of allStreaks) {
      const logs = await db.disciplineLogs.where('streakId').equals(streak.id).toArray();
      const entry: LoadedStreak = {
        streak,
        logs,
        todayLog: todayLogMap.get(streak.id) ?? 'unset',
      };
      if (streak.status === 'active') active.push(entry);
      else archived.push(entry);
    }

    // sort active: by currentStreak desc
    active.sort((a, b) => b.streak.currentStreak - a.streak.currentStreak);
    archived.sort((a, b) => b.streak.lastUpdated - a.streak.lastUpdated);

    setStreaks(active);
    setArchivedStreaks(archived);
    setLoaded(true);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // ── Form ──────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setFormName('');
    setFormType('anti-habit');
    setFormDescription('');
    setShowForm(true);
  }

  function openEdit(s: DisciplineStreak) {
    setEditTarget(s);
    setFormName(s.name);
    setFormType(s.type);
    setFormDescription(s.description ?? '');
    setShowForm(true);
  }

  async function submitForm() {
    const name = formName.trim();
    if (!name) return;
    const now = Date.now();

    if (editTarget) {
      const updated: DisciplineStreak = {
        ...editTarget,
        name,
        type: formType,
        description: formDescription.trim() || undefined,
        lastUpdated: now,
      };
      await db.disciplineStreaks.put(updated);
    } else {
      const newStreak: DisciplineStreak = {
        id: uuid(),
        name,
        type: formType,
        description: formDescription.trim() || undefined,
        status: 'active',
        createdAt: now,
        startDate: today,
        currentStreak: 0,
        bestStreak: 0,
        totalClearDays: 0,
        totalFailedDays: 0,
        lastUpdated: now,
      };
      await db.disciplineStreaks.add(newStreak);
    }

    setShowForm(false);
    await load();
  }

  // ── Log actions ───────────────────────────────────────────────────────────

  async function handleClear(streakId: string) {
    await setDisciplineLog(streakId, today, 'clear');
    await load();
  }

  async function handleSkip(streakId: string) {
    await setDisciplineLog(streakId, today, 'skipped');
    await load();
  }

  function startFailConfirm(streakId: string, date: string) {
    setFailNote('');
    setFailConfirming(streakId);
    setFailConfirmingDate(date);
  }

  async function confirmFail(streakId: string) {
    await setDisciplineLog(streakId, failConfirmingDate || today, 'failed', failNote.trim() || undefined);
    setFailConfirming(null);
    setFailConfirmingDate('');
    setFailNote('');
    await load();
  }

  async function undoDate(streakId: string, date: string) {
    await setDisciplineLog(streakId, date, 'unset');
    await load();
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  async function archiveStreak(streakId: string) {
    const s = await db.disciplineStreaks.get(streakId);
    if (!s) return;
    await db.disciplineStreaks.put({ ...s, status: 'archived', lastUpdated: Date.now() });
    setArchiveConfirming(null);
    await load();
  }

  async function restoreStreak(streakId: string) {
    const s = await db.disciplineStreaks.get(streakId);
    if (!s) return;
    await db.disciplineStreaks.put({ ...s, status: 'active', lastUpdated: Date.now() });
    await recalculateStreak(streakId);
    await load();
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────

  function get30DayCalendar(logs: DisciplineLog[]) {
    const days = last30Days(today);
    const logMap = new Map<string, DisciplineLogStatus>(logs.map(l => [l.date, l.status]));
    return days.map(date => ({
      date,
      status: (logMap.get(date) ?? 'unset') as DisciplineLogStatus,
      dow: dayOfWeekMon(date),
    }));
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderTodayActions(entry: LoadedStreak) {
    const { streak, logs, todayLog } = entry;
    const id = streak.id;
    const yesterday = getYesterday(today);
    const logMap = new Map(logs.map(l => [l.date, l.status as DisciplineLogStatus]));
    const yesterdayLog = logMap.get(yesterday) ?? 'unset';
    const needsReview = yesterdayLog === 'unset';

    const isFailingToday = failConfirming === id && failConfirmingDate === today;
    const isFailingYesterday = failConfirming === id && failConfirmingDate === yesterday;
    const isFailing = isFailingToday || isFailingYesterday;

    const btnBase = {
      borderRadius: 4,
      cursor: 'pointer' as const,
      fontFamily: 'monospace',
      letterSpacing: 1,
    };

    return (
      <div style={{ marginTop: 10 }}>
        {/* Fail confirmation dialog (today or yesterday) */}
        {isFailing && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, letterSpacing: 1 }}>
              {isFailingYesterday ? 'CONFIRM FAIL YESTERDAY' : 'CONFIRM FAILURE'} — note (optional)
            </div>
            <input
              value={failNote}
              onChange={e => setFailNote(e.target.value)}
              placeholder="What happened?"
              style={{
                width: '100%',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 4,
                padding: '6px 10px',
                color: '#f9fafb',
                fontSize: 13,
                marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => confirmFail(id)}
                style={{ ...btnBase, flex: 1, padding: '7px 0', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', color: '#ef4444', fontSize: 11 }}
              >
                CONFIRM FAIL
              </button>
              <button
                onClick={() => { setFailConfirming(null); setFailConfirmingDate(''); }}
                style={{ ...btnBase, flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af', fontSize: 11 }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Yesterday review — shown when yesterday is unset and not currently in fail confirm */}
        {needsReview && !isFailing && (
          <div style={{
            marginBottom: 10,
            padding: '8px 10px',
            background: 'rgba(251,191,36,0.05)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 4,
          }}>
            <div style={{ fontSize: 9, color: '#fbbf24', letterSpacing: 1, marginBottom: 7 }}>⚠ YESTERDAY NOT REVIEWED</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={async () => { await setDisciplineLog(id, yesterday, 'clear'); await load(); }}
                style={{ ...btnBase, flex: 2, padding: '6px 0', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 11 }}
              >
                CLEAR
              </button>
              <button
                onClick={async () => { await setDisciplineLog(id, yesterday, 'skipped'); await load(); }}
                style={{ ...btnBase, flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#6b7280', fontSize: 11 }}
              >
                SKIP
              </button>
              <button
                onClick={() => startFailConfirm(id, yesterday)}
                style={{ ...btnBase, flex: 1, padding: '6px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 11 }}
              >
                FAIL
              </button>
            </div>
          </div>
        )}

        {/* Today actions */}
        {!isFailing && todayLog === 'unset' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleClear(id)}
              style={{ ...btnBase, flex: 2, padding: '7px 0', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80', fontSize: 11 }}
            >
              CLEAR
            </button>
            <button
              onClick={() => handleSkip(id)}
              style={{ ...btnBase, flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#6b7280', fontSize: 11 }}
            >
              SKIP
            </button>
            <button
              onClick={() => startFailConfirm(id, today)}
              style={{ ...btnBase, flex: 1, padding: '7px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 11 }}
            >
              FAIL
            </button>
          </div>
        )}

        {!isFailing && todayLog !== 'unset' && (() => {
          const labels: Record<DisciplineLogStatus, string> = { clear: '✓ Cleared today', failed: '✗ Failed today', skipped: '— Skipped today', unset: '' };
          const colors: Record<DisciplineLogStatus, string> = { clear: '#4ade80', failed: '#ef4444', skipped: '#6b7280', unset: '#6b7280' };
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: colors[todayLog], fontSize: 12, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                {labels[todayLog]}
              </span>
              <button
                onClick={() => undoDate(id, today)}
                style={{ marginLeft: 'auto', padding: '4px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#6b7280', fontSize: 10, letterSpacing: 1, cursor: 'pointer', fontFamily: 'monospace' }}
              >
                UNDO
              </button>
            </div>
          );
        })()}
      </div>
    );
  }

  function renderMini7(logs: DisciplineLog[]) {
    const logMap = new Map<string, DisciplineLogStatus>(logs.map(l => [l.date, l.status]));
    const base = new Date(today + 'T12:00:00');
    const days: { date: string; status: DisciplineLogStatus }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: dateStr, status: logMap.get(dateStr) ?? 'unset' });
    }

    return (
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {days.map(({ date, status }) => (
          <div
            key={date}
            title={`${formatDateShort(date)}: ${STATUS_TEXT[status]}`}
            style={{
              width: 20,
              height: 20,
              borderRadius: 3,
              background: status === 'unset'
                ? 'rgba(255,255,255,0.06)'
                : STATUS_COLORS[status] + (status === 'clear' ? '33' : '22'),
              border: `1px solid ${STATUS_COLORS[status]}${status === 'unset' ? '20' : '55'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {status === 'clear' && <span style={{ fontSize: 9, color: '#4ade80' }}>✓</span>}
            {status === 'failed' && <span style={{ fontSize: 9, color: '#ef4444' }}>✗</span>}
          </div>
        ))}
      </div>
    );
  }

  function render30DayCalendar(logs: DisciplineLog[]) {
    const days = get30DayCalendar(logs);
    // pad start so first cell aligns to day-of-week
    const firstDow = days[0]?.dow ?? 0;

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAY_LABELS.map(l => (
            <div key={l} style={{ textAlign: 'center', fontSize: 9, color: '#6b7280', letterSpacing: 1, padding: '2px 0' }}>
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {/* Empty cells for alignment */}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map(({ date, status }) => (
            <div
              key={date}
              title={`${formatDateShort(date)}: ${STATUS_TEXT[status]}`}
              style={{
                aspectRatio: '1',
                borderRadius: 3,
                background: status === 'unset'
                  ? 'rgba(255,255,255,0.05)'
                  : STATUS_COLORS[status] + (status === 'clear' ? '25' : '18'),
                border: `1px solid ${STATUS_COLORS[status]}${status === 'unset' ? '15' : '45'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
              }}
            >
              {status === 'clear' && <span style={{ color: '#4ade80' }}>✓</span>}
              {status === 'failed' && <span style={{ color: '#ef4444' }}>✗</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderStreakCard(entry: LoadedStreak, isArchived = false) {
    const { streak, logs } = entry;
    const id = streak.id;
    const isExpanded = expanded.has(id);
    const rate = clearRatePct(streak.totalClearDays, streak.totalFailedDays);
    const isConfirmingArchive = archiveConfirming === id;

    return (
      <div
        key={id}
        className="frame-cut"
        style={{
          padding: '14px 16px',
          marginBottom: 12,
          opacity: isArchived ? 0.65 : 1,
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb', letterSpacing: 0.3 }}>
                {streak.name}
              </span>
              <span
                className="hud-chip"
                style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  color: streak.type === 'anti-habit' ? '#f87171' : '#4ade80',
                  borderColor: streak.type === 'anti-habit' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)',
                }}
              >
                {streak.type === 'anti-habit' ? 'ANTI-HABIT' : 'HABIT'}
              </span>
            </div>
            {streak.description && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{streak.description}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Link
              href={`/discipline/${id}/history`}
              style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5, textDecoration: 'none', padding: '2px 4px' }}
              title="Full History"
            >
              HISTORY
            </Link>
            {!isArchived && (
              <button
                onClick={() => openEdit(streak)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 2, fontSize: 12 }}
                title="Edit"
              >
                ✎
              </button>
            )}
            {!isArchived && (
              <button
                onClick={() => setArchiveConfirming(id)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 2, fontSize: 12 }}
                title="Archive"
              >
                ⊠
              </button>
            )}
            {isArchived && (
              <button
                onClick={() => restoreStreak(id)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 2, fontSize: 11, letterSpacing: 0.5, fontFamily: 'monospace' }}
                title="Restore"
              >
                RESTORE
              </button>
            )}
          </div>
        </div>

        {/* Archive confirmation */}
        {isConfirmingArchive && (
          <div style={{
            marginTop: 10, padding: '8px 10px',
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 4,
          }}>
            <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8, letterSpacing: 0.5 }}>
              Archive this discipline?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => archiveStreak(id)}
                style={{
                  flex: 1, padding: '5px 0',
                  background: 'rgba(251,191,36,0.12)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: 4, color: '#fbbf24',
                  fontSize: 10, letterSpacing: 1, cursor: 'pointer', fontFamily: 'monospace',
                }}
              >
                ARCHIVE
              </button>
              <button
                onClick={() => setArchiveConfirming(null)}
                style={{
                  flex: 1, padding: '5px 0',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 4, color: '#6b7280',
                  fontSize: 10, letterSpacing: 1, cursor: 'pointer', fontFamily: 'monospace',
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: streak.currentStreak > 0 ? '#f97316' : '#4b5563', lineHeight: 1 }}>
              {streak.currentStreak > 0 ? '🔥' : ''}{streak.currentStreak}
            </div>
            <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1, marginTop: 2 }}>STREAK</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#9ca3af', lineHeight: 1 }}>{streak.bestStreak}</div>
            <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1, marginTop: 2 }}>BEST</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#ef4444', lineHeight: 1 }}>{rate}%</div>
            <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1, marginTop: 2 }}>RATE</div>
          </div>
        </div>

        {/* Mini 7-day */}
        {renderMini7(logs)}

        {/* Today actions */}
        {!isArchived && !isConfirmingArchive && renderTodayActions(entry)}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '5px 0',
            background: 'none',
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            color: '#6b7280',
            fontSize: 10,
            letterSpacing: 1,
            cursor: 'pointer',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {isExpanded ? '▲ HIDE HISTORY' : '▼ 30-DAY HISTORY'}
        </button>

        {/* 30-day calendar */}
        {isExpanded && (
          <div style={{ marginTop: 12 }}>
            {render30DayCalendar(logs)}
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>{streak.totalClearDays}</div>
                <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1 }}>CLEARED</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{streak.totalFailedDays}</div>
                <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1 }}>FAILED</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#9ca3af' }}>
                  {streak.startDate !== today ? formatDateShort(streak.startDate) : 'Today'}
                </div>
                <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1 }}>STARTED</div>
              </div>
            </div>
            <Link
              href={`/discipline/${id}/history`}
              style={{
                display: 'block',
                marginTop: 12,
                padding: '7px 0',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: '#6b7280',
                fontSize: 10,
                letterSpacing: 1.5,
                textDecoration: 'none',
              }}
            >
              VIEW FULL HISTORY →
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#060a10',
      color: '#f9fafb',
      fontFamily: 'monospace',
      paddingBottom: 90,
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(6,10,16,0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: 0 }}
        >
          ← SYSTEM
        </button>
        <span style={{ fontSize: 12, letterSpacing: 2, color: '#9ca3af' }}>DISCIPLINE</span>
        <button
          onClick={openCreate}
          style={{
            padding: '5px 10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            color: '#d1d5db',
            fontSize: 11,
            letterSpacing: 1,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          + NEW
        </button>
      </div>

      <div style={{ padding: '16px 16px 0' }}>

        {/* Create / Edit form */}
        {showForm && (
          <div
            className="frame-cut"
            style={{ padding: '14px 16px', marginBottom: 16, borderColor: 'rgba(99,102,241,0.3)' }}
          >
            <div style={{ fontSize: 10, color: '#818cf8', letterSpacing: 2, marginBottom: 12 }}>
              {editTarget ? '// EDIT DISCIPLINE' : '// NEW DISCIPLINE'}
            </div>

            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Name (e.g. No Wild Rift)"
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 4,
                padding: '8px 10px',
                color: '#f9fafb',
                fontSize: 13,
                marginBottom: 10,
                boxSizing: 'border-box',
              }}
            />

            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['anti-habit', 'positive-habit'] as DisciplineStreakType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setFormType(t)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    background: formType === t
                      ? (t === 'anti-habit' ? 'rgba(248,113,113,0.14)' : 'rgba(74,222,128,0.14)')
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${formType === t
                      ? (t === 'anti-habit' ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.4)')
                      : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 4,
                    color: formType === t
                      ? (t === 'anti-habit' ? '#f87171' : '#4ade80')
                      : '#6b7280',
                    fontSize: 10,
                    letterSpacing: 1,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                  }}
                >
                  {t === 'anti-habit' ? 'ANTI-HABIT' : 'POSITIVE HABIT'}
                </button>
              ))}
            </div>

            <input
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Description (optional)"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 4,
                padding: '7px 10px',
                color: '#f9fafb',
                fontSize: 12,
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={submitForm}
                disabled={!formName.trim()}
                style={{
                  flex: 2,
                  padding: '8px 0',
                  background: formName.trim() ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${formName.trim() ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 4,
                  color: formName.trim() ? '#818cf8' : '#4b5563',
                  fontSize: 11,
                  letterSpacing: 1,
                  cursor: formName.trim() ? 'pointer' : 'default',
                  fontFamily: 'monospace',
                }}
              >
                {editTarget ? 'SAVE' : 'CREATE'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 4,
                  color: '#6b7280',
                  fontSize: 11,
                  letterSpacing: 1,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Section label */}
        {!showForm && (
          <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: 2, marginBottom: 12 }}>
            // ACTIVE DISCIPLINE
          </div>
        )}

        {/* Loading */}
        {!loaded && (
          <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 12, padding: '40px 0' }}>
            LOADING...
          </div>
        )}

        {/* Empty state */}
        {loaded && streaks.length === 0 && !showForm && (
          <div
            className="frame-cut"
            style={{ padding: '24px 20px', textAlign: 'center', marginBottom: 16 }}
          >
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
              No active disciplines
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 16, lineHeight: 1.6 }}>
              Track behaviors to eliminate or build.<br />
              No Wild Rift · No Doomscrolling · No Late Phone
            </div>
            <button
              onClick={openCreate}
              style={{
                padding: '8px 20px',
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 4,
                color: '#818cf8',
                fontSize: 11,
                letterSpacing: 1,
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              + ADD YOUR FIRST DISCIPLINE
            </button>
          </div>
        )}

        {/* Active streaks */}
        {loaded && streaks.map(entry => renderStreakCard(entry))}

        {/* Archived section */}
        {loaded && archivedStreaks.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowArchived(v => !v)}
              style={{
                width: '100%',
                padding: '8px 0',
                background: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: '#6b7280',
                fontSize: 10,
                letterSpacing: 1.5,
                cursor: 'pointer',
                fontFamily: 'monospace',
                marginBottom: showArchived ? 12 : 0,
              }}
            >
              {showArchived ? '▲' : '▼'} ARCHIVED ({archivedStreaks.length})
            </button>
            {showArchived && archivedStreaks.map(entry => renderStreakCard(entry, true))}
          </div>
        )}
      </div>
    </div>
  );
}
