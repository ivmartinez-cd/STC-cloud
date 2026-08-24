/**
 * Dominio del registro de auditoría de correo (Fase 4.4 del gap analysis
 * vs HP SDS). Puro.
 */

export const EMAIL_STATUSES = [
  "sent",
  "error",
  "skipped_no_transport",
  "skipped_no_recipient",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export interface EmailLogEntry {
  id: string;
  clientId: string | null;
  event: string;
  recipient: string | null;
  subject: string;
  status: EmailStatus;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** Lo que el punto de envío sabe al momento de intentar mandar. */
export interface EmailLogWrite {
  clientId: string | null;
  event: string;
  recipient: string | null;
  subject: string;
  status: EmailStatus;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}
