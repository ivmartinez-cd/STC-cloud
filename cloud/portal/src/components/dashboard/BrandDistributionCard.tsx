import { Activity, PieChart as PieChartIcon } from 'lucide-react';
import { Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import type { DashboardData } from '../../types/monitor';
import ScrollFade from './ScrollFade';

// Paleta institucional (Manual de marca Canal Directo): naranja + gris MPS.
// Nunca colores de otras líneas de servicio (violeta DaaS, magenta Digitalización, celeste Signage).
const BRAND_COLORS = ['#f7941d', '#58595b', '#1abc9c', '#f1c40f', '#232323', '#e74c3c'];

export default function BrandDistributionCard({ brands }: { brands: DashboardData['brands'] | undefined }) {
  return (
    <div className="cd-panel p-4 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 mb-2">
        <h3 className="text-xs font-black text-[#1a2333] tracking-tight flex items-center gap-2">
          <PieChartIcon size={14} className="text-brand" /> Distribución de Marcas
        </h3>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Composición del parque activo</p>
      </div>
      {brands?.length === 0 ? (
        <div className="flex-1 flex items-center justify-center opacity-20"><Activity size={32} /></div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-row items-stretch gap-3">
          <div className="w-16 h-16 shrink-0 self-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={brands} cx="50%" cy="50%" innerRadius={18} outerRadius={30} paddingAngle={4} dataKey="count" nameKey="brand">
                  {brands?.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '8px', fontSize: '11px' }} itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="relative flex-1 min-h-0 h-full">
            <div className="h-full overflow-y-auto dash-scrollbar space-y-1.5 pr-1">
              {brands?.map((b, i) => (
                <div key={b.brand} className="flex items-center justify-between gap-2 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                    <span className="text-[10px] font-black text-[#1a2333] uppercase truncate group-hover:text-brand-hover transition-colors cursor-default">{b.brand}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 shrink-0">{b.count}</span>
                </div>
              ))}
            </div>
            <ScrollFade />
          </div>
        </div>
      )}
    </div>
  );
}
