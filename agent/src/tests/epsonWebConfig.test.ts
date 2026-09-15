// Epson Web Config (WF-C5891 real de Canal Directo, capturado por el túnel EWS
// el 15/09/2026 — la consola la sirve EN ESPAÑOL).
// Ejecutar: npx tsx --test src/tests/epsonWebConfig.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  levelFromGradient, parseEpsonCounters, parseEpsonPrtInfo, parseEpsonTanks,
} from '../snmp/ews-parsers/epson';
import { resolve } from '../capture/registry';
import { detectBrandFromOid, detectBrandFromText } from '../snmp/oids';

const FIX = path.join(__dirname, 'fixtures', 'epson');
const prtInfo = fs.readFileSync(path.join(FIX, 'prtinfo-wf-c5891-es.html'), 'utf8');
const mentInfo = fs.readFileSync(path.join(FIX, 'mentinfo-wf-c5891-es.html'), 'utf8');

describe('Epson como marca — antes caía en `generic` y ninguna familia podía puntuar', () => {
  test('por texto y por enterprise OID (1248)', () => {
    assert.equal(detectBrandFromText('EPSON WF-C5891 Series'), 'epson');
    assert.equal(detectBrandFromOid('1.3.6.1.4.1.1248.1.2.3'), 'epson');
  });

  test('un Epson resuelve a su familia; sin marca sigue cayendo al Printer-MIB', () => {
    const ports = { http: true, https: true } as never;
    assert.equal(resolve({ brand: 'epson', model: 'EPSON WF-C5891 Series', serial: null } as never, ports).family.id, 'epson.webconfig');
    assert.equal(resolve({ brand: 'generic', model: 'algo raro', serial: null } as never, ports).family.id, 'generic.printer-mib');
  });
});

describe('levelFromGradient — el nivel es el fin de la primera franja de color', () => {
  test('amarillo al 39%', () => {
    assert.equal(levelFromGradient('background:linear-gradient(to top, #FFF200 0%, #FFF200 39%, #000000 39%, #BFC2C5 41%, #BFC2C5 100%)'), 39);
  });

  test('casi vacío: negro al 2%, no al 4% del gris ni al 100%', () => {
    assert.equal(levelFromGradient('background:linear-gradient(to top, #000000 0%, #000000 2%, #000000 2%, #BFC2C5 4%, #BFC2C5 100%)'), 2);
  });

  test('sin gradiente usable → null, no 0', () => {
    assert.equal(levelFromGradient('background:#fff'), null);
    assert.equal(levelFromGradient(''), null);
  });
});

describe('PRTINFO — niveles y caja de mantenimiento, sin leer una sola etiqueta', () => {
  const tanks = parseEpsonTanks(prtInfo);

  test('cuatro tintas por su token de color (BK/Y/M/C) más la caja', () => {
    assert.deepEqual(tanks.map((t) => t.color), ['black', 'yellow', 'magenta', 'cyan', null]);
    assert.equal(tanks[4].maintenanceBox, true, 'la caja se reconoce por su ícono, no por el texto');
  });

  test('los niveles son los que muestra el equipo', () => {
    const d = parseEpsonPrtInfo(prtInfo);
    assert.equal(d.tonerBlack, 2);
    assert.equal(d.tonerYellow, 39);
    assert.equal(d.tonerMagenta, 50);
    assert.equal(d.tonerCyan, 56);
    assert.equal(d.suppliesDetails?.maintenance?.wasteToner?.percentage, 80);
  });

  test('el negro al 2% se marca Low, no Ready', () => {
    assert.equal(parseEpsonPrtInfo(prtInfo).suppliesDetails?.toners?.black?.status, 'Low');
  });

  test('identidad de red: modelo, hostname y MAC', () => {
    const d = parseEpsonPrtInfo(prtInfo);
    assert.equal(d.model, 'WF-C5891 Series');
    assert.equal(d.hostname, 'EPSON77811B');
    assert.equal(d.mac, 'A4:D7:3C:77:81:1B');
  });

  test('no inventa SKU ni serie: Epson no los publica en esta consola', () => {
    const black = parseEpsonPrtInfo(prtInfo).suppliesDetails?.toners?.black;
    assert.equal(black?.code, null);
    assert.equal(black?.serial, null);
  });

  test('un HTML que no es Web Config no devuelve nada', () => {
    assert.deepEqual(parseEpsonPrtInfo('<html><body>nada</body></html>'), {});
  });
});

describe('MENTINFO — contadores validados por aritmética', () => {
  test('total/mono/color del equipo real', () => {
    assert.deepEqual(parseEpsonCounters(mentInfo), {
      brand: 'epson', totalPages: 1397, monoPages: 449, colorPages: 948,
    });
  });

  test('si total != mono + color no se devuelve nada, en vez de asignar mal', () => {
    const roto = `<dd class="value"><div>100</div></dd><dd class="value"><div>10</div></dd><dd class="value"><div>20</div></dd>`;
    assert.deepEqual(parseEpsonCounters(roto), {});
  });

  test('sin suficientes valores → vacío', () => {
    assert.deepEqual(parseEpsonCounters('<html></html>'), {});
  });
});
