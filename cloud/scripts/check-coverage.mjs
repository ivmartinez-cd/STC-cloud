import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Fase 5 (punto 3) de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md: cobertura mínima por
// capa según docs/dev/ARCHITECTURE_GUIDE.md ("Cobertura Mínima Obligatoria").
//
// Fuente: la API corre bajo NODE_V8_COVERAGE durante la suite de integración (ver
// job `api` en .github/workflows/ci.yml) y al recibir SIGTERM hace process.exit(0)
// para que V8 vuelque el coverage. Este script convierte ese volcado con c8 y
// agrega por capa (modules/<m>/{domain,application,infrastructure,presentation}) y
// por módulo. Falla si una CAPA queda por debajo del mínimo de la guía. Los módulos
// individuales bajo mínimo se listan como deuda (informativo) — la guía pide subirlos
// "módulo por módulo, no de golpe".
//
// Uso: node scripts/check-coverage.mjs [--temp-dir <dir NODE_V8_COVERAGE>] [--report-only]

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const tempDir = args.includes("--temp-dir") ? args[args.indexOf("--temp-dir") + 1] : process.env.NODE_V8_COVERAGE;
const reportOnly = args.includes("--report-only");
const outDir = path.join(ROOT, "coverage");

const LAYER_MIN = { domain: 90, application: 85, infrastructure: 70, presentation: 60 };
const LAYER_RX = /(?:^|\/)(?:src|dist)\/modules\/([^/]+)\/(domain|application|infrastructure|presentation)\//;

if (!tempDir || !fs.existsSync(tempDir) || fs.readdirSync(tempDir).length === 0) {
  console.error("check-coverage: no hay volcado de V8 (NODE_V8_COVERAGE / --temp-dir vacío o inexistente).");
  process.exit(1);
}

execFileSync(
  "npx",
  ["c8", "report", "--temp-directory", tempDir, "--src", "src", "--include", "src/**", "--include", "dist/**",
    "--exclude", "src/tests/**", "--exclude", "src/db/**", "--exclude", "dist/db/**",
    "--reporter", "json-summary", "--reporter", "text-summary", "--report-dir", outDir],
  { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] }
);

const summary = JSON.parse(fs.readFileSync(path.join(outDir, "coverage-summary.json"), "utf8"));
const layers = {};
const modules = {};
for (const [file, v] of Object.entries(summary)) {
  if (file === "total") continue;
  const m = file.replace(/\\/g, "/").match(LAYER_RX);
  if (!m) continue;
  const [, mod, layer] = m;
  const add = (bucket) => { bucket.covered += v.lines.covered; bucket.total += v.lines.total; };
  add(layers[layer] ??= { covered: 0, total: 0 });
  add((modules[mod] ??= {})[layer] ??= { covered: 0, total: 0 });
}
const pct = (b) => (b.total ? (100 * b.covered) / b.total : 100);

console.log("\ncheck-coverage: líneas por capa (mínimo de la guía entre paréntesis)");
const failures = [];
for (const layer of Object.keys(LAYER_MIN)) {
  const b = layers[layer] ?? { covered: 0, total: 0 };
  const p = pct(b);
  const ok = p >= LAYER_MIN[layer];
  console.log(`  ${ok ? "OK " : "BAJO"} ${layer.padEnd(15)} ${p.toFixed(1).padStart(5)}%  (${b.covered}/${b.total}, mín ${LAYER_MIN[layer]}%)`);
  if (!ok) failures.push(`${layer} ${p.toFixed(1)}% < ${LAYER_MIN[layer]}%`);
}

const debt = [];
for (const [mod, ls] of Object.entries(modules).sort()) {
  const bad = Object.entries(ls).filter(([layer, b]) => pct(b) < LAYER_MIN[layer]);
  if (bad.length) debt.push(`  ${mod}: ${bad.map(([l, b]) => `${l} ${pct(b).toFixed(0)}% (${b.covered}/${b.total})`).join(", ")}`);
}
if (debt.length) {
  console.log(`\ncheck-coverage: ${debt.length} módulo(s) con alguna capa bajo mínimo (deuda, no bloquea):`);
  for (const d of debt) console.log(d);
}

if (failures.length && !reportOnly) {
  console.error(`\ncheck-coverage: FALLA — capas bajo el mínimo de la guía: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`\ncheck-coverage: OK (total líneas ${summary.total.lines.pct}%, ramas ${summary.total.branches.pct}%).`);
