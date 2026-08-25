import fs from "node:fs";
import path from "node:path";

// Fase 5 (punto 4) de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md: checklist de
// seguridad por endpoint. Recorre TODAS las declaraciones `fastify.<verbo>(url, {…})`
// del backend y exige que cada ruta declare su autenticación (`preHandler`) salvo
// que esté en la allowlist explícita PUBLIC_ROUTES de abajo. Una ruta nueva sin
// preHandler y sin entrada acá rompe el CI: deny-by-default también en el código.
//
// Con --write-catalog además regenera docs/dev/PERMISSIONS_CATALOG.md (catálogo de
// permisos por módulo: quién puede llamar cada endpoint), cruzando:
//   - preHandler → tipo de credencial (portalAuth / agentAuth / apiKeyAuth),
//   - CLIENT_VIEWER_ROUTES (src/api/policy/rolePolicy.ts) → si el rol scopeado
//     client_viewer llega a la ruta (deny-by-default en el middleware),
//   - ADMIN_ONLY_ROUTES → handlers que además exigen role === "admin" en código.
//
// Limitación: el chequeo de rol admin dentro del handler no es detectable
// estáticamente; ADMIN_ONLY_ROUTES se mantiene a mano y lo cubren rbac.test.ts y
// twoFactor.test.ts. Si agregás un `role !== "admin"` nuevo, sumalo acá.

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const CATALOG_PATH = path.resolve(ROOT, "..", "docs", "dev", "PERMISSIONS_CATALOG.md");
const WRITE_CATALOG = process.argv.includes("--write-catalog");

/** Rutas sin autenticación, a propósito. Cualquier otra sin preHandler falla. */
const PUBLIC_ROUTES = new Map([
  ["GET /", "ping del servicio"],
  ["GET /health", "healthcheck (docker/CI)"],
  ["GET /api/v1/health", "healthcheck versionado"],
  ["GET /api/v1/agents/download-installer", "redirect al instalador público en GitHub"],
  ["POST /api/v1/portal/login", "login (rate-limit 10/min)"],
  ["POST /api/v1/portal/logout", "logout: sólo invalida cookie/blacklist, idempotente"],
  ["POST /api/v1/agents/activate", "activación de agente con código de un solo uso (rate-limit 5/min)"],
  ["POST /api/v1/agents/refresh", "rotación de token de agente: el refresh token viaja en el body"],
  ["GET /metrics", "Prometheus: exige Bearer METRICS_TOKEN dentro del handler (metricsAuthOk)"],
]);

/** Handlers que además exigen role === "admin" (verificado a mano, ver grep en el plan). */
const ADMIN_ONLY_ROUTES = new Set([
  "GET /api/v1/portal/users",
  "POST /api/v1/portal/users",
  "PUT /api/v1/portal/users/:id",
  "DELETE /api/v1/portal/users/:id",
  "GET /api/v1/feedback",
  "PUT /api/v1/feedback/:id/status",
  "PUT /api/v1/settings/system",
  "POST /api/v1/portal/agents/version",
]);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", "tests", "db"].includes(e.name)) continue;
      out.push(...walk(full));
    } else if (/\.ts$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Devuelve el texto del objeto `{…}` que empieza en `start` (balance de llaves). */
function balanced(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return "";
}

// URL como literal ('…', "…", `${base}/…`) o como identificador (`fastify.get(base, …)`).
const ROUTE_RX = /fastify\.(get|post|put|patch|delete)\(\s*(?:(['"`])([^'"`]+)\2|(\w+))\s*(,)?/g;

/** `const base = "/api/v1/x"` → { base: "/api/v1/x" } (para urls con `${base}/…`). */
function stringConsts(src) {
  return Object.fromEntries([...src.matchAll(/const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g)].map((m) => [m[1], m[2]]));
}

/** `const auth = { preHandler: portalAuth }` → { auth: "portalAuth" } (para `{ ...auth, handler }` o 2º arg `auth`). */
function optionConsts(src) {
  const out = {};
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\{[^}]*preHandler\s*:\s*(\[[^\]]*\]|[\w.]+)/g)) out[m[1]] = m[2];
  return out;
}

function preHandlerOf(src, afterIndex, optionNames) {
  const rest = src.slice(afterIndex, afterIndex + 400);
  const ident = rest.match(/^\s*(\w+)\s*[,)]/);
  if (ident && optionNames[ident[1]]) return optionNames[ident[1]];
  const optsStart = src.indexOf("{", afterIndex);
  const opts = optsStart > 0 ? balanced(src, optsStart) : "";
  const ph = opts.match(/preHandler\s*:\s*(\[[^\]]*\]|[\w.]+)/);
  if (ph) return ph[1].replace(/\s+/g, "");
  const spread = opts.match(/\.\.\.(\w+)/);
  if (spread && optionNames[spread[1]]) return optionNames[spread[1]];
  return null;
}

function routesIn(file) {
  const src = fs.readFileSync(file, "utf8");
  const consts = stringConsts(src);
  const optionNames = optionConsts(src);
  const out = [];
  for (const m of src.matchAll(ROUTE_RX)) {
    const method = m[1].toUpperCase();
    const rawUrl = m[3] ?? consts[m[4]] ?? `\${${m[4]}}`;
    const url = rawUrl.replace(/\$\{(\w+)\}/g, (_, name) => consts[name] ?? `\${${name}}`);
    const preHandler = m[5] ? preHandlerOf(src, m.index + m[0].length, optionNames) : null;
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ method, url, preHandler, file: path.relative(ROOT, file).split(path.sep).join("/"), line });
  }
  return out;
}

function clientViewerRoutes() {
  const txt = fs.readFileSync(path.join(SRC, "api", "policy", "rolePolicy.ts"), "utf8");
  const block = txt.match(/CLIENT_VIEWER_ROUTES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error("No se pudo leer CLIENT_VIEWER_ROUTES de rolePolicy.ts");
  return new Set([...block[1].matchAll(/['"]([A-Z]+ [^'"]+)['"]/g)].map((x) => x[1]));
}

function roles(route, viewerRoutes) {
  const key = `${route.method} ${route.url}`;
  const ph = route.preHandler ?? "";
  if (!ph) return PUBLIC_ROUTES.has(key) ? "público" : "⚠️ SIN AUTH";
  if (ph.includes("apiKeyAuth")) return "API key de cliente";
  if (ph.includes("agentAuth")) return "agente (token)";
  if (ph.includes("portalAuth")) {
    if (ADMIN_ONLY_ROUTES.has(key)) return "admin";
    return viewerRoutes.has(key) ? "admin · operator · client_viewer" : "admin · operator";
  }
  return `custom (${ph})`;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const routes = walk(SRC).flatMap(routesIn).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const viewerRoutes = clientViewerRoutes();
const seen = new Map();
const problems = [];

for (const r of routes) {
  const key = `${r.method} ${r.url}`;
  if (seen.has(key)) problems.push(`ruta duplicada ${key} en ${r.file}:${r.line} y ${seen.get(key)}`);
  seen.set(key, `${r.file}:${r.line}`);
  if (!r.preHandler && !PUBLIC_ROUTES.has(key)) {
    problems.push(`sin preHandler y fuera de PUBLIC_ROUTES: ${key} (${r.file}:${r.line})`);
  }
}
for (const key of PUBLIC_ROUTES.keys()) {
  if (!seen.has(key)) problems.push(`PUBLIC_ROUTES tiene una ruta que ya no existe: ${key}`);
}
for (const key of ADMIN_ONLY_ROUTES) {
  if (!seen.has(key)) problems.push(`ADMIN_ONLY_ROUTES tiene una ruta que ya no existe: ${key}`);
}
for (const key of viewerRoutes) {
  if (!seen.has(key)) problems.push(`CLIENT_VIEWER_ROUTES tiene una ruta que ya no existe: ${key}`);
}

if (WRITE_CATALOG) {
  const byFile = new Map();
  for (const r of routes) (byFile.get(r.file) ?? byFile.set(r.file, []).get(r.file)).push(r);
  const lines = [
    "# Catálogo de permisos por endpoint",
    "",
    "Generado por `cloud/scripts/check-routes.mjs --write-catalog` — NO editar a mano; regenerar",
    "al agregar/quitar rutas o cambiar `CLIENT_VIEWER_ROUTES` / `ADMIN_ONLY_ROUTES`.",
    "",
    "Modelo (ver `cloud/src/api/policy/rolePolicy.ts`): toda ruta declara su `preHandler`",
    "(`portalAuth` sesión del portal · `agentAuth` token de agente · `apiKeyAuth` API key de",
    "cliente) o está en la allowlist explícita de rutas públicas. Dentro del portal,",
    "`admin`/`operator` llegan a toda ruta con `portalAuth`; `client_viewer` es deny-by-default",
    "y sólo llega a `CLIENT_VIEWER_ROUTES` (scopeado a su cliente). Las marcadas `admin`",
    "además exigen `role === \"admin\"` en el handler.",
    "",
    `Total: ${routes.length} rutas · públicas: ${routes.filter((r) => !r.preHandler).length} · ` +
      `client_viewer: ${viewerRoutes.size} · sólo admin: ${ADMIN_ONLY_ROUTES.size}`,
    "",
  ];
  for (const [file, rs] of byFile) {
    lines.push(`## \`${file}\``, "", "| Método | Ruta | Quién puede |", "|---|---|---|");
    for (const r of rs) lines.push(`| ${r.method} | \`${r.url}\` | ${roles(r, viewerRoutes)} |`);
    lines.push("");
  }
  fs.writeFileSync(CATALOG_PATH, lines.join("\n"));
  console.log(`check-routes: catálogo escrito en ${path.relative(ROOT, CATALOG_PATH)} (${routes.length} rutas).`);
}

if (problems.length) {
  console.error(`check-routes: ${problems.length} problema(s):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-routes: OK (${routes.length} rutas, ${routes.filter((r) => !r.preHandler).length} públicas declaradas).`);
