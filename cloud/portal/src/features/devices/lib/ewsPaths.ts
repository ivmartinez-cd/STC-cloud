/**
 * Rutas conocidas de la web embebida (EWS) por marca, para el acceso remoto
 * puntual del portal. Son las MISMAS que el motor de captura del agente usa en
 * cada vuelta de escaneo (`agent/src/capture/families/*.ts`): si el equipo está
 * sincronizando bien, estas rutas ya se sabe que responden en ese firmware.
 *
 * Lógica pura (sin React ni red) — testeada en `cloud/portal/tests/ewsResponse.test.ts`.
 */

export interface EwsPathPreset {
  label: string;
  path: string;
}

/** Tope del backend (`ewsProxySchema`); se valida acá también para no gastar un round-trip a la LAN del cliente. */
export const EWS_PATH_MAX_LENGTH = 500;

const HOME: EwsPathPreset = { label: 'Página principal', path: '/' };

const BY_BRAND: Array<{ match: RegExp; presets: EwsPathPreset[] }> = [
  {
    match: /hp|hewlett/i,
    presets: [
      { label: 'Configuración', path: '/DevMgmt/ProductConfigDyn.xml' },
      { label: 'Uso y contadores', path: '/DevMgmt/ProductUsageDyn.xml' },
      { label: 'Consumibles', path: '/DevMgmt/ConsumableConfigDyn.xml' },
      { label: 'Estado de consumibles', path: '/hp/device/info_suppliesStatus.html' },
    ],
  },
  {
    match: /samsung/i,
    presets: [
      { label: 'Home (SyncThru)', path: '/sws/app/information/home/home.json' },
      { label: 'Contadores', path: '/sws/app/information/counters/counters.json' },
      { label: 'Consumibles', path: '/sws/app/information/supplies/supplies.json' },
      { label: 'Alertas activas', path: '/sws/app/information/activealert/activealert.json' },
      { label: 'Home (XOA)', path: '/sws.application/home/homeDeviceInfo.sws' },
    ],
  },
  {
    match: /lexmark/i,
    presets: [
      { label: 'Info del equipo', path: '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html' },
      { label: 'Estado de la impresora', path: '/cgi-bin/dynamic/printer/PrinterStatus.html' },
      { label: 'Barra de estado', path: '/cgi-bin/dynamic/topbar.html' },
    ],
  },
];

/** Siempre la home primero; las de la marca sólo si se reconoce (Epson/Ricoh/etc. van con la home pelada). */
export function presetsFor(brand: string | null | undefined): EwsPathPreset[] {
  const family = BY_BRAND.find((b) => b.match.test(brand ?? ''));
  return [HOME, ...(family?.presets ?? [])];
}

/**
 * Acepta lo que el operador tenga a mano: una ruta (`/x`), una ruta sin barra
 * (`x`) o una URL completa copiada del navegador (`http://10.0.0.5/x?y=1`), de
 * la que se descarta el origen — la IP la resuelve el backend desde `devices`,
 * nunca el cliente. Los CR/LF se sacan porque el backend rechaza el pedido con
 * 400 si llegan (inyección de headers).
 */
export function normalizeEwsPath(raw: string): string {
  const withoutOrigin = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const clean = withoutOrigin.replace(/[\r\n]/g, '').trim();
  if (clean === '') return '/';
  return clean.startsWith('/') ? clean : `/${clean}`;
}
