/**
 * Familia EWS genérica: lista de endpoints conocidos de marcas sin familia dedicada
 * (Ricoh, Brother, Xerox, Epson, Canon, Konica Minolta) + parser heurístico de etiquetas.
 * Es deliberadamente de baja prioridad: sólo se usa si no hay familia específica y SNMP no dio contadores.
 */
import { readDeviceViaEWS } from '../../snmp/ews';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData } from '../bridge';

export const genericEws: CaptureFamily = {
  id: 'generic.ews',
  brand: 'generic',
  displayName: 'EWS genérico (endpoints conocidos por marca)',
  capabilities: ['identity', 'meters', 'supplies'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (!(ports.http || ports.https)) return 0;
    return ['ricoh', 'brother', 'xerox'].includes(identity.brand) ? 50 : 15;
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    const identityOnly = scopes.every(s => s === 'identity');
    const data = await readDeviceViaEWS(ctx.ip, ctx.identity.brand, ctx.identity.model ?? undefined, identityOnly);
    return data ? fromEwsData(data, 'ews') : null;
  },
};
