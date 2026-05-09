import { useState } from 'react';
import { Radio, Save, Mail, Shield, CheckCircle, Settings as SettingsIcon, Bell, User, Key, Plus, ShieldCheck, ShieldOff, RefreshCw, X, Trash2, Cpu, Activity, Clock, Globe, Copy, Check, ChevronRight, Server, Search, Filter, Users } from 'lucide-react';

interface Thresholds {
  monitorOfflineMinutes: number;
}

const STORAGE_KEY = 'stc_settings';

function loadSettings(): Thresholds {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { monitorOfflineMinutes: raw.monitorOfflineMinutes ?? raw.agentOfflineMinutes ?? 10 };
  } catch { return { monitorOfflineMinutes: 10 }; }
}

const Settings = () => {
  const saved = loadSettings();
  const [thresholds, setThresholds] = useState<Thresholds>({
    monitorOfflineMinutes: saved.monitorOfflineMinutes,
  });
  const [smtp, setSmtp]     = useState({ host: '', port: '587', user: '', pass: '', from: '' });
  const [savedOk, setSavedOk] = useState(false);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1 font-medium">Gestión de umbrales, alertas y parámetros globales.</p>
      </header>

      {/* Monitor threshold */}
      <div className="cd-panel p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-blue-50 text-[#2980b9] rounded-2xl">
            <Bell size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Monitoreo de Estado</h3>
            <p className="text-xs text-slate-500 font-medium">Define cuándo un monitor se considera fuera de línea.</p>
          </div>
        </div>

        <div className="max-w-md bg-slate-50/50 p-6 rounded-2xl border border-slate-50">
          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1 block mb-2">
            Tiempo de Inactividad (Minutos)
          </label>
          <div className="relative">
            <Radio size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="number"
              min={1}
              value={thresholds.monitorOfflineMinutes}
              onChange={e => setThresholds({ monitorOfflineMinutes: Number(e.target.value) })}
              className="cd-input w-full !pl-12 !bg-white border-transparent focus:!border-[#2980b9]"
              placeholder="Ej: 10"
            />
          </div>
          <div className="mt-4 flex items-start gap-2 px-1">
            <Shield size={12} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              Si el sistema no recibe un "heartbeat" del monitor durante este intervalo, 
              se disparará automáticamente el estado <span className="text-rose-500 font-bold uppercase tracking-tighter">Offline</span>.
            </p>
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="cd-panel p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-[#2980b9] rounded-2xl">
              <Mail size={24} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#1a2333]">Notificaciones por Correo</h3>
              <p className="text-xs text-slate-500 font-medium">Configuración técnica del servidor de salida (SMTP).</p>
            </div>
          </div>
          <span className="bg-slate-100 text-slate-400 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest">
            Referencia Técnica
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { label: 'Servidor SMTP', key: 'host', placeholder: 'smtp.ejemplo.com', icon: SettingsIcon },
            { label: 'Puerto',        key: 'port', placeholder: '587', icon: SettingsIcon },
            { label: 'Usuario',       key: 'user', placeholder: 'notif@empresa.com', icon: Mail },
            { label: 'Contraseña',    key: 'pass', placeholder: '••••••••', type: 'password', icon: Shield },
            { label: 'Remitente',     key: 'from', placeholder: 'STC Cloud <noreply@cd.com>', icon: User },
          ].map(({ label, key, placeholder, type, icon: Icon }) => (
            <div key={key} className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">{label}</label>
              <div className="relative">
                {Icon && <Icon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />}
                <input
                  type={type || 'text'}
                  value={(smtp as any)[key]}
                  onChange={e => setSmtp(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="cd-input w-full !pl-10 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex items-start gap-4 shadow-sm">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <Shield size={18} className="text-[#2980b9]" />
          </div>
          <div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              <strong className="text-slate-700">Nota de seguridad:</strong> Las credenciales SMTP reales se gestionan exclusivamente 
              a través del archivo <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[#2980b9] font-mono font-bold">.env</code> del servidor. 
              Este formulario es una herramienta de visualización para administradores.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 pt-4">
        <button
          onClick={save}
          className="flex items-center gap-3 bg-[#2980b9] hover:bg-[#2471a3] text-white px-10 py-5 rounded-[24px] text-sm font-extrabold shadow-xl shadow-blue-900/10 transition-all active:scale-95 group"
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

