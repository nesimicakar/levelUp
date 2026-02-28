'use client';

import { useEffect, useState } from 'react';
import { seedIfNeeded } from '@/lib/db/seed';

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfNeeded().then(() => setReady(true));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-glow text-lg tracking-widest animate-pulse">
          INITIALIZING SYSTEM...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
