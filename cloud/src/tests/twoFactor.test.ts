// 2FA TOTP opt-in (bloque de seguridad post gap analysis) — unitarios con
// los vectores oficiales del RFC 6238 + e2e del ciclo completo de
// enrolamiento y login contra el stack real.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/twoFactor.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  otpauthUri,
  totpAt,
  verifyTotp,
} from '../modules/two-factor/domain/totp';
import {
  formatRecoveryCode,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  normalizeRecoveryCode,
} from '../modules/two-factor/domain/recovery-codes';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

/**
 * `POST /portal/login` tiene rate-limit propio (10/min, authRoutes.ts) — este
 * archivo por sí solo hace más de 10 logins en <2s. No es un bug de producto
 * (el límite es correcto contra fuerza bruta real); se drena la key entre
 * bloques del archivo, mismo mecanismo manual que ya se usa para depurar esto
 * (`docker exec stc_redis redis-cli DEL ...`), sólo que automatizado acá.
 */
async function drainLoginRateLimit(): Promise<void> {
  const { execSync } = await import('node:child_process');
  try {
    execSync('docker exec stc_redis redis-cli DEL "fastify-rate-limit-POST/api/v1/portal/login-172.22.0.1"', { stdio: 'ignore' });
  } catch {
    // best-effort: si no hay docker (CI distinta), el test puede tardar más por el 429 natural
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

describe('TOTP — dominio puro (vectores RFC 6238, SHA-1)', () => {
  // Secreto de los vectores oficiales: "12345678901234567890" en ASCII.
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  test('vectores del RFC (últimos 6 dígitos de los de 8)', () => {
    // Apéndice B del RFC 6238: time=59s → 94287082, 1111111109 → 07081804,
    // 1234567890 → 89005924, 2000000000 → 69279037.
    assert.equal(totpAt(rfcSecret, 59 * 1000), '287082');
    assert.equal(totpAt(rfcSecret, 1111111109 * 1000), '081804');
    assert.equal(totpAt(rfcSecret, 1234567890 * 1000), '005924');
    assert.equal(totpAt(rfcSecret, 2000000000 * 1000), '279037');
  });

  test('base32 roundtrip y rechazo de caracteres inválidos', () => {
    const bytes = Buffer.from('secreto-de-prueba-123');
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
    assert.throws(() => base32Decode('AB1!')); // 1 y ! no son base32
  });

  test('verify acepta ±1 paso y rechaza ±2', () => {
    const now = 1234567890 * 1000;
    const code = totpAt(rfcSecret, now);
    assert.equal(verifyTotp(rfcSecret, code, now), true);
    assert.equal(verifyTotp(rfcSecret, code, now + 30_000), true,  'paso siguiente dentro de la ventana');
    assert.equal(verifyTotp(rfcSecret, code, now - 30_000), true,  'paso anterior dentro de la ventana');
    assert.equal(verifyTotp(rfcSecret, code, now + 90_000), false, 'fuera de la ventana');
    assert.equal(verifyTotp(rfcSecret, 'abcdef', now), false, 'no-dígitos rechazado sin lanzar');
  });

  test('otpauth URI escapa issuer y cuenta', () => {
    const uri = otpauthUri('STC Cloud', 'user@x', 'ABC234');
    assert.ok(uri.startsWith('otpauth://totp/STC%20Cloud:user%40x?secret=ABC234'));
  });
});

describe('Códigos de recuperación — dominio puro', () => {
  test('formato XXXXX-XXXXX sin caracteres ambiguos, determinista por bytes', () => {
    const code = formatRecoveryCode(Buffer.alloc(16, 7));
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
    assert.equal(code, formatRecoveryCode(Buffer.alloc(16, 7)));
  });

  test('looksLikeRecoveryCode distingue TOTP de recovery', () => {
    assert.equal(looksLikeRecoveryCode('ABCDE-FGHJK'), true);
    assert.equal(looksLikeRecoveryCode('abcdefghjk'), true, 'sin guión también');
    assert.equal(looksLikeRecoveryCode('123456'), false, 'un TOTP no matchea');
  });

  test('hash normaliza mayúsculas y guión (el usuario puede tipearlo como sea)', () => {
    assert.equal(hashRecoveryCode('abcde-fghjk'), hashRecoveryCode('ABCDEFGHJK'));
    assert.equal(normalizeRecoveryCode('ab2de-fg4jk'), 'AB2DE-FG4JK');
  });
});

const ts = Date.now();
const ctx = {
  adminToken: '', username: `twofa_user_${ts}`, password: 'TwoFa1234!', userToken: '', secret: '',
  recoveryCodes: [] as string[],
};

describe('2FA — ciclo completo e2e', () => {
  test('setup: admin crea un operador de prueba y este loguea', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const created = await req('POST', '/portal/users', {
      username: ctx.username, password: ctx.password, role: 'operator',
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const userLogin = await req('POST', '/portal/login', { username: ctx.username, password: ctx.password });
    assert.equal(userLogin.status, 200);
    ctx.userToken = userLogin.data.token;
  });

  test('enable sin setup previo → 400', async () => {
    const res = await req('POST', '/portal/2fa/enable', { code: '000000' }, ctx.userToken);
    assert.equal(res.status, 400);
  });

  test('setup devuelve secreto base32 + otpauth URI, status sigue disabled', async () => {
    const res = await req('POST', '/portal/2fa/setup', {}, ctx.userToken);
    assert.equal(res.status, 200);
    assert.match(res.data.secret, /^[A-Z2-7]{32}$/);
    assert.ok(res.data.otpauth_uri.startsWith('otpauth://totp/'));
    ctx.secret = res.data.secret;
    const status = await req('GET', '/portal/2fa/status', undefined, ctx.userToken);
    assert.equal(status.data.enabled, false, 'pendiente hasta confirmar con código');
  });

  test('enable con código inválido → 400; con código real → activo + 10 códigos de recuperación', async () => {
    const bad = await req('POST', '/portal/2fa/enable', { code: '000000' }, ctx.userToken);
    assert.equal(bad.status, 400);
    const ok = await req('POST', '/portal/2fa/enable', { code: totpAt(ctx.secret, Date.now()) }, ctx.userToken);
    assert.equal(ok.status, 200);
    assert.equal(ok.data.recovery_codes.length, 10);
    assert.ok(ok.data.recovery_codes.every((c: string) => looksLikeRecoveryCode(c)));
    ctx.recoveryCodes = ok.data.recovery_codes;
    const status = await req('GET', '/portal/2fa/status', undefined, ctx.userToken);
    assert.equal(status.data.enabled, true);
    assert.equal(status.data.recovery_remaining, 10);
  });

  test('login sin código → 401 con totp_required; con código inválido → 401; con código válido → 200', async () => {
    const noCode = await req('POST', '/portal/login', { username: ctx.username, password: ctx.password });
    assert.equal(noCode.status, 401);
    assert.equal(noCode.data.totp_required, true);
    assert.ok(!noCode.data.token, 'sin código no debe emitirse token');

    const badCode = await req('POST', '/portal/login', {
      username: ctx.username, password: ctx.password, totp_code: '000000',
    });
    assert.equal(badCode.status, 401);

    const withCode = await req('POST', '/portal/login', {
      username: ctx.username, password: ctx.password, totp_code: totpAt(ctx.secret, Date.now()),
    });
    assert.equal(withCode.status, 200);
    assert.ok(withCode.data.token);
    ctx.userToken = withCode.data.token;
  });

  test('la contraseña incorrecta NO revela totp_required (sin oráculo)', async () => {
    const res = await req('POST', '/portal/login', { username: ctx.username, password: 'incorrecta123' });
    assert.equal(res.status, 401);
    assert.equal(res.data.totp_required, undefined);
  });

  test('login con código de recuperación → 200 y el código queda quemado', async () => {
    const rc = ctx.recoveryCodes[0];
    const withRecovery = await req('POST', '/portal/login', {
      username: ctx.username, password: ctx.password, totp_code: rc,
    });
    assert.equal(withRecovery.status, 200);
    const reuse = await req('POST', '/portal/login', {
      username: ctx.username, password: ctx.password, totp_code: rc,
    });
    assert.equal(reuse.status, 401, 'un código de recuperación es de un solo uso');
    const status = await req('GET', '/portal/2fa/status', undefined, ctx.userToken);
    assert.equal(status.data.recovery_remaining, 9);
  });

  test('regenerar códigos exige TOTP vigente e invalida los anteriores', async () => {
    const bad = await req('POST', '/portal/2fa/recovery-codes', { code: '000000' }, ctx.userToken);
    assert.equal(bad.status, 400);
    const ok = await req('POST', '/portal/2fa/recovery-codes', { code: totpAt(ctx.secret, Date.now()) }, ctx.userToken);
    assert.equal(ok.status, 200);
    assert.equal(ok.data.recovery_codes.length, 10);
    // uno de los VIEJOS (índice 1, nunca usado) ya no sirve
    const oldCode = await req('POST', '/portal/login', {
      username: ctx.username, password: ctx.password, totp_code: ctx.recoveryCodes[1],
    });
    assert.equal(oldCode.status, 401);
    ctx.recoveryCodes = ok.data.recovery_codes;
    const status = await req('GET', '/portal/2fa/status', undefined, ctx.userToken);
    assert.equal(status.data.recovery_remaining, 10);
  });

  test('setup con 2FA activo → 409 (no se puede regenerar sin código)', async () => {
    const res = await req('POST', '/portal/2fa/setup', {}, ctx.userToken);
    assert.equal(res.status, 409);
  });

  test('disable con código inválido → 400; con válido → login vuelve a ser solo contraseña', async () => {
    const bad = await req('POST', '/portal/2fa/disable', { code: '000000' }, ctx.userToken);
    assert.equal(bad.status, 400);
    const ok = await req('POST', '/portal/2fa/disable', { code: totpAt(ctx.secret, Date.now()) }, ctx.userToken);
    assert.equal(ok.status, 200);
    const plain = await req('POST', '/portal/login', { username: ctx.username, password: ctx.password });
    assert.equal(plain.status, 200);
    const status = await req('GET', '/portal/2fa/status', undefined, ctx.userToken);
    assert.equal(status.data.recovery_remaining, 0, 'disable limpia los códigos');
  });

  test('drenar rate-limit de login antes del bloque 6.3', async () => {
    await drainLoginRateLimit();
  });

  test('6.3: usuario con totp_required debe enrolar antes de operar', async () => {
    const username = `twofa_forced_${ts}`;
    const created = await req('POST', '/portal/users', {
      username, password: 'Forced1234!', role: 'operator', totp_required: true,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    assert.equal(created.data.totp_required, true);

    const login = await req('POST', '/portal/login', { username, password: 'Forced1234!' });
    assert.equal(login.status, 200, 'el login en sí está permitido');
    assert.equal(login.data.totp_enrollment_required, true);
    const forcedToken = login.data.token;

    const blocked = await req('GET', '/clients', undefined, forcedToken);
    assert.equal(blocked.status, 403, 'sin enrolar no opera');
    assert.equal(blocked.data.totp_enrollment_required, true);

    const me = await req('GET', '/portal/me', undefined, forcedToken);
    assert.equal(me.status, 200, '/me queda accesible para el portal');
    const status2fa = await req('GET', '/portal/2fa/status', undefined, forcedToken);
    assert.equal(status2fa.status, 200, 'las rutas de enrolamiento quedan accesibles');

    // Enrola y el bloqueo desaparece
    const setup = await req('POST', '/portal/2fa/setup', {}, forcedToken);
    assert.equal(setup.status, 200);
    const enable = await req('POST', '/portal/2fa/enable', { code: totpAt(setup.data.secret, Date.now()) }, forcedToken);
    assert.equal(enable.status, 200);
    const unblocked = await req('GET', '/clients', undefined, forcedToken);
    assert.equal(unblocked.status, 200, 'enrolado, opera normal');

    // El admin puede levantar la exigencia por PUT
    const relax = await req('PUT', `/portal/users/${created.data.id}`, { totp_required: false }, ctx.adminToken);
    assert.equal(relax.status, 200);
    assert.equal(relax.data.totp_required, false);
  });

  test('queda auditado el alta y la baja de 2FA', async () => {
    const res = await req('GET', `/audit-logs?action=USER_2FA_ENABLED&limit=5`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.items.length >= 1);
  });
});
