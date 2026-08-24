import { Link } from 'react-router-dom';
import { Building2, ChevronRight, ArrowUpRight } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';

export default function TopClientsCard({ topClients }: { topClients: DashboardData['topClients'] | undefined }) {
  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
            <Building2 size={20} className="text-brand-gray" /> Top Cuentas
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mayores flotas administradas</p>
        </div>
        <Link to="/clients" className="p-2 hover:bg-slate-50 rounded-xl transition-all">
          <ChevronRight size={18} className="text-slate-400" />
        </Link>
      </div>
      <div className="space-y-4">
        {topClients?.map((c, i) => (
          <Link to={`/clients/${c.id}`} key={c.id} className="flex items-center gap-4 p-4 rounded-3xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
            <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-xs font-black text-slate-400 group-hover:border-brand-gray/40 group-hover:text-brand-gray transition-all">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-[#1a2333] truncate uppercase tracking-tight group-hover:text-brand-gray transition-colors">{c.name}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{c.device_count} Dispositivos</div>
            </div>
            <ArrowUpRight size={16} className="text-slate-200 group-hover:text-brand-gray transition-all" />
          </Link>
        ))}
      </div>
    </div>
  );
}
