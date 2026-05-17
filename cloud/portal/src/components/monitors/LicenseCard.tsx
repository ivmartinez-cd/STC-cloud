import { Link } from 'react-router-dom';
import { Shield, HardDrive, Key, Check, Copy } from 'lucide-react';
import type { MonitorData } from '../../types/monitor';

interface Props {
  monitor: MonitorData;
  keyCopied: boolean;
  onCopyKey: () => void;
}

const LicenseCard = ({ monitor, keyCopied, onCopyKey }: Props) => (
  <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 bg-white h-full relative">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
    <div className="cd-header-blue flex items-center gap-3 px-6 py-5 text-white">
      <Shield size={18} className="text-amber-400" />
      <span className="font-black uppercase tracking-widest text-sm text-white">Detalles de la Licencia</span>
    </div>
    <div className="p-6 space-y-6">
      <div>
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Organización Vinculada</label>
        <Link
          to={`/clients/${monitor.client_id}`}
          className="block p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl group hover:shadow-lg hover:shadow-blue-900/10 transition-all hover:-translate-y-0.5 relative overflow-hidden"
        >
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-brand font-black text-lg border border-blue-100/50 group-hover:scale-105 transition-transform">
              {monitor.client_name?.charAt(0)}
            </div>
            <div>
              <p className="text-xs font-black text-brand uppercase tracking-tight">{monitor.client_name}</p>
              <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">
                Ver Perfil &rarr;
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <HardDrive size={12} /> Hardware Identifier
        </label>
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="font-mono text-[10px] font-bold text-slate-700 break-all">
            {monitor.hardware_id || 'SIN VINCULAR'}
          </span>
        </div>
      </div>

      {monitor.activation_key ? (
        <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-3xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <Key size={14} />
              <p className="text-[9px] font-black uppercase tracking-widest">Clave de Activación</p>
            </div>
            <button
              onClick={onCopyKey}
              className="p-1.5 bg-white text-emerald-600 rounded-lg shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
            >
              {keyCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="font-mono text-xs font-bold text-emerald-900 break-all bg-white/50 p-2 rounded-xl">
            {monitor.activation_key}
          </p>
        </div>
      ) : (
        <div className="p-5 bg-blue-50 border border-blue-100 rounded-3xl flex items-center gap-3">
          <div className="p-2 bg-white rounded-xl shadow-sm text-brand"><Check size={16} /></div>
          <div>
            <p className="text-[9px] font-black text-brand uppercase tracking-widest">Enlace Cifrado</p>
            <p className="text-[10px] font-bold text-blue-900 uppercase">Telemetría Activa</p>
          </div>
        </div>
      )}
    </div>
  </div>
);

export default LicenseCard;
