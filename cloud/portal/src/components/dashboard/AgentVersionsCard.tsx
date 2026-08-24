import { GitBranch } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';
import ScrollFade from './ScrollFade';

export default function AgentVersionsCard({
  agentVersions,
  currentAgentVersion,
}: {
  agentVersions: DashboardData['agentVersions'] | undefined;
  currentAgentVersion: DashboardData['currentAgentVersion'] | undefined;
}) {
  return (
    <div className="cd-panel p-4 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 mb-2">
        <h3 className="text-xs font-black text-[#1a2333] tracking-tight flex items-center gap-2">
          <GitBranch size={14} className="text-brand-gray" /> Versiones de Agente
        </h3>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Distribución en la flota</p>
      </div>
      {!agentVersions || agentVersions.length === 0 ? (
        <p className="text-[10px] font-semibold text-slate-400">Sin agentes reportados todavía.</p>
      ) : (
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto dash-scrollbar space-y-1.5 pr-1">
            {agentVersions.map((v) => {
              const isCurrent = v.version === currentAgentVersion;
              return (
                <div key={v.version} className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-tight truncate ${isCurrent ? 'text-slate-600' : 'text-amber-600'}`}>
                    {v.version}
                    {!isCurrent && <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] normal-case tracking-normal">desactualizado</span>}
                  </span>
                  <span className="text-[10px] font-black text-slate-400 shrink-0">{v.count}</span>
                </div>
              );
            })}
          </div>
          <ScrollFade />
        </div>
      )}
    </div>
  );
}
