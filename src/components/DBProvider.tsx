'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { seedIfNeeded } from '@/lib/db/seed';
import { getToday, getSettings, reconcileCharacterLinkage, repairCharacterStartDates, getActiveCharacter } from '@/lib/db';
import { evaluateRankIfNeeded } from '@/lib/logic/rankOrchestrator';
import { masteryMomentSeen, markMasteryMomentSeen } from '@/lib/logic/characters';

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    seedIfNeeded()
      // Self-heals installs left inconsistent by a restore that bypassed the v11
      // upgrade path. Early-returns when already consistent, so this is cheap.
      .then(() => reconcileCharacterLinkage())
      // Corrects start dates left stale by a restore that swapped in a different
      // settings row. Runs unconditionally — linkage can be consistent while
      // startedAt is still wrong, so it must not sit behind the linkage check.
      .then(() => repairCharacterStartDates())
      .then(() => evaluateRankIfNeeded(getToday()))
      .then(() => getSettings())
      .then(async s => {
        // First-time: route to the new diegetic onboarding at /guide.
        // Don't redirect if we're already there (would loop).
        if (!s.hasOnboarded && pathname !== '/guide') {
          router.replace('/guide');
          setReady(true);
          return;
        }

        // Character Mastered is a triggered full-screen moment, not something the
        // user has to notice and tap. Present it automatically the first time we
        // see this character mastered — once per character, so it's a moment
        // rather than a nag they can't navigate away from. The home-page CTA
        // remains as the permanent way back in.
        const character = await getActiveCharacter();
        if (
          character.status === 'mastered' &&
          character.id !== undefined &&
          !masteryMomentSeen(character.id) &&
          pathname !== '/achievements/mastery'
        ) {
          markMasteryMomentSeen(character.id);
          router.replace('/achievements/mastery');
        }
        setReady(true);
      })
      .catch(err => {
        console.error('[DBProvider] init error:', err);
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
