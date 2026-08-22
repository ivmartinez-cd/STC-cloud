import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { SecurityUtils } from './security';
import type { SnmpCredential } from '../capture/transport/snmp';

export interface IpRange {
  start: string;
  end: string;
}

export interface AgentConfig {
  serverUrl: string;
  agentId: string;
  token: string;
  refreshToken: string;
  ipRanges: IpRange[];
  snmpCommunity: string;
  snmpVersion: 1 | 2; // sigue muerto (nunca se lee) — reemplazado conceptualmente por SnmpCredential.version
  /** Lista de credenciales SNMP a probar en orden (§2.3 gap analysis). Puede
   *  venir ausente en un `config.enc` guardado antes de esta pasada —
   *  `normalizeConfig()` la sintetiza desde `snmpCommunity` en ese caso. */
  snmpCredentials?: SnmpCredential[];
  proxyUrl?: string; // http://user:pass@proxy:8080 - opcional, para redes con proxy corporativo
}

/**
 * Punto único de normalización de un config recién cargado. Si
 * `snmpCredentials` no vino (config.enc de antes de esta pasada, o un
 * heartbeat que aún no empujó ninguna), se sintetiza una lista de una sola
 * entrada v2c a partir de `snmpCommunity` — así el resto del código
 * (`ScanService`, `SnmpClient`) siempre puede asumir un array no vacío, sin
 * repetir la síntesis en cada punto de uso (los dos loops de `ScanService`,
 * `scanner.ts`, `ConsoleEngine`).
 */
export function normalizeConfig(config: AgentConfig): AgentConfig {
  if (config.snmpCredentials && config.snmpCredentials.length > 0) return config;
  return {
    ...config,
    snmpCredentials: [{ id: 'legacy', version: 'v2c', community: config.snmpCommunity }],
  };
}

// --- Hardware ID (seccion 9.1 del PDF: MAC + UUID de disco) ---

function getWindowsHardwareId(): string {
  try {
    let guid = '';
    try {
      // Intento ultra rapido usando reg query nativo para evitar levantar powershell
      const regOut = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        timeout: 3000, encoding: 'utf8', windowsHide: true,
      });
      const match = regOut.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
      if (match) {
        guid = match[1].trim();
      } else {
        throw new Error('No se pudo encontrar MachineGuid en el output de reg query');
      }
    } catch {
      // Fallback a powershell por si reg query falla por politicas o entorno
      guid = execSync('powershell -NoProfile -Command "(Get-ItemProperty \'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\').MachineGuid"', {
        timeout: 5000, encoding: 'utf8', windowsHide: true,
      }).trim();
    }
    
    // Serial de la BIOS es inmutable para el hardware. Le damos 8 segundos por si el inicio de Windows esta muy saturado.
    const bios = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_BIOS).SerialNumber"', {
      timeout: 8000, encoding: 'utf8', windowsHide: true,
    }).trim();

    return `${guid}-${bios}`;
  } catch (e) {
    // Fallback a hostname si todo falla para evitar que el agente rompa
    return os.hostname();
  }
}


/**
 * Genera un identificador de hardware unico y determinista para la maquina actual.
 * Combina identificadores del sistema inmutables (MachineGuid de registro de Windows y Serial de BIOS en Windows,
 * o machine-id en sistemas tipo Unix) y devuelve un hash SHA-256 de 32 caracteres.
 * Sirve como clave de cifrado simetrico local en conjunto con la infraestructura AES-256-GCM.
 * 
 * @returns {string} Un hash hexadecimal de 32 caracteres correspondiente al Hardware ID unico.
 */
export function getHardwareId(): string {
  let raw = '';
  if (process.platform === 'win32') {
    raw = getWindowsHardwareId();
  } else {
    // Fallback para dev en otros SO (seccion 9.1 del PDF)
    const out = execSync('cat /etc/machine-id 2>/dev/null || hostname', {
      timeout: 3000, encoding: 'utf8',
    });
    raw = out.trim().slice(0, 32);
  }
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// --- Config cifrada en disco (AES-256-GCM) ---

export const get_DATA_DIR = () =>
  process.env.AGENT_DATA_DIR ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\STCCloudMonitor'
    : path.join(process.cwd(), 'agent-data'));

export const DATA_DIR = get_DATA_DIR();

const CONFIG_PATH = path.join(DATA_DIR, 'config.enc');

/**
 * Gestor de configuracion persistente cifrada para el agente STC Cloud.
 * Maneja el almacenamiento de credenciales criticas en disco utilizando cifrado simetrico AES-256-GCM
 * con enlace fuerte a la identidad de hardware de la maquina (HWID binding).
 */
export class ConfigManager {
  /**
   * Carga y descifra de forma segura el archivo de configuracion del agente desde el almacenamiento local.
   * Valida la integridad del hardware a traves del proceso de autenticacion de AES-256-GCM.
   * 
   * @throws {Error} Si la configuracion no existe, si el Hardware ID cambio (HWID_MISMATCH) o si el descifrado falla.
   * @returns {Promise<AgentConfig>} Objeto de configuracion del agente descifrado.
   */
  static async load(): Promise<AgentConfig> {
    if (!fs.existsSync(CONFIG_PATH)) {
      throw new Error(`Config no encontrada: ${CONFIG_PATH}. Ejecutar con --activate <KEY>`);
    }
    
    try {
      const encrypted = fs.readFileSync(CONFIG_PATH, 'utf8');
      const json = await SecurityUtils.decrypt(encrypted, getHardwareId());
      return normalizeConfig(JSON.parse(json) as AgentConfig);
    } catch (error: unknown) {
      const msg: string = error instanceof Error ? error.message : String(error);
      // AES-256-GCM auth-tag failure = HWID del equipo cambio desde la activacion
      if (
        msg.includes('Unsupported state') ||
        msg.includes('BAD_DECRYPT') ||
        msg.includes('unable to authenticate data') ||
        msg.includes('Invalid authentication tag')
      ) {
        throw new Error(`HWID_MISMATCH: El Hardware ID actual no coincide con el registrado en la activacion. El agente debe reactivarse en este equipo. Detalle: ${msg}`);
      }
      throw new Error(`Error al cargar configuracion: ${msg}`);
    }
  }

  /**
   * Cifra y almacena la configuracion de forma atomica en disco usando la clave de hardware.
   * Utiliza un esquema de escritura segura temporal (write-then-rename) para evitar corrupcion de datos.
   * 
   * @param {AgentConfig} config - Objeto de configuracion a persistir de forma segura.
   * @returns {Promise<void>}
   */
  static async save(config: AgentConfig): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const encrypted = await SecurityUtils.encrypt(JSON.stringify(config), getHardwareId());
    
    // Escritura atomica: escribir en temporal y luego renombrar
    const tempPath = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tempPath, encrypted, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, CONFIG_PATH);
  }

  /**
   * Elimina de forma segura toda configuracion y archivos temporales de control local.
   * Usado durante la desvinculacion administrativa del agente para limpieza de credenciales.
   * 
   * @returns {Promise<void>}
   */
  static async deleteConfig(): Promise<void> {
    const files = [CONFIG_PATH, `${CONFIG_PATH}.tmp` ];
    for (const f of files) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }

  // Backward-compat alias usado por main.ts
  static loadConfig = ConfigManager.load;
  static saveConfig = ConfigManager.save;
  static deleteConfigAlias = ConfigManager.deleteConfig;
}
