import { BarChart2, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ErrorBoundary from '../ErrorBoundary';
import type { UsageMonth } from '../../types/monitor';

interface Props {
  usage: UsageMonth[];
}

const ChartContent = ({ usage }: Props) => (
  <div className="cd-panel p-8 flex flex-col justify-between">
    <div>
      <h3 className="text-sm font-extrabold text-[#1a2333] uppercase tracking-widest flex items-center gap-3 mb-6">
        <TrendingUp size={16} className="text-brand" /> Consumo Mensual
      </h3>
      {usage.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-3">
          <BarChart2 size={32} className="text-slate-100" />
          <p className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest">Sin historial de uso</p>
        </div>
      ) : (
        <div className="h-[140px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={usage} barSize={12} barGap={4}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: '#fff', border: 'none', borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: '800'
                }}
              />
              <Bar dataKey="mono" name="Mono" fill="#2980b9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="color" name="Color" fill="#f39c12" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Tendencia</span>
      <TrendingUp size={14} className="text-emerald-500" />
    </div>
  </div>
);

const ClientUsageChart = ({ usage }: Props) => (
  <ErrorBoundary>
    <ChartContent usage={usage} />
  </ErrorBoundary>
);

export default ClientUsageChart;
