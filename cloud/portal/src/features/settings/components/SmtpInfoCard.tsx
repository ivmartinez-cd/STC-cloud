import { Mail, Shield, Settings as SettingsIcon, User } from 'lucide-react';

export interface SmtpFields {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
}

const FIELDS: { label: string; key: keyof SmtpFields; type?: string; icon: typeof Mail }[] = [
  { label: 'Servidor SMTP', key: 'host', icon: SettingsIcon },
  { label: 'Puerto', key: 'port', icon: SettingsIcon },
  { label: 'Usuario', key: 'user', icon: Mail },
  { label: 'Contraseña', key: 'pass', type: 'password', icon: Shield },
  { label: 'Remitente', key: 'from', icon: User },
];

export default function SmtpInfoCard({ smtp, onChange }: { smtp: SmtpFields; onChange: (updater: (p: SmtpFields) => SmtpFields) => void }) {
  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 text-brand rounded-2xl">
            <Mail size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Notificaciones por Correo</h3>
            <p className="text-xs text-slate-500 font-medium">Configuración técnica del servidor de salida (SMTP).</p>
          </div>
        </div>
        <span className="bg-slate-100 text-slate-500 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest">
          Referencia Técnica
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {FIELDS.map(({ label, key, type, icon: Icon }) => (
          <div key={key} className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">{label}</label>
            <div className="relative">
              {Icon && <Icon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />}
              <input
                type={type || 'text'}
                value={smtp[key]}
                onChange={e => onChange(p => ({ ...p, [key]: e.target.value }))}
                placeholder=""
                className="cd-input w-full !pl-10 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
                disabled
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex items-start gap-4 shadow-sm">
        <div className="p-2 bg-white rounded-lg shadow-sm">
          <Shield size={18} className="text-brand" />
        </div>
        <div>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            <strong className="text-slate-700">Nota de seguridad:</strong> Las credenciales SMTP reales se gestionan exclusivamente
            a través del archivo <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-brand font-mono font-bold">.env</code> del servidor.
            Este formulario es una herramienta de visualización para administradores.
          </p>
        </div>
      </div>
    </div>
  );
}
