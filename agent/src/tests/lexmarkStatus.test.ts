// Lexmark `PrinterStatus.html` — dos equipos REALES de la flota traídos por
// el túnel EWS el 15/09/2026, los dos con la consola en español:
//   MX611dhe (ISSN)     dice "Cartucho negro ~100%"  → el parser viejo daba {}
//   X656de   (Canal D.) dice "Tóner negro 100%"      → el viejo sí lo tomaba
// Ejecutar: npx tsx --test src/tests/lexmarkStatus.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildLexmarkStatusSupplies, parseLexmarkSupplyInfo, parseLexmarkTonerLevels,
} from '../snmp/ews-parsers/lexmark-status';
import { parseLexmarkPrinterStatus } from '../snmp/ews-parsers/lexmark';

const FIX = path.join(__dirname, 'fixtures', 'lexmark');
const mx611 = fs.readFileSync(path.join(FIX, 'printerstatus-mx611dhe-es.html'), 'utf8');
const x656 = fs.readFileSync(path.join(FIX, 'printerstatus-x656de-es.html'), 'utf8');

describe('El nivel no depende de que la fila diga "tóner" o "cartucho"', () => {
  test('MX611dhe ("Cartucho negro ~100%") — el caso que el parser viejo perdía', () => {
    assert.deepEqual(parseLexmarkTonerLevels(mx611), { black: 100 });
  });

  test('X656de ("Tóner negro 100%")', () => {
    assert.deepEqual(parseLexmarkTonerLevels(x656), { black: 100 });
  });

  test('el "5% de cobertura" del rendimiento no se cuela como nivel de un color', () => {
    const levels = parseLexmarkTonerLevels(mx611);
    assert.equal(Object.keys(levels).length, 1, JSON.stringify(levels));
  });
});

describe('Tabla de resumen — rendimiento, unidad de imagen y kit', () => {
  test('MX611dhe: los tres datos que hoy no captura ninguna otra fuente', () => {
    assert.deepEqual(parseLexmarkSupplyInfo(mx611), {
      cartridgeYield: 20_000, imagingUnitPct: 22, maintenanceKitPct: 72,
    });
  });

  test('X656de: no tiene unidad de imagen y eso queda en null, no en 0', () => {
    const info = parseLexmarkSupplyInfo(x656);
    assert.equal(info.cartridgeYield, 25_000);
    assert.equal(info.maintenanceKitPct, 90);
    assert.equal(info.imagingUnitPct, null);
  });

  test('el rendimiento sale del número de 4+ cifras, no de la velocidad ni del %', () => {
    // "Hasta 50 Páginas/minuto" y "5% de cobertura" conviven en la misma tabla.
    assert.equal(parseLexmarkSupplyInfo(mx611).cartridgeYield, 20_000);
  });
});

describe('suppliesDetails armado', () => {
  test('el rendimiento se aplica al negro y deriva las páginas restantes', () => {
    const d = buildLexmarkStatusSupplies(mx611)!;
    assert.equal(d.toners.black?.capacity, 20_000);
    assert.equal(d.toners.black?.remainingPages, 20_000); // 100%
    assert.equal(d.drums.black?.percentage, 22);
  });

  test('no inventa SKU ni serie: Lexmark no los publica por EWS', () => {
    const black = buildLexmarkStatusSupplies(mx611)!.toners.black;
    assert.equal(black?.code, null);
    assert.equal(black?.serial, null);
  });

  test('una página que no es PrinterStatus devuelve null', () => {
    assert.equal(buildLexmarkStatusSupplies('<html><body>nada</body></html>'), null);
  });
});

describe('parseLexmarkPrinterStatus — la entrada que usa la familia', () => {
  test('MX611dhe ya no devuelve {} y trae el detalle completo', () => {
    const p = parseLexmarkPrinterStatus(mx611);
    assert.equal(p.tonerBlack, 100);
    assert.equal(p.suppliesDetails?.toners?.black?.capacity, 20_000);
    assert.equal(p.suppliesDetails?.drums?.black?.percentage, 22);
    const other = p.suppliesDetails?.maintenance?.other ?? [];
    assert.equal(other[0]?.percentage, 72);
  });

  test('X656de sigue andando (no se rompió lo que ya funcionaba)', () => {
    const p = parseLexmarkPrinterStatus(x656);
    assert.equal(p.tonerBlack, 100);
    assert.equal(p.suppliesDetails?.toners?.black?.capacity, 25_000);
  });

  test('HTML vacío → {}', () => {
    assert.deepEqual(parseLexmarkPrinterStatus('<html></html>'), {});
  });
});
