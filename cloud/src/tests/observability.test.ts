// Producción-readiness (Fase 5 del gap analysis: Prometheus + Sentry +
// advisory locks + pub/sub WS) — unitarios reales contra Postgres (dos
// conexiones para probar la exclusión del lock) y e2e contra el stack.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/observability.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib from 'knex';
import WebSocket from 'ws';
import { lockIdFor, runGuardedTick } from '../modules/observability/guarded-tick';
import { captureError } from '../modules/observability/sentry';
import { metricsAuthOk } from '../modules/metrics/http-metrics';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const BASE = API.replace(/\/api\/v1$/, '');
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const pgConn = {
  host: process.env.RBAC_TEST_DB_HOST || 'localhost',
  port: Number(process.env.RBAC_TEST_DB_PORT || 5434),
  user: process.env.DB_USER || 'stc_admin',
  password: process.env.DB_PASSWORD || 'stc_secret',
  database: process.env.DB_NAME || 'stc_cloud',
};
// Dos instancias con pool de 1: los advisory locks son por sesión de Postgres,
// así que la exclusión sólo se prueba de verdad con dos conexiones distintas.
const dbA = knexLib({ client: 'pg', connection: pgConn, pool: { min: 1, max: 1 } });
const dbB = knexLib({ client: 'pg', connection: pgConn, pool: { min: 1, max: 1 } });

after(async () => {
  await dbA.destroy().catch(() => {});
  await dbB.destroy().catch(() => {});
});

describe('guarded-tick — lock multi-réplica real', () => {
  test('lockIdFor es determinista y cabe en int4', () => {
    assert.equal(lockIdFor('incidents'), lockIdFor('incidents'));
    assert.notEqual(lockIdFor('incidents'), lockIdFor('retention'));
    const id = lockIdFor('supply-requests');
    assert.ok(Number.isInteger(id) && id >= -2147483648 && id <= 2147483647);
  });

  test('dos réplicas simultáneas: una corre, la otra se saltea', async () => {
    let ranA = false;
    let ranB = false;
    const slow = (mark: () => void) => async () => {
      mark();
      await new Promise((r) => setTimeout(r, 800));
    };
    const [resultA, resultB] = await Promise.all([
      runGuardedTick(dbA, 'obs-test-lock', slow(() => { ranA = true; })),
      (async () => {
        await new Promise((r) => setTimeout(r, 150)); // asegura que A tome el lock primero
        return runGuardedTick(dbB, 'obs-test-lock', slow(() => { ranB = true; }));
      })(),
    ]);
    assert.equal(resultA, 'ok');
    assert.equal(resultB, 'skipped');
    assert.equal(ranA, true);
    assert.equal(ranB, false, 'la segunda réplica no debe ejecutar el tick');
  });

  test('liberado el lock, el siguiente tick corre normal', async () => {
    const result = await runGuardedTick(dbB, 'obs-test-lock', async () => {});
    assert.equal(result, 'ok');
  });

  test('un tick que lanza devuelve error, libera el lock y no propaga', async () => {
    const result = await runGuardedTick(dbA, 'obs-test-err', async () => {
      throw new Error('boom controlado');
    });
    assert.equal(result, 'error');
    const again = await runGuardedTick(dbB, 'obs-test-err', async () => {});
    assert.equal(again, 'ok', 'el lock debe quedar liberado tras el error');
  });
});

describe('sentry + auth de métricas — unitarios', () => {
  test('captureError sin DSN es no-op y jamás lanza', () => {
    assert.doesNotThrow(() => captureError(new Error('x'), { a: 1 }));
  });

  test('metricsAuthOk: sin token todo pasa; con token exige el Bearer exacto', () => {
    assert.equal(metricsAuthOk(undefined, undefined), true);
    assert.equal(metricsAuthOk(undefined, 'secreto'), false);
    assert.equal(metricsAuthOk('Bearer secreto', 'secreto'), true);
    assert.equal(metricsAuthOk('Bearer otro', 'secreto'), false);
  });
});

describe('/metrics — e2e', () => {
  test('expone métricas propias y de proceso en formato Prometheus', async () => {
    const res = await fetch(`${BASE}/metrics`);
    assert.equal(res.status, 200);
    const text = await res.text();
    for (const name of [
      'stc_http_request_duration_seconds',
      'stc_job_ticks_total',
      'stc_job_last_success_timestamp_seconds',
      'stc_ws_connections',
      'stc_queue_waiting_jobs',
      'process_cpu_user_seconds_total',
    ]) {
      assert.ok(text.includes(name), `falta ${name}`);
    }
    // los jobs del boot ya deben haber tickeado ok al menos una vez
    assert.match(text, /stc_job_ticks_total\{job="[a-z-]+",result="ok"\} [1-9]/);
  });
});

describe('pub/sub WS — e2e (broadcast cruza Redis hasta el socket del portal)', () => {
  test('un publish al canal llega a un cliente WS de portal autenticado', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    const ticket = await req('POST', '/portal/ws-ticket', {}, login.data.token);
    assert.equal(ticket.status, 200);

    const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?token=${ticket.data.ticket}`;
    const socket = new WebSocket(wsUrl);
    const received: any[] = [];
    socket.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    // Publicar directo al canal (lo que haría broadcastToPortal en OTRA réplica)
    const { execSync } = await import('node:child_process');
    const payload = JSON.stringify({ event: 'obs_test', data: { ping: Date.now() } });
    execSync(`docker exec stc_redis redis-cli publish stc:ws:portal '${payload}'`);

    await new Promise((r) => setTimeout(r, 1500));
    socket.close();
    const hit = received.find((m) => m.event === 'obs_test');
    assert.ok(hit, 'el broadcast publicado en Redis debe llegar por el socket del portal');
  });
});
