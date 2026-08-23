import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash, verify as cryptoVerify, createPublicKey } from 'crypto';
import { UPDATE_PUBLIC_KEY_HEX } from './updateKey';
import { DATA_DIR, type AgentConfig } from './config';
import { log } from './Logger';
import { VERSION } from './version';

const execAsync = promisify(exec);

interface UpdateServiceDeps {
  getConfig: () => AgentConfig;
  triggerScan: () => void;
  isNetworkBusy: () => boolean;
}

export class UpdateService {
  private deps: UpdateServiceDeps;
  private isUpdating = false;

  constructor(deps: UpdateServiceDeps) {
    this.deps = deps;
  }

  async checkForUpdate(force = false): Promise<boolean> {
    if (this.isUpdating) return false;
    this.isUpdating = true;

    try {
      const bundlePath = this.getBundlePath();
      if (!bundlePath) {
        this.isUpdating = false;
        return false;
      }

      const config = this.deps.getConfig();

      const res = await fetch(`${config.serverUrl}/api/v1/agents/version`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.isUpdating = false;
        return false;
      }

      const data = await res.json() as { version?: string; url?: string; hash?: string };
      if (!data.version || !data.url) {
        this.isUpdating = false;
        return false;
      }

      const ALLOWED_URL_PREFIX = 'https://github.com/ivmartinez-cd/STC-cloud/releases/download/';
      if (!data.url.startsWith(ALLOWED_URL_PREFIX)) {
        log('WARN', `URL de descarga rechazada (dominio no autorizado): ${data.url}`);
        this.isUpdating = false;
        return false;
      }

      const isNewer = this.isNewerVersion(data.version, VERSION);

      // Si no es mas nueva y no estamos forzando, salir.
      if (!isNewer && !force) {
        this.isUpdating = false;
        return false;
      }

      if (force && !isNewer) {
        if (data.version === VERSION) {
          log('INFO', `Ya cuentas con la version mas reciente (v${VERSION}). No es necesario actualizar.`);
        } else {
          log('WARN', `Update forzado omitido: La version del servidor (v${data.version}) es anterior a la instalada (v${VERSION})`);
        }
        this.isUpdating = false;
        return false;
      }

      log('INFO', `Nueva version disponible: v${data.version} (actual: v${VERSION}). Descargando...`);

      const dlRes = await fetch(data.url, { signal: AbortSignal.timeout(120_000) });
      if (!dlRes.ok) {
        log('WARN', `Descarga de actualizacion fallo: HTTP ${dlRes.status}`);
        this.isUpdating = false;
        return false;
      }

      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const isZip = data.url.toLowerCase().endsWith('.zip');
      const tempPath = isZip ? path.join(path.dirname(bundlePath), 'update.zip') : bundlePath + '.update';

      if (buffer.length < 50_000) {
        log('WARN', 'El bundle descargado es muy pequeno, descartando actualizacion.');
        this.isUpdating = false;
        return false;
      }

      if (data.hash) {
        const actualHash = createHash('sha256').update(buffer).digest('hex').toLowerCase();
        if (actualHash !== data.hash.toLowerCase()) {
          log('WARN', `Hash SHA256 invalido. Esperado: ${data.hash}, Obtenido: ${actualHash}. Descartando actualizacion.`);
          this.isUpdating = false;
          return false;
        }
        log('INFO', 'Integridad SHA256 verificada correctamente.');
      } else {
        log('WARN', 'Servidor no proporciono hash SHA256. Actualizacion instalada sin verificacion de integridad.');
      }

      if ((UPDATE_PUBLIC_KEY_HEX as string) === 'PLACEHOLDER_RUN_GEN_KEYS_FIRST') {
        log('WARN', 'SEGURIDAD: firma Ed25519 no configurada — actualizacion aceptada sin verificacion de firma.');
      } else {
        try {
          const sigRes = await fetch(data.url + '.sig', { signal: AbortSignal.timeout(15_000) });
          if (!sigRes.ok) {
            log('WARN', `Firma Ed25519 no disponible (HTTP ${sigRes.status}). Actualizacion rechazada.`);
            this.isUpdating = false;
            return false;
          }
          const sigBuf = Buffer.from(await sigRes.arrayBuffer());
          const pubKey = createPublicKey({ key: Buffer.from(UPDATE_PUBLIC_KEY_HEX, 'hex'), format: 'der', type: 'spki' });
          if (!cryptoVerify(null, buffer, pubKey, sigBuf)) {
            log('ERROR', `VIOLACION DE INTEGRIDAD [Ed25519]: La firma del paquete de actualizacion NO es valida. URL: ${data.url} | Version: ${data.version}. Actualizacion rechazada.`);
            this.isUpdating = false;
            return false;
          }
          log('INFO', 'Firma Ed25519 verificada correctamente.');
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          log('ERROR', `VIOLACION DE INTEGRIDAD [Ed25519]: Error al verificar firma del paquete. URL: ${data.url} | Version: ${data.version} | Error: ${errMsg}. Actualizacion rechazada.`);
          this.isUpdating = false;
          return false;
        }
      }

      fs.writeFileSync(tempPath, buffer);

      if (isZip) {
        log('INFO', 'Paquete completo detectado. Iniciando extraccion y parcheo atomico...');
        await this.applyZipUpdate(tempPath);
        return true;
      }

      try {
        // Backup ANTES de reemplazar — antes no se conservaba ninguna versión
        // previa (reemplazo in-place puro), así que un binario nuevo roto no
        // tenía forma de revertirse salvo reinstalar a mano. `.bak` + un
        // archivo de versión al lado para que `rollbackToPreviousVersion()`
        // sepa a qué está volviendo.
        if (fs.existsSync(bundlePath)) {
          fs.copyFileSync(bundlePath, bundlePath + '.bak');
          fs.writeFileSync(bundlePath + '.bak.version', VERSION, 'utf8');
        }
        fs.renameSync(tempPath, bundlePath);
        log('INFO', `Actualizacion aplicada (v${data.version}). Backup de v${VERSION} conservado. Reiniciando para aplicar cambios...`);
        process.exit(0);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        log('ERROR', `Error al mover bundle: ${errMsg}`);
        this.isUpdating = false;
        return false;
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log('ERROR', `Error en checkForUpdate: ${errMsg}`);
      this.isUpdating = false;
      return false;
    }
  }

  async checkFlags(): Promise<void> {
    try {
      const forceScanFlag = path.join(DATA_DIR, 'force-scan.flag');
      if (fs.existsSync(forceScanFlag)) {
        fs.unlinkSync(forceScanFlag);
        if (!this.deps.isNetworkBusy()) {
          log('INFO', 'Flag detectado: Forzando escaneo inmediato...');
          this.deps.triggerScan();
        } else {
          log('INFO', 'Flag force-scan detectado pero hay tarea de red en progreso. Se ejecutara en el proximo ciclo.');
        }
      }

      const forceUpdateFlag = path.join(DATA_DIR, 'force-update.flag');
      if (fs.existsSync(forceUpdateFlag)) {
        log('INFO', 'Flag detectado: Forzando verificacion de actualizacion...');
        fs.unlinkSync(forceUpdateFlag);
        await this.checkForUpdate(true);
      }
    } catch {
      // Silencio en caso de error de acceso a archivos
    }
  }

  /**
   * Restaura el bundle single-file al `.bak` guardado en el último update
   * (ver `checkForUpdate` — se guarda ANTES de reemplazar). No reinicia el
   * proceso — el caller decide cuándo (`process.exit(0)` para que el
   * supervisor de servicio lo relance con el binario restaurado).
   * Sólo cubre el bundle single-file (SEA); el parche ZIP vía `.bat`/robocopy
   * es Windows-only y no se puede revertir automáticamente desde acá — ver
   * comentario en `applyZipUpdate` sobre el backup por robocopy previo al
   * reemplazo, pensado como red de seguridad manual, no rollback automático.
   */
  async rollbackToPreviousVersion(): Promise<boolean> {
    const bundlePath = this.getBundlePath();
    if (!bundlePath) {
      log('WARN', 'Rollback: no se pudo determinar la ruta del bundle (¿corriendo en dev?).');
      return false;
    }
    const backupPath = bundlePath + '.bak';
    if (!fs.existsSync(backupPath)) {
      log('WARN', 'Rollback: no hay backup disponible (.bak no existe).');
      return false;
    }
    try {
      const backupVersion = fs.existsSync(backupPath + '.version')
        ? fs.readFileSync(backupPath + '.version', 'utf8').trim()
        : 'desconocida';
      fs.copyFileSync(backupPath, bundlePath);
      log('INFO', `Rollback aplicado: restaurada la versión v${backupVersion} desde backup.`);
      return true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', `Rollback falló: ${errMsg}`);
      return false;
    }
  }

  private getBundlePath(): string | null {
    const arg = process.argv[1];
    // En dev (tsx), argv[1] apunta a main.ts → skip update en ese caso
    if (!arg || !arg.endsWith('.js')) return null;
    if (!fs.existsSync(arg)) return null;
    return arg;
  }

  private isNewerVersion(remote: string, local: string): boolean {
    if (remote === local) return false;
    const rParts = remote.replace(/^v/, '').split('.').map(Number);
    const lParts = local.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
      const r = rParts[i] || 0;
      const l = lParts[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  }

  private async applyZipUpdate(zipFilePath: string): Promise<boolean> {
    const installDir  = path.dirname(process.execPath);
    const stagingDir  = path.join(DATA_DIR, 'update_staging');
    const batPath     = path.join(DATA_DIR, 'apply-update.bat');

    try {
      if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
      fs.mkdirSync(stagingDir, { recursive: true });

      await execAsync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${stagingDir}' -Force"`,
        { windowsHide: true, timeout: 60_000 }
      );
      fs.unlinkSync(zipFilePath);

      // Backup de la instalación ANTES del robocopy destructivo — antes no
      // se conservaba ninguna copia previa. Red de seguridad MANUAL (un
      // admin puede restaurar `${installDir}_backup` a mano si el parche
      // rompe algo) — no hay rollback automático acá, a diferencia del
      // bundle single-file (`rollbackToPreviousVersion`): este flujo corre
      // en un `.bat` fire-and-forget fuera del proceso Node, sin nadie
      // vivo para decidir "esto falló, revertí" después del robocopy.
      const backupDir = `${installDir}_backup`;
      const bat = [
        '@echo off',
        'ping -n 4 127.0.0.1 > nul',
        'sc stop STCCloudMonitor > nul 2>&1',
        'ping -n 4 127.0.0.1 > nul',
        'taskkill /im STC.Monitor.UI.exe /f > nul 2>&1',
        'taskkill /im stc-node.exe /f > nul 2>&1',
        `rd /s /q "${backupDir}" 2>nul`,
        `robocopy "${installDir}" "${backupDir}" /E /IS /IT /IM /NFL /NDL /NJH /NJS /R:3 /W:1 > nul`,
        `robocopy "${stagingDir}" "${installDir}" /E /IS /IT /IM /NFL /NDL /NJH /NJS /R:3 /W:1 > nul`,
        `rd /s /q "${stagingDir}" 2>nul`,
        'sc start STCCloudMonitor > nul 2>&1',
        'del "%~f0"',
      ].join('\r\n');

      fs.writeFileSync(batPath, bat, { encoding: 'utf8' });

      log('INFO', `Parche ZIP extraido correctamente. Lanzando actualizador independiente...`);

      // Usar WMI para escapar del Job Object de NSSM.
      await execAsync(
        `powershell -NoProfile -Command "Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList 'cmd.exe /c \\"${batPath}\\"'"`,
        { windowsHide: true, timeout: 15_000 }
      );

      setTimeout(() => process.exit(0), 500);
      return true;

    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('WARN', `Error aplicando parche ZIP: ${errMsg}`);
      try { if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath); }                  catch {}
      try { if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true }); }  catch {}
      try { if (fs.existsSync(batPath))    fs.unlinkSync(batPath); }                       catch {}
      return false;
    }
  }
}
