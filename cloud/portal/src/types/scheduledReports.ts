export type ScheduledReportType =
  | 'usage' | 'non_contactable' | 'consumable_levels' | 'asset_list' | 'alert_history';

export type ScheduleFreq = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface ScheduledReport {
  id: string;
  client_id: string | null;
  name: string;
  report_type: ScheduledReportType;
  params: Record<string, unknown>;
  format: 'csv' | 'xlsx';
  schedule_freq: ScheduleFreq;
  schedule_dow: number | null;
  schedule_dom: number | null;
  schedule_hour: number;
  recipients: string[];
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  created_at: string;
}

export const REPORT_TYPE_LABELS: Record<ScheduledReportType, string> = {
  usage: 'Uso (contadores del período)',
  non_contactable: 'Dispositivos sin contacto',
  consumable_levels: 'Niveles de consumibles',
  asset_list: 'Lista de activos',
  alert_history: 'Historial de alertas',
};

export const FREQ_LABELS: Record<ScheduleFreq, string> = {
  none: 'Manual (sin programar)',
  daily: 'Diario',
  weekdays: 'Días hábiles',
  weekly: 'Semanal',
  monthly: 'Mensual',
};

export const DOW_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
