import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { SecurityUtils } from './security';

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
  snmpVersion: 1 | 2;
  scanIntervalMinutes: number;
}

// ─── Hardware ID (sección 9.1 del PDF: MAC + UUID de disco) ──────────────────

function getWindowsHardwareId(): string {
  try {
    // MachineGuid es persistente para la instalacin de Windows
    const guid = execSync('powershell -NoProfile -Command "(Get-ItemProperty \'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\').MachineGuid"', {
      timeout: 5000, encoding: 'utf8', windowsHide: true,
    }).trim();
    
    // Serial de la BIOS es inmutable para el hardware
    const bios = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_BIOS).SerialNumber"', {
      timeout: 5000, encoding: 'utf8', windowsHide: true,
    }).trim();

    return `${guid}-${bios}`;
  } catch (e) {
    // Fallback a hostname si falla (muy improbable en Win10/11)
    return os.hostname();
  }
}

export function getHardwareId(): string {
  let raw = '';
  if (process.platform === 'win32') {
    raw = getWindowsHardwareId();
  } else {
    // Fallback para dev en otros SO (seccin 9.1 del PDF)
    const out = execSync('cat /etc/machine-id 2>/dev/null || hostname', {
      timeout: 3000, encoding: 'utf8',
    });
    raw = out.trim().slice(0, 32);
  }
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ─── Config cifrada en disco (AES-256-GCM) ───────────────────────────────────

export const get_DATA_DIR = () =>
  process.env.AGENT_DATA_DIR ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\STCCloudMonitor'
    : path.join(process.cwd(), 'agent-data'));

export const DATA_DIR = get_DATA_DIR();

const CONFIG_PATH = path.join(DATA_DIR, 'config.enc');

export class ConfigManager {
  static async load(): Promise<AgentConfig> {
    if (!fs.existsSync(CONFIG_PATH)) {
      throw new Error(`Config no encontrada: ${CONFIG_PATH}. Ejecutar con --activate <KEY>`);
    }
    
    try {
      const encrypted = fs.readFileSync(CONFIG_PATH, 'utf8');
      const json = await SecurityUtils.decrypt(encrypted, getHardwareId());
      return JSON.parse(json) as AgentConfig;
    } catch (error: any) {
      // Si la desencriptacin falla (ej. por corrupcin tras un crash), respaldamos el archivo y avisamos
      const backupPath = `${CONFIG_PATH}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(CONFIG_PATH, backupPath);
      } catch (e) {
        // Ignorar si no se puede renombrar
      }
      throw new Error(`Error al cargar configuracin (posible corrupcin): ${error.message}. Se ha respaldado en ${path.basename(backupPath)}`);
    }
  }

  static async save(config: AgentConfig): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const encrypted = await SecurityUtils.encrypt(JSON.stringify(config), getHardwareId());
    
    // Escritura atmica: escribir en temporal y luego renombrar
    const tempPath = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tempPath, encrypted, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, CONFIG_PATH);
  }

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
