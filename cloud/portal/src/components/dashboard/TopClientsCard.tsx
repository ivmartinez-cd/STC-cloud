import { Link } from 'react-router-dom';
import type { DashboardData } from '../../types/monitor';
import SdsPanel from './SdsPanel';

/** "Top cuentas": tabla cliente → dispositivos, cada fila enlaza al detalle. */
export default function TopClientsCard({ topClients }: { topClients: DashboardData['topClients'] | undefined }) {
  const rows = topClients ?? [];
  return (
    <SdsPanel title="Top cuentas" to="/clients">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-left">Cliente</th>
            <th className="w-16 px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Equipos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 && (
            <tr><td colSpan={2} className="px-3 py-2 text-[10px] font-semibold text-slate-400">Sin clientes.</td></tr>
          )}
          {rows.map((c, i) => (
            <tr key={c.id} className="hover:bg-slate-50/70">
              <td className="px-3 py-1 text-[10px] font-black text-[#1a2333] uppercase min-w-0">
                <span className="block truncate" title={c.name}>
                  <span className="text-slate-400 mr-1.5 tabular-nums">{i + 1}.</span>
                  <Link to={`/clients/${c.id}`} className="hover:text-brand hover:underline">{c.name}</Link>
                </span>
              </td>
              <td className="px-3 py-1 text-[11px] font-black text-[#1a2333] text-right tabular-nums">{c.device_count.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SdsPanel>
  );
}
