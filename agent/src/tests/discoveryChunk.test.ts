// Barrido continuo de discovery: el chunk de `ScanService.scan()` (presupuesto
// de tiempo, avance del cursor, cierre de vuelta), la elegibilidad de discovery
// en el `TaskScheduler` y el comando remoto que reinicia el cursor. Todo con
// seams inyectados: sin SQLite, sin DNS y sin red — el reloj es falso, así que
// no espera ni un milisegundo real.
// Ejecutar: npx tsx --test src/tests/discoveryChunk.test.ts

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BUDGET_MS, CHUNK_MAX_IPS, PINNED_BUDGET_MS, ScanService, buildDiscoveryState, type ScanStore } from '../core/ScanService';
import { CommandHandler } from '../core/CommandHandler';
import { TaskScheduler } from '../core/TaskScheduler';
import { fingerprintRanges } from '../core/DiscoveryCursor';
import { INTERVALS, DEFAULT_BUSINESS_HOURS } from '../core/BusinessHours';
import type { ScanState } from '../sync/database';
import type { AgentConfig, IpHost, IpRange } from '../core/config';

/** Con 1s por IP, la IP número `CHUNK_BUDGET_MS/1000` se tomaría justo en el
 *  borde del presupuesto — y por eso NO se toma. */
const MS_POR_IP = 1_000;
const IPS_QUE_ENTRAN = CHUNK_BUDGET_MS / MS_POR_IP;

const R = (start: string, end: string, credential_ids?: string[]): IpRange => ({ start, end, credential_ids });

function fakeConfig(ranges: IpRange[], hosts?: IpHost[]): AgentConfig {
  return {
    serverUrl: 'http://localhost', agentId: 'a', token: 't', refreshToken: 'r',
    ipRanges: ranges, ipHosts: hosts, snmpCommunity: 'public', snmpVersion: 2,
    snmpCredentials: [{ id: 'pool-a', version: 'v2c', community: 'public' }],
    businessHours: DEFAULT_BUSINESS_HOURS,
  };
}

function fakeClock(start = Date.UTC(2026, 0, 1, 12, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; }, start };
}

/** Store en memoria que replica la semántica del SQL real de `scan_state`:
 *  `saveScanCursor` abre la vuelta una sola vez (COALESCE de `lap_started_at`),
 *  `recordLapComplete` la cierra dejándolo en NULL. */
function fakeStore(now: () => number) {
  const state: ScanState = {
    fingerprint: null, range_idx: 0, offset_in_range: 0, scanned_this_lap: 0,
    lap_started_at: null, last_lap_at: null, last_lap_ms: null, laps_completed: 0,
  };
  const calls: string[] = [];
  const store: ScanStore = {
    getScanState: () => ({ ...state }),
    saveScanCursor: (fingerprint, rangeIdx, offset, scannedThisLap) => {
      calls.push('save');
      state.fingerprint = fingerprint;
      state.range_idx = rangeIdx;
      state.offset_in_range = offset;
      state.scanned_this_lap = scannedThisLap;
      state.lap_started_at ??= new Date(now()).toISOString();
    },
    recordLapComplete: (fingerprint, lapMs) => {
      calls.push('lap');
      state.fingerprint = fingerprint;
      state.range_idx = 0;
      state.offset_in_range = 0;
      state.scanned_this_lap = 0;
      state.lap_started_at = null;
      state.last_lap_at = new Date(now()).toISOString();
      state.last_lap_ms = lapMs;
      state.laps_completed += 1;
    },
    resetScanCursor: (fingerprint) => {
      calls.push('reset');
      state.fingerprint = fingerprint;
      state.range_idx = 0;
      state.offset_in_range = 0;
      state.scanned_this_lap = 0;
      state.lap_started_at = new Date(now()).toISOString();
    },
    isBackpressureActive: () => false,
    pendingCount: () => 0,
  };
  return { store, state, calls };
}

/**
 * Servicio con todos los seams falsos. Cada captura adelanta el reloj
 * `perIpMs`: como el ejecutor toma una IP y recién ahí corre la captura, antes
 * de tomar la IP `i` pasaron exactamente `i * perIpMs` ms — el corte por
 * presupuesto queda determinístico sin depender del interleaving de los
 * workers.
 */
function makeService(opts: {
  ranges: IpRange[];
  hosts?: IpHost[];
  perIpMs?: number;
  /** Lo que "tarda" cada resolución DNS en el reloj falso (4s = timeout real). */
  perLookupMs?: number;
  clock?: ReturnType<typeof fakeClock>;
  store?: ReturnType<typeof fakeStore>;
  failOn?: (ip: string) => boolean;
}) {
  const clock = opts.clock ?? fakeClock();
  const backing = opts.store ?? fakeStore(clock.now);
  const perIpMs = opts.perIpMs ?? 0;
  const perLookupMs = opts.perLookupMs ?? 0;
  const probed: string[] = [];
  const resolved: string[] = [];
  const credsSeen: string[][] = [];
  let config = fakeConfig(opts.ranges, opts.hosts);

  const service = new ScanService({
    getConfig: () => config,
    store: backing.store,
    now: clock.now,
    resolveHostname: async (hostname) => {
      clock.advance(perLookupMs);
      resolved.push(hostname);
      return hostname.startsWith('nxdomain') ? null : '10.9.9.9';
    },
    probeIp: async (ip, _config, creds) => {
      clock.advance(perIpMs);
      probed.push(ip);
      credsSeen.push(creds.map((c) => c.id));
      return opts.failOn?.(ip) ?? false;
    },
  });

  return {
    service, clock, probed, resolved, credsSeen,
    state: backing.state,
    calls: backing.calls,
    setRanges: (ranges: IpRange[], hosts?: IpHost[]) => { config = fakeConfig(ranges, hosts); },
  };
}

/** 1024 IPs en un solo rango: más que `CHUNK_MAX_IPS`, así el chunk siempre
 *  corta por tope o por tiempo y nunca por falta de espacio. */
const BIG_RANGE = [R('10.0.0.0', '10.0.3.255')];

/** El peor caso de la fase de hosts puntuales: 32 hostnames
 *  (`MAX_HOSTNAME_SPECS` del lado cloud) con el DNS caído, o sea cada lookup
 *  gastando el timeout entero de `resolveHostname`. */
const DNS_TIMEOUT_MS = 4_000;
const HOSTS_CAIDOS: IpHost[] = Array.from({ length: 32 }, (_, i) => ({ hostname: `nxdomain-${i}.local` }));
const HOSTS_QUE_ENTRAN = PINNED_BUDGET_MS / DNS_TIMEOUT_MS;
const nombres = (from: number, to: number) => HOSTS_CAIDOS.slice(from, to).map((x) => x.hostname);

describe('ScanService — presupuesto de tiempo del chunk', () => {
  test('los workers dejan de tomar IPs nuevas al agotarse CHUNK_BUDGET_MS', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });

    await h.service.scan();

    assert.equal(h.probed.length, IPS_QUE_ENTRAN, 'se consumen exactamente las IPs que entran en el presupuesto');
    assert.equal(h.clock.now() - h.clock.start, CHUNK_BUDGET_MS);
    assert.deepEqual(h.probed.slice(0, 3), ['10.0.0.0', '10.0.0.1', '10.0.0.2']);
  });

  test('las IPs tomadas se terminan: lo consumido es un prefijo contiguo del plan', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });

    await h.service.scan();

    const esperadas = Array.from({ length: IPS_QUE_ENTRAN }, (_, i) => `10.0.0.${i}`);
    assert.deepEqual([...h.probed].sort(), [...esperadas].sort(), 'ninguna IP tomada quedó sin capturar');
    assert.equal(h.state.offset_in_range, IPS_QUE_ENTRAN, 'el cursor avanza exactamente lo consumido, sin saltear IPs');
  });

  test('sin presión de tiempo el chunk corta en CHUNK_MAX_IPS (tope de memoria)', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: 0 });

    await h.service.scan();

    assert.equal(h.probed.length, CHUNK_MAX_IPS);
    assert.equal(h.state.offset_in_range, CHUNK_MAX_IPS);
    assert.equal(h.state.scanned_this_lap, CHUNK_MAX_IPS);
  });
});

describe('ScanService — consumo parcial y retoma', () => {
  test('el chunk siguiente arranca donde cortó el anterior', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });

    await h.service.scan();
    const primerChunk = [...h.probed];
    h.probed.length = 0;
    await h.service.scan();

    assert.equal(primerChunk.length, IPS_QUE_ENTRAN);
    assert.equal(h.probed[0], `10.0.0.${IPS_QUE_ENTRAN}`, 'retoma en la IP siguiente a la última consumida');
    assert.equal(h.state.scanned_this_lap, IPS_QUE_ENTRAN * 2, 'el progreso de la vuelta acumula entre chunks');
    assert.equal(h.state.offset_in_range, IPS_QUE_ENTRAN * 2);
    assert.equal(h.state.laps_completed, 0, 'la vuelta sigue abierta');
    assert.equal(h.state.lap_started_at !== null, true);
  });

  test('cruza de rango sin repetir ni saltear IPs', async () => {
    // 3 + 2 IPs: el primer chunk (tope 4) se come el rango 1 entero y una del 2.
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.3'), R('10.1.0.1', '10.1.0.2')], perIpMs: 10_000 });

    await h.service.scan(); // 40s / 10s por IP = 4 IPs
    assert.deepEqual(h.probed, ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.1.0.1']);
    assert.deepEqual([h.state.range_idx, h.state.offset_in_range], [1, 1]);

    h.probed.length = 0;
    await h.service.scan();
    assert.deepEqual(h.probed, ['10.1.0.2'], 'la última IP del espacio se recorre una sola vez');
  });

  test('cada IP recibe las credenciales de SU rango (una sola resolución por rango)', async () => {
    const h = makeService({
      ranges: [R('10.0.0.1', '10.0.0.2', ['pool-a']), R('10.1.0.1', '10.1.0.1', ['no-existe'])],
      perIpMs: 0,
    });

    await h.service.scan();

    assert.deepEqual(h.probed, ['10.0.0.1', '10.0.0.2', '10.1.0.1']);
    assert.deepEqual(h.credsSeen, [['pool-a'], ['pool-a'], []]);
  });
});

describe('ScanService — cierre de vuelta', () => {
  test('al llegar al final se registra la vuelta y el cursor vuelve al principio', async () => {
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.5')], perIpMs: MS_POR_IP });

    await h.service.scan();

    assert.equal(h.probed.length, 5);
    assert.equal(h.state.laps_completed, 1);
    assert.equal(h.state.last_lap_ms, 5_000, 'la duración se mide desde lap_started_at, no desde el chunk');
    assert.deepEqual([h.state.range_idx, h.state.offset_in_range, h.state.scanned_this_lap], [0, 0, 0]);
    assert.equal(h.state.lap_started_at, null, 'la vuelta queda cerrada (no en curso)');
  });

  test('la vuelta siguiente vuelve a empezar por la primera IP', async () => {
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.5')], perIpMs: 0 });

    await h.service.scan();
    h.probed.length = 0;
    await h.service.scan();

    assert.deepEqual(h.probed, ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5']);
    assert.equal(h.state.laps_completed, 2);
  });

  test('lastScanErrors cuenta los errores del CHUNK, no los de la vuelta', async () => {
    // Lo que el heartbeat manda como `snmpErrors`: con el barrido continuo es
    // por chunk, así que se reinicia en el chunk siguiente.
    const h = makeService({ ranges: BIG_RANGE, perIpMs: 0, failOn: (ip) => ip === '10.0.0.5' });

    await h.service.scan();
    assert.equal(h.service.lastScanErrors, 1, 'el chunk que tocó la IP que falla reporta el error');

    await h.service.scan();
    assert.equal(h.service.lastScanErrors, 0, 'el chunk siguiente arranca el contador de cero');
  });

  test('sin rangos declarados la vuelta se cierra igual (no queda abierta para siempre)', async () => {
    const h = makeService({ ranges: [] });

    await h.service.scan();

    assert.deepEqual(h.probed, []);
    assert.equal(h.state.lap_started_at, null);
    assert.equal(h.state.laps_completed, 1);
  });
});

describe('ScanService — hosts puntuales', () => {
  test('van al principio de la vuelta, antes que las IPs de rango', async () => {
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.2')], hosts: [{ hostname: 'impresora.local' }], perIpMs: 0 });

    await h.service.scan();

    assert.deepEqual(h.probed, ['10.9.9.9', '10.0.0.1', '10.0.0.2']);
    assert.equal(h.service.getDiscoveryState().total, 2, 'los hosts puntuales no inflan el espacio declarado (son DNS, no IPs)');
  });

  test('NO se repiten en cada chunk de la misma vuelta', async () => {
    const h = makeService({ ranges: BIG_RANGE, hosts: [{ hostname: 'impresora.local' }], perIpMs: MS_POR_IP });

    await h.service.scan();
    assert.equal(h.probed[0], '10.9.9.9');

    h.probed.length = 0;
    await h.service.scan();
    assert.equal(h.probed.includes('10.9.9.9'), false, 'sólo al abrir la vuelta, no en cada chunk');
  });

  test('un host que no resuelve no rompe el chunk', async () => {
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.1')], hosts: [{ hostname: 'nxdomain.local' }], perIpMs: 0 });

    await h.service.scan();

    assert.deepEqual(h.probed, ['10.0.0.1']);
  });
});

describe('ScanService — presupuesto de los hosts puntuales (DNS caído)', () => {
  test('la fase de hosts puntuales se corta en PINNED_BUDGET_MS y el chunk conserva su presupuesto entero', async () => {
    const h = makeService({ ranges: BIG_RANGE, hosts: HOSTS_CAIDOS, perIpMs: MS_POR_IP, perLookupMs: DNS_TIMEOUT_MS });

    await h.service.scan();

    assert.equal(h.resolved.length, HOSTS_QUE_ENTRAN, `${HOSTS_CAIDOS.length} hostnames × ${DNS_TIMEOUT_MS}ms ya no corren enteros antes del chunk`);
    assert.equal(h.probed.length, IPS_QUE_ENTRAN, 'el chunk arranca con su presupuesto intacto, no con lo que sobró del DNS');
    assert.equal(h.clock.now() - h.clock.start, PINNED_BUDGET_MS + CHUNK_BUDGET_MS, 'techo total predecible del chunk que ABRE la vuelta');
  });

  test('el cursor avanza igual en el chunk de apertura: no hay loop sin progreso', async () => {
    // La trampa de meter los hosts puntuales en el MISMO deadline del chunk:
    // se consumen 0 IPs, el cursor no se mueve, `isAtLapStart()` sigue en true
    // y el chunk siguiente vuelve a resolver los mismos hostnames, para siempre.
    const h = makeService({ ranges: BIG_RANGE, hosts: HOSTS_CAIDOS, perIpMs: MS_POR_IP, perLookupMs: DNS_TIMEOUT_MS });

    await h.service.scan();
    assert.equal(h.state.offset_in_range, IPS_QUE_ENTRAN, 'el chunk de apertura consumió IPs pese al gasto en DNS');

    const enLaApertura = h.resolved.length;
    h.probed.length = 0;
    await h.service.scan();

    assert.equal(h.resolved.length, enLaApertura, 'la misma vuelta no vuelve a resolver hostnames');
    assert.equal(h.probed[0], `10.0.0.${IPS_QUE_ENTRAN}`, 'el barrido sigue avanzando donde iba');
  });

  test('los hosts que no entraron abren la vuelta siguiente (rotan, no quedan hambreados)', async () => {
    // Rango de 2 IPs: cada scan() cierra la vuelta, así el siguiente abre una nueva.
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.2')], hosts: HOSTS_CAIDOS, perIpMs: 0, perLookupMs: DNS_TIMEOUT_MS });

    await h.service.scan();
    assert.deepEqual(h.resolved, nombres(0, HOSTS_QUE_ENTRAN));
    assert.equal(h.state.laps_completed, 1);

    h.resolved.length = 0;
    await h.service.scan();

    assert.deepEqual(h.resolved, nombres(HOSTS_QUE_ENTRAN, HOSTS_QUE_ENTRAN * 2), 'la vuelta siguiente sigue donde cortó la anterior');
  });

  test('sin hosts puntuales el chunk de apertura no gasta nada del presupuesto extra', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });

    await h.service.scan();

    assert.equal(h.clock.now() - h.clock.start, CHUNK_BUDGET_MS);
  });
});

describe('ScanService — huella del espacio declarado', () => {
  test('cambiar los rangos reinicia la vuelta desde el primero', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });
    await h.service.scan();
    assert.equal(h.state.offset_in_range, IPS_QUE_ENTRAN);

    const nuevos = [R('192.168.1.1', '192.168.1.10')];
    h.setRanges(nuevos);
    h.probed.length = 0;
    h.clock.advance(1_000);
    await h.service.scan();

    assert.equal(h.state.fingerprint, fingerprintRanges(nuevos));
    assert.equal(h.calls.filter((c) => c === 'reset').length, 2, 'reset en la primera corrida (huella nula) y al cambiar los rangos');
    assert.equal(h.probed[0], '192.168.1.1', 'arranca por el primer rango del espacio nuevo');
  });

  test('renombrar credenciales del rango NO reinicia la vuelta (la huella es sólo el espacio)', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });
    await h.service.scan();

    h.setRanges([R('10.0.0.0', '10.0.3.255', ['pool-a'])]);
    h.probed.length = 0;
    await h.service.scan();

    assert.equal(h.probed[0], `10.0.0.${IPS_QUE_ENTRAN}`, 'la vuelta sigue donde iba');
  });
});

describe('ScanService — discovery_state (contrato del heartbeat)', () => {
  test('en curso: in_progress con progreso y total declarado', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });

    await h.service.scan();
    const st = h.service.getDiscoveryState();

    assert.equal(st.in_progress, true);
    assert.equal(st.scanned, IPS_QUE_ENTRAN);
    assert.equal(st.total, 1024);
    assert.equal(st.laps_completed, 0);
    assert.equal(st.last_lap_at, null);
    assert.equal(st.last_lap_ms, null);
    assert.equal(typeof st.lap_started_at, 'string');
    assert.equal(new Date(st.lap_started_at as string).toISOString(), st.lap_started_at, 'ISO 8601');
    assert.equal(h.service.isLapInProgress(), true);
  });

  test('cerrada: in_progress false, con duración y contador de vueltas', async () => {
    const h = makeService({ ranges: [R('10.0.0.1', '10.0.0.5')], perIpMs: MS_POR_IP });

    await h.service.scan();
    const st = h.service.getDiscoveryState();

    assert.equal(st.in_progress, false);
    assert.equal(st.scanned, 0);
    assert.equal(st.total, 5);
    assert.equal(st.last_lap_ms, 5_000);
    assert.equal(st.laps_completed, 1);
    assert.equal(typeof st.last_lap_at, 'string');
    assert.equal(h.service.isLapInProgress(), false);
  });

  test('los timestamps crudos de SQLite (UTC sin sufijo) salen como ISO 8601', () => {
    const ranges = [R('10.0.0.1', '10.0.0.10')];
    const st = buildDiscoveryState({
      fingerprint: fingerprintRanges(ranges), range_idx: 0, offset_in_range: 0, scanned_this_lap: 5,
      lap_started_at: '2026-09-11 12:00:00', last_lap_at: '2026-09-11 11:00:00',
      last_lap_ms: 3_600_000, laps_completed: 2,
    }, ranges);

    assert.equal(st.lap_started_at, '2026-09-11T12:00:00.000Z', "datetime('now') es UTC: parsearlo como hora local correría el timestamp");
    assert.equal(st.last_lap_at, '2026-09-11T11:00:00.000Z');
    assert.equal(st.total, 10);
    assert.equal(st.in_progress, true);
  });

  test('un cursor de otro espacio no se reporta contra el total nuevo', () => {
    // Se editaron los rangos y todavía no corrió el chunk que reinicia el
    // cursor: sin esto el portal vería 900 de 10 IPs (9000% de la vuelta).
    const nuevos = [R('10.0.0.1', '10.0.0.10')];
    const st = buildDiscoveryState({
      fingerprint: fingerprintRanges([R('192.168.0.0', '192.168.3.255')]),
      range_idx: 3, offset_in_range: 7, scanned_this_lap: 900,
      lap_started_at: '2026-09-11 12:00:00', last_lap_at: '2026-09-11 11:00:00',
      last_lap_ms: 3_600_000, laps_completed: 2,
    }, nuevos);

    assert.equal(st.in_progress, false, 'la vuelta del espacio viejo ya no está en curso');
    assert.equal(st.scanned, 0);
    assert.equal(st.lap_started_at, null);
    assert.equal(st.total, 10);
    assert.equal(st.laps_completed, 2, 'las métricas históricas sobreviven al cambio de rangos');
    assert.equal(st.last_lap_ms, 3_600_000);
  });

  test('la duración de la vuelta se mide contra el lap_started_at crudo de SQLite', async () => {
    const clock = fakeClock(Date.UTC(2026, 8, 11, 12, 10, 0));
    const backing = fakeStore(clock.now);
    const ranges = [R('10.0.0.1', '10.0.0.2')];
    // Vuelta abierta hace 10 min, con el formato que deja `datetime('now')`.
    backing.state.fingerprint = fingerprintRanges(ranges);
    backing.state.lap_started_at = '2026-09-11 12:00:00';
    const h = makeService({ ranges, perIpMs: MS_POR_IP, clock, store: backing });

    await h.service.scan();

    assert.equal(h.state.last_lap_ms, 10 * 60_000 + 2 * MS_POR_IP);
    assert.equal(h.calls.includes('reset'), false, 'la huella no cambió: la vuelta en curso se retoma, no se reinicia');
  });

  test('restartDiscovery() manda el cursor al primer rango', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });
    await h.service.scan();
    assert.equal(h.state.offset_in_range, IPS_QUE_ENTRAN);

    h.service.restartDiscovery();
    assert.deepEqual([h.state.range_idx, h.state.offset_in_range, h.state.scanned_this_lap], [0, 0, 0]);

    h.probed.length = 0;
    await h.service.scan();
    assert.equal(h.probed[0], '10.0.0.0');
  });

  test('un restartDiscovery() pedido con un chunk en vuelo no lo pisa el save de ese chunk', async () => {
    // Es el caso real del comando remoto: entra por WS mientras el scheduler
    // está corriendo un chunk.
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });
    const enVuelo = h.service.scan();

    h.service.restartDiscovery();
    await enVuelo;

    assert.deepEqual([h.state.range_idx, h.state.offset_in_range, h.state.scanned_this_lap], [0, 0, 0]);
    assert.equal(h.calls[h.calls.length - 1], 'reset', 'el reinicio se aplica DESPUÉS del save del chunk');
  });
});

// --- Comando remoto RESTART_DISCOVERY (CommandHandler → ScanService) ---

describe('CommandHandler — RESTART_DISCOVERY', () => {
  test('reinicia el cursor aunque haya una tarea de red en curso (el comando no toca la red)', async () => {
    const h = makeService({ ranges: BIG_RANGE, perIpMs: MS_POR_IP });
    await h.service.scan();
    assert.equal(h.state.offset_in_range, IPS_QUE_ENTRAN);

    const handler = new CommandHandler();
    handler.setNetworkBusyCheck(() => true);
    handler.setRestartDiscoveryTrigger(() => h.service.restartDiscovery());
    const res = await handler.handleCommand('RESTART_DISCOVERY', {}, 'cmd-1');

    assert.equal(res.status, 'success');
    assert.deepEqual([h.state.range_idx, h.state.offset_in_range, h.state.scanned_this_lap], [0, 0, 0]);
  });

  test('sin trigger cableado → error, no un "reiniciado" que miente', async () => {
    const res = await new CommandHandler().handleCommand('RESTART_DISCOVERY', {}, 'cmd-2');

    assert.equal(res.status, 'error');
    assert.match((res.result as { error: string }).error, /reinicio de barrido/i);
  });
});

// --- TaskScheduler: elegibilidad de discovery (regla de SDS) ---

function fakeScanService(lapInProgress: boolean) {
  const calls: string[] = [];
  let lapOpen = lapInProgress;
  const scanService = {
    scan: async () => { calls.push('scan'); },
    runMeterTask: async () => { calls.push('meter'); },
    runSuppliesTask: async () => { calls.push('supplies'); },
    runAlertTask: async () => { calls.push('alert'); },
    isLapInProgress: () => lapOpen,
  } as unknown as ScanService;
  return { scanService, calls, setLap: (v: boolean) => { lapOpen = v; } };
}

type SchedulerClocks = { lastAlertTime: number; lastDiscoveryTime: number; lastMeterTime: number; lastSuppliesTime: number };

function markAllJustRan(scheduler: TaskScheduler): SchedulerClocks {
  const s = scheduler as unknown as SchedulerClocks;
  const now = Date.now();
  s.lastAlertTime = now; s.lastDiscoveryTime = now; s.lastMeterTime = now; s.lastSuppliesTime = now;
  return s;
}

/** Un tick del loop. `run()` se re-programa solo al terminar: hay que frenarlo
 *  o el timer de 5s sobrevive al test y lo deja corriendo para siempre. */
async function tick(scheduler: TaskScheduler): Promise<void> {
  await (scheduler as unknown as { run(): Promise<void> }).run();
  scheduler.stop();
}

describe('TaskScheduler — discovery como relleno de menor prioridad', () => {
  let active: TaskScheduler | null = null;
  afterEach(() => { active?.stop(); active = null; });

  test('con vuelta en curso discovery es elegible aunque no haya vencido el intervalo', async () => {
    const { scanService, calls } = fakeScanService(true);
    const scheduler = new TaskScheduler({ scanService, getConfig: () => fakeConfig([]) });
    active = scheduler;
    markAllJustRan(scheduler);

    await tick(scheduler);

    assert.deepEqual(calls, ['scan'], 'la vuelta avanza chunk a chunk sin esperar el intervalo');
  });

  test('sin vuelta en curso respeta el intervalo', async () => {
    const { scanService, calls } = fakeScanService(false);
    const scheduler = new TaskScheduler({ scanService, getConfig: () => fakeConfig([]) });
    active = scheduler;
    const s = markAllJustRan(scheduler);

    await tick(scheduler);
    assert.deepEqual(calls, [], 'recién cerrada la vuelta, la próxima espera el intervalo');

    s.lastDiscoveryTime = Date.now() - INTERVALS.discovery.off - 1;
    await tick(scheduler);
    assert.deepEqual(calls, ['scan']);
  });

  test('una vuelta que tardó más que el intervalo encadena la siguiente enseguida', async () => {
    const { scanService, calls, setLap } = fakeScanService(true);
    const scheduler = new TaskScheduler({ scanService, getConfig: () => fakeConfig([]) });
    active = scheduler;
    const s = markAllJustRan(scheduler);
    const arranqueDeLaVuelta = s.lastDiscoveryTime;

    // Varios chunks de la MISMA vuelta: ninguno reinicia el reloj del intervalo.
    await tick(scheduler);
    await tick(scheduler);
    assert.deepEqual(calls, ['scan', 'scan']);
    assert.equal(s.lastDiscoveryTime, arranqueDeLaVuelta, 'el reloj mide desde el arranque de la vuelta, no desde el último chunk');

    // La vuelta cierra después de más de un intervalo: la próxima arranca ya
    // mismo (regla de SDS), no 10/60 min después de haber terminado.
    setLap(false);
    const relojViejo = Date.now() - INTERVALS.discovery.off - 1;
    s.lastDiscoveryTime = relojViejo;
    await tick(scheduler);
    assert.deepEqual(calls, ['scan', 'scan', 'scan']);
    assert.equal(s.lastDiscoveryTime > relojViejo, true, 'el chunk que ABRE la vuelta nueva sí reinicia el reloj');
  });

  test('las alertas ganan aunque haya una vuelta de discovery en curso', async () => {
    const { scanService, calls } = fakeScanService(true);
    const scheduler = new TaskScheduler({ scanService, getConfig: () => fakeConfig([]) });
    active = scheduler;
    const s = markAllJustRan(scheduler);
    s.lastAlertTime = 0;

    await tick(scheduler);

    assert.deepEqual(calls, ['alert']);
  });

  test('meter y supplies también le ganan a discovery (nuevo orden de prioridad)', async () => {
    const { scanService, calls } = fakeScanService(true);
    const scheduler = new TaskScheduler({ scanService, getConfig: () => fakeConfig([]) });
    active = scheduler;
    const s = markAllJustRan(scheduler);
    s.lastMeterTime = 0;
    s.lastSuppliesTime = 0;

    await tick(scheduler);
    assert.deepEqual(calls, ['meter'], 'discovery no hambrea a los loops de equipos ya conocidos');

    await tick(scheduler);
    assert.deepEqual(calls, ['meter', 'supplies']);
  });
});
