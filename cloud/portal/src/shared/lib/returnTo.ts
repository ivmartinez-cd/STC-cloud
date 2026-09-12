/**
 * Validación del `?from=` con el que una ficha vuelve a la pantalla de origen.
 *
 * El valor viene de la URL, o sea del usuario: sin validarlo, `?from=//evil.com`
 * o `?from=https://evil.com` convertirían el breadcrumb en un open redirect
 * (React Router navega a un destino externo y el link se ve legítimo porque lo
 * sirve nuestro dominio). Por eso se acepta SÓLO un path interno de una sección
 * conocida del portal, y no basta con "empieza con `/`": `//evil.com` también
 * empieza con `/` y el navegador lo resuelve como protocol-relative, igual que
 * `/\evil.com` en varios navegadores.
 *
 * Los query params del origen viajan dentro del `from` (los listados guardan
 * filtro/orden/página en la URL), así que volver restaura la vista tal cual.
 */

/** Primer segmento de las rutas declaradas en `App.tsx` a las que tiene sentido volver. */
const ALLOWED_ROOTS = new Set([
  'monitors', 'clients', 'devices', 'alerts', 'incidents', 'activity', 'supplies', 'reports', 'pending',
]);

const ROOT_LABELS: Record<string, string> = {
  monitors: 'Monitor',
  clients: 'Clientes',
  devices: 'Inventario',
  alerts: 'Alertas',
  incidents: 'Incidentes',
  activity: 'Movimientos',
  supplies: 'Consumibles',
  reports: 'Reportes',
  pending: 'Pendientes',
};

function rootOf(target: string): string {
  return target.split(/[?#]/)[0].split('/')[1] ?? '';
}

/** El `from` crudo si es un path interno seguro; `undefined` si no. */
export function safeReturnTo(raw: string | null | undefined): string | undefined {
  if (!raw || raw[0] !== '/') return undefined;
  // `//host` y `/\host`: protocol-relative, salen del portal.
  if (raw[1] === '/' || raw[1] === '\\') return undefined;
  const path = raw.split(/[?#]/)[0];
  if (path.split('/').includes('..')) return undefined;
  return ALLOWED_ROOTS.has(rootOf(path)) ? raw : undefined;
}

/** Nombre de la pantalla de origen, para el link de vuelta. */
export function returnToLabel(target: string): string {
  return ROOT_LABELS[rootOf(target)] ?? 'la pantalla anterior';
}

/**
 * `from=<url actual>` listo para pegar a un link — la URL incluye los filtros vigentes.
 *
 * Se descarta el `from` que la pantalla actual pudiera tener: si no, cada salto
 * anidaría el anterior (`/monitors/x?from=/clients/y%3Ffrom%3D%252Fclients`) y la
 * URL crecería en cada nivel. Con un solo nivel alcanza: se vuelve a la pantalla
 * de la que se vino, y de ahí el breadcrumb sigue su propio camino.
 */
export function returnParamFor(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete('from');
  const query = params.toString();
  return `from=${encodeURIComponent(`${pathname}${query ? `?${query}` : ''}`)}`;
}
