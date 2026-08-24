// policyFor() — honrar monitor_state/registration_state del lado agente
// (Fase 10 del gap analysis vs HP SDS). Ejecutar:
// npx tsx --test src/tests/devicePolicy.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { policyFor } from '../core/devicePolicy';
import type { AgentConfig } from '../core/config';

function cfg(devicePolicies?: Array<{ ip: string; state: string }>): AgentConfig {
  return {
    serverUrl: 'http://x', agentId: 'a', token: 't', refreshToken: 'r',
    ipRanges: [], snmpCommunity: 'public', snmpVersion: 2, devicePolicies,
  };
}

describe('policyFor — fail-open', () => {
  test('sin devicePolicies (ausente) → full para cualquier ip', () => {
    assert.equal(policyFor(cfg(undefined), '10.0.0.1'), 'full');
  });

  test('devicePolicies vacío → full', () => {
    assert.equal(policyFor(cfg([]), '10.0.0.1'), 'full');
  });

  test('ip que no está en la lista → full (sólo llegan los NO-full)', () => {
    assert.equal(policyFor(cfg([{ ip: '10.0.0.9', state: 'disabled' }]), '10.0.0.1'), 'full');
  });

  test('estado desconocido (typo/versión nueva del cloud) → full, nunca lanza', () => {
    assert.equal(policyFor(cfg([{ ip: '10.0.0.1', state: 'algo-nuevo-que-no-existe-todavia' }]), '10.0.0.1'), 'full');
  });
});

describe('policyFor — matching por ip', () => {
  test('devuelve el estado exacto de la entrada que matchea', () => {
    const c = cfg([
      { ip: '10.0.0.1', state: 'disabled' },
      { ip: '10.0.0.2', state: 'ignored' },
      { ip: '10.0.0.3', state: 'supplies_only' },
      { ip: '10.0.0.4', state: 'reports_only' },
    ]);
    assert.equal(policyFor(c, '10.0.0.1'), 'disabled');
    assert.equal(policyFor(c, '10.0.0.2'), 'ignored');
    assert.equal(policyFor(c, '10.0.0.3'), 'supplies_only');
    assert.equal(policyFor(c, '10.0.0.4'), 'reports_only');
  });

  test('sólo afecta la ip exacta, no otras del mismo rango', () => {
    const c = cfg([{ ip: '10.0.0.1', state: 'disabled' }]);
    assert.equal(policyFor(c, '10.0.0.2'), 'full');
  });
});
