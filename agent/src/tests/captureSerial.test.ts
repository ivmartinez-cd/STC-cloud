// Descarte de seriales placeholder. Las reglas tienen que quedar alineadas con
// `isIdentifyingSerial` del servidor: si divergen, el agente y el portal
// muestran identidades distintas del mismo equipo.
// Ejecutar: npx tsx --test src/tests/captureSerial.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSerial, isRealSerial } from '../capture/serial';

describe('Placeholders de firmware que no son un serial', () => {
  test('el "?" del PJL del Epson WF-C5891 (caso que motivó esto)', () => {
    assert.equal(cleanSerial('?'), null);
  });

  test('cadenas de un mismo carácter repetido', () => {
    assert.equal(cleanSerial('XXXXXXXXXXXXXX'), null);
    assert.equal(cleanSerial('00000000'), null);
    assert.equal(cleanSerial('--------'), null);
  });

  test('palabras genéricas', () => {
    for (const s of ['unknown', 'N/A', 'none', 'null', 'serial', 'S/N', 'not set', 'default']) {
      assert.equal(cleanSerial(s), null, s);
    }
  });

  test('vacío, espacios y nulos', () => {
    assert.equal(cleanSerial(''), null);
    assert.equal(cleanSerial('   '), null);
    assert.equal(cleanSerial(null), null);
    assert.equal(cleanSerial(undefined), null);
  });

  test('demasiado corto para identificar', () => {
    assert.equal(cleanSerial('AB12'), null);
    assert.equal(isRealSerial('AB123'), true, '5 caracteres ya alcanza');
  });

  test('una IP disfrazada de serial', () => {
    assert.equal(cleanSerial('192.168.178.23'), null);
    assert.equal(cleanSerial('10.20.7.54', '10.20.7.54'), null);
    assert.equal(cleanSerial('AA:BB:CC:DD:EE:FF'), null, 'una MAC tampoco es un serial');
  });

  test('el 123456 de fábrica', () => {
    assert.equal(cleanSerial('123456'), null);
    assert.equal(cleanSerial('SN0123456'), null);
  });
});

describe('Seriales reales de la flota — no se descartan', () => {
  test('los que hay hoy en producción siguen siendo válidos', () => {
    for (const s of ['CNB1N2SYJT', '076UBJFH10009AT', '28SYB1BF60000HP', '793H5LC', '0ACTBJFHB0001SK']) {
      assert.equal(cleanSerial(s), s, s);
    }
  });

  test('recorta espacios pero conserva el valor', () => {
    assert.equal(cleanSerial('  CNB1R4C0M2  '), 'CNB1R4C0M2');
  });

  test('un serial que coincide con OTRA ip no se descarta', () => {
    assert.equal(cleanSerial('CNB1R4C0M2', '192.168.178.14'), 'CNB1R4C0M2');
  });
});
