// Parseo de la carga masiva de rangos IP del portal — lógica pura, sin React,
// sin DOM, sin red. Ejecutar desde la raíz del repo:
//   npx tsx --test cloud/portal/tests/parseRanges.test.ts
//
// Vive fuera de `portal/src` a propósito: ese árbol lo typechequea
// `tsconfig.app.json` con `types: ["vite/client"]` (sin @types/node), así que
// un `import 'node:test'` ahí adentro rompería `npm run check` del portal.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRanges, capWarnings, countDeclaredIps, countTotalDeclaredIps,
  estimateLapSeconds, formatLapDuration, isRangeEnabled, splitTokens,
  MAX_SPECS, MAX_TOTAL_DECLARED_IPS,
} from '../src/features/monitors/lib/parseRanges';
import type { IpRange } from '../src/shared/types/agents';

/** Formato real del export del sistema viejo: un /24 por sucursal, `.1` a
 *  `.254`, todo en un solo string separado por comas. */
const BASES = [
  '10.10.7', '10.7.7', '10.101.7', '10.102.7', '10.103.7', '10.104.7', '10.105.7',
  '10.106.7', '10.107.7', '10.108.7', '10.11.7', '10.12.7', '10.13.7', '10.14.7',
  '10.15.7', '10.16.7', '10.17.7', '10.18.7', '10.19.7', '10.20.7', '10.21.7',
  '10.22.7', '10.23.7', '10.24.7', '10.25.7', '10.26.7', '10.27.7', '10.28.7',
  '10.29.7', '10.30.7', '10.31.7', '10.32.7', '10.33.7', '10.34.7', '10.35.7',
  '10.36.7', '10.37.7', '10.38.7', '10.39.7', '10.40.7', '10.41.7', '10.42.7',
  '10.43.7', '10.44.7', '10.45.7', '10.46.7', '10.47.7', '10.48.7', '10.49.7',
  '10.50.7', '192.168.1', '192.168.2', '192.168.3', '192.168.4', '192.168.5',
  '192.168.10', '192.168.20', '172.16.4', '172.16.5',
];
const UNIQUE_RANGES = BASES.map((b) => `${b}.1-${b}.254`);
/** Las 7 entradas que venían repetidas exactas en el string original. */
const DUPLICATED_AT = new Set([0, 3, 12, 25, 40, 51, 58]);
const REAL_PASTE = UNIQUE_RANGES
  .flatMap((r, i) => (DUPLICATED_AT.has(i) ? [r, r] : [r]))
  .join(',');

describe('parseRanges — string real del cliente', () => {
  test('el fixture son 66 entradas con 59 únicas', () => {
    assert.equal(BASES.length, 59);
    assert.equal(new Set(BASES).size, 59);
    assert.equal(REAL_PASTE.split(',').length, 66);
  });

  test('66 entradas → 59 válidas, 7 duplicadas, 0 inválidas', () => {
    const result = parseRanges(REAL_PASTE);
    assert.equal(result.valid.length, 59);
    assert.equal(result.duplicates.length, 7);
    assert.deepEqual(result.invalid, []);
    assert.deepEqual(result.valid[0], { start: '10.10.7.1', end: '10.10.7.254' });
  });

  test('total de IPs declaradas y vuelta estimada', () => {
    const result = parseRanges(REAL_PASTE);
    assert.equal(result.totalIps, 59 * 254);
    // (14986 / 10) * 2 s ≈ 2997 s ≈ 50 min
    assert.equal(result.estimatedLapSeconds, (59 * 254 / 10) * 2);
    assert.equal(formatLapDuration(result.totalIps), '50 min');
  });

  test('pegar dos veces el mismo export no agrega nada (dedupe contra lo cargado)', () => {
    const first = parseRanges(REAL_PASTE);
    const second = parseRanges(REAL_PASTE, first.valid);
    assert.equal(second.valid.length, 0);
    assert.equal(second.duplicates.length, 66);
  });
});

describe('parseRanges — formatos aceptados', () => {
  test('CIDR', () => {
    const result = parseRanges('10.10.7.0/24');
    assert.deepEqual(result.valid, [{ cidr: '10.10.7.0/24' }]);
    assert.equal(result.totalIps, 256);
  });

  test('IP suelta → rango de una sola IP', () => {
    const result = parseRanges('10.10.7.5');
    assert.deepEqual(result.valid, [{ start: '10.10.7.5', end: '10.10.7.5' }]);
    assert.equal(result.totalIps, 1);
  });

  test('hostname', () => {
    const result = parseRanges('impresora.corp.local, impresora-piso3.corp');
    assert.deepEqual(result.valid, [{ hostname: 'impresora.corp.local' }, { hostname: 'impresora-piso3.corp' }]);
    assert.equal(result.totalIps, 2);
  });

  test('separadores: coma, salto de línea, punto y coma y espacios', () => {
    const result = parseRanges('10.0.0.1\n10.0.0.2;10.0.0.3 10.0.0.4,10.0.0.5');
    assert.equal(result.valid.length, 5);
    assert.deepEqual(result.invalid, []);
  });

  test('un guión con espacios alrededor sigue siendo un rango', () => {
    assert.deepEqual(splitTokens('10.0.0.1 - 10.0.0.9'), ['10.0.0.1-10.0.0.9']);
    const result = parseRanges('10.0.0.1 - 10.0.0.9');
    assert.deepEqual(result.valid, [{ start: '10.0.0.1', end: '10.0.0.9' }]);
  });

  test('un pegado con viñetas por línea no termina en un token gigante', () => {
    // Caso real: la lista llega copiada de un mail o de un doc. Como el guión
    // se colapsa con los espacios de alrededor (`\n- ` → `-`), sin limpiar las
    // viñetas primero las 59 líneas se pegan en una sola entrada inválida.
    const pegado = '- 10.10.7.1-10.10.7.254\n- 10.7.7.1 - 10.7.7.254\n  * 10.101.7.0/24\n• impresora-piso3.corp.local';
    assert.deepEqual(splitTokens(pegado), [
      '10.10.7.1-10.10.7.254', '10.7.7.1-10.7.7.254', '10.101.7.0/24', 'impresora-piso3.corp.local',
    ]);
    const result = parseRanges(pegado);
    assert.equal(result.valid.length, 4);
    assert.deepEqual(result.invalid, []);
  });

  test('el guión largo (Word/Docs, y la propia ficha del portal) separa igual que el corto', () => {
    // Word y Google Docs autocorrigen ` - ` a ` – `, y `subredBarrida()` en
    // `MonitorSpecsCard` escribe los rangos así. Sin normalizarlo el rango se
    // parte en dos IPs sueltas + un token basura: "2 válidos" y 252 IPs perdidas.
    assert.deepEqual(splitTokens('10.0.0.1 – 10.0.0.254'), ['10.0.0.1-10.0.0.254']);
    assert.deepEqual(parseRanges('10.0.0.1 – 10.0.0.254').valid, [{ start: '10.0.0.1', end: '10.0.0.254' }]);
    assert.deepEqual(parseRanges('10.0.0.1—10.0.0.9').valid, [{ start: '10.0.0.1', end: '10.0.0.9' }]);
    assert.equal(countTotalDeclaredIps(parseRanges('10.0.0.1 – 10.0.0.254').valid), 254);
  });

  test('un guión largo SIN espacio al principio de línea tampoco es viñeta', () => {
    // Mismo guard que con el guión corto: se normaliza a `-10.0.0.1-...`, que
    // no es un rango válido, en vez de colarse como uno bueno.
    assert.equal(parseRanges('–10.0.0.1-10.0.0.9').valid.length, 0);
  });

  test('un guión SIN espacio después NO es viñeta', () => {
    // Si la limpieza no exigiera el espacio, `-10.0.0.1-10.0.0.9` se leería
    // como el rango válido `10.0.0.1-10.0.0.9` y el typo entraría en silencio.
    assert.deepEqual(splitTokens('-10.0.0.1-10.0.0.9'), ['-10.0.0.1-10.0.0.9']);
    assert.equal(parseRanges('-10.0.0.1-10.0.0.9').valid.length, 0);
  });

  test('CIDR y rango equivalentes se deduplican (barren las mismas IPs)', () => {
    const result = parseRanges('10.0.1.0/24, 10.0.1.0-10.0.1.255');
    assert.equal(result.valid.length, 1);
    assert.deepEqual(result.duplicates, ['10.0.1.0-10.0.1.255']);
  });

  test('un CIDR con IP de host es el mismo bloque que su IP de red', () => {
    const result = parseRanges('10.0.1.5/24', [{ cidr: '10.0.1.0/24' }]);
    assert.equal(result.valid.length, 0);
    assert.equal(result.duplicates.length, 1);
  });
});

describe('parseRanges — entradas inválidas', () => {
  test('basura mezclada con rangos buenos: sólo cae la basura', () => {
    const result = parseRanges('¿¿??, 10.0.0.1-10.0.0.5, hola mundo!, 10.0.0.9');
    assert.deepEqual(result.invalid.map((i) => i.text), ['¿¿??', 'mundo!']);
    assert.deepEqual(result.valid, [
      { start: '10.0.0.1', end: '10.0.0.5' },
      // "hola" es un hostname corto válido (DNS/mDNS local), no basura.
      { hostname: 'hola' },
      { start: '10.0.0.9', end: '10.0.0.9' },
    ]);
  });

  test('rango invertido', () => {
    const result = parseRanges('10.0.0.9-10.0.0.1');
    assert.equal(result.valid.length, 0);
    assert.equal(result.invalid[0].text, '10.0.0.9-10.0.0.1');
    assert.match(result.invalid[0].reason, /inicio es mayor/);
  });

  test('octeto > 255', () => {
    const result = parseRanges('10.0.0.300, 10.0.0.1-10.0.0.300, 999.1.1.1/24');
    assert.equal(result.valid.length, 0);
    assert.equal(result.invalid.length, 3);
    assert.deepEqual(result.invalid.map((i) => i.text), ['10.0.0.300', '10.0.0.1-10.0.0.300', '999.1.1.1/24']);
  });

  test('una IP incompleta NO pasa como hostname', () => {
    const result = parseRanges('10.10.7');
    assert.equal(result.valid.length, 0);
    assert.equal(result.invalid.length, 1);
  });

  test('un rango con guión de más NO pasa como hostname', () => {
    // El regex RFC 1123 acepta `10.0.0.1--10.0.0.9` (labels `1--10`, sin guión
    // al principio ni al final) y el cloud también: si el portal lo dejara
    // pasar se guardaría como hostname, el agente nunca lo resolvería y esas
    // 254 IPs dejarían de barrerse en silencio.
    const result = parseRanges('10.0.0.1--10.0.0.9, 10.0.0.1-10.0.0.5-10.0.0.9');
    assert.deepEqual(result.valid, []);
    assert.deepEqual(result.invalid.map((i) => i.text), ['10.0.0.1--10.0.0.9', '10.0.0.1-10.0.0.5-10.0.0.9']);
    assert.match(result.invalid[0].reason, /mal formado/);
  });

  test('el doble guión que genera el colapso de espacios tampoco pasa', () => {
    assert.deepEqual(splitTokens('10.0.0.1 - - 10.0.0.9'), ['10.0.0.1--10.0.0.9']);
    assert.equal(parseRanges('10.0.0.1 - - 10.0.0.9').valid.length, 0);
  });

  test('un hostname con guiones sigue siendo válido (tiene letras)', () => {
    const result = parseRanges('impresora-piso3-ala-norte.corp.local');
    assert.deepEqual(result.valid, [{ hostname: 'impresora-piso3-ala-norte.corp.local' }]);
  });

  test('el texto original se preserva para poder mostrarlo', () => {
    const result = parseRanges('10.0.0.1-10.0.0.300');
    assert.equal(result.invalid[0].text, '10.0.0.1-10.0.0.300');
  });

  test('texto vacío o sólo separadores', () => {
    const result = parseRanges('  ,\n ; ');
    assert.deepEqual(result, { valid: [], invalid: [], duplicates: [], totalIps: 0, estimatedLapSeconds: 0 });
  });
});

describe('countDeclaredIps / vuelta estimada', () => {
  test('rango, CIDR, hostname y entrada a medio editar', () => {
    assert.equal(countDeclaredIps({ start: '10.0.0.1', end: '10.0.0.254' }), 254);
    assert.equal(countDeclaredIps({ cidr: '10.0.1.0/24' }), 256);
    assert.equal(countDeclaredIps({ hostname: 'impresora.corp' }), 1);
    assert.equal(countDeclaredIps({ start: '', end: '' }), 0);
    assert.equal(countDeclaredIps({ start: '10.0.0.9', end: '10.0.0.1' }), 0);
  });

  test('las exclusiones no descuentan (el tope del cloud es sobre lo declarado)', () => {
    assert.equal(countDeclaredIps({ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.5'] }), 10);
  });

  test('fórmula del contrato: (totalIps / 10) * 2 s', () => {
    assert.equal(estimateLapSeconds(1000), 200);
    assert.equal(formatLapDuration(0), 'menos de 1 min');
    assert.equal(formatLapDuration(3000), '10 min');
    assert.equal(formatLapDuration(18_000), '1 h');
    assert.equal(formatLapDuration(20_000), '1 h 7 min');
  });
});

describe('enabled y avisos de tope', () => {
  const ranges: IpRange[] = [
    { start: '10.0.0.1', end: '10.0.0.10' },
    { start: '10.0.1.1', end: '10.0.1.10', enabled: true },
    { start: '10.0.2.1', end: '10.0.2.10', enabled: false },
  ];

  test('ausente o true = habilitado; false = apagado', () => {
    assert.deepEqual(ranges.map(isRangeEnabled), [true, true, false]);
  });

  test('un rango apagado no cuesta tiempo de barrido', () => {
    assert.equal(countTotalDeclaredIps(ranges), 30);
    assert.equal(countTotalDeclaredIps(ranges.filter(isRangeEnabled)), 20);
  });

  test('sin avisos con la lista real de 59 rangos (~50 min)', () => {
    assert.deepEqual(capWarnings(parseRanges(REAL_PASTE).valid), []);
  });

  test('un /16 avisa por vuelta larga pero no supera el tope de IPs', () => {
    const warnings = capWarnings([{ cidr: '10.9.0.0/16' }]);
    assert.equal(countDeclaredIps({ cidr: '10.9.0.0/16' }), MAX_TOTAL_DECLARED_IPS);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /vuelta completa/);
  });

  test('pasado el tope de IPs declaradas avisa que el cloud lo va a rechazar', () => {
    const warnings = capWarnings([{ cidr: '10.9.0.0/16' }, { start: '10.8.0.1', end: '10.8.0.10' }]);
    assert.equal(warnings.filter((w) => /supera el tope/.test(w)).length, 1);
  });

  test('un rango apagado no alarga la vuelta pero sí ocupa lugar en el tope', () => {
    const big: IpRange[] = [{ cidr: '10.9.0.0/16', enabled: false }, { start: '10.8.0.1', end: '10.8.0.10' }];
    const warnings = capWarnings(big);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /supera el tope/);
  });

  test('pasado el tope de rangos avisa que el cloud lo va a rechazar', () => {
    const many: IpRange[] = Array.from({ length: MAX_SPECS + 1 }, (_, i) => ({
      start: `10.${Math.floor(i / 256)}.${i % 256}.1`, end: `10.${Math.floor(i / 256)}.${i % 256}.1`,
    }));
    const warnings = capWarnings(many);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /257 rangos\/CIDR supera el tope de 256/);
    // Los hostnames son un pool aparte: no descuentan del de rangos.
    assert.deepEqual(capWarnings([...many, { hostname: 'impresora.corp' }]), warnings);
  });

  test('el tope de hostnames es un pool separado del de rangos', () => {
    const hostnames: IpRange[] = Array.from({ length: 33 }, (_, i) => ({ hostname: `impresora-${i}.corp` }));
    const warnings = capWarnings(hostnames);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /hostnames supera el tope de 32/);
  });
});
