import { useState } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MonitorThresholdCard from '../components/settings/MonitorThresholdCard';
import SmtpInfoCard, { type SmtpFields } from '../components/settings/SmtpInfoCard';
import OperatorsCard from '../components/settings/operators/OperatorsCard';
import FeedbackCard from '../components/settings/FeedbackCard';
import type { Thresholds } from '../types/settings';

const STORAGE_KEY = 'stc_settings';

function loadSettings(): Thresholds {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { monitorOfflineMinutes: raw.monitorOfflineMinutes ?? raw.agentOfflineMinutes ?? 10 };
  } catch { return { monitorOfflineMinutes: 10 }; }
}

const Settings = () => {
  const { role: currentUserRole } = useAuth();
  const saved = loadSettings();

  const [thresholds, setThresholds] = useState<Thresholds>({
    monitorOfflineMinutes: saved.monitorOfflineMinutes,
  });
  const [smtp, setSmtp] = useState<SmtpFields>({ host: '', port: '587', user: '', pass: '', from: '' });
  const [savedOk, setSavedOk] = useState(false);

  const isAdmin = currentUserRole === 'admin';

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1 font-medium">Gestión de umbrales, alertas, parámetros globales y operadores.</p>
      </header>

      <MonitorThresholdCard thresholds={thresholds} onChange={setThresholds} />
      <SmtpInfoCard smtp={smtp} onChange={(updater) => setSmtp(updater)} />
      <OperatorsCard />
      {isAdmin && <FeedbackCard />}

      <div className="flex items-center gap-6 pt-4">
        <button
          onClick={save}
          className="flex items-center gap-3 bg-brand hover:bg-brand-hover text-white px-10 py-5 rounded-[24px] text-sm font-extrabold shadow-xl shadow-brand/10 transition-all active:scale-95 group"
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
    </div>
  );
};

export default Settings;
