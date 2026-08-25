import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import MiniBar from './MiniBar';
import { pctOf } from '../../../shared/lib/formatters';

/** "Presencia de monitores" del SDS: en línea / sin conexión con barra de
 * proporción. Reemplaza la lista de "Nodos Offline" — el listado vive en
 * `/agents`, acá sólo el conteo. */
export default function MonitorPresenceCard({ agents }: { agents: DashboardData['stats']['agents'] | undefined }) {
  const total = agents?.total ?? 0;
  const online = agents?.online ?? 0;
  const offline = Math.max(0, total - online);
  const rows = [
    { label: 'En línea', value: online, dot: 'bg-emerald-500', tone: 'emerald' as const },
    { label: 'Sin conexión', value: offline, dot: 'bg-slate-400', tone: offline > 0 ? ('rose' as const) : ('slate' as const) },
  ];
  return (
    <SdsPanel title="Presencia de monitores" to="/agents">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-left">Presencia</th>
            <th className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Monitores</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="px-3 py-1.5 text-[10px] font-black text-[#1a2333] uppercase whitespace-nowrap">
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${r.dot}`} />{r.label}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                <Link to="/agents" className="text-[11px] font-black text-[#1a2333] tabular-nums mr-1.5 hover:underline">{r.value.toLocaleString('es-AR')}</Link>
                <MiniBar pct={pctOf(r.value, total)} tone={r.tone} />
              </td>
            </tr>
          ))}
          <tr className="bg-slate-50 border-t border-slate-100">
            <td className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-widest">Total</td>
            <td className="px-3 py-1 text-[11px] font-black text-brand text-right tabular-nums">{total.toLocaleString('es-AR')}</td>
          </tr>
        </tbody>
      </table>
    </SdsPanel>
  );
}
