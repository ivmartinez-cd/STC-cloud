const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// --node-exe <ruta>: usar este node.exe como runtime embebido en vez del que
// corre el build (para variantes legacy, ej. Node 20.2.0 para Server 2008 R2 —
// Node 20.3.0+ ya no arranca ahí, ver nodejs/node#51465).
// --target <esbuild target>: target de esbuild acorde al runtime embebido.
// --out-dir <ruta>: carpeta de salida (default "dist") — usar una distinta
// (ej. "dist-legacy") para no pisar el build normal al generar una variante.
// --channel <stable|legacy>: canal de auto-update embebido en el bundle (ver
// src/core/channel.ts) — determina contra qué release del server compara su
// propia versión y a qué canal reporta pertenecer en el heartbeat.
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : fallback;
};
const nodeExeSource = flag('--node-exe', process.execPath);
const esbuildTarget = flag('--target', 'node24');
const channel = flag('--channel', 'stable');
const distDir = path.resolve(__dirname, flag('--out-dir', 'dist'));
const bundlePath = path.join(distDir, 'bundle.js');
const outputNodeExe = path.join(distDir, 'stc-node.exe');

console.log('🚀 Iniciando construcción de Runtime Embebido (Senior Level)...');
if (nodeExeSource !== process.execPath) {
  console.log(`⚠️  Runtime legacy: ${nodeExeSource} (target esbuild: ${esbuildTarget})`);
}

// 1. Limpiar dist
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

// 2. Bundling con esbuild (Externalizamos better-sqlite3 porque es nativo)
console.log('📦 Empaquetando código con esbuild...');
// better-sqlite3 (y su dependencia "bindings") deben quedar afuera del bundle:
// "bindings" ubica el .node compilado inspeccionando el stack trace del
// archivo que lo invoca para encontrar su propio package.json. Si queda
// empaquetado dentro de bundle.js, esa introspección resuelve mal la raíz
// (busca en la raíz del agente en vez de en node_modules/better-sqlite3) y
// nunca encuentra el binario, sin importar dónde se lo copie.
// Usamos la API de esbuild en vez de `npx esbuild ...` por shell (execSync):
// pasar el valor de __STC_CHANNEL__ como string via linea de comandos es
// tierra de nadie entre plataformas -- en Windows, cmd.exe se comia un par
// de comillas dobles embebidas en un token sin espacios, asi que esbuild
// terminaba viendo __STC_CHANNEL__=legacy (sin comillas), que NO es un
// string literal sino una referencia a un identificador `legacy`
// inexistente, y el reemplazo quedaba mal (channel.ts caia siempre a
// 'stable', bug real encontrado en el primer despliegue OTA real,
// 10/09/2026). Con la API, `define` es un objeto JS: JSON.stringify(channel)
// arma el string literal correcto sin que ningun shell lo toque.
esbuild.buildSync({
  entryPoints: ['src/core/main.ts'],
  bundle: true,
  platform: 'node',
  target: esbuildTarget,
  mainFields: ['main'],
  outfile: bundlePath,
  external: ['better-sqlite3', 'bindings'],
  define: { __STC_CHANNEL__: JSON.stringify(channel) },
  // Marca legible en la primera línea del bundle: `publish-release.sh` la
  // compara con el canal que se le pasa antes de subir. Sin esto nada impedía
  // publicar un bundle stable (node24) como legacy y que los Node 20 lo
  // instalaran. Va adentro del bundle, así la firma también la cubre.
  banner: { js: `/* stc-channel:${channel} target:${esbuildTarget} */` },
});

// 3. Copiar el ejecutable de Node.js (actual, o el runtime legacy indicado) como runtime privado
console.log('📑 Copiando runtime de Node.js...');
fs.copyFileSync(nodeExeSource, outputNodeExe);

console.log('✅ Preparación completada.');
console.log(`✨ Runtime: ${outputNodeExe}`);
console.log(`✨ Bundle: ${bundlePath}`);
