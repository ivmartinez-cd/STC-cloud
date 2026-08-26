// Dedupe de lecturas idénticas (meter/supplies) — tests unitarios.
// Run: npx tsx --test src/tests/dedupeReadings.test.ts

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stc-test-dedupe-'));
process.env['AGENT_DATA_DIR'] = TMP_DIR;

import {
  openQueue,
  upsertKnownDevice,
  shouldEnqueueReading,
  recordLastReadingSnapshot,
  getRawDb,
} from '../sync/database';
import type { DeviceReading } from '../capture/reading';
import type { AlertItem } from '../capture/types';

function fakeReading(ip: string, totalPages = 1000, tonerBlack = 50, alerts?: AlertItem[]): DeviceReading {
  return {
    ip,
    brand: 'hp',
    model: 'HP LaserJet Pro',
    sysDescr: 'HP LaserJet Pro',
    sysName: 'printer1',
    serial: `SN-${ip}`,
    total_pages: totalPages,
    mono_pages: totalPages - 100,
    color_pages: 100,
    toner_black: tonerBlack,
    time: new Date().toISOString(),
    poll_method: 'snmp',
    ...(alerts ? { supplies_details: { alerts } } : {}),
  };
}

/** Lectura estilo `AlertTask` (Fase 11) — sólo scope `alerts`, sin contadores/tóner. */
function fakeAlertOnlyReading(ip: string, alerts: AlertItem[]): DeviceReading {
  return {
    ip,
    brand: 'hp',
    model: 'HP LaserJet Pro',
    sysDescr: 'HP LaserJet Pro',
    sysName: 'printer1',
    serial: `SN-${ip}`,
    total_pages: null,
    mono_pages: null,
    color_pages: null,
    toner_black: null,
    time: new Date().toISOString(),
    poll_method: 'snmp',
    supplies_details: { alerts },
  };
}

describe('Dedupe de lecturas — shouldEnqueueReading/recordLastReadingSnapshot', () => {
  before(() => {
    openQueue();
  });

  test('sin snapshot previo (dispositivo nuevo) → siempre se manda', () => {
    upsertKnownDevice('10.0.5.1', { pollMethod: 'snmp' });
    assert.equal(shouldEnqueueReading('10.0.5.1', fakeReading('10.0.5.1'), 4), true);
  });

  test('misma lectura que la última enviada, dentro de la ventana → NO se manda', () => {
    const ip = '10.0.5.2';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const reading = fakeReading(ip, 2000, 40);
    assert.equal(shouldEnqueueReading(ip, reading, 4), true);
    recordLastReadingSnapshot(ip, reading);

    // Misma lectura exacta, inmediatamente después.
    assert.equal(shouldEnqueueReading(ip, fakeReading(ip, 2000, 40), 4), false);
  });

  test('contador cambió → se manda aunque no haya pasado la ventana', () => {
    const ip = '10.0.5.3';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const first = fakeReading(ip, 3000, 40);
    recordLastReadingSnapshot(ip, first);

    assert.equal(shouldEnqueueReading(ip, fakeReading(ip, 3001, 40), 4), true, 'total_pages cambió');
  });

  test('sólo tóner cambió (contador de páginas igual) → se manda igual', () => {
    const ip = '10.0.5.4';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const first = fakeReading(ip, 4000, 40);
    recordLastReadingSnapshot(ip, first);

    assert.equal(shouldEnqueueReading(ip, fakeReading(ip, 4000, 39), 4), true, 'toner_black cambió');
  });

  test('sin cambios pero ya pasó la ventana → se manda (señal de "sigo vivo")', () => {
    const ip = '10.0.5.5';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const reading = fakeReading(ip, 5000, 40);
    recordLastReadingSnapshot(ip, reading);

    // Forzar manualmente que "el último envío" fue hace 5 horas (> ventana de 4h).
    const db = getRawDb();
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('UPDATE known_devices SET last_reading_sent_at = ? WHERE ip = ?').run(fiveHoursAgo, ip);

    assert.equal(shouldEnqueueReading(ip, fakeReading(ip, 5000, 40), 4), true);
  });

  test('alertas: cambiaron sin tocar contadores/tóner → se manda (bug real de AlertTask, Fase 11)', () => {
    // Reproduce exactamente lo que manda `AlertTask` (sólo scope `alerts`): dos
    // lecturas con total_pages/toner_black en null, pero alertas DISTINTAS. Antes
    // del fix, readingSnapshotKey ignoraba `alerts` — la huella (todo null) era
    // idéntica en ambos ciclos y el loop 3/15 nunca detectaba la alerta nueva
    // hasta la ventana de dedupe de 4h, justo lo que el loop rápido buscaba evitar.
    const ip = '10.0.5.6';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const first = fakeAlertOnlyReading(ip, [{ code: 'toner-low', description: 'Toner bajo', severity: 'WARNING' }]);
    recordLastReadingSnapshot(ip, first);

    const second = fakeAlertOnlyReading(ip, [{ code: 'paper-jam', description: 'Atasco', severity: 'ERROR' }]);
    assert.equal(shouldEnqueueReading(ip, second, 4), true, 'la lista de alertas cambió, aunque los contadores sigan en null');
  });

  test('alertas: mismas alertas (distinto orden de walk SNMP) → NO se manda', () => {
    const ip = '10.0.5.7';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const first = fakeAlertOnlyReading(ip, [
      { code: 'toner-low', description: 'Toner bajo', severity: 'WARNING' },
      { code: 'tray-empty', description: 'Bandeja vacía', severity: 'WARNING' },
    ]);
    recordLastReadingSnapshot(ip, first);

    // Mismas dos alertas, orden invertido — el walk SNMP no garantiza orden estable.
    const second = fakeAlertOnlyReading(ip, [
      { code: 'tray-empty', description: 'Bandeja vacía', severity: 'WARNING' },
      { code: 'toner-low', description: 'Toner bajo', severity: 'WARNING' },
    ]);
    assert.equal(shouldEnqueueReading(ip, second, 4), false, 'mismo conjunto de alertas, sólo cambió el orden');
  });

  test('alertas: se resolvió la única alerta activa → se manda (vuelve a "sin alertas")', () => {
    const ip = '10.0.5.8';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const first = fakeAlertOnlyReading(ip, [{ code: 'toner-low', description: 'Toner bajo', severity: 'WARNING' }]);
    recordLastReadingSnapshot(ip, first);

    const second = fakeAlertOnlyReading(ip, []);
    assert.equal(shouldEnqueueReading(ip, second, 4), true, 'la alerta se resolvió — el equipo ya no tiene ninguna');
  });

  test('meter/supplies: alertas idénticas no rompen el dedupe existente de contadores/tóner', () => {
    // Regresión: el fix agrega `alerts` a la huella, pero no debe volver más
    // sensible el dedupe YA existente de meter/supplies cuando las alertas no
    // vienen (undefined en ambas lecturas, como siempre fue el caso ahí).
    const ip = '10.0.5.9';
    upsertKnownDevice(ip, { pollMethod: 'snmp' });
    const first = fakeReading(ip, 6000, 40);
    recordLastReadingSnapshot(ip, first);
    assert.equal(shouldEnqueueReading(ip, fakeReading(ip, 6000, 40), 4), false, 'sin alertas en ninguna de las dos, sigue deduplicando igual que antes');
  });

  test('recordLastReadingSnapshot no crea una fila nueva si el dispositivo no existe todavía', () => {
    // Documenta el orden requerido en ScanService.ts: upsertKnownDevice DEBE
    // correr antes que recordLastReadingSnapshot (un UPDATE sobre 0 filas no
    // tira error en SQLite, pero tampoco persiste nada).
    const ip = '10.0.5.99';
    recordLastReadingSnapshot(ip, fakeReading(ip));
    assert.equal(shouldEnqueueReading(ip, fakeReading(ip), 4), true, 'sin fila known_devices, sigue sin snapshot — se manda');
  });
});
