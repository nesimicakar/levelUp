export function formatLocalYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayLocal(): string {
  return formatLocalYYYYMMDD(new Date());
}

export function getYesterdayLocal(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const anchor = new Date(y, m - 1, d, 12, 0, 0);
  anchor.setDate(anchor.getDate() - 1);
  return formatLocalYYYYMMDD(anchor);
}

/**
 * Returns today always. Returns yesterday only during the grace window (00:00–02:59 local).
 */
export function getLoggableDates(now?: Date): { today: string; yesterday?: string } {
  const date = now ?? new Date();
  const today = formatLocalYYYYMMDD(date);
  if (date.getHours() < 3) {
    return { today, yesterday: getYesterdayLocal(today) };
  }
  return { today };
}
