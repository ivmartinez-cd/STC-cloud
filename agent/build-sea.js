const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const bundlePath = path.join(distDir, 'bundle.js');
const outputNodeExe = path.join(distDir, 'stc-node.exe');

console.log('🚀 Iniciando construcción de Runtime Embebido (Senior Level)...');

// 1. Limpiar dist
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

// 2. Bundling con esbuild (Externalizamos better-sqlite3 porque es nativo)
console.log('📦 Empaquetando código con esbuild...');
// Permitimos que esbuild empaquete todo, configurando un loader para el archivo .node
execSync(`npx esbuild "src/core/main.ts" --bundle --platform=node --target=node24 --outfile="${bundlePath}" --loader:.node=file`, { stdio: 'inherit' });

// 3. Copiar el ejecutable de Node.js actual como runtime privado
console.log('📑 Copiando runtime de Node.js...');
fs.copyFileSync(process.execPath, outputNodeExe);

console.log('✅ Preparación completada.');
console.log(`✨ Runtime: ${outputNodeExe}`);
console.log(`✨ Bundle: ${bundlePath}`);
