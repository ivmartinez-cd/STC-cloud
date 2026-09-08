import Redis from "ioredis";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

// Corre cada archivo de test en un proceso `tsx --test` separado, con un
// FLUSHDB de Redis entre uno y otro. Necesario porque el rate-limiter de
// Fastify comparte ventana de tiempo en Redis entre archivos si se corren
// todos en un solo proceso `node --test <a> <b> ...` — mismo 429 falso que
// ya se ve corriendo el `npm test` combinado en local (no es una regresión
// real, es la ventana de rate-limit pisándose entre archivos).

const TESTS_DIR = "src/tests";

// Ningún archivo de test se puede quedar afuera de CI por olvido (auditoría
// 2026-09-08): la lista de acá abajo se había desfasado del disco y CI corría
// 52 de los 65 archivos existentes. Los 13 ausentes no fallaban — simplemente
// no se ejecutaban — y `check-coverage.mjs` calculaba la cobertura sobre esa
// suite incompleta. Ya había pasado antes con `clientDirectory`/
// `clientDeviceDirectory`, así que el modo de falla es la lista, no las
// entradas.
//
// El arreglo es de INCLUSIÓN, no de orden: `KNOWN_ORDER` fija la secuencia
// histórica y `discoverTestFiles()` le agrega al final todo `.test.ts` del
// disco que no esté listado. Un archivo nuevo entra a CI por existir; los que
// ya estaban corren exactamente en el mismo orden que antes.
//
// El orden importa y NO se puede alfabetizar: `ewsProxyRelay.test.ts` espera
// 800ms fijos a que le llegue un publish de Redis y falla de forma
// reproducible si corre antes de lo que corría (verificado en 2 corridas
// limpias al intentar ordenar alfabético). Mientras ese test dependa de un
// sleep fijo, mover archivos de lugar es un cambio riesgoso: agregá al final.
const KNOWN_ORDER = [
  "e2e.test.ts",
  "e2eDeviceSync.test.ts",
  "e2eSecurityAndTokens.test.ts",
  "rbac.test.ts",
  "rbacDevicesSearch.test.ts",
  "rbacMutationsDenied1.test.ts",
  "rbacMutationsDenied2.test.ts",
  "clientDirectory.test.ts",
  "clientDeviceDirectory.test.ts",
  "alertCatalog.test.ts",
  "alerts.test.ts",
  "alertsEwsRegression.test.ts",
  "alertsWebhookGuard.test.ts",
  "alertDigest.test.ts",
  "reports.test.ts",
  "deviceLifecycle.test.ts",
  "deviceDuplicates.test.ts",
  "deviceLifecycleBulkActions.test.ts",
  "auditFeed.test.ts",
  "inventoryFields.test.ts",
  "monitorState.test.ts",
  "pendingDevices.test.ts",
  "supplies.test.ts",
  "supplyOrigin.test.ts",
  "incidents.test.ts",
  "incidentAutoRules.test.ts",
  "scheduledReports.test.ts",
  "supplyRequests.test.ts",
  "messageTemplates.test.ts",
  "emailLog.test.ts",
  "deviceCosts.test.ts",
  "remoteActions.test.ts",
  "observability.test.ts",
  "twoFactor.test.ts",
  "snmpCredentials.test.ts",
  "ipRangeSpec.test.ts",
  "ipRangeSpecCompile.test.ts",
  "businessHours.test.ts",
  "ipRangesCredentials.test.ts",
  "publicApi.test.ts",
  "publicApiKeyExpiry.test.ts",
  "publicApiWebhookDelivery.test.ts",
  "deviceUsageHistory.test.ts",
  "ewsProxyService.test.ts",
  "portalAgentEws.test.ts",
  "ewsProxyRelay.test.ts",
  "customFieldRules.test.ts",
  "feedbackUseCases.test.ts",
  "systemSettings.test.ts",
  "agentLogsReport.test.ts",
  "sftpDestination.test.ts",
  "clientSftpDestination.test.ts",
];

function discoverTestFiles() {
  const onDisk = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();

  const known = KNOWN_ORDER.filter((f) => onDisk.includes(f));
  const discovered = onDisk.filter((f) => !KNOWN_ORDER.includes(f));

  const renamed = KNOWN_ORDER.filter((f) => !onDisk.includes(f));
  if (renamed.length > 0) {
    // Entrada de KNOWN_ORDER que ya no existe: rename o borrado sin limpiar
    // acá. No es fatal, pero se avisa para que la lista no se pudra otra vez.
    console.warn(`!!! KNOWN_ORDER menciona archivos inexistentes: ${renamed.join(", ")}`);
  }
  if (discovered.length > 0) {
    console.log(`Archivos nuevos (no listados en KNOWN_ORDER, corren al final): ${discovered.join(", ")}`);
  }

  return [...known, ...discovered].map((f) => `${TESTS_DIR}/${f}`);
}

// remoteActions.test.ts tarda ~4min de forma legítima (polling real) — el
// timeout tiene que dejarle margen. Es una red de seguridad: si CUALQUIER
// archivo se cuelga (p.ej. un listener de WS registrado después de perderse
// el evento, como pasó acá antes), esto lo mata a los 8min en vez de dejar
// el job entero colgado horas hasta el timeout de GitHub Actions.
const FILE_TIMEOUT_MS = 8 * 60 * 1000;

function runFile(file) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "--test", file], { stdio: "inherit" });
    const timer = setTimeout(() => {
      console.error(`\n!!! ${file} superó los ${FILE_TIMEOUT_MS / 1000}s — matando el proceso (probable cuelgue)`);
      child.kill("SIGKILL");
    }, FILE_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  const testFiles = discoverTestFiles();
  const failed = [];

  console.log(`Descubiertos ${testFiles.length} archivos de test en ${TESTS_DIR}/`);

  for (const file of testFiles) {
    await redis.flushdb();
    console.log(`\n=== ${file} ===`);
    const code = await runFile(file);
    if (code !== 0) failed.push(file);
  }

  await redis.quit();

  if (failed.length > 0) {
    console.error(`\n${failed.length} de ${testFiles.length} archivos fallaron:`);
    for (const f of failed) console.error(`  - ${f}`);
  } else {
    console.log(`\nOK: ${testFiles.length}/${testFiles.length} archivos.`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
