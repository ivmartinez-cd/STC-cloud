// === Business Hours Helper ===
// Mon-Fri 08:00-18:00 Argentina time. Drives different scan frequencies.

export const INTERVALS = {
  discovery: { biz: 10 * 60_000,       off: 60 * 60_000 },
  meter:     { biz: 20 * 60_000,       off: 4 * 60 * 60_000 },
  supplies:  { biz: 60 * 60_000,       off: 4 * 60 * 60_000 },
} as const;

export function isBusinessHours(): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);

  const rawWeekday = (parts.find(p => p.type === 'weekday')?.value ?? '')
    .toLowerCase()
    .replace(/\.$/, '');

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);

  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
  if (!weekdays.includes(rawWeekday)) return false;
  return hour >= 8 && hour < 18;
}
