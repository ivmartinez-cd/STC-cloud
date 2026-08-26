/** Helpers puros de formateo para la tabla de inventario — separados del JSX para que
 * los componentes se mantengan chicos (límite de 20 líneas/función de la guía). */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function brandBadge(brand: string | null): string {
  return brand ? brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '—' : '—';
}

/** "hace N min/h/d" — mismo estilo que `ClientsDirectoryTable.tsx` (minúsculas, sin
 * fecha completa para reportes viejos), reimplementado localmente a propósito: cruzar
 * a `features/clients/*` está prohibido (`arch-portal`). */
export function formatLastContact(iso: string | null): string {
  if (!iso) return 'sin contacto';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} d`;
}
