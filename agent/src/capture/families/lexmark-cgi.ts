/**
 * Familia Lexmark EWS clásico (cgi-bin/dynamic) — T64x/T65x, X64x/X65x, E/W series con firmware LW/LR.
 *  - /cgi-bin/dynamic/printer/config/reports/deviceinfo.html → "Page Count = N", serial, modelo
 *  - /cgi-bin/dynamic/printer/PrinterStatus.html              → niveles de tóner (%), estado
 *  - /cgi-bin/dynamic/topbar.html                             → modelo (fallback)
 * Los Lexmark modernos (MS/MX/CS/CX con firmware 2016+) se cubren por Printer-MIB (SNMP) hasta
 * que se agregue la familia `lexmark.webservices` (/webglue/rawcontent).
 */
import { parseLexmarkEws, parseLexmarkPrinterStatus } from '../../snmp/ews-parsers/lexmark';
import type { EwsData } from '../../snmp/ews-parsers/types';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData, mergeResults } from '../bridge';

const P = {
  deviceInfo: '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html',
  status:     '/cgi-bin/dynamic/printer/PrinterStatus.html',
  topbar:     '/cgi-bin/dynamic/topbar.html',
} as const;

export const lexmarkCgi: CaptureFamily = {
  id: 'lexmark.cgi',
  brand: 'lexmark',
  displayName: 'Lexmark EWS clásico (cgi-bin/dynamic)',
  capabilities: ['identity', 'meters', 'supplies'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (identity.brand !== 'lexmark' || !(ports.http || ports.https)) return 0;
    return /\b(?:T|X|E|W|C)\s?6\d{2}|T64|X64|X65|T65|X46|X54|E46|E36/i.test(identity.model ?? '') ? 85 : 60;
  },
  async probeIdentity(ctx) {
    const body = await ctx.http(P.deviceInfo);
    if (!body) return null;
    const p = parseLexmarkEws(body);
    if (!p.serial && p.totalPages == null) return null; // "Page Count =" o serial: si no, no es un Lexmark
    return { brand: 'lexmark', model: p.model ?? null, serial: p.serial ?? null };
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    let result: CaptureResult | null = null;
    const add = (d: Partial<EwsData>) => { result = mergeResults(result, fromEwsData(d, 'ews')); };
    if (scopes.includes('identity') || scopes.includes('meters')) {
      const body = await ctx.http(P.deviceInfo);
      if (body) {
        const p = parseLexmarkEws(body);
        // deviceinfo no distingue color: dejar color en null para no inventar "0" en equipos color
        if (p.totalPages != null) { p.monoPages = undefined; p.colorPages = undefined; }
        add(p);
      }
    }
    if (scopes.includes('supplies')) {
      const body = await ctx.http(P.status);
      if (body) add(parseLexmarkPrinterStatus(body));
    }
    return result;
  },
};
