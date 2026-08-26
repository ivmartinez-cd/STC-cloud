// Destino SFTP por cliente (Fase 19 del gap analysis) — lógica pura, sin
// servidor, sin base. Ejecutar: npx tsx --test src/tests/sftpDestination.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, _resetKeyCacheForTests } from '../services/cryptoService';
import {
  validateSftpDestination, buildStoredSftpDestination, maskSftpDestination, toWireSftpDestination, auditMetadata,
  SftpDestinationValidationError,
} from '../services/sftpDestination';
import type { StoredSftpDestination } from '../shared/domain/sftp-destination';

function withKey<T>(key: string | undefined, fn: () => T): T {
  const prev = process.env.SNMP_CREDENTIALS_KEY;
  if (key === undefined) delete process.env.SNMP_CREDENTIALS_KEY; else process.env.SNMP_CREDENTIALS_KEY = key;
  _resetKeyCacheForTests();
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.SNMP_CREDENTIALS_KEY; else process.env.SNMP_CREDENTIALS_KEY = prev;
    _resetKeyCacheForTests();
  }
}

describe('cryptoService — subclaves por purpose no se cruzan', () => {
  test('lo cifrado con purpose "snmp" no descifra con purpose "sftp", y viceversa', () => {
    withKey('misma-clave-raiz-para-los-dos-purposes', () => {
      const forSnmp = encryptSecret('secreto-snmp', 'snmp');
      const forSftp = encryptSecret('secreto-sftp', 'sftp');
      assert.equal(decryptSecret(forSnmp, 'snmp'), 'secreto-snmp');
      assert.equal(decryptSecret(forSftp, 'sftp'), 'secreto-sftp');
      assert.throws(() => decryptSecret(forSnmp, 'sftp'));
      assert.throws(() => decryptSecret(forSftp, 'snmp'));
    });
  });

  test('el purpose "snmp" es el default — compatibilidad con call-sites viejos que no lo pasan', () => {
    withKey('otra-clave', () => {
      const blob = encryptSecret('x'); // sin purpose explícito
      assert.equal(decryptSecret(blob), 'x'); // idem, sin purpose explícito
      assert.equal(decryptSecret(blob, 'snmp'), 'x'); // y con "snmp" explícito da lo mismo
    });
  });
});

describe('validateSftpDestination', () => {
  test('destino válido con password', () => {
    const input = validateSftpDestination({ host: 'sftp.cliente.com', username: 'stc', auth_method: 'password', password: 'x' });
    assert.equal(input.host, 'sftp.cliente.com');
    assert.equal(input.port, 22);
    assert.equal(input.remote_path, '/');
  });

  test('destino válido con private_key y puerto/ruta custom', () => {
    const key = 'a'.repeat(40);
    const input = validateSftpDestination({ host: 'h', port: 2222, username: 'u', auth_method: 'private_key', private_key: key, remote_path: '/reportes/stc' });
    assert.equal(input.port, 2222);
    assert.equal(input.remote_path, '/reportes/stc');
  });

  test('host vacío → error con field', () => {
    assert.throws(
      () => validateSftpDestination({ host: '', username: 'u', auth_method: 'password', password: 'x' }),
      (e: unknown) => e instanceof SftpDestinationValidationError && e.field === 'host'
    );
  });

  test('port fuera de rango → error', () => {
    assert.throws(() => validateSftpDestination({ host: 'h', port: 70000, username: 'u', auth_method: 'password', password: 'x' }),
      SftpDestinationValidationError);
  });

  test('auth_method "password" sin password → error', () => {
    assert.throws(() => validateSftpDestination({ host: 'h', username: 'u', auth_method: 'password' }), SftpDestinationValidationError);
  });

  test('auth_method "password" con private_key también mandado → error', () => {
    assert.throws(
      () => validateSftpDestination({ host: 'h', username: 'u', auth_method: 'password', password: 'x', private_key: 'y'.repeat(40) }),
      SftpDestinationValidationError
    );
  });

  test('auth_method "private_key" con clave demasiado corta → error', () => {
    assert.throws(() => validateSftpDestination({ host: 'h', username: 'u', auth_method: 'private_key', private_key: 'corta' }),
      SftpDestinationValidationError);
  });

  test('auth_method inválido → error', () => {
    assert.throws(() => validateSftpDestination({ host: 'h', username: 'u', auth_method: 'ftp' }), SftpDestinationValidationError);
  });

  test('body no-objeto → error', () => {
    assert.throws(() => validateSftpDestination('nope'), SftpDestinationValidationError);
    assert.throws(() => validateSftpDestination(null), SftpDestinationValidationError);
  });
});

describe('buildStoredSftpDestination / maskSftpDestination / toWireSftpDestination — round-trip', () => {
  test('password: cifra, enmascara sin el secreto, descifra igual para el worker', () => {
    withKey('clave-de-prueba', () => {
      const input = validateSftpDestination({ host: 'sftp.cliente.com', port: 22, username: 'stc', auth_method: 'password', password: 'super-secreta' });
      const stored = buildStoredSftpDestination(input);
      assert.ok(stored.password_enc);
      assert.equal(stored.private_key_enc, undefined);

      const masked = maskSftpDestination(stored);
      assert.equal(masked?.configured, true);
      assert.equal(masked?.host, 'sftp.cliente.com');
      assert.ok(!JSON.stringify(masked).includes('super-secreta'));

      const wire = toWireSftpDestination(stored);
      assert.equal(wire.password, 'super-secreta');
      assert.equal(wire.privateKey, undefined);
      assert.equal(wire.remotePath, '/');
    });
  });

  test('private_key: idem, por la otra rama', () => {
    withKey('clave-de-prueba', () => {
      const pk = '-----BEGIN OPENSSH PRIVATE KEY-----\n' + 'x'.repeat(60);
      const input = validateSftpDestination({ host: 'h', username: 'u', auth_method: 'private_key', private_key: pk });
      const stored = buildStoredSftpDestination(input);
      assert.ok(stored.private_key_enc);
      assert.equal(stored.password_enc, undefined);

      const wire = toWireSftpDestination(stored);
      assert.equal(wire.privateKey, pk);
      assert.equal(wire.password, undefined);
    });
  });

  test('maskSftpDestination(null) → null (sin destino configurado)', () => {
    assert.equal(maskSftpDestination(null), null);
  });

  test('sin SNMP_CREDENTIALS_KEY configurada, buildStoredSftpDestination lanza', () => {
    withKey(undefined, () => {
      const input = validateSftpDestination({ host: 'h', username: 'u', auth_method: 'password', password: 'x' });
      assert.throws(() => buildStoredSftpDestination(input));
    });
  });
});

describe('auditMetadata — nunca el secreto', () => {
  test('sin destino → { configured: false }', () => {
    assert.deepEqual(auditMetadata(null), { configured: false });
  });

  test('con destino → metadata sin password/private_key ni sus *_enc', () => {
    const stored: StoredSftpDestination = {
      host: 'h', port: 22, username: 'u', auth_method: 'password', password_enc: 'v1:secreto-cifrado',
      remote_path: '/', updated_at: new Date().toISOString(),
    };
    const meta = auditMetadata(stored);
    assert.ok(!JSON.stringify(meta).includes('secreto-cifrado'));
    assert.equal(meta.host, 'h');
    assert.equal(meta.configured, true);
  });
});
