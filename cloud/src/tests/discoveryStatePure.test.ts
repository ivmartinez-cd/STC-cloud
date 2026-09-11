// Guard de forma de `agents.discovery_state` — lógica pura, sin servidor, sin
// base. Ejecutar: npx tsx --test src/tests/discoveryStatePure.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAgentDiscoveryState, readAgentDiscoveryState } from '../modules/agents/domain/services/discovery-state';

const VALIDO = {
  in_progress: true,
  scanned: 120,
  total: 512,
  lap_started_at: '2026-09-11T10:00:00.000Z',
  last_lap_at: null,
  last_lap_ms: null,
  laps_completed: 0,
};

describe('isAgentDiscoveryState', () => {
  test('objeto completo del contrato → true', () => {
    assert.equal(isAgentDiscoveryState(VALIDO), true);
  });

  test('vuelta cerrada (in_progress false, con duración) → true', () => {
    assert.equal(isAgentDiscoveryState({
      ...VALIDO, in_progress: false, scanned: 0, lap_started_at: null,
      last_lap_at: '2026-09-11T10:40:00.000Z', last_lap_ms: 2_400_000, laps_completed: 3,
    }), true);
  });

  test('escalares, array y null → false', () => {
    for (const v of ['foo', 42, true, null, undefined, [VALIDO]]) {
      assert.equal(isAgentDiscoveryState(v), false, `debería rechazar ${JSON.stringify(v)}`);
    }
  });

  test('objeto a medias (falta total) → false', () => {
    const { total, ...sinTotal } = VALIDO;
    void total;
    assert.equal(isAgentDiscoveryState(sinTotal), false);
  });

  test('tipos equivocados en los campos → false', () => {
    assert.equal(isAgentDiscoveryState({ ...VALIDO, in_progress: 'si' }), false);
    assert.equal(isAgentDiscoveryState({ ...VALIDO, scanned: '120' }), false);
    assert.equal(isAgentDiscoveryState({ ...VALIDO, total: NaN }), false);
    assert.equal(isAgentDiscoveryState({ ...VALIDO, lap_started_at: 1757570400000 }), false);
  });

  test('campos extra de un agente más nuevo no invalidan', () => {
    assert.equal(isAgentDiscoveryState({ ...VALIDO, chunk_ms: 40_000 }), true);
  });
});

describe('readAgentDiscoveryState', () => {
  test('objeto ya parseado por el driver → pasa tal cual, con los extras', () => {
    const leido = readAgentDiscoveryState({ ...VALIDO, chunk_ms: 40_000 });
    assert.deepEqual(leido, { ...VALIDO, chunk_ms: 40_000 });
  });

  test('columna vieja guardada como string JSON → se parsea', () => {
    assert.deepEqual(readAgentDiscoveryState(JSON.stringify(VALIDO)), VALIDO);
  });

  test('jsonb con un string suelto no tira (el caso que rompía /stats)', () => {
    assert.equal(readAgentDiscoveryState('foo'), null);
  });

  test('NULL en la columna → null (no un objeto en cero)', () => {
    assert.equal(readAgentDiscoveryState(null), null);
    assert.equal(readAgentDiscoveryState(undefined), null);
  });

  test('objeto con otra forma → null', () => {
    assert.equal(readAgentDiscoveryState({ scanned: 1 }), null);
  });
});
