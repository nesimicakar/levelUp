'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';

const NAFILE_PRAYERS = [
  { id: 'evvabin',  label: 'Evvâbin' },
  { id: 'kusluk',   label: 'Kuşluk (Duhâ)' },
  { id: 'teheccud', label: 'Teheccüd' },
] as const;

interface PrayerSummary {
  total: number;
  firstDate: string | null;
  lastDate: string | null;
}

export default function NafileSummaryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Record<string, PrayerSummary>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const logs = await db.nafileLogs.orderBy('date').toArray();
      const result: Record<string, PrayerSummary> = {};
      for (const p of NAFILE_PRAYERS) {
        result[p.id] = { total: 0, firstDate: null, lastDate: null };
      }
      for (const log of logs) {
        for (const [id, done] of Object.entries(log.prayers)) {
          if (done && result[id]) {
            result[id].total++;
            if (!result[id].firstDate) result[id].firstDate = log.date;
            result[id].lastDate = log.date;
          }
        }
      }
      setSummary(result);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return null;

  return (
    <div>
      <main className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="text-text-muted hover:text-text transition-colors text-lg flex-shrink-0"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <h1
              className="font-display text-xl font-bold leading-none"
              style={{ color: 'var(--color-stat-per)', textShadow: '0 0 10px rgba(167,139,250,0.5)' }}
            >
              NAFILE
            </h1>
            <p className="text-text-muted text-[10px] tracking-[0.18em] uppercase mt-1">Voluntary Prayers</p>
          </div>
        </div>

        <div className="section-heading text-text-muted mt-2">// LIFETIME TOTALS</div>

        <div className="space-y-2">
          {NAFILE_PRAYERS.map(p => {
            const s = summary[p.id] ?? { total: 0, firstDate: null, lastDate: null };
            return (
              <div key={p.id} className="frame-cut p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="font-display font-semibold text-sm text-text">{p.label}</div>
                    {s.firstDate && (
                      <div className="text-text-muted text-[10px] tracking-[0.12em] mt-1.5 space-y-0.5">
                        <div>First: <span className="text-text-dim">{s.firstDate}</span></div>
                        {s.lastDate !== s.firstDate && (
                          <div>Last: <span className="text-text-dim">{s.lastDate}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className="font-display font-bold text-3xl leading-none flex-shrink-0"
                    style={{
                      color: s.total > 0 ? 'var(--color-stat-per)' : 'var(--color-text-muted)',
                      textShadow: s.total > 0 ? '0 0 10px rgba(167,139,250,0.4)' : 'none',
                    }}
                  >
                    {s.total}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
