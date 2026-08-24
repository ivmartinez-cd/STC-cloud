import { Activity, ShieldAlert, WifiOff } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';

export default function OfflineAgentsCard({ offlineAgents, now }: { offlineAgents: DashboardData['offlineAgents'] | undefined; now: number }) {
  return (
    <div className="cd-panel p-4 h-full flex flex-col border-rose-500/10">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div>
          <h3 className="text-xs font-black text-rose-600 tracking-tight flex items-center gap-2">
            <ShieldAlert size={14} /> Nodos Offline
          </h3>
          <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mt-0.5">Atención inmediata requerida</p>
        </div>
        {(offlineAgents?.length ?? 0) > 0 && (
          <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full shadow-lg shadow-rose-900/20 shrink-0">
            {offlineAgents?.length}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
        {offlineAgents?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-emerald-500/50 bg-emerald-50/50 rounded-2xl border border-emerald-100 border-dashed">
            <Activity size={24} className="mb-2 animate-pulse" />
            <p className="text-[9px] font-black uppercase tracking-widest">Todos los sistemas operativos</p>
          </div>
        ) : (
          offlineAgents?.map((a) => (
            <div key={a.id} className="flex flex-col p-2.5 rounded-xl bg-rose-50/50 border border-rose-100/50 hover:bg-rose-50 hover:border-rose-200 transition-all">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-[#1a2333] uppercase tracking-tight truncate flex-1">{a.client_name}</span>
                <WifiOff size={12} className="text-rose-500 shrink-0" />
              </div>
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate">{a.name}</span>
                <span className="text-[9px] font-black text-rose-600/60 uppercase shrink-0">
                  {Math.round((now - new Date(a.last_seen).getTime()) / 60000)}m
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
