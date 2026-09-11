// TaskScheduler — prioridad entre los 4 loops (Fase 11 del gap analysis vs
// HP SDS: loop dedicado de alertas 3/15, no debe quedar postergado por
// discovery/meter/supplies). Manipula los campos privados de "última
// corrida" para simular vencimiento sin esperar minutos reales.
// Ejecutar: npx tsx --test src/tests/taskScheduler.test.ts

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { TaskScheduler } from '../core/TaskScheduler';
import { DEFAULT_BUSINESS_HOURS } from '../core/BusinessHours';
import { DEFAULT_MONITOR_INTERVALS } from '../core/MonitorIntervals';
import type { ScanService } from '../core/ScanService';
import type { AgentConfig } from '../core/config';

function fakeConfig(): AgentConfig {
  return {
    serverUrl: 'http://localhost', agentId: 'a', token: 't', refreshToken: 'r',
    ipRanges: [], snmpCommunity: 'public', snmpVersion: 2,
    businessHours: DEFAULT_BUSINESS_HOURS,
  };
}

function fakeScanService() {
  const calls: string[] = [];
  const scanService = {
    scan: async () => { calls.push('scan'); },
    runMeterTask: async () => { calls.push('meter'); },
    runSuppliesTask: async () => { calls.push('supplies'); },
    runAlertTask: async () => { calls.push('alert'); },
    // Sin vuelta de discovery abierta: acá sólo se testea el gate por
    // intervalo (la elegibilidad con vuelta en curso vive en
    // discoveryChunk.test.ts).
    isLapInProgress: () => false,
  } as unknown as ScanService;
  return { scanService, calls };
}

/** Fuerza "recién corrió" en los 4 relojes internos (privados) — así un
 *  `run()` de test no dispara nada salvo que el caller adelante alguno a mano. */
function markAllJustRan(scheduler: TaskScheduler): void {
  const s = scheduler as unknown as { lastAlertTime: number; lastDiscoveryTime: number; lastMeterTime: number; lastSuppliesTime: number };
  const now = Date.now();
  s.lastAlertTime = now; s.lastDiscoveryTime = now; s.lastMeterTime = now; s.lastSuppliesTime = now;
}

describe('TaskScheduler — prioridad e intervalos', () => {
  let active: TaskScheduler | null = null;
  afterEach(() => { active?.stop(); active = null; });

  test('DEFAULT_MONITOR_INTERVALS.alert es 3 min en horario laboral / 15 min fuera de él (valores exactos de SDS)', () => {
    assert.equal(DEFAULT_MONITOR_INTERVALS.alert.biz, 3);
    assert.equal(DEFAULT_MONITOR_INTERVALS.alert.off, 15);
  });

  test('sólo el loop de alertas vencido corre — no dispara discovery/meter/supplies de paso', async () => {
    const { scanService, calls } = fakeScanService();
    const scheduler = new TaskScheduler({ scanService, getConfig: fakeConfig });
    active = scheduler;
    markAllJustRan(scheduler);
    (scheduler as unknown as { lastAlertTime: number }).lastAlertTime = 0; // vencido

    await (scheduler as unknown as { run(): Promise<void> }).run();
    assert.deepEqual(calls, ['alert']);
  });

  test('si alertas Y discovery están vencidos a la vez, alertas gana (no queda postergada)', async () => {
    const { scanService, calls } = fakeScanService();
    const scheduler = new TaskScheduler({ scanService, getConfig: fakeConfig });
    active = scheduler;
    markAllJustRan(scheduler);
    const s = scheduler as unknown as { lastAlertTime: number; lastDiscoveryTime: number };
    s.lastAlertTime = 0;
    s.lastDiscoveryTime = 0;

    await (scheduler as unknown as { run(): Promise<void> }).run();
    assert.deepEqual(calls, ['alert'], 'el loop más frecuente no debe quedar atrás de discovery en el mismo tick');
  });

  test('sin nada vencido → ningún loop corre este tick', async () => {
    const { scanService, calls } = fakeScanService();
    const scheduler = new TaskScheduler({ scanService, getConfig: fakeConfig });
    active = scheduler;
    markAllJustRan(scheduler);

    await (scheduler as unknown as { run(): Promise<void> }).run();
    assert.deepEqual(calls, []);
  });

  test('discovery/meter/supplies siguen funcionando cuando alertas NO está vencido', async () => {
    const { scanService, calls } = fakeScanService();
    const scheduler = new TaskScheduler({ scanService, getConfig: fakeConfig });
    active = scheduler;
    markAllJustRan(scheduler);
    (scheduler as unknown as { lastSuppliesTime: number }).lastSuppliesTime = 0;

    await (scheduler as unknown as { run(): Promise<void> }).run();
    assert.deepEqual(calls, ['supplies'], 'con alertas al día, el resto de los loops sigue corriendo como antes');
  });
});

describe('TaskScheduler — self-optimización simétrica (regla de HP SDS: "si un ciclo tarda más que su intervalo, el siguiente arranca de inmediato")', () => {
  let active: TaskScheduler | null = null;
  afterEach(() => { active?.stop(); active = null; });

  test('el reloj de meter/supplies/alert se resetea al ARRANCAR la tarea, no al terminarla — antes sólo discovery se comportaba así', async () => {
    const calls: string[] = [];
    const scanService = {
      scan: async () => { calls.push('scan'); },
      // Tarea deliberadamente lenta: si el reloj se pegara al FIN (bug viejo),
      // `lastMeterTime` quedaría ~30ms después de `before`.
      runMeterTask: async () => { await new Promise((r) => setTimeout(r, 30)); calls.push('meter'); },
      runSuppliesTask: async () => { calls.push('supplies'); },
      runAlertTask: async () => { calls.push('alert'); },
      isLapInProgress: () => false,
    } as unknown as ScanService;
    const scheduler = new TaskScheduler({ scanService, getConfig: fakeConfig });
    active = scheduler;
    markAllJustRan(scheduler);
    (scheduler as unknown as { lastMeterTime: number }).lastMeterTime = 0; // vencido

    const before = Date.now();
    await (scheduler as unknown as { run(): Promise<void> }).run();
    const stamped = (scheduler as unknown as { lastMeterTime: number }).lastMeterTime;

    assert.deepEqual(calls, ['meter']);
    assert.ok(stamped - before < 10, `el reloj debe quedar pegado al ARRANQUE de la tarea (diff=${stamped - before}ms), no a su fin (~30ms después)`);
  });
});
