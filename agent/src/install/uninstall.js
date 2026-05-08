const { Service } = require('node-windows');
const path = require('path');

const scriptPath = path.join(__dirname, '..', '..', 'dist', 'core', 'main.js');

const svc = new Service({
  name: 'ContadorImpresoras',
  script: scriptPath,
});

svc.on('uninstall', () => {
  console.log('Servicio desinstalado correctamente.');
});

svc.on('notinstalled', () => {
  console.log('El servicio no estaba instalado.');
});

svc.on('error', (err) => {
  console.error('Error en desinstalacion:', err);
});

console.log('Desinstalando servicio Windows...');
svc.uninstall();
