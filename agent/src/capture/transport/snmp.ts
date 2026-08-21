import snmp from 'net-snmp';

export const SNMP_TIMEOUT_MS = 3000;
export const SNMP_RETRIES    = 1;
/** Máximo de OIDs por PDU GET (la mayoría de los firmwares toleran 20–25). */
const GET_BATCH = 16;

export type SnmpScalar = number | string | null;

/**
 * Cliente SNMP v2c minimalista y perezoso: abre la sesión en el primer uso y la cierra con `close()`.
 * Todas las operaciones resuelven `null`/vacío en error — nunca lanzan — para que las familias
 * puedan componer lecturas "best effort" sin try/catch por OID.
 */
export class SnmpClient {
  private session: snmp.Session | null = null;
  /** Cache por OID dentro de un mismo ciclo (evita re-consultar sysDescr, serial, etc.). */
  private cache = new Map<string, SnmpScalar>();
  private failures = 0;

  constructor(private readonly ip: string, private readonly community: string) {}

  private forcedUnreachable = false;

  /**
   * True si el dispositivo no respondió nada (SNMP deshabilitado/filtrado por política del cliente).
   * Basta un PDU sin respuesta (ya incluye el reintento de net-snmp) con la cache vacía: a partir de ahí
   * todas las operaciones del ciclo resuelven `null` sin esperar más timeouts.
   */
  get unreachable(): boolean { return this.forcedUnreachable || (this.failures >= 1 && this.cache.size === 0); }

  /**
   * Marca el dispositivo como sin SNMP para el resto del ciclo: todas las operaciones resuelven `null`
   * de inmediato (sin esperar timeouts). Lo invoca el motor cuando la identificación SNMP falló y la
   * identidad vino por EWS/PJL/IPP — caso típico de clientes que bloquean SNMP v1/v2.
   */
  markUnreachable(): void { this.forcedUnreachable = true; }

  private open(): snmp.Session {
    if (!this.session) {
      this.session = snmp.createSession(this.ip, this.community, {
        timeout: SNMP_TIMEOUT_MS,
        retries: SNMP_RETRIES,
        version: snmp.Version2c,
      });
    }
    return this.session;
  }

  close(): void {
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
  }

  /**
   * GET de un OID escalar. `null` si no existe, error o timeout.
   * @param raw Si true, los OCTET STRING se devuelven como string 'binary' (latin1, byte a byte) en vez de UTF-8
   *            — necesario para MACs (ifPhysAddress) y máscaras de bits (hrPrinterDetectedErrorState).
   */
  async get(oid: string, raw = false): Promise<SnmpScalar> {
    if (!raw) { const r = await this.getMany([oid]); return r[0] ?? null; }
    if (this.forcedUnreachable) return null;
    const key = `raw:${oid}`;
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    if (this.unreachable) return null;
    const { values, responded } = await this.rawGet([oid], true);
    const v = values[0] ?? null;
    if (responded) this.cache.set(key, v);
    return v;
  }

  /** GET de varios OIDs en lotes; mantiene el orden. */
  async getMany(oids: string[]): Promise<SnmpScalar[]> {
    const out: SnmpScalar[] = new Array(oids.length).fill(null);
    if (this.forcedUnreachable) return out;
    const pending: Array<{ i: number; oid: string }> = [];
    oids.forEach((oid, i) => {
      if (this.cache.has(oid)) out[i] = this.cache.get(oid) ?? null;
      else pending.push({ i, oid });
    });
    for (let s = 0; s < pending.length; s += GET_BATCH) {
      if (this.unreachable) break;
      const batch = pending.slice(s, s + GET_BATCH);
      const { values, responded } = await this.rawGet(batch.map(b => b.oid));
      // Si el equipo RESPONDIÓ pero con error para todo el PDU (firmwares que devuelven noSuchName al lote),
      // reintentar uno a uno. Si no respondió (timeout: SNMP bloqueado), no insistir.
      const allNull = values.every(v => v === null);
      if (responded && allNull && batch.length > 1) {
        for (const b of batch) {
          const v = (await this.rawGet([b.oid])).values[0] ?? null;
          this.cache.set(b.oid, v);
          out[b.i] = v;
        }
      } else {
        batch.forEach((b, k) => { const v = values[k] ?? null; if (responded) this.cache.set(b.oid, v); out[b.i] = v; });
      }
    }
    return out;
  }

  /** Primer valor no nulo de una lista de OIDs candidatos (en orden de preferencia). */
  async getFirst(oids: readonly string[]): Promise<SnmpScalar> {
    for (const oid of oids) {
      const v = await this.get(oid);
      if (v !== null) return v;
    }
    return null;
  }

  /** Entero o `null`. */
  async getInt(oid: string): Promise<number | null> {
    return toNum(await this.get(oid));
  }

  async getFirstInt(oids: readonly string[]): Promise<number | null> {
    for (const oid of oids) {
      const v = toNum(await this.get(oid));
      if (v !== null) return v;
    }
    return null;
  }

  /** String limpio (sin NUL ni control chars) o `null`. */
  async getStr(oid: string): Promise<string | null> {
    return toStr(await this.get(oid));
  }

  async getFirstStr(oids: readonly string[]): Promise<string | null> {
    for (const oid of oids) {
      const v = toStr(await this.get(oid));
      if (v) return v;
    }
    return null;
  }

  /**
   * Recorre un subárbol (GETBULK) y devuelve `{ suffix → value }` donde `suffix` es el índice
   * relativo a `baseOid` (p. ej. "1.3" en una tabla de dos índices).
   * Limita a `maxEntries` para no colgar firmwares con tablas enormes.
   */
  subtree(baseOid: string, maxEntries = 256, raw = false): Promise<Map<string, SnmpScalar>> {
    const result = new Map<string, SnmpScalar>();
    if (this.unreachable) return Promise.resolve(result);
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(result); } };
      let session: snmp.Session;
      try { session = this.open(); } catch { done(); return; }
      const timer = setTimeout(done, SNMP_TIMEOUT_MS * (SNMP_RETRIES + 2));
      try {
        session.subtree(baseOid, 20, (varbinds) => {
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) continue;
            if (!vb.oid.startsWith(baseOid + '.')) continue;
            result.set(vb.oid.slice(baseOid.length + 1), coerce(vb.value, raw));
            if (result.size >= maxEntries) { clearTimeout(timer); done(); return; }
          }
        }, (err) => {
          clearTimeout(timer);
          if (err) this.failures++;
          done();
        });
      } catch {
        clearTimeout(timer);
        done();
      }
    });
  }

  /** `responded=false` ⇒ timeout / error de transporte (no hubo respuesta del equipo). */
  private rawGet(oids: string[], raw = false): Promise<{ values: SnmpScalar[]; responded: boolean }> {
    const none = { values: oids.map(() => null), responded: false };
    return new Promise((resolve) => {
      let session: snmp.Session;
      try { session = this.open(); } catch { resolve(none); return; }
      try {
        session.get(oids, (err, varbinds) => {
          if (err || !varbinds?.length) {
            // RequestTimedOutError / errores de socket ⇒ sin respuesta. Un error de protocolo (noSuchName, etc.) sí es respuesta.
            const timedOut = !err || /timed?\s*out|ECONN|EHOST|ENETUNREACH/i.test(err.message ?? '');
            if (timedOut) this.failures++;
            resolve({ values: oids.map(() => null), responded: !timedOut });
            return;
          }
          resolve({ values: oids.map((_, i) => { const vb = varbinds[i]; return (!vb || snmp.isVarbindError(vb)) ? null : coerce(vb.value, raw); }), responded: true });
        });
      } catch {
        this.failures++;
        resolve(none);
      }
    });
  }
}

function coerce(val: string | number | Buffer | null, raw = false): SnmpScalar {
  if (val === null || val === undefined) return null;
  if (Buffer.isBuffer(val)) return raw ? val.toString('binary') : val.toString('utf8').replace(/\0/g, '').trim();
  return val;
}

export function toNum(v: SnmpScalar): number | null {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function toStr(v: SnmpScalar): string | null {
  if (v === null) return null;
  const s = String(v).replace(/[^\x20-\x7E]/g, '').trim();
  return s.length > 0 ? s : null;
}

/** Convierte un Buffer/string de MAC SNMP (ifPhysAddress) a "AA:BB:CC:DD:EE:FF". */
export function formatMac(v: string | number | Buffer | null): string | null {
  if (!v || typeof v === 'number') return null;
  const buf = Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'binary');
  if (buf.length !== 6) return null;
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}
