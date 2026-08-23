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
  "src/tests/alerts.test.ts",
  "src/tests/reports.test.ts",
  "src/tests/deviceLifecycle.test.ts",
  "src/tests/snmpCredentials.test.ts",
  "src/tests/ipRangeSpec.test.ts",
  "src/tests/businessHours.test.ts",
  "src/tests/ipRangesCredentials.test.ts",
  "src/tests/publicApi.test.ts",
  "src/tests/deviceUsageHistory.test.ts",
  "src/tests/ewsProxyService.test.ts",
  "src/tests/portalAgentEws.test.ts",
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
