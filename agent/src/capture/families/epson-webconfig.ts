/**
 * Familia Epson Web Config — WorkForce Pro de red (WF-C5xxx, WF-C8xxx y la
 * línea de oficina que comparte esa consola).
 *
 * Endpoints (los dos anónimos, sin sesión):
 *  - /PRESENTATION/HTML/TOP/PRTINFO.HTML          → identidad de red + niveles de tinta
 *  - /PRESENTATION/ADVANCED/INFO_MENTINFO/TOP     → contadores (total/mono/color)
 *
 * **Estos equipos fuerzan HTTPS**: el puerto 80 contesta un 307 hacia
 * `https://<ip>/…` en vez del contenido. Por eso se pide primero por TLS
 * cuando el 443 está abierto — el mismo criterio que `hp-futuresmart`, que
 * tiene el mismo problema con su "Secure by Default". Verificado contra un
 * WF-C5891 de Canal Directo el 15/09/2026.
 *
 * Lo que Epson NO da por esta consola: part number ni serie del cartucho.
 * Quedan en `null` a propósito.
 */
import { parseEpsonPrtInfo, parseEpsonCounters } from '../../snmp/ews-parsers/epson';
import type { EwsData } from '../../snmp/ews-parsers/types';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData, mergeDefined } from '../bridge';

const P = {
  prtInfo:  '/PRESENTATION/HTML/TOP/PRTINFO.HTML',
  counters: '/PRESENTATION/ADVANCED/INFO_MENTINFO/TOP',
} as const;

/** TLS primero si el 443 está abierto: por el 80 estos equipos sólo devuelven el redirect. */
async function get(ctx: Pick<CaptureContext, 'http' | 'ports'>, path: string): Promise<string | null> {
  if (ctx.ports.https) {
    const viaTls = await ctx.http(path, 'https');
    if (viaTls) return viaTls;
  }
  return ctx.ports.http ? ctx.http(path) : null;
}

/** La consola siempre trae los tanques; sin eso, no es un Epson Web Config. */
const looksLikeWebConfig = (body: string): boolean => /class=['"]tank['"]/i.test(body);

export const epsonWebConfig: CaptureFamily = {
  id: 'epson.webconfig',
  brand: 'epson',
  displayName: 'Epson Web Config',
  capabilities: ['identity', 'meters', 'supplies'],

  score(identity: DeviceIdentity, ports: PortMap): number {
    if (!(ports.http || ports.https)) return 0;
    if (identity.brand !== 'epson') return 0;
    return 80;
  },

  async probeIdentity(ctx) {
    const body = await get(ctx, P.prtInfo);
    if (!body || !looksLikeWebConfig(body)) return null;
    const p = parseEpsonPrtInfo(body);
    if (!p.model && !p.hostname) return null;
    return { brand: 'epson', model: p.model ?? null, serial: null, hostname: p.hostname ?? null, mac: p.mac ?? null };
  },

  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    const wantInfo = scopes.includes('identity') || scopes.includes('supplies');
    const [prtInfo, counters] = await Promise.all([
      wantInfo ? get(ctx, P.prtInfo) : null,
      scopes.includes('meters') ? get(ctx, P.counters) : null,
    ]);
    if (!prtInfo && !counters) return null;

    const acc: Partial<EwsData> = { brand: 'epson' };
    const merge = (p: Partial<EwsData>) => {
      const { suppliesDetails, ...rest } = p;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) (acc as Record<string, unknown>)[k] = v;
      if (suppliesDetails) acc.suppliesDetails = mergeDefined(acc.suppliesDetails ?? {}, suppliesDetails);
    };
    if (prtInfo) merge(parseEpsonPrtInfo(prtInfo));
    if (counters) merge(parseEpsonCounters(counters));

    const result = fromEwsData(acc, 'ews');
    if (!scopes.includes('supplies')) delete result.supplies;
    return result;
  },
};
