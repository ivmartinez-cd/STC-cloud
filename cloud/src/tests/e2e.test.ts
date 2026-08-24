// E2E Integration Tests — requieren el backend corriendo en localhost:3000
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/e2e.test.ts
//
// IMPORTANTE: Requiere que exista al menos un cliente en la BD.
// Crear uno con: npm run seed

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

// ─── Estado compartido entre tests (ejecución secuencial) ────────────────────

const ctx = {
  portalToken:    '',
  clientId:       '',
  agentId:        '',
  agentKey:       '',
  agentToken:     '',
  refreshToken:   '',
  deviceSerial:   `SN-E2E-${Date.now()}`,
  freshAgentId:   '',
  freshAgentToken:'',
  freshRefresh:   '',
};

// ─── Helper HTTP ─────────────────────────────────────────────────────────────

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Health', () => {
  test('GET /health returns 200', async () => {
    const res = await fetch(`${API.replace('/api/v1', '')}/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'ok');
  });
});

describe('Portal Auth', () => {
  test('Login con credenciales incorrectas → 401', async () => {
    const { status } = await req('POST', '/portal/login', { username: 'wrong', password: 'wrong' });
    assert.equal(status, 401);
  });

  test('Login con credenciales válidas → 200 con token', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(status, 200);
    assert.ok(data.token, 'Debe retornar un JWT');
    ctx.portalToken = data.token;
  });

  test('Dashboard sin token → 401', async () => {
    const { status } = await req('GET', '/dashboard');
    assert.equal(status, 401);
  });

  test('Dashboard con token de portal → 200 con stats', async () => {
    const { status, data } = await req('GET', '/dashboard', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(data.stats, 'Debe retornar stats');
    assert.ok('devices' in data.stats && 'agents' in data.stats, 'Stats incompletas');
  });

  // Fase 6 del gap analysis vs HP SDS — shape de los campos nuevos del dashboard.
  test('Dashboard: agentVersions y alertsByClass tienen la forma esperada', async () => {
    const { status, data } = await req('GET', '/dashboard', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.agentVersions), 'agentVersions debe ser un array');
    assert.ok(typeof data.currentAgentVersion === 'string', 'currentAgentVersion debe venir como string');
    assert.ok(Array.isArray(data.alertsByClass), 'alertsByClass debe ser un array');
    for (const row of data.alertsByClass) {
      assert.ok(typeof row.alert_class === 'string' && typeof row.label === 'string' && typeof row.count === 'number');
    }
    assert.equal(typeof data.stats.agents.reporting, 'number', 'stats.agents.reporting debe existir');
    assert.equal(typeof data.stats.devicesUnmanaged, 'number', 'stats.devicesUnmanaged debe existir');
    assert.ok(data.discovered && typeof data.discovered.today === 'number' && typeof data.discovered.pendingTotal === 'number');
  });

  test('Lista de clientes → 200', async () => {
    const { status, data } = await req('GET', '/clients', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data), 'Debe retornar array');
    assert.ok(data.length > 0, 'Necesita al menos un cliente (ejecutar npm run seed)');
    ctx.clientId = data[0].id;
  });
});

describe('Ciclo de vida del agente', () => {
  test('Crear agente → retorna activation key', async () => {
    const { status, data } = await req('POST', '/agents', {
      clientId: ctx.clientId,
      name:     'Agente E2E Test',
    }, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(data.key,     'Debe retornar key');
    assert.ok(data.agentId, 'Debe retornar agentId');
    assert.equal(data.key.length, 64, 'Key debe tener 64 chars hex');
    ctx.agentId  = data.agentId;
    ctx.agentKey = data.key;
  });

  test('Activar con llave incorrecta → 401', async () => {
    const { status } = await req('POST', '/agents/activate', {
      key:        'a'.repeat(64),
      hardwareId: 'TEST-HW-INVALID',
    });
    assert.equal(status, 401);
  });

  test('Activar con llave válida → JWT + refresh token', async () => {
    const { status, data } = await req('POST', '/agents/activate', {
      key:        ctx.agentKey,
      hardwareId: 'TEST-HW-E2E-001',
    });
    assert.equal(status, 200);
    assert.ok(data.token,         'Debe retornar JWT');
    assert.ok(data.refresh_token, 'Debe retornar refresh_token');
    ctx.agentToken  = data.token;
    ctx.refreshToken = data.refresh_token;
  });

  test('Reusar llave de activación → 401 (one-time use)', async () => {
    const { status } = await req('POST', '/agents/activate', {
      key:        ctx.agentKey,
      hardwareId: 'TEST-HW-E2E-DUP',
    });
    assert.equal(status, 401);
  });

  test('Lista de agentes refleja el nuevo agente', async () => {
    const { status, data } = await req('GET', '/agents', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
    const created = data.find((a: any) => a.id === ctx.agentId);
    assert.ok(created,                     'Agente creado debe aparecer en la lista');
    assert.equal(created.status, 'active', 'Estado debe ser active tras activación');
    assert.equal(created.hardware_id, 'TEST-HW-E2E-001', 'hardware_id debe estar guardado');
  });
});

describe('Heartbeat', () => {
  test('Agente envía heartbeat → 200', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {
      version:     '1.0.0-test',
      deviceCount: 5,
      snmpErrors:  0,
      memoryMb:    48,
    }, ctx.agentToken);
    assert.equal(status, 200);
  });

  test('Token de portal no puede hacer heartbeat → 403', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`,
      { version: '1.0.0' }, ctx.portalToken);
    assert.equal(status, 403);
  });

  test('Sin token no puede hacer heartbeat → 401', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`,
      { version: '1.0.0' });
    assert.equal(status, 401);
  });
});

describe('Registro y sincronización de dispositivos', () => {
  test('Registrar dispositivo → 200', async () => {
    const { status } = await req('POST', '/devices/register', {
      devices: [{
        ip:     '192.168.100.50',
        mac:    null,
        serial: ctx.deviceSerial,
        brand:  'hp',
        model:  'HP LaserJet Pro M404n',
        name:   'Impresora E2E',
      }],
    }, ctx.agentToken);
    assert.equal(status, 200);
  });

  test('Sincronizar lectura → 200', async () => {
    const { status, data } = await req('POST', '/devices/sync', {
      readings: [{
        device_id:    ctx.deviceSerial,
        ip:           '192.168.100.50',
        brand:        'hp',
        time:         new Date().toISOString(),
        total_pages:  24500,
        mono_pages:   21000,
        color_pages:  3500,
        toner_black:  75,
        toner_cyan:   60,
        toner_magenta: 55,
        toner_yellow:  80,
        status:       'idle',
        offline:      false,
      }],
    }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.count, 1);
  });

  test('Sync rechaza más de 500 lecturas → 400', async () => {
    const readings = Array.from({ length: 501 }, (_, i) => ({
      device_id:   `SN-OVERFLOW-${i}`,
      time:        new Date().toISOString(),
      total_pages: i,
    }));
    const { status } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 400);
  });

  test('Lecturas del dispositivo accesibles desde portal', async () => {
    // El device_id en la BD es un UUID asignado al serial — buscar vía /clients/:id/devices
    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    const device = devicesData.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device, 'Dispositivo registrado debe aparecer en lista del cliente');

    const { status, data } = await req('GET', `/devices/${device.id}/readings?limit=10`, undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data) && data.length > 0, 'Debe haber lecturas guardadas');
    assert.equal(data[0].total_pages, 24500, 'El valor de páginas debe coincidir');
  });

  test('Sync con reading_id repetido no duplica la lectura (idempotencia)', async () => {
    const readingId = crypto.randomUUID();
    const dedupReading = {
      reading_id:   readingId,
      device_id:    ctx.deviceSerial,
      ip:           '192.168.100.50',
      brand:        'hp',
      time:         new Date().toISOString(),
      total_pages:  99999,
      offline:      false,
    };

    const first = await req('POST', '/devices/sync', { readings: [dedupReading] }, ctx.agentToken);
    assert.equal(first.status, 200);
    assert.equal(first.data.inserted, 1);
    assert.equal(first.data.duplicates, 0);

    // Reintento del mismo lote (simula respuesta perdida y reenvío del agente)
    const retry = await req('POST', '/devices/sync', { readings: [dedupReading] }, ctx.agentToken);
    assert.equal(retry.status, 200);
    assert.equal(retry.data.inserted, 0);
    assert.equal(retry.data.duplicates, 1);

    // No debe haber quedado una fila duplicada con ese total_pages
    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    const device = devicesData.find((d: any) => d.serial_number === ctx.deviceSerial);
    const { data: readingsData } = await req('GET', `/devices/${device.id}/readings?limit=500`, undefined, ctx.portalToken);
    const matches = readingsData.filter((r: any) => r.total_pages === 99999);
    assert.equal(matches.length, 1, 'Debe existir una unica fila para ese reading_id, no duplicada');
  });
});

describe('Concurrencia del sync (batching, auditoría de capacidad 200+ clientes)', () => {
  test('Lote con 12 dispositivos distintos en un solo sync → los 12 se registran e insertan', async () => {
    const prefix = `SN-CONC-${Date.now()}`;
    const readings = Array.from({ length: 12 }, (_, i) => ({
      device_id:   `${prefix}-${i}`,
      ip:          `192.168.101.${10 + i}`,
      brand:       'hp',
      model:       `HP Concurrencia ${i}`,
      time:        new Date().toISOString(),
      total_pages: 1000 + i,
      offline:     false,
    }));
    const { status, data } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.inserted, 12, 'las 12 lecturas de dispositivos distintos deben insertarse');

    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    for (let i = 0; i < 12; i++) {
      const device = devicesData.find((d: any) => d.serial_number === `${prefix}-${i}`);
      assert.ok(device, `dispositivo ${i} debe existir`);
      // devices.total_pages es BIGINT -> node-pg lo devuelve como string.
      assert.equal(Number(device.total_pages), 1000 + i, `dispositivo ${i} debe tener su propio total_pages, sin mezclarse con otro del lote`);
    }
  });

  test('Una lectura con supplies_details corrupto no tumba el resto del lote (aislamiento por lectura preservado)', async () => {
    const prefix = `SN-CONC-BAD-${Date.now()}`;
    const readings = [
      { device_id: `${prefix}-ok1`, ip: '192.168.101.201', brand: 'hp', time: new Date().toISOString(), total_pages: 500, offline: false },
      // supplies_details string no-JSON → JSON.parse tira adentro de processReading
      { device_id: `${prefix}-bad`, ip: '192.168.101.202', brand: 'hp', time: new Date().toISOString(), total_pages: 600, offline: false, supplies_details: '{esto no es json' },
      { device_id: `${prefix}-ok2`, ip: '192.168.101.203', brand: 'hp', time: new Date().toISOString(), total_pages: 700, offline: false },
    ];
    const { status, data } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.inserted, 2, 'las 2 lecturas buenas deben insertarse aunque la del medio falle');

    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    assert.ok(devicesData.find((d: any) => d.serial_number === `${prefix}-ok1`), 'ok1 debe existir');
    assert.ok(devicesData.find((d: any) => d.serial_number === `${prefix}-ok2`), 'ok2 debe existir');
    // El upsert del dispositivo corre ANTES del JSON.parse que revienta (más
    // abajo, al sincronizar alertas EWS) — comportamiento preexistente, no
    // introducido por el refactor: el dispositivo "bad" sí se crea/actualiza,
    // sólo su LECTURA queda afuera de `readings` (ya cubierto arriba por
    // `inserted === 2`, no 3).
    assert.ok(devicesData.find((d: any) => d.serial_number === `${prefix}-bad`), 'bad sí debe existir como dispositivo (el upsert corre antes del parseo que falla)');
  });

  test('Dos lecturas del MISMO dispositivo en un solo lote se procesan en orden (sin lost-update)', async () => {
    const serial = `SN-CONC-SAME-${Date.now()}`;
    const readings = [
      { device_id: serial, ip: '192.168.101.210', brand: 'hp', model: 'HP Same-Device', time: new Date(Date.now() - 1000).toISOString(), total_pages: 100, offline: false },
      { device_id: serial, ip: '192.168.101.210', brand: 'hp', model: 'HP Same-Device', time: new Date().toISOString(), total_pages: 200, offline: false },
    ];
    const { status, data } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.inserted, 2, 'ambas lecturas del mismo dispositivo deben insertarse en el historial');

    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    const device = devicesData.find((d: any) => d.serial_number === serial);
    assert.ok(device, 'el dispositivo debe existir una sola vez, no duplicado');
    assert.equal(Number(device.total_pages), 200, 'el estado final debe reflejar la ÚLTIMA lectura del lote (100→200), no quedar en un valor intermedio por una carrera');
  });
});

describe('Detección de reset de contador y volumen mensual', () => {
  const resetDeviceSerial = `SN-E2E-RESET-${Date.now()}`;
  let resetDeviceId = '';

  test('Registrar dispositivo dedicado → 200', async () => {
    const { status } = await req('POST', '/devices/register', {
      devices: [{
        ip:     '192.168.100.51',
        mac:    null,
        serial: resetDeviceSerial,
        brand:  'hp',
        model:  'HP LaserJet Pro M404n',
        name:   'Impresora E2E Reset',
      }],
    }, ctx.agentToken);
    assert.equal(status, 200);
  });

  test('Sincronizar secuencia con reset (100 → 150 → 5 → 60)', async () => {
    const base = Date.now();
    const sequence = [100, 150, 5, 60];
    for (let i = 0; i < sequence.length; i++) {
      const { status } = await req('POST', '/devices/sync', {
        readings: [{
          reading_id:  crypto.randomUUID(),
          device_id:   resetDeviceSerial,
          ip:          '192.168.100.51',
          brand:       'hp',
          time:        new Date(base + i * 1000).toISOString(),
          total_pages: sequence[i],
          offline:     false,
        }],
      }, ctx.agentToken);
      assert.equal(status, 200);
    }
  });

  test('monthly_pages usa suma de deltas positivos, no MAX-MIN', async () => {
    const { status, data } = await req('GET', `/agents/${ctx.agentId}/devices`, undefined, ctx.portalToken);
    assert.equal(status, 200);
    const device = data.find((d: any) => d.serial_number === resetDeviceSerial);
    assert.ok(device, 'El dispositivo dedicado debe aparecer en la lista del agente');
    resetDeviceId = device.id;
    // Con MAX-MIN hubiese dado 150-5=145 (inflado por el reset). Correcto: 50+0+55=105.
    assert.equal(device.monthly_pages, 105, 'monthly_pages debe ser 105, no 145 (MAX-MIN)');
  });

  test('Se genera una alerta counter_reset', async () => {
    const { status, data } = await req('GET', `/alerts?device_id=${resetDeviceId}`, undefined, ctx.portalToken);
    assert.equal(status, 200);
    const resetAlert = data.find((a: any) => a.type === 'counter_reset');
    assert.ok(resetAlert, 'Debe existir una alerta de tipo counter_reset');
    assert.equal(resetAlert.severity, 'critical');
  });
});

describe('Seguridad mínima', () => {
  test('Login setea cookies de sesión y CSRF; mutación sin header CSRF → 403, con header → 200', async () => {
    const loginRes = await fetch(`${API}/portal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    assert.equal(loginRes.status, 200);

    const setCookies = loginRes.headers.getSetCookie();
    const sessionCookie = setCookies.find(c => c.startsWith('stc_session='))?.split(';')[0];
    const csrfCookie = setCookies.find(c => c.startsWith('stc_csrf='))?.split(';')[0];
    assert.ok(sessionCookie, 'Debe setear cookie de sesión stc_session');
    assert.ok(csrfCookie, 'Debe setear cookie CSRF stc_csrf (no httpOnly)');
    const csrfValue = csrfCookie!.split('=')[1];
    const cookieHeader = `${sessionCookie}; ${csrfCookie}`;

    const withoutCsrf = await fetch(`${API}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ name: 'CSRF Test Client (sin header)' }),
    });
    assert.equal(withoutCsrf.status, 403);

    const withCsrf = await fetch(`${API}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrfValue },
      body: JSON.stringify({ name: 'CSRF Test Client (con header)' }),
    });
    assert.equal(withCsrf.status, 200);
  });

  test('createClient descarta campos que no son columnas reales (mass assignment)', async () => {
    const { status, data } = await req('POST', '/clients', {
      name: 'Cliente Whitelist Test',
      contact_email: 'test@example.com',
      business_name: 'Nombre Falso Inventado',
    }, ctx.portalToken);
    assert.equal(status, 200);
    assert.equal(data.name, 'Cliente Whitelist Test');
    assert.equal(data.contact_email, 'test@example.com');
    assert.equal(data.business_name, undefined, 'Campos que no son columnas reales no deben persistirse');
  });

  test('DELETE /devices/offline sin agent_id → 400', async () => {
    const { status } = await req('DELETE', '/devices/offline', undefined, ctx.portalToken);
    assert.equal(status, 400);
  });
});

describe('Rotación de refresh token', () => {
  test('Setup: crear segundo agente para prueba de refresh', async () => {
    const { data: createData } = await req('POST', '/agents', {
      clientId: ctx.clientId, name: 'Agente E2E Refresh',
    }, ctx.portalToken);
    ctx.freshAgentId = createData.agentId;

    const { data: actData } = await req('POST', '/agents/activate', {
      key: createData.key, hardwareId: 'TEST-HW-REFRESH',
    });
    ctx.freshAgentToken = actData.token;
    ctx.freshRefresh    = actData.refresh_token;
  });

  test('Refresh retorna nuevo JWT y nuevo refresh token', async () => {
    const { status, data } = await req('POST', '/agents/refresh', {
      agentId:       ctx.freshAgentId,
      refresh_token: ctx.freshRefresh,
    });
    assert.equal(status, 200);
    assert.ok(data.token,         'Debe retornar nuevo JWT');
    assert.ok(data.refresh_token, 'Debe retornar nuevo refresh_token');
    assert.notEqual(data.token,         ctx.freshAgentToken, 'JWT debe ser diferente');
    assert.notEqual(data.refresh_token, ctx.freshRefresh,    'Refresh token debe ser diferente');
    ctx.freshAgentToken = data.token;
    ctx.freshRefresh    = data.refresh_token;
  });

  test('Refresh token inválido → 401', async () => {
    const { status } = await req('POST', '/agents/refresh', {
      agentId:       ctx.freshAgentId,
      refresh_token: 'f'.repeat(128), // token incorrecto
    });
    assert.equal(status, 401);
  });
});

describe('Revocación de agente', () => {
  test('Portal revoca agente → 200', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/revoke`, {}, ctx.portalToken);
    assert.equal(status, 200);
  });

  test('Agente revocado no puede hacer heartbeat → 404', async () => {
    // agentAuth responde 404 ("Agente no encontrado o revocado") antes de consultar
    // la blacklist de Redis (que daría 401). Ver authMiddleware.ts.
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`,
      { version: '1.0.0' }, ctx.agentToken);
    assert.equal(status, 404);
  });

  test('Agente revocado aparece como revoked en lista', async () => {
    const { data } = await req('GET', '/agents', undefined, ctx.portalToken);
    const revoked = data.find((a: any) => a.id === ctx.agentId);
    assert.equal(revoked?.status, 'revoked');
  });

  // Fase 6 del gap analysis vs HP SDS — bug real: `agentsStats` no filtraba
  // status='revoked' (offlineAgents sí lo hacía), así que un agente revocado
  // inflaba `stats.agents.total` para siempre. Envuelve el revoke de
  // `freshAgentId` (agente dedicado de la suite de refresh token, no se
  // reusa después) con una lectura del dashboard antes/después.
  test('Cleanup: revocar agente de refresh test — no debe inflar stats.agents.total', async () => {
    const before = await req('GET', '/dashboard', undefined, ctx.portalToken);
    const totalBefore = before.data.stats.agents.total;

    const { status } = await req('POST', `/agents/${ctx.freshAgentId}/revoke`, {}, ctx.portalToken);
    assert.equal(status, 200);

    const after = await req('GET', '/dashboard', undefined, ctx.portalToken);
    assert.equal(after.data.stats.agents.total, totalBefore - 1, 'un agente revocado no debe contar en stats.agents.total');
  });
});
