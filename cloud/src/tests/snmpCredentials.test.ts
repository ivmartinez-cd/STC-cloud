// Lógica pura de credenciales SNMP (cifrado + validación + máscara) — sin
// servidor, sin base. Ejecutar: npx tsx --test src/tests/snmpCredentials.test.ts
//
// SNMP_CREDENTIALS_KEY se setea/limpia por test (no queda en el ambiente real)
// para poder probar tanto el camino "con clave" como "sin clave configurada".

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSecret, decryptSecret, isEncryptionConfigured,
  MissingEncryptionKeyError, DecryptionFailedError, _resetKeyCacheForTests,
} from '../services/cryptoService';
import {
  validateCredentials, buildStored, maskCredentials, toWire, legacyCommunity, auditMetadata,
  SnmpCredentialValidationError, type StoredCredential,
} from '../services/snmpCredentials';

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

describe('cryptoService — cifrado at-rest', () => {
  test('round-trip: encriptar y desencriptar devuelve el texto original', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const blob = encryptSecret('mi-passphrase-secreta');
      assert.equal(decryptSecret(blob), 'mi-passphrase-secreta');
    });
  });

  test('el mismo texto plano produce ciphertext distinto cada vez (IV aleatorio)', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const a = encryptSecret('mismo-texto');
      const b = encryptSecret('mismo-texto');
      assert.notEqual(a, b);
      assert.equal(decryptSecret(a), 'mismo-texto');
      assert.equal(decryptSecret(b), 'mismo-texto');
    });
  });

  test('el blob lleva el prefijo de versión "v1:"', () => {
    withKey('clave-de-prueba-para-tests', () => {
      assert.ok(encryptSecret('x').startsWith('v1:'));
    });
  });

  test('tampering: flipear un byte del ciphertext hace fallar el descifrado (nunca basura)', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const blob = encryptSecret('secreto');
      const [prefix, b64] = blob.split(':');
      const raw = Buffer.from(b64, 'base64');
      raw[raw.length - 1] ^= 0xff; // último byte del ciphertext
      const tampered = `${prefix}:${raw.toString('base64')}`;
      assert.throws(() => decryptSecret(tampered), DecryptionFailedError);
    });
  });

  test('prefijo de versión desconocido → DecryptionFailedError', () => {
    withKey('clave-de-prueba-para-tests', () => {
      assert.throws(() => decryptSecret('v99:AAAA'), DecryptionFailedError);
    });
  });

  test('sin SNMP_CREDENTIALS_KEY → MissingEncryptionKeyError, isEncryptionConfigured() === false', () => {
    withKey(undefined, () => {
      assert.equal(isEncryptionConfigured(), false);
      assert.throws(() => encryptSecret('x'), MissingEncryptionKeyError);
    });
  });

  test('con SNMP_CREDENTIALS_KEY → isEncryptionConfigured() === true', () => {
    withKey('otra-clave', () => {
      assert.equal(isEncryptionConfigured(), true);
    });
  });
});

describe('snmpCredentials — validateCredentials', () => {
  test('v2c válida', () => {
    const out = validateCredentials([{ version: 'v2c', community: 'public' }]);
    assert.equal(out.length, 1);
  });

  test('v3 authPriv válida', () => {
    const out = validateCredentials([{
      version: 'v3', username: 'stcmon', security_level: 'authPriv',
      auth_protocol: 'sha256', auth_key: 'passphrase-larga', priv_protocol: 'aes', priv_key: 'otra-passphrase',
    }]);
    assert.equal(out.length, 1);
  });

  test('v3 sin username → error', () => {
    assert.throws(
      () => validateCredentials([{ version: 'v3', security_level: 'noAuthNoPriv' }]),
      SnmpCredentialValidationError
    );
  });

  test('authPriv sin priv_key → error', () => {
    assert.throws(() => validateCredentials([{
      version: 'v3', username: 'u', security_level: 'authPriv',
      auth_protocol: 'sha', auth_key: 'passphrase-larga',
    }]), SnmpCredentialValidationError);
  });

  test('authNoPriv CON priv_key → error (ilegal en USM)', () => {
    assert.throws(() => validateCredentials([{
      version: 'v3', username: 'u', security_level: 'authNoPriv',
      auth_protocol: 'sha', auth_key: 'passphrase-larga',
      priv_protocol: 'aes', priv_key: 'passphrase-larga',
    }]), SnmpCredentialValidationError);
  });

  test('protocolo de auth desconocido → error', () => {
    assert.throws(() => validateCredentials([{
      version: 'v3', username: 'u', security_level: 'authNoPriv',
      auth_protocol: 'rot13', auth_key: 'passphrase-larga',
    }]), SnmpCredentialValidationError);
  });

  test('passphrase < 8 caracteres → error (RFC 3414)', () => {
    assert.throws(() => validateCredentials([{
      version: 'v3', username: 'u', security_level: 'authNoPriv',
      auth_protocol: 'sha', auth_key: 'corta',
    }]), SnmpCredentialValidationError);
  });

  test('community > 64 caracteres → error', () => {
    assert.throws(
      () => validateCredentials([{ version: 'v2c', community: 'x'.repeat(65) }]),
      SnmpCredentialValidationError
    );
  });

  test('más de 8 entradas → error', () => {
    const many = Array.from({ length: 9 }, () => ({ version: 'v2c' as const, community: 'public' }));
    assert.throws(() => validateCredentials(many), SnmpCredentialValidationError);
  });

  test('{ ref } se acepta tal cual, sin validar campos de secreto', () => {
    const out = validateCredentials([{ ref: 'algun-id' }]);
    assert.deepEqual(out, [{ ref: 'algun-id' }]);
  });
});

describe('snmpCredentials — buildStored / maskCredentials / toWire', () => {
  test('material nuevo se cifra con un id nuevo; ref conserva el id existente', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const current: StoredCredential[] = [
        { id: 'id-viejo', version: 'v2c', label: 'legacy', community_enc: encryptSecret('public') },
      ];
      const input = validateCredentials([
        { ref: 'id-viejo' },
        { version: 'v3', username: 'stcmon', security_level: 'authPriv', auth_protocol: 'sha256', auth_key: 'passphrase-1', priv_protocol: 'aes', priv_key: 'passphrase-2' },
      ]);
      const stored = buildStored(input, current);
      assert.equal(stored.length, 2);
      assert.equal(stored[0].id, 'id-viejo');
      assert.notEqual(stored[1].id, 'id-viejo');
    });
  });

  test('ref inexistente → SnmpCredentialValidationError', () => {
    withKey('clave-de-prueba-para-tests', () => {
      assert.throws(() => buildStored([{ ref: 'no-existe' }], []), SnmpCredentialValidationError);
    });
  });

  test('un PUT que sólo reordena/borra por ref funciona SIN la clave de cifrado', () => {
    withKey(undefined, () => {
      const current: StoredCredential[] = [{ id: 'a', version: 'v2c', label: null, community_enc: 'v1:noimporta' }];
      const stored = buildStored([{ ref: 'a' }], current);
      assert.equal(stored.length, 1);
    });
  });

  test('material nuevo SIN la clave configurada → MissingEncryptionKeyError', () => {
    withKey(undefined, () => {
      assert.throws(
        () => buildStored([{ version: 'v2c', community: 'public' }], []),
        MissingEncryptionKeyError
      );
    });
  });

  test('maskCredentials nunca incluye *_enc ni material de clave en la salida serializada', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const stored: StoredCredential[] = [
        { id: '1', version: 'v2c', label: null, community_enc: encryptSecret('secreto-community') },
        { id: '2', version: 'v3', label: 'corp', username: 'stcmon', security_level: 'authPriv',
          auth_protocol: 'sha256', auth_key_enc: encryptSecret('secreto-auth'),
          priv_protocol: 'aes', priv_key_enc: encryptSecret('secreto-priv') },
      ];
      const masked = maskCredentials(stored);
      const serialized = JSON.stringify(masked);
      assert.ok(!serialized.includes('secreto-community'));
      assert.ok(!serialized.includes('secreto-auth'));
      assert.ok(!serialized.includes('secreto-priv'));
      assert.ok(!serialized.includes('_enc'));
      assert.equal(masked[0].has_community, true);
      assert.equal(masked[1].has_auth_key, true);
      assert.equal(masked[1].has_priv_key, true);
    });
  });

  test('toWire descifra la lista completa para el heartbeat', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const stored: StoredCredential[] = [
        { id: '1', version: 'v2c', label: null, community_enc: encryptSecret('public') },
        { id: '2', version: 'v3', label: null, username: 'stcmon', security_level: 'authPriv',
          auth_protocol: 'sha256', auth_key_enc: encryptSecret('auth-pass'),
          priv_protocol: 'aes', priv_key_enc: encryptSecret('priv-pass') },
      ];
      const wire = toWire(stored);
      assert.equal(wire.length, 2);
      assert.equal((wire[0] as any).community, 'public');
      assert.equal((wire[1] as any).auth_key, 'auth-pass');
      assert.equal((wire[1] as any).priv_key, 'priv-pass');
    });
  });

  test('toWire salta una entrada corrupta (tampering) sin tirar abajo el resto', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const good = encryptSecret('bueno');
      const stored: StoredCredential[] = [
        { id: '1', version: 'v2c', label: null, community_enc: 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
        { id: '2', version: 'v2c', label: null, community_enc: good },
      ];
      const wire = toWire(stored);
      assert.equal(wire.length, 1);
      assert.equal((wire[0] as any).community, 'bueno');
    });
  });

  test('toWire sin clave configurada → MissingEncryptionKeyError (con al menos una entrada)', () => {
    withKey(undefined, () => {
      const stored: StoredCredential[] = [{ id: '1', version: 'v2c', label: null, community_enc: 'v1:x' }];
      assert.throws(() => toWire(stored), MissingEncryptionKeyError);
    });
  });

  test('toWire de una lista vacía no requiere la clave', () => {
    withKey(undefined, () => {
      assert.deepEqual(toWire([]), []);
    });
  });

  test('legacyCommunity: primera v1/v2c de la lista', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const stored: StoredCredential[] = [
        { id: '1', version: 'v3', label: null, username: 'u', security_level: 'noAuthNoPriv' },
        { id: '2', version: 'v2c', label: null, community_enc: encryptSecret('la-community') },
      ];
      assert.equal(legacyCommunity(stored, 'fallback'), 'la-community');
    });
  });

  test('legacyCommunity: sin ninguna v1/v2c cae al fallback', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const stored: StoredCredential[] = [{ id: '1', version: 'v3', label: null, username: 'u', security_level: 'noAuthNoPriv' }];
      assert.equal(legacyCommunity(stored, 'fallback'), 'fallback');
    });
  });

  test('auditMetadata nunca incluye community/auth/priv', () => {
    withKey('clave-de-prueba-para-tests', () => {
      const stored: StoredCredential[] = [
        { id: '1', version: 'v2c', label: 'x', community_enc: encryptSecret('no-debe-aparecer') },
      ];
      const serialized = JSON.stringify(auditMetadata(stored));
      assert.ok(!serialized.includes('no-debe-aparecer'));
      assert.ok(!serialized.includes('_enc'));
    });
  });
});
