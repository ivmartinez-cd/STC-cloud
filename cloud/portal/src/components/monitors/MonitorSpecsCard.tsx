import { Terminal as TerminalIcon } from 'lucide-react';
import { formatRelativeTime } from '../../lib/formatters';
import type { MonitorData } from '../../types/monitor';

interface Props {
  monitor: MonitorData;
  now: number;
}

const MonitorSpecsCard = ({ monitor, now }: Props) => (
  <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 relative bg-white h-full">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand via-blue-400 to-indigo-500" />
    <div className="cd-header-blue flex items-center gap-3 px-6 py-5 text-white">
      <TerminalIcon size={18} className="text-blue-300" />
      <span className="font-black uppercase tracking-widest text-sm text-white">Estado del Monitor</span>
    </div>
    <div className="p-6">
      <div className="bg-slate-50/80 rounded-3xl p-1 border border-slate-100/50">
        <ul className="divide-y divide-slate-100/50">
          {([
            ['Aplicación Remota', 'STC Cloud Agent'],
            ['Versión', monitor.version || '---'],
          ] as const).map(([label, value]) => (
            <li key={label} className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
              <span className="text-[11px] font-black text-[#1a2333] px-2 py-0.5 bg-slate-100 rounded-md font-mono border border-slate-200">{value}</span>
            </li>
          ))}
          <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Estado</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${monitor.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-black text-[#1a2333] uppercase">{monitor.status}</span>
            </div>
          </li>
          <li className="flex flex-col gap-1 px-4 py-3.5 hover:bg-white rounded-2xl transition-all">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Nombre del Host</span>
            <span className="text-[11px] font-black text-[#1a2333] tracking-tight">{monitor.host_name || '---'}</span>
          </li>
          <li className="flex flex-col gap-1 px-4 py-3.5 hover:bg-white rounded-2xl transition-all">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sistema Operativo</span>
            <span className="text-[11px] font-black text-[#1a2333]">{monitor.host_os || '---'}</span>
          </li>
          <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dirección IP</span>
            <span className="text-[11px] font-black text-blue-600 font-mono tracking-tighter">{monitor.host_ip || '---'}</span>
          </li>
          <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Último Contacto</span>
            <span className="text-[11px] font-bold text-slate-500">{formatRelativeTime(monitor.last_seen, now)}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default MonitorSpecsCard;
