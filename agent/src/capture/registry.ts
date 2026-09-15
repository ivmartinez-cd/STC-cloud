/**
 * Registro de familias y perfiles de modelo + resolución de driver.
 * Orden de resolución: perfil de modelo explícito → familia con mejor puntaje → Printer-MIB genérico.
 */
import type { CaptureFamily, ModelProfile, DeviceIdentity, PortMap, ResolvedDriver, IdentityMatch } from './types';
import { detectBrandFromText } from '../snmp/oids';
import { genericPrinterMib } from './families/generic-printer-mib';
import { genericEws } from './families/generic-ews';
import { hpDevMgmt } from './families/hp-devmgmt';
import { hpJetdirectLegacy } from './families/hp-jetdirect-legacy';
import { hpFutureSmart } from './families/hp-futuresmart';
import { samsungSyncThru } from './families/samsung-syncthru';
import { samsungSws } from './families/samsung-sws';
import { lexmarkCgi } from './families/lexmark-cgi';
import { epsonWebConfig } from './families/epson-webconfig';
import { MODEL_PROFILES } from './models';

const FAMILIES: readonly CaptureFamily[] = [
  hpFutureSmart, hpDevMgmt, hpJetdirectLegacy, samsungSyncThru, samsungSws, lexmarkCgi, epsonWebConfig,
  genericEws, genericPrinterMib,
];

const familyById = new Map<string, CaptureFamily>(FAMILIES.map(f => [f.id, f]));
const profileById = new Map<string, ModelProfile>(MODEL_PROFILES.map(p => [p.id, p]));

export function listFamilies(): readonly CaptureFamily[] { return FAMILIES; }
export function listProfiles(): readonly ModelProfile[] { return MODEL_PROFILES; }
export function getFamily(id: string | null | undefined): CaptureFamily | undefined { return id ? familyById.get(id) : undefined; }
export function getProfile(id: string | null | undefined): ModelProfile | undefined { return id ? profileById.get(id) : undefined; }
export const GENERIC_FAMILY = genericPrinterMib;

export function matchesIdentity(m: IdentityMatch, identity: DeviceIdentity): boolean {
  if (m.brand) {
    // La marca "de texto" manda sobre la del enterprise OID (HP fabricados por Samsung, sondas EWS genéricas, etc.)
    const textBrand = detectBrandFromText(identity.model ?? '');
    const brand = textBrand !== 'generic' ? textBrand : identity.brand;
    if (brand !== 'generic' && brand !== m.brand) return false;
  }
  if (m.sysObjectId) {
    const oid = identity.sysObjectId ?? '';
    const ok = typeof m.sysObjectId === 'string' ? oid.startsWith(m.sysObjectId) : m.sysObjectId.test(oid);
    if (!ok && !m.model) return false;
    if (ok && !m.model) return true;
  }
  if (m.model) {
    if (m.exclude && identity.model && m.exclude.test(identity.model)) return false;
    // Primero el modelo comercial; si no alcanza, sysDescr/sysName (Samsung publica la familia en hrDeviceDescr
    // y el modelo exacto en sysDescr). `exclude` protege a los perfiles legado amplios (JetDirect).
    if (identity.model && m.model.test(identity.model)) return true;
    const hay = [identity.sysDescr, identity.sysName].filter((s): s is string => !!s);
    return hay.some(s => m.model!.test(s));
  }
  return !!m.brand && identity.brand === m.brand;
}

/** Resuelve el driver para una identidad. Nunca devuelve `undefined`: como mínimo, Printer-MIB genérico. */
export function resolve(identity: DeviceIdentity, ports: PortMap, preferredDriverId?: string | null): ResolvedDriver {
  // 0. Driver persistido de ciclos anteriores (perfil o familia) — ruta rápida
  if (preferredDriverId) {
    const p = profileById.get(preferredDriverId);
    // Si la identidad fresca ya no coincide con el perfil persistido (la IP cambió de equipo), se ignora el hint.
    if (p && (!identity.model || matchesIdentity(p.match, identity))) {
      const f = familyById.get(p.family); if (f) return { family: f, profile: p, via: 'profile' };
    }
  }
  // 1. Perfil de modelo explícito (siempre antes que una familia persistida: un perfil nuevo debe "ganar"
  //    aunque el equipo ya haya sido leído con la familia genérica de su marca)
  for (const p of MODEL_PROFILES) {
    if (!matchesIdentity(p.match, identity)) continue;
    const f = familyById.get(p.family);
    if (f) return { family: f, profile: p, via: 'profile' };
  }
  // 1b. Familia persistida de ciclos anteriores (sólo si sigue aplicando a esta identidad).
  //     El GENÉRICO no se pega: antes cortocircuitaba acá sin puntuar, así que un
  //     equipo que alguna vez cayó en Printer-MIB no podía ser ascendido nunca a una
  //     familia agregada después — el hint viejo le ganaba a la familia nueva. Le pasó
  //     al primer Epson (15/09/2026): `epson.webconfig` puntuaba 80 y jamás se la
  //     consultaba. Si acá no hay familia real aplicable, se cae al puntaje de abajo,
  //     que termina en el genérico igual cuando nadie lo reclama.
  if (preferredDriverId) {
    const f = familyById.get(preferredDriverId);
    if (f && f.id !== genericPrinterMib.id && f.score(identity, ports) > 0) {
      return { family: f, via: 'score' };
    }
  }
  // 2. Familia con mejor puntaje
  let best: CaptureFamily | null = null; let bestScore = 0;
  for (const f of FAMILIES) {
    const s = f.score(identity, ports);
    if (s > bestScore) { best = f; bestScore = s; }
  }
  if (best && best.id !== genericPrinterMib.id && bestScore >= 20) return { family: best, via: 'score' };
  // 3. Genérico
  return { family: genericPrinterMib, via: 'generic' };
}
