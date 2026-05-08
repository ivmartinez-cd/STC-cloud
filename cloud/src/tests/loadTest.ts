// Load Test — simula N agentes con autenticación real haciendo heartbeat + sync
//
// Uso:
//   npx tsx src/tests/loadTest.ts [opciones]
//
// Opciones:
//   --agents    <n>   Número de agentes concurrentes   (default: 10)
//   --readings  <n>   Lecturas por ciclo de sync        (default: 50)
//   --duration  <s>   Duración del test en segundos     (default: 30)
//   --api       <url> URL base del API                  (default: http://localhost:3000/api/v1)
//
// Requiere:
//   PORTAL_ADMIN_PASSWORD definida como variable de entorno
//   Al menos un cliente en la BD (npm run seed)

import crypto from 'crypto';

// ─── Argumentos ───────────────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const API          = arg('--api',      'http://localhost:3000/api/v1');
const NUM_AGENTS   = parseInt(arg('--agents',   '10'));
const SYNC_SIZE    = parseInt(arg('--readings',  '50'));
const DURATION_SEC = parseInt(arg('--duration',  '30'));
const ADMIN_USER   = process.env.PORTAL_ADMIN_USER     || 'admin';
const ADMIN_PASS   = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!ADMIN_PASS) {
  console.error('ERROR: PORTAL_ADMIN_PASSWORD no definida');
  process.exit(1);
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

interface Metrics {
  requests:  number;
  errors:    number;
  latencies: number[];
}

const metrics: Metrics = { requests: 0, errors: 0, latencies: [] };

function track(latencyMs: number, error = false) {
  metrics.requests++;
  if (error) metrics.errors++;
  else metrics.latencies.push(latencyMs);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function post(path: string, body: unknown, token?: string): Promise<{ ok: boolean; data: any; ms: number }> {
  const t0 = Date.now();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const ms   = Date.now() - t0;
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data, ms };
  } catch (e: any) {
    return { ok: false, data: { error: e.message }, ms: Date.now() - t0 };
  }
}

async function get(path: string, token: string): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: {} };
  }
}

// ─── Generador de lecturas fake ───────────────────────────────────────────────

function generateReadings(count: number, agentIdx: number) {
  return Array.from({ length: count }, (_, i) => ({
    device_id:    `SN-LOAD-${agentIdx}-${String(i % 5).padStart(3, '0')}`,
    ip:           `192.168.${agentIdx % 254}.${(i % 254) + 1}`,
    brand:        ['hp', 'lexmark', 'samsung', 'hp', 'hp'][i % 5],
    time:         new Date(Date.now() - i * 60000).toISOString(),
    total_pages:  Math.floor(Math.random() * 200000) + 1000,
    mono_pages:   Math.floor(Math.random() * 150000),
    color_pages:  Math.floor(Math.random() * 50000),
    toner_black:  Math.floor(Math.random() * 100),
    toner_cyan:   Math.floor(Math.random() * 100),
    toner_magenta:Math.floor(Math.random() * 100),
    toner_yellow: Math.floor(Math.random() * 100),
    status:       ['idle', 'printing', 'idle', 'idle', 'warmup'][Math.floor(Math.random() * 5)],
    offline:      false,
  }));
}

// ─── Ciclo de vida de un agente ───────────────────────────────────────────────

async function setupAgent(clientId: string, portalToken: string, idx: number): Promise<{ agentId: string; agentToken: string } | null> {
  // 1. Crear agente (generar activation key)
  const { ok: createOk, data: createData } = await post('/agents', {
    clientId,
    name: `Load Agent ${idx}`,
  }, portalToken);

  if (!createOk) {
    console.error(`[Agent ${idx}] Error al crear: ${createData.error}`);
    return null;
  }

  // 2. Activar
  const { ok: actOk, data: actData } = await post('/agents/activate', {
    key:        createData.key,
    hardwareId: `HW-LOAD-${idx}-${crypto.randomBytes(4).toString('hex')}`,
  });

  if (!actOk) {
    console.error(`[Agent ${idx}] Error al activar: ${actData.error}`);
    return null;
  }

  return { agentId: createData.agentId, agentToken: actData.token };
}

async function runAgentLoop(agentId: string, agentToken: string, idx: number, stopAt: number) {
  let cycle = 0;
  while (Date.now() < stopAt) {
    // Heartbeat
    const hb = await post(`/agents/${agentId}/heartbeat`, {
      version:     '1.0.0-load',
      deviceCount: SYNC_SIZE,
      snmpErrors:  0,
      memoryMb:    Math.floor(Math.random() * 60) + 20,
    }, agentToken);
    track(hb.ms, !hb.ok);

    // Sync lecturas (batches de SYNC_SIZE)
    const readings = generateReadings(SYNC_SIZE, idx);
    const sync = await post('/devices/sync', { readings }, agentToken);
    track(sync.ms, !sync.ok);

    if (!sync.ok && sync.data?.error?.includes('revocado')) break;

    cycle++;
    // Pequeña pausa para no saturar instantáneamente
    await new Promise(r => setTimeout(r, 500));
  }
  return cycle;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(' STC Cloud — Load Test');
  console.log(`  API     : ${API}`);
  console.log(`  Agentes : ${NUM_AGENTS}`);
  console.log(`  Lecturas: ${SYNC_SIZE} por sincronización`);
  console.log(`  Duración: ${DURATION_SEC}s`);
  console.log('='.repeat(60));

  // 1. Portal login
  const loginRes = await post('/portal/login', { username: ADMIN_USER, password: ADMIN_PASS });
  if (!loginRes.ok) {
    console.error('ERROR: No se pudo hacer login como portal:', loginRes.data);
    process.exit(1);
  }
  const portalToken = loginRes.data.token as string;
  console.log('[1/3] Login portal OK');

  // 2. Obtener primer cliente disponible
  const clientsRes = await fetch(`${API}/clients`, {
    headers: { Authorization: `Bearer ${portalToken}` },
  });
  const clients = await clientsRes.json() as any[];
  if (!clients?.length) {
    console.error('ERROR: No hay clientes. Ejecutar: npm run seed');
    process.exit(1);
  }
  const clientId = clients[0].id;
  console.log(`[2/3] Cliente: ${clients[0].name} (${clientId})`);

  // 3. Crear y activar N agentes
  console.log(`[3/3] Creando ${NUM_AGENTS} agentes...`);
  const setupResults = await Promise.all(
    Array.from({ length: NUM_AGENTS }, (_, i) => setupAgent(clientId, portalToken, i))
  );
  const agents = setupResults.filter(Boolean) as Array<{ agentId: string; agentToken: string }>;

  if (!agents.length) {
    console.error('ERROR: No se pudo crear ningún agente');
    process.exit(1);
  }
  console.log(`    ${agents.length}/${NUM_AGENTS} agentes listos\n`);

  // 4. Correr todos los loops en paralelo
  const stopAt   = Date.now() + DURATION_SEC * 1000;
  const t0       = Date.now();
  const start    = new Date().toLocaleTimeString();

  console.log(`Iniciando loops — ${start}`);
  const cycles = await Promise.all(
    agents.map(({ agentId, agentToken }, i) => runAgentLoop(agentId, agentToken, i, stopAt))
  );

  const elapsed = (Date.now() - t0) / 1000;

  // 5. Limpiar agentes de prueba
  await Promise.all(
    agents.map(({ agentId }) =>
      post(`/agents/${agentId}/revoke`, {}, portalToken)
    )
  );

  // 6. Reporte
  const sortedLat = [...metrics.latencies].sort((a, b) => a - b);
  const rps       = (metrics.requests / elapsed).toFixed(1);
  const errorPct  = ((metrics.errors / metrics.requests) * 100).toFixed(1);
  const totalReadings = cycles.reduce((s, c) => s + c * SYNC_SIZE, 0);

  console.log('\n' + '='.repeat(60));
  console.log(' RESULTADOS');
  console.log('='.repeat(60));
  console.log(`  Duración real    : ${elapsed.toFixed(1)}s`);
  console.log(`  Agentes activos  : ${agents.length}`);
  console.log(`  Ciclos totales   : ${cycles.reduce((a, b) => a + b, 0)}`);
  console.log(`  Lecturas enviadas: ${totalReadings.toLocaleString()}`);
  console.log(`  Requests totales : ${metrics.requests}`);
  console.log(`  Requests/seg     : ${rps}`);
  console.log(`  Errores          : ${metrics.errors} (${errorPct}%)`);
  console.log(`  Latencia p50     : ${percentile(sortedLat, 50)}ms`);
  console.log(`  Latencia p95     : ${percentile(sortedLat, 95)}ms`);
  console.log(`  Latencia p99     : ${percentile(sortedLat, 99)}ms`);
  console.log(`  Latencia máx     : ${sortedLat[sortedLat.length - 1] ?? 0}ms`);
  console.log('='.repeat(60));

  const exitCode = Number(errorPct) > 5 ? 1 : 0;
  if (exitCode === 1) console.log('\nFAIL: tasa de error > 5%');
  else console.log('\nPASS: tasa de error <= 5%');
  process.exit(exitCode);
}

main().catch(e => {
  console.error('ERROR FATAL:', e.message);
  process.exit(1);
});
