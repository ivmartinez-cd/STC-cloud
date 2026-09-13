// Canal de actualización declarado vs. runtime real del agente.
// Ejecutar desde la raíz del repo:
//   npx tsx --test cloud/portal/tests/updateChannel.test.ts
//
// El caso que motivó esto es real: `build-installer-legacy.bat` compilaba sin
// `--channel legacy`, así que el agente de ISSN (Windows 7, Node 20.2.0)
// figuraba como `stable` en el portal y pedía releases compilados para Node
// 24. Si se los llegaba a instalar, el servicio no volvía a levantar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { updateChannelInfo } from '../src/features/monitors/lib/updateChannel';

describe('updateChannelInfo — combinaciones sanas', () => {
  test('stable corriendo Node 24 no avisa nada', () => {
    const info = updateChannelInfo('stable', 'v24.15.0');
    assert.equal(info.mismatch, false);
    assert.equal(info.warning, null);
    assert.equal(info.value, 'stable · Node v24.15.0');
  });

  test('legacy corriendo Node 20 no avisa nada', () => {
    const info = updateChannelInfo('legacy', 'v20.2.0');
    assert.equal(info.mismatch, false);
    assert.equal(info.value, 'legacy · Node v20.2.0');
  });
});

describe('updateChannelInfo — el caso de ISSN', () => {
  test('dice stable pero corre Node 20 → avisa', () => {
    const info = updateChannelInfo('stable', 'v20.2.0');
    assert.equal(info.mismatch, true);
    assert.match(info.warning ?? '', /Node 24/);
    assert.match(info.warning ?? '', /Node 20/);
    assert.match(info.warning ?? '', /--channel/, 'el aviso tiene que decir dónde mirar');
  });

  test('dice legacy pero corre Node 24 → también avisa (el inverso)', () => {
    assert.equal(updateChannelInfo('legacy', 'v24.15.0').mismatch, true);
  });
});

describe('updateChannelInfo — no afirma de más', () => {
  test('sin runtime no se marca nada: un agente viejo no tiene por qué salir en rojo', () => {
    const info = updateChannelInfo('stable', null);
    assert.equal(info.mismatch, false);
    assert.equal(info.value, 'stable');
  });

  test('sin canal tampoco', () => {
    const info = updateChannelInfo(null, 'v20.2.0');
    assert.equal(info.mismatch, false);
    assert.equal(info.value, '— · Node v20.2.0');
  });

  test('un canal desconocido no se juzga contra ningún Node', () => {
    assert.equal(updateChannelInfo('beta', 'v22.0.0').mismatch, false);
  });

  test('tolera mayúsculas y espacios del lado del canal', () => {
    assert.equal(updateChannelInfo('  LEGACY ', 'v20.2.0').mismatch, false);
    assert.equal(updateChannelInfo('  LEGACY ', 'v24.1.0').mismatch, true);
  });

  test('un runtime con formato raro no rompe ni marca', () => {
    assert.equal(updateChannelInfo('stable', 'desconocido').mismatch, false);
  });
});
