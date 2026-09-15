// Regresión: `devices.mac` es MACADDR y `lower(macaddr)` no existe en Postgres.
// Necesita base (el bug NO se ve sin Postgres real: compila y pasa cualquier
// test con repo mockeado). Ejecutar con el stack efímero:
//   DB_PORT=55432 npx tsx --test src/tests/ingestMacCast.test.ts

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib, { type Knex } from 'knex';
import { KnexIngestDeviceRepository } from '../modules/agents/infrastructure/database/knex-ingest-device-repository';

const db: Knex = knexLib({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.INGEST_TEST_DB_PORT || process.env.DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});

const ts = Date.now();
const ctx = { clientId: '', deviceId: '', dupId: '' };

before(async () => {
  const [c] = await db('clients').insert({ name: `MAC cast test ${ts}` }).returning('*');
  ctx.clientId = c.id;
  const [d1] = await db('devices').insert({ client_id: c.id, serial_number: `MC1-${ts}`, mac: 'AA:BB:CC:DD:01:01' }).returning('*');
  ctx.deviceId = d1.id;
  const [d2] = await db('devices').insert({ client_id: c.id, serial_number: `MC2-${ts}`, mac: 'AA:BB:CC:DD:01:02' }).returning('*');
  ctx.dupId = d2.id;
  await db('devices').insert({ client_id: c.id, serial_number: `MC3-${ts}`, mac: 'AA:BB:CC:DD:01:02' });
});

after(async () => {
  await db('devices').where({ client_id: ctx.clientId }).del().catch(() => {});
  await db('clients').where({ id: ctx.clientId }).del().catch(() => {});
  await db.destroy().catch(() => {});
});

describe('countOtherLiveDevicesWithMac — MACADDR necesita cast a texto', () => {
  const repo = () => new KnexIngestDeviceRepository(db);

  test('no revienta contra Postgres (antes: "function lower(macaddr) does not exist")', async () => {
    await assert.doesNotReject(() => repo().countOtherLiveDevicesWithMac(ctx.clientId, 'AA:BB:CC:DD:01:01', ctx.deviceId));
  });

  test('MAC única → 0 otros equipos', async () => {
    assert.equal(await repo().countOtherLiveDevicesWithMac(ctx.clientId, 'AA:BB:CC:DD:01:01', ctx.deviceId), 0);
  });

  test('MAC repetida → cuenta el otro equipo, no a sí mismo', async () => {
    assert.equal(await repo().countOtherLiveDevicesWithMac(ctx.clientId, 'AA:BB:CC:DD:01:02', ctx.dupId), 1);
  });

  test('la comparación sigue siendo case-insensitive (para eso estaba el lower)', async () => {
    assert.equal(await repo().countOtherLiveDevicesWithMac(ctx.clientId, 'aa:bb:cc:dd:01:02', ctx.dupId), 1);
  });
});
