import type { DashboardData } from '../../types/monitor';
import SdsPanel from './SdsPanel';

/** "Versiones del monitor" del SDS: tabla versión → cantidad, Total al pie y
 * la última versión publicada como footer ("Última publicación del DCA"). */
export default function AgentVersionsCard({
  agentVersions, currentAgentVersion,
}: {
  agentVersions: DashboardData['agentVersions'] | undefined;
  currentAgentVersion: DashboardData['currentAgentVersion'] | undefined;
}) {
  const rows = agentVersions ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <SdsPanel
      title="Versiones del monitor"
      to="/agents"
      footer={currentAgentVersion ? `Publicada: v${currentAgentVersion}` : undefined}
    >
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-left">Versión</th>
            <th className="w-20 px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Monitores</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 && (
            <tr><td colSpan={2} className="px-3 py-2 text-[10px] font-semibold text-slate-400">Sin agentes reportados todavía.</td></tr>
          )}
          {rows.map((v) => {
            const outdated = !!currentAgentVersion && v.version !== currentAgentVersion;
            return (
              <tr key={v.version}>
                <td className={`px-3 py-1 text-[10px] font-black uppercase min-w-0 ${outdated ? 'text-amber-600' : 'text-[#1a2333]'}`}>
                  <span className="block truncate" title={v.version}>
                    {v.version}
                    {outdated && <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] normal-case">desact.</span>}
                  </span>
                </td>
                <td className="px-3 py-1 text-[11px] font-black text-[#1a2333] text-right tabular-nums">{v.count.toLocaleString('es-AR')}</td>
              </tr>
            );
          })}
          <tr className="bg-slate-50 border-t border-slate-100">
            <td className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-widest">Total</td>
            <td className="px-3 py-1 text-[11px] font-black text-brand text-right tabular-nums">{total.toLocaleString('es-AR')}</td>
          </tr>
        </tbody>
      </table>
    </SdsPanel>
  );
}
