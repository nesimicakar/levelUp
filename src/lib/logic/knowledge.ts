import type { KnowledgeConcept, ReviewRating } from '@/types';

export interface ReviewResult {
  newRetention: number;
  newIntervalDays: number;
  nextReviewAt: number;
}

const RETENTION_DELTA: Record<ReviewRating, number> = {
  again: -20,
  hard:    5,
  good:   15,
  easy:   25,
};

const INTERVAL_MULT: Record<ReviewRating, number> = {
  again: 0,   // reset to 1
  hard:  1.2,
  good:  2.5,
  easy:  4.0,
};

export function computeNextReview(concept: KnowledgeConcept, rating: ReviewRating): ReviewResult {
  const newRetention = Math.min(100, Math.max(0, concept.retentionScore + RETENTION_DELTA[rating]));
  const newInterval = rating === 'again'
    ? 1
    : Math.max(1, Math.ceil(concept.reviewIntervalDays * INTERVAL_MULT[rating]));
  const nextReviewAt = Date.now() + newInterval * 24 * 60 * 60 * 1000;
  return { newRetention, newIntervalDays: newInterval, nextReviewAt };
}

export function nextIntervalLabel(concept: KnowledgeConcept, rating: ReviewRating): string {
  if (rating === 'again') return '<1d';
  const days = Math.max(1, Math.ceil(concept.reviewIntervalDays * INTERVAL_MULT[rating]));
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

export function retentionColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

export function retentionLabel(score: number): string {
  if (score >= 80) return 'STRONG';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'FAIR';
  if (score >  0)  return 'WEAK';
  return 'NEW';
}

export function avgRetention(concepts: KnowledgeConcept[]): number {
  const reviewed = concepts.filter(c => c.reviewCount > 0);
  if (!reviewed.length) return 0;
  return Math.round(reviewed.reduce((s, c) => s + c.retentionScore, 0) / reviewed.length);
}

export function getDueCount(concepts: KnowledgeConcept[]): number {
  const now = Date.now();
  return concepts.filter(c => c.nextReviewAt <= now).length;
}

export function uniqueSources(concepts: KnowledgeConcept[]): number {
  return new Set(concepts.map(c => c.sourceTitle).filter(Boolean)).size;
}

export function reviewStreakDays(reviews: Array<{ date: string }>): number {
  if (!reviews.length) return 0;
  const today = new Date().toISOString().split('T')[0];
  const dates = [...new Set(reviews.map(r => r.date))].sort().reverse();
  let streak = 0;
  let cursor = today;
  for (const d of dates) {
    if (d === cursor) {
      streak++;
      const prev = new Date(cursor + 'T12:00:00');
      prev.setDate(prev.getDate() - 1);
      cursor = prev.toISOString().split('T')[0];
    } else if (d < cursor) {
      break;
    }
  }
  return streak;
}

export function estMinutes(count: number): number {
  return Math.max(1, Math.ceil(count * 0.7));
}

export const DOMAIN_COLORS = [
  '#a78bfa', // violet
  '#60a5fa', // blue
  '#34d399', // emerald
  '#f59e0b', // amber
  '#f87171', // red
  '#fb923c', // orange
  '#38bdf8', // sky
  '#c084fc', // purple
  '#4ade80', // green
  '#e879f9', // fuchsia
];

export const DOMAIN_ICONS = [
  '🧠', '📚', '🔬', '💼', '🕌', '⚡', '🌍', '🤖', '🎯', '💡',
  '🏛️', '🎭', '🌿', '🔭', '💰', '🧬', '🎨', '⚔️', '🧘', '📖',
];

export const SOURCE_LABELS: Record<string, string> = {
  book:     'BOOK',
  course:   'COURSE',
  recall:   'RECALL',
  yuno:     'YUNO',
  memoryos: 'MEMORYOS',
  note:     'NOTE',
  manual:   'MANUAL',
};

export function conceptCode(id: string): string {
  return '#C-' + id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'TODAY';
  if (d === 1) return '1D AGO';
  if (d < 30) return `${d}D AGO`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}MO AGO`;
  return `${Math.floor(m / 12)}Y AGO`;
}

export function nextReviewLabel(nextReviewAt: number): string {
  const diff = nextReviewAt - Date.now();
  const d = Math.ceil(diff / 86400000);
  if (d <= 0) return 'DUE NOW';
  if (d === 1) return '+1d';
  if (d < 30) return `+${d}d`;
  return `+${Math.round(d / 7)}w`;
}
