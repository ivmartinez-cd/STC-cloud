// Diccionario de alertas (código de vendor → motivo + clase) — lógica pura, sin
// servidor, sin base. Ejecutar: npx tsx --test src/tests/alertCatalog.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAlert, ALERT_CLASS_LABELS, RESPONDER_LABELS,
  type AlertClass, type Responder,
} from '../modules/alerts';

describe('alertCatalog — invariantes', () => {
  test('toda AlertClass tiene label en español', () => {
    const classes: AlertClass[] = [
      'consumable_out', 'consumable_low', 'system_failure', 'system_warning', 'user_action',
      'system_change', 'jam', 'media_out', 'media_low', 'information', 'subunit_low',
      'subunit_out', 'availability', 'other',
    ];
    for (const c of classes) {
      assert.ok(ALERT_CLASS_LABELS[c], `falta label para la clase ${c}`);
    }
  });

  test('todo Responder tiene label en español', () => {
    const responders: Responder[] = ['none', 'untrained', 'trained', 'field_service', 'management'];
    for (const r of responders) {
      assert.ok(RESPONDER_LABELS[r], `falta label para responder ${r}`);
    }
  });

  test('classifyAlert es total: nunca lanza, con cualquier input', () => {
    const inputs = ['', ' ', 'algo-random-123', null, undefined, 'HR-999', '99999', 'C9-9999'];
    for (const type of inputs) {
      assert.doesNotThrow(() => classifyAlert(type as string));
    }
  });

  test('reason nunca vacío ni mayor a 120 caracteres', () => {
    const cases = [
      classifyAlert('807'),
      classifyAlert('unknown-type-xyz', 'a'.repeat(500)),
      classifyAlert('unknown-type-xyz', ''),
      classifyAlert('unknown-type-xyz', null),
    ];
    for (const c of cases) {
      assert.ok(c.reason.length > 0, 'reason vacío');
      assert.ok(c.reason.length <= 120, `reason de ${c.reason.length} chars supera el límite`);
    }
  });
});

describe('alertCatalog — tipos internos (los que escribimos nosotros)', () => {
  test('toner_black_low → consumable_low', () => {
    assert.equal(classifyAlert('toner_black_low').klass, 'consumable_low');
  });
  test('toner_cyan_critical → consumable_out', () => {
    assert.equal(classifyAlert('toner_cyan_critical').klass, 'consumable_out');
  });
  test('counter_reset → system_change / management', () => {
    const c = classifyAlert('counter_reset');
    assert.equal(c.klass, 'system_change');
    assert.equal(c.responder, 'management');
  });
  test('network_board_reset → system_warning / field_service (la restaura un técnico)', () => {
    const c = classifyAlert('network_board_reset');
    assert.equal(c.klass, 'system_warning');
    assert.equal(c.responder, 'field_service');
  });
  test('device_offline y agent_offline → availability', () => {
    assert.equal(classifyAlert('device_offline').klass, 'availability');
    assert.equal(classifyAlert('agent_offline').klass, 'availability');
  });
  test('device_error (legado, pre-migración) también clasifica como availability', () => {
    assert.equal(classifyAlert('device_error').klass, 'availability');
  });
});

describe('alertCatalog — prtAlertCode (RFC 3805, Printer-MIB)', () => {
  test('8 (jam) → jam', () => {
    assert.equal(classifyAlert('8').klass, 'jam');
  });
  test('807 (inputMediaSupplyLow) → media_low', () => {
    assert.equal(classifyAlert('807').klass, 'media_low');
  });
  test('808 (inputMediaSupplyEmpty) → media_out', () => {
    assert.equal(classifyAlert('808').klass, 'media_out');
  });
  test('1101 (markerSupplyEmpty) → consumable_out', () => {
    assert.equal(classifyAlert('1101').klass, 'consumable_out');
  });
  test('1104 (markerSupplyLow) → consumable_low', () => {
    assert.equal(classifyAlert('1104').klass, 'consumable_low');
  });
  test('23 (subunitPowerSaver) → information, sin responder (no requiere acción)', () => {
    const c = classifyAlert('23');
    assert.equal(c.klass, 'information');
    assert.equal(c.responder, 'none');
  });
  test('501 (doorOpen) → user_action', () => {
    assert.equal(classifyAlert('501').klass, 'user_action');
  });
  test('código numérico desconocido (fuera de la tabla) → other', () => {
    assert.equal(classifyAlert('9999').klass, 'other');
  });
});

describe('alertCatalog — bits HR-<n> (hrPrinterDetectedErrorState)', () => {
  test('HR-1 (No paper) → media_out', () => {
    assert.equal(classifyAlert('HR-1').klass, 'media_out');
  });
  test('HR-3 (No toner) → consumable_out', () => {
    assert.equal(classifyAlert('HR-3').klass, 'consumable_out');
  });
  test('HR-5 (Jammed) → jam', () => {
    assert.equal(classifyAlert('HR-5').klass, 'jam');
  });
  test('HR-7 (Service requested) → system_failure / field_service', () => {
    const c = classifyAlert('HR-7');
    assert.equal(c.klass, 'system_failure');
    assert.equal(c.responder, 'field_service');
  });
  test('HR-bit fuera de rango conocido → other (no lanza)', () => {
    assert.equal(classifyAlert('HR-99').klass, 'other');
  });
});

describe('alertCatalog — códigos de vendor (Samsung EWS)', () => {
  test('C2-1411 tiene override exacto (bandeja de salida llena)', () => {
    const c = classifyAlert('C2-1411');
    assert.equal(c.klass, 'subunit_out');
    assert.match(c.reason, /bandeja de salida/i);
  });
  test('S2-3313 tiene override exacto (ahorro de energía)', () => {
    assert.equal(classifyAlert('S2-3313').klass, 'information');
  });
  test('M1-5612 tiene override exacto (bandeja multipropósito vacía)', () => {
    assert.equal(classifyAlert('M1-5612').klass, 'media_out');
  });
  test('código Samsung desconocido de familia C → consumable_low por familia', () => {
    assert.equal(classifyAlert('C9-9999').klass, 'consumable_low');
  });
  test('código Samsung desconocido de familia S → system_warning por familia', () => {
    assert.equal(classifyAlert('S9-9999').klass, 'system_warning');
  });
  test('código Samsung desconocido de familia M → media_low por familia', () => {
    assert.equal(classifyAlert('M9-9999').klass, 'media_low');
  });
});

describe('alertCatalog — fallback', () => {
  test('tipo completamente desconocido sin mensaje → other, reason = el propio type', () => {
    const c = classifyAlert('algo-nunca-visto');
    assert.equal(c.klass, 'other');
    assert.equal(c.reason, 'algo-nunca-visto');
  });
  test('tipo desconocido con mensaje → usa el mensaje saneado como reason', () => {
    const c = classifyAlert('algo-nunca-visto', 'Mensaje crudo del equipo');
    assert.equal(c.reason, 'Mensaje crudo del equipo');
  });
  test('mensaje que repite el código al principio → se lo saca del reason (vía fallback de familia, S2-3313 tiene override exacto y no pasa por sanitize)', () => {
    const c = classifyAlert('S9-3313', 'S9-3313 The machine is currently in power saver mode.');
    assert.ok(!c.reason.startsWith('S9-3313'));
  });
});
