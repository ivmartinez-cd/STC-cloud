import { Link } from 'react-router-dom';
import { LayoutList, ShieldCheck } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';

// Mismo criterio de color por familia que `Alerts.tsx` (Fase 2): rojo = ya
// pasó algo, ámbar = por pasar, slate = informativo, azul = disponibilidad.
const CLASS_COLOR: Record<string, string> = {
  consumable_out: 'bg-rose-100 text-rose-700', system_failure: 'bg-rose-100 text-rose-700',
  jam: 'bg-rose-100 text-rose-700', subunit_out: 'bg-rose-100 text-rose-700', media_out: 'bg-rose-100 text-rose-700',
  consumable_low: 'bg-amber-100 text-amber-700', system_warning: 'bg-amber-100 text-amber-700',
  user_action: 'bg-amber-100 text-amber-700', subunit_low: 'bg-amber-100 text-amber-700', media_low: 'bg-amber-100 text-amber-700',
  information: 'bg-slate-100 text-slate-600', system_change: 'bg-slate-100 text-slate-600', other: 'bg-slate-100 text-slate-500',
  availability: 'bg-blue-100 text-blue-700',
};

export default function AlertsByClassCard({ alertsByClass }: { alertsByClass: DashboardData['alertsByClass'] | undefined }) {
  return (
    <div className="cd-panel p-8 lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
            <LayoutList size={20} className="text-brand" /> Resumen de Alertas por Clase
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Alertas activas, agrupadas por categoría</p>
        </div>
      </div>
      {!alertsByClass || alertsByClass.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
          <ShieldCheck size={32} className="mb-2 text-emerald-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Sin alertas activas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {alertsByClass.map((c) => (
            <Link
              key={c.alert_class}
              to={`/alerts?class=${c.alert_class}&resolved=false`}
              className="flex items-center justify-between px-4 py-2.5 rounded-2xl border border-slate-100 hover:border-brand/40 hover:bg-slate-50/50 transition-all group"
            >
              <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${CLASS_COLOR[c.alert_class] ?? 'bg-slate-100 text-slate-500'}`}>
                {c.label}
              </span>
              <span className="text-sm font-black text-[#1a2333] group-hover:text-brand transition-colors">{c.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
