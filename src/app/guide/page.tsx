'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSettings } from '@/lib/db';

const STEPS = [
  {
    title: 'LEVEL UP',
    text: 'You have 5 targets today.\nComplete them.\nHit 100%.',
    subtext: '',
    button: 'CONTINUE',
  },
  {
    title: 'HOW IT WORKS',
    text: 'Each section is one task.',
    subtext: 'Tap it.\nFinish it.\n\nThat\'s progress.',
    button: 'CONTINUE',
  },
  {
    title: 'START NOW',
    text: 'Open SYSTEM.',
    subtext: 'Pick any section.\nComplete it.\n\nDon\'t skip the day.',
    button: 'ENTER SYSTEM',
  },
] as const;

export default function GuidePage() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const current = STEPS[step];

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      await updateSettings({ hasOnboarded: true });
      localStorage.setItem('onboardingComplete', 'true');
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-bg">
      {/* Step indicator */}
      <div className="flex gap-2 mb-10">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === step ? 'w-6 bg-glow' : 'w-2 bg-border'
            }`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="stat-card rounded-xl glow-border px-8 py-10 text-center w-full max-w-sm">
        <p className="text-[10px] tracking-widest text-text-muted uppercase mb-4">
          {step + 1} / {STEPS.length}
        </p>
        <h1 className="text-2xl font-bold tracking-widest glow-text mb-6">
          {current.title}
        </h1>
        <p className="text-sm text-text-dim leading-relaxed whitespace-pre-line mb-4">
          {current.text}
        </p>
        <p className="text-xs text-text-muted leading-relaxed whitespace-pre-line">
          {current.subtext}
        </p>
      </div>

      {/* Button */}
      <button
        onClick={handleNext}
        className="mt-8 w-full max-w-sm p-4 rounded-lg bg-glow/10 border border-glow/30 text-glow font-medium tracking-widest hover:bg-glow/20 transition-colors text-sm"
      >
        {current.button}
      </button>
    </div>
  );
}
