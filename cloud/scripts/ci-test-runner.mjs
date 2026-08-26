import Redis from "ioredis";
import { spawn } from "node:child_process";

// Corre cada archivo de test en un proceso `tsx --test` separado, con un
// FLUSHDB de Redis entre uno y otro. Necesario porque el rate-limiter de
// Fastify comparte ventana de tiempo en Redis entre archivos si se corren
// todos en un solo proceso `node --test <a> <b> ...` — mismo 429 falso que
// ya se ve corriendo el `npm test` combinado en local (no es una regresión
// real, es la ventana de rate-limit pisándose entre archivos).
const TEST_FILES = [
  "src/tests/e2e.test.ts",
  "src/tests/rbac.test.ts",
  // clientDirectory.test.ts/clientDeviceDirectory.test.ts faltaban acá (sólo
  // corrían via `npm test` local) — mismo criterio que el resto de este archivo,
  // se agregan para que CI también las ejecute.
  "src/tests/clientDirectory.test.ts",
  "src/tests/clientDeviceDirectory.test.ts",
  "src/tests/alertCatalog.test.ts",
  "src/tests/alerts.test.ts",
  "src/tests/alertDigest.test.ts",
  "src/tests/reports.test.ts",
  "src/tests/deviceLifecycle.test.ts",
  "src/tests/deviceLifecycleBulkActions.test.ts",
  "src/tests/auditFeed.test.ts",
  "src/tests/inventoryFields.test.ts",
  "src/tests/monitorState.test.ts",
  "src/tests/pendingDevices.test.ts",
  "src/tests/supplies.test.ts",
  "src/tests/supplyOrigin.test.ts",
  "src/tests/incidents.test.ts",
  "src/tests/incidentAutoRules.test.ts",
  "src/tests/scheduledReports.test.ts",
  "src/tests/supplyRequests.test.ts",
  "src/tests/messageTemplates.test.ts",
  "src/tests/emailLog.test.ts",
  "src/tests/deviceCosts.test.ts",
  "src/tests/remoteActions.test.ts",
  "src/tests/observability.test.ts",
  "src/tests/twoFactor.test.ts",
  "src/tests/snmpCredentials.test.ts",
  "src/tests/ipRangeSpec.test.ts",
  "src/tests/ipRangeSpecCompile.test.ts",
  "src/tests/businessHours.test.ts",
  "src/tests/ipRangesCredentials.test.ts",
  "src/tests/publicApi.test.ts",
  "src/tests/publicApiKeyExpiry.test.ts",
  "src/tests/publicApiWebhookDelivery.test.ts",
  "src/tests/deviceUsageHistory.test.ts",
  "src/tests/ewsProxyService.test.ts",
  "src/tests/portalAgentEws.test.ts",
  "src/tests/ewsProxyRelay.test.ts",
  "src/tests/customFieldRules.test.ts",
  "src/tests/feedbackUseCases.test.ts",
  "src/tests/systemSettings.test.ts",
  "src/tests/agentLogsReport.test.ts",
];

function runFile(file) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "--test", file], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  let anyFailed = false;

  for (const file of TEST_FILES) {
    await redis.flushdb();
    console.log(`\n=== ${file} ===`);
    const code = await runFile(file);
    if (code !== 0) anyFailed = true;
  }

  await redis.quit();
  process.exit(anyFailed ? 1 : 0);
}

main();
