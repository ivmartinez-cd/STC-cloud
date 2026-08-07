import { getPendingReadings, markSynced, type QueueReading } from './database';
import { ConfigManager, type AgentConfig } from '../core/config';

export interface UploadResult {
  uploaded: number;
  failed:   number;
}

export async function uploadPending(config: AgentConfig): Promise<UploadResult & { updatedConfig?: AgentConfig }> {
  const pending = getPendingReadings(500);
  if (!pending.length) return { uploaded: 0, failed: 0 };

  const readings = pending.map(r => ({
    device_id:     r.device_id,
    ip:            r.ip,
    brand:         r.brand,
    model:         r.model,
    time:          r.time,
    total_pages:   r.total_pages,
    mono_pages:    r.mono_pages,
    color_pages:   r.color_pages,
    toner_black:   r.toner_black   ?? null,
    toner_cyan:    r.toner_cyan    ?? null,
    toner_magenta: r.toner_magenta ?? null,
    toner_yellow:  r.toner_yellow  ?? null,
    cartridge_code_black:       r.cartridge_code_black       ?? null,
    cartridge_code_cyan:        r.cartridge_code_cyan        ?? null,
    cartridge_code_magenta:     r.cartridge_code_magenta     ?? null,
    cartridge_code_yellow:      r.cartridge_code_yellow      ?? null,
    cartridge_serial_black:     r.cartridge_serial_black     ?? null,
    cartridge_serial_cyan:      r.cartridge_serial_cyan      ?? null,
    cartridge_serial_magenta:   r.cartridge_serial_magenta   ?? null,
    cartridge_serial_yellow:    r.cartridge_serial_yellow    ?? null,
    cartridge_capacity_black:   r.cartridge_capacity_black   ?? null,
    cartridge_capacity_cyan:    r.cartridge_capacity_cyan    ?? null,
    cartridge_capacity_magenta: r.cartridge_capacity_magenta ?? null,
    cartridge_capacity_yellow:  r.cartridge_capacity_yellow  ?? null,
    cartridge_printed_black:    r.cartridge_printed_black    ?? null,
    cartridge_printed_cyan:     r.cartridge_printed_cyan     ?? null,
    cartridge_printed_magenta:  r.cartridge_printed_magenta  ?? null,
    cartridge_printed_yellow:   r.cartridge_printed_yellow   ?? null,
    cartridge_estimated_black:  r.cartridge_estimated_black  ?? null,
    cartridge_estimated_cyan:   r.cartridge_estimated_cyan   ?? null,
    cartridge_estimated_magenta: r.cartridge_estimated_magenta ?? null,
    cartridge_estimated_yellow:  r.cartridge_estimated_yellow  ?? null,
    supplies_details: r.supplies_details ? (typeof r.supplies_details === 'string' ? JSON.parse(r.supplies_details) : r.supplies_details) : null,
    firmware:      r.firmware ?? null,
    mac:           r.mac ?? null,
    hostname:      r.hostname ?? null,
    location:      r.location ?? null,
    poll_method:   r.poll_method ?? 'snmp',
    offline:       false,
  }));

  const { res, updatedConfig } = await postWithAuth(`${config.serverUrl}/api/v1/devices/sync`, { readings }, config);

  if (res.ok) {
    markSynced(pending.map(r => r.id));
    return { uploaded: pending.length, failed: 0, updatedConfig };
  }
  return { uploaded: 0, failed: pending.length, updatedConfig };
}

async function postWithAuth(url: string, body: unknown, config: AgentConfig): Promise<{ res: Response, updatedConfig?: AgentConfig }> {
  const make = (token: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65_000)
    });

  let res = await make(config.token);
  let updatedConfig: AgentConfig | undefined;

  if (res.status === 401) {
    const refreshed = await tryRefresh(config);
    if (refreshed) {
      updatedConfig = refreshed;
      res = await make(refreshed.token);
    }
  }
  return { res, updatedConfig };
}

export async function tryRefresh(config: AgentConfig): Promise<AgentConfig | null> {
  try {
    const res = await fetch(`${config.serverUrl}/api/v1/agents/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: config.agentId, refresh_token: config.refreshToken }),
      signal: AbortSignal.timeout(65_000)
    });
    if (!res.ok) return null;
    const data = await res.json() as { token: string; refresh_token: string };
    const newConfig = { ...config, token: data.token, refreshToken: data.refresh_token };
    await ConfigManager.save(newConfig);
    return newConfig;
  } catch {
    return null;
  }
}
