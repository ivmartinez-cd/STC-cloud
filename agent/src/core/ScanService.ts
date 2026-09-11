import { log } from './Logger';
import { resolveHostname, isPrivateOrReservedIp } from './NetworkUtils';
import { isBusinessHours } from './BusinessHours';
import { captureDevice, type CaptureScope, type CaptureHint } from '../capture';
import type { DeviceReading } from '../capture/reading';
import { enqueueReading, pendingCount, isBackpressureActive, upsertKnownDevice, isRegistered, getKnownDevices, getKnownDeviceInfo, shouldEnqueueReading, recordLastReadingSnapshot, getScanState, saveScanCursor, recordLapComplete, resetScanCursor, type KnownDevice, type ScanState } from '../sync/database';
import type { AgentConfig, IpHost } from './config';
import { policyFor, type DevicePolicyState } from './devicePolicy';
import type { SnmpCredential } from '../capture/transport/snmp';
import { advanceCursor, fingerprintRanges, planChunk, totalDeclaredIps, type ChunkPlan, type CursorRange, type DiscoveryCursor } from './DiscoveryCursor';

/**
 * Persistencia del cursor + backpressure, agrupados en un seam inyectable:
 * es lo único de `scan()` que toca SQLite, y así los tests del ejecutor de
 * chunks corren sin abrir una base.
 */
export interface ScanStore {
  getScanState: () => ScanState;
  saveScanCursor: (fingerprint: string, rangeIdx: number, offset: number, scannedThisLap: number) => void;
  recordLapComplete: (fingerprint: string, lapMs: number) => void;
  resetScanCursor: (fingerprint: string) => void;
  isBackpressureActive: () => boolean;
  pendingCount: () => number;
}

const REAL_STORE: ScanStore = {
  getScanState, saveScanCursor, recordLapComplete, resetScanCursor, isBackpressureActive, pendingCount,
};

interface ScanServiceDeps {
  getConfig: () => AgentConfig;
  /** Seams de test — en producción se omiten todos (SQLite, DNS y reloj reales). */
  store?: ScanStore;
  now?: () => number;
  /** Captura+registro de UNA IP ya resuelta; `true` si hubo error. */
  probeIp?: (ip: string, config: AgentConfig, creds: SnmpCredential[]) => Promise<boolean>;
  resolveHostname?: (hostname: string) => Promise<string | null>;
}

/**
 * Progreso del barrido continuo tal como viaja en el heartbeat
 * (`system_info.discovery_state`) y lo persiste el cloud en
 * `agents.discovery_state`. Campo ADITIVO: un cloud viejo lo ignora.
 */
export interface DiscoveryState {
  /** Hay una vuelta abierta (empezada y todavía sin cerrar). */
  in_progress: boolean;
  /** IPs de rango recorridas en la vuelta EN CURSO. */
  scanned: number;
  /** IPs declaradas totales (sólo rangos: los hosts puntuales son DNS, no espacio). */
  total: number;
  lap_started_at: string | null;
  last_lap_at: string | null;
  last_lap_ms: number | null;
  laps_completed: number;
}

/**
 * Scopes por loop (alineado a HP SDS: Identity/Discovery, Meter, Consumables+Tray,
 * Alert). `alerts` salió de `SUPPLIES_SCOPES` en la Fase 11 del gap analysis — antes
 * refrescaba cada 60/240 min mezclado con consumibles, ahora tiene loop propio 3/15
 * (`ALERT_SCOPES`/`runAlertTask`), sin duplicar el walk de `prtAlertTable` dos veces
 * por ciclo. `DISCOVERY_SCOPES` sigue trayendo todo — es el barrido completo de un
 * equipo recién visto o poco visitado.
 */
const DISCOVERY_SCOPES: readonly CaptureScope[] = ['identity', 'meters', 'supplies', 'alerts', 'trays'];
const METER_SCOPES:     readonly CaptureScope[] = ['meters'];
const SUPPLIES_SCOPES:  readonly CaptureScope[] = ['supplies', 'trays'];
const ALERT_SCOPES:     readonly CaptureScope[] = ['alerts'];
const CONCURRENCY_LIMIT = 10;
/**
 * Presupuesto de tiempo de UN chunk de discovery. Es lo que acota cuánto puede
 * demorar a los otros loops (alert/meter/supplies se serializan con discovery
 * en el `TaskScheduler`). No corta capturas en vuelo, corta la TOMA de IPs
 * nuevas. OJO: sólo cubre las IPs de rango — los hosts puntuales del arranque
 * de vuelta tienen su propio presupuesto, así que el chunk que ABRE una vuelta
 * dura ~`PINNED_BUDGET_MS + CHUNK_BUDGET_MS` (ver `scanPinnedHosts`). Es un
 * techo aproximado, no exacto: ninguno de los dos presupuestos aborta un
 * lookup o una captura ya empezada, sólo impide empezar la siguiente.
 */
export const CHUNK_BUDGET_MS = 40_000;
/**
 * Presupuesto propio de la fase de hosts puntuales, que corre una vez por
 * vuelta ANTES de las IPs de rango. Sin esto, 32 hostnames
 * (`MAX_HOSTNAME_SPECS` del lado cloud) con el DNS caído son 32 × 4s de
 * timeout en secuencia: el chunk de apertura duraba minutos y, como el
 * `TaskScheduler` serializa las tareas de red, el loop de alertas (cada 3 min)
 * se perdía el turno entero.
 *
 * Va SEPARADO del presupuesto del chunk a propósito: compartir un solo
 * deadline puede dejar al chunk de apertura sin tiempo para tomar ni una IP
 * y, con el cursor sin avanzar, `isAtLapStart()` seguiría en true — los hosts
 * se volverían a resolver en el chunk siguiente, sin progresar nunca. Con
 * presupuestos separados el chunk siempre toma al menos una IP (arranca con
 * el deadline entero por delante), así que el cursor SIEMPRE avanza.
 */
export const PINNED_BUDGET_MS = 20_000;
/**
 * Tope de IPs materializadas por chunk — lo único que queda del viejo
 * `MAX_TOTAL_SCAN_SIZE`, y por un motivo distinto: acá sólo acota la MEMORIA
 * del chunk, no el espacio a recorrer. El espacio declarado ya no se trunca en
 * silencio: se recorre entero en varias vueltas encadenadas (ver
 * `DiscoveryCursor.ts`). Con CONCURRENCY_LIMIT=10 y ~2s peor-caso por host
 * muerto, 400 IPs son ~80s — el presupuesto de tiempo corta antes.
 */
export const CHUNK_MAX_IPS = 400;
/**
 * Dedupe de lecturas idénticas en meter/supplies (gap analysis: un equipo
 * ocioso mandaba 72 filas/día sin comparar contra la anterior). Se manda si
 * cambió algo relevante (contadores/tóner) o ya pasaron estas horas desde el
 * último envío — para no perder la señal de "sigo vivo" indefinidamente.
 * Sólo aplica acá (meter/supplies, loop frecuente); discovery no se dedupea
 * (corre cada 10-60 min, y siempre puede estar registrando un equipo nuevo).
 */
const DEDUPE_WINDOW_HOURS = 4;

function hintFrom(d: KnownDevice | null): CaptureHint | undefined {
  if (!d) return undefined;
  return { driver: d.driver, brand: d.brand, model: d.model, serial: d.serial, pollMethod: d.poll_method };
}

/** Lista de credenciales a probar + cuál probar primero (si ya se sabe cuál
 *  sirvió la última vez para esta IP — evita recorrer toda la lista en cada
 *  ciclo para equipos ya conocidos). */
function snmpArgsFor(credentials: SnmpCredential[], known: KnownDevice | null) {
  return { credentials, preferredCredentialId: known?.snmp_cred_id ?? null };
}

/**
 * Filtra el pool de credenciales del agente a las que un rango/host puntual
 * declaró vía `credential_ids` (§2.3 gap analysis: "credenciales por
 * rango") — ausente = pool completo (comportamiento de siempre). Preserva
 * el ORDEN del pool original: es un filtro/subset, no una re-priorización,
 * para no alterar la semántica de fail-fast ya establecida en
 * `SnmpClient.negotiate()`. El cloud ya resolvió ids colgantes antes de
 * mandar esto (ver `agentService.getConfig()`), así que acá `credentialIds`
 * sólo contiene ids que existen en el pool, cuando viene presente.
 */
export function credentialsForRange(pool: SnmpCredential[], credentialIds: string[] | undefined): SnmpCredential[] {
  if (!credentialIds || credentialIds.length === 0) return pool;
  const idSet = new Set(credentialIds);
  return pool.filter((c) => idSet.has(c.id));
}

/**
 * `datetime('now')` de SQLite devuelve "YYYY-MM-DD HH:MM:SS" en UTC pero SIN
 * sufijo de zona, y `new Date()` lo interpretaría como hora LOCAL (en un
 * agente en GMT-3 la vuelta duraría 3 horas de más). Acepta también ISO ya
 * zonificado, por si el valor viene de otro lado.
 */
function sqliteUtcToMs(value: string | null): number | null {
  if (!value) return null;
  const hasZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(value);
  const ms = Date.parse(hasZone ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function toIso(value: string | null): string | null {
  const ms = sqliteUtcToMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 120 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

/** Deriva el contrato `discovery_state` del estado persistido. Separado de la
 *  clase porque el heartbeat lo arma sin pasar por `ScanService`. */
export function buildDiscoveryState(state: ScanState, ranges: CursorRange[]): DiscoveryState {
  // Un cursor con otra huella es progreso de un espacio que ya no existe (el
  // próximo chunk lo reinicia, ver `scan()`): reportar ese `scanned` contra el
  // `total` NUEVO daría un porcentaje imposible en el portal — 900/10 — durante
  // toda la ventana entre la edición de rangos y el chunk siguiente (hasta 60
  // min). Las métricas históricas (`last_lap_*`, `laps_completed`) sí siguen
  // valiendo: `resetScanCursor()` no las toca.
  const stale = state.fingerprint !== fingerprintRanges(ranges);
  return {
    // `lap_started_at` es el marcador de vuelta abierta: `recordLapComplete()`
    // lo pone en NULL al cerrarla.
    in_progress:    !stale && state.lap_started_at !== null,
    scanned:        stale ? 0 : state.scanned_this_lap,
    total:          totalDeclaredIps(ranges),
    lap_started_at: stale ? null : toIso(state.lap_started_at),
    last_lap_at:    toIso(state.last_lap_at),
    last_lap_ms:    state.last_lap_ms,
    laps_completed: state.laps_completed,
  };
}

/** El cursor está en el arranque de una vuelta (nada consumido todavía). */
function isAtLapStart(state: ScanState): boolean {
  return state.range_idx === 0 && state.offset_in_range === 0 && state.scanned_this_lap === 0;
}

/**
 * Orquesta los cuatro loops de red del agente usando el motor de captura:
 *  - scan()             : UN chunk del barrido continuo de discovery (ver `DiscoveryCursor.ts`).
 *  - runMeterTask()     : contadores de equipos conocidos (ruta rápida: driver persistido).
 *  - runSuppliesTask()  : insumos y bandejas de equipos conocidos.
 *  - runAlertTask()     : alertas de equipos conocidos — loop propio 3/15 (Fase 11).
 */
export class ScanService {
  private deps: ScanServiceDeps;
  private store: ScanStore;
  private now: () => number;
  private probeIp: (ip: string, config: AgentConfig, creds: SnmpCredential[]) => Promise<boolean>;
  private resolveDns: (hostname: string) => Promise<string | null>;
  private _isScanning = false;
  private _lastScanErrors = 0;
  /** Errores acumulados de la vuelta EN CURSO (sólo para el log de cierre;
   *  `_lastScanErrors` sigue siendo por chunk, que es lo que mira el heartbeat). */
  private _lapErrors = 0;
  /** Con una vuelta abierta el scheduler ofrece un chunk cada 5s: sin esto, el
   *  aviso de backpressure se repetiría 720 veces por hora en `agent_logs` (que
   *  viajan al cloud en cada heartbeat). Se loguea el cambio de estado, no cada
   *  chunk omitido. */
  private _backpressureLogged = false;
  /** Reinicio pedido mientras había un chunk en vuelo (ver `restartDiscovery`). */
  private _restartPending = false;
  /** Por dónde sigue la rotación de hosts puntuales cuando `PINNED_BUDGET_MS`
   *  corta la lista a la mitad. En memoria a propósito: un reinicio del agente
   *  la manda al primero, que es exactamente lo que queremos ahí. */
  private _pinnedIdx = 0;

  constructor(deps: ScanServiceDeps) {
    this.deps = deps;
    this.store = deps.store ?? REAL_STORE;
    this.now = deps.now ?? Date.now;
    this.probeIp = deps.probeIp ?? ((ip, config, creds) => this.captureAndRecord(ip, config, creds));
    this.resolveDns = deps.resolveHostname ?? resolveHostname;
  }

  get isScanning(): boolean { return this._isScanning; }
  get lastScanErrors(): number { return this._lastScanErrors; }

  /** Progreso del barrido para el heartbeat / la consola local. */
  getDiscoveryState(): DiscoveryState {
    return buildDiscoveryState(this.store.getScanState(), this.deps.getConfig().ipRanges ?? []);
  }

  /** Lo consulta el `TaskScheduler` en cada tick: con una vuelta abierta,
   *  discovery siempre tiene chunk elegible (regla de SDS, ver allá). */
  isLapInProgress(): boolean {
    return this.store.getScanState().lap_started_at !== null;
  }

  /** Equivalente al "restart discovery" de la consola IMIL de HP SDS: descarta
   *  la posición actual y la próxima vuelta arranca desde el primer rango.
   *  Lo dispara el comando remoto `RESTART_DISCOVERY` (ver `CommandHandler`). */
  restartDiscovery(): void {
    // Con un chunk en vuelo el reset se difiere: ese chunk persiste su cursor
    // al terminar y pisaría el reinicio, dejando al comando sin efecto visible.
    if (this._isScanning) {
      this._restartPending = true;
      log('INFO', 'Discovery: reinicio pedido con un chunk en curso — se aplica al terminar.');
      return;
    }
    this.applyRestart();
  }

  private applyRestart(): void {
    this.store.resetScanCursor(fingerprintRanges(this.deps.getConfig().ipRanges ?? []));
    this._lapErrors = 0;
    this._pinnedIdx = 0;
    log('INFO', 'Discovery: cursor reiniciado a pedido — la vuelta arranca desde el primer rango.');
  }

  /**
   * UN chunk del barrido continuo (NO el espacio entero: eso son varias
   * vueltas encadenadas). Mantiene el nombre `scan()` porque es el punto de
   * entrada de FORCE_SCAN/RESCAN (`CommandHandler`) y del scheduler.
   */
  async scan(): Promise<void> {
    if (this._isScanning) return;
    this._isScanning = true;

    try {
      const config = this.deps.getConfig();
      if (this.store.isBackpressureActive()) {
        if (!this._backpressureLogged) {
          log('WARN', 'Backpressure activo (>10k lecturas pendientes). Discovery en pausa hasta que baje la cola.');
          this._backpressureLogged = true;
        }
        return;
      }
      if (this._backpressureLogged) {
        log('INFO', 'Backpressure liberado — discovery retoma la vuelta donde iba.');
        this._backpressureLogged = false;
      }

      const ranges = config.ipRanges ?? [];
      const fingerprint = fingerprintRanges(ranges);
      let state = this.store.getScanState();

      if (state.fingerprint !== fingerprint) {
        // Sólo se avisa si HABÍA una huella previa: en un agente recién
        // instalado esto no reinicia nada, apenas estrena el cursor.
        if (state.fingerprint !== null) {
          log('INFO', 'Discovery: cambiaron los rangos declarados — la vuelta se reinicia desde el primero.');
        }
        this.store.resetScanCursor(fingerprint);
        state = this.store.getScanState();
      }

      const total = totalDeclaredIps(ranges);
      let errors = 0;

      if (isAtLapStart(state)) {
        if (!state.lap_started_at) {
          // Abre la vuelta dejando `lap_started_at` en la base: es lo que hace
          // que un reinicio del agente a mitad de vuelta la siga considerando
          // en curso (y sepa desde cuándo corre, para medir su duración).
          this.store.saveScanCursor(fingerprint, 0, 0, 0);
          state = this.store.getScanState();
        }
        this._lapErrors = 0;
        log('INFO', `Discovery: vuelta iniciada — ${total} IP(s) en ${ranges.length} rango(s) + ${config.ipHosts?.length ?? 0} host(s) puntual(es) | ${isBusinessHours(config.businessHours) ? 'horario laboral' : 'fuera de horario'}`);
        errors += await this.scanPinnedHosts(config);
      }

      const cursor: DiscoveryCursor = { rangeIdx: state.range_idx, offset: state.offset_in_range };
      const plan = planChunk(ranges, cursor, CHUNK_MAX_IPS);
      const chunk = await this.runChunk(plan, config);
      errors += chunk.errors;

      const scannedThisLap = state.scanned_this_lap + chunk.consumed;
      const { next, lapComplete } = advanceCursor(ranges, cursor, chunk.consumed);
      this._lastScanErrors = errors;
      this._lapErrors += errors;

      if (lapComplete) {
        const lapMs = Math.max(0, this.now() - (sqliteUtcToMs(state.lap_started_at) ?? chunk.startedAt));
        this.store.recordLapComplete(fingerprint, lapMs);
        log('INFO', `Discovery: vuelta completa — ${scannedThisLap} IP(s) en ${formatDuration(lapMs)} | Errores: ${this._lapErrors} | Pendientes en cola: ${this.store.pendingCount()}`);
        this._lapErrors = 0;
      } else {
        this.store.saveScanCursor(fingerprint, next.rangeIdx, next.offset, scannedThisLap);
        this.logProgress(state.scanned_this_lap, scannedThisLap, total);
      }
    } finally {
      this._isScanning = false;
      if (this._restartPending) {
        this._restartPending = false;
        this.applyRestart();
      }
    }
  }

  /**
   * Hosts puntuales (point lookup): van al principio de CADA vuelta, no en
   * cada chunk — un dispositivo pineado a propósito por hostname se mira una
   * vez por vuelta, igual que cualquier IP del espacio declarado.
   * Resolución + captura SECUENCIAL: evita saturar el threadpool de libuv con
   * lookups en paralelo (ver `resolveHostname`), y por eso necesita su propio
   * techo de tiempo (`PINNED_BUDGET_MS`, allá está el porqué). Los que no
   * entran en el presupuesto abren la vuelta siguiente: la rotación arranca
   * donde cortó la anterior, así con el DNS lento igual se recorre la lista
   * entera en unas cuantas vueltas en vez de mirar siempre los mismos.
   * No cuentan para el presupuesto del chunk ni para `scanned`/`total` (que
   * miden espacio de rangos).
   */
  private async scanPinnedHosts(config: AgentConfig): Promise<number> {
    const hosts = config.ipHosts ?? [];
    if (hosts.length === 0) return 0;

    const deadline = this.now() + PINNED_BUDGET_MS;
    const from = this._pinnedIdx % hosts.length;
    let errors = 0;
    let done = 0;

    while (done < hosts.length && this.now() < deadline) {
      const host = hosts[(from + done) % hosts.length];
      done++;
      const ip = await this.resolveHost(host);
      if (!ip) continue;
      const creds = credentialsForRange(config.snmpCredentials ?? [], host.credential_ids);
      if (await this.probeIp(ip, config, creds)) errors++;
    }

    this._pinnedIdx = (from + done) % hosts.length;
    if (done < hosts.length) {
      log('WARN', `Discovery: sólo ${done} de ${hosts.length} host(s) puntual(es) entraron en el presupuesto (${PINNED_BUDGET_MS / 1000}s) — los demás abren la vuelta siguiente.`);
    }
    return errors;
  }

  /**
   * Ejecuta el chunk con el pool de siempre, pero acotado por tiempo: los
   * workers dejan de TOMAR IPs nuevas pasado el presupuesto (las que ya
   * tomaron las terminan). Devuelve cuántas se consumieron de verdad — que es
   * siempre un prefijo de `plan.ips`, así el cursor nunca salta IPs sin mirar.
   */
  private async runChunk(plan: ChunkPlan, config: AgentConfig): Promise<{ consumed: number; errors: number; startedAt: number }> {
    const startedAt = this.now();
    if (plan.ips.length === 0) return { consumed: 0, errors: 0, startedAt };

    const deadline = startedAt + CHUNK_BUDGET_MS;
    const pool = config.snmpCredentials ?? [];
    // Memoizado por rango y no por IP: `credentialsForRange` recorre el pool
    // entero, y las 400 IPs de un chunk salen de uno o dos rangos.
    const credsByRange = new Map<number, SnmpCredential[]>();
    const credsFor = (rangeIdx: number): SnmpCredential[] => {
      let creds = credsByRange.get(rangeIdx);
      if (!creds) {
        creds = credentialsForRange(pool, config.ipRanges?.[rangeIdx]?.credential_ids);
        credsByRange.set(rangeIdx, creds);
      }
      return creds;
    };

    let errors = 0;
    let taken = 0;
    const workers = Array(Math.min(CONCURRENCY_LIMIT, plan.ips.length)).fill(null).map(async () => {
      while (taken < plan.ips.length && this.now() < deadline) {
        const i = taken++;
        if (await this.probeIp(plan.ips[i], config, credsFor(plan.rangeIdxOf[i]))) errors++;
      }
    });
    await Promise.all(workers);
    return { consumed: taken, errors, startedAt };
  }

  /** Una línea por chunk sería ruido cada 40s: sólo se avisa al cruzar un
   *  décimo de la vuelta. */
  private logProgress(before: number, after: number, total: number): void {
    if (total <= 0 || after <= before) return;
    const decile = Math.floor((after * 10) / total);
    if (decile <= Math.floor((before * 10) / total)) return;
    log('INFO', `Discovery: ${Math.min(100, decile * 10)}% de la vuelta (${after}/${total} IPs)`);
  }

  /** Resuelve un host puntual con timeout (ver `resolveHostname` en
   *  `NetworkUtils.ts`); tolerante (NXDOMAIN/timeout → WARN, `null`, se
   *  reintenta la próxima vuelta — nunca rompe el resto del scan). Si
   *  resuelve a una IP pública, sólo lo loguea (WARN, no bloqueante) — el
   *  cloud no puede chequear esto sin resolver la DNS interna del cliente. */
  private async resolveHost(host: IpHost): Promise<string | null> {
    const ip = await this.resolveDns(host.hostname);
    if (!ip) {
      log('WARN', `[${host.hostname}] No se pudo resolver (DNS caído, NXDOMAIN, o timeout) — se reintenta en la próxima vuelta.`);
      return null;
    }
    if (!isPrivateOrReservedIp(ip)) {
      log('WARN', `[${host.hostname}] resolvió a una IP pública (${ip}) — revisar la configuración DNS del sitio.`);
    }
    return ip;
  }

  /** Captura+registra una IP ya resuelta (de un chunk o de un host puntual)
   *  — es la implementación real del seam `probeIp`. Devuelve `true` si hubo
   *  un error (para que el caller lleve el conteo de `errors`), nunca lanza. */
  private async captureAndRecord(ip: string, config: AgentConfig, creds: SnmpCredential[]): Promise<boolean> {
    try {
      // Fase 10 del gap analysis vs HP SDS — un equipo `disabled`/`ignored`
      // no se vuelve a capturar en cada ciclo de discovery (el cloud lo
      // descarta igual si algo se cuela, pero esto ahorra el tráfico SNMP).
      const policy = policyFor(config, ip);
      if (policy === 'disabled' || policy === 'ignored') return false;

      const known = getKnownDeviceInfo(ip);
      const out = await captureDevice({ ip, ...snmpArgsFor(creds, known), scopes: DISCOVERY_SCOPES, hint: hintFrom(known) });
      if (!out) return false;
      const { reading, driver } = out;
      const driverId = driver.profile?.id ?? driver.family.id;

      if (!isRegistered(ip)) {
        const ok = await this.registerDevice(config, reading);
        if (!ok) log('WARN', `[${ip}] Registro fallido (HTTP Error) - se reintentara en el proximo scan.`);
        upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, model: reading.model, registered: ok, pollMethod: reading.poll_method, driver: driverId, snmpCredId: out.credentialId });
      } else {
        upsertKnownDevice(ip, { serial: reading.serial ?? undefined, model: reading.model, pollMethod: reading.poll_method, driver: driverId, snmpCredId: out.credentialId });
      }

      enqueueReading(reading);
      log('INFO', `[${ip}] ${reading.model} | Total: ${reading.total_pages ?? '-'} | Method: ${reading.poll_method} | Driver: ${driverId}${driver.via === 'generic' ? ' (sin perfil)' : ''} | Id: ${out.identity.source}/${out.identity.brand}`);
      return false;
    } catch (e: unknown) {
      log('WARN', `[${ip}] Scan: ${e instanceof Error ? e.message : String(e)}`);
      return true;
    }
  }

  async runMeterTask(): Promise<void> {
    // 'supplies_only': ese equipo sólo debe reportar insumos, no contadores.
    await this.runKnownDevicesTask('MeterTask', METER_SCOPES, (r) => `total=${r.total_pages ?? '-'} mono=${r.mono_pages ?? '-'} color=${r.color_pages ?? '-'}`, ['supplies_only', 'disabled', 'ignored']);
  }

  async runSuppliesTask(): Promise<void> {
    // 'reports_only': ese equipo sólo debe reportar contadores, no insumos.
    await this.runKnownDevicesTask('SupplyTask', SUPPLIES_SCOPES, (r) => `K=${r.toner_black ?? '-'} C=${r.toner_cyan ?? '-'} M=${r.toner_magenta ?? '-'} Y=${r.toner_yellow ?? '-'}`, ['reports_only', 'disabled', 'ignored']);
  }

  /** Fase 11 del gap analysis vs HP SDS — loop dedicado de alertas (3/15 min),
   *  separado de consumibles (60/240). Mismos criterios de policy que
   *  `runSuppliesTask` (las alertas son parte de "reportar insumos/estado"
   *  a nivel negocio, un equipo `reports_only` no debe generarlas). */
  async runAlertTask(): Promise<void> {
    await this.runKnownDevicesTask('AlertTask', ALERT_SCOPES, (r) => `alerts=${r.supplies_details?.alerts?.length ?? 0}`, ['reports_only', 'disabled', 'ignored']);
  }

  private async runKnownDevicesTask(label: string, scopes: readonly CaptureScope[], summarize: (r: DeviceReading) => string, skipStates: readonly DevicePolicyState[]): Promise<void> {
    try {
      if (isBackpressureActive()) {
        log('WARN', `Backpressure activo (>10k lecturas pendientes). [${label}] omitido.`);
        return;
      }

      const config = this.deps.getConfig();
      const devices = getKnownDevices();
      if (devices.length === 0) return;
      log('INFO', `[${label}] ${isBusinessHours(config.businessHours) ? 'horario laboral' : 'fuera de horario'} — ${devices.length} dispositivo(s)`);

      const queue = [...devices];
      const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const d = queue.shift();
          if (!d) break;
          if (skipStates.includes(policyFor(config, d.ip))) continue;
          try {
            // Sin restricción por rango acá a propósito: `known_devices` no
            // tiene vínculo a qué rango descubrió cada IP, y un dispositivo
            // ya conocido casi siempre acierta con `snmp_cred_id` cacheado
            // en el primer intento (sin fail-fast) — restringir por rango
            // no aporta nada real en meter/supplies, sólo en discovery.
            const out = await captureDevice({ ip: d.ip, ...snmpArgsFor(config.snmpCredentials ?? [], d), scopes, hint: hintFrom(d), trustHint: true });
            if (!out || !out.result) continue; // apagada / sin respuesta: no encolar lecturas vacías
            const reading = out.reading;
            const hasData = reading.total_pages !== null || reading.toner_black != null || reading.toner_cyan != null
              || reading.toner_magenta != null || reading.toner_yellow != null || !!reading.supplies_details;
            if (!hasData) continue;
            if (!reading.serial && d.serial) reading.serial = d.serial;
            upsertKnownDevice(d.ip, { pollMethod: reading.poll_method, driver: out.driver.profile?.id ?? out.driver.family.id, snmpCredId: out.credentialId });
            if (shouldEnqueueReading(d.ip, reading, DEDUPE_WINDOW_HOURS)) {
              enqueueReading(reading);
              recordLastReadingSnapshot(d.ip, reading);
              log('INFO', `[${label}] [${d.ip}] ${summarize(reading)} method=${reading.poll_method}`);
            } else {
              log('INFO', `[${label}] [${d.ip}] sin cambios — no se encola (dedupe)`);
            }
          } catch { /* continue */ }
        }
      });
      await Promise.all(workers);
    } catch (e: unknown) {
      log('WARN', `[${label}] Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async registerDevice(config: AgentConfig, r: DeviceReading): Promise<boolean> {
    try {
      const res = await fetch(`${config.serverUrl}/api/v1/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({
          devices: [{
            ip:     r.ip,
            mac:    r.mac ?? null,
            serial: r.serial,
            brand:  r.brand,
            model:  (r.model || r.brand || 'Unknown').slice(0, 100),
            name:   (r.model || r.ip || 'Unknown Device').slice(0, 100),
          }],
        }),
        signal: AbortSignal.timeout(65_000),
      });
      return res.ok;
    } catch (e: unknown) {
      log('WARN', `Register device ${r.ip}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
