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

function getPrimaryMac(): string {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const iface of list ?? []) {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac.toUpperCase();
      }
    }
  }
  return 'NO-MAC';
}

function getDiskSerial(): string {
  try {
    if (process.platform === 'win32') {
      const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber"', {
        timeout: 5000, encoding: 'utf8', windowsHide: true,
      });
      return out.trim() || 'NO-DISK';
    }
    // Dev en Linux/Mac
    const out = execSync('cat /etc/machine-id 2>/dev/null || hostname', {
      timeout: 3000, encoding: 'utf8',
    });
    return out.trim().slice(0, 32);
  } catch {
    return 'NO-DISK';
  }
}

export function getHardwareId(): string {
  const raw = `${getPrimaryMac()}-${getDiskSerial()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ─── Config cifrada en disco (AES-256-GCM) ───────────────────────────────────

export const get_DATA_DIR = () =>
  process.env.AGENT_DATA_DIR ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\ContadorImpresoras'
    : path.join(process.cwd(), 'agent-data'));

export const DATA_DIR = get_DATA_DIR();

const CONFIG_PATH = path.join(DATA_DIR, 'config.enc');

export class ConfigManager {
  static async load(): Promise<AgentConfig> {
    if (!fs.existsSync(CONFIG_PATH)) {
      throw new Error(`Config no encontrada: ${CONFIG_PATH}. Ejecutar con --activate <KEY>`);
    }
    const encrypted = fs.readFileSync(CONFIG_PATH, 'utf8');
    const json = await SecurityUtils.decrypt(encrypted, getHardwareId());
    return JSON.parse(json) as AgentConfig;
  }

  static async save(config: AgentConfig): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const encrypted = await SecurityUtils.encrypt(JSON.stringify(config), getHardwareId());
    fs.writeFileSync(CONFIG_PATH, encrypted, { encoding: 'utf8', mode: 0o600 });
  }

  // Backward-compat alias usado por main.ts
  static loadConfig = ConfigManager.load;
  static saveConfig = ConfigManager.save;
}
