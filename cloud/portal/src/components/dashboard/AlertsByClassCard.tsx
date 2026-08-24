import { Link } from 'react-router-dom';
import type { DashboardData } from '../../types/monitor';
import SdsPanel from './SdsPanel';

// Mismo criterio de color por familia que `Alerts.tsx` (Fase 2): rojo = ya
// pasó algo, ámbar = por pasar, slate = informativo, azul = disponibilidad.
const CLASS_DOT: Record<string, string> = {
  consumable_out: 'bg-rose-500', system_failure: 'bg-rose-500',
  jam: 'bg-rose-500', subunit_out: 'bg-rose-500', media_out: 'bg-rose-500',
  consumable_low: 'bg-amber-500', system_warning: 'bg-amber-500',
  user_action: 'bg-amber-500', subunit_low: 'bg-amber-500', media_low: 'bg-amber-500',
  information: 'bg-slate-400', system_change: 'bg-slate-400', other: 'bg-slate-400',
  availability: 'bg-blue-500',
};

/** "Resumen de alertas actuales por clase de alerta" del SDS: tabla
 * horizontal, una columna por clase + Total. Cada número es un deep-link a
 * `/alerts` ya filtrado por esa clase. */
export default function AlertsByClassCard({ alertsByClass }: { alertsByClass: DashboardData['alertsByClass'] | undefined }) {
  const rows = alertsByClass ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <SdsPanel title="Resumen de alertas actuales por clase de alerta" to="/alerts?resolved=false">
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-[10px] font-bold text-emerald-600">✔ Sin alertas activas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="w-12" />
                {rows.map((r) => (
                  <th key={r.alert_class} className="px-1.5 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-center leading-tight align-top min-w-[64px]">
                    <span className={`block w-1.5 h-1.5 rounded-full mx-auto mb-0.5 ${CLASS_DOT[r.alert_class] ?? 'bg-slate-300'}`} />
                    {r.label}
                  </th>
                ))}
                <th className="px-2 py-1 text-[9px] font-black text-slate-700 uppercase tracking-wider text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Total</td>
                {rows.map((r) => (
                  <td key={r.alert_class} className="px-2 py-1.5 text-center">
                    <Link to={`/alerts?class=${r.alert_class}&resolved=false`} className="text-[13px] font-black text-[#1a2333] tabular-nums hover:underline">
                      {r.count.toLocaleString('es-AR')}
                    </Link>
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center text-[13px] font-black text-brand tabular-nums">{total.toLocaleString('es-AR')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </SdsPanel>
  );
}
