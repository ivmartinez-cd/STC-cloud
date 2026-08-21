/**
 * Contratos del motor de captura por modelo ("capture drivers").
 *
 * Arquitectura (alineada con plataformas MPS de primer nivel — HP SDS, FMAudit, MPS Monitor):
 *
 *   identify()  →  resolve()  →  collect(scopes)  →  normalize()
 *
 *  - Una **familia** (`CaptureFamily`) encapsula la lógica de protocolo compartida por un firmware
 *    (p. ej. Samsung SyncThru JSON, HP DevMgmt XML, Printer-MIB RFC 3805).
 *  - Un **perfil de modelo** (`ModelProfile`) es un archivo declarativo por impresora: cómo se reconoce,
 *    qué familia usa, qué capacidades se esperan y qué quirks/hook aplica. Vive en `capture/models/<marca>/`.
 *  - El resultado (`CaptureResult`) es un objeto rico por *scope* (identidad, contadores, insumos,
 *    alertas, bandejas) que `normalize.ts` aplana al contrato `DeviceReading` que ya entiende el servidor.
 *
 * Reglas: TypeScript estricto (sin `any`), todo opcional es `null`/`undefined` explícito, y ninguna
 * familia escribe de forma directa en el contrato del servidor — siempre a través de `CaptureResult`.
 */

import type { Brand } from '../snmp/oids';
import type { SuppliesDetails, SuppliesItem, InputTrayInfo, OutputTrayInfo, DetailedCounters, DeviceExtraInfo } from '../snmp/ews-parsers/types';
import type { SnmpClient } from './transport/snmp';

export type { Brand, SuppliesDetails, SuppliesItem, InputTrayInfo, OutputTrayInfo, DetailedCounters, DeviceExtraInfo };

/** Método/protocolo con el que se obtuvo un dato. Mismo dominio que `devices.poll_method` en el servidor. */
export type PollMethod = 'snmp' | 'pjl' | 'ews' | 'ipp' | 'unknown';

/** Ámbitos de captura. Se corresponden 1:1 con los loops de monitoreo (HP SDS: Identity / Meter / Consumables / Alert / Tray). */
export type CaptureScope = 'identity' | 'meters' | 'supplies' | 'alerts' | 'trays';

export const ALL_SCOPES: readonly CaptureScope[] = ['identity', 'meters', 'supplies', 'alerts', 'trays'];

/** Puertos TCP de interés para precalificar un host como impresora. */
export interface PortMap {
  jetdirect: boolean; // 9100
  ipp:       boolean; // 631
  http:      boolean; // 80
  https:     boolean; // 443
}

/** Identidad mínima de un dispositivo, obtenida con el método más barato disponible. */
export interface DeviceIdentity {
  ip:           string;
  brand:        Brand;
  model:        string | null;
  serial:       string | null;
  sysObjectId?: string | null;
  sysDescr?:    string | null;
  sysName?:     string | null;
  hostname?:    string | null;
  mac?:         string | null;
  location?:    string | null;
  firmware?:    string | null;
  /** Número de producto / SKU (p. ej. HP 3QA75A). */
  sku?:         string | null;
  /** Protocolo que resolvió la identidad. */
  source:       PollMethod;
}

export interface MeterReading {
  total:   number | null;
  mono:    number | null;
  color:   number | null;
  /** Desglose opcional (simplex/duplex, copias, reportes, etc.). */
  detail?: DetailedCounters;
  source:  PollMethod;
}

export type TonerColor = 'black' | 'cyan' | 'magenta' | 'yellow';

export interface SuppliesReading {
  toners:       Partial<Record<TonerColor, SuppliesItem>>;
  drums?:       Partial<Record<TonerColor, SuppliesItem>>;
  maintenance?: SuppliesDetails['maintenance'];
  source:       PollMethod;
}

export interface AlertItem {
  code?:        string;
  description?: string;
  severity?:    'INFO' | 'WARNING' | 'ERROR' | string;
  time?:        string;
}

export interface TraysReading {
  input?:  InputTrayInfo[];
  output?: OutputTrayInfo[];
  source:  PollMethod;
}

/** Resultado parcial de una familia. Cada scope es independiente y puede faltar. */
export interface CaptureResult {
  identity?: Partial<DeviceIdentity>;
  meters?:   MeterReading;
  supplies?: SuppliesReading;
  alerts?:   AlertItem[];
  trays?:    TraysReading;
  /** Datos extra del dispositivo sin columna propia (SKU, firmware detallado, RAM…). */
  device?:   DeviceExtraInfo;
  /** Método "principal" con el que se obtuvieron los contadores (para `poll_method`). */
  method:    PollMethod;
}

/** Contexto que reciben las familias. Abstrae red para que sean testeables con fixtures. */
export interface CaptureContext {
  ip:        string;
  community: string;
  ports:     PortMap;
  identity:  DeviceIdentity;
  /** GET HTTP/S al EWS (sigue redirecciones, descomprime gzip, `null` si falla). */
  http:      (path: string, protocol?: 'http' | 'https') => Promise<string | null>;
  /** Cliente SNMP perezoso: abre sesión al primer uso y la cierra al final del ciclo. */
  snmp:      SnmpClient;
  /** Lector PJL (puerto 9100). */
  pjl:       () => Promise<{ totalPages: number | null; model: string | null; serial: string | null } | null>;
  /** Lector IPP (puerto 631). */
  ipp:       () => Promise<{ name: string | null; model: string | null; serial: string | null } | null>;
  /** Perfil de modelo resuelto (si lo hay). Permite a la familia aplicar quirks declarados. */
  profile?:  ModelProfile;
  log?:      (level: 'INFO' | 'WARN' | 'DEBUG', msg: string) => void;
}

/** Criterios declarativos para reconocer un modelo o familia. */
export interface IdentityMatch {
  /** RegExp contra `model`, `sysDescr` y `sysName` (cualquiera que matchee). */
  model?:        RegExp;
  /** Prefijo de sysObjectID (p. ej. `1.3.6.1.4.1.236.`). */
  sysObjectId?:  string | RegExp;
  /** Si el modelo coincide con esto, el perfil NO aplica (para perfiles "legado" amplios). */
  exclude?:      RegExp;
  brand?:        Brand;
}

export interface CaptureFamily {
  /** Identificador estable, p. ej. `samsung.syncthru`. Se persiste en `known_devices.driver`. */
  id:           string;
  brand:        Brand;
  displayName:  string;
  /** Scopes que la familia sabe obtener. */
  capabilities: readonly CaptureScope[];
  /**
   * Puntaje de afinidad 0–100 dado identidad + puertos. 0 = no aplica.
   * Se usa cuando no hay perfil de modelo explícito.
   */
  score(identity: DeviceIdentity, ports: PortMap): number;
  /**
   * Sonda de identidad barata cuando SNMP no está disponible (1–2 requests EWS).
   * Debe devolver `null` rápido si el host no pertenece a la familia.
   */
  probeIdentity?(ctx: Omit<CaptureContext, 'identity' | 'profile'>): Promise<Partial<DeviceIdentity> | null>;
  /** Captura los scopes pedidos. Debe ser tolerante: lo que no pueda, lo omite. */
  collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null>;
}

export interface ModelExpectations {
  color?:   boolean;
  duplex?:  boolean;
  adf?:     boolean;
  /** Scopes que *deberían* resolverse para este modelo. Se usa para diagnóstico (cobertura). */
  scopes?:  readonly CaptureScope[];
}

export interface ModelHooks {
  /** Post-procesa el resultado de la familia (agregar bandejas fijas, corregir contadores, etc.). */
  afterCollect?(result: CaptureResult, ctx: CaptureContext): CaptureResult | Promise<CaptureResult>;
  /** Reemplaza por completo la captura de la familia (para modelos con firmware atípico). */
  collect?(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null>;
}

/** Un archivo por modelo: declarativo, pequeño, sin lógica de protocolo. */
export interface ModelProfile {
  /** p. ej. `samsung.sl-m4072fd` */
  id:           string;
  brand:        Brand;
  displayName:  string;
  /** Familia que implementa la lógica de protocolo. */
  family:       string;
  match:        IdentityMatch;
  expect?:      ModelExpectations;
  hooks?:       ModelHooks;
  /** Notas operativas (quirks de firmware, endpoints que no existen, etc.). */
  notes?:       string;
}

/** Helper de tipado para archivos de modelo. */
export function defineModel(profile: ModelProfile): ModelProfile {
  return profile;
}

/** Resultado de `resolve()`. */
export interface ResolvedDriver {
  family:   CaptureFamily;
  profile?: ModelProfile;
  /** Cómo se eligió: perfil explícito, puntaje de familia o genérico. */
  via:      'profile' | 'score' | 'generic';
}
