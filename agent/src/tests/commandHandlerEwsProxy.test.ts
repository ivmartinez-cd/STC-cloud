// CommandHandler — caso EWS_PROXY (allowlist agent-side, GET-only, path).
// Run: npx tsx --test src/tests/commandHandlerEwsProxy.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CommandHandler } from '../core/CommandHandler';

describe('CommandHandler — EWS_PROXY', () => {
  test('IP no conocida (allowlist agent-side) → error, nunca hace el request real', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => false); // nada es "conocido"
    const result = await handler.handleCommand('EWS_PROXY', { ip: '127.0.0.1', path: '/x' }, 'cmd-1');
    assert.equal(result.status, 'error');
    assert.match((result.result as { error: string }).error, /known_devices/);
  });

  test('sin setKnownDeviceCheck configurado → fail-closed, rechaza igual', async () => {
    const handler = new CommandHandler(); // nunca se llamó setKnownDeviceCheck
    const result = await handler.handleCommand('EWS_PROXY', { ip: '127.0.0.1', path: '/x' }, 'cmd-2');
    assert.equal(result.status, 'error');
  });

  test('method distinto de GET → error, ni siquiera llega a chequear allowlist', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => true);
    const result = await handler.handleCommand('EWS_PROXY', { ip: '127.0.0.1', path: '/x', method: 'POST' }, 'cmd-3');
    assert.equal(result.status, 'error');
    assert.match((result.result as { error: string }).error, /GET/);
  });

  test('path que no empieza con "/" → error', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => true);
    const result = await handler.handleCommand('EWS_PROXY', { ip: '127.0.0.1', path: 'sin-barra' }, 'cmd-4');
    assert.equal(result.status, 'error');
    assert.match((result.result as { error: string }).error, /path inválido/);
  });

  // El camino de éxito real (IP conocida + GET + path válido → fetch real
  // exitoso) no se testea acá: `handleCommand` siempre usa el puerto 80 de
  // producción (no hay forma de inyectar un puerto de test a través de la
  // API pública del comando), y forzar un servidor de prueba real en el
  // puerto 80 requeriría privilegios de root — el fetch en sí, con puerto
  // parametrizable, ya está cubierto exhaustivamente en `ewsProxy.test.ts`.
  // Acá sólo importa que la validación de allowlist/method/path se aplique
  // ANTES de delegar al fetch, que es lo que los 4 tests de arriba confirman.
});
