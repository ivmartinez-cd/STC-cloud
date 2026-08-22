/**
 * Fachada de compatibilidad sobre el motor de captura (`capture/`).
 *
 * Históricamente este archivo contenía la cascada EWS/SNMP/PJL/IPP completa. Hoy la lógica vive en:
 *   - capture/index.ts        → precalificación de puertos, identidad, resolución de driver, completado de huecos
 *   - capture/families/*      → lógica de protocolo por familia de firmware
 *   - capture/models/<marca>/ → un archivo declarativo por modelo (matcher, capacidades, quirks)
 *   - capture/normalize.ts    → CaptureResult → DeviceReading (contrato del servidor)
 *
 * Se mantienen las firmas `readDevice`, `readViaSNMP`, `readViaEWSCounters`, `readViaEWSSupplies`
 * para consola, tests y scripts de diagnóstico.
 */
import { captureDevice, type CaptureHint, type CaptureScope, type SnmpCredential } from '../capture';
import { HR_STATUS_MAP, type Brand } from './oids';

export type { DeviceReading, PollMethod } from '../capture/reading';
export { captureDevice, checkOpenPorts, listFamilies, listProfiles, resolve } from '../capture';
export type { CaptureOutcome, CaptureOptions, CaptureHint } from '../capture';

import type { DeviceReading, PollMethod } from '../capture/reading';

export function hrStatus(val: unknown): string {
  return HR_STATUS_MAP[Number(val)] ?? 'idle';
}

/** Estas firmas son de diagnóstico manual (consola, tests, scripts) — siguen
 *  aceptando una única `community` por comodidad y la envuelven en una lista
 *  de una sola credencial v2c para el motor de captura. */
function singleCredential(community: string): SnmpCredential[] {
  return [{ id: 'manual', version: 'v2c', community }];
}

const FULL: readonly CaptureScope[] = ['identity', 'meters', 'supplies', 'alerts', 'trays'];

/**
 * Descubrimiento + lectura completa de un host. `null` si no es impresora o no respondió.
 * @param hint Driver/método conocidos de ciclos anteriores (ruta rápida).
 * @param identityOnly Sólo identidad (marca/modelo/serie) — para inventario rápido.
 */
export async function readDevice(
  ip: string,
  community: string,
  hint?: PollMethod | CaptureHint,
  identityOnly = false,
): Promise<DeviceReading | null> {
  const h: CaptureHint | undefined = typeof hint === 'string' ? { pollMethod: hint } : hint;
  const out = await captureDevice({ ip, credentials: singleCredential(community), scopes: identityOnly ? ['identity'] : FULL, hint: h });
  return out?.reading ?? null;
}

/** Lectura sólo por Printer-MIB/SNMP (diagnóstico). */
export async function readViaSNMP(ip: string, community: string, identityOnly = false): Promise<DeviceReading | null> {
  const out = await captureDevice({ ip, credentials: singleCredential(community), scopes: identityOnly ? ['identity'] : ['identity', 'meters', 'supplies'], hint: { driver: 'generic.printer-mib' } });
  return out && out.identity.source === 'snmp' ? out.reading : null;
}

/** Loop de contadores: usa el driver conocido y no re-identifica. */
export async function readViaEWSCounters(ip: string, brand?: Brand, model?: string, hint?: CaptureHint, community = 'public'): Promise<DeviceReading | null> {
  const out = await captureDevice({ ip, credentials: singleCredential(community), scopes: ['meters'], hint: { ...hint, brand: brand ?? hint?.brand, model: model ?? hint?.model }, trustHint: true });
  return out?.reading ?? null;
}

/** Loop de insumos: tóners, tambores, kits, alertas y bandejas. */
export async function readViaEWSSupplies(ip: string, brand?: Brand, model?: string, hint?: CaptureHint, community = 'public'): Promise<DeviceReading | null> {
  const out = await captureDevice({ ip, credentials: singleCredential(community), scopes: ['supplies', 'alerts', 'trays'], hint: { ...hint, brand: brand ?? hint?.brand, model: model ?? hint?.model }, trustHint: true });
  return out?.reading ?? null;
}
