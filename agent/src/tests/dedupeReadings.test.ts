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

function fakeReading(ip: string, totalPages = 1000, tonerBlack = 50): DeviceReading {
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

  test('recordLastReadingSnapshot no crea una fila nueva si el dispositivo no existe todavía', () => {
    // Documenta el orden requerido en ScanService.ts: upsertKnownDevice DEBE
    // correr antes que recordLastReadingSnapshot (un UPDATE sobre 0 filas no
    // tira error en SQLite, pero tampoco persiste nada).
    const ip = '10.0.5.99';
    recordLastReadingSnapshot(ip, fakeReading(ip));
    assert.equal(shouldEnqueueReading(ip, fakeReading(ip), 4), true, 'sin fila known_devices, sigue sin snapshot — se manda');
  });
});
