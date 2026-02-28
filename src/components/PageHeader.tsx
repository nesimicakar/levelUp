'use client';

import { useRouter } from 'next/navigation';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 bg-bg/95 backdrop-blur z-40 px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <button
          onClick={() => router.back()}
          className="text-text-muted hover:text-text transition-colors text-lg"
        >
          ←
        </button>
        <div>
          <h1 className="text-glow font-bold tracking-wider glow-text">{title}</h1>
          {subtitle && (
            <p className="text-text-muted text-xs">{subtitle}</p>
          )}
        </div>
      </div>
    </header>
  );
}
