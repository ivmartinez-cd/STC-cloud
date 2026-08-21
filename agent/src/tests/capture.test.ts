// Tests unitarios del motor de captura — sin red: HTTP y SNMP se simulan con fixtures.
// Ejecutar: npx tsx --test src/tests/capture.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { resolve, listProfiles, listFamilies, getFamily } from '../capture/registry';
import { toDeviceReading } from '../capture/normalize';
import { mergeResults, fromEwsData } from '../capture/bridge';
import { genericPrinterMib, snmpIdentity, cleanModel } from '../capture/families/generic-printer-mib';
import type { CaptureContext, DeviceIdentity, PortMap, CaptureResult } from '../capture/types';
import type { SnmpClient, SnmpScalar } from '../capture/transport/snmp';

// ─── Fakes ───────────────────────────────────────────────────────────────────

const ALL_PORTS: PortMap = { jetdirect: true, ipp: true, http: true, https: false };
const WEB_ONLY:  PortMap = { jetdirect: false, ipp: false, http: true, https: false };
const NO_PORTS:  PortMap = { jetdirect: false, ipp: false, http: false, https: false };

class FakeSnmp {
  constructor(private readonly oids: Record<string, SnmpScalar>) {}
  get unreachable(): boolean { return Object.keys(this.oids).length === 0; }
  close(): void { /* noop */ }
  async get(oid: string): Promise<SnmpScalar> { return this.oids[oid] ?? null; }
  async getMany(oids: string[]): Promise<SnmpScalar[]> { return oids.map(o => this.oids[o] ?? null); }
  async getFirst(oids: readonly string[]): Promise<SnmpScalar> { for (const o of oids) if (this.oids[o] != null) return this.oids[o]; return null; }
  async getInt(oid: string): Promise<number | null> { const v = this.oids[oid]; return typeof v === 'number' ? v : v == null ? null : parseInt(String(v), 10); }
  async getFirstInt(oids: readonly string[]): Promise<number | null> { for (const o of oids) { const v = await this.getInt(o); if (v !== null) return v; } return null; }
  async getStr(oid: string): Promise<string | null> { const v = this.oids[oid]; return v == null ? null : String(v); }
  async getFirstStr(oids: readonly string[]): Promise<string | null> { for (const o of oids) { const v = await this.getStr(o); if (v) return v; } return null; }
  async subtree(base: string): Promise<Map<string, SnmpScalar>> {
    const m = new Map<string, SnmpScalar>();
    for (const [k, v] of Object.entries(this.oids)) if (k.startsWith(base + '.')) m.set(k.slice(base.length + 1), v);
    return m;
  }
}

function ctxWith(identity: DeviceIdentity, pages: Record<string, string>, snmp: Record<string, SnmpScalar> = {}, ports: PortMap = ALL_PORTS): CaptureContext {
  return {
    ip: identity.ip, community: 'public', ports, identity,
    http: async (path) => pages[path] ?? null,
    snmp: new FakeSnmp(snmp) as unknown as SnmpClient,
    pjl: async () => null,
    ipp: async () => null,
  };
}

const id = (brand: DeviceIdentity['brand'], model: string | null, extra: Partial<DeviceIdentity> = {}): DeviceIdentity =>
  ({ ip: '10.0.0.1', brand, model, serial: null, source: 'snmp', ...extra });

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMSUNG_HOME = `{ identity : { model_name : "SL-M4072FD", serial_num : "ZDG3B8FF5000123", mac_addr : "30:CD:A7:11:22:33", host_name : "SEC30CDA7112233", location : "Piso 2" },
 toner_black : { opt : 1, remaining : 63 }, tray1 : { opt : 1, capa : 250 }, tray2 : { opt : 0, capa : 520 }, mp : { opt : 1, capa : 50 }, outputTray : [ [ 1, 150 ] ] }`;
const SAMSUNG_COUNTERS = `var counters = { GXI_SYS_SERIAL_NUM : 'ZDG3B8FF5000123', GXI_BILLING_TOTAL_IMP_CNT : 93552, GXI_BILLING_SIMPLEX_BW_TOTAL_CNT : 80000, GXI_BILLING_DUPLEX_BW_TOTAL_CNT : 13552, GXI_BILLING_SIMPLEX_BW_PRINT_CNT : 79000, GXI_BILLING_SIMPLEX_BW_REPORT_CNT : 1000 };`;
const SAMSUNG_SUPPLIES = `{ toner_black : { opt : 1, remaining : 63, id : "MLT-D201L", serial : "CRUM00123", capa : 20000, status : "Ready" }, drum_black : { opt : 0 }, fuser_kit : 50000, fuser_kit_max : 200000, btr_kit : 10000, btr_kit_max : 100000 }`;
const SAMSUNG_FW = `{ fw : [ { id : 'GXI_FW_MAIN_VER', version : 'V4.00.02.18 JUN-20-2019' } ] }`;
const SAMSUNG_ALERTS = `{ recordData : [ { severity : 2, code : "C1-1110", desc : "Toner Low" } ] }`;

const HP_CONFIG = `<?xml version="1.0"?><prdcfgdyn:ProductConfigDyn><dd:ProductInformation><dd:MakeAndModel>HP Color LaserJet Pro MFP M479fdw</dd:MakeAndModel><dd:SerialNumber>CNB1K2X3Y4</dd:SerialNumber><dd:Revision>20230306</dd:Revision></dd:ProductInformation></prdcfgdyn:ProductConfigDyn>`;
const HP_USAGE  = `<?xml version="1.0"?><pudyn:ProductUsageDyn><dd:PrinterSubunit><dd:TotalImpressions>61341</dd:TotalImpressions><dd:MonochromeImpressions>60000</dd:MonochromeImpressions><dd:ColorImpressions>1341</dd:ColorImpressions></dd:PrinterSubunit></pudyn:ProductUsageDyn>`;
const HP_CONS   = `<?xml version="1.0"?><ccdyn:ConsumableConfigDyn>
<ccdyn:ConsumableInfo><dd:ConsumableLabelCode>K</dd:ConsumableLabelCode><dd:ConsumablePercentageLevelRemaining>42</dd:ConsumablePercentageLevelRemaining><dd:ProductNumber>W2030A</dd:ProductNumber><dd:SerialNumber>SN-K-1</dd:SerialNumber></ccdyn:ConsumableInfo>
<ccdyn:ConsumableInfo><dd:ConsumableLabelCode>C</dd:ConsumableLabelCode><dd:ConsumablePercentageLevelRemaining>77</dd:ConsumablePercentageLevelRemaining><dd:ProductNumber>W2031A</dd:ProductNumber></ccdyn:ConsumableInfo>
</ccdyn:ConsumableConfigDyn>`;

const LEX_DEVINFO = `<html><center><FONT size=+2>Lexmark X656de</FONT></center><pre>Serial Number = 7940HXH\nPage Count = 234899</pre></html>`;
const LEX_STATUS  = `<html><table><tr><td>Black Toner 45%</td></tr></table></html>`;

// ─── Registro / resolución ───────────────────────────────────────────────────

describe('registro de perfiles y familias', () => {
  test('ids únicos y familias válidas en todos los perfiles', () => {
    const ids = new Set<string>();
    for (const p of listProfiles()) {
      assert.ok(!ids.has(p.id), `perfil duplicado ${p.id}`); ids.add(p.id);
      assert.ok(getFamily(p.family), `${p.id}: familia inexistente ${p.family}`);
      assert.ok(p.match.model || p.match.sysObjectId, `${p.id}: sin criterio de match`);
    }
    assert.ok(listFamilies().length >= 7);
  });

  const cases: Array<[DeviceIdentity, string]> = [
    [id('samsung', 'SL-M4072FD'),                                  'samsung.sl-m4072fd'],
    [id('samsung', 'Samsung SL-M4020ND'),                          'samsung.sl-m4020nd'],
    [id('samsung', 'Samsung SCX-483x 5x3x Series'),                'samsung.scx-483x'],
    [id('samsung', 'Samsung CLX-6260 Series'),                     'samsung.clx-6260'],
    [id('samsung', 'Samsung CLP-680 Series'),                      'samsung.clp-680'],
    [id('samsung', 'X4300LX'),                                     'samsung.x4300lx'],
    [id('samsung', 'M5370LX'),                                     'samsung.m5370lx'],
    [id('hp', 'HP Color LaserJet Pro MFP M479fdw'),                'hp.m479fdw'],
    [id('hp', 'HP Color LaserJet MFP E47528'),                     'hp.e47528'],
    [id('hp', 'HP Color LaserJet MFP E78625'),                     'hp.e78625'],
    [id('hp', 'HP LaserJet E40040'),                               'hp.e40040'],
    [id('hp', 'HP LaserJet E50145'),                               'hp.e50145'],
    [id('hp', 'HP LaserJet MFP E52645'),                           'hp.e52645'],
    [id('hp', null, { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT,ROM none,JETDIRECT,JD153,EEPROM V.45.16' }), 'hp.laserjet-jetdirect'],
    [id('lexmark', 'Lexmark T652'),                                'lexmark.t652'],
    [id('lexmark', 'Lexmark T654'),                                'lexmark.t654'],
    [id('lexmark', 'Lexmark X656de'),                              'lexmark.x656de'],
  ];
  for (const [identity, expected] of cases) {
    test(`resuelve ${identity.model ?? identity.sysDescr} → ${expected}`, () => {
      const r = resolve(identity, ALL_PORTS);
      assert.equal(r.via, 'profile');
      assert.equal(r.profile?.id, expected);
    });
  }

  test('modelo Samsung desconocido cae en la familia SyncThru por puntaje', () => {
    const r = resolve(id('samsung', 'Samsung ML-3710ND'), WEB_ONLY);
    assert.equal(r.via, 'score'); assert.equal(r.family.id, 'samsung.syncthru'); assert.equal(r.profile, undefined);
  });
  test('copiadora Samsung desconocida (sufijo LX) prefiere SWS', () => {
    assert.equal(resolve(id('samsung', 'SL-X7600LX'), WEB_ONLY).family.id, 'samsung.sws');
  });
  test('HP desconocido con EWS → hp.devmgmt; sin web → Printer-MIB', () => {
    assert.equal(resolve(id('hp', 'HP LaserJet Pro M404dn'), WEB_ONLY).family.id, 'hp.devmgmt');
    assert.equal(resolve(id('hp', 'HP LaserJet Pro M404dn'), NO_PORTS).family.id, 'generic.printer-mib');
  });
  test('marca sin familia dedicada con web → EWS genérico; sin nada → Printer-MIB', () => {
    assert.equal(resolve(id('ricoh', 'RICOH MP 2554'), WEB_ONLY).family.id, 'generic.ews');
    assert.equal(resolve(id('generic', 'Unknown'), NO_PORTS).via, 'generic');
  });
  test('driver persistido se respeta (ruta rápida)', () => {
    const r = resolve(id('generic', null), NO_PORTS, 'samsung.sl-m4020nd');
    assert.equal(r.profile?.id, 'samsung.sl-m4020nd'); assert.equal(r.family.id, 'samsung.syncthru');
  });
});

// ─── Familias con fixtures ───────────────────────────────────────────────────

describe('familia samsung.syncthru', () => {
  const pages = {
    '/sws/app/information/home/home.json': SAMSUNG_HOME,
    '/sws/app/information/counters/counters.json': SAMSUNG_COUNTERS,
    '/sws/app/information/supplies/supplies.json': SAMSUNG_SUPPLIES,
    '/sws/app/maintenance/fw/fwupgrade.json': SAMSUNG_FW,
    '/sws/app/information/activealert/activealert.json': SAMSUNG_ALERTS,
  };
  test('captura completa + hook ADF del perfil SL-M4072FD', async () => {
    const identity = id('samsung', 'SL-M4072FD');
    const r = resolve(identity, WEB_ONLY);
    const ctx = ctxWith(identity, pages, {}, WEB_ONLY);
    let res = await r.family.collect(ctx, ['identity', 'meters', 'supplies', 'alerts', 'trays']);
    assert.ok(res);
    res = await r.profile!.hooks!.afterCollect!(res, ctx);

    assert.equal(res.identity?.model, 'SL-M4072FD');
    assert.equal(res.identity?.serial, 'ZDG3B8FF5000123');
    assert.equal(res.identity?.mac, '30:CD:A7:11:22:33');
    assert.match(res.identity?.firmware ?? '', /^V4\.00\.02\.18/);
    assert.equal(res.meters?.total, 93552);
    assert.equal(res.meters?.mono, 93552);
    assert.equal(res.meters?.color, 0);
    assert.equal(res.meters?.detail?.duplex?.total, 13552);
    assert.equal(res.supplies?.toners.black?.percentage, 63);
    assert.equal(res.supplies?.toners.black?.code, 'MLT-D201L');
    assert.equal(res.supplies?.toners.black?.capacity, 20000);
    assert.equal(res.supplies?.maintenance?.fuser?.percentage, 75);
    assert.equal(res.alerts?.length, 1);
    assert.equal(res.alerts?.[0].severity, 'WARNING');
    const trays = res.trays?.input?.map(t => t.name) ?? [];
    assert.ok(trays.some(n => /Tray 1/i.test(n)) && trays.some(n => /MP/i.test(n)) && trays.some(n => /ADF/i.test(n)), `bandejas: ${trays.join(', ')}`);
    assert.ok(!trays.some(n => /Tray 2/i.test(n)), 'tray2 opt=0 no debe listarse');
    assert.equal(res.method, 'ews');
  });
  test('sólo meters no pide supplies ni trays', async () => {
    const identity = id('samsung', 'SL-M4020ND');
    const asked: string[] = [];
    const ctx = ctxWith(identity, pages, {}, WEB_ONLY);
    const http = ctx.http; ctx.http = async (p, pr) => { asked.push(p); return http(p, pr); };
    const res = await resolve(identity, WEB_ONLY).family.collect(ctx, ['meters']);
    assert.equal(res?.meters?.total, 93552);
    assert.ok(!asked.some(p => /supplies\.json/.test(p)));
    assert.equal(res?.supplies, undefined);
  });
});

describe('familia hp.devmgmt', () => {
  const pages = { '/DevMgmt/ProductConfigDyn.xml': HP_CONFIG, '/DevMgmt/ProductUsageDyn.xml': HP_USAGE, '/DevMgmt/ConsumableConfigDyn.xml': HP_CONS };
  test('M479fdw: identidad, contadores color y consumibles con part number', async () => {
    const identity = id('hp', 'HP Color LaserJet Pro MFP M479fdw');
    const r = resolve(identity, WEB_ONLY);
    assert.equal(r.profile?.id, 'hp.m479fdw');
    const res = await r.family.collect(ctxWith(identity, pages, {}, WEB_ONLY), ['identity', 'meters', 'supplies']);
    assert.equal(res?.identity?.serial, 'CNB1K2X3Y4');
    assert.equal(res?.identity?.firmware, '20230306');
    assert.deepEqual([res?.meters?.total, res?.meters?.mono, res?.meters?.color], [61341, 60000, 1341]);
    assert.equal(res?.supplies?.toners.black?.percentage, 42);
    assert.equal(res?.supplies?.toners.black?.code, 'W2030A');
    assert.equal(res?.supplies?.toners.black?.serial, 'SN-K-1');
    assert.equal(res?.supplies?.toners.cyan?.percentage, 77);
  });
  test('probeIdentity reconoce un HP por ProductConfigDyn.xml', async () => {
    const f = getFamily('hp.devmgmt')!;
    const p = await f.probeIdentity!({ ip: '10.0.0.1', community: '', ports: WEB_ONLY, http: async (path) => pages[path as keyof typeof pages] ?? null, snmp: new FakeSnmp({}) as unknown as SnmpClient, pjl: async () => null, ipp: async () => null });
    assert.equal(p?.model, 'HP Color LaserJet Pro MFP M479fdw');
  });
});

describe('familia lexmark.cgi', () => {
  test('X656de: total sin inventar desglose color; tóner negro desde PrinterStatus', async () => {
    const identity = id('lexmark', 'Lexmark X656de');
    const res = await resolve(identity, WEB_ONLY).family.collect(
      ctxWith(identity, { '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html': LEX_DEVINFO, '/cgi-bin/dynamic/printer/PrinterStatus.html': LEX_STATUS }, {}, WEB_ONLY),
      ['identity', 'meters', 'supplies'],
    );
    assert.equal(res?.meters?.total, 234899);
    assert.equal(res?.meters?.mono, null);
    assert.equal(res?.identity?.serial, '7940HXH');
    assert.equal(res?.supplies?.toners.black?.percentage, 45);
  });
});

describe('familia generic.printer-mib (SNMP)', () => {
  const S = '1.3.6.1.2.1.43.11.1.1'; // prtMarkerSupplies
  const snmp: Record<string, SnmpScalar> = {
    '1.3.6.1.2.1.25.3.2.1.2.1': '1.3.6.1.2.1.25.3.1.5',
    '1.3.6.1.2.1.1.2.0': '1.3.6.1.4.1.11.2.3.9.1',
    '1.3.6.1.2.1.1.1.0': 'HP ETHERNET MULTI-ENVIRONMENT,ROM none,JETDIRECT,JD153,EEPROM V.45.16',
    '1.3.6.1.2.1.1.5.0': 'NPI3A2B1C',
    '1.3.6.1.2.1.25.3.2.1.3.1': 'HP LaserJet 600 M602',
    '1.3.6.1.2.1.43.5.1.1.17.1': 'CNDCF123456',
    '1.3.6.1.2.1.43.10.2.1.4.1.1': 145210,
    // supplies: 1 tóner negro (colorant 1), 1 kit de mantenimiento (fusor), 1 depósito residual
    [`${S}.4.1.1`]: 3, [`${S}.5.1.1`]: 3, [`${S}.6.1.1`]: 'Black Cartridge HP CE390A', [`${S}.8.1.1`]: 100, [`${S}.9.1.1`]: 37, [`${S}.3.1.1`]: 1,
    [`${S}.4.1.2`]: 3, [`${S}.5.1.2`]: 15, [`${S}.6.1.2`]: 'Maintenance Kit', [`${S}.8.1.2`]: 225000, [`${S}.9.1.2`]: 45000, [`${S}.3.1.2`]: 0,
    [`${S}.4.1.3`]: 4, [`${S}.5.1.3`]: 4, [`${S}.6.1.3`]: 'Waste Toner', [`${S}.8.1.3`]: 100, [`${S}.9.1.3`]: 80, [`${S}.3.1.3`]: 0,
    '1.3.6.1.2.1.43.12.1.1.4.1.1': 'black',
    // alerta activa + bit lowToner (bit 2 → 0x20 en el primer byte)
    '1.3.6.1.2.1.43.18.1.1.2.1.1': 4, '1.3.6.1.2.1.43.18.1.1.7.1.1': 1104, '1.3.6.1.2.1.43.18.1.1.8.1.1': 'Cartridge low',
    '1.3.6.1.2.1.25.3.5.1.2.1': '\x20',
    // bandejas
    '1.3.6.1.2.1.43.8.2.1.13.1.1': 'Tray 1', '1.3.6.1.2.1.43.8.2.1.9.1.1': 100, '1.3.6.1.2.1.43.8.2.1.10.1.1': 0,
    '1.3.6.1.2.1.43.8.2.1.13.1.2': 'Tray 2', '1.3.6.1.2.1.43.8.2.1.9.1.2': 500, '1.3.6.1.2.1.43.8.2.1.10.1.2': -3,
  };
  test('identidad: ignora la JetDirect como modelo y usa hrDeviceDescr', async () => {
    const ident = await snmpIdentity('10.0.0.9', new FakeSnmp(snmp) as unknown as SnmpClient);
    assert.equal(ident?.brand, 'hp');
    assert.equal(ident?.model, 'HP LaserJet 600 M602');
    assert.equal(ident?.serial, 'CNDCF123456');
    assert.equal(resolve(ident!, ALL_PORTS).profile?.id, 'hp.laserjet-jetdirect');
  });
  test('insumos por tabla RFC 3805: tóner por colorante, fusor y residuo clasificados', async () => {
    const identity = id('hp', 'HP LaserJet 600 M602');
    const res = await genericPrinterMib.collect(ctxWith(identity, {}, snmp, NO_PORTS), ['meters', 'supplies', 'alerts', 'trays']);
    assert.equal(res?.meters?.total, 145210);
    assert.equal(res?.supplies?.toners.black?.percentage, 37);
    assert.equal(res?.supplies?.maintenance?.fuser?.percentage, 20);
    assert.equal(res?.supplies?.maintenance?.wasteToner?.percentage, 80);
    assert.equal(res?.supplies?.toners.cyan, undefined);
    const descs = res?.alerts?.map(a => a.description) ?? [];
    assert.ok(descs.includes('Cartridge low') && descs.includes('Low toner'), descs.join(','));
    assert.equal(res?.trays?.input?.length, 2);
    assert.equal(res?.trays?.input?.[0].status, 'Empty');
    assert.equal(res?.trays?.input?.[1].level, 100);
  });
  test('SNMP inalcanzable → null sin lanzar', async () => {
    const res = await genericPrinterMib.collect(ctxWith(id('generic', null), {}, {}, NO_PORTS), ['meters']);
    assert.equal(res, null);
  });
  test('cleanModel', () => {
    assert.equal(cleanModel('Lexmark X656de version NR.APS.N644 kernel 2.6.28.10.1 All-N-1'), 'Lexmark X656de');
    assert.equal(cleanModel('Samsung SL-M4072FD; V4.00.02.18 JUN-20-2019;Engine 1.00.07'), 'Samsung SL-M4072FD');
  });
});

// ─── Merge y normalización ───────────────────────────────────────────────────

describe('bridge.mergeResults', () => {
  test('primary gana campo a campo, secondary rellena huecos y alertas se deduplican', () => {
    const a: CaptureResult = { method: 'ews', meters: { total: null, mono: 10, color: null, source: 'ews' }, supplies: { toners: { black: { percentage: 50, code: null } }, source: 'ews' }, alerts: [{ code: 'X', description: 'Toner low' }] };
    const b: CaptureResult = { method: 'snmp', meters: { total: 15, mono: 9, color: 5, source: 'snmp' }, supplies: { toners: { black: { percentage: 48, code: 'CE390A' }, cyan: { percentage: 20 } }, source: 'snmp' }, alerts: [{ code: 'X', description: 'toner low' }, { code: 'Y', description: 'Door open' }] };
    const m = mergeResults(a, b)!;
    assert.deepEqual([m.meters?.total, m.meters?.mono, m.meters?.color, m.meters?.source], [15, 10, 5, 'snmp']);
    assert.equal(m.supplies?.toners.black?.percentage, 50);
    assert.equal(m.supplies?.toners.black?.code, 'CE390A');
    assert.equal(m.supplies?.toners.cyan?.percentage, 20);
    assert.equal(m.alerts?.length, 2);
  });
});

describe('normalize.toDeviceReading', () => {
  test('aplana al contrato del servidor y aplica expectativa mono del perfil', () => {
    const identity = id('samsung', 'SL-M4020ND', { serial: 'S1', sysDescr: 'Samsung SL-M4020ND' });
    const r = resolve(identity, WEB_ONLY);
    const res = fromEwsData({ brand: 'samsung', totalPages: 1000, tonerBlack: 63, cartridgeCodeBlack: 'MLT-D201L', firmware: 'V4', suppliesDetails: { alerts: [{ code: 'A', description: 'x' }] } }, 'ews');
    const reading = toDeviceReading(identity, res, r.profile);
    assert.equal(reading.model, 'SL-M4020ND');
    assert.equal(reading.serial, 'S1');
    assert.equal(reading.total_pages, 1000);
    assert.equal(reading.mono_pages, 1000, 'perfil mono: mono = total');
    assert.equal(reading.color_pages, 0);
    assert.equal(reading.toner_black, 63);
    assert.equal(reading.cartridge_code_black, 'MLT-D201L');
    assert.equal(reading.firmware, 'V4');
    assert.equal(reading.poll_method, 'ews');
    assert.equal(reading.supplies_details?.toners?.black?.percentage, 63);
    assert.equal(reading.supplies_details?.alerts?.length, 1);
    assert.equal(reading.toner_cyan, null);
  });
  test('sin resultado: lectura vacía con identidad y poll_method de la identidad', () => {
    const reading = toDeviceReading(id('hp', 'HP LaserJet E40040', { source: 'ews' }), null);
    assert.equal(reading.total_pages, null);
    assert.equal(reading.poll_method, 'ews');
    assert.equal(reading.supplies_details, null);
  });
});

describe('registry.resolve con hint obsoleto', () => {
  test('si la identidad fresca no coincide con el perfil persistido, se ignora el hint', () => {
    const r = resolve(id('hp', 'HP LaserJet E40040'), ALL_PORTS, 'samsung.sl-m4020nd');
    assert.equal(r.profile?.id, 'hp.e40040');
  });
  test('sin modelo fresco (trustHint) el perfil persistido se respeta', () => {
    const r = resolve(id('hp', null), ALL_PORTS, 'hp.e40040');
    assert.equal(r.profile?.id, 'hp.e40040');
  });
});

describe('correcciones de campo (flota real)', () => {
  test('HP Pro M428 con sysDescr JetDirect resuelve hp.m428fdw y no el perfil legado', () => {
    const identity = id('hp', 'HP LaserJet Pro MFP M428fdw', { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT' });
    assert.equal(resolve(identity, WEB_ONLY).profile?.id, 'hp.m428fdw');
    assert.equal(resolve(id('hp', 'HP LaserJet MFP E52645', { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT,ROM none,JETDIRECT' }), WEB_ONLY).profile?.id, 'hp.e52645');
  });
  test('modelo desde IEEE 1284 Device ID y PID', () => {
    assert.equal(cleanModel('MFG:HP;MDL:HP LaserJet Pro M428f-M429f;CMD:PCL5c,PCLXL;'), 'HP LaserJet Pro M428f-M429f');
    assert.equal(cleanModel('HP ETHERNET MULTI-ENVIRONMENT,SN:X,PID:HP LaserJet Pro M428f-M429f'), 'HP LaserJet Pro M428f-M429f');
  });
  test('una web cualquiera ("Default Page") no pasa la sonda Lexmark', async () => {
    const f = getFamily('lexmark.cgi')!;
    const p = await f.probeIdentity!({ ip: '10.0.0.31', community: '', ports: WEB_ONLY, http: async () => '<html><head><title>Default Page</title></head><body>It works</body></html>', snmp: new FakeSnmp({}) as unknown as SnmpClient, pjl: async () => null, ipp: async () => null });
    assert.equal(p, null);
  });
  test('firmware HP: ignora la revisión LEDM', async () => {
    const xml = `<prdcfgdyn:ProductConfigDyn><dd:Version><dd:Revision>SVN-IPG-LEDM.690</dd:Revision><dd:Date>2011-03-30</dd:Date></dd:Version><dd:Version><dd:Revision>CLRWTRXXXN002.2413A.00</dd:Revision><dd:Date>2024-03-25</dd:Date></dd:Version><dd:MakeAndModel>HP Color LaserJet Pro MFP M479fdw</dd:MakeAndModel><dd:SerialNumber>CNBMM7522Z</dd:SerialNumber></prdcfgdyn:ProductConfigDyn>`;
    const identity = id('hp', 'HP Color LaserJet Pro MFP M479fdw');
    const res = await getFamily('hp.devmgmt')!.collect(ctxWith(identity, { '/DevMgmt/ProductConfigDyn.xml': xml }, {}, WEB_ONLY), ['identity']);
    assert.equal(res?.identity?.firmware, 'CLRWTRXXXN002.2413A.00');
    assert.equal(res?.identity?.serial, 'CNBMM7522Z');
  });
});

describe('identidad real de la flota (hrDeviceDescr de familia + sysDescr exacto)', () => {
  test('Samsung: hrDeviceDescr "M337x 387x 407x Series" + sysDescr SL-M4072FD → perfil sl-m4072fd', () => {
    const r = resolve(id('samsung', 'Samsung M337x 387x 407x Series', { sysDescr: 'Samsung SL-M4072FD; V4.00.02.18 MAY-08-2017;Engine V1.03.14' }), ALL_PORTS);
    assert.equal(r.profile?.id, 'samsung.sl-m4072fd');
    assert.equal(resolve(id('samsung', 'Samsung M332x 382x 402x Series', { sysDescr: 'Samsung SL-M4020ND; V4.00.02.22' }), ALL_PORTS).profile?.id, 'samsung.sl-m4020nd');
    assert.equal(resolve(id('samsung', 'Samsung M4370 5370 Series', { sysDescr: 'Samsung M5370LX; V5.H6.01' }), ALL_PORTS).profile?.id, 'samsung.m5370lx');
    assert.equal(resolve(id('samsung', 'Samsung X4300 Series', { sysDescr: 'Samsung X4300LX; V6.K6.00' }), ALL_PORTS).profile?.id, 'samsung.x4300lx');
  });
  test('HP fabricado por Samsung (OID 236, modelo HP) → perfil HP aunque la marca SNMP diga samsung', () => {
    const r = resolve(id('samsung', 'HP LaserJet Pro MFP M428fdw', { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT' }), ALL_PORTS);
    assert.equal(r.profile?.id, 'hp.m428fdw');
    assert.equal(r.family.id, 'hp.devmgmt');
  });
  test('equipo mono: mono = total aunque la fuente traiga un mono inconsistente', () => {
    const identity = id('hp', 'HP LaserJet Pro MFP M428fdw', { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT' });
    const r = resolve(identity, WEB_ONLY);
    const reading = toDeviceReading(identity, { method: 'ews', meters: { total: 61347, mono: 643, color: null, source: 'ews' } }, r.profile);
    assert.deepEqual([reading.total_pages, reading.mono_pages, reading.color_pages], [61347, 61347, 0]);
  });
});

describe('registry.resolve: familia persistida no bloquea perfiles', () => {
  test('driver persistido = familia samsung.syncthru, pero el equipo tiene perfil → gana el perfil', () => {
    const r = resolve(id('samsung', 'Samsung M337x 387x 407x Series', { sysDescr: 'Samsung SL-M4072FD; V4.00.02.18' }), ALL_PORTS, 'samsung.syncthru');
    assert.equal(r.profile?.id, 'samsung.sl-m4072fd');
  });
  test('HP M428 con driver persistido samsung.syncthru → hp.m428fdw', () => {
    assert.equal(resolve(id('hp', 'HP LaserJet Pro MFP M428fdw', { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT' }), ALL_PORTS, 'samsung.syncthru').profile?.id, 'hp.m428fdw');
  });
  test('familia persistida que ya no aplica (marca distinta) se descarta', () => {
    const r = resolve(id('hp', 'HP LaserJet Pro M404dn'), WEB_ONLY, 'samsung.syncthru');
    assert.equal(r.family.id, 'hp.devmgmt');
  });
  test('familia persistida válida sin perfil se respeta', () => {
    assert.equal(resolve(id('samsung', 'Samsung ML-3710ND'), WEB_ONLY, 'samsung.syncthru').family.id, 'samsung.syncthru');
  });
});

// ─── HP FutureSmart (fixtures reales del E47528 192.168.178.27) ─────────────
import fs from 'fs';
import path from 'path';
const FS_DIR = path.join(__dirname, 'fixtures', 'hp-futuresmart');
const fsPage = (n: string) => fs.readFileSync(path.join(FS_DIR, n), 'utf8');

describe('familia hp.futuresmart (E47528 real)', () => {
  const pages = {
    '/hp/device/DeviceInformation/View': fsPage('DeviceInformation.html'),
    '/hp/device/InternalPages/Index?id=ConfigurationPage': fsPage('ConfigurationPage.html'),
    '/hp/device/InternalPages/Index?id=UsagePage': fsPage('UsagePage.html'),
    '/hp/device/InternalPages/Index?id=SuppliesStatus': fsPage('SuppliesStatus.html'),
  };
  const snmp = {
    '1.3.6.1.2.1.43.10.2.1.4.1.1': 1170, '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.6.0': 332, '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.7.0': 838,
  };
  test('perfil E47528 → familia hp.futuresmart', () => {
    const r = resolve(id('hp', 'HP Color LaserJet MFP E47528', { sysDescr: 'HP ETHERNET MULTI-ENVIRONMENT,ROM none,JETDIRECT,JD149' }), WEB_ONLY);
    assert.equal(r.profile?.id, 'hp.e47528'); assert.equal(r.family.id, 'hp.futuresmart');
  });
  test('contadores: SNMP manda (1170/332/838) y el EWS aporta el desglose', async () => {
    const identity = id('hp', 'HP Color LaserJet MFP E47528');
    const res = await getFamily('hp.futuresmart')!.collect(ctxWith(identity, pages, snmp, WEB_ONLY), ['identity', 'meters', 'supplies', 'trays']);
    assert.ok(res);
    assert.deepEqual([res.meters?.total, res.meters?.mono, res.meters?.color, res.meters?.source], [1170, 332, 838, 'snmp']);
    const d = res.meters?.detail!;
    assert.deepEqual(d.print, { mono: 224, color: 829, total: 1053 });
    assert.deepEqual(d.copy,  { mono: 15, color: 0, total: 15 });
    assert.deepEqual(d.equivalentA4, { mono: 239, color: 829, total: 1068 });
    assert.deepEqual(d.duplexEquivalent, { mono: 75, color: 345, total: 420 });
    assert.equal(d.scans?.total, 501); assert.equal(d.scans?.send, 484);
    assert.equal(d.engineCycles, 1170); assert.equal(d.colorEngineCycles, 838);
    // identidad + extras
    assert.equal(res.identity?.model, 'HP Color LaserJet MFP E47528');
    assert.equal(res.identity?.serial, 'CNCRS415SQ');
    assert.equal(res.identity?.sku, '3QA75A');
    assert.equal(res.identity?.hostname, 'TECNO-47528');
    assert.equal(res.identity?.location, 'Tecnologia');
    assert.equal(res.identity?.firmware, '2509515_000481 [20260311]');
    assert.equal(res.device?.firmwarePackage, '5.9.2.3');
    assert.equal(res.device?.formatterNumber, '82Q0TPC');
    assert.equal(res.device?.ramMb, 2048);
    assert.match(res.device?.platform ?? '', /FutureSmart\s+5/);
    // insumos
    const k = res.supplies?.toners.black!;
    assert.deepEqual([k.percentage, k.code, k.orderNumber, k.serial, k.printed, k.remainingPages, k.firstInstallDate, k.lastUseDate], [30, 'W2020A', 'W9090MC', '101058551', 1182, 500, '20241001', '20260814']);
    assert.equal(res.supplies?.toners.yellow?.percentage, 20);
    assert.equal(res.supplies?.toners.cyan?.remainingPages, 550);
    // bandejas desde ConfigurationPage
    assert.equal(res.trays?.input?.[1].paperSize, 'A4 (210 x 297 mm)');
    assert.equal(res.method, 'snmp');
  });
  test('sin SNMP: los ciclos del motor reemplazan a prtMarkerLifeCount', async () => {
    const identity = id('hp', 'HP Color LaserJet MFP E47528', { source: 'ews' });
    const res = await getFamily('hp.futuresmart')!.collect(ctxWith(identity, pages, {}, WEB_ONLY), ['identity', 'meters']);
    assert.deepEqual([res?.meters?.total, res?.meters?.mono, res?.meters?.color, res?.meters?.source], [1170, 332, 838, 'ews']);
  });
  test('normalización: DeviceReading con firmware, sku y desglose en supplies_details', async () => {
    const identity = id('hp', 'HP Color LaserJet MFP E47528');
    const r = resolve(identity, WEB_ONLY);
    const res = await r.family.collect(ctxWith(identity, pages, snmp, WEB_ONLY), ['identity', 'meters', 'supplies']);
    const reading = toDeviceReading(identity, res, r.profile);
    assert.equal(reading.firmware, '2509515_000481 [20260311]');
    assert.equal(reading.hostname, 'TECNO-47528');
    assert.equal(reading.total_pages, 1170);
    assert.equal(reading.toner_black, 30);
    assert.equal(reading.cartridge_code_black, 'W2020A');
    assert.equal(reading.cartridge_estimated_black, 500);
    assert.equal(reading.supplies_details?.device?.sku, '3QA75A');
    assert.equal(reading.supplies_details?.counters?.scans?.total, 501);
    assert.equal(reading.supplies_details?.toners?.black?.orderNumber, 'W9090MC');
    assert.equal(reading.poll_method, 'snmp');
  });
  test('fsNum: formatos de número', async () => {
    const { fsNum } = await import('../snmp/ews-parsers/hp-futuresmart');
    assert.deepEqual(['1,053', '1,053.0', '1.053,0', '829.0', '30%', '2048 MB', '0'].map(fsNum), [1053, 1053, 1053, 829, 30, 2048, 0]);
  });
});

describe('SNMP bloqueado por el cliente → EWS como fuente, sin esperar timeouts', () => {
  test('SnmpClient.markUnreachable cortocircuita get/getMany/subtree', async () => {
    const { SnmpClient } = await import('../capture/transport/snmp');
    const c = new SnmpClient('10.255.255.1', 'public');
    c.markUnreachable();
    const t = Date.now();
    assert.equal(await c.get('1.3.6.1.2.1.1.1.0'), null);
    assert.deepEqual(await c.getMany(['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']), [null, null]);
    assert.equal((await c.subtree('1.3.6.1.2.1.43.11.1.1.6')).size, 0);
    assert.ok(Date.now() - t < 200, 'no debe esperar timeouts SNMP');
    assert.equal(c.unreachable, true);
    c.close();
  });
});

describe('Samsung XOA suppliesView (X4300LX real): sin bandejas basura', () => {
  test('no toma JavaScript como bandeja y extrae vida de rodillos', async () => {
    const { parseSamsungSolutionSupplies } = await import('../snmp/ews-parsers/samsung');
    const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'samsung-sws', 'suppliesView-x4300lx.html'), 'utf8');
    const p = parseSamsungSolutionSupplies(html);
    const trays = p.suppliesDetails?.inputTrays ?? [];
    assert.ok(!trays.some(t => /function|buttonFunc|\(|\{/.test(`${t.name} ${t.paperSize} ${t.paperType}`)), JSON.stringify(trays));
    assert.ok(!trays.some(t => t.name === '소모품'));
    const rollers = p.suppliesDetails?.maintenance?.other ?? [];
    assert.ok(rollers.length >= 3, `rodillos: ${JSON.stringify(rollers)}`);
    const t1 = rollers.find(r => r.name === 'Tray 1 roller')!;
    assert.equal(t1.maxCapacity, 200000); assert.equal(t1.percentage, 20);
    assert.equal(p.tonerBlack, 46);
  });
  test('normalize descarta bandejas con código aunque vengan de la familia', () => {
    const identity = id('samsung', 'X4300LX');
    const reading = toDeviceReading(identity, { method: 'ews', trays: { input: [{ name: '소모품', paperSize: 'buttonFunc["x"] = "y";', paperType: 'if(a){' }, { name: 'Tray 1', paperSize: 'A4', paperType: 'Plain' }], source: 'ews' } });
    const trays = reading.supplies_details?.inputTrays ?? [];
    assert.ok(trays.every(t => !/[{}();=]/.test(`${t.paperSize ?? ''}${t.paperType ?? ''}`)), JSON.stringify(trays));
    assert.ok(trays.some(t => t.name === 'Tray 1' && t.paperSize === 'A4'));
  });
});
