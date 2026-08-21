/**
 * Familia HP "DevMgmt": LaserJet Pro (M4xx/M5xx) y FutureSmart (E4xxxx/E5xxxx/E7xxxx, M6xx).
 *
 * Fuentes (en orden de fidelidad), todas GET sin autenticación:
 *  - /DevMgmt/ProductConfigDyn.xml   → modelo, serial, firmware (dd:ProductConfigDyn)
 *  - /DevMgmt/ProductUsageDyn.xml    → TotalImpressions / MonochromeImpressions / ColorImpressions
 *  - /DevMgmt/ConsumableConfigDyn.xml→ nivel %, part number, serial de cada cartucho/tambor
 *  - /hp/device/InternalPages/Index?id=SuppliesStatus → (FutureSmart) páginas impresas/estimadas por cartucho
 *  - /hp/device/InternalPages/Index?id=UsagePage      → fallback HTML de contadores
 * HTTPS se intenta después de HTTP porque en FutureSmart "Secure by Default" el 80 redirige al 443.
 */
import { parseHpXml, parseHpConsumablesXml, parseHpSupplies, parseHpHtml, parseHpLegacyHtmlSupplies } from '../../snmp/ews-parsers/hp';
import type { EwsData } from '../../snmp/ews-parsers/types';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap } from '../types';
import { fromEwsData, mergeResults } from '../bridge';
import { xmlVal, httpRequest, mergeCookies } from '../transport/http';

async function getAny(ctx: Pick<CaptureContext, 'http' | 'ports'>, path: string): Promise<string | null> {
  // Sólo los protocolos cuyo puerto está abierto (evita esperar timeouts en equipos de otra marca).
  const a = ctx.ports.http  ? await ctx.http(path, 'http')  : null;
  if (a) return a;
  return ctx.ports.https ? ctx.http(path, 'https') : null;
}

function parseProductConfig(xml: string): Partial<EwsData> {
  const model  = xmlVal(xml, 'MakeAndModel') ?? xmlVal(xml, 'ProductName') ?? xmlVal(xml, 'MakeAndModelBase');
  const serial = xmlVal(xml, 'SerialNumber');
  // ProductConfigDyn trae varias <dd:Revision>: la primera es la versión LEDM (SVN-IPG-LEDM.x); la del firmware viene después.
  const revisions = [...xml.matchAll(/<(?:[\w-]+:)?Revision[^>]*>\s*([^<]+?)\s*<\/(?:[\w-]+:)?Revision>/gi)].map(m => m[1].trim()).filter(r => r && !/LEDM/i.test(r));
  const fw     = revisions.length ? revisions[revisions.length - 1] : (xmlVal(xml, 'FirmwareRevision') ?? null);
  const out: Partial<EwsData> = { brand: 'hp' };
  if (model)  out.model = model;
  if (serial) out.serial = serial;
  if (fw)     out.firmware = fw;
  return out;
}

// ─── FutureSmart: sesión "Administrador" sin contraseña (configuración de fábrica) ───────────────
// Si el EWS redirige a /hp/device/SignIn, se intenta iniciar sesión como Administrator con clave vacía.
// Si el equipo tiene clave configurada responde 409 y se recuerda el fallo 6 h para no insistir en cada loop.
const SIGNIN_PATH = '/hp/device/SignIn/Index?url=%2Fhp%2Fdevice%2FInternalPages%2FIndex%3Fid%3DUsagePage';
const SIGNIN_FAIL_TTL_MS = 6 * 60 * 60_000;
const signInFailedAt = new Map<string, number>();

export interface FsSession { cookie: string; protocol: 'http' | 'https'; }

export function looksLikeSignIn(body: string | null): boolean {
  // Sólo el formulario de login (las páginas normales también enlazan a /SignIn para "Cerrar sesión").
  return !!body && /id="DynamicSignIn"|<title>[^<]*Sign[\s-]?In/i.test(body);
}

export async function futureSmartSession(ip: string): Promise<FsSession | null> {
  const failed = signInFailedAt.get(ip);
  if (failed && Date.now() - failed < SIGNIN_FAIL_TTL_MS) return null;
  for (const protocol of ['https', 'http'] as const) {
    const page = await httpRequest(ip, { path: SIGNIN_PATH, protocol, timeoutMs: 6000 });
    if (!page || page.status !== 200) continue;
    const token = page.body.match(/name="CSRFToken"\s+value="([^"]+)"/i)?.[1];
    if (!token) continue;
    let cookie = mergeCookies('', page);
    const form = new URLSearchParams({
      CSRFToken: token, agentIdSelect: 'hp_EmbeddedPin_v1', PinDropDown: 'AdminItem',
      UserNameTextBox: '', PasswordTextBox: '', signInOk: 'Sign In',
    }).toString();
    const res = await httpRequest(ip, {
      path: SIGNIN_PATH, protocol, method: 'POST', body: form, timeoutMs: 8000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, Referer: `${protocol}://${ip}/hp/device/SignIn/Index` },
    });
    if (res && (res.status === 302 || res.status === 303 || res.status === 200) && !looksLikeSignIn(res.status === 200 ? res.body : null)) {
      cookie = mergeCookies(cookie, res);
      return { cookie, protocol };
    }
    // 409 = credenciales inválidas (tiene contraseña) → no insistir
    signInFailedAt.set(ip, Date.now());
    return null;
  }
  return null;
}

export async function fetchWithSession(ip: string, session: FsSession, path: string): Promise<string | null> {
  const res = await httpRequest(ip, { path, protocol: session.protocol, headers: { Cookie: session.cookie } });
  if (!res || res.status !== 200 || looksLikeSignIn(res.body)) return null;
  return res.body;
}

export const hpDevMgmt: CaptureFamily = {
  id: 'hp.devmgmt',
  brand: 'hp',
  displayName: 'HP LaserJet Pro / FutureSmart (DevMgmt XML + EWS)',
  capabilities: ['identity', 'meters', 'supplies', 'alerts'],
  score(identity: DeviceIdentity, ports: PortMap): number {
    if (identity.brand !== 'hp') return 0;
    if (!(ports.http || ports.https)) return 0;
    if (/ETHERNET MULTI-ENVIRONMENT|JetDirect/i.test(identity.sysDescr ?? '')) return 30; // legado: mejor hp.jetdirect-legacy
    return 80;
  },
  async probeIdentity(ctx) {
    const xml = await getAny(ctx, '/DevMgmt/ProductConfigDyn.xml');
    if (!xml || !/ProductConfigDyn|MakeAndModel|SerialNumber/i.test(xml)) return null;
    const p = parseProductConfig(xml);
    return p.model || p.serial ? { brand: 'hp', model: p.model ?? null, serial: p.serial ?? null, firmware: p.firmware ?? null } : null;
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    let result: CaptureResult | null = null;
    const add = (d: Partial<EwsData> | null) => { if (d && Object.keys(d).length > 1) result = mergeResults(result, fromEwsData(d, 'ews')); };

    if (scopes.includes('identity')) {
      const xml = await getAny(ctx, '/DevMgmt/ProductConfigDyn.xml');
      if (xml) add(parseProductConfig(xml));
    }
    let session: FsSession | null | undefined; // undefined = no intentado
    const internalPage = async (id: string): Promise<string | null> => {
      const html = await getAny(ctx, `/hp/device/InternalPages/Index?id=${id}`);
      if (html && !looksLikeSignIn(html)) return html;
      // EWS protegido: intentar sesión de Administrador sin contraseña (fábrica)
      if (session === undefined) session = await futureSmartSession(ctx.ip);
      return session ? fetchWithSession(ctx.ip, session, `/hp/device/InternalPages/Index?id=${id}`) : null;
    };
    if (scopes.includes('meters')) {
      const usage = await getAny(ctx, '/DevMgmt/ProductUsageDyn.xml');
      const parsed = usage ? parseHpXml(usage) : null;
      if (parsed?.totalPages != null) add(parsed);
      else {
        const html = await internalPage('UsagePage');
        if (html) add(parseHpHtml(html));
      }
    }
    if (scopes.includes('supplies')) {
      const cons = await getAny(ctx, '/DevMgmt/ConsumableConfigDyn.xml');
      if (cons) add(parseHpConsumablesXml(cons));
      // FutureSmart expone páginas impresas/estimadas sólo en la página HTML de insumos
      const html = await internalPage('SuppliesStatus');
      if (html) add(parseHpSupplies(html));
      if (!result) {
        const legacy = (await ctx.http('/info_suppliesStatus.html')) ?? (await ctx.http('/status/SuppliesStatus.htm'));
        if (legacy) add(parseHpLegacyHtmlSupplies(legacy));
      }
    }
    return result;
  },
};
