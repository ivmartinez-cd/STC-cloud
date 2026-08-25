import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

// Fase 5 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md: guardas estáticas de la guía
// (docs/dev/ARCHITECTURE_GUIDE.md §2 dependencias, §5 seguridad, §7 checklist) con
// el mismo esquema ratchet que check-sizes.mjs: la deuda existente al congelar el
// baseline queda permitida (por archivo+regla, contando ocurrencias), nada nuevo
// puede aparecer y si un archivo mejora se regenera el baseline con --write-baseline.
//
// Reglas:
//   console-log        console.log/debugger en código de producción (no tests, no
//                      scripts de src/db). Usar src/logger.ts.
//   silent-catch       `catch {}` sin NADA adentro (ni comentario). Un catch vacío
//                      con comentario que explique por qué se ignora es aceptado.
//   sql-interpolation  `.raw(` con template literal interpolando algo que no sea una
//                      constante UPPER_SNAKE (candidato a inyección SQL). Usar bindings.
//   arch-domain        modules/<m>/domain importa fuera de su propio domain/ o un
//                      paquete npm (el dominio no conoce infraestructura ni frameworks).
//   arch-application   modules/<m>/application importa infrastructure/presentation,
//                      src/api, src/db, src/ws, src/jobs o drivers (knex/ioredis/bullmq).
//   arch-cross-module  código fuera de modules/<m> (u otro módulo) importa internals de
//                      modules/<m> que no sean el facade (index) o presentation/.
//   arch-portal        portal: shared/store/app importan features/, o un feature
//                      importa otro feature (deuda declarada: DeviceLifecycleModals).
//
// No cubierto (no es verificable estáticamente con fiabilidad): "endpoints sin
// paginación" — se cubre con techos server-side en los listados (commit 0218ca3) y
// tests de integración.

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE_PATH = path.join(import.meta.dirname, "guards-baseline.json");
const WRITE_BASELINE = process.argv.includes("--write-baseline");

const BACKEND_SRC = path.join(ROOT, "src");
const PORTAL_SRC = path.join(ROOT, "portal", "src");
const BACKEND_EXCLUDE = [path.join(BACKEND_SRC, "db"), path.join(BACKEND_SRC, "tests")];

const DRIVER_PACKAGES = new Set(["knex", "ioredis", "bullmq", "fastify", "pg", "@fastify"]);

function walk(dir, exclude = []) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (exclude.some((ex) => full === ex || full.startsWith(ex + path.sep))) continue;
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".design-sync", ".ds-sync", "ds-bundle"].includes(entry.name)) continue;
      out.push(...walk(full, exclude));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

// ─── Reglas de contenido ─────────────────────────────────────────────────────

function checkContent(file, content, findings) {
  const r = rel(file);
  const isPortal = file.startsWith(PORTAL_SRC);

  for (const m of content.matchAll(/(?<![\w.])console\.log\(|^\s*debugger\b/gm)) {
    if (r === "src/logger.ts") continue;
    findings.push({ rule: "console-log", file: r, line: lineOf(content, m.index), text: m[0].trim() });
  }

  for (const m of content.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g)) {
    findings.push({ rule: "silent-catch", file: r, line: lineOf(content, m.index), text: "catch vacío sin comentario" });
  }

  if (!isPortal) {
    for (const m of content.matchAll(/\.raw\(\s*`([^`]*)`/g)) {
      const interps = [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1].trim());
      const risky = interps.filter((expr) => !/^[A-Z][A-Z0-9_]*$/.test(expr));
      if (risky.length) {
        findings.push({ rule: "sql-interpolation", file: r, line: lineOf(content, m.index), text: `\${${risky.join("}, ${")}}` });
      }
    }
  }
}

// ─── Reglas de imports (arquitectura) ────────────────────────────────────────

const IMPORT_RX = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function imports(content) {
  const out = [];
  for (const m of content.matchAll(IMPORT_RX)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) out.push({ spec, line: lineOf(content, m.index) });
  }
  return out;
}

function resolveRelative(file, spec) {
  return rel(path.resolve(path.dirname(file), spec));
}

const LAYERS = new Set(["domain", "application", "infrastructure", "presentation"]);
const NODE_BUILTINS = new Set(builtinModules);

// Sólo los módulos con capas (domain/application/…) están sujetos a las reglas de
// arquitectura. `observability` y `metrics` son utilitarios planos (sin capas) y se
// tratan como código compartido.
function moduleOf(r) {
  const m = r.match(/^src\/modules\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return null;
  const layer = m[2] && LAYERS.has(m[2]) ? m[2] : null;
  const layered = fs.existsSync(path.join(BACKEND_SRC, "modules", m[1], "domain"));
  return { name: m[1], layer, layered };
}

function checkBackendImports(file, content, findings) {
  const r = rel(file);
  const self = moduleOf(r);
  for (const { spec, line } of imports(content)) {
    const isRelative = spec.startsWith(".");
    const target = isRelative ? resolveRelative(file, spec) : null;
    const targetMod = target ? moduleOf(target) : null;
    const pkg = isRelative ? null : spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

    if (self?.layer === "domain") {
      // Permitido: su propio domain/, el shared kernel (src/shared/**, guía §2:
      // "ningún módulo importa domain/application de otro módulo, sólo shared/")
      // y builtins de Node.
      const inside = target?.startsWith(`src/modules/${self.name}/domain`) || target?.startsWith("src/shared/");
      const builtin = spec.startsWith("node:") || NODE_BUILTINS.has(spec);
      if (!inside && !builtin) {
        findings.push({ rule: "arch-domain", file: r, line, text: spec });
      }
    }

    if (self?.layer === "application") {
      const bad =
        (target && /^src\/(api|db|ws|jobs)\//.test(target)) ||
        (targetMod && ["infrastructure", "presentation"].includes(targetMod.layer)) ||
        (pkg && (DRIVER_PACKAGES.has(pkg) || pkg.startsWith("@fastify")));
      if (bad) findings.push({ rule: "arch-application", file: r, line, text: spec });
    }

    if (targetMod?.layered && targetMod.layer && targetMod.name !== self?.name) {
      const facade = target === `src/modules/${targetMod.name}/index` || target === `src/modules/${targetMod.name}`;
      const presentationEntry = targetMod.layer === "presentation";
      if (!facade && !presentationEntry) {
        findings.push({ rule: "arch-cross-module", file: r, line, text: spec });
      }
    }
  }
}

function checkPortalImports(file, content, findings) {
  const r = rel(file);
  const p = r.replace(/^portal\/src\//, "");
  const selfFeature = p.match(/^features\/([^/]+)\//)?.[1] ?? null;
  const selfIsBase = /^(shared|store|app)\//.test(p);
  for (const { spec, line } of imports(content)) {
    if (!spec.startsWith(".")) continue;
    const target = resolveRelative(file, spec).replace(/^portal\/src\//, "");
    const targetFeature = target.match(/^features\/([^/]+)\//)?.[1] ?? null;
    if (!targetFeature) continue;
    if (selfIsBase || (selfFeature && selfFeature !== targetFeature)) {
      findings.push({ rule: "arch-portal", file: r, line, text: spec });
    }
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const findings = [];
for (const file of walk(BACKEND_SRC, BACKEND_EXCLUDE)) {
  const content = fs.readFileSync(file, "utf8");
  checkContent(file, content, findings);
  checkBackendImports(file, content, findings);
}
for (const file of walk(PORTAL_SRC)) {
  const content = fs.readFileSync(file, "utf8");
  checkContent(file, content, findings);
  checkPortalImports(file, content, findings);
}

// Baseline: { "<rule>|<file>": count }
const counts = {};
for (const f of findings) counts[`${f.rule}|${f.file}`] = (counts[`${f.rule}|${f.file}`] ?? 0) + 1;

if (WRITE_BASELINE) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`guards: baseline escrito con ${findings.length} hallazgos en ${Object.keys(sorted).length} archivo+regla.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
const violations = [];
for (const [key, n] of Object.entries(counts)) {
  const allowed = baseline[key] ?? 0;
  if (n > allowed) {
    const [rule, file] = key.split("|");
    violations.push(...findings.filter((f) => f.rule === rule && f.file === file).map((f) => ({ ...f, allowed, n })));
  }
}
const improved = Object.entries(baseline).filter(([key, allowed]) => (counts[key] ?? 0) < allowed);

if (violations.length) {
  console.error(`guards: ${violations.length} violación(es) por encima del baseline:\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}  ${v.text}   (${v.n} > baseline ${v.allowed})`);
  }
  console.error("\nCorregir, o si es deuda aceptada y documentada: npm run check:guards:baseline");
  process.exit(1);
}
console.log(`guards: OK (${findings.length} hallazgos, todos dentro del baseline).`);
if (improved.length) {
  console.log(`guards: ${improved.length} entrada(s) del baseline mejoraron — regenerar con --write-baseline para ratchetear:`);
  for (const [key, allowed] of improved) console.log(`  ${key}: ${counts[key] ?? 0} < ${allowed}`);
}
