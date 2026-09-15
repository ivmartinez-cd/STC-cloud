// Fase 4: OIDs SNMP por Marca (secciones 7.1 - 7.5 del PDF)

export type Brand = 'hp' | 'lexmark' | 'samsung' | 'ricoh' | 'brother' | 'xerox' | 'epson' | 'generic';

// ─── Deteccion de fabricante por sysObjectID (seccion 6.3) ──────────────────

const ENTERPRISE_PREFIXES: Array<[string, Brand]> = [
  ['1.3.6.1.4.1.11.',   'hp'],       // Hewlett-Packard (enterprise 11)
  ['1.3.6.1.4.1.641.',  'lexmark'],  // Lexmark International (enterprise 641)
  ['1.3.6.1.4.1.236.',  'samsung'],  // Samsung Electronics (enterprise 236)
  ['1.3.6.1.4.1.367.',  'ricoh'],    // Ricoh (enterprise 367)
  ['1.3.6.1.4.1.2435.', 'brother'],  // Brother (enterprise 2435)
  ['1.3.6.1.4.1.253.',  'xerox'],    // Xerox (enterprise 253)
  ['1.3.6.1.4.1.1248.', 'epson'],    // Seiko Epson (enterprise 1248)
];

export function detectBrandFromOid(sysObjectId: string): Brand {
  for (const [prefix, brand] of ENTERPRISE_PREFIXES) {
    if (sysObjectId.startsWith(prefix)) return brand;
  }
  return 'generic';
}

export function detectBrandFromText(text: string): Brand {
  const t = text.toLowerCase();
  if (t.includes('hp') || t.includes('hewlett')) return 'hp';
  if (t.includes('lexmark')) return 'lexmark';
  if (t.includes('samsung')) return 'samsung';
  if (t.includes('ricoh')) return 'ricoh';
  if (t.includes('brother')) return 'brother';
  if (t.includes('xerox')) return 'xerox';
  if (t.includes('epson')) return 'epson';
  return 'generic';
}

// ─── Estructura de OIDs por marca ────────────────────────────────────────────

export interface OidMap {
  totalPages:  string[];
  monoPages:   string[];
  colorPages:  string[];
  serial:      string[];
  /** Versión de firmware principal (OIDs privados; se complementan con Entity-MIB y hrSWInstalledName). */
  firmware?:   string[];
}

export const GENERIC_OIDS: OidMap = {
  totalPages: ['1.3.6.1.2.1.43.10.2.1.4.1.1'],
  monoPages:  ['1.3.6.1.2.1.43.10.2.1.4.1.1'],
  colorPages: [],
  serial:     ['1.3.6.1.2.1.43.5.1.1.17.1', '1.3.6.1.2.1.47.1.1.1.1.11.1'],
  firmware:   ['1.3.6.1.2.1.47.1.1.1.1.9.1', '1.3.6.1.2.1.47.1.1.1.1.10.1'], // Entity-MIB
};

export const HP_OIDS: OidMap = {
  totalPages: [
    '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5',
    '1.3.6.1.2.1.43.10.2.1.4.1.1', // HP Contador Total fallback / PWG
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.16.1.1.1.2.1.0',
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.16.1.1.1.4.1.0'
  ],
  monoPages: [
    '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.7', 
    '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.6.0',
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.16.1.20.1.26.0',
    '1.3.6.1.2.1.43.10.2.1.4.1.1'
  ],
  colorPages: [
    '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.6',
    '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.7.0',
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.16.1.20.2.26.0'
  ],
  serial: [
    '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.20',
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.3.0',
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.1.4.0',
    '1.3.6.1.2.1.43.5.1.1.17.1',   // Standard Printer-MIB serial
    '1.3.6.1.2.1.47.1.1.1.1.11.1'  // Standard Entity-MIB serial
  ],
  firmware: [
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.6.0', // FutureSmart: bundle version (ej. 2509515_000481)
    '1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.5.0', // datecode (ej. 20260311)
    '1.3.6.1.2.1.47.1.1.1.1.9.1', '1.3.6.1.2.1.47.1.1.1.1.10.1',
  ],
};

export const LEXMARK_OIDS: OidMap = {
  totalPages: [
    '1.3.6.1.4.1.641.2.1.5.1.0',
    '1.3.6.1.2.1.43.10.2.1.4.1.1' // PWG Total Fallback
  ],
  monoPages: [
    '1.3.6.1.4.1.641.6.4.2.1.1.4.1.5',
    '1.3.6.1.4.1.641.2.1.5.2.0'
  ],
  colorPages: [
    '1.3.6.1.4.1.641.2.1.5.3.0',
    '1.3.6.1.4.1.641.6.4.2.1.1.4.1.6'
  ],
  serial: [
    '1.3.6.1.4.1.641.2.1.1.1.13.1',
    '1.3.6.1.4.1.641.2.1.2.1.6.1',
    '1.3.6.1.2.1.43.5.1.1.17.1',
    '1.3.6.1.2.1.47.1.1.1.1.11.1'
  ],
  firmware: [
    '1.3.6.1.4.1.641.2.1.2.1.4.1', // printer firmware level (ej. LR.MN.P840-0)
    '1.3.6.1.2.1.47.1.1.1.1.9.1', '1.3.6.1.2.1.47.1.1.1.1.10.1',
  ],
};

export const SAMSUNG_OIDS: OidMap = {
  totalPages: [
    '1.3.6.1.4.1.236.11.5.11.81.1.0',
    '1.3.6.1.2.1.43.10.2.1.4.1.1',               // PWG Total (muy confiable en Samsung)
    '1.3.6.1.4.1.236.11.5.11.53.11.2.1.2.1.2.1', // Alternativo para Total (SCX-483x)
    '1.3.6.1.4.1.236.11.5.11.53.11.1.2.0'        // Fallback a Mono si no hay Total
  ],
  monoPages: [
    '1.3.6.1.4.1.236.11.5.11.53.11.1.2.0',
    '1.3.6.1.4.1.236.11.5.11.53.11.2.1.2.1.2.1' // Alternativo para Mono
  ],
  colorPages: [
    '1.3.6.1.4.1.236.11.5.11.81.2.0',
    '1.3.6.1.4.1.236.11.5.11.53.11.1.1.0'
  ],
  serial: [
    '1.3.6.1.4.1.236.11.5.1.1.1.4.0',
    '1.3.6.1.2.1.43.5.1.1.17.1',
    '1.3.6.1.2.1.47.1.1.1.1.11.1'
  ],
  firmware: [
    '1.3.6.1.4.1.236.11.5.1.1.1.2.0', // SyncThru: versión principal (ej. V2.00.01.14 MAY-13-2011)
    '1.3.6.1.2.1.47.1.1.1.1.9.1', '1.3.6.1.2.1.47.1.1.1.1.10.1',
  ],
};

export const RICOH_OIDS: OidMap = {
  totalPages: [
    '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.1',
    '1.3.6.1.2.1.43.10.2.1.4.1.1'
  ],
  monoPages:  [
    '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.3',
    '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.9'
  ],
  colorPages: [
    '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.4',
    '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.5',
    '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.11'
  ],
  serial: [
    '1.3.6.1.4.1.367.3.2.1.2.1.4.0',
    '1.3.6.1.4.1.367.3.2.1.6.1.1.7.1',
    '1.3.6.1.2.1.43.5.1.1.17.1',
    '1.3.6.1.2.1.47.1.1.1.1.11.1'
  ]
};

export const BROTHER_OIDS: OidMap = {
  totalPages: [
    '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.10.0',
    '1.3.6.1.2.1.43.10.2.1.4.1.1'
  ],
  monoPages:  ['1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0'],
  colorPages: ['1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.9.0'],
  serial:     [
    '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.1.0',
    '1.3.6.1.2.1.43.5.1.1.17.1',
    '1.3.6.1.2.1.47.1.1.1.1.11.1'
  ]
};

export const XEROX_OIDS: OidMap = {
  totalPages: ['1.3.6.1.2.1.43.10.2.1.4.1.1'],
  monoPages:  ['1.3.6.1.4.1.253.8.53.13.2.1.6.1.20.33'],
  colorPages: ['1.3.6.1.4.1.253.8.53.13.2.1.6.1.20.34'],
  serial:     [
    '1.3.6.1.4.1.253.8.53.3.2.1.3.1',
    '1.3.6.1.2.1.43.5.1.1.17.1',
    '1.3.6.1.2.1.47.1.1.1.1.11.1'
  ]
};

/**
 * Epson: deliberadamente el Printer-MIB estándar, no OIDs propietarios.
 * El enterprise 1248 de Epson sí existe, pero no tenemos ningún OID de
 * contadores suyo verificado contra un equipo real, y un OID inventado
 * devuelve null en silencio (o peor, el número equivocado). El desglose
 * mono/color lo da el EWS (`families/epson-webconfig.ts`), que además es más
 * rico que cualquier MIB: trae por tamaño y por función.
 */
export const EPSON_OIDS: OidMap = GENERIC_OIDS;

export const OID_MAPS: Record<Brand, OidMap> = {
  hp:      HP_OIDS,
  lexmark: LEXMARK_OIDS,
  samsung: SAMSUNG_OIDS,
  ricoh:   RICOH_OIDS,
  brother: BROTHER_OIDS,
  xerox:   XEROX_OIDS,
  epson:   EPSON_OIDS,
  generic: GENERIC_OIDS,
};

// OIDs de sistema — universales para identificacion inicial
export const SYS_OIDS = {
  sysDescr:     '1.3.6.1.2.1.1.1.0',
  sysObjectID:  '1.3.6.1.2.1.1.2.0',
  sysName:      '1.3.6.1.2.1.1.5.0',
  hrStatus:     '1.3.6.1.2.1.25.3.5.1.1.1',
  hrErrorState: '1.3.6.1.2.1.25.3.5.1.2.1',
  hrDeviceType: '1.3.6.1.2.1.25.3.2.1.2.1',
};

export const HR_DEVICE_PRINTER = '1.3.6.1.2.1.25.3.1.5';

// Mapa de estado hrPrinterStatus → string legible (RFC 2790 §4.2)
export const HR_STATUS_MAP: Record<number, string> = {
  1: 'other', 2: 'unknown', 3: 'idle', 4: 'printing', 5: 'warmup', 6: 'stopped',
};
