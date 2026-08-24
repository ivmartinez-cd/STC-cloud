// CommandHandler — caso RESTART_PRINTER (v1.2.0). Mismo alcance que
// commandHandlerEwsProxy.test.ts: sólo la validación agent-side (allowlist
// de known_devices + credenciales configuradas) ANTES de tocar la red — el
// SNMP SET real (negociación + clasificación de error) ya está cubierto
// exhaustivamente en snmpSet.test.ts/printerReset.test.ts.
// Run: npx tsx --test src/tests/commandHandlerRestartPrinter.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CommandHandler } from '../core/CommandHandler';

describe('CommandHandler — RESTART_PRINTER', () => {
  test('IP no conocida → error, nunca intenta negociar SNMP', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => false);
    const result = await handler.handleCommand('RESTART_PRINTER', { ip: '10.0.0.9' }, 'cmd-1');
    assert.equal(result.status, 'error');
    assert.match((result.result as { error: string }).error, /known_devices/);
  });

  test('sin setKnownDeviceCheck configurado → fail-closed, rechaza igual', async () => {
    const handler = new CommandHandler();
    const result = await handler.handleCommand('RESTART_PRINTER', { ip: '10.0.0.9' }, 'cmd-2');
    assert.equal(result.status, 'error');
  });

  test('sin setSnmpCredentialsProvider configurado → fail-closed (pool vacío)', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => true);
    const result = await handler.handleCommand('RESTART_PRINTER', { ip: '10.0.0.9' }, 'cmd-3');
    assert.equal(result.status, 'error');
    assert.match((result.result as { error: string }).error, /credenciales/i);
  });

  test('IP vacía → error explícito, no "undefined"', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => true);
    const result = await handler.handleCommand('RESTART_PRINTER', {}, 'cmd-4');
    assert.equal(result.status, 'error');
    assert.match((result.result as { error: string }).error, /vacía/);
  });
});
