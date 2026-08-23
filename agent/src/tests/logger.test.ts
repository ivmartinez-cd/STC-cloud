// Rotación de logs — tests unitarios.
// Run: npx tsx --test src/tests/logger.test.ts
//
// Usa un directorio temporal para no tocar datos de producción.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stc-test-logger-'));
process.env['AGENT_DATA_DIR'] = TMP_DIR;

import { log } from '../core/Logger';

// `log()` recalcula la ruta en cada llamada leyendo `AGENT_DATA_DIR` (no una
// constante fijada al importar el módulo — necesario para que ESTE test
// funcione: bajo ESM los imports estáticos se resuelven ANTES que cualquier
// otra sentencia del archivo, así que el `LOG_PATH` fijado al importar
// `Logger.ts` no reflejaría el `AGENT_DATA_DIR` seteado arriba). Por eso acá
// se arma la ruta esperada directo, sin importar la constante `LOG_PATH`.
const LOG_PATH = path.join(TMP_DIR, 'agent.log');

// `log()` también hace console.log por línea — silenciado acá, si no los
// tests que fuerzan varias rotaciones (líneas de 1MB × decenas) inundan la
// salida de la suite con megabytes de ruido.
const realConsoleLog = console.log;
console.log = () => {};
process.on('exit', () => { console.log = realConsoleLog; });

describe('Logger — rotación en cadena', () => {
  test('un archivo por debajo del límite no rota', () => {
    log('INFO', 'línea corta');
    assert.ok(fs.existsSync(LOG_PATH));
    assert.ok(!fs.existsSync(`${LOG_PATH}.1`));
  });

  test('superar LOG_MAX_BYTES rota el activo a .1', () => {
    const bigLine = 'x'.repeat(1024 * 1024); // 1MB por línea
    for (let i = 0; i < 11; i++) log('INFO', bigLine); // >10MB dispara el corte
    assert.ok(fs.existsSync(`${LOG_PATH}.1`), 'debe existir agent.log.1 tras superar el límite');
    assert.ok(fs.existsSync(LOG_PATH), 'debe seguir existiendo un agent.log activo (recién creado)');
  });

  test('rotaciones sucesivas encadenan .1→.2→.3... sin pisar', () => {
    const bigLine = 'y'.repeat(1024 * 1024);
    const before1 = fs.readFileSync(`${LOG_PATH}.1`, 'utf8');

    for (let i = 0; i < 11; i++) log('INFO', bigLine);

    assert.ok(fs.existsSync(`${LOG_PATH}.2`), 'debe existir agent.log.2 tras la segunda rotación');
    const after2 = fs.readFileSync(`${LOG_PATH}.2`, 'utf8');
    assert.equal(after2, before1, 'el contenido viejo de .1 debe haberse corrido a .2, no perderse');
  });

  test('no acumula más de LOG_MAX_FILES (5) — el más viejo se borra', () => {
    const bigLine = 'z'.repeat(1024 * 1024);
    // Forzar varias rotaciones más para superar el tope de 5 archivos rotados.
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < 11; i++) log('INFO', bigLine);
    }
    assert.ok(fs.existsSync(`${LOG_PATH}.5`), 'debe existir hasta .5');
    assert.ok(!fs.existsSync(`${LOG_PATH}.6`), 'nunca debe crecer más allá de .5');
  });
});
