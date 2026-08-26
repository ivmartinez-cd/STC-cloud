import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import type { SettingsImpact, SmtpEncryption, SystemSettingsView } from '../types/settings';

export interface SettingsDraft {
  agentOfflineThresholdMinutes: number;
  deviceOfflineThresholdMinutes: number;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string; // vacío = no tocar la guardada; sólo se manda si el admin tipeó algo nuevo
  smtpFrom: string;
  smtpEncryption: SmtpEncryption;
  supplyThresholdWarningPct: number;
  supplyThresholdCriticalPct: number;
  supplyManualReviewRequired: boolean;
}

function draftFromView(s: SystemSettingsView): SettingsDraft {
  return {
    agentOfflineThresholdMinutes: s.agent_offline_threshold_minutes,
    deviceOfflineThresholdMinutes: s.device_offline_threshold_minutes,
    smtpHost: s.smtp_host ?? '', smtpPort: s.smtp_port ? String(s.smtp_port) : '587',
    smtpUser: s.smtp_user ?? '', smtpPassword: '', smtpFrom: s.smtp_from ?? '', smtpEncryption: s.smtp_encryption,
    supplyThresholdWarningPct: s.supply_threshold_warning_pct, supplyThresholdCriticalPct: s.supply_threshold_critical_pct,
    supplyManualReviewRequired: s.supply_manual_review_required,
  };
}

/** Sólo las claves presentes en el body van al `PUT` — igual criterio que el
 * patch parcial del backend. La contraseña sólo se manda si el admin tipeó algo. */
function toUpdateBody(d: SettingsDraft) {
  return {
    agent_offline_threshold_minutes: d.agentOfflineThresholdMinutes,
    device_offline_threshold_minutes: d.deviceOfflineThresholdMinutes,
    smtp_host: d.smtpHost.trim() || null,
    smtp_port: d.smtpPort.trim() ? Number(d.smtpPort) : null,
    smtp_user: d.smtpUser.trim() || null,
    ...(d.smtpPassword.trim() ? { smtp_password: d.smtpPassword.trim() } : {}),
    smtp_from: d.smtpFrom.trim() || null,
    smtp_encryption: d.smtpEncryption,
    supply_threshold_warning_pct: d.supplyThresholdWarningPct,
    supply_threshold_critical_pct: d.supplyThresholdCriticalPct,
    supply_manual_review_required: d.supplyManualReviewRequired,
  };
}

function requestSystemSettings(): Promise<SystemSettingsView> {
  return api.get<SystemSettingsView>('/settings/system');
}

function useLoadedSettingsState() {
  const [view, setView] = useState<SystemSettingsView | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  return { view, setView, draft, setDraft, loading, setLoading };
}

function useLoadedSettings() {
  const { showToast } = useToast();
  const st = useLoadedSettingsState();
  const load = useCallback(async () => {
    st.setLoading(true);
    try {
      const s = await requestSystemSettings();
      st.setView(s);
      st.setDraft(draftFromView(s));
    } catch (e) {
      showToast('No se pudo cargar la configuración: ' + (e as Error).message, 'error');
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ...st, reload: load };
}

/** Impacto en vivo mientras el admin arrastra un slider — antes de guardar
 * (handoff hifi #3, fase 2). Debounced: no un request por pixel arrastrado. */
function useImpact(draft: SettingsDraft | null) {
  const [impact, setImpact] = useState<SettingsImpact | null>(null);
  const debounced = useDebounce(draft, 250);
  useEffect(() => {
    if (!debounced) return;
    const params = new URLSearchParams({
      agent_offline_threshold_minutes: String(debounced.agentOfflineThresholdMinutes),
      device_offline_threshold_minutes: String(debounced.deviceOfflineThresholdMinutes),
      supply_threshold_warning_pct: String(debounced.supplyThresholdWarningPct),
      supply_threshold_critical_pct: String(debounced.supplyThresholdCriticalPct),
    });
    api.get<SettingsImpact>(`/settings/system/impact?${params.toString()}`).then(setImpact).catch(() => { /* informativo */ });
  }, [debounced]);
  return impact;
}

type Toast = (msg: string, kind: 'success' | 'error') => void;

async function requestSave(draft: SettingsDraft, reload: () => Promise<void>, showToast: Toast): Promise<boolean> {
  try {
    await api.put('/settings/system', toUpdateBody(draft));
    await reload();
    showToast('Configuración actualizada', 'success');
    return true;
  } catch (e) {
    showToast('Error al guardar: ' + (e as Error).message, 'error');
    return false;
  }
}

async function requestTestSmtp(to: string | undefined, showToast: Toast): Promise<boolean> {
  try {
    await api.post('/settings/system/smtp/test', to ? { to } : {});
    showToast(to ? `Email de prueba enviado a ${to}` : 'Conexión SMTP verificada', 'success');
    return true;
  } catch (e) {
    showToast('Prueba SMTP falló: ' + (e as Error).message, 'error');
    return false;
  }
}

/** `save`/`testSmtp`/`saveAndTest` — separado del hook principal por el
 * límite de 20 líneas/función. */
function useSaveActions(draft: SettingsDraft | null, reload: () => Promise<void>) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!draft) return false;
    setSaving(true);
    try { return await requestSave(draft, reload, showToast); } finally { setSaving(false); }
  };
  const testSmtp = (to?: string) => requestTestSmtp(to, showToast);
  const saveAndTest = async () => { if (await save()) await testSmtp(); };
  return { saving, save, testSmtp, saveAndTest };
}

export function useSystemSettingsForm() {
  const { view, draft, setDraft, loading, reload } = useLoadedSettings();
  const impact = useImpact(draft);
  const actions = useSaveActions(draft, reload);

  const update = (patch: Partial<SettingsDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const discard = () => { if (view) setDraft(draftFromView(view)); };
  const isDirty = !!draft && !!view && JSON.stringify(draft) !== JSON.stringify(draftFromView(view));

  return { view, draft, update, discard, isDirty, loading, impact, ...actions };
}

export type SystemSettingsFormState = ReturnType<typeof useSystemSettingsForm>;
