import { Link } from 'react-router-dom';
import { Building2, ChevronRight, ArrowUpRight } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';
import ScrollFade from './ScrollFade';

export default function TopClientsCard({ topClients }: { topClients: DashboardData['topClients'] | undefined }) {
  return (
    <div className="cd-panel p-4 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div>
          <h3 className="text-xs font-black text-[#1a2333] tracking-tight flex items-center gap-2">
            <Building2 size={14} className="text-brand-gray" /> Top Cuentas
          </h3>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Mayores flotas administradas</p>
        </div>
        <Link to="/clients" className="p-1.5 hover:bg-slate-50 rounded-lg transition-all shrink-0">
          <ChevronRight size={14} className="text-slate-400" />
        </Link>
      </div>
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto dash-scrollbar space-y-1.5 pr-1">
          {topClients?.map((c, i) => (
            <Link to={`/clients/${c.id}`} key={c.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
              <div className="w-7 h-7 shrink-0 rounded-lg bg-white border border-slate-100 shadow-sm flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:border-brand-gray/40 group-hover:text-brand-gray transition-all">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black text-[#1a2333] truncate uppercase tracking-tight group-hover:text-brand-gray transition-colors">{c.name}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{c.device_count} Dispositivos</div>
              </div>
              <ArrowUpRight size={13} className="text-slate-200 group-hover:text-brand-gray transition-all shrink-0" />
            </Link>
          ))}
        </div>
        <ScrollFade />
      </div>
    </div>
  );
}
