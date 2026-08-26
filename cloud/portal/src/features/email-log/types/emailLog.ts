export type EmailStatus = 'sent' | 'error' | 'skipped_no_transport' | 'skipped_no_recipient';

export interface EmailLogRow {
  id: string;
  client_id: string | null;
  event: string;
  recipient: string | null;
  subject: string;
  status: EmailStatus;
  error: string | null;
  created_at: string;
}

export interface EmailLogSummary {
  intentos: number;
  entregados: number;
  sinDestinatario: number;
  sinSmtp: number;
  clientesSinContacto: number;
  clientesTotal: number;
  reintentos: number;
}

export interface ClientOption { id: string; name: string }
