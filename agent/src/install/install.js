const { Service } = require('node-windows');
const path = require('path');

const DATA_DIR = 'C:\\ProgramData\\STCCloudMonitor';

// Apunta al .js compilado en producción o al .exe empaquetado con pkg
const scriptPath = path.join(__dirname, '..', '..', 'dist', 'core', 'main.js');

const svc = new Service({
  name: 'STCCloudMonitor',
  description: 'STC Cloud - Servicio de monitoreo de impresoras multimarca',
  script: scriptPath,
  nodeOptions: [],
  env: [
    { name: 'AGENT_DATA_DIR', value: DATA_DIR }
  ]
});

svc.on('install', () => {
  console.log('Servicio instalado. Iniciando...');
  svc.start();
  console.log('Servicio iniciado correctamente.');
});

svc.on('alreadyinstalled', () => {
  console.log('El servicio ya esta instalado. Para reinstalar, ejecuta uninstall.js primero.');
});

svc.on('start', () => {
  console.log('Servicio en ejecucion.');
});

svc.on('error', (err) => {
  console.error('Error en instalacion:', err);
});

console.log('Instalando servicio Windows...');
svc.install();
