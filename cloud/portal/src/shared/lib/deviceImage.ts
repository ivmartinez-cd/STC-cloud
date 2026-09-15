/**
 * Resolución de la foto del equipo (ver public/device-images/README.md).
 *  1. /device-images/<slug(brand model)>.png
 *  2. coincidencia por palabra clave (KEYWORD_IMAGES)
 *  3. placeholder genérico según tipo (MFP / impresora)
 *
 * El directorio NO puede llamarse "devices" — colisiona con la ruta de
 * React Router `/devices`: nginx (`try_files $uri $uri/ /index.html`) la
 * resuelve como el directorio estático real y devuelve un 301 a `/devices/`
 * que además pierde el puerto (bug de nginx con `$host`), colgando la carga
 * directa/refresh de esa página.
 */
const KEYWORD_IMAGES: Array<[RegExp, string]> = [
  // Samsung
  [/SL-?M4020|M4020ND|M332x|382x 402x/i, 'samsung-sl-m4020nd.png'],
  [/SL-?M4072|M4072FD|SL-?M4070|M337x|387x 407x/i, 'samsung-sl-m4072fd.jpg'],
  [/X4300|K4300|X4250|K4250/i, 'samsung-x4300lx.jpg'],
  [/M5370|M4370|4370 5370/i, 'samsung-m5370lx.jpg'],
  [/SCX-?48[3-4]\d|SCX-?483x|5x3x/i, 'samsung-scx-483x-5x3x-series.jpg'],
  [/CLX-?626\d/i, 'samsung-clx-6260-series.jpg'],
  [/CLP-?68\d/i, 'samsung-clp-680-series.jpg'],
  // M458x: el hrDeviceDescr llega como "Samsung M458x Series" (resuelve por
  // slug), pero los que se identifican por su modelo comercial vienen como
  // SL-M4580FX / M4583FX.
  [/M458\d|M458x|SL-?M458/i, 'samsung-m458x-series.png'],
  // HP
  [/E475\d\d/i, 'hp-color-laserjet-mfp-e47528.png'],
  [/E526\d\d/i, 'hp-laserjet-mfp-e52645.png'],
  [/E786\d\d/i, 'hp-color-laserjet-mfp-e78625.png'],
  [/E400\d\d/i, 'hp-laserjet-e40040.png'],
  [/E501\d\d/i, 'hp-laserjet-e50145.jpg'],
  [/M479|M477|M478/i, 'hp-color-laserjet-pro-mfp-m479fdw.jpg'],
  [/M428|M429/i, 'hp-laserjet-pro-mfp-m428fdw.jpg'],
  [/\bM?432(fdn|fdw|f)?\b/i, 'hp-laser-mfp-432fdn.png'],
  // Lexmark
  [/\bX65[468]/i, 'lexmark-x656de.png'],
  [/\bT652/i, 'lexmark-t652.png'],
  [/\bT654/i, 'lexmark-t654.png'],
  [/\bMX410/i, 'lexmark-mx410de.png'],
  // El modelo que reportan los Lexmark trae serie y firmware pegados
  // ("Lexmark MX611dhe 70165PHH082ML LW50.SB7.P543"), así que el slug nunca
  // matchea y estos equipos SÓLO se resuelven por acá.
  [/\bMX61[01]/i, 'lexmark-mx611dhe.png'],
];

export function deviceSlug(brand: string | null | undefined, model: string | null | undefined): string {
  const raw = `${brand ?? ''} ${model ?? ''}`.trim().toLowerCase();
  // evitar "hp hp color laserjet…"
  const dedup = raw.replace(/^(\w+)\s+\1\b/, '$1');
  return dedup.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function isMfp(model: string | null | undefined): boolean {
  return /MFP|multifun|SCX|CLX|SL-?M\d{4}F|X\d{4}|LX\b|FX\b|\bX6\d\d|Flow/i.test(model ?? '');
}

/** Lista de candidatos en orden; el componente prueba uno por uno con onError. */
export function deviceImageCandidates(brand: string | null | undefined, model: string | null | undefined): string[] {
  const out: string[] = [];
  const slug = deviceSlug(brand, model);
  if (slug) out.push(`/device-images/${slug}.png`, `/device-images/${slug}.jpg`);
  for (const [rx, file] of KEYWORD_IMAGES) if (rx.test(model ?? '')) out.push(`/device-images/${file}`);
  out.push(isMfp(model) ? '/device-images/generic-mfp.svg' : '/device-images/generic-printer.svg');
  return [...new Set(out)];
}
