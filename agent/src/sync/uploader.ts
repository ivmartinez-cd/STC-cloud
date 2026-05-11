import { getPendingReadings, markSynced } from './database';
import { ConfigManager, type AgentConfig } from '../core/config';

export interface UploadResult {
  uploaded: number;
  failed:   number;
}

export async function uploadPending(): Promise<UploadResult> {
  let config = await ConfigManager.load();
  const pending = getPendingReadings(500);
  if (!pending.length) return { uploaded: 0, failed: 0 };

  const readings = pending.map(r => ({
    device_id:   r.device_id,
    ip:          r.ip,
    brand:       r.brand,
    model:       r.model,
    time:        r.time,
    total_pages: r.total_pages,
    mono_pages:  r.mono_pages,
    color_pages: r.color_pages,
    status:      r.status,
    offline:     true,
  }));

  const res = await postWithAuth(`${config.serverUrl}/api/v1/devices/sync`, { readings }, config);

  if (res.ok) {
    markSynced(pending.map((r: any) => r.id));
    return { uploaded: pending.length, failed: 0 };
  }
  return { uploaded: 0, failed: pending.length };
}

async function postWithAuth(url: string, body: unknown, config: AgentConfig): Promise<Response> {
  const make = (token: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  let res = await make(config.token);

  if (res.status === 401) {
    const refreshed = await tryRefresh(config);
    if (refreshed) res = await make(refreshed.token);
  }
  return res;
}

async function tryRefresh(config: AgentConfig): Promise<{ token: string } | null> {
  try {
    const res = await fetch(`${config.serverUrl}/api/v1/agents/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: config.agentId, refresh_token: config.refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    await ConfigManager.save({ ...config, token: data.token, refreshToken: data.refresh_token });
    return { token: data.token };
  } catch {
    return null;
  }
}
