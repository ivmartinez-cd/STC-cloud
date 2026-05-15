// Ejecutar UNA SOLA VEZ para generar el par de claves Ed25519:
//   node installer/gen-keys.js
// - Clave privada → installer/signing.key  (NO subir al repositorio)
// - Clave publica → agent/src/core/updateKey.ts  (si subir al repositorio)
const { generateKeyPairSync } = require('crypto');
const fs   = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'signing.key');
const tsPath  = path.join(__dirname, '..', 'agent', 'src', 'core', 'updateKey.ts');

if (fs.existsSync(keyPath)) {
  console.error('signing.key ya existe. Para regenerar, borrelo manualmente primero.');
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
const pubDer  = publicKey.export({ type: 'spki',  format: 'der' });
const pubHex  = pubDer.toString('hex');

fs.writeFileSync(keyPath, privDer);
console.log('Clave privada guardada en:', keyPath);
console.log('>>> IMPORTANTE: Nunca subir signing.key al repositorio. <<<');

fs.writeFileSync(tsPath,
  `// Ed25519 SPKI public key — generado por installer/gen-keys.js — NO EDITAR MANUALMENTE\n` +
  `export const UPDATE_PUBLIC_KEY_HEX = '${pubHex}';\n`
);
console.log('Clave publica guardada en:', tsPath);
console.log('Ejecute el build normalmente. Las actualizaciones seran verificadas criptograficamente.');
