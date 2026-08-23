// Rollback de update (backup + restauración del bundle single-file) — tests
// unitarios. No se testea `checkForUpdate` completo acá (llama
// `process.exit(0)` en el camino feliz, y depende de red real) — el foco es
// `rollbackToPreviousVersion()`, la funcionalidad nueva de esta pasada.
// Run: npx tsx --test src/tests/updateRollback.test.ts

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { UpdateService } from '../core/UpdateService';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stc-test-update-'));
const BUNDLE_PATH = path.join(TMP_DIR, 'stc-node.js');

const originalArgv1 = process.argv[1];

const fakeDeps = {
  getConfig: () => ({ serverUrl: '', token: '' } as any),
  triggerScan: () => {},
  isNetworkBusy: () => false,
};

describe('UpdateService — rollbackToPreviousVersion', () => {
  before(() => {
    process.argv[1] = BUNDLE_PATH; // getBundlePath() exige argv[1] terminado en .js y que exista
  });
  after(() => {
    process.argv[1] = originalArgv1;
  });

  test('sin .bak → rollback falla (no hay nada que restaurar)', async () => {
    fs.writeFileSync(BUNDLE_PATH, 'contenido v1.0.0 (actual)');
    const svc = new UpdateService(fakeDeps);
    const ok = await svc.rollbackToPreviousVersion();
    assert.equal(ok, false);
  });

  test('con .bak → restaura el contenido anterior', async () => {
    fs.writeFileSync(BUNDLE_PATH, 'contenido v2.0.0 (roto)');
    fs.writeFileSync(BUNDLE_PATH + '.bak', 'contenido v1.0.0 (bueno)');
    fs.writeFileSync(BUNDLE_PATH + '.bak.version', '1.0.0');

    const svc = new UpdateService(fakeDeps);
    const ok = await svc.rollbackToPreviousVersion();
    assert.equal(ok, true);
    assert.equal(fs.readFileSync(BUNDLE_PATH, 'utf8'), 'contenido v1.0.0 (bueno)');
  });

  test('sin argv[1] apuntando a un .js real → rollback falla sin tirar', async () => {
    process.argv[1] = '/no/existe/nada.js';
    const svc = new UpdateService(fakeDeps);
    const ok = await svc.rollbackToPreviousVersion();
    assert.equal(ok, false);
    process.argv[1] = BUNDLE_PATH;
  });

  test('el backup se conserva intacto después del rollback (se puede revertir de nuevo)', async () => {
    const backupContent = fs.readFileSync(BUNDLE_PATH + '.bak', 'utf8');
    assert.equal(backupContent, 'contenido v1.0.0 (bueno)', 'el .bak no debe borrarse ni modificarse al restaurar');
  });
});
