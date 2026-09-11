// Lógica pura de rangos IP (CIDR + tope + exclusiones) — sin servidor, sin
// base. Ejecutar: npx tsx --test src/tests/ipRangeSpec.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIpRangeSpecs, publicIpWarnings, overlappingCredentialWarnings, longLapWarnings,
  IpRangeValidationError, type IpRangeSpecInput,
} from '../shared/domain/ip-range-spec';

describe('ipRangeSpec — validateIpRangeSpecs', () => {
  test('rango manual válido', () => {
    const out = validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10' }]);
    assert.deepEqual(out, [{ label: null, start: '10.0.0.1', end: '10.0.0.10' }]);
  });

  test('CIDR válido', () => {
    const out = validateIpRangeSpecs([{ cidr: '10.0.1.0/24', label: 'Piso 3' }]);
    assert.deepEqual(out, [{ label: 'Piso 3', cidr: '10.0.1.0/24' }]);
  });

  test('ni cidr ni start/end → error', () => {
    assert.throws(() => validateIpRangeSpecs([{}]), IpRangeValidationError);
  });

  test('cidr Y start/end a la vez → error (mutuamente excluyentes)', () => {
    assert.throws(
      () => validateIpRangeSpecs([{ cidr: '10.0.0.0/24', start: '10.0.0.1', end: '10.0.0.2' }]),
      IpRangeValidationError
    );
  });

  test('start sin end → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.1' }]), IpRangeValidationError);
  });

  test('IP de start inválida → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '999.0.0.1', end: '10.0.0.10' }]), IpRangeValidationError);
  });

  test('CIDR con prefijo inválido → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ cidr: '10.0.0.0/33' }]), IpRangeValidationError);
  });

  test('start > end → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.10', end: '10.0.0.1' }]), IpRangeValidationError);
  });

  test('más de 256 rangos → error', () => {
    const many = Array.from({ length: 257 }, (_, i) => ({ start: `10.${Math.floor(i / 250)}.${i % 250}.1`, end: `10.${Math.floor(i / 250)}.${i % 250}.2` }));
    assert.throws(() => validateIpRangeSpecs(many), IpRangeValidationError);
  });

  test('256 rangos + 32 hostnames conviven: son pools SEPARADOS', () => {
    const ranges = Array.from({ length: 256 }, (_, i) => ({ cidr: `10.0.${i}.0/30` }));
    const hosts = Array.from({ length: 32 }, (_, i) => ({ hostname: `printer-${i}.local` }));
    assert.doesNotThrow(() => validateIpRangeSpecs([...ranges, ...hosts]));
  });

  test('más de 32 hostnames → error, aunque sobre lugar en el pool de rangos', () => {
    const hosts = Array.from({ length: 33 }, (_, i) => ({ hostname: `printer-${i}.local` }));
    assert.throws(() => validateIpRangeSpecs(hosts), IpRangeValidationError);
  });

  test('un solo spec que supera el tope de 65536 IPs declaradas → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ cidr: '10.0.0.0/15' }]), IpRangeValidationError); // /15 = 131072
  });

  test('varios specs chicos que SUMAN más de 65536 → error en el que hace overflow', () => {
    const specs = [
      { cidr: '10.0.0.0/16' },                   // 65536 IPs exactas
      { start: '10.1.0.0', end: '10.1.0.10' },   // 11 IPs más — dispara el overflow
    ];
    assert.throws(() => validateIpRangeSpecs(specs), IpRangeValidationError);
  });

  test('exactamente 65536 IPs declaradas → no lanza (el límite es inclusivo)', () => {
    assert.doesNotThrow(() => validateIpRangeSpecs([{ start: '10.0.0.0', end: '10.0.255.255' }]));
  });

  test('el caso real de 59 sedes (59 /24 ≈ 15.000 IPs) entra sin problema', () => {
    const sedes = Array.from({ length: 59 }, (_, i) => ({ cidr: `10.0.${i}.0/24`, label: `Sede ${i + 1}` }));
    assert.doesNotThrow(() => validateIpRangeSpecs(sedes));
  });

  test('exclude con IP inválida → error', () => {
    assert.throws(
      () => validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['no-es-una-ip'] }]),
      IpRangeValidationError
    );
  });

  test('exclude válido se conserva', () => {
    const out = validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.5'] }]);
    assert.deepEqual(out[0].exclude, ['10.0.0.5']);
  });

  test('más de 32 exclusiones → error', () => {
    const exclude = Array.from({ length: 33 }, (_, i) => `10.0.0.${i + 1}`);
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.0', end: '10.0.0.254', exclude }]), IpRangeValidationError);
  });

  test('no es un array → error', () => {
    assert.throws(() => validateIpRangeSpecs({} as unknown), IpRangeValidationError);
  });

  test('hostname válido se conserva', () => {
    const out = validateIpRangeSpecs([{ hostname: 'printer-3flo.corp.local', label: 'Piso 3' }]);
    assert.deepEqual(out, [{ label: 'Piso 3', hostname: 'printer-3flo.corp.local' }]);
  });

  test('hostname de un solo label (sin dominio) también es válido', () => {
    assert.doesNotThrow(() => validateIpRangeSpecs([{ hostname: 'printer1' }]));
  });

  test('hostname vacío → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ hostname: '' }]), IpRangeValidationError);
  });

  test('hostname con caracteres inválidos → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ hostname: 'no espacios permitidos' }]), IpRangeValidationError);
    assert.throws(() => validateIpRangeSpecs([{ hostname: '-empieza-con-guion' }]), IpRangeValidationError);
  });

  test('hostname Y cidr a la vez → error (mutuamente excluyentes)', () => {
    assert.throws(() => validateIpRangeSpecs([{ hostname: 'algo.local', cidr: '10.0.0.0/24' }]), IpRangeValidationError);
  });

  test('hostname Y start/end a la vez → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ hostname: 'algo.local', start: '10.0.0.1', end: '10.0.0.2' }]), IpRangeValidationError);
  });

  test('un hostname cuenta 1 hacia el tope total de IPs declaradas', () => {
    // 65536 (un /16 exacto) + 1 hostname = 65537 → debe superar el tope
    assert.throws(() => validateIpRangeSpecs([
      { start: '10.0.0.0', end: '10.0.255.255' },
      { hostname: 'uno-de-mas.local' },
    ]), IpRangeValidationError);
  });

  test('credential_ids válido se conserva, deduplicado', () => {
    const out = validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.2', credential_ids: ['a', 'b', 'a'] }]);
    assert.deepEqual(out[0].credential_ids, ['a', 'b']);
  });

  test('credential_ids no es un array → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.2', credential_ids: 'a' as unknown as string[] }]), IpRangeValidationError);
  });

  test('más de 8 credential_ids → error', () => {
    const credential_ids = Array.from({ length: 9 }, (_, i) => `id-${i}`);
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.2', credential_ids }]), IpRangeValidationError);
  });

  test('credential_ids con un elemento vacío → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.2', credential_ids: ['', 'ok'] }]), IpRangeValidationError);
  });

  test('un hostname también admite credential_ids', () => {
    const out = validateIpRangeSpecs([{ hostname: 'algo.local', credential_ids: ['cred-1'] }]);
    assert.deepEqual(out[0].credential_ids, ['cred-1']);
  });

  test('enabled ausente no se inventa (ausente = habilitado, retrocompatible)', () => {
    const out = validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.2' }]);
    assert.equal(out[0].enabled, undefined);
  });

  test('enabled sobrevive el round-trip, en true y en false', () => {
    const out = validateIpRangeSpecs([
      { start: '10.0.0.1', end: '10.0.0.2', enabled: false },
      { hostname: 'algo.local', enabled: true },
    ]);
    assert.equal(out[0].enabled, false);
    assert.equal(out[1].enabled, true);
  });

  test('enabled que no es booleano → error', () => {
    const spec = { start: '10.0.0.1', end: '10.0.0.2', enabled: 'si' as unknown as boolean };
    assert.throws(() => validateIpRangeSpecs([spec]), IpRangeValidationError);
  });

  test('un rango deshabilitado igual se valida (tiene que poder re-habilitarse sin reeditarlo)', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '999.0.0.1', end: '10.0.0.2', enabled: false }]), IpRangeValidationError);
  });
});

describe('ipRangeSpec — longLapWarnings', () => {
  test('las 59 sedes del caso real (~15.000 IPs, ~50 min) NO generan warning', () => {
    const sedes = Array.from({ length: 59 }, (_, i) => ({ cidr: `10.0.${i}.0/24` }));
    assert.deepEqual(longLapWarnings(sedes), []);
  });

  test('un /16 entero (~218 min) genera warning con la estimación en minutos', () => {
    const warnings = longLapWarnings([{ cidr: '10.0.0.0/16' }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /~218 min/); // (65536/10)*2s = 13107,2s ≈ 218,45 min
    assert.match(warnings[0], /vuelta/);
  });

  test('es NO bloqueante: sólo devuelve texto, nunca lanza', () => {
    assert.doesNotThrow(() => longLapWarnings([{ cidr: 'basura' } as IpRangeSpecInput]));
    assert.doesNotThrow(() => validateIpRangeSpecs([{ cidr: '10.0.0.0/16' }]));
  });

  test('los rangos deshabilitados no suman a la estimación', () => {
    assert.deepEqual(longLapWarnings([{ cidr: '10.0.0.0/16', enabled: false }]), []);
  });
});

describe('ipRangeSpec — publicIpWarnings', () => {
  test('rango totalmente privado (RFC1918) no genera warning', () => {
    assert.deepEqual(publicIpWarnings([{ start: '10.0.0.1', end: '10.0.0.10' }]), []);
    assert.deepEqual(publicIpWarnings([{ cidr: '192.168.1.0/24' }]), []);
  });

  test('rango con IP pública genera warning', () => {
    const warnings = publicIpWarnings([{ label: 'Oficina', start: '8.8.8.0', end: '8.8.8.10' }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Oficina/);
    assert.match(warnings[0], /pública/);
  });

  test('loopback y link-local no generan warning', () => {
    assert.deepEqual(publicIpWarnings([{ start: '127.0.0.1', end: '127.0.0.10' }]), []);
    assert.deepEqual(publicIpWarnings([{ start: '169.254.1.1', end: '169.254.1.10' }]), []);
  });

  test('nunca lanza — es sólo informativo, nunca bloquea el guardado', () => {
    assert.doesNotThrow(() => publicIpWarnings([{ cidr: 'basura' } as IpRangeSpecInput]));
  });

  test('un rango público deshabilitado no avisa (no se compila, el agente no lo ve), el habilitado sí', () => {
    const warnings = publicIpWarnings([
      { label: 'Apagado', start: '8.8.8.0', end: '8.8.8.10', enabled: false },
      { label: 'Prendido', cidr: '1.1.1.0/29' },
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Prendido/);
  });
});

describe('ipRangeSpec — overlappingCredentialWarnings', () => {
  test('rangos superpuestos con credential_ids distintos → warning', () => {
    const warnings = overlappingCredentialWarnings([
      { label: 'A', start: '10.0.0.1', end: '10.0.0.50', credential_ids: ['cred-a'] },
      { label: 'B', cidr: '10.0.0.0/24' },
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"A"/);
    assert.match(warnings[0], /"B"/);
    assert.match(warnings[0], /superpon/);
  });

  test('rangos superpuestos con las MISMAS credential_ids → sin warning', () => {
    const warnings = overlappingCredentialWarnings([
      { start: '10.0.0.1', end: '10.0.0.50', credential_ids: ['cred-a'] },
      { cidr: '10.0.0.0/24', credential_ids: ['cred-a'] },
    ]);
    assert.deepEqual(warnings, []);
  });

  test('rangos superpuestos sin ningún credential_ids (ambos agent-wide) → sin warning', () => {
    const warnings = overlappingCredentialWarnings([
      { start: '10.0.0.1', end: '10.0.0.50' },
      { cidr: '10.0.0.0/24' },
    ]);
    assert.deepEqual(warnings, []);
  });

  test('rangos que NO se superponen, con credential_ids distintos → sin warning (no falso positivo)', () => {
    const warnings = overlappingCredentialWarnings([
      { start: '10.0.0.1', end: '10.0.0.10', credential_ids: ['cred-a'] },
      { start: '10.0.1.1', end: '10.0.1.10', credential_ids: ['cred-b'] },
    ]);
    assert.deepEqual(warnings, []);
  });

  test('hostname no participa de la heurística (no se puede saber su rango sin resolver)', () => {
    const warnings = overlappingCredentialWarnings([
      { hostname: 'algo.local', credential_ids: ['cred-a'] },
      { start: '10.0.0.1', end: '10.0.0.10', credential_ids: ['cred-b'] },
    ]);
    assert.deepEqual(warnings, []);
  });

  test('nunca lanza, incluso con specs inválidos mezclados', () => {
    assert.doesNotThrow(() => overlappingCredentialWarnings([{ cidr: 'basura' } as IpRangeSpecInput, { start: '10.0.0.1', end: '10.0.0.2' }]));
  });

  test('un rango deshabilitado no genera warning de superposición (no se compila, no puede pisar a nadie)', () => {
    assert.deepEqual(overlappingCredentialWarnings([
      { label: 'A', start: '10.0.0.1', end: '10.0.0.50', credential_ids: ['cred-a'], enabled: false },
      { label: 'B', cidr: '10.0.0.0/24' },
    ]), []);
  });
});
