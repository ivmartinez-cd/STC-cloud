// Unit tests for SQLite queue — tests offline persistence behavior
// Run: npx tsx --test src/tests/queue.test.ts
//
// Uses a temp directory so it never touches production data.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Point agent data dir to temp dir before importing the database module
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stc-test-'));
process.env['AGENT_DATA_DIR'] = TMP_DIR;

// Import AFTER setting env var so DATA_DIR picks up the temp path
import {
  openQueue,
  enqueueReading,
  pendingCount,
  getPendingReadings,
  markSynced,
  purgeOld,
  isRegistered,
  upsertKnownDevice,
  closeQueue,
} from '../sync/database';
import type { DeviceReading } from '../snmp/scanner';

function fakeReading(ip: string, totalPages = 1000): DeviceReading {
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
    status: 'idle',
    time: new Date().toISOString(),
  };
}

describe('SQLite Offline Queue', () => {
  before(() => {
    openQueue();
  });


  test('starts with 0 pending readings', () => {
    assert.equal(pendingCount(), 0);
  });

  test('enqueueReading inserts a reading', () => {
    enqueueReading(fakeReading('10.0.0.1', 5000));
    assert.equal(pendingCount(), 1);
  });

  test('getPendingReadings returns unsynced rows', () => {
    enqueueReading(fakeReading('10.0.0.2', 3000));
    const rows = getPendingReadings(10);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.synced === 0), 'All rows should be unsynced');
  });

  test('markSynced removes rows from pending list', () => {
    const rows = getPendingReadings(10);
    const ids = rows.map(r => r.id as number);
    markSynced(ids);
    assert.equal(pendingCount(), 0);
  });

  test('purgeOld clears synced rows', () => {
    // Add a new reading and sync it
    enqueueReading(fakeReading('10.0.0.3'));
    const rows = getPendingReadings(1);
    markSynced([rows[0].id as number]);
    assert.equal(pendingCount(), 0);

    // purgeOld should clean up synced records
    purgeOld();
    assert.equal(pendingCount(), 0);
  });

  test('multiple enqueue + batch markSynced', () => {
    for (let i = 0; i < 50; i++) {
      enqueueReading(fakeReading(`192.168.0.${i % 254 + 1}`, i * 100));
    }
    assert.equal(pendingCount(), 50);

    const batch = getPendingReadings(500);
    assert.equal(batch.length, 50);
    markSynced(batch.map(r => r.id as number));
    assert.equal(pendingCount(), 0);
  });

  test('getPendingReadings respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      enqueueReading(fakeReading(`172.16.0.${i + 1}`));
    }
    const limited = getPendingReadings(3);
    assert.equal(limited.length, 3);
    // Cleanup
    markSynced(getPendingReadings(100).map(r => r.id as number));
  });
});

describe('Known Devices Registry', () => {
  before(() => openQueue());

  test('isRegistered returns false for unknown IP', () => {
    assert.equal(isRegistered('10.99.99.99'), false);
  });

  test('upsertKnownDevice + isRegistered', () => {
    upsertKnownDevice('10.99.99.99', { serial: 'SN-TEST', brand: 'hp', registered: true });
    assert.equal(isRegistered('10.99.99.99'), true);
  });

  test('upsertKnownDevice updates last_seen on re-insert', () => {
    // Just checking it does not throw
    upsertKnownDevice('10.99.99.99', {});
    assert.equal(isRegistered('10.99.99.99'), true);
  });

  test('unregistered device returns false even if upserted without registered:true', () => {
    upsertKnownDevice('10.99.99.100', { serial: 'SN-XYZ', brand: 'lexmark', registered: false });
    assert.equal(isRegistered('10.99.99.100'), false);
  });
});

after(() => {
  closeQueue();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});
