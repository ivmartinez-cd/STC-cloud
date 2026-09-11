import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { SecurityUtils } from './security';
import type { SnmpCredential } from '../capture/transport/snmp';
import type { BusinessHoursConfig } from './BusinessHours';

export interface IpRange {
  start: string;
  end: string;
  /** Referencia a `id`s de `snmpCredentials` — restringe qué credenciales se
   *  prueban para ESTE rango durante discovery. Ausente = pool completo
   *  (comportamiento de siempre). El cloud ya resuelve ids colgantes antes
   *  de mandar esto (ver `agentService.getConfig()`), así que acá siempre
   *  son ids que existen en `snmpCredentials`, si el campo viene presente. */
  credential_ids?: string[];
}

/** Point lookup (§2.1/§2.3 gap analysis) — un host puntual que el agente
 *  resuelve él mismo al arrancar cada VUELTA de discovery (el cloud no tiene
 *  visibilidad de la DNS interna del cliente). */
export interface IpHost {
  hostname: string;
  credential_ids?: string[];
}

/** Fase 10 del gap analysis vs HP SDS — honrar `monitor_state`/
 *  `registration_state` del lado agente (el cloud ya filtra en Fase 5/7 con
 *  o sin esto; acá sólo se ahorra tráfico/CPU del agente). `state` viaja
 *  como el string crudo del cloud (`agentService.getConfig()`): 'full' |
 *  'supplies_only' | 'reports_only' | 'disabled' | 'ignored'. Sólo cubre
 *  equipos NO 'full' — el cloud manda la lista acotada, ver el mismo método. */
export interface DevicePolicy {
  ip: string;
  state: string;
}

export interface AgentConfig {
  serverUrl: string;
  agentId: string;
  token: string;
  refreshToken: string;
  ipRanges: IpRange[];
  /** Hosts puntuales a resolver por DNS al abrir cada vuelta de discovery
   *  (no en cada chunk). Ausente = ninguno (comportamiento de siempre). */
  ipHosts?: IpHost[];
  snmpCommunity: string;
  snmpVersion: 1 | 2; // sigue muerto (nunca se lee) — reemplazado conceptualmente por SnmpCredential.version
  /** Lista de credenciales SNMP a probar en orden (§2.3 gap analysis). Puede
   *  venir ausente en un `config.enc` guardado antes de esta pasada —
   *  `normalizeConfig()` la sintetiza desde `snmpCommunity` en ese caso. */
  snmpCredentials?: SnmpCredential[];
  /** Horario laboral + TZ (§2.1/§3 R7 gap analysis). Ausente/null =
   *  `DEFAULT_BUSINESS_HOURS` (Argentina, L-V, 8-18) — mismo comportamiento
   *  hardcodeado de siempre, `isBusinessHours()` ya resuelve el fallback. */
  businessHours?: BusinessHoursConfig | null;
  /** Fase 10 del gap analysis vs HP SDS — sólo entradas de equipos con
   *  `monitor_state <> 'full'` o `registration_state = 'ignored'`. Ausente =
   *  ninguno (comportamiento de siempre, todo 'full'). Ver `ScanService.
   *  policyFor()`, que es quien realmente lo consume. */
  devicePolicies?: DevicePolicy[];
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
    // Get-CimInstance requiere PowerShell 3.0+ (no existe en PS 2.0, el que
    // trae Server 2008 R2 por defecto) -- el try/catch DENTRO del script de
    // powershell cae a Get-WmiObject (equivalente, disponible desde PS 2.0)
    // si el cmdlet no se reconoce. Confirmado en el primer despliegue real
    // sobre Server 2008 R2 (10/09/2026): Get-CimInstance solo tiraba
    // CommandNotFoundException.
    const bios = execSync('powershell -NoProfile -Command "try { (Get-CimInstance Win32_BIOS).SerialNumber } catch { (Get-WmiObject Win32_BIOS).SerialNumber }"', {
      timeout: 8000, encoding: 'utf8', windowsHide: true,
    }).trim();

    return `${guid}-${bios}`;
  } catch (e) {
    // Fallback a hostname si todo falla para evitar que el agente rompa.
    // os.hostname() (libuv uv_os_gethostname) tira ENOSYS en Server 2008 R2
    // -- confirmado en el mismo despliegue real de arriba. COMPUTERNAME es
    // la misma info sin pasar por esa syscall.
    return getHostname();
  }
}

export function getHostname(): string {
  if (process.platform === 'win32' && process.env.COMPUTERNAME) {
    return process.env.COMPUTERNAME;
  }
  try {
    return os.hostname();
  } catch {
    return 'unknown-host';
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
