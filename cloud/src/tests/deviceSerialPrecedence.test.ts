// Precedencia del número de serie en la ingesta. Lógica pura, sin base.
// Ejecutar: npx tsx --test src/tests/deviceSerialPrecedence.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExistingDeviceFields } from '../modules/agents/domain/services/device-row-builders';
import { isIdentifyingSerial } from '../modules/devices';

const IP = '192.168.178.23';
const dev = (serial: string | null) => ({ serial_number: serial, model: 'WF-C5891 Series', name_reported: null });
const resolve = (stored: string | null, incoming: string | null) =>
  resolveExistingDeviceFields(dev(stored), 'WF-C5891 Series', incoming, IP, null, isIdentifyingSerial).finalSerial;

describe('Un placeholder guardado no se queda clavado para siempre', () => {
  test('el "?" del Epson se limpia aunque el agente lo siga mandando', () => {
    assert.equal(resolve('?', '?'), null);
  });

  test('y si el agente ya manda un serial real, ese gana', () => {
    assert.equal(resolve('?', 'X4NY123456'), 'X4NY123456');
  });

  test('lo mismo con los XXXXXXX de la flota', () => {
    assert.equal(resolve('XXXXXXXXXXXXXX', null), null);
    assert.equal(resolve('XXXXXXXXXXXXXX', 'CNB1R4C0M2'), 'CNB1R4C0M2');
  });

  test('una IP guardada como serial sigue descartándose (comportamiento previo)', () => {
    assert.equal(resolve(IP, 'CNB1R4C0M2'), 'CNB1R4C0M2');
  });
});

describe('Un serial real guardado NO se pisa', () => {
  test('gana el guardado aunque llegue otro distinto (no se churnea la identidad)', () => {
    assert.equal(resolve('CNB1N2SYJT', 'OTRO12345'), 'CNB1N2SYJT');
  });

  test('gana el guardado aunque la lectura venga sin serial', () => {
    assert.equal(resolve('CNB1N2SYJT', null), 'CNB1N2SYJT');
  });

  test('los seriales cortos reales de la flota se conservan', () => {
    assert.equal(resolve('3500M6N', null), '3500M6N');
    assert.equal(resolve('793H5LC', null), '793H5LC');
  });
});

describe('Sin ningún serial usable', () => {
  test('queda en null, no en cadena vacía', () => {
    assert.equal(resolve(null, null), null);
    assert.equal(resolve('', ''), null);
  });
});
