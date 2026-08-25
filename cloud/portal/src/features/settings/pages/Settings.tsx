import { useState, useEffect } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { api } from '../../../shared/lib/api';
import MonitorThresholdCard from '../components/MonitorThresholdCard';
import SmtpInfoCard, { type SmtpFields } from '../components/SmtpInfoCard';
import OperatorsCard from '../components/operators/OperatorsCard';
import FeedbackCard from '../components/FeedbackCard';
import MessageTemplatesCard from '../components/MessageTemplatesCard';
import TwoFactorCard from '../components/TwoFactorCard';
import type { Thresholds } from '../types/settings';

const Settings = () => {
  const { role: currentUserRole } = useAuth();
  const { showToast } = useToast();

  // R9 del gap analysis vs HP SDS: este umbral controla de verdad
  // `jobs/heartbeatMonitor.ts` (antes sólo se guardaba en localStorage, sin
  // que nada lo leyera) — se lee/escribe contra `GET/PUT
  // /api/v1/settings/system`, único para toda la instancia.
  const [thresholds, setThresholds] = useState<Thresholds>({ monitorOfflineMinutes: 5 });
  const [smtp, setSmtp] = useState<SmtpFields>({ host: '', port: '587', user: '', pass: '', from: '' });
  const [savedOk, setSavedOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = currentUserRole === 'admin';

  useEffect(() => {
    api.get<{ agent_offline_threshold_minutes: number }>('/settings/system')
      .then((s) => setThresholds({ monitorOfflineMinutes: s.agent_offline_threshold_minutes }))
      .catch((e: unknown) => showToast('No se pudo cargar el umbral de inactividad: ' + (e as Error).message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await api.put('/settings/system', { agent_offline_threshold_minutes: thresholds.monitorOfflineMinutes });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1 font-medium">Gestión de umbrales, alertas, parámetros globales y operadores.</p>
      </header>

      <MonitorThresholdCard thresholds={thresholds} onChange={setThresholds} disabled={!isAdmin} />
      <SmtpInfoCard smtp={smtp} onChange={(updater) => setSmtp(updater)} />
      <TwoFactorCard />
      <OperatorsCard />
      {isAdmin && <MessageTemplatesCard />}
      {isAdmin && <FeedbackCard />}

      {isAdmin && (
      <div className="flex items-center gap-6 pt-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-3 bg-brand hover:bg-brand-hover text-white px-10 py-5 rounded-[24px] text-sm font-extrabold shadow-xl shadow-brand/10 transition-all active:scale-95 group disabled:opacity-50"
        >
          <Save size={18} className="group-hover:scale-110 transition-transform" />
          Guardar Cambios
        </button>

        {savedOk && (
          <span className="text-sm text-emerald-600 font-extrabold flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="p-1 bg-emerald-50 rounded-full">
              <CheckCircle size={16} />
            </div>
            Configuración actualizada con éxito
          </span>
        )}
      </div>
      )}
    </div>
  );
};

export default Settings;
