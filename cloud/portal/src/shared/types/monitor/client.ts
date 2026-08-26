export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  address: string | null;
  country: string | null;
  contact_phone: string | null;
  notification_email: string | null;
  notification_webhook_url: string | null;
  monitor_count: number;
  device_count: number;
  /** Fase 7 del gap analysis vs HP SDS — cola de registro de dispositivos. */
  device_approval_required: boolean;
  /** Handoff hifi "Cliente — detalle" (25/08/2026): metadatos del header ("Alta DD/MM/AAAA · ID …"). */
  created_at: string;
}

/** `GET /clients/:id/api-keys` — nunca trae el valor en claro (sólo al crearla). */
export interface ApiKeyRecord {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  revoked_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export type PublicApiEvent = 'reading.created' | 'alert.created' | 'report.closed';

/** `GET/PUT /clients/:id/webhook` — config del webhook de la API pública
 *  (integración ERP), no confundir con `notification_webhook_url` de arriba. */
export interface WebhookConfig {
  url: string;
  events: PublicApiEvent[];
  secret: string;
  active: boolean;
}

/** `GET/PUT /clients/:id/sftp-destination` (Fase 19) — nunca trae password/private_key, sólo si hay uno configurado. */
export interface SftpDestinationConfig {
  configured: boolean;
  host?: string;
  port?: number;
  username?: string;
  auth_method?: 'password' | 'private_key';
  remote_path?: string;
  updated_at?: string;
}

export interface UsageMonth {
  month: string;
  /** ISO del primer día del mes — clave estable para rellenar meses sin lecturas
   * (ver `ClientUsageChart.tsx`), a diferencia de `month` ("Mon YYYY" en inglés,
   * no ordenable/parseable de forma confiable en el front). */
  month_date: string;
  mono: number;
  color: number;
}
