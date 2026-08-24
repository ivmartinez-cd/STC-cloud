import { Link } from 'react-router-dom';
import { LayoutList, ShieldCheck } from 'lucide-react';
import type { DashboardData } from '../../types/monitor';
import ScrollFade from './ScrollFade';

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

export default function AlertsByClassCard({ alertsByClass }: { alertsByClass: DashboardData['alertsByClass'] | undefined }) {
  return (
    <div className="cd-panel p-4 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 mb-2">
        <h3 className="text-xs font-black text-[#1a2333] tracking-tight flex items-center gap-2">
          <LayoutList size={14} className="text-brand" /> Resumen de Alertas por Clase
        </h3>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Alertas activas, agrupadas por categoría</p>
      </div>
      {!alertsByClass || alertsByClass.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-2xl border border-emerald-100 border-dashed">
          <ShieldCheck size={24} className="mb-1.5 text-emerald-500" />
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Sin alertas activas</p>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto dash-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 content-start pr-1.5">
            {alertsByClass.map((c) => (
              <Link
                key={c.alert_class}
                to={`/alerts?class=${c.alert_class}&resolved=false`}
                className="flex items-center gap-1.5 py-1 border-b border-slate-50 hover:bg-slate-50/60 transition-all group -mx-1 px-1 rounded"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[c.alert_class] ?? 'bg-slate-300'}`} />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight truncate flex-1 group-hover:text-[#1a2333]">{c.label}</span>
                <span className="text-[10px] font-black text-slate-800 shrink-0">{c.count}</span>
              </Link>
            ))}
          </div>
          <ScrollFade />
        </div>
      )}
    </div>
  );
}
