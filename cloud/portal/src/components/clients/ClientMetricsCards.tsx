import { HardDrive, Radio, BarChart2 } from 'lucide-react';

export default function ClientMetricsCards({
  deviceCount,
  monitorCount,
  onlineMonitors,
  totalPagesMonth,
}: {
  deviceCount: number;
  monitorCount: number;
  onlineMonitors: number;
  totalPagesMonth: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="cd-panel p-5 border-l-4 border-l-brand flex items-center gap-5">
        <div className="p-3 bg-brand/10 text-brand rounded-2xl"><HardDrive size={24} /></div>
        <div>
          <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{deviceCount}</div>
          <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Dispositivos</div>
        </div>
      </div>
      <div className="cd-panel p-5 border-l-4 border-l-emerald-500 flex items-center gap-5">
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Radio size={24} /></div>
        <div>
          <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{monitorCount}</div>
          <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
            Monitores — <span className="text-emerald-500">{onlineMonitors} activos</span>
          </div>
        </div>
      </div>
      <div className="cd-panel p-5 border-l-4 border-l-amber-500 flex items-center gap-5">
        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><BarChart2 size={24} /></div>
        <div>
          <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{totalPagesMonth.toLocaleString()}</div>
          <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Páginas este mes</div>
        </div>
      </div>
    </div>
  );
}
