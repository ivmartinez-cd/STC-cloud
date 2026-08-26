export type SmtpEncryption = 'none' | 'starttls' | 'tls';

export interface SystemSettingsView {
  agent_offline_threshold_minutes: number;
  device_offline_threshold_minutes: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password_set: boolean;
  smtp_from: string | null;
  smtp_encryption: SmtpEncryption;
  supply_threshold_warning_pct: number;
  supply_threshold_critical_pct: number;
  supply_manual_review_required: boolean;
}

export interface SettingsImpact {
  agentOffline: { affected: number; total: number };
  deviceOffline: { affected: number; total: number };
  supplyWarning: { affected: number };
  supplyCritical: { affected: number };
}

export interface DBUser {
  id: string;
  username: string;
  role: string;
  active: boolean;
  client_id: string | null;
  client_name: string | null;
  totp_required?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBClient {
  id: string;
  name: string;
}

export interface DBFeedback {
  id: string;
  type: string;
  title: string;
  description: string;
  image_url: string | null;
  status: string;
  created_at: string;
  username: string;
}
