// Cursor de barrido continuo (discovery paginado). Lógica pura: sin SQLite,
// sin red, sin reloj.
// Ejecutar: npx tsx --test src/tests/discoveryCursor.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURSOR_START,
  advanceCursor,
  fingerprintRanges,
  planChunk,
  rangeSize,
  totalDeclaredIps,
  type CursorRange,
} from '../core/DiscoveryCursor';

const R = (start: string, end: string): CursorRange => ({ start, end });

/** 3 rangos chicos: 5 + 2 + 3 = 10 IPs declaradas. */
const RANGES: CursorRange[] = [R('10.0.0.1', '10.0.0.5'), R('10.0.1.1', '10.0.1.2'), R('10.0.2.1', '10.0.2.3')];

describe('DiscoveryCursor — tamaños', () => {
  test('rangeSize cuenta ambos extremos inclusive', () => {
    assert.equal(rangeSize(R('10.0.0.1', '10.0.0.254')), 254);
    assert.equal(rangeSize(R('10.0.0.7', '10.0.0.7')), 1);
  });

  test('rangeSize de un rango invertido (dato corrupto) es 0, no negativo', () => {
    assert.equal(rangeSize(R('10.0.0.10', '10.0.0.1')), 0);
  });

  test('totalDeclaredIps suma todos los rangos', () => {
    assert.equal(totalDeclaredIps(RANGES), 10);
    assert.equal(totalDeclaredIps([]), 0);
  });

  test('un /8 entero no materializa nada: es aritmética, no iteración', () => {
    assert.equal(totalDeclaredIps([R('10.0.0.0', '10.255.255.255')]), 16_777_216);
  });
});

describe('DiscoveryCursor — planChunk', () => {
  test('chunk más chico que el primer rango: se queda adentro y no cierra vuelta', () => {
    const plan = planChunk(RANGES, CURSOR_START, 3);
    assert.deepEqual(plan.ips, ['10.0.0.1', '10.0.0.2', '10.0.0.3']);
    assert.deepEqual(plan.rangeIdxOf, [0, 0, 0]);
    assert.deepEqual(plan.next, { rangeIdx: 0, offset: 3 });
    assert.equal(plan.reachesEnd, false);
  });

  test('chunk que cruza el borde de un rango: sigue en el siguiente y marca su índice', () => {
    const plan = planChunk(RANGES, { rangeIdx: 0, offset: 3 }, 4);
    assert.deepEqual(plan.ips, ['10.0.0.4', '10.0.0.5', '10.0.1.1', '10.0.1.2']);
    assert.deepEqual(plan.rangeIdxOf, [0, 0, 1, 1]);
    assert.deepEqual(plan.next, { rangeIdx: 2, offset: 0 });
    assert.equal(plan.reachesEnd, false);
  });

  test('chunk más grande que lo que queda: corta en el final y NO da la vuelta dentro del mismo chunk', () => {
    const plan = planChunk(RANGES, { rangeIdx: 2, offset: 0 }, 100);
    assert.deepEqual(plan.ips, ['10.0.2.1', '10.0.2.2', '10.0.2.3']);
    assert.equal(plan.reachesEnd, true);
    assert.deepEqual(plan.next, CURSOR_START);
  });

  test('nunca materializa más que el tope de chunk, por grande que sea el espacio', () => {
    const plan = planChunk([R('10.0.0.0', '10.255.255.255')], CURSOR_START, 400);
    assert.equal(plan.ips.length, 400);
    assert.equal(plan.reachesEnd, false);
  });

  test('sin rangos: chunk vacío que cuenta como vuelta cerrada (no deja el cursor trabado)', () => {
    const plan = planChunk([], CURSOR_START, 400);
    assert.deepEqual(plan.ips, []);
    assert.equal(plan.reachesEnd, true);
  });

  test('cursor apuntando a un rango que ya no existe (config achicada): reinicia desde el principio', () => {
    const plan = planChunk(RANGES, { rangeIdx: 99, offset: 50 }, 2);
    assert.deepEqual(plan.ips, ['10.0.0.1', '10.0.0.2']);
  });

  test('rangos invertidos intercalados se saltean sin romper el recorrido', () => {
    const withBad = [R('10.0.0.1', '10.0.0.2'), R('10.0.9.9', '10.0.9.1'), R('10.0.3.1', '10.0.3.2')];
    const plan = planChunk(withBad, CURSOR_START, 10);
    assert.deepEqual(plan.ips, ['10.0.0.1', '10.0.0.2', '10.0.3.1', '10.0.3.2']);
    assert.equal(plan.reachesEnd, true);
  });

  test('recorrido completo por chunks de 3 cubre cada IP exactamente una vez', () => {
    const seen: string[] = [];
    let cursor = CURSOR_START;
    for (let i = 0; i < 10; i++) {
      const plan = planChunk(RANGES, cursor, 3);
      seen.push(...plan.ips);
      cursor = plan.next;
      if (plan.reachesEnd) break;
    }
    assert.equal(seen.length, 10);
    assert.equal(new Set(seen).size, 10);
    assert.deepEqual(cursor, CURSOR_START, 'al cerrar la vuelta el cursor vuelve al principio');
  });
});

describe('DiscoveryCursor — advanceCursor (consumo parcial por time-box)', () => {
  test('consumo parcial deja el cursor exactamente donde se cortó', () => {
    const { next, lapComplete } = advanceCursor(RANGES, CURSOR_START, 2);
    assert.deepEqual(next, { rangeIdx: 0, offset: 2 });
    assert.equal(lapComplete, false);
  });

  test('consumir justo hasta el borde de un rango salta al siguiente sin cerrar vuelta', () => {
    const { next, lapComplete } = advanceCursor(RANGES, CURSOR_START, 5);
    assert.deepEqual(next, { rangeIdx: 1, offset: 0 });
    assert.equal(lapComplete, false);
  });

  test('consumir todo el espacio cierra la vuelta y vuelve al inicio', () => {
    const { next, lapComplete } = advanceCursor(RANGES, CURSOR_START, 10);
    assert.deepEqual(next, CURSOR_START);
    assert.equal(lapComplete, true);
  });

  test('pedir más de lo que queda no da dos vueltas: cierra una sola', () => {
    const { next, lapComplete } = advanceCursor(RANGES, CURSOR_START, 999);
    assert.deepEqual(next, CURSOR_START);
    assert.equal(lapComplete, true);
  });

  test('consumo 0 deja el cursor intacto', () => {
    const { next, lapComplete } = advanceCursor(RANGES, { rangeIdx: 1, offset: 1 }, 0);
    assert.deepEqual(next, { rangeIdx: 1, offset: 1 });
    assert.equal(lapComplete, false);
  });

  test('sin rangos: cuenta como vuelta cerrada', () => {
    assert.deepEqual(advanceCursor([], CURSOR_START, 5), { next: CURSOR_START, lapComplete: true });
  });

  test('avanzar sobre un /8 es O(rangos): no itera 16M veces', () => {
    const big = [R('10.0.0.0', '10.255.255.255')];
    const started = Date.now();
    const { next } = advanceCursor(big, CURSOR_START, 16_000_000);
    assert.deepEqual(next, { rangeIdx: 0, offset: 16_000_000 });
    assert.ok(Date.now() - started < 50, 'debe resolverse con aritmética, no recorriendo IPs');
  });

  test('planChunk + advanceCursor coinciden cuando se consume el chunk entero', () => {
    const plan = planChunk(RANGES, CURSOR_START, 7);
    const { next } = advanceCursor(RANGES, CURSOR_START, plan.ips.length);
    assert.deepEqual(next, plan.next);
  });
});

describe('DiscoveryCursor — fingerprint', () => {
  test('mismo espacio declarado: misma huella', () => {
    assert.equal(fingerprintRanges(RANGES), fingerprintRanges([...RANGES]));
  });

  test('cambiar un límite cambia la huella (el cursor guardado ya no significa lo mismo)', () => {
    const changed = [R('10.0.0.1', '10.0.0.6'), RANGES[1], RANGES[2]];
    assert.notEqual(fingerprintRanges(RANGES), fingerprintRanges(changed));
  });

  test('reordenar los rangos cambia la huella (cambia el orden de recorrido)', () => {
    assert.notEqual(fingerprintRanges(RANGES), fingerprintRanges([RANGES[1], RANGES[0], RANGES[2]]));
  });

  test('cambiar credenciales o etiqueta NO cambia la huella: no se pierde el progreso de la vuelta', () => {
    const base = fingerprintRanges(RANGES);
    const relabeled = RANGES.map((r, i) => ({ ...r, label: `sede ${i}`, credential_ids: ['cred-1'] }));
    assert.equal(fingerprintRanges(relabeled), base);
  });
});
