/** Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS). */
export type PendingDevice = {
  id: string;
  ip_address: string | null;
  mac: string | null;
  serial_number: string | null;
  hostname: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  agent_id: string | null;
  agent_name: string | null;
  created_at: string;
  last_seen: string | null;
};

export type PendingDevicesResponse = {
  items: PendingDevice[];
  total: number;
};

export type PendingDevicesActionSkip = { id: string; reason: string };
export type PendingDevicesActionResult = { registered?: number; ignored?: number; skipped: PendingDevicesActionSkip[] };
