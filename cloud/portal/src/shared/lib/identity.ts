/** Iniciales/badge de marca (handoff hifi #3, 26/08/2026) — promovido a
 * `shared/` desde `features/devices/components/deviceDirectoryFormat.ts`,
 * duplicado a propósito 4 veces por el guard `arch-portal` (bloquea imports
 * cross-feature) mientras vivió dentro de una feature. Ahora que es
 * compartido, las 9 pantallas nuevas importan de acá en vez de sumar una
 * 5ta copia. Las copias viejas quedan donde están — no se tocan pantallas
 * ya entregadas por esto. */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function brandBadge(brand: string | null): string {
  return brand ? brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '—' : '—';
}
