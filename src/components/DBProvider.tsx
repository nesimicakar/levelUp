'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { seedIfNeeded } from '@/lib/db/seed';
import { getToday, getSettings } from '@/lib/db';
import { evaluateRankIfNeeded } from '@/lib/logic/rankOrchestrator';

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    seedIfNeeded()
      .then(() => evaluateRankIfNeeded(getToday()))
      .then(() => getSettings())
      .then(s => {
        // First-time: route to the new diegetic onboarding at /guide.
        // Don't redirect if we're already there (would loop).
        if (!s.hasOnboarded && pathname !== '/guide') {
          router.replace('/guide');
        }
        setReady(true);
      });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-svh">
        <div className="text-glow text-lg tracking-widest animate-pulse">
          INITIALIZING SYSTEM...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
