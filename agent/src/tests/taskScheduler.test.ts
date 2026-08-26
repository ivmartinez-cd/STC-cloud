// TaskScheduler — prioridad entre los 4 loops (Fase 11 del gap analysis vs
// HP SDS: loop dedicado de alertas 3/15, no debe quedar postergado por
// discovery/meter/supplies). Manipula los campos privados de "última
// corrida" para simular vencimiento sin esperar minutos reales.
// Ejecutar: npx tsx --test src/tests/taskScheduler.test.ts

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { TaskScheduler } from '../core/TaskScheduler';
import { INTERVALS, DEFAULT_BUSINESS_HOURS } from '../core/BusinessHours';
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

  test('INTERVALS.alert es 3 min en horario laboral / 15 min fuera de él (valores exactos de SDS)', () => {
    assert.equal(INTERVALS.alert.biz, 3 * 60_000);
    assert.equal(INTERVALS.alert.off, 15 * 60_000);
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
