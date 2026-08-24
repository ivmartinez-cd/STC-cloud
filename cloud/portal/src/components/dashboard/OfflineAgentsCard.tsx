import { Activity, ShieldAlert, WifiOff } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';

export default function OfflineAgentsCard({ offlineAgents, now }: { offlineAgents: DashboardData['offlineAgents'] | undefined; now: number }) {
  return (
    <div className="cd-panel p-8 border-rose-500/10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-lg font-black text-rose-600 tracking-tight flex items-center gap-3">
            <ShieldAlert size={20} /> Nodos Offline
          </h3>
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Atención inmediata requerida</p>
        </div>
        {(offlineAgents?.length ?? 0) > 0 && (
          <span className="px-3 py-1 bg-rose-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-rose-900/20">
            {offlineAgents?.length}
          </span>
        )}
      </div>
      <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
        {offlineAgents?.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-emerald-500/50 bg-emerald-50/50 rounded-3xl border border-emerald-100 border-dashed">
            <Activity size={32} className="mb-3 animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-widest">Todos los sistemas operativos</p>
          </div>
        ) : (
          offlineAgents?.map((a) => (
            <div key={a.id} className="flex flex-col p-4 rounded-3xl bg-rose-50/50 border border-rose-100/50 hover:bg-rose-50 hover:border-rose-200 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-[#1a2333] uppercase tracking-tight truncate flex-1">{a.client_name}</span>
                <WifiOff size={14} className="text-rose-500" />
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{a.name}</span>
                <span className="text-[9px] font-black text-rose-600/60 uppercase">
                  Visto hace {Math.round((now - new Date(a.last_seen).getTime()) / 60000)}m
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
