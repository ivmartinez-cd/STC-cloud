// Lectura estructurada de `suppliesView.sws` (Samsung XOA / Solution Web
// Service). Fixtures reales: un M5370LX mono sirviendo la página EN COREANO
// (el caso que rompía el raspado por etiquetas) y un X4300LX color.
// Ejecutar: npx tsx --test src/tests/samsungSwsSupplies.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSwsSuppliesDetails, parseSwsMaintenance, parseSwsSupplyBlocks, swsNumber,
} from '../snmp/ews-parsers/samsung/sws-supplies';
import { parseSamsungSolutionSupplies } from '../snmp/ews-parsers/samsung';

const FIX = path.join(__dirname, 'fixtures', 'samsung-sws');
const mono = fs.readFileSync(path.join(FIX, 'suppliesView-m5370lx-ko.html'), 'utf8');
const color = fs.readFileSync(path.join(FIX, 'suppliesView-x4300lx.html'), 'utf8');
// Capturado de un M458x REAL de ISSN por el túnel EWS (15/09/2026): mismo
// firmware SWS pero con dos diferencias que ningún otro fixture tenía —
// informa "0 K" de capacidad y expone los rodillos de retardo.
const m458x = fs.readFileSync(path.join(FIX, 'suppliesView-m458x-ko.html'), 'utf8');

describe('swsNumber — "30 K" es 30.000 páginas, no 30', () => {
  test('sufijo K y M', () => {
    assert.equal(swsNumber('30 K'), 30_000);
    assert.equal(swsNumber('100 K'), 100_000);
    assert.equal(swsNumber('1.5 M'), 1_500_000);
  });

  test('número suelto con texto localizado alrededor', () => {
    assert.equal(swsNumber('3111 면 인쇄'), 3111);
    assert.equal(swsNumber('16,739 impression(s)'), 16_739);
  });

  test('vacío o sin dígitos → null, nunca 0', () => {
    assert.equal(swsNumber(''), null);
    assert.equal(swsNumber(undefined), null);
    assert.equal(swsNumber('설치되어 있지 않음.'), null);
  });
});

describe('M5370LX mono en coreano — el idioma no cambia lo que se extrae', () => {
  const blocks = parseSwsSupplyBlocks(mono);

  test('encuentra exactamente el tóner y el tambor, y no las secciones sueltas', () => {
    assert.deepEqual(blocks.map((b) => b.kind), ['toner', 'drum']);
    assert.deepEqual(blocks.map((b) => b.color), ['black', 'black']);
  });

  test('el tóner trae los cinco campos que el raspado por texto perdía', () => {
    assert.deepEqual(blocks[0].item, {
      percentage: 85, status: 'Ready', code: 'MLT-D358S', serial: 'CRUM-24121814413',
      capacity: 30_000, printed: 3111, remainingPages: 25_500,
    });
  });

  test('el model ID no se confunde con el nivel aunque compartan el id `remainCont`', () => {
    assert.equal(blocks[0].item.code, 'MLT-D358S');
    assert.equal(blocks[0].item.percentage, 85);
  });

  test('el tambor sale como tambor (id `blackImagingCapacity`), no como segundo tóner', () => {
    assert.equal(blocks[1].item.code, 'MLT-R358');
    assert.equal(blocks[1].item.capacity, 100_000);
    assert.equal(blocks[1].item.printed, 16_739);
  });

  test('mantenimiento: vida útil como "restante", no como "usado"', () => {
    const { slots, other, wasteTonerStatus } = parseSwsMaintenance(mono);
    assert.deepEqual(slots.fuser, { percentage: 99, capacity: 250_000, printed: 1494 });
    assert.deepEqual(slots.transferRoller, { percentage: 87, capacity: 125_000, printed: 16_735 });
    assert.deepEqual(slots.mpTrayRoller, { percentage: 100, capacity: 100_000, printed: 0 });
    // 96834/100000 usadas ⇒ queda 3%, no 97%.
    assert.equal(other.find((o) => /retardo/i.test(o.name))?.percentage, 3);
    assert.ok(wasteTonerStatus, 'el depósito de residuos informa estado aunque no informe nivel');
  });

  test('los accesorios no instalados no inventan un consumible', () => {
    const { other } = parseSwsMaintenance(mono);
    assert.equal(other.some((o) => /grapa|staple|punch/i.test(o.name)), false);
  });
});

describe('X4300LX color — cuatro tóners y cuatro tambores, por color', () => {
  const details = buildSwsSuppliesDetails(color)!;

  test('el color sale del medidor, no del título localizado', () => {
    assert.deepEqual(Object.keys(details.toners).sort(), ['black', 'cyan', 'magenta', 'yellow']);
    assert.deepEqual(Object.keys(details.drums).sort(), ['black', 'cyan', 'magenta', 'yellow']);
  });

  test('cada tóner tiene su propio SKU y su propia serie', () => {
    assert.equal(details.toners.black?.code, 'CLT-K808S');
    assert.equal(details.toners.cyan?.code, 'CLT-C808S');
    assert.equal(details.toners.magenta?.code, 'CLT-M808S');
    assert.equal(details.toners.yellow?.code, 'CLT-Y808S');
    const serials = Object.values(details.toners).map((t) => t?.serial);
    assert.equal(new Set(serials).size, 4, 'ningún cartucho hereda la serie de otro');
  });

  test('el negro rinde más que los de color (23 K vs 20 K)', () => {
    assert.equal(details.toners.black?.capacity, 23_000);
    assert.equal(details.toners.cyan?.capacity, 20_000);
  });
});

describe('parseSamsungSolutionSupplies — integra lo estructurado sin romper lo viejo', () => {
  test('el resultado final del M5370LX llega con SKU, serie, capacidad e impresiones', () => {
    const out = parseSamsungSolutionSupplies(mono);
    assert.equal(out.tonerBlack, 85);
    const black = out.suppliesDetails?.toners?.black;
    assert.equal(black?.code, 'MLT-D358S');
    assert.equal(black?.serial, 'CRUM-24121814413');
    assert.equal(black?.capacity, 30_000);
    assert.equal(black?.printed, 3111);
    assert.equal(black?.remainingPages, 25_500);
  });

  test('un HTML sin los `id` estructurados no revienta ni devuelve basura', () => {
    assert.deepEqual(parseSamsungSolutionSupplies('<html><body>nada</body></html>'), {});
    assert.deepEqual(parseSwsSupplyBlocks(''), []);
    assert.equal(buildSwsSuppliesDetails('<html></html>'), null);
  });
});

describe('M458x real (ISSN) — el que no se podía verificar sin el túnel EWS', () => {
  const details = buildSwsSuppliesDetails(m458x)!;

  test('sirve la misma tabla SWS: tóner y tambor con SKU y serie propios', () => {
    assert.equal(details.toners.black?.percentage, 92);
    assert.equal(details.toners.black?.code, 'MLT-D303E');
    assert.equal(details.toners.black?.serial, 'CRUM-18030993855');
    assert.equal(details.toners.black?.printed, 2433);
    assert.equal(details.drums.black?.code, 'MLT-R303');
    assert.equal(details.drums.black?.serial, 'CRUM-23041805246');
  });

  test('"0 K" de capacidad es SIN DATO, no cero — y no genera 0 páginas restantes', () => {
    assert.equal(details.toners.black?.capacity, null);
    assert.equal(details.toners.black?.remainingPages, null);
    assert.equal(details.drums.black?.capacity, null);
  });

  test('un 0 real (rodillo sin uso) sigue siendo 0, no se confunde con "sin dato"', () => {
    const mt = details.maintenance as Record<string, { printed?: number | null; percentage?: number | null }>;
    assert.equal(mt.mpTrayRoller?.printed, 0);
    assert.equal(mt.mpTrayRoller?.percentage, 100);
  });

  test('los rodillos de retardo caen en su slot con nombre, no en `other`', () => {
    const mt = details.maintenance as Record<string, { capacity?: number | null }>;
    assert.equal(mt.tray1RetardRoller?.capacity, 100_000);
    assert.equal(mt.mpTrayRetardRoller?.capacity, 100_000);
    const other = (details.maintenance.other ?? []) as Array<{ name: string }>;
    assert.equal(other.some((o) => /retardo bandeja/i.test(o.name)), false);
  });
});
