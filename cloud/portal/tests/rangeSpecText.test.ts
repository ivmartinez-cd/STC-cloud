// Edición fila por fila de rangos IP (`lib/rangeSpecText.ts`) — lógica pura
// del editor denso (tab Segmentos). Ejecutar desde la raíz del repo:
//   npx tsx --test cloud/portal/tests/rangeSpecText.test.ts
//
// Vive fuera de `portal/src` por el mismo motivo que `parseRanges.test.ts`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySpecText, firstRangeProblem, parseSingleSpec, rangeToText, specProblem, summaryText,
} from '../src/features/monitors/lib/rangeSpecText';
import type { IpRange } from '../src/shared/types/agents';

describe('parseSingleSpec — una entrada tipeada a mano', () => {
  test('infiere el tipo igual que el pegado', () => {
    assert.deepEqual(parseSingleSpec('10.0.1.1-10.0.1.254'), { range: { start: '10.0.1.1', end: '10.0.1.254' } });
    assert.deepEqual(parseSingleSpec('10.0.2.0/24'), { range: { cidr: '10.0.2.0/24' } });
    assert.deepEqual(parseSingleSpec('10.0.3.7'), { range: { start: '10.0.3.7', end: '10.0.3.7' } });
    assert.deepEqual(parseSingleSpec('impresora-piso3.corp.local'), { range: { hostname: 'impresora-piso3.corp.local' } });
  });

  test('normaliza espacios alrededor del guión y guión largo', () => {
    assert.deepEqual(parseSingleSpec('  10.0.1.1 – 10.0.1.9 '), { range: { start: '10.0.1.1', end: '10.0.1.9' } });
  });

  test('vacío y dos entradas en una fila son errores distintos', () => {
    assert.deepEqual(parseSingleSpec('   '), { error: 'vacío' });
    const two = parseSingleSpec('10.0.1.0/24, 10.0.2.0/24');
    assert.ok('error' in two && two.error.includes('una sola entrada'));
  });

  test('un rango a medio tipear es error, no hostname', () => {
    const half = parseSingleSpec('10.0.1.1-10.0.1.');
    assert.ok('error' in half);
  });
});

describe('rangeToText — inverso del parser', () => {
  test('ida y vuelta para cada forma válida', () => {
    for (const text of ['10.0.1.1-10.0.1.254', '10.0.2.0/24', '10.0.3.7', 'host.corp.local']) {
      const parsed = parseSingleSpec(text);
      assert.ok('range' in parsed);
      assert.equal(rangeToText(parsed.range), text);
    }
  });

  test('una entrada a medio tipear vuelve tal cual quedó', () => {
    assert.equal(rangeToText({ start: '10.0.1.1-10.0.', end: '' }), '10.0.1.1-10.0.');
    assert.equal(rangeToText({ start: '', end: '' }), '');
  });
});

describe('applySpecText — reemplaza la forma, conserva el resto', () => {
  const base: IpRange = { start: '10.0.1.1', end: '10.0.1.254', label: 'Piso 3', enabled: false, exclude: ['10.0.1.5'], credential_ids: ['c1'] };

  test('rango → CIDR conserva etiqueta, enabled, exclusiones y credenciales', () => {
    const next = applySpecText(base, '10.0.1.0/24');
    assert.equal(next.cidr, '10.0.1.0/24');
    assert.equal(next.start, undefined);
    assert.equal(next.end, undefined);
    assert.equal(next.label, 'Piso 3');
    assert.equal(next.enabled, false);
    assert.deepEqual(next.exclude, ['10.0.1.5']);
    assert.deepEqual(next.credential_ids, ['c1']);
  });

  test('rango → hostname tira las exclusiones (no aplican) y conserva credenciales', () => {
    const next = applySpecText(base, 'impresora.corp.local');
    assert.equal(next.hostname, 'impresora.corp.local');
    assert.equal(next.exclude, undefined);
    assert.deepEqual(next.credential_ids, ['c1']);
  });

  test('texto inválido queda como borrador en start con end vacío', () => {
    const next = applySpecText(base, '10.0.1.1-10.0.1.');
    assert.equal(next.start, '10.0.1.1-10.0.1.');
    assert.equal(next.end, '');
    assert.equal(next.cidr, undefined);
    assert.equal(next.hostname, undefined);
    assert.equal(next.label, 'Piso 3');
  });

  test('el JSON del PUT no arrastra claves undefined', () => {
    const next = applySpecText(base, '10.0.1.0/24');
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(next))).sort(), ['cidr', 'credential_ids', 'enabled', 'exclude', 'label']);
  });
});

describe('specProblem / firstRangeProblem — validación previa al PUT', () => {
  test('vacío no es problema de fila (placeholder), pero sí bloquea el guardado', () => {
    assert.equal(specProblem(''), null);
    assert.equal(firstRangeProblem([{ start: '', end: '' }]), 'El rango 1 está vacío: completalo o borralo.');
  });

  test('numera la fila con el problema entre muchas válidas', () => {
    const ranges: IpRange[] = [
      { cidr: '10.0.1.0/24' }, { start: '10.0.2.1', end: '10.0.2.254' }, { start: '10.0.3.9-10.0.3', end: '' }, { hostname: 'ok.local' },
    ];
    const problem = firstRangeProblem(ranges);
    assert.ok(problem?.startsWith('Rango 3: '));
    assert.equal(firstRangeProblem(ranges.filter((_, i) => i !== 2)), null);
  });

  test('un rango guardado con inicio mayor que fin se marca inválido', () => {
    assert.ok(specProblem('10.0.1.200-10.0.1.1')?.includes('mayor'));
  });
});

describe('summaryText — resumen de la lista', () => {
  test('lista vacía y lista sin IPs declaradas', () => {
    assert.equal(summaryText([]), '0 rangos · sin IPs declaradas');
    assert.equal(summaryText([{ start: '', end: '' }]), '1 rango · sin IPs declaradas');
  });

  test('con un rango apagado muestra lo barrido y lo declarado', () => {
    const ranges: IpRange[] = [{ cidr: '10.0.1.0/24' }, { cidr: '10.0.2.0/24', enabled: false }];
    assert.equal(summaryText(ranges), '2 rangos (1 deshabilitado) · 256 IPs a barrer de 512 declaradas · vuelta estimada ~1 min');
  });

  test('usa el formateador inyectado para los números', () => {
    const text = summaryText([{ cidr: '10.0.0.0/16' }], (n) => n.toLocaleString('es-AR'));
    assert.ok(text.includes('65.536 IPs'));
  });
});
