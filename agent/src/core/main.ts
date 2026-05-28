import fs from 'fs';
import { log, setupProcessErrorHandlers } from './Logger';
import { waitForConnectivity } from './NetworkUtils';
import { ConfigManager, DATA_DIR } from './config';
import { openQueue, closeQueue } from '../sync/database';
import { printStatus, setProxy, activate } from './CliCommands';
import { CommandHandler } from './CommandHandler';
import { HeartbeatService } from './HeartbeatService';
import { ScanService } from './ScanService';
import { SyncService } from './SyncService';
import { UpdateService } from './UpdateService';
import { TaskScheduler } from './TaskScheduler';
import { SocketManager } from './SocketManager';
import { ConsoleEngine } from './ConsoleEngine';
import type { AgentConfig } from './config';

const VERSION = '1.0.0';

// Instalar captura de errores fatales lo antes posible
setupProcessErrorHandlers();

async function main(): Promise<void> {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // === CLI Modes (sin loops, salida inmediata) ===
    if (process.argv.includes('--status')) {
      await printStatus();
      return;
    }

    if (process.argv.includes('--set-proxy')) {
      await setProxy();
      return;
    }

    // Soporta tanto --server (original) como --url (generado por el portal)
    if (process.argv.includes('--activate') || process.argv.includes('--url')) {
      await activate();
      return;
    }

    // === Inicio del Agente ===
    log('INFO', `STC Cloud Agent v${VERSION} iniciando...`);

    log('INFO', 'Abriendo base de datos local...');
    openQueue();

    log('INFO', 'Cargando configuracion...');
    let currentConfig: AgentConfig;
    try {
      currentConfig = await ConfigManager.load();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', `Error critico al cargar configuracion: ${errMsg}`);
      process.exit(1);
    }

    log('INFO', `ID: ${currentConfig.agentId} | Servidor: ${currentConfig.serverUrl}`);

    // === Proxy HTTP corporativo (opcional) ===
    if (currentConfig.proxyUrl) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const undici = require('undici') as unknown as {
          ProxyAgent: new (url: string) => unknown;
          setGlobalDispatcher: (dispatcher: unknown) => void;
        };
        undici.setGlobalDispatcher(new undici.ProxyAgent(currentConfig.proxyUrl));
        log('INFO', `Proxy HTTP configurado: ${currentConfig.proxyUrl}`);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        log('WARN', `No se pudo configurar el proxy: ${errMsg}`);
      }
    }

    // === Verificacion de conectividad al arrancar ===
    await waitForConnectivity(currentConfig.serverUrl);

    // === Helpers de config compartida ===
    const getConfig = () => currentConfig;
    const setConfig = (c: AgentConfig) => { currentConfig = c; };

    // === Instanciar servicios ===
    const scanService = new ScanService({ getConfig });
    const syncService = new SyncService({ getConfig, setConfig });
    const scheduler = new TaskScheduler({ scanService });
    const commandHandler = new CommandHandler();
    const updateService = new UpdateService({
      getConfig,
      triggerScan: () => { scanService.scan(); },
      isNetworkBusy: () => scheduler.isBusy,
    });

    // === Auto-update: verificar al arrancar y cada 4 horas ===
    const isUpdatingNow = await updateService.checkForUpdate();
    if (isUpdatingNow) {
      log('INFO', 'El agente se esta actualizando. Pausando inicio de loops...');
      return;
    }
    setInterval(() => updateService.checkForUpdate(), 4 * 60 * 60_000);

    // === Wiring de dependencias circulares ===
    commandHandler.setNetworkBusyCheck(() => scheduler.isBusy);
    commandHandler.setScanTrigger(() => { scanService.scan(); });
    commandHandler.setForceUpdateFn(() => updateService.checkForUpdate(true));

    // === Conexion WebSocket ===
    const socket = new SocketManager(
      currentConfig.serverUrl,
      currentConfig.token,
      async (type, payload, id) => {
        if (id && commandHandler.isProcessed(id)) {
          log('INFO', `Comando duplicado ignorado (WS): ${id}`);
          return;
        }
        if (id) {
          commandHandler.markProcessed(id);
        }
        await commandHandler.handleCommand(type, payload, id);
      },
      (level, msg) => log(level as 'INFO' | 'WARN' | 'ERROR', msg),
      currentConfig.proxyUrl,
    );
    socket.connect();
    commandHandler.setSocket(socket);

    // === Motor de Consola Local (Bridge) ===
    const engine = new ConsoleEngine(8000);
    engine.start();

    // === Iniciar loops ===
    log('INFO', `Comunidad SNMP: ${currentConfig.snmpCommunity}`);

    const heartbeatService = new HeartbeatService({
      getConfig,
      setConfig,
      commandHandler,
      getLastScanErrors: () => scanService.lastScanErrors,
      triggerScan: () => scanService.scan(),
      triggerSync: () => syncService.syncOnce(),
    });
    heartbeatService.start();

    setInterval(() => updateService.checkFlags(), 10_000);
    syncService.start();

    // Retrasar 30 segundos antes del primer scan para permitir inicializacion
    scheduler.start(30_000);

    log('INFO', 'Todos los loops activos.');

    // === Shutdown handler ===
    async function shutdown(signal: string) {
      log('INFO', `Senal ${signal} recibida. Cerrando agente de forma segura...`);
      scheduler.stop();
      syncService.stop();
      heartbeatService.stop();
      closeQueue();
      log('INFO', 'Base de datos cerrada. Saliendo.');
      process.exit(0);
    }

    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGHUP',  () => shutdown('SIGHUP'));
    process.on('SIGBREAK', () => shutdown('SIGBREAK')); // Windows Ctrl+Break
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? (err.stack ?? '') : '';
    log('ERROR', `ERROR FATAL EN MAIN: ${errMsg}\n${errStack}`);
    try { closeQueue(); } catch { /* ignore */ }
    process.exit(1);
  }
}

main();
