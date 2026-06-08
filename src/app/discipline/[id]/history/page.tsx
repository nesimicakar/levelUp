'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/db';
import type { DisciplineStreak, DisciplineLog, DisciplineLogStatus } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dayOfWeekMon(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7; // Mon=0 … Sun=6
}

function getDaysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(i + 1).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_COLOR: Record<DisciplineLogStatus, string> = {
  clear: '#4ade80',
  failed: '#ef4444',
  skipped: '#6b7280',
  unset: 'transparent',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DisciplineHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const streakId = params.id as string;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [streak, setStreak] = useState<DisciplineStreak | null>(null);
  const [allLogs, setAllLogs] = useState<DisciplineLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [s, logs] = await Promise.all([
      db.disciplineStreaks.get(streakId),
      db.disciplineLogs.where('streakId').equals(streakId).toArray(),
    ]);
    if (!s) { router.back(); return; }
    setStreak(s);
    setAllLogs(logs);
    setLoaded(true);
  }, [streakId, router]);

  useEffect(() => { load(); }, [load]);

  if (!loaded || !streak) return null;

  const logMap = new Map<string, DisciplineLog>(allLogs.map(l => [l.date, l]));

  // ── Month data ──────────────────────────────────────────────────────────────

  const days = getDaysInMonth(year, month);
  const firstDow = dayOfWeekMon(days[0]);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Clamp: don't go past current month
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // Month stats — only count days up to today
  const pastDays = days.filter(d => d <= todayStr);
  const cleared = pastDays.filter(d => logMap.get(d)?.status === 'clear').length;
  const failed = pastDays.filter(d => logMap.get(d)?.status === 'failed').length;
  const skipped = pastDays.filter(d => logMap.get(d)?.status === 'skipped').length;
  const unset = pastDays.filter(d => !logMap.has(d) || logMap.get(d)?.status === 'unset').length;
  const rateBase = cleared + failed;
  const rate = rateBase > 0 ? Math.round((cleared / rateBase) * 100) : null;

  // Failures with notes for this month
  const failedDays = pastDays
    .filter(d => logMap.get(d)?.status === 'failed')
    .map(d => ({ date: d, note: logMap.get(d)?.note }));

  return (
    <div style={{ minHeight: '100dvh', background: '#060a10', color: '#f9fafb', fontFamily: 'monospace', paddingBottom: 90 }}>
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
        gap: 8,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: 0, flexShrink: 0 }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: '#9ca3af' }}>HISTORY</div>
          <div style={{ fontSize: 11, color: '#f9fafb', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {streak.name}
          </div>
        </div>
        <div style={{ width: 24, flexShrink: 0 }} />
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button
            onClick={prevMonth}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#9ca3af',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
            ←
          </button>
          <span style={{ fontSize: 13, letterSpacing: 2, color: '#f9fafb' }}>
            {MONTH_NAMES[month].toUpperCase()} {year}
          </span>
          <button
            onClick={nextMonth}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: isCurrentMonth ? '#1f2937' : '#9ca3af',
              padding: '6px 14px',
              cursor: isCurrentMonth ? 'default' : 'pointer',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
            disabled={isCurrentMonth}
          >
            →
          </button>
        </div>

        {/* Day-of-week labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
          {DAY_LABELS.map(l => (
            <div key={l} style={{ textAlign: 'center', fontSize: 9, color: '#6b7280', letterSpacing: 1, padding: '2px 0' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 20 }}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}

          {days.map(date => {
            const log = logMap.get(date);
            const status: DisciplineLogStatus = (log?.status as DisciplineLogStatus) ?? 'unset';
            const isFuture = date > todayStr;
            const dayNum = parseInt(date.split('-')[2], 10);
            const hasNote = Boolean(log?.note);
            const color = isFuture || status === 'unset' ? '#374151' : STATUS_COLOR[status];

            return (
              <div
                key={date}
                title={`${formatDateLabel(date)}: ${isFuture ? 'future' : status}${log?.note ? ` — ${log.note}` : ''}`}
                style={{
                  aspectRatio: '1',
                  borderRadius: 4,
                  background: isFuture || status === 'unset'
                    ? 'rgba(255,255,255,0.03)'
                    : STATUS_COLOR[status] + '1a',
                  border: `1px solid ${isFuture || status === 'unset' ? 'rgba(255,255,255,0.06)' : STATUS_COLOR[status] + '44'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  gap: 1,
                  opacity: isFuture ? 0.25 : 1,
                }}
              >
                <span style={{ fontSize: 11, color, lineHeight: 1, fontWeight: status !== 'unset' && !isFuture ? 600 : 400 }}>
                  {dayNum}
                </span>
                {status === 'clear' && <span style={{ fontSize: 8, color: '#4ade80', lineHeight: 1 }}>✓</span>}
                {status === 'failed' && <span style={{ fontSize: 8, color: '#ef4444', lineHeight: 1 }}>✗</span>}
                {status === 'skipped' && <span style={{ fontSize: 8, color: '#6b7280', lineHeight: 1 }}>—</span>}
                {/* Note dot */}
                {hasNote && (
                  <div style={{
                    position: 'absolute',
                    top: 3,
                    right: 3,
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: '#fbbf24',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { color: '#4ade80', label: 'CLEAR' },
            { color: '#ef4444', label: 'FAIL' },
            { color: '#6b7280', label: 'SKIP' },
            { color: '#374151', label: 'UNSET' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color + '55', border: `1px solid ${color}66` }} />
              <span style={{ fontSize: 9, color: '#6b7280', letterSpacing: 0.8 }}>{label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
            <span style={{ fontSize: 9, color: '#6b7280', letterSpacing: 0.8 }}>NOTE</span>
          </div>
        </div>

        {/* Month summary */}
        <div className="frame-cut" style={{ padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1.5, marginBottom: 12 }}>
            // {MONTH_NAMES[month].toUpperCase()} SUMMARY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'CLEARED', value: cleared, color: '#4ade80' },
              { label: 'FAILED', value: failed, color: '#ef4444' },
              { label: 'SKIPPED', value: skipped, color: '#6b7280' },
              { label: 'UNSET', value: unset, color: '#374151' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 8, color: '#6b7280', letterSpacing: 1, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, fontSize: 11, letterSpacing: 0.8 }}>
            {rate !== null ? (
              <span style={{ color: rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#ef4444' }}>
                CLEAR RATE: {rate}%
              </span>
            ) : (
              <span style={{ color: '#4b5563' }}>No decisions recorded this month</span>
            )}
          </div>
        </div>

        {/* Failure notes */}
        {failedDays.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: 1.5, marginBottom: 10 }}>
              // FAILURES THIS MONTH
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {failedDays.map(({ date, note }) => (
                <div
                  key={date}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(239,68,68,0.05)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#ef4444', letterSpacing: 0.4 }}>
                    ✗ {formatDateLabel(date)}
                  </div>
                  {note ? (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3, fontFamily: 'sans-serif', lineHeight: 1.4 }}>{note}</div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#374151', marginTop: 2, fontStyle: 'italic' }}>no note</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
