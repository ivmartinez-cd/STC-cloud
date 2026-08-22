import snmp from 'net-snmp';

export const SNMP_TIMEOUT_MS = 3000;
export const SNMP_RETRIES    = 1;
/** Máximo de OIDs por PDU GET (la mayoría de los firmwares toleran 20–25). */
const GET_BATCH = 16;

/** Timeout/retries para credenciales #2..N durante la negociación — ya se sabe
 *  que el host está vivo (por eso pueden ser más agresivos que la #1). */
const NEGOTIATE_NEXT_TIMEOUT_MS = 1500;
const NEGOTIATE_NEXT_RETRIES = 0;
/** Presupuesto duro de tiempo total de negociación, sin importar cuántas
 *  credenciales haya — nunca se deja que una lista larga cuelgue el ciclo. */
const NEGOTIATE_BUDGET_MS = 12000;
/** Primer PDU de la negociación — el mismo que usa `snmpIdentity()` como
 *  primer chequeo del ciclo, así que si la credencial sirve, el valor queda
 *  sembrado en cache y no se vuelve a pedir. */
const PROBE_OID = '1.3.6.1.2.1.1.2.0'; // sysObjectID

export type SnmpScalar = number | string | null;

export type SecurityLevelName = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv';
export type AuthProtocolName = 'md5' | 'sha' | 'sha224' | 'sha256' | 'sha384' | 'sha512';
export type PrivProtocolName = 'des' | 'aes' | 'aes256b' | 'aes256r';

/**
 * Credencial SNMP — v1/v2c (community) o v3 (usuario USM). `id` es el
 * identificador ESTABLE que manda el cloud (ver `services/snmpCredentials.ts`
 * del lado cloud) — se usa para cachear "qué credencial sirvió" por
 * dispositivo sin que un reorder en el portal invalide el hint de toda la
 * flota (ver `sync/database.ts` — `known_devices.snmp_cred_id`).
 */
export type SnmpCredential =
  | { id: string; version: 'v1' | 'v2c'; community: string }
  | {
      id: string;
      version: 'v3';
      username: string;
      security_level: SecurityLevelName;
      auth_protocol?: AuthProtocolName;
      auth_key?: string;
      priv_protocol?: PrivProtocolName;
      priv_key?: string;
    };

type ProbeResult = 'ok' | 'auth-rejected' | 'no-response';

function buildSession(ip: string, cred: SnmpCredential, timeout: number, retries: number): snmp.Session {
  if (cred.version === 'v3') {
    const user: snmp.V3User = {
      name: cred.username,
      level: snmp.SecurityLevel[cred.security_level],
    };
    if (cred.auth_protocol) {
      user.authProtocol = snmp.AuthProtocols[cred.auth_protocol];
      user.authKey = cred.auth_key;
    }
    if (cred.priv_protocol) {
      user.privProtocol = snmp.PrivProtocols[cred.priv_protocol];
      user.privKey = cred.priv_key;
    }
    return snmp.createV3Session(ip, user, { timeout, retries });
  }
  return snmp.createSession(ip, cred.community, {
    timeout, retries,
    version: cred.version === 'v1' ? snmp.Version1 : snmp.Version2c,
  });
}

/**
 * Cliente SNMP perezoso con lista de credenciales: negocia UNA vez por ciclo
 * (memoizado — `capture/index.ts` corre varias sondas de familia en paralelo
 * sobre el mismo cliente, sin memoización dispararían negociaciones
 * redundantes) probando credenciales en orden hasta que una responda.
 * Todas las operaciones de lectura resuelven `null`/vacío en error — nunca
 * lanzan — para que las familias puedan componer lecturas "best effort" sin
 * try/catch por OID.
 *
 * Regla de fail-fast (el porqué está en el plan de esta pasada, no es un
 * detalle): probar N credenciales contra un host MUERTO multiplicaría el
 * timeout de escaneo por N. La credencial #1 paga el timeout completo (mismo
 * costo que hoy); si no responde y no hay evidencia de que el host esté vivo
 * (`markHostAlive()` — puerto TCP abierto, o ya es un dispositivo conocido),
 * se corta ahí. Con evidencia de vida, las credenciales #2..N usan timeout
 * reducido. Un rechazo de autenticación SNMPv3 clasificado como Report PDU
 * inmediato (`EAuthFailure` — username desconocido, falta el flag de
 * auth/priv requerido, engine ID desconocido) SIEMPRE sigue con la próxima,
 * sin pagar timeout — el host está vivo, la credencial es la mala. Ojo: esto
 * NO cubre el caso más común de "usuario correcto, contraseña incorrecta" —
 * verificado contra un agente SNMPv3 real (`tests/snmpSimulator.ts`) que ese
 * caso NO genera Report PDU (RFC 3414, digest inválido se descarta en
 * silencio) y cae en la rama genérica de `no-response` de abajo, acotada por
 * el timeout reducido + presupuesto duro igual que un host muerto.
 */
export class SnmpClient {
  private session: snmp.Session | null = null;
  /** Cache por OID dentro de un mismo ciclo (evita re-consultar sysDescr, serial, etc.). */
  private cache = new Map<string, SnmpScalar>();
  private failures = 0;
  private forcedUnreachable = false;
  /** `true` si NINGUNA credencial de la lista sirvió (se agotaron todas, o se
   *  cortó por fail-fast). Se distingue de `failures` porque un rechazo de
   *  autenticación (v3) no incrementa `failures` — el host respondió. */
  private negotiationFailed = false;
  private hostAlive = false;
  private negotiation: Promise<snmp.Session | null> | null = null;
  private activeCredId: string | null = null;

  constructor(
    private readonly ip: string,
    private readonly credentials: SnmpCredential[],
    private readonly preferredCredentialId?: string | null,
    /** Seam de test: reemplaza `buildSession` real por una fábrica de
     *  sesiones falsas, sin mockear el módulo `net-snmp` completo. */
    private readonly sessionFactory: (ip: string, cred: SnmpCredential, timeout: number, retries: number) => snmp.Session = buildSession
  ) {}

  get unreachable(): boolean {
    return this.forcedUnreachable || this.negotiationFailed || (this.failures >= 1 && this.cache.size === 0);
  }

  markUnreachable(): void { this.forcedUnreachable = true; }

  /** El motor la invoca apenas detecta algún puerto TCP abierto (o el equipo
   *  ya está en `known_devices`) — evidencia de que hay ALGO vivo en esa IP,
   *  aunque no sea necesariamente SNMP. Habilita el fail-fast a probar más de
   *  una credencial. */
  markHostAlive(): void { this.hostAlive = true; }

  /** `id` de la credencial que sirvió esta ronda, o `null` si ninguna lo hizo
   *  (o todavía no se negoció). Para que `ScanService` lo persista en
   *  `known_devices.snmp_cred_id` y acelere el próximo ciclo. */
  get activeCredentialId(): string | null { return this.activeCredId; }

  close(): void {
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
  }

  private orderedCredentials(): SnmpCredential[] {
    if (!this.preferredCredentialId) return this.credentials;
    const idx = this.credentials.findIndex((c) => c.id === this.preferredCredentialId);
    if (idx <= 0) return this.credentials;
    const copy = this.credentials.slice();
    const [preferred] = copy.splice(idx, 1);
    copy.unshift(preferred);
    return copy;
  }

  private probeOnce(session: snmp.Session): Promise<{ result: ProbeResult; value?: SnmpScalar }> {
    return new Promise((resolve) => {
      try {
        session.get([PROBE_OID], (err, varbinds) => {
          if (err) {
            if (err instanceof snmp.ResponseInvalidError && err.code === snmp.ResponseInvalidCode.EAuthFailure) {
              resolve({ result: 'auth-rejected' });
              return;
            }
            resolve({ result: 'no-response' });
            return;
          }
          if (!varbinds?.length) { resolve({ result: 'no-response' }); return; }
          const vb = varbinds[0];
          // Respondió aunque sea con un error de protocolo (noSuchName) — la
          // credencial es válida, simplemente ese OID no existe en este equipo.
          if (snmp.isVarbindError(vb)) { resolve({ result: 'ok' }); return; }
          resolve({ result: 'ok', value: coerce(vb.value, false) });
        });
      } catch {
        resolve({ result: 'no-response' });
      }
    });
  }

  private async negotiate(): Promise<snmp.Session | null> {
    const ordered = this.orderedCredentials();
    if (ordered.length === 0) { this.negotiationFailed = true; return null; }

    const deadline = Date.now() + NEGOTIATE_BUDGET_MS;

    for (let i = 0; i < ordered.length; i++) {
      if (Date.now() > deadline) break;
      const cred = ordered[i];
      const isFirst = i === 0;
      const timeout = isFirst ? SNMP_TIMEOUT_MS : NEGOTIATE_NEXT_TIMEOUT_MS;
      const retries = isFirst ? SNMP_RETRIES : NEGOTIATE_NEXT_RETRIES;

      let session: snmp.Session;
      try {
        session = this.sessionFactory(this.ip, cred, timeout, retries);
      } catch {
        continue; // credencial mal formada (no debería pasar, ya validada del lado cloud) — probar la siguiente
      }

      const outcome = await this.probeOnce(session);

      if (outcome.result === 'ok') {
        if (outcome.value !== undefined) this.cache.set(PROBE_OID, outcome.value);
        this.activeCredId = cred.id;
        return session;
      }

      try { session.close(); } catch { /* ignore */ }

      if (outcome.result === 'no-response') {
        this.failures++;
        if (!this.hostAlive) break; // fail-fast: sin evidencia de vida, no insistir con más credenciales
      }
      // 'auth-rejected' siempre sigue con la próxima credencial.
    }

    this.negotiationFailed = true;
    return null;
  }

  /** Reemplaza al viejo `open()` síncrono. Memoizado: una sola negociación en
   *  vuelo por instancia, aunque varias operaciones la pidan en paralelo. */
  private ensureSession(): Promise<snmp.Session | null> {
    if (!this.negotiation) {
      this.negotiation = this.negotiate().then((s) => { this.session = s; return s; });
    }
    return this.negotiation;
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
  async subtree(baseOid: string, maxEntries = 256, raw = false): Promise<Map<string, SnmpScalar>> {
    const result = new Map<string, SnmpScalar>();
    if (this.unreachable) return result;
    const session = await this.ensureSession();
    if (!session) return result;
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(result); } };
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
  private async rawGet(oids: string[], raw = false): Promise<{ values: SnmpScalar[]; responded: boolean }> {
    const none = { values: oids.map(() => null), responded: false };
    const session = await this.ensureSession();
    if (!session) return none;
    return new Promise((resolve) => {
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
