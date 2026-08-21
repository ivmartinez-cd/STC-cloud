/**
 * Familia HP FutureSmart (LaserJet Managed/Enterprise E-series, M5xx/M6xx/M7xx, Flow MFP, PageWide Enterprise).
 *
 * Orden de fuentes (cada campo tiene un dueño; ninguna fuente pisa a la anterior):
 *  1. SNMP  → contadores autoritativos (prtMarkerLifeCount + OIDs HP .2.6.0/.2.7.0 = lo que SDS llama "Páginas mono/color/total"),
 *             firmware (.3.6.0 + datecode .3.5.0), MAC, sysName, tabla de insumos (incluye kits que el HTML no lista).
 *  2. EWS   → /hp/device/DeviceInformation/View (modelo, SKU, alias, ubicación, serial),
 *             InternalPages?id=ConfigurationPage (paquete FS, revisión/fecha, formateador, RAM, ciclos del motor, bandejas),
 *             InternalPages?id=UsagePage (desglose print/copy/fax, equivalentes A4, dúplex, escaneos),
 *             InternalPages?id=SuppliesStatus (part number, nº pedido, serial CRUM, páginas impresas/restantes, fechas).
 *  3. Si el EWS exige login, se intenta "Administrator" sin contraseña (configuración de fábrica); si tiene clave,
 *     todo lo anterior se cubre con SNMP (ver hp-devmgmt.futureSmartSession).
 * Si SNMP está filtrado, EngineCycles/ColorEngineCycles de ConfigurationPage reemplazan a los contadores SNMP.
 */
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { parseFsDeviceInformation, parseFsConfiguration, parseFsUsagePage, parseFsSuppliesStatus } from '../../snmp/ews-parsers/hp-futuresmart';
import { fromEwsData, mergeResults } from '../bridge';
import { snmpMeters } from './generic-printer-mib';
import { futureSmartSession, looksLikeSignIn, fetchWithSession, type FsSession } from './hp-devmgmt';

const P = {
  info:     '/hp/device/DeviceInformation/View',
  config:   '/hp/device/InternalPages/Index?id=ConfigurationPage',
  usage:    '/hp/device/InternalPages/Index?id=UsagePage',
  supplies: '/hp/device/InternalPages/Index?id=SuppliesStatus',
} as const;

const FS_MODEL = /\bE\d{5}\b|LaserJet\s+(?:Managed|Enterprise)|Flow\s+MFP|PageWide\s+(?:Enterprise|Managed)|\bM[5-7]\d\d\b|FutureSmart/i;

async function getAny(ctx: Pick<CaptureContext, 'http' | 'ports'>, path: string): Promise<string | null> {
  // FutureSmart "Secure by Default": el 80 redirige al 443. Sólo se prueban los puertos abiertos.
  const a = ctx.ports.https ? await ctx.http(path, 'https') : null;
  if (a && !looksLikeSignIn(a)) return a;
  const b = ctx.ports.http ? await ctx.http(path, 'http') : null;
  return b ?? a;
}

export const hpFutureSmart: CaptureFamily = {
  id: 'hp.futuresmart',
  brand: 'hp',
  displayName: 'HP FutureSmart (Managed/Enterprise): SNMP + páginas internas del EWS',
  capabilities: ['identity', 'meters', 'supplies', 'alerts', 'trays'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (identity.brand !== 'hp' || !(ports.http || ports.https)) return 0;
    if (FS_MODEL.test(identity.model ?? '')) return 88;
    if (/JETDIRECT,JD\d+/i.test(identity.sysDescr ?? '') && !/LaserJet\s+Pro/i.test(identity.model ?? '')) return 50;
    return 0;
  },
  async probeIdentity(ctx) {
    const html = await getAny(ctx, P.info);
    if (!html || looksLikeSignIn(html)) return null;
    const p = parseFsDeviceInformation(html);
    return p.model || p.serial ? { brand: 'hp', model: p.model ?? null, serial: p.serial ?? null, hostname: p.hostname ?? null, location: p.location ?? null, sku: p.suppliesDetails?.device?.sku ?? null } : null;
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    let result: CaptureResult | null = null;
    let sessionPromise: Promise<FsSession | null> | null = null;
    const page = async (path: string): Promise<string | null> => {
      const html = await getAny(ctx, path);
      if (html && !looksLikeSignIn(html)) return html;
      sessionPromise ??= futureSmartSession(ctx.ip);
      const session = await sessionPromise;
      return session ? fetchWithSession(ctx.ip, session, path) : null;
    };
    const add = (r: CaptureResult | null) => { if (r) result = mergeResults(result, r); };

    const wantId  = scopes.includes('identity') || scopes.includes('trays');
    const wantMet = scopes.includes('meters');
    const wantSup = scopes.includes('supplies');

    // Todo en paralelo: SNMP (dueño de los contadores) + las páginas del EWS que piden los scopes.
    const [snmpRes, info, cfg, usage, sup] = await Promise.all([
      wantMet && !ctx.snmp.unreachable ? snmpMeters(ctx) : Promise.resolve(undefined),
      wantId  ? page(P.info)     : Promise.resolve(null),
      wantId || wantMet ? page(P.config) : Promise.resolve(null),   // EngineCycles también respalda contadores
      wantMet ? page(P.usage)    : Promise.resolve(null),
      wantSup ? page(P.supplies) : Promise.resolve(null),
    ]);
    let meters = snmpRes;

    if (info) add(fromEwsData(parseFsDeviceInformation(info), 'ews'));
    if (cfg) {
      const c = parseFsConfiguration(cfg);
      if (wantId) {
        const fw = c.firmwareRevision ? `${c.firmwareRevision}${c.firmwareDate ? ` [${c.firmwareDate}]` : ''}` : null;
        add({
          method: 'ews',
          identity: { firmware: fw, model: c.model, serial: c.serial, sku: c.sku },
          device: { sku: c.sku, firmwarePackage: c.firmwarePackage, firmwareRevision: c.firmwareRevision, firmwareDate: c.firmwareDate, platform: c.platform, formatterNumber: c.formatterNumber, ramMb: c.ramMb, manufacturer: 'HP' },
          trays: c.trays && scopes.includes('trays') ? { input: c.trays, source: 'ews' } : undefined,
        });
      }
      // Respaldo de contadores si SNMP no respondió (cliente con SNMP bloqueado): ciclos del motor = prtMarkerLifeCount
      if (wantMet && (!meters || meters.total == null) && c.engineCycles != null) {
        meters = { total: c.engineCycles, color: c.colorEngineCycles ?? null, mono: c.colorEngineCycles != null ? c.engineCycles - c.colorEngineCycles : null, source: 'ews' };
      }
      if (wantMet && c.engineCycles != null) add({ method: 'ews', meters: { total: null, mono: null, color: null, detail: { engineCycles: c.engineCycles, colorEngineCycles: c.colorEngineCycles }, source: 'ews' } });
    }
    if (usage) {
      const r = fromEwsData(parseFsUsagePage(usage), 'ews');
      // El desglose de UsagePage es detalle; los totales los pone SNMP/EngineCycles
      if (meters?.total != null && r.meters) r.meters = { total: null, mono: null, color: null, detail: r.meters.detail, source: 'ews' };
      add(r);
    }
    if (meters) add({ method: meters.source, meters });
    if (sup) add(fromEwsData(parseFsSuppliesStatus(sup), 'ews'));

    if (result) { const r: CaptureResult = result; r.method = r.meters?.source ?? 'ews'; }
    return result;
  },
};
