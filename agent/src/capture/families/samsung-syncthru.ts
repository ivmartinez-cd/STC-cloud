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
import { parseSamsungHome, parseSamsungCounters, parseSamsungSolutionCounters, parseSamsungFwUpgrade, parseSamsungSyncThruSupplies, parseSamsungSolutionSupplies, parseSamsungActiveAlert, parseSamsungIdentity } from '../../snmp/ews-parsers/samsung';
import type { EwsData } from '../../snmp/ews-parsers/types';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData, mergeResults, mergeDefined, mergeCountersInto } from '../bridge';

const P = {
  home:         '/sws/app/information/home/home.json',
  identity:     '/sws/app/information/identity/identity.json',
  counters:     '/sws/app/information/counters/counters.json',
  countersHtml: '/sws.application/information/countersView.sws',
  supplies:     '/sws/app/information/supplies/supplies.json',
  suppliesHtml: '/sws.application/information/suppliesView.sws',
  fw:           '/sws/app/maintenance/fw/fwupgrade.json',
  alerts:       '/sws/app/information/activealert/activealert.json',
} as const;

/**
 * Mergea tóners y tambores COLOR POR COLOR. `mergeDefined` es shallow sobre
 * `suppliesDetails`, así que aplicado a `toners` reemplazaría el objeto
 * entero y borraría los colores que sólo trajo la otra fuente. Acá el dato
 * nuevo rellena hueco por hueco y nunca pisa un valor ya conocido con null.
 */
function mergeSuppliesByColor(acc: Partial<EwsData>, p: Partial<EwsData>): void {
  const src = p.suppliesDetails;
  if (!src) return;
  const dst = (acc.suppliesDetails ??= {});
  for (const group of ['toners', 'drums'] as const) {
    const from = src[group];
    if (!from) continue;
    const into = (dst[group] ??= {});
    for (const [color, item] of Object.entries(from)) {
      if (!item) continue;
      const key = color as keyof typeof into;
      into[key] = mergeDefined(into[key] ?? {}, item);
    }
  }
  if (src.maintenance) dst.maintenance = mergeDefined(dst.maintenance ?? {}, src.maintenance);
  for (const c of ['Black', 'Cyan', 'Magenta', 'Yellow'] as const) {
    const lvl = p[`toner${c}`];
    if (lvl != null && acc[`toner${c}`] == null) acc[`toner${c}`] = lvl;
  }
}

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
    const [home, counters, countersHtml, supplies, suppliesHtml, fw, alerts] = await Promise.all([
      wantId  ? ctx.http(P.home)         : null,
      wantMet ? ctx.http(P.counters)     : null,
      wantMet ? ctx.http(P.countersHtml) : null,
      wantSup ? ctx.http(P.supplies)     : null,
      wantSup ? ctx.http(P.suppliesHtml) : null,
      wantId  ? ctx.http(P.fw)           : null,
      wantAl  ? ctx.http(P.alerts)       : null,
    ]);
    if (!home && !counters && !countersHtml && !supplies && !suppliesHtml) return null;

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
    // Misma historia que `countersView.sws`: los M458x/M4580 de esta familia
    // comparten la consola SWS de las XOA y su `supplies.json` responde 302,
    // así que el único lugar donde está la serie del cartucho, el SKU y la
    // capacidad es la tabla HTML. En un SyncThru de verdad este pedido da
    // 404/302, `ctx.http` devuelve null y no aporta nada.
    if (suppliesHtml) mergeSuppliesByColor(acc, parseSamsungSolutionSupplies(suppliesHtml));
    if (alerts)   merge(parseSamsungActiveAlert(alerts));

    const result = fromEwsData(acc, 'ews');
    if (!scopes.includes('trays')) delete result.trays;
    if (!scopes.includes('supplies')) delete result.supplies;
    return mergeResults(result, null);
  },
};
