'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getDueConcepts } from '@/lib/db';

function VaultHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M7 12h4m4-5.5-4 4.5m4 4-4-3.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

const VAULT_TABS = [
  { href: '/knowledge',        label: 'Vault',  icon: <VaultHomeIcon />, exact: true  },
  { href: '/knowledge/review', label: 'Review', icon: <ReviewIcon />,    exact: false },
  { href: '/knowledge/graph',  label: 'Graph',  icon: <GraphIcon />,     exact: false },
  { href: '/knowledge/search', label: 'Search', icon: <SearchIcon />,    exact: false },
];

export function VaultSecondaryNav() {
  const pathname = usePathname();
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    getDueConcepts().then(c => setDueCount(c.length)).catch(() => {});
  }, [pathname]);

  return (
    <div
      className="flex -mx-4 mb-4 border-b overflow-x-auto"
      style={{ borderColor: '#1a2236' }}
    >
      {VAULT_TABS.map(tab => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

        const color = isActive ? '#f59e0b' : '#64748b';

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex items-center gap-1.5 px-4 py-2.5 flex-shrink-0 transition-colors"
            style={{ color }}
          >
            <span>{tab.icon}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold">{tab.label}</span>

            {/* Due badge on Review tab */}
            {tab.href === '/knowledge/review' && dueCount > 0 && (
              <span
                className="text-[9px] font-bold text-white rounded-full flex items-center justify-center leading-none"
                style={{ background: '#ef4444', minWidth: 16, height: 16, padding: '0 4px' }}
              >
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}

            {/* Active underline */}
            {isActive && (
              <span
                className="absolute bottom-0 left-3 right-3 rounded-full"
                style={{ height: 2, background: '#f59e0b' }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
