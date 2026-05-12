import { getPendingReadings, markSynced } from './database';
import { ConfigManager, type AgentConfig } from '../core/config';

export interface UploadResult {
  uploaded: number;
  failed:   number;
}

export async function uploadPending(config: AgentConfig): Promise<UploadResult & { updatedConfig?: AgentConfig }> {
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

  const { res, updatedConfig } = await postWithAuth(`${config.serverUrl}/api/v1/devices/sync`, { readings }, config);

  if (res.ok) {
    markSynced(pending.map((r: any) => r.id));
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

async function tryRefresh(config: AgentConfig): Promise<AgentConfig | null> {
  try {
    const res = await fetch(`${config.serverUrl}/api/v1/agents/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: config.agentId, refresh_token: config.refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const newConfig = { ...config, token: data.token, refreshToken: data.refresh_token };
    await ConfigManager.save(newConfig);
    return newConfig;
  } catch {
    return null;
  }
}
