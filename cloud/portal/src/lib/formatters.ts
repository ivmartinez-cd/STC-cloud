export function formatRelativeTime(ts: string | null, now = Date.now()): string {
  if (!ts) return 'Nunca';
  const min = Math.floor((now - new Date(ts).getTime()) / 60_000);
  if (min < 2)  return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return new Date(ts).toLocaleString('es-AR');
}

export function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}
