import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import { fmtPct } from '../../../shared/lib/formatters';

// Paleta institucional (Manual de marca Canal Directo): naranja + gris MPS.
const BRAND_COLORS = ['#f7941d', '#58595b', '#1abc9c', '#f1c40f', '#232323', '#e74c3c'];

/** "Distribución de marcas": tabla marca → dispositivos → % del parque. */
export default function BrandDistributionCard({ brands }: { brands: DashboardData['brands'] | undefined }) {
  const rows = brands ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <SdsPanel title="Distribución de marcas">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-left">Marca</th>
            <th className="w-16 px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Equipos</th>
            <th className="w-14 px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-2 text-[10px] font-semibold text-slate-400">Sin dispositivos.</td></tr>
          )}
          {rows.map((b, i) => (
            <tr key={b.brand}>
              <td className="px-3 py-1 text-[10px] font-black text-[#1a2333] uppercase min-w-0">
                <span className="block truncate" title={b.brand}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                  {b.brand}
                </span>
              </td>
              <td className="px-3 py-1 text-[11px] font-black text-[#1a2333] text-right tabular-nums">{b.count.toLocaleString('es-AR')}</td>
              <td className="px-3 py-1 text-right text-[10px] font-bold text-slate-500 tabular-nums whitespace-nowrap">{fmtPct(b.count, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SdsPanel>
  );
}
