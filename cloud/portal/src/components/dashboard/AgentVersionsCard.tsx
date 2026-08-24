import { GitBranch } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';

export default function AgentVersionsCard({
  agentVersions,
  currentAgentVersion,
}: {
  agentVersions: DashboardData['agentVersions'] | undefined;
  currentAgentVersion: DashboardData['currentAgentVersion'] | undefined;
}) {
  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
            <GitBranch size={20} className="text-brand-gray" /> Versiones de Agente
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Distribución en la flota</p>
        </div>
      </div>
      {!agentVersions || agentVersions.length === 0 ? (
        <p className="text-[11px] font-semibold text-slate-400">Sin agentes reportados todavía.</p>
      ) : (
        <div className="space-y-3">
          {agentVersions.map((v) => {
            const isCurrent = v.version === currentAgentVersion;
            return (
              <div key={v.version} className="flex items-center justify-between">
                <span className={`text-[11px] font-black uppercase tracking-tight ${isCurrent ? 'text-slate-600' : 'text-amber-600'}`}>
                  {v.version}
                  {!isCurrent && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] normal-case tracking-normal">desactualizado</span>}
                </span>
                <span className="text-[11px] font-black text-slate-400">{v.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
