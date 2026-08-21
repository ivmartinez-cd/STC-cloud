/**
 * Familia HP legado con tarjeta JetDirect (LaserJet 4xxx/P3xxx/600 M60x, sysDescr "HP ETHERNET MULTI-ENVIRONMENT").
 * El EWS de estos equipos es HTML viejo y cambia por firmware; lo más confiable es SNMP con OIDs
 * privados HP (1.3.6.1.4.1.11.2.3.9.4.2.1.*) + Printer-MIB, y PJL para el serial/pagecount cuando SNMP está filtrado.
 */
import { readDeviceViaPJL } from '../../snmp/pjl';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { genericPrinterMib, modelFromDeviceId, cleanModel } from './generic-printer-mib';
import { mergeResults } from '../bridge';
import { parseHpLegacyHtmlSupplies } from '../../snmp/ews-parsers/hp';
import { fromEwsData } from '../bridge';

const HP_MODEL_OID = '1.3.6.1.4.1.11.2.3.9.1.1.7.0'; // hpPrinterModel (ej. "HP LaserJet 600 M602")

export const hpJetdirectLegacy: CaptureFamily = {
  id: 'hp.jetdirect-legacy',
  brand: 'hp',
  displayName: 'HP JetDirect legado (SNMP privado + PJL)',
  capabilities: ['identity', 'meters', 'supplies', 'alerts', 'trays'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (identity.brand !== 'hp') return 0;
    if (/ETHERNET MULTI-ENVIRONMENT|JetDirect/i.test(identity.sysDescr ?? '') || /JetDirect/i.test(identity.model ?? '')) return 90;
    return ports.jetdirect && !(ports.http || ports.https) ? 60 : 0;
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    let result = await genericPrinterMib.collect(ctx, scopes);
    if (scopes.includes('identity')) {
      // hpPrinterModel suele venir como IEEE 1284 Device ID ("MFG:HP;MDL:HP LaserJet 600 M602;CMD:..."):
      // sólo se usa si la identidad SNMP no trajo un modelo comercial válido.
      const current = result?.identity?.model ?? ctx.identity.model;
      if (!current || /ETHERNET MULTI-ENVIRONMENT|JetDirect/i.test(current)) {
        const raw = await ctx.snmp.getStr(HP_MODEL_OID);
        const model = modelFromDeviceId(raw) ?? cleanModel(raw);
        if (model) result = mergeResults({ method: 'snmp', identity: { model } }, result);
      }
    }
    // PJL: completa serial y pagecount si SNMP no los dio
    const needSerial = scopes.includes('identity') && !result?.identity?.serial;
    const needTotal  = scopes.includes('meters') && result?.meters?.total == null;
    if ((needSerial || needTotal) && ctx.ports.jetdirect) {
      const pjl = await readDeviceViaPJL(ctx.ip);
      if (pjl) {
        result = mergeResults(result, {
          method: 'pjl',
          identity: { serial: pjl.serial, model: modelFromDeviceId(pjl.model) ?? cleanModel(pjl.model) },
          meters: pjl.totalPages !== null ? { total: pjl.totalPages, mono: null, color: null, source: 'pjl' } : undefined,
        });
        if (result && result.meters?.source === 'pjl') result.method = 'pjl';
      }
    }
    if (scopes.includes('supplies') && !result?.supplies && (ctx.ports.http || ctx.ports.https)) {
      const html = (await ctx.http('/hp/device/info_suppliesStatus.html')) ?? (await ctx.http('/info_suppliesStatus.html'));
      if (html) result = mergeResults(result, fromEwsData(parseHpLegacyHtmlSupplies(html), 'ews'));
    }
    return result;
  },
};
