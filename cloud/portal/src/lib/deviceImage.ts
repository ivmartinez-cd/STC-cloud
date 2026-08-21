/**
 * Resolución de la foto del equipo (ver public/devices/README.md).
 *  1. /devices/<slug(brand model)>.png
 *  2. coincidencia por palabra clave (KEYWORD_IMAGES)
 *  3. placeholder genérico según tipo (MFP / impresora)
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
  // HP
  [/E475\d\d/i, 'hp-color-laserjet-mfp-e47528.png'],
  [/E526\d\d/i, 'hp-laserjet-mfp-e52645.png'],
  [/E786\d\d/i, 'hp-color-laserjet-mfp-e78625.png'],
  [/E400\d\d/i, 'hp-laserjet-e40040.png'],
  [/E501\d\d/i, 'hp-laserjet-e50145.jpg'],
  [/M479|M477|M478/i, 'hp-color-laserjet-pro-mfp-m479fdw.jpg'],
  [/M428|M429/i, 'hp-laserjet-pro-mfp-m428fdw.jpg'],
  // Lexmark
  [/\bX65[468]/i, 'lexmark-x656de.png'],
  [/\bT652/i, 'lexmark-t652.png'],
  [/\bT654/i, 'lexmark-t654.png'],
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
  if (slug) out.push(`/devices/${slug}.png`, `/devices/${slug}.jpg`);
  for (const [rx, file] of KEYWORD_IMAGES) if (rx.test(model ?? '')) out.push(`/devices/${file}`);
  out.push(isMfp(model) ? '/devices/generic-mfp.svg' : '/devices/generic-printer.svg');
  return [...new Set(out)];
}
