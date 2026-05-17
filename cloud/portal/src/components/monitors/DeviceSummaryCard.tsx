import { Printer } from 'lucide-react';
import { OFFLINE_THRESHOLD_MS } from '../../lib/constants';
import type { MonitorData, Device } from '../../types/monitor';

interface Props {
  devices: Device[];
  monitor: MonitorData;
}

const DeviceSummaryCard = ({ devices, monitor }: Props) => {
  const agentOnline = monitor.status === 'active'
    && monitor.last_seen !== null
    && (Date.now() - new Date(monitor.last_seen).getTime() <= OFFLINE_THRESHOLD_MS);

  const ringColor = agentOnline ? '#10b981' : '#f59e0b';

  return (
    <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 relative bg-white h-full">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
      <div className="cd-header-blue flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3 text-white">
          <Printer size={18} className="text-emerald-400" />
          <span className="font-black uppercase tracking-widest text-sm text-white">Dispositivos</span>
        </div>
        <span className="text-[10px] font-bold text-white border border-white/30 bg-white/10 px-2 py-1 rounded-md shadow-sm">
          {devices.length} Total
        </span>
      </div>
      <div className="p-6 space-y-6">
        <ul className="space-y-3">
          <li className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-widest">Activos</span>
            <span className="font-black text-emerald-600 text-sm">{agentOnline ? devices.length : 0}</span>
          </li>
          <li className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-widest">Offline / No Gestionados</span>
            <span className="font-black text-amber-500 text-sm">{agentOnline ? 0 : devices.length}</span>
          </li>
          <li className="flex justify-between items-center text-xs pt-3 border-t border-slate-100">
            <span className="font-black text-[#1a2333] uppercase tracking-widest">Total</span>
            <span className="font-black text-brand text-lg">{devices.length}</span>
          </li>
        </ul>
        <div className="flex justify-center py-4">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke={ringColor} strokeWidth="12"
                strokeDasharray="251.2"
                strokeDashoffset={devices.length === 0 ? '251.2' : '0'}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-[#1a2333]">{devices.length}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Equipos</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceSummaryCard;
