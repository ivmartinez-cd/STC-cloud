/**
 * Familia Samsung SyncThru Web Service (V4/V5/V6) — impresoras y MFP de oficina:
 * SL-M4020/M4070/M4072, SCX-48xx, CLX-62xx, CLP-6xx, ML/SCX antiguos con JSON.
 *
 * Endpoints JSON/JS anónimos bajo /sws/app/...:
 *  - information/home/home.json         → modelo, serial, MAC, hostname, ubicación, bandejas, tóner negro
 *  - information/counters/counters.json → GXI_BILLING_* (simplex/duplex, BW/color, print/report/copy)
 *  - information/supplies/supplies.json → toner_<color>, drum_<color>, fuser/btr/rodillos (capa/remaining/id/serial)
 *  - maintenance/fw/fwupgrade.json      → versión de firmware principal
 *  - information/activealert/activealert.json → alertas activas
 * Los cinco se piden en paralelo: son livianos y el firmware los sirve sin sesión.
 *
 * Algunos equipos de esta familia (p. ej. M458x Series/SL-M4580FX — hrDeviceDescr
 * genérico sin sufijo LX/FX/GX, así que no matchea el score de samsung.sws y cae acá)
 * comparten la MISMA consola SWS que las copiadoras XOA: no exponen el desglose por
 * función (Impresión/Copia/Fax) en counters.json (sólo mono/color por simplex/dúplex),
 * pero sí en la tabla HTML `countersView.sws` — ver `parseSamsungSolutionCounters` y
 * el fix del M5370LX. Se pide como fuente extra, sólo para completar `counters`; si el
 * equipo no la expone (404/302), `ctx.http` devuelve null y no aporta nada.
 */
import { parseSamsungHome, parseSamsungCounters, parseSamsungSolutionCounters, parseSamsungFwUpgrade, parseSamsungSyncThruSupplies, parseSamsungActiveAlert, parseSamsungIdentity } from '../../snmp/ews-parsers/samsung';
import type { EwsData } from '../../snmp/ews-parsers/types';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData, mergeResults, mergeDefined, mergeCountersInto } from '../bridge';

const P = {
  home:         '/sws/app/information/home/home.json',
  identity:     '/sws/app/information/identity/identity.json',
  counters:     '/sws/app/information/counters/counters.json',
  countersHtml: '/sws.application/information/countersView.sws',
  supplies:     '/sws/app/information/supplies/supplies.json',
  fw:           '/sws/app/maintenance/fw/fwupgrade.json',
  alerts:       '/sws/app/information/activealert/activealert.json',
} as const;

export const samsungSyncThru: CaptureFamily = {
  id: 'samsung.syncthru',
  brand: 'samsung',
  displayName: 'Samsung SyncThru Web Service (JSON)',
  capabilities: ['identity', 'meters', 'supplies', 'alerts', 'trays'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (identity.brand !== 'samsung' || !(ports.http || ports.https)) return 0;
    if (/LX\b|FX\b|GX\b|X4\d{3}|K4\d{3}|MultiXpress/i.test(identity.model ?? '')) return 40; // copiadoras XOA → sws
    return 80;
  },
  async probeIdentity(ctx) {
    const body = await ctx.http(P.home);
    if (!body) return null;
    const p = parseSamsungHome(body);
    if (!p.model && !p.serial) return null;
    return { brand: 'samsung', model: p.model ?? null, serial: p.serial ?? null, mac: p.mac ?? null, hostname: p.hostname ?? null, location: p.location ?? null };
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    const wantId   = scopes.includes('identity') || scopes.includes('trays');
    const wantMet  = scopes.includes('meters');
    const wantSup  = scopes.includes('supplies') || scopes.includes('trays');
    const wantAl   = scopes.includes('alerts');
    const [home, counters, countersHtml, supplies, fw, alerts] = await Promise.all([
      wantId  ? ctx.http(P.home)         : null,
      wantMet ? ctx.http(P.counters)     : null,
      wantMet ? ctx.http(P.countersHtml) : null,
      wantSup ? ctx.http(P.supplies)     : null,
      wantId  ? ctx.http(P.fw)           : null,
      wantAl  ? ctx.http(P.alerts)       : null,
    ]);
    if (!home && !counters && !countersHtml && !supplies) return null;

    let acc: Partial<EwsData> = { brand: 'samsung' };
    const merge = (p: Partial<EwsData>) => {
      const { suppliesDetails, ...rest } = p;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) (acc as Record<string, unknown>)[k] = v;
      if (suppliesDetails) acc.suppliesDetails = mergeDefined(acc.suppliesDetails ?? {}, suppliesDetails);
    };
    if (home)     merge(parseSamsungHome(home));
    if (home && !acc.model) { const id = await ctx.http(P.identity); if (id) merge(parseSamsungIdentity(id)); }
    if (counters) merge(parseSamsungCounters(counters));
    if (countersHtml) {
      // countersHtml sólo rellena huecos (total/mono/color) y aporta el desglose por
      // función (print/copy/fax): counters.json ya manda para lo primero cuando está
      // disponible (GXI_BILLING_* es más exacto que la tabla HTML), así que no se pisa.
      const p = parseSamsungSolutionCounters(countersHtml);
      mergeCountersInto(acc.suppliesDetails ??= {}, p.suppliesDetails?.counters);
      if (acc.totalPages == null && p.totalPages != null) acc.totalPages = p.totalPages;
      if (acc.monoPages  == null && p.monoPages  != null) acc.monoPages  = p.monoPages;
      if (acc.colorPages == null && p.colorPages != null) acc.colorPages = p.colorPages;
    }
    if (fw)       merge(parseSamsungFwUpgrade(fw));
    if (supplies) merge(parseSamsungSyncThruSupplies(supplies));
    if (alerts)   merge(parseSamsungActiveAlert(alerts));

    const result = fromEwsData(acc, 'ews');
    if (!scopes.includes('trays')) delete result.trays;
    if (!scopes.includes('supplies')) delete result.supplies;
    return mergeResults(result, null);
  },
};
