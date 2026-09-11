/**
 * Familia Samsung XOA / Solution Web Service (copiadoras MultiXpress: X4300LX, K4300LX, M5370LX, X4250, SL-K7400…).
 * El EWS es SWS (no SyncThru): los endpoints /sws/app/* clásicos responden 302 a login, salvo
 * `counters.json` y `activealert.json` que siguen siendo anónimos en la mayoría de firmwares.
 *  - /sws.application/home/homeDeviceInfo.sws        → modelo, serial, MAC, hostname (JS embebido)
 *  - /sws.application/information/countersView.sws   → tabla HTML de contadores (negro/color/total)
 *  - /sws.application/information/suppliesView.sws   → tóners y tambores (HTML)
 *  - /sws/app/information/counters/counters.json     → GXI_BILLING_* (más exacto que la tabla HTML)
 */
import { parseSamsungSolutionHome, parseSamsungSolutionCounters, parseSamsungSolutionSupplies, parseSamsungCounters, parseSamsungActiveAlert } from '../../snmp/ews-parsers/samsung';
import type { EwsData } from '../../snmp/ews-parsers/types';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData, mergeDefined, mergeCountersInto } from '../bridge';

const P = {
  home:      '/sws.application/home/homeDeviceInfo.sws',
  counters:  '/sws.application/information/countersView.sws',
  supplies:  '/sws.application/information/suppliesView.sws',
  countJson: '/sws/app/information/counters/counters.json',
  alerts:    '/sws/app/information/activealert/activealert.json',
} as const;

function parseHomeInfo(body: string): Partial<EwsData> {
  const p = parseSamsungSolutionHome(body);
  const modelM  = body.match(/productName\s*:\s*"([^"]+)"/i);
  const serialM = body.match(/serialNumber\s*:\s*"([^"]+)"/i);
  const macM    = body.match(/macAddress\s*:\s*"([^"]+)"/i);
  const hostM   = body.match(/hostName\s*:\s*"([^"]+)"/i);
  if (modelM  && !p.model)  p.model  = modelM[1].trim();
  if (serialM && !p.serial) p.serial = serialM[1].trim();
  if (macM)  p.mac      = macM[1].trim();
  if (hostM) p.hostname = hostM[1].trim();
  p.brand = 'samsung';
  return p;
}

export const samsungSws: CaptureFamily = {
  id: 'samsung.sws',
  brand: 'samsung',
  displayName: 'Samsung XOA / Solution Web Service (copiadoras)',
  capabilities: ['identity', 'meters', 'supplies', 'alerts'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (identity.brand !== 'samsung' || !(ports.http || ports.https)) return 0;
    return /LX\b|FX\b|GX\b|X4\d{3}|K4\d{3}|K7\d{3}|X7\d{3}|MultiXpress/i.test(identity.model ?? '') ? 85 : 20;
  },
  async probeIdentity(ctx) {
    const body = await ctx.http(P.home);
    if (!body || !/productName|serialNumber|Model\s*Name/i.test(body)) return null;
    const p = parseHomeInfo(body);
    return p.model || p.serial ? { brand: 'samsung', model: p.model ?? null, serial: p.serial ?? null, mac: p.mac ?? null, hostname: p.hostname ?? null } : null;
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    const [home, countJson, countHtml, supplies, alerts] = await Promise.all([
      scopes.includes('identity') ? ctx.http(P.home) : null,
      scopes.includes('meters')   ? ctx.http(P.countJson) : null,
      scopes.includes('meters')   ? ctx.http(P.counters) : null,
      scopes.includes('supplies') ? ctx.http(P.supplies) : null,
      scopes.includes('alerts')   ? ctx.http(P.alerts) : null,
    ]);
    if (!home && !countJson && !countHtml && !supplies) return null;

    const acc: Partial<EwsData> = { brand: 'samsung' };
    const merge = (p: Partial<EwsData>) => {
      const { suppliesDetails, ...rest } = p;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null && (acc as Record<string, unknown>)[k] == null) (acc as Record<string, unknown>)[k] = v;
      if (suppliesDetails) {
        // `counters` se mergea aparte (ver mergeCountersInto) porque countJson aporta
        // monoSimplex/duplex/totalImpressions y countHtml aporta print/copy/fax: son
        // sub-campos distintos del mismo objeto, un merge shallow de suppliesDetails
        // pisaría uno con el otro en vez de combinarlos.
        const { counters, ...restDetails } = suppliesDetails;
        acc.suppliesDetails = mergeDefined(acc.suppliesDetails ?? {}, restDetails);
        mergeCountersInto(acc.suppliesDetails, counters);
      }
    };
    if (home) merge(parseHomeInfo(home));
    // JSON de billing primero (exacto), la tabla HTML rellena lo que falte
    if (countJson && /GXI_BILLING/i.test(countJson)) merge(parseSamsungCounters(countJson));
    if (countHtml) merge(parseSamsungSolutionCounters(countHtml));
    if (supplies)  merge(parseSamsungSolutionSupplies(supplies));
    if (alerts)    merge(parseSamsungActiveAlert(alerts));
    return fromEwsData(acc, 'ews');
  },
};
