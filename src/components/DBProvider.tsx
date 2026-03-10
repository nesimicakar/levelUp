'use client';

import { useEffect, useState } from 'react';
import { seedIfNeeded } from '@/lib/db/seed';
import { getToday, getSettings } from '@/lib/db';
import { evaluateRankIfNeeded } from '@/lib/logic/rankOrchestrator';
import { OnboardingModal } from '@/components/OnboardingModal';

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    seedIfNeeded()
      .then(() => evaluateRankIfNeeded(getToday()))
      .then(() => getSettings())
      .then(s => {
        if (!s.hasOnboarded) setShowOnboarding(true);
        setReady(true);
      });
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

  if (showOnboarding) {
    return <OnboardingModal onComplete={() => setShowOnboarding(false)} />;
  }

  return <>{children}</>;
}
