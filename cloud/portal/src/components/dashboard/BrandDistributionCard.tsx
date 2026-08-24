import { Activity, PieChart as PieChartIcon } from 'lucide-react';
import { Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import type { DashboardData } from '../../types/monitor';

// Paleta institucional (Manual de marca Canal Directo): naranja + gris MPS.
// Nunca colores de otras líneas de servicio (violeta DaaS, magenta Digitalización, celeste Signage).
const BRAND_COLORS = ['#f7941d', '#58595b', '#1abc9c', '#f1c40f', '#232323', '#e74c3c'];

export default function BrandDistributionCard({ brands }: { brands: DashboardData['brands'] | undefined }) {
  return (
    <div className="cd-panel p-8 flex flex-col space-y-10">
      <div>
        <h3 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-3">
          <PieChartIcon size={20} className="text-brand" /> Distribución de Marcas
        </h3>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Composición del parque activo</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center min-h-[250px]">
        {brands?.length === 0 ? (
          <div className="text-center py-10 opacity-20"><Activity size={48} className="mx-auto" /></div>
        ) : (
          <div className="w-full flex flex-col md:flex-row items-center gap-8">
            <div className="w-48 h-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={brands} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="count" nameKey="brand">
                    {brands?.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3 w-full">
              {brands?.map((b, i) => (
                <div key={b.brand} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                    <span className="text-[11px] font-black text-[#1a2333] uppercase group-hover:text-brand-hover transition-colors cursor-default">{b.brand}</span>
                  </div>
                  <span className="text-[11px] font-black text-slate-400">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
