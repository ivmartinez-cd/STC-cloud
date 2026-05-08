import { useState } from 'react';
import { Radio, Save, Mail, Shield, CheckCircle } from 'lucide-react';

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

const inputCls = 'cd-input w-full';

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
    setTimeout(() => setSavedOk(false), 2000);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-[#1a2333]">Configuración</h1>
        <p className="text-slate-500 text-sm mt-0.5">Umbrales de alertas y notificaciones del sistema.</p>
      </header>

      {/* Monitor threshold */}
      <div className="cd-panel rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Radio size={15} className="text-[#2980b9]" />
          <h3 className="font-semibold text-[#1a2333] text-sm">Umbrales de Monitor</h3>
        </div>
        <p className="text-xs text-slate-500 mb-5">Tiempo sin heartbeat para marcar un monitor como offline.</p>

        <div className="max-w-xs">
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">Monitor sin conexión (min)</label>
          <input
            type="number"
            min={1}
            value={thresholds.monitorOfflineMinutes}
            onChange={e => setThresholds({ monitorOfflineMinutes: Number(e.target.value) })}
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Si no hay heartbeat en este tiempo, el monitor se considera offline.
          </p>
        </div>
      </div>

      {/* SMTP */}
      <div className="cd-panel rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={15} className="text-[#2980b9]" />
          <h3 className="font-semibold text-[#1a2333] text-sm">Configuración SMTP</h3>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Para alertas por email. Configurar en el archivo{' '}
          <code className="text-slate-600 bg-slate-100 px-1 rounded text-[11px] font-mono">.env</code>{' '}
          del servidor.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Servidor SMTP', key: 'host', placeholder: 'smtp.ejemplo.com' },
            { label: 'Puerto',        key: 'port', placeholder: '587' },
            { label: 'Usuario',       key: 'user', placeholder: 'notif@empresa.com' },
            { label: 'Contraseña',    key: 'pass', placeholder: '••••••••', type: 'password' },
            { label: 'Remitente',     key: 'from', placeholder: '"STC Cloud" <noreply@empresa.com>' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">{label}</label>
              <input
                type={type || 'text'}
                value={(smtp as any)[key]}
                onChange={e => setSmtp(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                className={inputCls}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-[#2980b9]/20 rounded-lg flex items-start gap-2">
          <Shield size={13} className="text-[#2980b9] mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500">
            Las credenciales SMTP deben configurarse en el{' '}
            <code className="text-slate-600 font-mono text-[11px]">.env</code> del servidor
            como <code className="text-slate-600 font-mono text-[11px]">SMTP_HOST</code>,{' '}
            <code className="text-slate-600 font-mono text-[11px]">SMTP_USER</code>, etc.
            Este formulario es solo de referencia.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          className="flex items-center gap-2 bg-[#f39c12] hover:bg-[#e67e22] text-white px-5 py-2 rounded text-sm font-medium transition-colors"
        >
          <Save size={14} />
          Guardar umbrales
        </button>
        {savedOk && (
          <span className="text-sm text-[#689f38] flex items-center gap-1.5">
            <CheckCircle size={14} /> Configuración guardada
          </span>
        )}
      </div>
    </div>
  );
};

export default Settings;
