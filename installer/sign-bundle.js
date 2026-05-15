// Llamado desde build-installer.bat: node installer/sign-bundle.js <archivo>
// Produce <archivo>.sig con la firma Ed25519 (64 bytes raw).
const { createPrivateKey, sign } = require('crypto');
const fs   = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node sign-bundle.js <archivo>');
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error('Archivo no encontrado:', filePath);
  process.exit(1);
}

const keyPath = path.join(__dirname, 'signing.key');
if (!fs.existsSync(keyPath)) {
  console.error('signing.key no encontrado. Ejecute primero: node installer/gen-keys.js');
  process.exit(1);
}

const privDer    = fs.readFileSync(keyPath);
const privateKey = createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
const data       = fs.readFileSync(filePath);
const signature  = sign(null, data, privateKey);
const sigPath    = filePath + '.sig';
fs.writeFileSync(sigPath, signature);
console.log(`Firmado: ${path.basename(filePath)} -> ${path.basename(sigPath)} (${signature.length} bytes)`);
